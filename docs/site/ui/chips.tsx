import type { RefObject } from "react";
import type { MultiAsyncFieldProps } from "trama-forms/react";
import { keepFocus, leaving, moveTo, optionsOf, OptionsPanel, useListBox } from "./async-input";
import { describedBy, Label, optionKey, Notes } from "./inputs";

type Choice = MultiAsyncFieldProps["value"][number];

// The renderer for remote multi-select fields in this guide places a search box above the view's
// list, as in async-input.tsx, with the selected options below as chips. The list opens when
// the search box gains focus and stays open as each option is selected or deselected. The
// chips go below the list, so selecting an option does not move the options under the pointer.
export const Chips = (props: MultiAsyncFieldProps) => {
  const { id, name, label, readOnly, required, reasons, errors, warnings, onBlur } = props;
  const { box, ...combo } = useChips(props);
  return (
    <div
      className={readOnly ? "field combo readonly" : "field combo"}
      onBlur={leaving(combo.close, onBlur)}
    >
      <Label id={id} name={name} label={label} required={required} />
      <SearchBox {...props} box={box} combo={combo} />
      {combo.expanded && <Options {...props} box={box} combo={combo} />}
      <Chosen {...props} box={box} combo={combo} />
      <Notes id={id} errors={errors} warnings={warnings} reasons={reasons} />
    </div>
  );
};

// The list reflects the view's search and loaded results, independently of the value. Adding
// appends the option to the value, and removing filters it out. This preserves selected
// options outside the list.
const useChips = ({ value, disabled, readOnly, list, onChange }: MultiAsyncFieldProps) => {
  const editable = !disabled && !readOnly;
  const combo = useListBox(list, editable);
  // A field that stops being editable closes its list, as subfamilies do when no families
  // remain selected.
  if (combo.expanded && !editable) combo.close();
  const chosen = (option: Choice) => value.some((item) => item.value === option.value);
  const remove = (option: Choice) => onChange(value.filter((item) => item.value !== option.value));
  const toggle = (option: Choice) =>
    chosen(option) ? remove(option) : onChange([...value, option]);
  return { ...combo, editable, chosen, remove, toggle };
};

type ViewProps = MultiAsyncFieldProps & {
  box: RefObject<HTMLInputElement | null>;
  combo: Omit<ReturnType<typeof useChips>, "box">;
};

const SearchBox = (props: ViewProps) => {
  const { id, name, value, disabled, readOnly, required, list, onChange, box, combo } = props;
  return (
    <div className="combo-input">
      <input
        ref={box}
        id={id}
        name={name}
        type="text"
        role="combobox"
        autoComplete="off"
        aria-expanded={combo.expanded}
        aria-haspopup="dialog"
        aria-controls={combo.expanded ? `${id}-options` : undefined}
        value={combo.expanded ? (combo.typed ?? list.text) : ""}
        placeholder={hintOf(props)}
        disabled={disabled}
        readOnly={readOnly}
        aria-required={required}
        aria-invalid={props.errors.length > 0}
        aria-describedby={describedBy(id, props)}
        onFocus={combo.expand}
        onClick={combo.expand}
        onKeyDown={(event) => {
          if (event.key === "Escape") combo.close();
          if (event.key === "ArrowDown") moveTo(event, optionsOf(event.currentTarget)[0]);
        }}
        onChange={(event) => {
          combo.expand();
          combo.setTyped(event.currentTarget.value);
        }}
      />
      {value.length > 0 && combo.editable && (
        <button
          type="button"
          className="quiet"
          onMouseDown={keepFocus}
          onClick={() => onChange([])}
        >
          Remove all
        </button>
      )}
    </div>
  );
};

// With no selected options, the box shows the placeholder. With a selection, it prompts
// the user to search for another option.
const hintOf = ({ value, list, placeholder }: MultiAsyncFieldProps) => {
  if (list.status === "suspended") return "No options yet";
  return value.length === 0 ? placeholder : "Search for another";
};

// Each option on the page can be selected or deselected while the list stays open.
const Options = ({ id, name, label, list, box, combo }: ViewProps) => (
  <OptionsPanel
    id={`${id}-options`}
    title={`Options for ${label ?? name}`}
    list={list}
    box={box}
    pressed={combo.chosen}
    onChoose={combo.toggle}
    onClose={combo.closeHere}
  />
);

// The selected options come from the value, including those outside the current list page.
const Chosen = ({ name, label, value, combo }: ViewProps) =>
  value.length === 0 ? null : (
    <ul className="chips" aria-label={`Selected in ${label ?? name}`}>
      {value.map((option) => (
        <li key={optionKey(option)}>
          {option.label}
          {combo.editable && (
            <button
              type="button"
              aria-label={`Remove ${option.label}`}
              onMouseDown={keepFocus}
              onClick={() => combo.remove(option)}
            >
              ×
            </button>
          )}
        </li>
      ))}
    </ul>
  );
