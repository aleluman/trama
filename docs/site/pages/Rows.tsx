import { Example } from "../lib/Example";
import { Link } from "../lib/router";
import { Snippet } from "../lib/Snippet";

export const Rows = () => (
  <>
    <h1>Rows</h1>
    <p className="lead">
      A form declares its row collections alongside its fields. An order has lines with the same
      fields on each line. Each row has an opaque key that the session assigns and never reuses,
      distinct from its position and its persisted ID. Moving a row does not edit it, and reset
      restores the original rows with their keys.
    </p>
    <Snippet>{`const order = defineForm({
  fields: { rate: field.number({ default: 1 }), total: field.number() },
  collections: {
    lines: { fields: { quantity: field.number({ default: 1 }), price: field.number(), amount: field.number() } },
  },
  rules: {
    total: { value: ({ lines }) => lines.reduce((sum, line) => sum + (line.amount ?? 0), 0) },
    lines: {
      each: {
        amount: { value: ({ quantity, price }, { values }) => (quantity ?? 0) * (price ?? 0) * (values.rate ?? 1) },
      },
    },
  },
});

const session = createSession(order, { initial: { lines: [{ quantity: 2, price: 10 }] } });
const [key] = session.add("lines", [{ price: 30 }], { at: 0 });
session.row("lines", key).edit("quantity", 3);
session.getSnapshot().rows.lines; // the keys, in visual order`}</Snippet>

    <h2 id="collections-and-values">Collections and values</h2>
    <ul>
      <li>
        <code>{"collections: { lines: { fields: { … } } }"}</code> declares each collection with its
        row fields, which have the same types as header fields. See{" "}
        <Link to="async-in-rows">Async in rows</Link> for async fields. A name can appear only once
        across <code>fields</code> and <code>collections</code>.
      </li>
      <li>
        <code>snapshot.values.lines</code> is an array of row records in visual order, with plain
        data and no keys. <code>snapshot.rows.lines</code> holds the keys in the same order, and{" "}
        <code>snapshot.fieldStates.lines</code> holds the state of each row. Each array keeps its
        identity as long as its rows and their order stay the same. Each record keeps its identity
        as long as its row stays the same. A form without collections publishes{" "}
        <code>{"rows: {}"}</code>.
      </li>
      <li>
        <code>initial</code> supplies partial rows. Omitted fields take their default values. An
        omitted collection starts empty.
      </li>
    </ul>

    <h2 id="row-rules">Row rules</h2>
    <ul>
      <li>
        <code>rules.lines.each</code> names row fields with the same properties as a header entry.{" "}
        <code>params</code> is available only on async fields, and <code>query</code> runs a query
        in each row (see{" "}
        <Link to="async-in-rows" section="queries-per-line">
          Queries per line
        </Link>
        ). Each row runs its own instance. The <code>lines</code> entry takes its place in{" "}
        <code>rules</code> for precedence, like any other entry.
      </li>
      <li>
        A row formula receives its row and{" "}
        <code>{"{ values, key, peek: { row, values }, context }"}</code>, giving it a view of the
        form and its row key. It never receives the row's position. A row event receives{" "}
        <code>{"{ values, key, toDefaults, context }"}</code> and returns a patch to its own row.{" "}
        <code>toDefaults</code> provides the row's default values.
      </li>
      <li>
        A header rule reads each collection as a read-only array of rows. Reading the collection
        creates a dependency on membership and order, even if the rule only reads a position that
        does not exist yet, such as <code>lines[0]</code> in an empty collection. Each field read in
        each row creates its own dependency. A row rule that reads a field from every row runs again
        in every row whenever that field changes in any row.
      </li>
      <li>
        A header event also receives <code>rows</code>, with the keys of each collection, and writes
        to rows with a patch nested by collection and key, without a wildcard.{" "}
        <code>{"{ lines: Object.fromEntries(rows.lines.map((key) => [key, { … }])) }"}</code>.
        Reading the keys accesses no values, so the event does not depend on what it writes.
      </li>
    </ul>
    <Example
      id="header-and-lines"
      title="Header and lines"
      files={["examples/rows/header.tsx", "examples/rows/order.ts"]}
      wide
      steps={[
        "Enter 2 in “Rate”. The line amounts double to 480 and 800, and the total becomes 1,280.",
        "Select “North” in “Default warehouse”. The header event writes the warehouse of both lines, and the event in each line clears its lot in a cascade. Both lines now have “North” as their warehouse and an empty lot.",
        "“Branch” stays disabled while there are lines. Click “Remove all” to enable it and return the total to 0. “Add line” disables it again.",
        "Click “Send order”. A new session opens from the initial values, with the context of a sent order. Everything becomes read-only except the header notes and each line's notes.",
      ]}
    >
      <p>
        The lot is declared before the warehouse that clears it. The cascade from the header returns
        once to each row, without rerunning the earlier rows.
      </p>
    </Example>

    <h2 id="commands">Commands</h2>
    <ul>
      <li>
        <code>{"session.add(lines, rows, { at })"}</code> adds rows at the end or at a position from
        0 to n and returns their keys. Supplied values take precedence over formulas for those
        fields. The new rows run their formulas, and none of them runs its events.
      </li>
      <li>
        <code>session.remove(lines, keys)</code> removes rows and counts repeated keys once.{" "}
        <code>session.move(lines, key, to)</code> moves a row to a position from 0 to n−1. The move
        itself does not run the row's rules. It runs only the rules that read the whole collection.
      </li>
      <li>
        <code>session.patch(patch)</code> writes header and row fields together, as an edit.
        Formulas and events can overwrite the supplied values.
      </li>
      <li>
        Each command is one operation. It validates the whole command before applying anything,
        publishes once, and leaves no trace if a rule fails. You can compose these commands to
        duplicate rows, add rows, or repeat a value across all rows.
      </li>
    </ul>

    <h2 id="react">Handles and React</h2>
    <ul>
      <li>
        <code>session.row(lines, key)</code> returns the row's handle with <code>getSnapshot</code>,{" "}
        <code>subscribe</code>, and <code>edit</code>. It returns the same object for as long as the
        row exists. Once the row is removed, <code>getSnapshot()</code> returns{" "}
        <code>undefined</code> and <code>edit</code> throws.
      </li>
      <li>
        <code>{"<Field row={handle} name>"}</code> renders a row field with the same renderer
        registry. If the row disappears, it renders nothing. <code>useRows(session, lines)</code>{" "}
        returns the keys, which stay the same when you write values.
      </li>
      <li>
        <code>handle.touch(name)</code> marks a cell and its row, and <code>handle.touch()</code>{" "}
        marks the row. <code>handle.input(name)</code> returns the controller for a cell view's
        pending input. <code>ui.useFormState(handle)</code> returns the row's state (see{" "}
        <Link to="react" section="use-form-state">
          useFormState
        </Link>
        ).
      </li>
    </ul>
    <Example
      id="line-table-and-modal"
      title="Line table and modal"
      files={["examples/rows/lines.tsx", "examples/rows/order.ts"]}
      wide
      steps={[
        "Click “Add at start”. An empty line appears at the top, and the other lines keep their values. “Add at end” adds one at the bottom.",
        "Click “Duplicate” on line L-1. A copy appears below it with the same product and quantity, an empty ID, and a calculated amount.",
        "Click “Move down” and “Move up”. Each line moves with its values.",
        "Select two lines and click “Remove selected (2)”. One command removes both lines.",
        "Click “Open” on a line, change the quantity in the modal, and click “Close”. The table already shows the new quantity and amount because both views use the same handle.",
      ]}
    />

    <h2 id="identity-and-reset">Identity and reset</h2>
    <ul>
      <li>
        The key identifies the row regardless of its position. Rules, state, and handles follow the
        row when it moves, and evaluation follows creation order.
      </li>
      <li>
        <code>reset()</code> restores the baseline rows with their keys, order, values, and handles.
        Added rows disappear and their keys are never used again.
      </li>
      <li>
        After <code>commit</code>, the prepared rows become the baseline with the same handles,
        including rows added before preparation or removed while saving. Canonical values for a row
        are keyed by its row key, which <code>prepared.rows</code> provides. See{" "}
        <Link to="submission" section="commit">
          Submission
        </Link>
        .
      </li>
    </ul>
    <Example
      id="move-correct-and-reset"
      title="Move, correct, and reset"
      files={["examples/rows/identity.tsx"]}
      steps={[
        "Click “Move down” on the first line. The order of rows.lines changes, and none of the amount counters increases because moving a row does not run its rules.",
        "Change a line's quantity. Only its counter increases.",
        "Click “Correct price and note”. A session patch changes the first line's price and the header note together.",
        "Click “Add line”, remove another line, and click “Reset”. The three original lines return with the same keys and order, the added line disappears, and resetVersion increases.",
      ]}
    />

    <p>
      The limits of this release, such as writes between sibling rows, are in{" "}
      <Link to="errors">Errors and limits</Link>.
    </p>
  </>
);
