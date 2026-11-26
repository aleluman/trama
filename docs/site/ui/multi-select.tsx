import type { MultiSelectFieldProps } from "trama-forms/react";
import { describedBy, optionKey, Notes } from "./inputs";

// This guide's multiple select renderer uses one checkbox per option. Checking or unchecking
// writes the checked values in option order. Order is irrelevant to Trama because it compares
// sets. Checkboxes have no readonly attribute, so aria-readonly announces the state and the
// binding preserves the value. Moving focus off a checkbox touches the field.
export const MultiSelectInput = (props: MultiSelectFieldProps) => {
  const { id, name, label, disabled, readOnly, required, reasons, errors, warnings } = props;
  return (
    <fieldset
      id={id}
      className={readOnly ? "field choices readonly" : "field choices"}
      disabled={disabled}
      aria-invalid={errors.length > 0}
      aria-describedby={describedBy(id, props)}
    >
      <legend>
        {label ?? name}
        {required && (
          <span className="required" aria-hidden="true">
            {" *"}
          </span>
        )}
      </legend>
      <Choices {...props} />
      <Notes id={id} errors={errors} warnings={warnings} reasons={reasons} />
    </fieldset>
  );
};

const Choices = ({ name, value, readOnly, options, onChange, onBlur }: MultiSelectFieldProps) => {
  const toggle = (index: number, checked: boolean) =>
    onChange(
      options
        .filter((option, at) => (at === index ? checked : value.includes(option.value)))
        .map((option) => option.value),
    );
  return options.map((option, index) => (
    <label key={optionKey(option)}>
      <input
        type="checkbox"
        name={name}
        checked={value.includes(option.value)}
        aria-readonly={readOnly}
        onChange={(event) => toggle(index, event.currentTarget.checked)}
        onBlur={onBlur}
      />
      {option.label}
    </label>
  ));
};
