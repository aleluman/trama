import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, defineRules, field } from "trama-forms/core";
import { rejects } from "./helpers/session.mjs";

const options = [
  { value: "sale", label: "Sale" },
  { value: "quote", label: "Quote" },
  { value: 3, label: "Three" },
];
// kinds counts its events, and pick writes kinds through a formula.
const report = (events = []) =>
  defineForm({
    fields: {
      kinds: field.multiSelect({ options }),
      pick: field.text(),
      clear: field.checkbox(),
    },
    rules: {
      kinds: {
        value: ({ pick }) => (pick === "" ? undefined : pick.split(",")),
        onChange: ({ kinds }) => void events.push(kinds),
      },
      clear: { onChange: ({ clear }, { toDefaults }) => (clear ? toDefaults("kinds") : undefined) },
    },
  });

test("A multi-select holds a frozen array of the values of its options and uses [] when empty", () => {
  const session = createSession(report());
  const empty = session.getSnapshot().values.kinds;
  assert.deepEqual(empty, []);
  assert.ok(Object.isFrozen(empty));
  const written = ["quote", 3];
  session.edit("kinds", written);
  const kept = session.getSnapshot().values.kinds;
  assert.deepEqual(kept, ["quote", 3]);
  assert.ok(Object.isFrozen(kept));
  assert.notEqual(kept, written);
  written.push("sale");
  assert.deepEqual(session.getSnapshot().values.kinds, ["quote", 3]);
});

test("Writing the same set in a different order neither changes the field nor triggers onChange", () => {
  const events = [];
  const session = createSession(report(events), { initial: { kinds: ["sale", 3] } });
  const before = session.getSnapshot().values;
  session.edit("kinds", [3, "sale"]);
  session.patch({ kinds: ["sale", 3] });
  assert.equal(session.getSnapshot().values, before);
  assert.deepEqual(events, []);
  session.edit("kinds", ["quote"]);
  assert.deepEqual(events, [["quote"]]);
  session.edit("pick", "quote");
  assert.deepEqual(events, [["quote"]]);
});

test("A repeated, unknown, or wrong-type value, or a container that is not a plain array, rejects the operation", () => {
  const session = createSession(report());
  const holed = ["sale"];
  holed[2] = 3;
  const extra = Object.assign(["sale"], { note: "x" });
  for (const [value, problem] of [
    [["sale", "sale"], 'duplicate value "sale"'],
    [["other"], 'value "other" is not an option'],
    [["3"], 'value "3" is not an option'],
    [[null], "value null is not an option"],
    [holed, "expected an array without holes"],
    ["sale", "expected an array without holes"],
    [null, "expected an array without holes"],
    [{ 0: "sale", length: 1 }, "expected an array without holes"],
    [extra, 'selection must be plain data: an array property at "note"'],
  ])
    rejects(session, () => session.edit("kinds", value), `Field "kinds" (multiSelect): ${problem}`);
  rejects(
    session,
    () => session.edit("pick", "sale,other"),
    'Field "kinds" value: incompatible result for multiSelect field: value "other" is not an option',
  );
});

test("toDefaults supplies the default, and a formula returns an array literal", () => {
  const session = createSession(report());
  session.edit("pick", "sale,quote");
  assert.deepEqual(session.getSnapshot().values.kinds, ["sale", "quote"]);
  session.edit("pick", "");
  session.edit("kinds", ["quote"]);
  session.edit("clear", true);
  assert.deepEqual(session.getSnapshot().values.kinds, []);
});

test("Options are checked as for a select, and the default is copied and frozen", () => {
  const label = 'Field "kinds" (multiSelect)';
  assert.throws(() => defineForm({ fields: { kinds: { type: "multiSelect", options: "x" } } }), {
    message: `${label}: options must be an array`,
  });
  assert.throws(
    () =>
      defineForm({ fields: { kinds: field.multiSelect({ options: [options[0], options[0]] }) } }),
    { message: `${label}: duplicate option` },
  );
  const given = ["sale"];
  const definition = defineForm({
    fields: { kinds: field.multiSelect({ options, default: given }) },
  });
  given.push("quote");
  const value = createSession(definition).getSnapshot().values.kinds;
  assert.deepEqual(value, ["sale"]);
  assert.ok(Object.isFrozen(definition.fields.kinds.default));
  assert.equal(createSession(definition).getSnapshot().values.kinds, value);
});

test("The default of a handwritten definition is checked against its options in the header, a collection, and a rule set", () => {
  const kinds = (given) => ({ type: "multiSelect", options, default: given });
  for (const [given, problem] of [
    [["sale", 3], undefined],
    [["other"], 'value "other" is not an option'],
    [["sale", "sale"], 'duplicate value "sale"'],
  ]) {
    const header = () => defineForm({ fields: { kinds: kinds(given) } });
    const row = () =>
      defineForm({ fields: {}, collections: { lines: { fields: { kinds: kinds(given) } } } });
    const set = () => defineRules({ fields: { kinds: kinds(given) }, rules: {} });
    for (const [define, label] of [
      [header, 'Field "kinds"'],
      [row, 'Field "kinds" of "lines"'],
      [set, 'Field "kinds"'],
    ])
      if (problem === undefined) define();
      else assert.throws(define, { message: `${label} (multiSelect): ${problem}` });
  }
});

test("The options of a handwritten definition are read again in each definition", () => {
  const kinds = { type: "multiSelect", options: [options[0]], default: ["sale"] };
  defineForm({ fields: { kinds } });
  kinds.options = [...kinds.options, options[1]];
  kinds.default = ["quote"];
  const value = createSession(defineForm({ fields: { kinds } })).getSnapshot().values.kinds;
  assert.deepEqual(value, ["quote"]);
});

test("An index with a getter or a non-enumerable index is rejected without invoking the getter", () => {
  const session = createSession(report());
  let reads = 0;
  const getter = Object.defineProperty([], "0", {
    get: () => (++reads === 1 ? "sale" : "other"),
    enumerable: true,
  });
  const hidden = Object.defineProperty([], "0", { value: "sale", enumerable: false });
  const label = 'Field "kinds" (multiSelect): selection must be plain data:';
  rejects(session, () => session.edit("kinds", getter), `${label} a getter at "[0]"`);
  rejects(
    session,
    () => session.edit("kinds", hidden),
    `${label} a non-enumerable property at "[0]"`,
  );
  assert.equal(reads, 0);
});

test("A definition frozen by the author whose options change is checked against its current options each time", () => {
  const choices = [options[0]];
  const kinds = Object.freeze({ type: "multiSelect", options: choices, default: ["sale"] });
  defineForm({ fields: { kinds } });
  choices[0] = options[1];
  assert.throws(() => defineForm({ fields: { kinds } }), {
    message: 'Field "kinds" (multiSelect): value "sale" is not an option',
  });
});
