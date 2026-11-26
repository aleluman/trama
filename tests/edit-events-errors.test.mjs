import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, defineRules, field } from "trama-forms/core";
import { rejects } from "./helpers/session.mjs";

const noWrites = () => ({});

test("event conflicts name their declarations in the header, row, and rule sets", () => {
  const fields = { debit: field.number() };
  const onEdit = noWrites;
  const onChange = noWrites;
  const rules = { debit: { onEdit, onChange } };
  const message =
    'Field "debit": onEdit in rules and onChange in rules; a field declares onChange or onEdit, not both';
  assert.throws(() => defineForm({ fields, rules }), { message });
  assert.throws(() => defineRules({ fields, rules }), { message });
  const collections = { lines: { fields } };
  const rows = { lines: { each: { debit: { onChange, onEdit } } } };
  const rowMessage =
    'Field "debit" of "lines": onChange in rules and onEdit in rules; a field declares onChange or onEdit, not both';
  assert.throws(() => defineForm({ fields: {}, collections, rules: rows }), {
    message: rowMessage,
  });
  assert.throws(() => defineRules({ collections, rules: rows }), { message: rowMessage });
  const change = defineRules({ fields, rules: { debit: { onChange } } });
  const edit = defineRules({ fields, rules: { debit: { onEdit } } });
  assert.throws(() => defineForm({ fields, include: [change], rules: { debit: { onEdit } } }), {
    message:
      'Field "debit": onChange in include[0] and onEdit in rules; a field declares onChange or onEdit, not both',
  });
  assert.throws(() => defineForm({ fields, include: [change, edit] }), {
    message:
      'Field "debit": onChange in include[0] and onEdit in include[1]; a field declares onChange or onEdit, not both',
  });
  // A rule set names the conflict of an entry before the errors of later ones.
  const later = { ...fields, credit: field.number() };
  assert.throws(
    () => defineRules({ fields: later, rules: { ...rules, credit: { disabled: 5 } } }),
    {
      message,
    },
  );
});

test("an onEdit cycle names its event and does not publish the candidate", () => {
  const session = createSession(
    defineForm({
      fields: { debit: field.number(), credit: field.number({ default: 20 }) },
      rules: { debit: { onEdit: ({ credit }) => ({ credit: credit - 1 }) } },
    }),
  );
  const before = session.getSnapshot();
  assert.throws(() => session.edit("debit", 50), /debit\.onEdit/u);
  assert.equal(session.getSnapshot(), before);
});

test("an onEdit cycle disappears if the command protects its feedback target", () => {
  const session = createSession(
    defineForm({
      fields: { source: field.number(), target: field.number(), derived: field.number() },
      rules: {
        source: { onEdit: ({ derived }) => ({ target: derived, source: 100 }) },
        derived: { value: ({ target }) => (target ?? 0) + 1 },
      },
    }),
  );
  assert.throws(() => session.edit("source", 1), /source\.onEdit/u);
  session.patch({ source: 1, target: 2 });
  assert.deepEqual(session.getSnapshot().values, { source: 1, target: 2, derived: 3 });
});

test("a provisional onEdit cycle is allowed if the target that closed it disappears", () => {
  const session = createSession(
    defineForm({
      fields: {
        old: field.number({ default: 10 }),
        source: field.number(),
        mirror: field.number(),
        switch: field.checkbox(),
        next: field.number(),
      },
      rules: {
        source: {
          onEdit: (values) => (values.switch ? { next: values.old + 1 } : { old: 20 }),
        },
        mirror: { value: ({ source }) => source, onChange: () => ({ switch: true }) },
      },
    }),
  );
  session.edit("source", 1);
  assert.deepEqual(session.getSnapshot().values, {
    old: 10,
    source: 1,
    mirror: 1,
    switch: true,
    next: 11,
  });
});

test("onEdit validates even command targets and rejects non-plain patches", () => {
  const session = createSession(
    defineForm({
      fields: { debit: field.number(), credit: field.number() },
      rules: {
        debit: { onEdit: ({ debit }) => (debit === 1 ? { credit: "invalid" } : new Map()) },
      },
    }),
  );
  rejects(
    session,
    () => session.patch({ debit: 1, credit: 0 }),
    'Field "debit" onEdit: incompatible value "invalid" for number field "credit"',
  );
  assert.throws(() => session.edit("debit", 2), /Field "debit" onEdit: expected a patch object/u);
});
