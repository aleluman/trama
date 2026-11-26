import { useState } from "react";
import type { DateFieldProps } from "trama-forms/react";
import { civil } from "./date-input";
import { describedBy, Label, Notes } from "./inputs";

// This date renderer accepts YYYY-MM-DD text and keeps the draft. While the date is incomplete,
// the renderer reports it with onInputError and the session receives nothing. The value and
// dirty state stay the same, and preparing returns invalid. Once complete, the renderer
// writes the date and then clears the error. "Discard" restores the text of the value. The
// renderer owns the text, so unmounting a view drops it and the binding clears its error.
export const PartialDate = (props: DateFieldProps) => {
  const { id, name, label, disabled, readOnly, required, reasons, errors, warnings } = props;
  const { text, pending, type, discard } = useDateDraft(props);
  return (
    <div className="field">
      <Label id={id} name={name} label={label} required={required} />
      <div className="date-input">
        <input
          id={id}
          name={name}
          inputMode="numeric"
          value={text}
          placeholder={props.placeholder ?? "YYYY-MM-DD"}
          disabled={disabled}
          readOnly={readOnly}
          aria-required={required}
          aria-invalid={errors.length > 0}
          aria-describedby={describedBy(id, props)}
          onChange={(event) => type(event.currentTarget.value)}
          onBlur={props.onBlur}
        />
        {pending && (
          <button type="button" className="quiet" onClick={discard}>
            Discard
          </button>
        )}
      </div>
      <Notes id={id} errors={errors} warnings={warnings} reasons={reasons} />
    </div>
  );
};

const useDateDraft = ({ value, onChange, onInputError }: DateFieldProps) => {
  // The draft, or undefined while the control shows the value.
  const [draft, setDraft] = useState<string | undefined>();
  const type = (text: string) => {
    const problem = problemOf(text);
    if (problem !== undefined) {
      setDraft(text);
      return onInputError(problem);
    }
    setDraft(undefined);
    // The error clears only after a successful write. If the write fails, the error stays.
    onChange(text === "" ? null : text);
    onInputError();
  };
  const discard = () => {
    setDraft(undefined);
    onInputError();
  };
  return { text: draft ?? value ?? "", pending: draft !== undefined, type, discard };
};

// What prevents converting the text. Empty text is null, and a complete date must exist,
// starting from year 1.
const problemOf = (text: string) => {
  if (text === "") return;
  if (!civil.test(text)) return "Incomplete date (YYYY-MM-DD)";
  const [year, month, day] = text.split("-").map(Number) as [number, number, number];
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  const exists =
    year >= 1 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
  return exists ? undefined : "That date does not exist";
};
