import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createForms,
  createSession,
  declareContext,
  defineEndpoints,
  defineForm as defineCoreForm,
  endpoint,
} from "trama-forms/core";
import { rejects } from "./helpers/session.mjs";
import { opened, scriptedLoader, settle, shown } from "./helpers/scripted-loader.mjs";

const scope = "acme";
const families = [
  { value: 1, label: "Beverages" },
  { value: 2, label: "Dairy" },
  { value: 3, label: "Bakery" },
];
const subfamilies = {
  1: [{ value: 11, label: "Juices" }],
  2: [{ value: 21, label: "Cheeses" }],
};
const catalog = defineEndpoints({
  families: endpoint.list(() => Promise.resolve(families)),
  subfamilies: endpoint.list((_, { families: chosen }) =>
    Promise.resolve(chosen.flatMap((value) => subfamilies[value] ?? [])),
  ),
  price: endpoint.value(() => Promise.resolve(1)),
});
const { defineForm, defineRules, field } = createForms({ endpoints: [catalog] });
// A report filters by families and their subfamilies: the child takes its
// params from the parent, is disabled without parent and is cleared when the
// parent is left empty, but not pruned when it changes to another set.
const report = (events = []) =>
  defineForm({
    fields: {
      families: field.multiAsync("families", { label: "Families" }),
      subfamilies: field.multiAsync("subfamilies", { placeholder: "All" }),
    },
    rules: {
      families: {
        onChange: ({ families: chosen }) => {
          events.push(chosen);
          return chosen.length === 0 ? { subfamilies: [] } : undefined;
        },
      },
      subfamilies: {
        params: ({ families: chosen }) =>
          chosen.length === 0 ? undefined : { families: chosen.map((family) => family.value) },
        disabled: ({ families: chosen }) => chosen.length === 0,
      },
    },
  });

test("A remote multi-select holds a frozen array of options, uses [] when empty, and requires a scope", () => {
  assert.throws(() => createSession(report()), {
    message: "Form with async fields requires a scope",
  });
  const session = createSession(report(), { scope });
  const { values, fieldStates } = session.getSnapshot();
  assert.deepEqual(values, { families: [], subfamilies: [] });
  assert.ok(Object.isFrozen(values.families));
  assert.equal(fieldStates.subfamilies.disabled, true);
  assert.equal(fieldStates.subfamilies.placeholder, "All");
});

test("A new option is copied, current options keep their identity, and the same set in a different order changes nothing", () => {
  const events = [];
  const session = createSession(report(events), { scope, initial: { families: [families[0]] } });
  const [held] = session.getSnapshot().values.families;
  assert.notEqual(held, families[0]);
  assert.ok(Object.isFrozen(held));
  const written = [{ ...families[1] }, { value: 1, label: "Another label" }];
  session.edit("families", written);
  const chosen = session.getSnapshot().values.families;
  assert.deepEqual(chosen, [families[1], families[0]]);
  assert.equal(chosen[1], held);
  assert.notEqual(chosen[0], written[0]);
  assert.ok(Object.isFrozen(chosen) && Object.isFrozen(chosen[0]));
  const before = session.getSnapshot().values;
  session.edit("families", [{ ...families[0] }, { ...families[1] }]);
  session.patch({ families: [chosen[1], chosen[0]] });
  assert.equal(session.getSnapshot().values, before);
  assert.equal(events.length, 1);
});

test("An element that is not an option, a repeated value, or data that is not plain rejects the operation", () => {
  const session = createSession(report(), { scope });
  const since = { value: 4, label: "Frozen foods", since: new Date(0) };
  for (const [value, problem] of [
    [[{ value: 1 }], "option 0: expected value and label"],
    [[families[0], 1], "option 1: expected value and label"],
    [[families[0], { value: 1, label: "Other" }], "duplicate option value 1"],
    [[since], 'option 0: option must be plain data: a Date at "since"'],
    [families[0], "expected an array without holes"],
    [null, "expected an array without holes"],
  ])
    rejects(
      session,
      () => session.edit("families", value),
      `Field "families" (multiAsync): ${problem}`,
    );
});

test("Per-view lists, params, and suspension work as they do for an async field", async () => {
  const { loader, calls } = scriptedLoader();
  const session = createSession(report(), { scope, loader });
  const view = opened(session, "subfamilies");
  assert.equal(shown(view).status, "suspended");
  assert.equal(calls.length, 0);
  session.edit("families", [families[0], families[1]]);
  assert.deepEqual(calls.at(-1).key, ["trama", scope, "subfamilies", { families: [1, 2] }]);
  await calls.at(-1).resolve();
  assert.deepEqual(shown(view).labels, ["Juices", "Cheeses"]);
  session.edit("subfamilies", [view.getSnapshot().options[1]]);
  assert.equal(session.getSnapshot().values.subfamilies[0], view.getSnapshot().options[1]);
  // Another non-empty parent does not prune the child; an empty one clears it.
  session.edit("families", [families[1]]);
  assert.deepEqual(session.getSnapshot().values.subfamilies, [{ value: 21, label: "Cheeses" }]);
  session.edit("families", []);
  assert.deepEqual(session.getSnapshot().values.subfamilies, []);
  assert.equal(shown(view).status, "suspended");
  assert.equal(session.getSnapshot().fieldStates.subfamilies.disabled, true);
});

test("An endpoint.list query without a patch writes its list to a remote multi-select", async () => {
  const { loader, calls } = scriptedLoader();
  const definition = defineForm({
    fields: { all: field.checkbox(), families: field.multiAsync("families") },
    rules: {
      families: { query: { endpoint: "families", params: ({ all }) => (all ? {} : undefined) } },
    },
  });
  const session = createSession(definition, { scope, loader });
  session.edit("all", true);
  await calls[0].resolve();
  await settle();
  assert.deepEqual(session.getSnapshot().values.families, families);
  assert.equal(session.getSnapshot().queries.families.status, "idle");
});

test("In a row, a remote multi-select has its own list by handle and is edited by address", async () => {
  const { loader, calls } = scriptedLoader();
  const definition = defineForm({
    fields: {},
    collections: { lines: { fields: { families: field.multiAsync("families") } } },
  });
  const session = createSession(definition, { scope, loader, initial: { lines: [{}, {}] } });
  const [first, second] = session.getSnapshot().rows.lines;
  const row = session.row("lines", first);
  const view = opened(row, "families");
  await calls[0].resolve();
  row.edit("families", [view.getSnapshot().options[2]]);
  assert.deepEqual(row.getSnapshot().values.families, [families[2]]);
  assert.deepEqual(session.row("lines", second).getSnapshot().values.families, []);
});

test("createForms, the core defineForm, and rule sets treat a remote multi-select like an async field", () => {
  assert.throws(() => field.multiAsync("missing"), { message: 'Unknown endpoint "missing"' });
  assert.throws(() => field.multiAsync("price"), {
    message: 'Endpoint "price" gives a value; use an options or list endpoint',
  });
  assert.throws(() => defineCoreForm({ fields: { families: field.multiAsync("families") } }), {
    message: 'Field "families" (multiAsync): define the form with the defineForm of createForms',
  });
  const narrowed = defineRules({
    fields: { families: field.multiAsync("families") },
    rules: { families: { label: () => "Families" } },
  });
  assert.throws(
    () =>
      defineForm({ fields: { families: field.multiAsync("subfamilies") }, include: [narrowed] }),
    {
      message:
        'Form include[0]: rule set requires field "families" with endpoint "families", not "subfamilies"',
    },
  );
  assert.throws(
    () => defineForm({ fields: { families: field.async("families") }, include: [narrowed] }),
    {
      message: 'Form include[0]: rule set requires field "families" of type multiAsync, not async',
    },
  );
  assert.throws(
    () =>
      defineForm({
        fields: { note: field.text() },
        rules: { note: { params: () => ({}) } },
      }),
    { message: 'Field "note" params: text fields have no params' },
  );
});

test("An index with a getter is rejected without invoking it", () => {
  const session = createSession(report(), { scope });
  let reads = 0;
  const getter = Object.defineProperty([], "0", {
    get: () => (++reads, families[0]),
    enumerable: true,
  });
  rejects(
    session,
    () => session.edit("families", getter),
    'Field "families" (multiAsync): selection must be plain data: a getter at "[0]"',
  );
  assert.equal(reads, 0);
});

test("A sparse selection copied from context is rejected", () => {
  const definition = defineForm({
    context: declareContext(),
    fields: { families: field.multiAsync("families") },
    defaults: ({ selection }) => ({ families: selection }),
  });
  assert.throws(
    () =>
      createSession(definition, {
        scope,
        context: { selection: Object.assign([], { length: 1 }) },
      }),
    {
      message:
        'Form defaults: incompatible value for multiAsync field "families": expected an array without holes',
    },
  );
});

test("A rebuilt attempt writes the same selection and its event runs once", () => {
  const shared = [{ value: 1, label: "Beverages" }];
  const seen = [];
  let events = 0;
  const definition = defineForm({
    fields: {
      before: field.number({ default: 0 }),
      families: field.multiAsync("families"),
      trigger: field.number({ default: 0 }),
      change: field.number({ default: 0 }),
    },
    rules: {
      families: {
        value: ({ change }) => (change ? shared : undefined),
        onChange: ({ families: chosen }) => void (events++, chosen),
      },
      // trigger reads families and, by its event, reveals a destination declared
      // before it, so the resolution starts again.
      trigger: {
        value: ({ change, families: chosen }) => (seen.push(chosen), change),
        onChange: () => ({ before: 1 }),
      },
    },
  });
  const session = createSession(definition, { scope });
  seen.length = 0;
  session.edit("change", 1);
  assert.ok(seen.length > 1);
  assert.ok(seen.every((chosen) => chosen === seen[0]));
  assert.equal(events, 1);
});
