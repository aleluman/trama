// defineForm: it checks a configuration, copies and freezes its fields and
// collections, and compiles its rules. Only the definitions it returns open
// sessions.
import { defaultsOf, hasOnlyKeys } from "./fields.js";
import { compileOutputs, type OutputTools } from "./outputs.js";
import { compileProperties } from "./rules.js";
import { sourcesOf } from "./rule-sets.js";
import { checkDeclared, compileCollections, positionsOf, shapeOf } from "./collections.js";
import { declaredStates } from "./states.js";
import type { DefineForm } from "./config.js";
import type { Fields, FormDefinition } from "./definition.js";
import { register, type Compiled, type EndpointTable } from "./compiled.js";
import { defaultMessages, type Messages } from "./messages.js";

type Config = {
  readonly fields: Fields;
  readonly collections?: unknown;
  readonly context?: unknown;
  readonly defaults?: unknown;
  readonly include?: unknown;
  readonly rules?: unknown;
  readonly form?: unknown;
  readonly outputs?: ((tools: OutputTools<Fields, unknown, unknown>) => unknown) | undefined;
};
const sections = [
  "fields",
  "collections",
  "context",
  "defaults",
  "include",
  "rules",
  "form",
  "outputs",
];

export const defineFormFor =
  (table?: EndpointTable, messages: Messages = defaultMessages) =>
  (config: Config): FormDefinition => {
    if (!hasOnlyKeys(config, sections))
      throw new Error(
        "Form configuration requires fields and optional collections/context/defaults/include/rules/form/outputs",
      );
    const { fields, endpoints, collections } = checkDeclared(
      "Form",
      config.fields,
      config.collections,
      config.context,
      table,
    );
    checkDefaults(config);
    const definition = Object.freeze({
      fields: Object.freeze(fields),
      collections: collections.definition,
    }) as unknown as FormDefinition;
    const compiled = compileCollections(collections.checked);
    register(definition, { ...compile(config, fields, compiled, endpoints, table), messages });
    return definition;
  };

const checkDefaults = ({ context: declared, defaults }: Config) => {
  if (defaults !== undefined && typeof defaults !== "function")
    throw new Error("Form defaults must be a function of the context");
  if (defaults !== undefined && declared === undefined)
    throw new Error("Form defaults requires a context");
};

const compile = (
  config: Config,
  fields: Fields,
  collections: Compiled["collections"],
  endpoints: EndpointTable,
  table: EndpointTable | undefined,
): Omit<Compiled, "messages"> => {
  const context = config.context !== undefined;
  const receiver = { fields, collections, context, table };
  const sources = sourcesOf(config.include, config.rules, receiver);
  return {
    fields: Object.freeze(fields),
    ...compileProperties(fields, collections, sources, config.form),
    collections,
    shape: shapeOf([...Object.keys(fields), ...collections.keys()]),
    positions: positionsOf(Object.keys(fields)),
    declared: declaredStates(fields),
    outputs: compileOutputs(config.outputs),
    endpoints,
    context,
    defaults: config.defaults as Compiled["defaults"],
    fieldDefaults: defaultsOf(fields),
  };
};
// The checks of its signature are types only.
export const defineForm = defineFormFor() as DefineForm<undefined>;
