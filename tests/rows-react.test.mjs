import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";
import { createReactBinding } from "trama-forms/react";
import { act, createElement as h, mount } from "./helpers/react.mjs";
import {
  Boundary,
  Modal,
  Table,
  cell,
  instrumented,
  linesOf,
  opened,
  order,
  shown,
  type,
  visual,
} from "./helpers/rows-react.mjs";
import { keysOf } from "./helpers/session.mjs";

const lineNames = ["product", "quantity", "price", "amount"];
const editNames = ["quantity", "price"];
const lotNames = ["quantity", "lot"];
const pricedNames = ["product", "price", "lot"];

test("Field row shows its row's values and its renderer edits the row in the session", async () => {
  const { Field } = instrumented();
  const session = createSession(order, {
    initial: {
      rate: 2,
      lines: [
        { product: "Table", price: 10 },
        { product: "Chair", price: 3 },
      ],
    },
  });
  const [, second] = keysOf(session);
  const view = await mount(() =>
    h(Modal, { Field, line: session.row("lines", second), names: lineNames }),
  );
  try {
    assert.deepEqual(shown(view, `modal-${second}`, lineNames), ["Chair", "1", "3", "6"]);
    await type(cell(view, `modal-${second}`, "quantity"), "4");
    assert.deepEqual(
      linesOf(session).map(({ quantity, amount }) => [quantity, amount]),
      [
        [1, 20],
        [4, 24],
      ],
    );
    assert.equal(session.getSnapshot().values.total, 44);
    assert.deepEqual(shown(view, `modal-${second}`, lineNames), ["Chair", "4", "3", "24"]);
    await act(() => session.patch({ lines: { [second]: { product: "Bench" } } }));
    assert.equal(cell(view, `modal-${second}`, "product").value, "Bench");
  } finally {
    await view.unmount();
  }
});

test("A useRows table and a modal with the same handle show the same row, and an edit in either appears in the other", async () => {
  const { Field } = instrumented();
  const session = opened([
    { product: "Table", price: 10 },
    { product: "Chair", price: 3 },
  ]);
  const [first, second] = keysOf(session);
  assert.equal(session.row("lines", second), session.row("lines", second));
  const view = await mount(() =>
    h(
      "div",
      null,
      h(Table, { Field, session, names: lineNames }),
      h(Modal, { Field, line: session.row("lines", second), names: editNames }),
    ),
  );
  try {
    assert.deepEqual(shown(view, `modal-${second}`, editNames), shown(view, second, editNames));
    await type(cell(view, `modal-${second}`, "quantity"), "5");
    assert.deepEqual(shown(view, second, lineNames), ["Chair", "5", "3", "15"]);
    assert.deepEqual(shown(view, first, lineNames), ["Table", "1", "10", "10"]);
    await type(cell(view, second, "price"), "4");
    assert.deepEqual(shown(view, `modal-${second}`, editNames), ["5", "4"]);
    assert.deepEqual(linesOf(session)[1], {
      product: "Chair",
      quantity: 5,
      price: 4,
      amount: 20,
      lot: "",
    });
  } finally {
    await view.unmount();
  }
});

test("useRows preserves its array on row and header field edits, and the table rerenders only on add, move, or remove", async () => {
  const { Field } = instrumented();
  const session = opened([
    { product: "Table", price: 10 },
    { product: "Chair", price: 3 },
  ]);
  const [first, second] = keysOf(session);
  const commits = [];
  const view = await mount(() => h(Table, { Field, session, names: lineNames, commits }));
  try {
    commits.length = 0;
    await type(cell(view, first, "quantity"), "3");
    await act(() => session.edit("rate", 2));
    await act(() => session.patch({ lines: { [second]: { price: 7 } } }));
    assert.deepEqual(commits, [], "Editing values does not render the table");
    assert.deepEqual(
      [cell(view, first, "amount").value, cell(view, second, "amount").value],
      ["60", "14"],
    );
    let added;
    await act(() => {
      [added] = session.add("lines", [{ product: "Bench" }]);
    });
    await act(() => session.move("lines", added, 0));
    await act(() => session.move("lines", added, 0));
    await act(() => session.remove("lines", [first]));
    assert.deepEqual(commits, [
      [first, second, added],
      [added, first, second],
      [added, second],
    ]);
    assert.equal(commits.at(-1), keysOf(session));
    assert.deepEqual(visual(view), [added, second]);
  } finally {
    await view.unmount();
  }
});

test("A Field whose row was removed renders nothing without throwing, stays subscribed, and receives its baseline row again on reset", async () => {
  const { Field } = instrumented();
  const session = opened([{ product: "Table" }, { product: "Chair" }]);
  const [first] = keysOf(session);
  const [added] = session.add("lines", [{ product: "Bench" }]);
  const errors = [];
  const modals = [first, added].map((key) => session.row("lines", key));
  const view = await mount(() =>
    h(
      Boundary,
      { errors },
      modals.map((line) => h(Modal, { key: line.key, Field, line, names: editNames })),
    ),
  );
  const fields = () =>
    [...view.container.querySelectorAll("dialog")].map((modal) => modal.childElementCount);
  try {
    assert.deepEqual(fields(), [2, 2]);
    await act(() => session.remove("lines", [first, added]));
    assert.deepEqual([modals[0].getSnapshot(), modals[1].getSnapshot()], [undefined, undefined]);
    assert.deepEqual(fields(), [0, 0]);
    await act(() => session.edit("rate", 3));
    assert.deepEqual(fields(), [0, 0]);
    await act(() => session.reset());
    assert.deepEqual(
      fields(),
      [2, 0],
      "The baseline row comes back with its handle; the added one does not",
    );
    assert.deepEqual(errors, []);
  } finally {
    await view.unmount();
  }
});

test("Reset remounts row renderers and editing preserves their mounts", async () => {
  const { Field, counts } = instrumented();
  const session = opened([{ product: "Table", quantity: 2 }]);
  const [first] = keysOf(session);
  const view = await mount(() =>
    h(Modal, { Field, line: session.row("lines", first), names: lineNames }),
  );
  try {
    assert.equal(counts.mounts, 4);
    await type(cell(view, `modal-${first}`, "product"), "Chair");
    await act(() => session.edit("rate", 3));
    assert.equal(counts.mounts, 4);
    await act(() => session.reset());
    assert.equal(counts.mounts, 8);
    assert.deepEqual(shown(view, `modal-${first}`, lineNames), ["Table", "2", "", "0"]);
  } finally {
    await view.unmount();
  }
});

// The lot each row shows, undefined where it is not rendered.
const lots = (view, keys) => keys.map((key) => cell(view, key, "lot")?.value);

test("A rule hides a row field only in its own row, and the field reappears with its current value", async () => {
  const { Field } = instrumented();
  const session = opened([
    { quantity: 0, lot: "A" },
    { quantity: 2, lot: "B" },
  ]);
  const [first, second] = keysOf(session);
  const view = await mount(() => h(Table, { Field, session, names: lotNames }));
  try {
    assert.deepEqual(lots(view, [first, second]), [undefined, "B"]);
    await type(cell(view, first, "quantity"), "1");
    await type(cell(view, second, "quantity"), "0");
    assert.deepEqual(lots(view, [first, second]), ["A", undefined]);
    await act(() => session.patch({ lines: { [second]: { lot: "C" } } }));
    await type(cell(view, second, "quantity"), "3");
    assert.deepEqual(lots(view, [first, second]), ["A", "C"]);
  } finally {
    await view.unmount();
  }
});

const nothing = () => null;

test("The binding requires renderers for collection fields when opening a session and connecting a Field", async () => {
  const { Field, useFormSession } = createReactBinding({
    text: nothing,
    number: nothing,
    select: undefined,
  });
  const uncovered = defineForm({
    fields: { notes: field.text() },
    collections: {
      lines: {
        fields: {
          quantity: field.number(),
          warehouse: field.select({ options: [{ value: "north", label: "North" }] }),
        },
      },
    },
  });
  const message = 'Field "warehouse" of "lines" (select): missing renderer';
  await assert.rejects(
    mount(() => {
      useFormSession(uncovered);
      return null;
    }),
    { message },
  );
  const session = createSession(uncovered, { initial: { lines: [{}] } });
  const line = session.row("lines", keysOf(session)[0]);
  await assert.rejects(
    mount(() => h(Field, { row: line, name: "quantity" })),
    { message },
  );
  await assert.rejects(
    mount(() => h(Field, { session, name: "notes" })),
    { message },
  );
});

test("The binding ignores a row field renderer's onChange when the field is readOnly by a row rule or lock, and the handle can still write", async () => {
  const { Field } = instrumented();
  const session = opened([
    { product: "Gift", price: 0 },
    { product: "Table", price: 10 },
  ]);
  const [gift, table] = keysOf(session);
  const view = await mount(() => h(Table, { Field, session, names: pricedNames }));
  try {
    assert.deepEqual(
      [cell(view, gift, "price").readOnly, cell(view, table, "price").readOnly],
      [true, false],
    );
    await type(cell(view, gift, "price"), "5");
    await type(cell(view, table, "price"), "4");
    assert.deepEqual(
      linesOf(session).map(({ price }) => price),
      [0, 4],
    );
    await act(() => session.edit("sent", true));
    assert.equal(cell(view, table, "price").readOnly, true);
    await type(cell(view, table, "price"), "8");
    await type(cell(view, table, "lot"), "L-1");
    assert.deepEqual([linesOf(session)[1].price, linesOf(session)[1].lot], [4, "L-1"]);
    await act(() => session.row("lines", table).edit("price", 8));
    assert.equal(linesOf(session)[1].price, 8);
  } finally {
    await view.unmount();
  }
});
