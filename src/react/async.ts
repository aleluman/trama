import { useMemo, useState, useSyncExternalStore, type ComponentType } from "react";
import { jsx } from "react/jsx-runtime";
import type { Option, OptionList } from "../core/index.js";
import type { CommonFieldProps } from "./props.js";

// Creates the option list of its view, from the session or from the handle of
// a row, which only a field that is not hidden has, and adds it to the props
// of the renderer with actions that keep their identity.
export const AsyncField = ({
  renderer,
  lists,
  ...props
}: CommonFieldProps<unknown> & {
  readonly renderer: ComponentType<CommonFieldProps<unknown>>;
  readonly lists: (name: string) => OptionList<Option>;
}) => {
  const [list] = useState(() => lists(props.name));
  const snapshot = useSyncExternalStore(list.subscribe, list.getSnapshot);
  const view = useMemo(
    () =>
      Object.freeze({
        ...snapshot,
        open: list.open,
        search: list.search,
        more: list.more,
        retry: list.retry,
      }),
    [list, snapshot],
  );
  return jsx(renderer, { ...props, list: view } as CommonFieldProps<unknown>);
};
