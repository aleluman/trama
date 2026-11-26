import {
  Component,
  createElement,
  useLayoutEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { FormDefinition, FormOutputs, Session } from "../core/index.js";

// Retain the original diagnostic, including for renders that never commit.
// Weak keys do not keep abandoned renders or their sessions alive.
const failures = new WeakMap<object, WeakMap<Error, PropertyKey>>();

type BoundaryProps<D extends FormDefinition> = {
  session: Session<D>;
  fallback: ReactNode;
  children?: ReactNode;
};

// A stable key per session remounts keyed children when their session changes.
const sessionKeys = new WeakMap<object, number>();
let nextSessionKey = 0;
export const sessionKey = (session: object): number => {
  let key = sessionKeys.get(session);
  if (key === undefined) {
    key = nextSessionKey++;
    sessionKeys.set(session, key);
  }
  return key;
};

export const OutputBoundary = <D extends FormDefinition>(props: BoundaryProps<D>): ReactNode =>
  createElement(CatchOutput<D>, { ...props, key: sessionKey(props.session) });

type Failure = { failure: { error: unknown } | null };

// React's error-catching lifecycle requires a class. Selection and recovery use
// the same functional subscription as ordinary output consumers.
class CatchOutput<D extends FormDefinition> extends Component<BoundaryProps<D>, Failure> {
  override state: Failure = { failure: null };
  static getDerivedStateFromError(error: unknown) {
    return { failure: { error } };
  }
  recover = () => {
    this.setState({ failure: null });
  };
  override render(): ReactNode {
    if (!this.state.failure) return this.props.children;
    const { error } = this.state.failure;
    const name = error instanceof Error ? failures.get(this.props.session)?.get(error) : undefined;
    if (name === undefined) throw error;
    return createElement(RecoverOutput<D>, {
      session: this.props.session,
      name: name as keyof FormOutputs<D>,
      fallback: this.props.fallback,
      recover: this.recover,
    });
  }
}

const RecoverOutput = <D extends FormDefinition>({
  session,
  name,
  fallback,
  recover,
}: Omit<BoundaryProps<D>, "children"> & {
  name: keyof FormOutputs<D>;
  recover: () => void;
}) => {
  const outputs = useOutputs(session);
  const ready = "value" in read(outputs, name);
  useLayoutEffect(() => {
    if (ready) recover();
  }, [ready, recover]);
  return fallback;
};

export const useOutputs = <D extends FormDefinition>(session: Session<D>): FormOutputs<D> => {
  "use no memo";
  // Each render owns its selection. An abandoned render cannot replace the
  // committed subscription, and React checks the selected values before commit.
  const selection = selectOutputs(session);
  const snapshot = useSyncExternalStore(selection.subscribe, selection.getSnapshot);
  useLayoutEffect(() => {
    selection.finishRender();
  });
  return selection.track(snapshot);
};

const selectOutputs = <D extends FormDefinition>(session: Session<D>) => {
  const errors = failures.get(session) ?? new WeakMap<Error, PropertyKey>();
  failures.set(session, errors);
  const names = new Set<keyof FormOutputs<D>>();
  let tracking = true;
  const capture = () => {
    let current!: FormOutputs<D>;
    session.watchOutputs((outputs) => {
      current = outputs;
    })();
    return current;
  };
  let snapshot = capture();
  const update = (current: FormOutputs<D>) => {
    if ([...names].some((name) => !sameRead(snapshot, current, name))) snapshot = current;
    return snapshot;
  };
  return {
    getSnapshot: () => update(capture()),
    subscribe: (notify: () => void) =>
      session.watchOutputs((current) => {
        const previous = snapshot;
        // Read every selected name, including after a failed one, so recovery is
        // observable without throwing in a subscription or swallowing render errors.
        for (const name of names) read(current, name);
        update(current);
        if (previous !== snapshot) notify();
      }),
    finishRender: () => {
      tracking = false;
    },
    track: (current: FormOutputs<D>) =>
      new Proxy(current, {
        get: (target, key, receiver) => {
          if (tracking && Object.hasOwn(target, key)) names.add(key as keyof FormOutputs<D>);
          try {
            return Reflect.get(target, key, receiver);
          } catch (error) {
            if (error instanceof Error) errors.set(error, key);
            throw error;
          }
        },
      }),
  };
};

const read = <T, K extends keyof T>(outputs: T, name: K) => {
  try {
    return { value: outputs[name] };
  } catch (error) {
    return { error };
  }
};
const sameRead = <T, K extends keyof T>(left: T, right: T, name: K) => {
  const a = read(left, name);
  const b = read(right, name);
  return "error" in a
    ? "error" in b && Object.is(a.error, b.error)
    : "value" in b && Object.is(a.value, b.value);
};
