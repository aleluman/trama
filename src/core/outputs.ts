import { isPlainRecord, isRecord, wrapError, type FieldDefinition } from "./fields.js";
import type { ContextTools } from "./definition.js";
import type { Values } from "./authoring.js";
import type { Address } from "./address.js";
import { readersOf, track } from "./invalidation.js";
import { toolsWith, type Context, type Read, type Reads } from "./reads.js";
import { viewsOf, type Source } from "./views.js";
import { copyOutput, equal, type DeepReadonly } from "./data.js";

declare const resultType: unique symbol;
declare const ownerType: unique symbol;
type OutputReference<T, Owner> = {
  readonly [resultType]: T;
  readonly [ownerType]: (owner: Owner) => Owner;
};
export type OutputReferences<O, Owner> = { [K in keyof O]: OutputReference<O[K], Owner> };
type OutputData<T> = T extends (...args: never[]) => unknown
  ? never
  : T extends PromiseLike<unknown> | Date | ReadonlyMap<unknown, unknown> | ReadonlySet<unknown>
    ? never
    : T extends object
      ? { [K in keyof T]: OutputData<T[K]> }
      : T extends string | number | boolean | bigint | symbol | null | undefined
        ? T
        : never;
// A formula receives the values, where every field read is a dependency, and
// read, which reads another output of the same definition; with a context C,
// also the context.
export type OutputTools<F extends Record<string, FieldDefinition>, C, Owner, K = {}> = {
  output<const T>(
    formula: (
      values: Values<F, K>,
      tools: {
        readonly read: <R>(reference: OutputReference<R, Owner>) => DeepReadonly<R>;
      } & ContextTools<C>,
    ) => T & OutputData<T>,
  ): OutputReference<T, Owner>;
};
type Formula = (
  values: Readonly<Record<string, unknown>>,
  tools: { readonly read: (reference: object) => unknown },
) => unknown;
type Output = { name: string; formula: Formula };
// The outputs that read each address, which the engine keeps across operations.
export type OutputReaders = Map<Address, Set<Output>>;
export type CompiledOutputs = {
  readonly owned: ReadonlyMap<object, Output>;
  readonly named: Readonly<Record<string, Output>>;
};

export const compileOutputs = <F extends Record<string, FieldDefinition>>(
  configure: undefined | ((tools: OutputTools<F, unknown, unknown>) => unknown),
): CompiledOutputs => {
  const owned = new Map<object, Output>();
  if (configure !== undefined && typeof configure !== "function")
    throw new Error("Form outputs must be a function");
  const handles =
    configure === undefined
      ? {}
      : configure({
          output: (formula) => {
            if (typeof formula !== "function") throw new Error("Output formula must be a function");
            const handle = Object.freeze({});
            owned.set(handle, { name: `#${owned.size + 1}`, formula: formula as Formula });
            return handle as never;
          },
        });
  if (!isPlainRecord(handles)) throw new Error("Outputs must return a named map");
  const named = Object.fromEntries(
    Object.entries(handles).map(([name, handle]) => {
      const output = isRecord(handle) ? owned.get(handle) : undefined;
      if (!output) throw new Error(`Output "${name}": invalid or foreign reference`);
      output.name = name;
      return [name, output];
    }),
  );
  return { owned, named };
};

type Result = { readonly value: unknown } | { readonly error: Error };
type Evaluation = {
  result: Result;
  fields: Reads;
  outputs: Map<Output, Result>;
};
export type OutputEvaluations = ReadonlyMap<Output, Evaluation>;
const readResult = (result: Result): unknown => {
  if ("error" in result) throw result.error;
  return result.value;
};
const failed = (output: Output, cause: unknown): Result => ({
  error: wrapError(`Output "${output.name}": calculation failed`, cause),
});

// With the addresses an operation changed, only the outputs that read one of
// them, or the result of an output calculated again, are calculated again;
// without them, every output is. An equal result still keeps the previous one,
// so its observers are not notified. The context is no dependency. read reads
// the committed values by address; the readers follow each calculation.
type Evaluating = {
  readonly previous: OutputEvaluations;
  readonly context: Context;
  readonly read: Read;
  readonly changed: ReadonlySet<Address> | undefined;
  readonly readers: OutputReaders;
};
export const evaluateOutputs = (
  { owned, named }: CompiledOutputs,
  sourceOf: () => Source,
  { previous, context, read, changed, readers }: Evaluating,
): OutputEvaluations => {
  const next = new Map<Output, Evaluation>();
  const resolving = new Set<Output>();
  const dirty = changed && dirtyOf(changed, readers);
  // Only an output calculated again reads the values through views.
  let source: Source | undefined;
  const resolve = (output: Output): Result => {
    const ready = next.get(output);
    if (ready) return ready.result;
    if (resolving.has(output)) return failed(output, new Error("Cyclic output dependency"));
    resolving.add(output);
    const before = previous.get(output);
    const evaluation =
      before !== undefined &&
      dirty !== undefined &&
      !dirty.has(output) &&
      sameOutputs(before, resolve)
        ? before
        : evaluateOutput(
            output,
            (source ??= sourceOf()),
            read,
            owned,
            resolve,
            before?.result,
            context,
          );
    if (evaluation !== before) track(readers, output, before?.fields, evaluation.fields);
    resolving.delete(output);
    next.set(output, evaluation);
    return evaluation.result;
  };
  for (const output of Object.values(named)) resolve(output);
  return next;
};

// Outputs have no rows.
const always = () => true;
const dirtyOf = (changed: ReadonlySet<Address>, readers: OutputReaders) => {
  const dirty = new Set<Output>();
  for (const address of changed) readersOf(readers, address, always, (output) => dirty.add(output));
  return dirty;
};

const sameOutputs = (before: Evaluation, resolve: (output: Output) => Result) => {
  for (const [dependency, result] of before.outputs)
    if (resolve(dependency) !== result) return false;
  return true;
};

const evaluateOutput = (
  output: Output,
  source: Source,
  readAt: Read,
  owned: ReadonlyMap<object, Output>,
  resolve: (output: Output) => Result,
  previous: Result | undefined,
  context: Context,
): Evaluation => {
  const fields = viewsOf(source, readAt);
  const outputs = new Map<Output, Result>();
  let tracking = true;
  const read = (reference: object) => {
    const dependency = owned.get(reference);
    if (!dependency) throw new Error("Invalid or foreign output reference");
    const resolved = resolve(dependency);
    if (tracking) outputs.set(dependency, resolved);
    return readResult(resolved);
  };
  let result: Result;
  try {
    const value = copyOutput(output.formula(fields.form(true), toolsWith({ read }, context)));
    // Catching a dependency's error cannot publish an unavailable result as current.
    for (const dependency of outputs.values()) readResult(dependency);
    result = previous && "value" in previous && equal(previous.value, value) ? previous : { value };
  } catch (cause) {
    result = failed(output, cause);
  } finally {
    tracking = false;
    fields.stop();
  }
  return { result, fields: fields.reads, outputs };
};

export const outputObserver = <T>(
  named: Readonly<Record<string, Output>>,
  callback: (values: T) => void,
  run: (callback: () => void) => void,
) => {
  let reads: Set<Output> | undefined;
  let previous: OutputEvaluations = new Map();
  return (current: OutputEvaluations) => {
    if (
      reads &&
      [...reads].every((output) => previous.get(output)?.result === current.get(output)?.result)
    )
      return;
    previous = current;
    const observed = new Set<Output>();
    reads = observed;
    let tracking = true;
    const descriptors = Object.fromEntries(
      Object.entries(named).map(([name, output]) => [
        name,
        {
          enumerable: true,
          get: () => {
            if (tracking) observed.add(output);
            const evaluation = current.get(output);
            if (!evaluation) throw new Error(`Output "${name}" is unavailable`);
            return readResult(evaluation.result);
          },
        },
      ]),
    );
    const view = Object.freeze(Object.create(null, descriptors)) as T;
    run(() => {
      try {
        callback(view);
      } finally {
        tracking = false;
      }
    });
  };
};
