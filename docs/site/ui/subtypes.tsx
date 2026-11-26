import { useEffect, useState } from "react";
import type { SubtypeProps } from "trama-forms/react";
import type { forms } from "../forms.ts";
import { describedBy, Label, optionKey, Notes } from "./inputs";

// The guide's subtype renderers. They receive their base props and the field's presentation,
// which is static and stays the same on every render.

// A text area whose value is text, just like its base.
export const Textarea = ({
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
  presentation,
  onChange,
  onBlur,
}: SubtypeProps<typeof forms, "textarea">) => (
  <div className="field">
    <Label id={id} name={name} label={label} required={required} />
    <textarea
      id={id}
      name={name}
      rows={presentation?.rows}
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

// A search with a table over the view's list. The value is the complete option, just like
// its base. The presentation specifies which option key each column shows. Focusing the
// search opens the list, and "Remove" empties the field.
export const SearchTable = (props: SubtypeProps<typeof forms, "search">) => {
  const { id, name, label, value, disabled, readOnly, required, reasons, list } = props;
  const { errors, warnings, onBlur } = props;
  const editable = !disabled && !readOnly;
  const [text, setText] = useSearch(list.search);
  return (
    <div className="field search-table">
      <Label id={id} name={name} label={label} required={required} />
      <input
        id={id}
        name={name}
        type="search"
        autoComplete="off"
        value={text ?? list.text}
        placeholder={value === null ? "Search" : value.label}
        disabled={!editable}
        aria-required={required}
        aria-invalid={errors.length > 0}
        aria-describedby={describedBy(id, props)}
        onFocus={list.open}
        onChange={(event) => setText(event.currentTarget.value)}
        onBlur={onBlur}
      />
      <Rows {...props} editable={editable} />
      {list.status === "ready" && !list.complete && (
        <button type="button" className="quiet" onClick={list.more}>
          Load more
        </button>
      )}
      {value !== null && editable && (
        <button type="button" className="quiet" onClick={() => props.onChange(null)}>
          Remove {value.label}
        </button>
      )}
      <Notes id={id} errors={errors} warnings={warnings} reasons={reasons} />
    </div>
  );
};

const Rows = ({
  value,
  list,
  presentation,
  editable,
  onChange,
}: SubtypeProps<typeof forms, "search"> & { editable: boolean }) => (
  <div className="table-scroll">
    <table>
      <thead>
        <tr>
          {presentation.columns.map(({ key, title }) => (
            <th key={key} scope="col">
              {title}
            </th>
          ))}
          <th scope="col">
            <span className="muted">{list.status === "loading" ? "Loading…" : ""}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {list.options.map((option) => (
          <tr key={optionKey(option)}>
            {presentation.columns.map(({ key }) => (
              <td key={key}>{String(option[key] ?? "")}</td>
            ))}
            <td>
              <button
                type="button"
                className="quiet"
                aria-pressed={option.value === value?.value}
                disabled={!editable}
                onClick={() => onChange(option)}
              >
                {option.value === value?.value ? "Selected" : "Select"}
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// Searches 250 ms after the last key.
const useSearch = (search: (text: string) => void) => {
  const [text, setText] = useState<string>();
  useEffect(() => {
    if (text === undefined) return;
    const timer = setTimeout(() => search(text), 250);
    return () => clearTimeout(timer);
  }, [search, text]);
  return [text, setText] as const;
};
