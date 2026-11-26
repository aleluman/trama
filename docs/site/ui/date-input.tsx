import type { DateFieldProps } from "trama-forms/react";
import { describedBy, Label, Notes } from "./inputs";

// This guide's date renderer uses the native control, which returns YYYY-MM-DD. It returns
// "" while the date is incomplete, and the renderer writes null, the field's empty value.
// A year with more than four digits also becomes null. The native control has no visible
// placeholder, so the renderer shows it below while there is no date. min and max limit the
// calendar. Without them, it spans the year range of a civil date.
export const civil = /^\d{4}-\d{2}-\d{2}$/u;

export const DateInput = ({
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
  min,
  max,
  onChange,
  onBlur,
}: DateFieldProps) => (
  <div className="field">
    <Label id={id} name={name} label={label} required={required} />
    <div className="date-input">
      <input
        id={id}
        name={name}
        type="date"
        min={min ?? "0001-01-01"}
        max={max ?? "9999-12-31"}
        value={value ?? ""}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        aria-required={required}
        aria-invalid={errors.length > 0}
        aria-describedby={describedBy(id, { reasons, errors, warnings })}
        onChange={(event) => {
          const text = event.currentTarget.value;
          onChange(civil.test(text) ? text : null);
        }}
        onBlur={onBlur}
      />
      {value !== null && !disabled && !readOnly && (
        <button type="button" className="quiet" onClick={() => onChange(null)}>
          Remove
        </button>
      )}
    </div>
    {value === null && placeholder !== undefined && <p className="hint">{placeholder}</p>}
    <Notes id={id} errors={errors} warnings={warnings} reasons={reasons} />
  </div>
);
