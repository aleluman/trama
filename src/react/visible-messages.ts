// Which errors a binding shows. The local ones by its policy: with "touched",
// the default, those of a field once it is touched or after an attempt of its
// scope, the form for the header and its row for a cell; with "attempted",
// only after the attempt. The own errors of a row show as those of a field,
// with the row touched when it or one of its cells is; those of a collection
// or of the form, after the attempt. The external ones show always, after the
// local ones, each text once, and so do the warnings. The visible list keeps
// the one held while it has the same texts.
export type ShowErrors = "touched" | "attempted";
type Messages = {
  readonly errors: readonly string[];
  readonly externalErrors: readonly string[];
};

const none: readonly string[] = Object.freeze([]);
export const visibleErrors = (
  { errors, externalErrors }: Messages,
  shown: boolean,
  held: readonly string[] | undefined,
) => {
  const local = shown && errors.length > 0 ? errors : none;
  const visible = externalErrors.length === 0 ? local : joined(local, externalErrors);
  return held !== undefined && sameItems(held, visible) ? held : visible;
};
// The local errors and then the external ones, each text once: one of them
// when the other adds nothing.
const joined = (local: readonly string[], external: readonly string[]) => {
  if (local.length === 0) return external;
  const added = external.filter((text) => !local.includes(text));
  return added.length === 0 ? local : Object.freeze([...local, ...added]);
};
const sameItems = (a: readonly string[], b: readonly string[]) =>
  a === b || (a.length === b.length && a.every((text, index) => text === b[index]));
// Whether a scope shows its local errors: touched counts only with "touched".
export const showsErrors = (policy: ShowErrors, touched: boolean, attempted: boolean) =>
  attempted || (policy === "touched" && touched);
