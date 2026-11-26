// The option lists of a session: a new one for each view of an async field, of
// the header or of a row, with the params at the address of its field. Each
// hears every publication while it has subscribers, and notifies its own as
// the session does: a failure is reported without stopping the others, and
// editing or resetting the session meanwhile throws.
import {
  definitionAt,
  endpointAt,
  fieldLabel,
  labelAt,
  templateLabel,
  type Field,
  type RowAddress,
} from "./address.js";
import type { Compiled } from "./compiled.js";
import type { FormDefinition } from "./definition.js";
import type { Loader, Scope } from "./endpoints.js";
import { fieldAt } from "./fields.js";
import { createOptionList } from "./lists.js";
import { notifyObserver, subscriber, type SessionState } from "./notify.js";
import { noParams } from "./param-memory.js";
import { holds } from "./tree.js";

// A form with async fields has a scope: sessionOptions checked it.
export const listsOf = <D extends FormDefinition>(
  state: SessionState<D>,
  compiled: Compiled,
  { scope, loader }: { readonly scope: Scope | undefined; readonly loader: Loader },
) => {
  const create = (address: Field, params: () => object | undefined) => {
    const endpoint = endpointAt(compiled.endpoints, address);
    if (endpoint === undefined) {
      const { type } = definitionAt(compiled.fields, address);
      const label =
        typeof address === "string"
          ? fieldLabel(address)
          : templateLabel(address.field, address.row.collection.name);
      throw new Error(`${label} (${type}) has no option list`);
    }
    return createOptionList({
      label: labelAt(address),
      endpoint,
      scope: scope as Scope,
      loader,
      params,
      watch: subscriber(state.lists),
      notify: (listener) => notifyObserver(state, listener),
    });
  };
  return {
    // A field of the header. A field of rows has its lists in the handle of
    // each row; a field of the header with the same name prevails. A field
    // without a params formula always sends {}.
    header: (name: string) => {
      if (fieldAt(compiled.fields, name) === undefined) throw unknownList(compiled, name);
      return create(
        name,
        ruled(compiled.observers, name) ? () => state.published.params.get(name) : () => noParams,
      );
    },
    // A field of a row, which the handle found; without its row, the list
    // suspends. The params of a formula exist while its row does, so they
    // tell it alone; a field without a formula sends {} while its row exists.
    row: (address: RowAddress) => {
      const { row, field } = address;
      return create(
        address,
        ruled(row.collection.params, field)
          ? () => state.published.params.get(address)
          : () => (holds(state.published.store.collections, row) ? noParams : undefined),
      );
    },
  };
};

// Whether a params formula gives the params of the async field name.
const ruled = (
  rules: readonly { readonly kind: string; readonly name?: string | undefined }[],
  name: string,
) => rules.some((rule) => rule.kind === "params" && rule.name === name);

const unknownList = (compiled: Compiled, name: string) => {
  for (const { name: collection, fields } of compiled.collections.values())
    if (fieldAt(fields, name) !== undefined)
      return new Error(
        `Field "${name}" belongs to the rows of "${collection}": use session.row("${collection}", key).list("${name}")`,
      );
  return new Error(`Unknown field "${name}"`);
};
