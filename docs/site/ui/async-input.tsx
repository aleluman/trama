import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";
import type { AsyncFieldProps } from "trama-forms/react";
import { describedBy, Label, optionKey, Notes } from "./inputs";

type List = AsyncFieldProps["list"];
type Choice = List["options"][number];

// The renderer of async fields: a search box over the option list of its view. Closed, the
// box shows the label of the value. Open, it shows the search text of its view and the value
// moves to the placeholder. Every opening asks for page 1 again through the loader, whose
// cache decides whether to reach the server, with the search text the view keeps. While the
// field is disabled or read-only the box does not open, and the binding ignores onChange.
// chips.tsx reuses its opening, its list, its search and its keyboard navigation.
export const AsyncInput = (props: AsyncFieldProps) => {
  const { id, name, label, disabled, readOnly, required, reasons, list, onChange } = props;
  const { errors, warnings, onBlur } = props;
  const { box, expanded, typed, setTyped, expand, close, closeHere, choose } = useCombo(
    list,
    !disabled && !readOnly,
    onChange,
  );
  return (
    <div
      className={readOnly ? "field combo readonly" : "field combo"}
      onBlur={leaving(close, onBlur)}
    >
      <Label id={id} name={name} label={label} required={required} />
      <SearchBox
        {...props}
        box={box}
        expanded={expanded}
        text={typed ?? list.text}
        onExpand={expand}
        onClose={close}
        onType={(text) => {
          expand();
          setTyped(text);
        }}
      />
      {expanded && (
        <OptionsPanel
          id={`${id}-options`}
          title={`Options for ${label ?? name}`}
          list={list}
          box={box}
          pressed={(option) => option.value === props.value?.value}
          onChoose={choose}
          onClose={closeHere}
        />
      )}
      <Notes id={id} errors={errors} warnings={warnings} reasons={reasons} />
    </div>
  );
};

// Focus that leaves the field closes the list and touches it; leaving the window does not.
export const leaving =
  (close: () => void, touch: () => void) => (event: FocusEvent<HTMLDivElement>) => {
    if (!document.hasFocus() || event.currentTarget.contains(event.relatedTarget)) return;
    close();
    touch();
  };

type SearchBoxProps = AsyncFieldProps & {
  box: RefObject<HTMLInputElement | null>;
  expanded: boolean;
  text: string;
  onExpand: () => void;
  onClose: () => void;
  onType: (text: string) => void;
};
const SearchBox = (props: SearchBoxProps) => {
  const { id, name, value, disabled, readOnly, required, onChange } = props;
  const { box, expanded, text, onExpand, onClose, onType } = props;
  return (
    <div className="combo-input">
      <input
        ref={box}
        id={id}
        name={name}
        type="text"
        role="combobox"
        autoComplete="off"
        aria-expanded={expanded}
        aria-haspopup="dialog"
        aria-controls={expanded ? `${id}-options` : undefined}
        value={expanded ? text : (value?.label ?? "")}
        placeholder={hintOf(props)}
        disabled={disabled}
        readOnly={readOnly}
        aria-required={required}
        aria-invalid={props.errors.length > 0}
        aria-describedby={describedBy(id, props)}
        onFocus={onExpand}
        onClick={onExpand}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
          if (event.key === "ArrowDown") moveTo(event, optionsOf(event.currentTarget)[0]);
        }}
        onChange={(event) => onType(event.currentTarget.value)}
      />
      {value !== null && !disabled && !readOnly && (
        <button type="button" className="quiet" onClick={() => onChange(null)}>
          Remove
        </button>
      )}
    </div>
  );
};

// Open, the placeholder shows the value, since the box shows the search text.
const hintOf = ({ expanded, value, list, placeholder }: SearchBoxProps) => {
  if (expanded && value !== null) return value.label;
  return list.status === "suspended" ? "No options yet" : placeholder;
};

// Opening asks the list for page 1 again, with the search text the view keeps, and selects
// that text, so typing replaces it. Closing from inside the list returns the focus to the
// box, which is already open.
export const useListBox = (list: List, editable: boolean) => {
  const [expanded, setExpanded] = useState(false);
  const [typed, setTyped] = useDebouncedSearch(list.search);
  const box = useRef<HTMLInputElement>(null);
  const expand = () => {
    if (!editable || expanded) return;
    setExpanded(true);
    list.open();
  };
  // Once open, the box shows the search text of the view.
  useLayoutEffect(() => {
    if (expanded) box.current?.select();
  }, [expanded]);
  const close = () => {
    setExpanded(false);
    setTyped(undefined);
  };
  const closeHere = () => {
    box.current?.focus();
    close();
  };
  return { box, expanded, typed, setTyped, expand, close, closeHere };
};
// Choosing an option closes the list.
const useCombo = (list: List, editable: boolean, onChange: AsyncFieldProps["onChange"]) => {
  const combo = useListBox(list, editable);
  const choose = (option: Choice) => {
    onChange(option);
    combo.closeHere();
  };
  return { ...combo, choose };
};

// Searches 250 ms after the last key. undefined is no text of its own: the box shows the
// search text of the list.
const useDebouncedSearch = (search: List["search"]) => {
  const [text, setText] = useState<string>();
  useEffect(() => {
    if (text === undefined) return;
    const timer = setTimeout(() => search(text), 250);
    return () => clearTimeout(timer);
  }, [search, text]);
  return [text, setText] as const;
};

// A mouse press on the list keeps the focus in the box, so the list stays open.
export const keepFocus = (event: { preventDefault(): void }) => event.preventDefault();

// The options of the page of the view; pressed marks the chosen ones.
export const OptionsPanel = ({
  id,
  title,
  list,
  box,
  pressed,
  onChoose,
  onClose,
}: {
  id: string;
  title: string;
  list: List;
  box: RefObject<HTMLInputElement | null>;
  pressed: (option: Choice) => boolean;
  onChoose: (option: Choice) => void;
  onClose: () => void;
}) => (
  <dialog open id={id} className="combo-panel" aria-label={title}>
    {list.options.length > 0 && (
      <ul>
        {list.options.map((option) => (
          <li key={optionKey(option)}>
            <button
              type="button"
              aria-pressed={pressed(option)}
              onMouseDown={keepFocus}
              onKeyDown={(event) => navigate(event, box, onClose)}
              onClick={() => onChoose(option)}
            >
              {option.label}
            </button>
          </li>
        ))}
      </ul>
    )}
    <ListStatus list={list} />
  </dialog>
);

// Arrow keys move between the options and back to the box; Escape closes the list.
const navigate = (
  event: KeyboardEvent<HTMLButtonElement>,
  box: RefObject<HTMLInputElement | null>,
  onClose: () => void,
) => {
  if (event.key === "Escape") onClose();
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  const options = optionsOf(event.currentTarget);
  const next = options.indexOf(event.currentTarget) + (event.key === "ArrowDown" ? 1 : -1);
  moveTo(event, next < 0 ? box.current : options[next]);
};
export const optionsOf = (element: HTMLElement) => [
  ...(element.closest(".combo")?.querySelectorAll<HTMLButtonElement>(".combo-panel li button") ??
    []),
];
export const moveTo = (event: KeyboardEvent, target: HTMLElement | null | undefined) => {
  if (target === null || target === undefined) return;
  event.preventDefault();
  target.focus();
};

const ListStatus = ({ list }: { list: List }) => {
  if (list.status === "suspended")
    return <output className="muted">Fill in the fields this depends on first.</output>;
  if (list.status === "error")
    return (
      <div role="alert" className="error">
        <p>{list.error?.message}</p>
        <button type="button" onMouseDown={keepFocus} onClick={list.retry}>
          Retry
        </button>
      </div>
    );
  return (
    <div className="combo-status">
      <output className="muted">{summaryOf(list)}</output>
      {list.status === "ready" && !list.complete && (
        <button type="button" className="quiet" onMouseDown={keepFocus} onClick={list.more}>
          Load more
        </button>
      )}
    </div>
  );
};

const summaryOf = ({ status, options }: List) => {
  const count = options.length === 1 ? "1 option" : `${options.length} options`;
  if (status === "loading") return options.length === 0 ? "Loading…" : `${count} · loading…`;
  if (status !== "ready") return "";
  return options.length === 0 ? "No results." : count;
};
