import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";
import { rejects } from "./helpers/session.mjs";

const fields = () => ({
  confirmed: field.checkbox(),
  customer: field.text(),
  note: field.text(),
});
const reason = "expected a boolean, a non-empty reason or undefined";

test("a form lock entry that throws or returns an incompatible value rejects the operation, with its index if it is in an array", () => {
  const boom = new Error("Permission denied");
  for (const [result, message, cause] of [
    [
      () => {
        throw boom;
      },
      "formula failed: Permission denied",
      boom,
    ],
    [() => "", `incompatible result "", ${reason}`],
    [() => 1, `incompatible result 1, ${reason}`],
    [() => null, `incompatible result null, ${reason}`],
    [() => ({}), `incompatible result [object Object], ${reason}`],
  ]) {
    const value = ({ customer }) => (customer === "x" ? result() : false);
    for (const [readOnly, label] of [
      [{ value }, "Form readOnly"],
      [[{ value: () => "Locked" }, { value, except: ["customer"] }], "Form readOnly[1]"],
    ]) {
      const definition = defineForm({ fields: fields(), form: { readOnly } });
      const session = createSession(definition);
      rejects(session, () => session.edit("customer", "x"), `${label}: ${message}`, cause);
      assert.throws(() => createSession(definition, { initial: { customer: "x" } }), {
        message: `${label}: ${message}`,
      });
    }
  }
});

test("at runtime, defineForm rejects a malformed form section and names the entry", () => {
  for (const [form, message] of [
    [null, 'Form section "form" must be an object of properties'],
    [() => ({ readOnly: [] }), 'Form section "form" must be an object of properties'],
    [[], 'Form section "form" must be an object of properties'],
    [{ hidden: [] }, 'Form section "form": unknown property "hidden"'],
    [{ readOnly: [], disabled: [] }, 'Form section "form": unknown property "disabled"'],
    [{ readOnly: true }, "Form readOnly: expected an entry or an array of entries"],
    [{ readOnly: () => true }, "Form readOnly: expected an entry or an array of entries"],
    [
      { readOnly: [() => true] },
      "Form readOnly[0]: expected an object with value and optional except",
    ],
    [
      { readOnly: [{ value: () => true }, null] },
      "Form readOnly[1]: expected an object with value and optional except",
    ],
    [{ readOnly: { value: () => true, exept: [] } }, 'Form readOnly: unknown property "exept"'],
    [{ readOnly: [{ except: [] }] }, "Form readOnly[0]: formula must be a function"],
    [{ readOnly: { value: "Locked" } }, "Form readOnly: formula must be a function"],
  ])
    assert.throws(() => defineForm({ fields: fields(), form }), { message });
  for (const form of [{}, { readOnly: undefined }, { readOnly: [] }, undefined]) {
    const session = createSession(defineForm({ fields: fields(), form }));
    assert.equal(session.getSnapshot().fieldStates.note.readOnly, false);
  }
});

test("at runtime, defineForm rejects except that is not a list of form fields", () => {
  for (const [form, message] of [
    [
      { readOnly: { value: () => true, except: "note" } },
      "Form readOnly: except must be an array of fields",
    ],
    [
      { readOnly: { value: () => true, except: null } },
      "Form readOnly: except must be an array of fields",
    ],
    [
      { readOnly: [{ value: () => true, except: null }] },
      "Form readOnly[0]: except must be an array of fields",
    ],
    [
      { readOnly: { value: () => true, except: ["confirmd"] } },
      'Form readOnly: unknown field "confirmd" in except',
    ],
    [
      { readOnly: [{ value: () => true, except: ["note", 1] }] },
      "Form readOnly[0]: unknown field 1 in except",
    ],
    [
      { readOnly: [{ value: () => true, except: ["toString"] }] },
      'Form readOnly[0]: unknown field "toString" in except',
    ],
    // Without collections, an exception is a name, also an empty object.
    [
      { readOnly: { value: () => true, except: [{}] } },
      "Form readOnly: unknown field [object Object] in except",
    ],
    [
      { readOnly: { value: () => true, except: [{ x: [] }] } },
      "Form readOnly: unknown field [object Object] in except",
    ],
  ])
    assert.throws(() => defineForm({ fields: fields(), form }), { message });
});

test("the definition copies form lock entries and their exceptions", () => {
  const copied = { value: () => true, except: ["note"] };
  const except = copied.except;
  const session = createSession(defineForm({ fields: fields(), form: { readOnly: copied } }));
  copied.value = () => false;
  except.push("customer");
  session.edit("confirmed", true);
  const { customer, note } = session.getSnapshot().fieldStates;
  assert.deepEqual([customer.readOnly, note.readOnly], [true, false], "The entry was copied");
});
