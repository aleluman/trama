import { defineForm, field } from "trama-forms/core";
import {
  createReactBinding,
  type CheckboxFieldProps,
  type SelectFieldProps,
} from "trama-forms/react";
import { Field } from "../../ui/form-ui";

const Switch = ({ id, label, value, disabled, onChange }: CheckboxFieldProps) => (
  <button
    id={id}
    type="button"
    role="switch"
    aria-checked={value}
    disabled={disabled}
    className="switch"
    onClick={() => onChange(!value)}
  >
    <span className="switch-track" aria-hidden="true" />
    {label}
  </button>
);

const Segmented = ({ id, label, value, disabled, options, onChange }: SelectFieldProps) => (
  <fieldset id={id} disabled={disabled} className="segmented">
    <legend>{label}</legend>
    {options.map((option) => (
      <button
        key={String(option.value)}
        type="button"
        aria-pressed={option.value === value}
        onClick={() => onChange(option.value)}
      >
        {option.label}
      </button>
    ))}
  </fieldset>
);

// A partial registry. It accepts only definitions with checkbox and select fields.
const compact = createReactBinding({ checkbox: Switch, select: Segmented });

const settings = defineForm({
  fields: {
    notifications: field.checkbox({ label: "Notifications", default: true }),
    density: field.select({
      label: "Density",
      options: [
        { value: "compact", label: "Compact" },
        { value: "comfortable", label: "Comfortable" },
      ],
      default: "comfortable",
    }),
  },
});

export const Demo = () => {
  const editor = compact.useFormSession(settings);
  if (editor.status !== "ready") return null;
  const { session } = editor;

  // The same session, displayed with two different registries.
  return (
    <div className="columns">
      <fieldset>
        <legend>Compact registry</legend>
        <compact.Field session={session} name="notifications" />
        <compact.Field session={session} name="density" />
      </fieldset>
      <fieldset>
        <legend>Guide registry</legend>
        <Field session={session} name="notifications" />
        <Field session={session} name="density" />
      </fieldset>
    </div>
  );
};

// TypeScript rejects definitions with types the registry does not cover.
type CompactDefinition = Parameters<typeof compact.useFormSession>[0];
// @ts-expect-error The compact registry has no text renderer.
export const rejected: CompactDefinition = defineForm({ fields: { title: field.text() } });
