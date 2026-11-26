import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createForms,
  createSession,
  defineEndpoints,
  defineForm,
  endpoint,
  field,
} from "trama-forms/core";
import { together } from "./helpers/rows-queries.mjs";
import { scriptedLoader } from "./helpers/scripted-loader.mjs";

test("the header only fills an empty previous address, and the command takes precedence when restoring it", () => {
  const session = createSession(
    defineForm({
      fields: { customer: field.text(), address: field.text() },
      rules: {
        customer: {
          onEdit: ({ customer }, tools) => {
            assert.ok(Object.keys(tools).includes("before"));
            assert.ok(Object.isFrozen(tools));
            assert.ok(Object.isFrozen(tools.before));
            return tools.before.address === "" ? { address: `Address: ${customer}` } : undefined;
          },
        },
      },
    }),
  );
  session.edit("customer", "Ana");
  assert.deepEqual(session.getSnapshot().values, { customer: "Ana", address: "Address: Ana" });
  session.edit("customer", "Luis");
  assert.deepEqual(session.getSnapshot().values, { customer: "Luis", address: "Address: Ana" });
  session.reset();
  session.patch({ customer: "Ana", address: "Saved" });
  assert.deepEqual(session.getSnapshot().values, { customer: "Ana", address: "Saved" });
});

test("reading the event target in before does not create a cycle", () => {
  const session = createSession(
    defineForm({
      fields: { trigger: field.number(), note: field.text({ default: "start" }) },
      rules: { trigger: { onEdit: (_, { before }) => ({ note: `${before.note}!` }) } },
    }),
  );
  session.edit("trigger", 1);
  assert.equal(session.getSnapshot().values.note, "start!");
  session.edit("note", "new");
  assert.equal(session.getSnapshot().values.note, "new");
  session.edit("trigger", 2);
  assert.equal(session.getSnapshot().values.note, "new!");
});

const structureSession = () => {
  return createSession(
    defineForm({
      fields: { log: field.text(), count: field.number() },
      collections: {
        lines: { fields: { id: field.text(), first: field.text(), log: field.text() } },
      },
      rules: {
        count: {
          value: ({ lines }) => lines.length,
          onChange: ({ lines }, { before, rows }) => ({
            log: `${before.lines.map(({ id }) => id)}:${lines.length}:${rows.lines.length}`,
          }),
        },
        lines: {
          each: {
            first: {
              value: (_, { values }) => values.lines[0]?.id ?? "",
              onChange: ({ first }, { before }) => {
                assert.ok(Object.isFrozen(before));
                assert.ok(Object.isFrozen(before.row));
                assert.ok(Object.isFrozen(before.values.lines));
                assert.ok(before.values.lines.includes(before.row));
                return {
                  log: `${before.row.first}:${before.values.lines.map(({ id }) => id)}>${first}`,
                };
              },
            },
          },
        },
      },
    }),
    { initial: { lines: [{ id: "A" }, { id: "B" }] } },
  );
};

test("a row retains its record and the previous order when rows are moved, added, and removed", () => {
  const session = structureSession();
  const [, second] = session.getSnapshot().rows.lines;
  session.move("lines", second, 0);
  assert.deepEqual(
    session.getSnapshot().values.lines.map(({ log }) => log),
    ["A:A,B>B", "A:A,B>B"],
  );
  const [added] = session.add("lines", [{ id: "C" }], { at: 0 });
  assert.equal(session.getSnapshot().values.log, "B,A:3:3");
  assert.deepEqual(
    session.getSnapshot().values.lines.map(({ log }) => log),
    ["", "B:B,A>C", "B:B,A>C"],
  );
  session.remove("lines", [added]);
  assert.equal(session.getSnapshot().values.log, "C,B,A:2:2");
  assert.deepEqual(
    session.getSnapshot().values.lines.map(({ log }) => log),
    ["C:C,B,A>B", "C:C,B,A>B"],
  );
});

test("both commit passes read their own previous values", async () => {
  const session = createSession(
    defineForm({
      fields: { note: field.text(), trigger: field.text(), log: field.text() },
      rules: {
        trigger: { onChange: ({ trigger }, { before }) => ({ log: `${before.note}:${trigger}` }) },
      },
    }),
    { initial: { note: "prepared" } },
  );
  const sent = await session.prepare();
  session.edit("note", "live");
  session.commit(sent, { trigger: "confirmed" });
  assert.equal(session.getSnapshot().values.log, "live:confirmed");
  session.reset();
  assert.equal(session.getSnapshot().values.log, "prepared:confirmed");
});

const fallbackForm = () => {
  const endpoints = defineEndpoints({ reply: endpoint.value(() => Promise.resolve(true)) });
  const forms = createForms({ endpoints: [endpoints] });
  return forms.defineForm({
    fields: {
      first: field.checkbox(),
      second: field.checkbox(),
      note: field.text({ default: "start" }),
      report: field.text(),
    },
    collections: {
      lines: { fields: { note: field.text(), trigger: field.checkbox(), report: field.text() } },
    },
    rules: {
      first: {
        query: {
          endpoint: "reply",
          params: () => ({ request: "first" }),
          patch: () => ({ first: true, note: "First" }),
        },
        onChange: ({ second }) => {
          if (second) throw new Error("Separate responses");
        },
      },
      second: {
        query: { endpoint: "reply", params: () => ({ request: "second" }) },
        onChange: ({ note }, { before }) => ({ report: `${before.note}>${note}` }),
      },
      note: { onEdit: () => ({ report: "This is not a direct edit" }) },
      lines: {
        each: {
          note: { value: (_, { values }) => values.note },
          trigger: {
            value: (_, { values }) => values.second,
            onChange: ({ note }, { before }) => ({
              report: `${before.row.note}/${before.values.note}>${note}`,
            }),
          },
        },
      },
    },
  });
};

test("a response without fallback sees the previous header and row values", async () => {
  const { loader, calls } = scriptedLoader();
  const session = createSession(fallbackForm(), {
    loader,
    scope: "test",
    initial: { lines: [{}] },
  });
  await calls[0].resolve();
  await calls[1].resolve();
  const { report, lines } = session.getSnapshot().values;
  assert.equal(report, "First>First");
  assert.equal(lines[0].report, "First/First>First");
});

test("the second fallback response sees the start of the batch in the header and row", async () => {
  const { loader, calls } = scriptedLoader();
  const session = createSession(fallbackForm(), {
    loader,
    scope: "test",
    initial: { lines: [{}] },
  });
  const seen = [];
  session.subscribe(() => {
    const { first, second, report, lines } = session.getSnapshot().values;
    seen.push([first, second, report, lines[0].report]);
  });
  await together(...calls);
  assert.deepEqual(seen, [
    [true, false, "", ""],
    [true, true, "start>First", "start/start>First"],
  ]);
  assert.deepEqual(
    Object.values(session.getSnapshot().queries).map(({ status }) => status),
    ["idle", "idle"],
  );
});
