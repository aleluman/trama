import assert from "node:assert/strict";
import { test } from "node:test";
import { external, open } from "./helpers/external.mjs";
import { rejects } from "./helpers/session.mjs";

// What setErrors and setWarnings reject: the list is read and checked whole
// before anything changes.

const ok = { field: "note", message: "Note" };
// The arguments of each call that fails, and its diagnostic.
const rejected = [
  ["setErrors", ["", [ok]], "setErrors: source must be a non-empty string"],
  ["setErrors", [3, [ok]], "setErrors: source must be a non-empty string"],
  ["setErrors", ["server", ok], "setErrors: issues must be an array"],
  ["setErrors", ["server", [ok, "x"]], "setErrors: each issue must be an object"],
  ["setErrors", ["server", [ok, null]], "setErrors: each issue must be an object"],
  ["setErrors", ["server", [ok, [ok]]], "setErrors: each issue must be an object"],
  [
    "setErrors",
    ["server", [ok, { ...ok, path: "a.b" }]],
    'setErrors: issue has unknown property "path"',
  ],
  [
    "setErrors",
    ["server", [ok, { field: "note" }]],
    "setErrors: issue message must be a non-empty string",
  ],
  [
    "setErrors",
    ["server", [ok, { field: "note", message: "" }]],
    "setErrors: issue message must be a non-empty string",
  ],
  [
    "setErrors",
    ["server", [ok, { field: "untill", message: "x" }]],
    'setErrors: field "untill" does not exist',
  ],
  ["setErrors", ["server", [ok, { field: 3, message: "x" }]], "setErrors: field 3 does not exist"],
  [
    "setErrors",
    ["server", [ok, { collection: "lines", message: "x" }]],
    'setErrors: collection "lines" does not exist',
  ],
  [
    "setErrors",
    ["server", [ok, { key: "r1", message: "x" }]],
    "setErrors: a row key needs its collection",
  ],
  ["setErrors", ["server", [ok], 3], "setErrors: options must be an object"],
  ["setErrors", ["server", [ok], { form: 1 }], 'setErrors: unknown option "form"'],
  ["setErrors", ["server", [ok], { from: {} }], "setErrors: prepared belongs to another session"],
  ["setWarnings", ["", [ok]], "setWarnings: source must be a non-empty string"],
  [
    "setWarnings",
    ["server", [{ field: "untill", message: "x" }]],
    'setWarnings: field "untill" does not exist',
  ],
];

test("A list with an invalid issue changes nothing because the entire list is validated before the source is touched", () => {
  const session = open();
  session.setErrors("server", [{ field: "until", message: "Rejected" }]);
  for (const [command, given, message] of rejected)
    rejects(session, () => session[command](...given), message);
  assert.deepEqual(external(session, "until"), ["Rejected"]);
  assert.deepEqual(external(session, "note"), []);
});

test("An issue is read once, and a throwing getter fails before anything changes", () => {
  const session = open();
  session.setErrors("server", [{ field: "until", message: "Rejected" }]);
  let reads = 0;
  const counted = {
    field: "note",
    get message() {
      reads += 1;
      return "Note";
    },
  };
  session.setErrors("audit", [counted]);
  assert.equal(reads, 1);
  const failing = {
    field: "note",
    get message() {
      throw new Error("getter");
    },
  };
  rejects(session, () => session.setErrors("server", [failing]), "getter");
  assert.deepEqual(external(session, "until"), ["Rejected"]);
});

test("undefined means absence in the location and in from", () => {
  const session = open();
  session.setErrors(
    "server",
    [{ field: undefined, collection: undefined, key: undefined, message: "General" }],
    { from: undefined },
  );
  assert.deepEqual(session.getSnapshot().form.externalErrors, ["General"]);
  session.setErrors("server", [], undefined);
  assert.deepEqual(session.getSnapshot().form.externalErrors, []);
});

test("setErrors and setWarnings throw during a notification", () => {
  const session = open();
  const errors = [];
  const stop = session.subscribe(() => {
    for (const command of ["setErrors", "setWarnings"])
      try {
        session[command]("server", []);
      } catch (error) {
        errors.push(error.message);
      }
  });
  session.edit("note", "a");
  stop();
  assert.deepEqual(errors, [
    "Cannot set errors of a session during its notification",
    "Cannot set warnings of a session during its notification",
  ]);
});
