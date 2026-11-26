import { Link } from "../lib/router";
import { Entry } from "./ApiEntry";

// Rows in trama-forms/core: collections, their rules, session commands, and row handles.
export const RowsReference = () => (
  <>
    <Entry
      id="collections"
      signature={`collections: { [collection]: { fields: { [field]: field.… } } }
rules: { [collection]: { each?: { [field]: { value?, disabled?, readOnly?, hidden?, required?, label?, placeholder?, decimals?, min?, max?, states?, onChange?, onEdit?, params?, query?, relation? } }, row?, collection? } }
form: { readOnly: { value, except?: (field | { [collection]: fields[] })[] } }`}
    >
      <p>
        Each collection declares its row fields using the same field types as the header, including
        async. A name cannot appear in both <code>fields</code> and <code>collections</code>, and a
        section that can be <code>undefined</code> declares no collections.{" "}
        <code>rules[collection]</code> accepts <code>each</code> for field rules, with the
        properties of a header entry, and <code>row</code> and <code>collection</code> for scoped
        errors and warnings. Both remote field types support <code>params</code>, and{" "}
        <code>params</code> and <code>query</code> have the tools of a row formula. A form lock
        exception names fields in a collection and applies to all its rows. See{" "}
        <Link to="rows">Rows</Link>.
      </p>
    </Entry>

    <Entry
      id="row-rules"
      signature={`value: (row, { values, key, peek: { row, values }, context }) => value | undefined
disabled, readOnly, hidden, required, label, placeholder, decimals, min, max, states: (row, { values, key, peek, context }) => …
onChange: (row, { values, key, toDefaults, before, context }) => row patch | undefined
onEdit: (row, { values, key, toDefaults, before, context }) => row patch | undefined
before: { row, values }                                    // only in row events
params: (row, { values, key, peek, context }) => object | undefined
query: { endpoint, forPrepare?: boolean, params?: (row, { values, key, peek, context }) => object | undefined,
         patch?: (result, { row, values, key, context }) => row patch | undefined }
relation: { default: field, members: { [field]: (row, { values, key, peek, context }) => value | undefined } }

// In a header rule:
values.collection: row[]                                  // read-only
onChange: (values, { toDefaults, rows, before, context }) => patch | undefined
onEdit: (values, { toDefaults, rows, before, context }) => patch | undefined
rows.collection: RowKey[]                                  // keys, without reading values
patch: { [field]?: value, [collection]?: { [key]: { [field]?: value } } }`}
    >
      <p>
        A row rule receives its row, the form view, and its row key. It never receives its position.
        Its event writes to its own row. Reading a collection creates a dependency on membership and
        order, even if the rule only accesses a position that does not exist. Each row field read
        creates its own dependency. A row's <code>toDefaults</code> returns the row's default
        values. A header event writes to rows by key. An unknown key or a key from another
        collection or session makes the operation fail. A row query makes its own request and its{" "}
        <code>patch</code> writes only to its own row. See{" "}
        <Link to="async-in-rows" section="queries-per-line">
          Queries per line
        </Link>
        .
      </p>
      <p>
        Each row field declares at most one of <code>onChange</code> and <code>onEdit</code>. In
        both, <code>before.row</code> is the previous row by key, and <code>before.values</code>{" "}
        holds the previous form values, excluding rows added by the operation. Both are read-only
        and create no dependencies. <code>onEdit</code> runs only if the command changes its field,
        and its patch leaves values written by the command intact.
      </p>
      <p>
        Declare <code>relation</code> in the driver's entry under <code>each</code>. Both members
        belong to the same row, and their formulas can read the header through <code>values</code>.
        When the driver is empty, the member named by <code>default</code> keeps its value. See{" "}
        <Link to="relations">Relations</Link>.
      </p>
    </Entry>

    <Entry
      id="row-commands"
      signature={`session.getSnapshot().rows: { [collection]: RowKey[] }
session.add(collection, rows, { at? }): RowKey[]
session.remove(collection, keys): void
session.move(collection, key, position): void
session.patch(patch): void
session.row(collection, key): RowHandle`}
    >
      <ul>
        <li>
          <code>add</code> adds rows at the end or at <code>at</code>, from 0 to n, and returns
          their keys as a tuple if it receives a tuple. It checks the field names in each row at
          type-checking time. Supplied values take precedence over formulas. New rows never run
          their events.
        </li>
        <li>
          <code>remove</code> removes rows. A repeated key counts once. <code>move</code> moves a
          row to a position from 0 to n−1 and does not itself run the row's rules.
        </li>
        <li>
          <code>patch</code> writes header and row fields as an edit. It checks their names at
          type-checking time, including inside <code>Object.fromEntries</code>.
        </li>
        <li>
          Each command validates everything before applying anything, publishes once, and leaves no
          changes if it fails. It throws during a notification.
        </li>
      </ul>
    </Entry>

    <Entry
      id="row-handle"
      signature={`handle.collection, handle.key, handle.fields
handle.getSnapshot(): { values, fieldStates, resetVersion, queries, errors, externalErrors, warnings, errorCount, warningCount, dirty, attempted, touched } | undefined
handle.subscribe(listener: () => void): () => void
handle.edit(name, value): void
handle.list(name): OptionList                             // a view of an async or multiAsync field
handle.retry(name): void                                  // an entry with a query
handle.touch(name?): void                                 // a cell and its row, or the row
handle.input(name): { error(message?): void; dispose(): void }`}
    >
      <p>
        The row handle is the same object while the row exists and is tied to its key. Its snapshot
        includes the row's own messages, with external errors kept separate, its counts,{" "}
        <code>dirty</code>, <code>attempted</code> (whether the row existed at the last{" "}
        <code>prepare</code>), and <code>touched</code> (whether the row or any of its cells was
        touched). <code>touch</code> and <code>input</code> are the session operations for a cell.
        Removing the row invalidates its controllers. The snapshot keeps its identity as long as
        values, states, those messages, counts and markers, its query states, and{" "}
        <code>resetVersion</code> remain the same. It becomes <code>undefined</code> when the row no
        longer exists. Then <code>edit</code>, <code>list</code>, <code>retry</code>,{" "}
        <code>touch</code>, and <code>input</code> throw. If a reset restores the row, the handle
        works again. <code>list</code> creates a new list with each call, using the field's
        parameters for that row. <code>queries</code> holds the state of each row query,{" "}
        <code>{"{ status, error }"}</code>, and is the same frozen <code>{"{}"}</code> in a
        collection without queries. <code>retry</code> is a command, like <code>session.retry</code>
        . See <Link to="async-in-rows">Async in rows</Link>.
      </p>
    </Entry>
  </>
);
