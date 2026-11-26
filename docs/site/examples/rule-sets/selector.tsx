import { useMemo, useState } from "react";
import { useFormSession } from "../../ui/form-ui";
import { Document } from "./document";
import { initial, variant } from "./forms";

// The variant is chosen when defining the form. Changing it creates another definition,
// which opens another session with a different key. Edits do not carry over to the other variant.
export const Demo = () => {
  const [automatic, setAutomatic] = useState(true);
  const definition = useMemo(() => variant(automatic), [automatic]);
  const editor = useFormSession(definition, {
    key: String(automatic),
    scope: "inventory",
    initial,
  });
  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={automatic}
        className="switch"
        onClick={() => setAutomatic(!automatic)}
      >
        <span className="switch-track" aria-hidden="true" />
        Select the lot if it is the only one
      </button>
      <p>
        Definition: <output>{automatic ? "with lots" : "with lotParamsOnly"}</output>
      </p>
      {editor.status === "ready" && <Document session={editor.session} />}
    </>
  );
};
