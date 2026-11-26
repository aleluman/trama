import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, defineRules, field } from "trama-forms/core";
import { checkStep, exchange, exchangeFields, openExchange } from "./helpers/relations.mjs";

const relationSet = defineRules({ fields: exchangeFields, rules: { driver: exchange } });

test("a rule set and its inline counterpart resolve the same pair and activation", () => {
  const initial = { driver: "rate", rate: 150, local: 777 };
  const included = defineForm({ fields: exchangeFields, include: [relationSet] });
  for (const session of [createSession(included, { initial }), openExchange(undefined, initial)]) {
    const step = checkStep(session);
    step(() => session.patch({ local: 777, tick: 1 }), ["rate", 150, 15000]);
    step(() => session.edit("local", 14600), ["local", 146, 14600]);
  }
});

test("the rule set preserves the relation's location in formula errors", () => {
  const definition = defineForm({ fields: exchangeFields, include: [relationSet] });
  assert.throws(
    () => createSession(definition, { initial: { driver: "R" } }),
    (error) => {
      assert.equal(
        error.message,
        'Field "rate" value (relation of "driver") (include[0]): formula failed',
      );
      assert.equal(error.cause?.message, 'the driver "driver" holds "R", which is no member');
      return true;
    },
  );
});

for (const property of ["value", "onChange", "onEdit"])
  test(`the relation claims ${property} within a rule set and when the set is included`, () => {
    const member = { rate: { [property]: () => null } };
    const clash = (memberPlace, relationPlace) => ({
      message: `Field "rate" ${property} in ${memberPlace}: the relation of "driver" in ${relationPlace} takes the value and the events of its members`,
    });
    for (const rules of [
      { ...member, driver: exchange },
      { driver: exchange, ...member },
    ]) {
      assert.throws(() => defineRules({ fields: exchangeFields, rules }), clash("rules", "rules"));
      assert.throws(() => defineForm({ fields: exchangeFields, rules }), clash("rules", "rules"));
    }
    const other = defineRules({ fields: exchangeFields, rules: member });
    assert.throws(
      () => defineForm({ fields: exchangeFields, include: [relationSet], rules: member }),
      clash("rules", "include[0]"),
    );
    assert.throws(
      () => defineForm({ fields: exchangeFields, include: [other, relationSet] }),
      clash("include[0]", "include[1]"),
    );
  });

test("two relations cannot share a driver or member, even across rule sets", () => {
  const fields = { ...exchangeFields, other: field.text() };
  const other = defineRules({ fields, rules: { other: exchange } });
  const same = defineRules({ fields, rules: { driver: exchange } });
  assert.throws(() => defineForm({ fields, include: [relationSet, same] }), {
    message: 'Field "driver" relation: declared by include[0] and include[1]',
  });
  assert.throws(() => defineForm({ fields, include: [relationSet, other] }), {
    message:
      'Field "rate": member of the relation of "driver" in include[0] and of the relation of "other" in include[1]; a field is a member of one relation',
  });
  assert.throws(() => defineRules({ fields, rules: { driver: exchange, other: exchange } }), {
    message:
      'Field "rate": member of the relation of "driver" in rules and of the relation of "other" in rules; a field is a member of one relation',
  });
});

test("the form select field must still accept exactly the members of the rule set", () => {
  const options = [
    { value: "rate", label: "Rate" },
    { value: "local", label: "Local" },
  ];
  const by = defineRules({
    fields: { ...exchangeFields, driver: field.select({ options }) },
    rules: { driver: exchange },
  });
  const fields = {
    ...exchangeFields,
    driver: field.select({ options: [...options, { value: "x", label: "X" }] }),
  };
  assert.throws(() => defineForm({ fields, include: [by] }), {
    message: 'Field "driver" relation (include[0]): option "x" of the select is not a member',
  });
});

test("a row collision names the field and its collection", () => {
  const collections = { lines: { fields: exchangeFields } };
  const set = defineRules({ collections, rules: { lines: { each: { driver: exchange } } } });
  assert.throws(
    () =>
      defineForm({
        fields: {},
        collections,
        include: [set],
        rules: { lines: { each: { rate: { value: () => 1 } } } },
      }),
    {
      message:
        'Field "rate" of "lines" value in rules: the relation of "driver" in include[0] takes the value and the events of its members',
    },
  );
});
