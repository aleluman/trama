import { useLayoutEffect, useRef } from "react";
import { defineForm, field, type Session } from "trama-forms/core";
import { useOutputs } from "trama-forms/react";
import { Field, useFormSession } from "../../ui/form-ui";

const pair = defineForm({
  fields: {
    a: field.number({ label: "A", default: 1 }),
    b: field.number({ label: "B", default: 1 }),
  },
  outputs: ({ output }) => ({
    doubleA: output(({ a }) => (a ?? 0) * 2),
    doubleB: output(({ b }) => (b ?? 0) * 2),
  }),
});

type Props = { session: Session<typeof pair> };

// It reads only doubleA, so useOutputs rerenders it when doubleA changes.
const ReadsA = ({ session }: Props) => {
  const { doubleA } = useOutputs(session);
  return <Card title="Reads doubleA" value={doubleA} />;
};

const ReadsB = ({ session }: Props) => {
  const { doubleB } = useOutputs(session);
  return <Card title="Reads doubleB" value={doubleB} />;
};

// Counts renders after mounting without triggering additional renders.
const Card = ({ title, value }: { title: string; value: number }) => {
  const renders = useRef(0);
  const counter = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    renders.current += 1;
    if (counter.current) counter.current.textContent = String(renders.current);
  });
  useLayoutEffect(() => {
    renders.current = 0;
    if (counter.current) counter.current.textContent = "0";
  }, []);
  return (
    <div className="card">
      <p>{title}</p>
      <p className="big">{value}</p>
      <p className="muted">
        Renders after mounting: <strong ref={counter} />
      </p>
    </div>
  );
};

export const Demo = () => {
  const editor = useFormSession(pair);
  if (editor.status !== "ready") return null;
  const { session } = editor;

  return (
    <>
      <div className="row">
        <Field session={session} name="a" />
        <Field session={session} name="b" />
      </div>
      <div className="columns">
        <ReadsA session={session} />
        <ReadsB session={session} />
      </div>
    </>
  );
};
