import { useEffect, useRef, useSyncExternalStore, type RefObject } from "react";
import type { FormDefinition, Session } from "trama-forms/core";
import { useOutputs } from "trama-forms/react";
import { format } from "./format";

type Part = "values" | "fieldStates" | "queries" | "outputs";
const valuesOnly: readonly Part[] = ["values"];

// This panel belongs to the guide and shows a live session using only Trama's public
// interface (subscribe, getSnapshot, and useOutputs). With properties, the fieldStates
// panel shows only those properties of each state.
export const SessionState = <D extends FormDefinition>({
  session,
  show = valuesOnly,
  properties,
}: {
  session: Session<D>;
  show?: readonly Part[];
  properties?: readonly string[];
}) => {
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
  }, []);
  return (
    <div className="state-panel" aria-label="Session state">
      {show.includes("values") && (
        <Entries title="snapshot.values" record={snapshot.values} mounted={mounted} />
      )}
      {show.includes("fieldStates") &&
        (properties === undefined ? (
          <Entries title="snapshot.fieldStates" record={snapshot.fieldStates} mounted={mounted} />
        ) : (
          <Entries
            title={`snapshot.fieldStates (${properties.join(", ")})`}
            record={only(snapshot.fieldStates, properties)}
            mounted={mounted}
          />
        ))}
      {show.includes("queries") && (
        <Entries title="snapshot.queries" record={snapshot.queries} mounted={mounted} />
      )}
      {show.includes("outputs") && <Outputs session={session} mounted={mounted} />}
    </div>
  );
};

type States = Readonly<Record<string, unknown>>;
const isRecord = (value: unknown): value is States => typeof value === "object" && value !== null;
// The given properties of each state, of the header and of each row, when the state has them
// and they are not an empty list.
const shown = (state: States, key: string) =>
  Object.hasOwn(state, key) && !(Array.isArray(state[key]) && state[key].length === 0);
const only = (states: States, properties: readonly string[]): States =>
  Object.fromEntries(
    Object.entries(states).map(([name, state]) => [
      name,
      Array.isArray(state)
        ? state.map((row: unknown) => (isRecord(row) ? only(row, properties) : row))
        : isRecord(state)
          ? Object.fromEntries(
              properties.filter((key) => shown(state, key)).map((key) => [key, state[key]]),
            )
          : state,
    ]),
  );

const Outputs = <D extends FormDefinition>({
  session,
  mounted,
}: {
  session: Session<D>;
  mounted: RefObject<boolean>;
}) => {
  const outputs = useOutputs(session);
  const record = Object.fromEntries(
    Object.keys(outputs).map((name) => {
      try {
        const value: unknown = Reflect.get(outputs, name);
        return [name, value];
      } catch (error) {
        // Reading a failed output throws its diagnostic.
        return [name, error];
      }
    }),
  );
  return <Entries title="outputs" record={record} mounted={mounted} />;
};

const Entries = ({
  title,
  record,
  mounted,
}: {
  title: string;
  record: Readonly<Record<string, unknown>>;
  mounted: RefObject<boolean>;
}) => (
  <div className="state-part">
    <p className="state-title">{title}</p>
    <pre>
      <code>
        {"{\n"}
        {Object.entries(record).map(([key, value]) => {
          const text = format(value, "  ");
          return <Entry key={`${key}=${text}`} text={`  ${key}: ${text},\n`} mounted={mounted} />;
        })}
        {"}"}
      </code>
    </pre>
  </div>
);

// Each changed value mounts a new entry, which highlights itself after the first render.
const Entry = ({ text, mounted }: { text: string; mounted: RefObject<boolean> }) => {
  const line = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!mounted.current || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    line.current?.animate(
      [{ backgroundColor: "var(--flash)" }, { backgroundColor: "transparent" }],
      {
        duration: 1200,
        easing: "ease-out",
      },
    );
  }, [mounted]);
  return (
    <span ref={line} className={text.includes("Error:") ? "entry failed" : "entry"}>
      {text}
    </span>
  );
};
