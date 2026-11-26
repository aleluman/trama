import { useEffect, useState, type ChangeEvent } from "react";
import type {
  CheckboxFieldProps,
  NumberFieldProps,
  SelectFieldProps,
  TextFieldProps,
} from "trama-forms/react";

// This guide's renderers. Trama gives them id, name, label, value, disabled,
// readOnly, required, reasons, errors, warnings, dirty, onChange, onBlur y
// onInputError, plus placeholder, options, list, decimals, min, or max depending on the type.
// The application owns the markup. While the field is disabled or read-only, the binding
// ignores onChange.

export const Label = ({
  id,
  name,
  label,
  required,
}: Pick<TextFieldProps, "id" | "name" | "label" | "required">) => (
  <label htmlFor={id}>
    {label ?? name}
    {required && (
      <span className="required" aria-hidden="true">
        {" *"}
      </span>
    )}
  </label>
);

// Below the control the renderer shows errors according to the binding's policy, when the
// field is touched or after an attempt. It always shows warnings, and also shows disabled
// and readOnly reasons. Each note doubles as its paragraph's class and the suffix of the ID
// that the control references in aria-describedby. Any error marks the control with aria-invalid.
const notes = ["errors", "warnings", "reasons"] as const;
type NoteProps = Pick<TextFieldProps, (typeof notes)[number]>;
export const Notes = (props: NoteProps & { readonly id: string }) =>
  notes.map((note) =>
    props[note].length === 0 ? null : (
      <p key={note} id={`${props.id}-${note}`} className={note}>
        {props[note].join(" · ")}
      </p>
    ),
  );
// The IDs of the hint and notes the renderer shows below the control.
export const describedBy = (id: string, props: NoteProps, hint?: string) => {
  const ids = notes.filter((note) => props[note].length > 0).map((note) => `${id}-${note}`);
  if (hint !== undefined) ids.unshift(`${id}-hint`);
  return ids.join(" ") || undefined;
};
// The option key prevents a string value and a numeric value from colliding.
export const optionKey = (option: { readonly value: string | number }) =>
  `${typeof option.value}:${option.value}`;

export const TextInput = ({
  id,
  name,
  label,
  value,
  disabled,
  readOnly,
  required,
  reasons,
  errors,
  warnings,
  placeholder,
  onChange,
  onBlur,
}: TextFieldProps) => (
  <div className="field">
    <Label id={id} name={name} label={label} required={required} />
    <input
      id={id}
      name={name}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      readOnly={readOnly}
      aria-required={required}
      aria-invalid={errors.length > 0}
      aria-describedby={describedBy(id, { reasons, errors, warnings })}
      onChange={(event) => onChange(event.currentTarget.value)}
      onBlur={onBlur}
    />
    <Notes id={id} errors={errors} warnings={warnings} reasons={reasons} />
  </div>
);

// Keeps partial text such as "-" or "1." on screen while only finite numbers reach the session.
// Out of the control, it shows the value with its decimals; it never writes the rounded value.
// The control is a text input, so min and max would do nothing on it: the hint shows them.
export const NumberInput = (props: NumberFieldProps) => {
  const { id, name, label, required, reasons, errors, warnings, placeholder } = props;
  const { decimals, min, max } = props;
  const { shown, change, setEditing } = useNumberDraft(props);
  const hint = hintOf(decimals, min, max);
  return (
    <div className="field">
      <Label id={id} name={name} label={label} required={required} />
      <input
        id={id}
        name={name}
        inputMode="decimal"
        value={shown}
        placeholder={placeholder}
        disabled={props.disabled}
        readOnly={props.readOnly}
        aria-required={required}
        aria-invalid={errors.length > 0}
        aria-describedby={describedBy(id, props, hint)}
        onChange={change}
        onFocus={() => setEditing(true)}
        onBlur={() => {
          setEditing(false);
          props.onBlur();
        }}
      />
      <Hint id={id} hint={hint} />
      <Notes id={id} errors={errors} warnings={warnings} reasons={reasons} />
    </div>
  );
};
// The input shows the text as typed while editing and the value with its decimals when
// idle. Incomplete text is an error in the view until it is converted or
// replaced by the value.
const useNumberDraft = ({ value, decimals, onChange, onInputError }: NumberFieldProps) => {
  const [display, setDisplay] = useState(() => displayOf(value));
  const [editing, setEditing] = useState(false);
  if (!Object.is(display.value, value)) setDisplay(displayOf(value));
  const partial = parse(display.text) === undefined;
  useEffect(() => {
    if (!partial) onInputError();
  }, [partial, onInputError]);
  const change = (event: ChangeEvent<HTMLInputElement>) => {
    const text = event.currentTarget.value;
    const parsed = parse(text);
    setDisplay({ value: parsed === undefined ? value : parsed, text });
    if (parsed === undefined) return onInputError("Incomplete number");
    // The error clears only after a successful write. If the write fails, the error stays.
    onChange(parsed);
    onInputError();
  };
  const shown =
    editing || value === null || decimals === undefined ? display.text : fixed(value, decimals);
  return { shown, change, setEditing };
};
const displayOf = (value: number | null) => ({ value, text: value === null ? "" : String(value) });
// toFixed takes up to 100 decimals.
const fixed = (value: number, decimals: number) => value.toFixed(Math.min(decimals, 100));
// The number of a complete text, null if it is empty, or undefined while it is partial.
const parse = (text: string) => {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return /^[+-]?(?:\d+\.?\d*|\.\d+)$/u.test(trimmed) && Number.isFinite(parsed)
    ? parsed
    : undefined;
};
const Hint = ({ id, hint }: { id: string; hint: string | undefined }) =>
  hint === undefined ? null : (
    <p id={`${id}-hint`} className="hint">
      {hint}
    </p>
  );

// The limits and the decimals of the state, as "Between 0 and 100 · 2 decimals".
const hintOf = (decimals?: number, min?: number, max?: number) => {
  const parts: string[] = [];
  if (min !== undefined && max !== undefined) parts.push(`Between ${min} and ${max}`);
  else if (min !== undefined) parts.push(`Minimum ${min}`);
  else if (max !== undefined) parts.push(`Maximum ${max}`);
  if (decimals === 0) parts.push("No decimals");
  else if (decimals !== undefined)
    parts.push(`${decimals} ${decimals === 1 ? "decimal" : "decimals"}`);
  return parts.length === 0 ? undefined : parts.join(" · ");
};

// A checkbox or a select has no readonly attribute: aria-readonly announces it
// and the binding keeps the value.
export const CheckboxInput = ({
  id,
  name,
  label,
  value,
  disabled,
  readOnly,
  required,
  reasons,
  errors,
  warnings,
  onChange,
  onBlur,
}: CheckboxFieldProps) => (
  <div className={readOnly ? "field checkbox readonly" : "field checkbox"}>
    <input
      id={id}
      name={name}
      type="checkbox"
      checked={value}
      disabled={disabled}
      aria-readonly={readOnly}
      aria-required={required}
      aria-invalid={errors.length > 0}
      aria-describedby={describedBy(id, { reasons, errors, warnings })}
      onChange={(event) => onChange(event.currentTarget.checked)}
      onBlur={onBlur}
    />
    <Label id={id} name={name} label={label} required={required} />
    <Notes id={id} errors={errors} warnings={warnings} reasons={reasons} />
  </div>
);

// Option values can be strings or numbers, so the <select> uses option positions.
export const SelectInput = ({
  id,
  name,
  label,
  value,
  disabled,
  readOnly,
  required,
  reasons,
  errors,
  warnings,
  options,
  onChange,
  onBlur,
}: SelectFieldProps) => (
  <div className={readOnly ? "field readonly" : "field"}>
    <Label id={id} name={name} label={label} required={required} />
    <select
      id={id}
      name={name}
      disabled={disabled}
      aria-readonly={readOnly}
      aria-required={required}
      aria-invalid={errors.length > 0}
      aria-describedby={describedBy(id, { reasons, errors, warnings })}
      value={String(options.findIndex((option) => option.value === value))}
      onChange={(event) => onChange(options[Number(event.currentTarget.value)]?.value ?? null)}
      onBlur={onBlur}
    >
      <option value="-1">No selection</option>
      {options.map((option, index) => (
        <option key={optionKey(option)} value={index}>
          {option.label}
        </option>
      ))}
    </select>
    <Notes id={id} errors={errors} warnings={warnings} reasons={reasons} />
  </div>
);
