import assert from "node:assert/strict";
import { test } from "node:test";
import { createForms, createSession, defineEndpoints, endpoint } from "trama-forms/core";
import { opened, scriptedLoader } from "./helpers/scripted-loader.mjs";
import { keysOf, rejects } from "./helpers/session.mjs";

// Header rules that read the rows of lines: the params of an async field and
// the query of a value, after each command. Sessions ask through the scripted
// loader, a mock: each request waits until the test settles it, and resolve()
// runs the endpoint's load as the direct loader does.
const scope = "acme";
const fail = (message) => {
  throw new Error(message);
};
const productsOf = (lines) => lines.map((line) => line.product);

// rules go to the form; the quote is 100 per product.
const setup = (rules) => {
  const catalog = defineEndpoints({
    contacts: endpoint.list(() => Promise.resolve([{ value: 1, label: "Ana" }])),
    quote: endpoint.value((_, { products }) => Promise.resolve(products.length * 100)),
  });
  const { defineForm, field } = createForms({ endpoints: [catalog] });
  const definition = defineForm({
    fields: {
      contact: field.async("contacts"),
      total: field.number(),
      check: field.number(),
      note: field.text(),
    },
    collections: {
      lines: {
        fields: {
          product: field.text(),
          quantity: field.number({ default: 1 }),
          amount: field.number(),
        },
      },
    },
    rules,
  });
  const { loader, calls } = scriptedLoader();
  const open = (lines = []) => createSession(definition, { scope, loader, initial: { lines } });
  // The requests of an endpoint, in the order they were made.
  const asked = (name) => calls.filter(({ key }) => key[2] === name);
  return { open, calls, asked };
};
const paramsOf = (requests) => requests.map(({ key }) => key[3]);
const abortedOf = (requests) => requests.map(({ signal }) => signal.aborted);
const queryOf = (session) => session.getSnapshot().queries.total;
const byProducts = ({ lines }) =>
  lines.length === 0 ? undefined : { products: productsOf(lines) };

test("The params of an async header field that read structure and a row field update after add, remove, move, and a row edit", () => {
  const { open, asked } = setup({
    contact: { params: ({ lines }) => ({ count: lines.length, products: productsOf(lines) }) },
  });
  const session = open([{ product: "a" }, { product: "b" }]);
  opened(session, "contact");
  const [a, b] = keysOf(session);
  const [c] = session.add("lines", [{ product: "c" }], { at: 0 });
  session.move("lines", c, 2);
  session.row("lines", a).edit("product", "z");
  session.remove("lines", [b]);
  session.patch({ lines: { [c]: { product: "y" } } });
  // A field of a row the params do not read, or of the header, asks nothing.
  session.row("lines", c).edit("quantity", 4);
  session.edit("note", "Another");
  const requests = asked("contacts");
  assert.deepEqual(paramsOf(requests), [
    { count: 2, products: ["a", "b"] },
    { count: 3, products: ["c", "a", "b"] },
    { count: 3, products: ["a", "b", "c"] },
    { count: 3, products: ["z", "b", "c"] },
    { count: 2, products: ["z", "c"] },
    { count: 2, products: ["z", "y"] },
  ]);
  assert.deepEqual(abortedOf(requests), [true, true, true, true, true, false]);
});

test("A header query whose params read the rows starts after add, renews after move or edit, and is canceled when the rows are removed", async () => {
  const { open, asked } = setup({ total: { query: { endpoint: "quote", params: byProducts } } });
  const session = open();
  assert.deepEqual([queryOf(session).status, asked("quote").length], ["idle", 0]);
  const [a, b] = session.add("lines", [{ product: "a" }, { product: "b" }]);
  assert.equal(queryOf(session).status, "pending");
  session.move("lines", b, 0);
  session.row("lines", a).edit("product", "z");
  assert.deepEqual(paramsOf(asked("quote")), [
    { products: ["a", "b"] },
    { products: ["b", "a"] },
    { products: ["b", "z"] },
  ]);
  session.remove("lines", [a, b]);
  assert.deepEqual(abortedOf(asked("quote")), [true, true, true]);
  assert.deepEqual([queryOf(session).status, session.getSnapshot().values.total], ["idle", null]);
  // A cancelled request writes nothing when it answers.
  const before = session.getSnapshot();
  await asked("quote")[2].resolve();
  assert.equal(session.getSnapshot(), before);
  session.add("lines", [{ product: "c" }]);
  await asked("quote")[3].resolve();
  assert.deepEqual([session.getSnapshot().values.total, queryOf(session).status], [100, "idle"]);
});

// A session with one line whose quote answers through patchOf(key, result),
// with the key of that line; it settles the request.
const answered = async (patchOf) => {
  let key;
  const patch = (result) => patchOf(key, result);
  const { open, asked } = setup({
    total: { query: { endpoint: "quote", params: byProducts, patch } },
  });
  const session = open([{ product: "a" }]);
  [key] = keysOf(session);
  const before = session.getSnapshot();
  await asked("quote")[0].resolve();
  return { session, before, asked };
};

test("A query patch that names a collection is rejected, setting the query to error without writing the header or rows", async () => {
  const message = 'Field "total" query: patches cannot write collection "lines"';
  const answers = await Promise.all(
    [
      () => ({ lines: {} }),
      () => ({ lines: undefined }),
      (key, result) => ({ total: result, lines: { [key]: { product: "x" } } }),
    ].map((patchOf) => answered(patchOf)),
  );
  for (const { session, before, asked } of answers) {
    const { values, rows, fieldStates } = session.getSnapshot();
    assert.equal(values, before.values);
    assert.equal(values.lines, before.values.lines);
    assert.equal(rows, before.rows);
    assert.equal(fieldStates, before.fieldStates);
    const { status, error } = queryOf(session);
    assert.equal(status, "error");
    assert.ok(error instanceof Error);
    assert.equal(error.message, message);
    // The session goes on: the next command asks again.
    session.add("lines", [{ product: "b" }]);
    assert.deepEqual([queryOf(session).status, asked("quote").length], ["pending", 2]);
  }
});

// The header refuses no lines, more than two or b first.
const checked = ({ lines }) => {
  if (lines.length === 0) fail("No lines");
  if (lines.length > 2) fail("Too many lines");
  if (lines[0].product === "b") fail("The first is b");
  return lines.length;
};
const amountOf = ({ quantity }) => (quantity < 0 ? fail("Negative quantity") : quantity);
const failed = (name, key, detail) =>
  `Field "${name}" of "lines" row "${key}" value: formula failed: ${detail}`;

test("A command rejected during validation or resolution leaves in-flight requests intact and starts none", async () => {
  const { open, calls, asked } = setup({
    contact: { params: byProducts },
    total: { query: { endpoint: "quote", params: byProducts } },
    check: { value: checked },
    lines: { each: { amount: { value: amountOf } } },
  });
  const session = open([{ product: "a" }, { product: "b" }]);
  const view = opened(session, "contact");
  const [a, b] = keysOf(session);
  const pending = [...calls];
  for (const [command, message] of [
    [
      () => session.add("lines", [{ product: "d" }, { origin: 1 }]),
      'Collection "lines" add[1]: unknown field "origin"',
    ],
    [() => session.move("lines", a, 2), 'Collection "lines" move: position 2 is out of range 0..1'],
    [() => session.remove("lines", [a, "r0"]), 'Collection "lines": unknown row key "r0"'],
    [
      () => session.add("lines", [{ product: "d" }]),
      'Field "check" value: formula failed: Too many lines',
    ],
    [() => session.remove("lines", [a, b]), 'Field "check" value: formula failed: No lines'],
    [() => session.move("lines", b, 0), 'Field "check" value: formula failed: The first is b'],
    [
      () => session.patch({ lines: { [a]: { product: "b" } } }),
      'Field "check" value: formula failed: The first is b',
    ],
    [
      () => session.patch({ lines: { [a]: { quantity: -1 } } }),
      failed("amount", a, "Negative quantity"),
    ],
    [() => session.row("lines", b).edit("quantity", -1), failed("amount", b, "Negative quantity")],
  ]) {
    rejects(session, command, message);
    assert.deepEqual([calls.length, ...abortedOf(pending)], [2, false, false]);
    assert.equal(queryOf(session).status, "pending");
  }
  await asked("quote")[0].resolve();
  await asked("contacts")[0].resolve();
  assert.deepEqual([session.getSnapshot().values.total, queryOf(session).status], [200, "idle"]);
  assert.deepEqual(view.getSnapshot().options, [{ value: 1, label: "Ana" }]);
});
