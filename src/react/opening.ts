import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";
import {
  createSession as createCoreSession,
  type FormDefinition,
  type FormInitial,
  type Loader,
  type Scope,
  type Session,
} from "../core/index.js";

// The core requires scope for a form with async fields and the context a form
// declares, which a generic definition cannot show; useFormSession requires
// them in types.
const createSession = <D extends FormDefinition>(
  definition: D,
  options: {
    readonly initial?: FormInitial<D> | undefined;
    readonly scope: Scope | undefined;
    readonly loader: Loader | undefined;
    readonly context: unknown;
  },
): Session<D> =>
  (createCoreSession as (definition: D, options: object) => Session<D>)(definition, options);

export type InitialQuery<T> = {
  readonly data: T | undefined;
  readonly error: unknown;
  readonly status: "pending" | "error" | "success";
  readonly isEnabled: boolean;
  readonly isStale: boolean;
  readonly isPlaceholderData: boolean;
  readonly dataUpdatedAt: number;
  refetch(options: { cancelRefetch: boolean; throwOnError: boolean }): Promise<InitialQuery<T>>;
};
const querySource = Symbol("initialFromQuery");
export type QueryInitial<T> = {
  readonly [querySource]: InitialQuery<T>;
};
export const initialFromQuery = <T>(query: InitialQuery<T>): QueryInitial<T> => ({
  [querySource]: query,
});
export type FormEditor<D extends FormDefinition> =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly error: unknown; retry(): void }
  | { readonly status: "ready"; readonly session: Session<D> };

type Initial<D extends FormDefinition> = FormInitial<D> | QueryInitial<FormInitial<D>>;
// The options of the core session for D: scope is required when the form has
// async fields, context when it declares one, and then so are the options.
type CoreOptions<D extends FormDefinition> = Parameters<typeof createCoreSession<D>>[1];
export type SessionOptions<D extends FormDefinition> = {
  readonly key?: string | number | undefined;
  readonly initial?: Initial<D> | undefined;
} & Pick<NonNullable<CoreOptions<D>>, "scope" | "context">;
export type SessionArgument<D extends FormDefinition> =
  undefined extends CoreOptions<D> ? [options?: SessionOptions<D>] : [options: SessionOptions<D>];

// Coordinates readiness only. Once ready, values belong exclusively to the core session.
class Opening<D extends FormDefinition> {
  readonly key: string | number | undefined;
  readonly definition: D;
  readonly scope: Scope | undefined;
  // The context of the latest render the view committed until the session
  // exists, and then the one it was created with.
  #context: unknown;
  readonly #loader: Loader | undefined;
  #result: FormEditor<D>;
  #active = false;
  // The epoch of the refresh in flight; a new epoch invalidates it.
  #requested: number | undefined;
  #epoch = 0;
  #forceRefresh = false;
  #listeners = new Set<() => void>();

  // The source of initial is decided here: values open at once, and a query
  // keeps the opening loading until it accepts data.
  constructor(definition: D, options: SessionOptions<D>, loader: Loader | undefined) {
    this.definition = definition;
    this.key = options.key;
    this.scope = options.scope;
    this.#context = options.context;
    this.#loader = loader;
    this.#result =
      options.initial !== undefined && querySource in options.initial
        ? { status: "loading" }
        : { status: "ready", session: this.#create(options.initial) };
  }
  #create(initial: FormInitial<D> | undefined) {
    return createSession(this.definition, {
      initial,
      scope: this.scope,
      loader: this.#loader,
      context: this.#context,
    });
  }
  remember(context: unknown) {
    if (this.#result.status !== "ready") this.#context = context;
  }
  // Any context until the session exists; then only one equal as data to the
  // one it was created with.
  keeps(context: unknown): boolean {
    return this.#result.status !== "ready" || sameData(this.#context, context);
  }
  getSnapshot = (): FormEditor<D> => this.#result;
  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };
  activate(): () => void {
    this.#active = true;
    return () => {
      this.#active = false;
      this.#epoch += 1;
    };
  }
  #publish(result: FormEditor<D>) {
    this.#result = result;
    this.#listeners.forEach((listener) => {
      listener();
    });
  }
  #accept(data: FormInitial<D> | undefined) {
    if (data === undefined) throw new Error("Initial query has no data");
    this.#publish({ status: "ready", session: this.#create(data) });
  }
  #fail(error: unknown) {
    const result: FormEditor<D> = {
      status: "error",
      error,
      // A retry of an inactive opening, or of an error it already left, is ignored.
      retry: () => {
        if (!this.#active || this.#result !== result) return;
        this.#epoch += 1;
        this.#forceRefresh = true;
        this.#publish({ status: "loading" });
      },
    };
    this.#publish(result);
  }
  // An initial that stops being a query while loading is ignored, so the
  // request in flight may still open.
  update(initial: Initial<D> | undefined) {
    if (this.#result.status !== "loading" || initial === undefined || !(querySource in initial))
      return;
    const query = initial[querySource];
    if (!query.isEnabled) {
      this.#epoch += 1;
      return;
    }
    if (this.#requested === this.#epoch) return;
    if (
      !this.#forceRefresh &&
      query.status === "success" &&
      !query.isStale &&
      !query.isPlaceholderData
    ) {
      try {
        this.#accept(query.data);
      } catch (error) {
        this.#fail(error);
      }
      return;
    }
    this.#requested = this.#epoch;
    void this.#refresh(query, this.#epoch);
  }
  async #refresh(query: InitialQuery<FormInitial<D>>, epoch: number) {
    // Capture before requesting: cancellation may resolve with reverted cache data.
    const previousUpdate = query.dataUpdatedAt;
    try {
      const result = await query.refetch({ cancelRefetch: false, throwOnError: true });
      if (!this.#active || this.#epoch !== epoch) return;
      if (
        result.status !== "success" ||
        result.isPlaceholderData ||
        result.dataUpdatedAt <= previousUpdate
      ) {
        throw (
          result.error ??
          new Error(
            "Initial query refresh could not be verified (cancelled or coincident timestamp); retry",
          )
        );
      }
      this.#accept(result.data);
    } catch (error) {
      if (this.#active && this.#epoch === epoch) this.#fail(error);
    }
  }
}

// A key keeps its definition, its scope, where -0 is 0 and NaN is NaN, and,
// once its session exists, its context as data.
const sameZero = (scope: unknown) => (scope === 0 ? 0 : scope);
export const useSession = <D extends FormDefinition>(
  definition: D,
  options: SessionOptions<D>,
  loader: Loader | undefined,
): FormEditor<D> => {
  const { key } = options;
  if (key !== undefined && typeof key !== "string" && !Number.isFinite(key))
    throw new Error("Session key must be a string, finite number or undefined");
  const [opening, setOpening] = useState(() => new Opening(definition, options, loader));
  if (!Object.is(opening.key, options.key)) setOpening(new Opening(definition, options, loader));
  else if (opening.definition !== definition)
    throw new Error("Changing definition requires a different session key");
  else if (!Object.is(sameZero(opening.scope), sameZero(options.scope)))
    throw new Error("Changing scope requires a different session key");
  else if (!opening.keeps(options.context))
    throw new Error("Changing context requires a different session key");
  // A layout effect, so a request that resolves before the effects of a commit
  // still opens with the context of that commit.
  useLayoutEffect(() => {
    opening.remember(options.context);
  });
  useEffect(() => opening.activate(), [opening]);
  useEffect(() => {
    opening.update(options.initial);
  });
  return useSyncExternalStore(opening.subscribe, opening.getSnapshot);
};

// Whether two values are equal as data, as the core compares them: the
// binding reaches the core only through its public entry.
const sameData = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true;
  if (typeof left !== "object" || left === null || typeof right !== "object" || right === null)
    return false;
  if (Object.getPrototypeOf(left) !== Object.getPrototypeOf(right)) return false;
  const keys = Reflect.ownKeys(left);
  return (
    keys.length === Reflect.ownKeys(right).length &&
    keys.every(
      (key) =>
        Object.hasOwn(right, key) && sameData(Reflect.get(left, key), Reflect.get(right, key)),
    )
  );
};
