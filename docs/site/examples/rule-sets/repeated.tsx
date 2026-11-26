import { useState } from "react";
import { messageOf } from "../../lib/format";
import { defineForm } from "../../forms.ts";
import { sale } from "./fields";
import { lots, sent, sentLock } from "./rules";

// sentLock declares no unique properties, so the types miss the duplicate. defineForm
// detects it at runtime. The form provides the context and lot parameters so the error
// is about the duplicate.
const defineRepeated = () =>
  defineForm({ ...sale, context: sent, include: [lots, sentLock, sentLock] });

export const Demo = () => {
  const [message, setMessage] = useState<string>();
  const define = () => {
    try {
      defineRepeated();
      setMessage("Defined");
    } catch (error) {
      setMessage(messageOf(error));
    }
  };
  return (
    <>
      <button type="button" onClick={define}>
        Define with sentLock twice
      </button>
      {message !== undefined && <output role="alert">{message}</output>}
    </>
  );
};
