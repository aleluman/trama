// What the person leaves on a session through its views, touch and the
// pending input, and where the messages of its sources come in (see
// session-external.ts).
// - Touch marks a field of the header, a cell or a row. The engine derives the
//   mark of a field into its state; the session keeps the rows touched,
//   themselves or through a cell, which their snapshots read. A repeated
//   touch publishes nothing.
// - A view that could not convert its text into a value reports a message
//   with its own controller. The messages of a field, in the order its views
//   were created, are among its errors and make the form inputPending,
//   without dirtying it. The text stays with the view.
// A reset clears the marks and disposes every controller, and removing a row,
// those of its cells.
import type { Field, Row, RowAddress } from "./address.js";
import type { Compiled } from "./compiled.js";
import { describe } from "./data.js";
import type { FormDefinition } from "./definition.js";
import type { Engine, Publication } from "./engine.js";
import type { InputView } from "./handles.js";
import { notifyListeners, type SessionState } from "./notify.js";
import { externals, headerField } from "./session-external.js";
import { holds } from "./tree.js";

type Owner = {
  readonly address: Field;
  readonly born: number;
  message: string | undefined;
  disposed: boolean;
};
// What the views of a session share: the reset version, whether a row still
// exists, how the messages of an address publish, and the views of each
// field of the header and of each cell, in creation order; those of a removed
// row go with it.
type Views = {
  readonly guard: (operation: string) => void;
  readonly version: () => number;
  readonly exists: (row: Row) => boolean;
  readonly publish: (address: Field, messages: readonly string[]) => void;
  readonly header: Map<string, Owner[]>;
  readonly cells: WeakMap<RowAddress, Owner[]>;
};

export const marking = <D extends FormDefinition>(
  state: SessionState<D>,
  compiled: Compiled,
  engine: Engine<D>,
  guard: (operation: string) => void,
  operate: (publication: Publication<D>) => void,
) => {
  const publish = (publication: Publication<D> | undefined) => {
    if (publication !== undefined) operate(publication);
  };
  const views: Views = {
    guard,
    version: () => state.snapshot.resetVersion,
    exists: (row) => holds(state.published.store.collections, row),
    publish: (address, messages) => publish(engine.input(address, messages)),
    header: new Map(),
    cells: new WeakMap(),
  };
  return {
    // What the sources of the application give from outside the rules.
    external: externals(state, compiled, engine, guard, operate),
    header: {
      touch: (name: unknown) => {
        guard("touch");
        publish(engine.touch(headerField(compiled, "touch", name)));
      },
      input: (name: unknown) => viewOf(views, headerField(compiled, "input", name)),
    },
    // What the handles take, for a row and the cells they checked.
    row: {
      touch: (row: Row, address: RowAddress | undefined) => {
        const marked = !state.touched.rows.has(row);
        if (marked) {
          state.touched.rows.add(row);
          state.touched.version += 1;
        }
        const publication = address && engine.touch(address);
        if (publication !== undefined) operate(publication);
        else if (marked) notifyListeners(state);
      },
      touched: (row: Row) => state.touched.rows.has(row),
      touchVersion: () => state.touched.version,
      input: (address: RowAddress) => viewOf(views, address),
    },
  };
};

// A field of the header, which touch and input name in their diagnostic.
// How the diagnostics of a view name it.
const labelOf = (address: Field) =>
  typeof address === "string"
    ? `input of ${describe(address)}`
    : `Collection "${address.row.collection.name}": input of ${describe(address.field)}`;

const ownersOf = (views: Views, address: Field) => {
  let found = typeof address === "string" ? views.header.get(address) : views.cells.get(address);
  if (found !== undefined) return found;
  found = [];
  if (typeof address === "string") views.header.set(address, found);
  else views.cells.set(address, found);
  return found;
};
// A view lives until it is disposed, a reset or the removal of its row.
const live = (views: Views, { address, born, disposed }: Owner) =>
  !disposed &&
  born === views.version() &&
  (typeof address === "string" || views.exists(address.row));

// The controller of a view. Its message changes only once the engine accepted
// the messages of its field, so a failure leaves it as it was.
const viewOf = (views: Views, address: Field): InputView => {
  const label = labelOf(address);
  const owner: Owner = { address, born: views.version(), message: undefined, disposed: false };
  const owners = ownersOf(views, address);
  // The views of an earlier reset leave.
  if (owners[0] !== undefined && owners[0].born !== owner.born) owners.length = 0;
  owners.push(owner);
  return Object.freeze({
    error: (message?: string) => {
      views.guard("report input to");
      if (!live(views, owner)) throw new Error(`${label}: the view was disposed`);
      if (message !== undefined && (typeof message !== "string" || message === ""))
        throw new Error(`${label}: message must be a non-empty string or undefined`);
      if (owner.message === message) return;
      report(views, owner, message);
      owner.message = message;
    },
    dispose: () => {
      views.guard("report input to");
      if (!live(views, owner)) return;
      if (owner.message !== undefined) report(views, owner);
      owner.disposed = true;
      owners.splice(owners.indexOf(owner), 1);
    },
  });
};

// The engine takes the messages of the live views of the address of owner,
// with its new message.
const report = (views: Views, owner: Owner, message?: string) => {
  const messages: string[] = [];
  for (const other of ownersOf(views, owner.address)) {
    if (!live(views, other)) continue;
    const own = other === owner ? message : other.message;
    if (own !== undefined) messages.push(own);
  }
  views.publish(owner.address, messages);
};
