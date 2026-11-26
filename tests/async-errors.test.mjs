import assert from "node:assert/strict";
import { test } from "node:test";
import { createForms, createSession, defineEndpoints, endpoint } from "trama-forms/core";
import { scriptedLoader, settle, watch } from "./helpers/scripted-loader.mjs";
import { rejects } from "./helpers/session.mjs";

// A form with every field type. Its endpoints answer what the test serves: the
// customers endpoint, a page by number; the contacts endpoint, a full list.
const setup = (served = {}) => {
  const sales = defineEndpoints({
    customers: endpoint.options(({ page }) => Promise.resolve(served.pages?.[page])),
    contacts: endpoint.list(() => Promise.resolve(served.list)),
  });
  const { defineForm, field } = createForms({ endpoints: [sales] });
  const definition = defineForm({
    fields: {
      customer: field.async("customers"),
      contact: field.async("contacts"),
      note: field.text(),
      amount: field.number(),
      done: field.checkbox(),
      size: field.select({ options: [{ value: "s", label: "S" }] }),
    },
  });
  return { definition, plain: defineForm({ fields: { note: field.text() } }) };
};
const option = (value) => ({ value, label: `Option ${value}` });
const three = [option(1), option(2), option(3)];
const page = (options, more = false) => ({ options, more });

test("A session with async fields requires a scope that is a string or a finite number", () => {
  const { definition, plain } = setup();
  for (const options of [undefined, {}, { scope: undefined }, { initial: { note: "x" } }])
    assert.throws(() => createSession(definition, options), {
      message: "Form with async fields requires a scope",
    });
  for (const scope of [null, Number.NaN, Infinity, -Infinity, true, {}, ["acme"], 1n, () => "a"])
    for (const form of [definition, plain])
      assert.throws(() => createSession(form, { scope }), {
        message: "Session scope must be a string or a finite number",
      });
  for (const scope of ["acme", "", 0, -0, 7.5]) createSession(definition, { scope });
  createSession(plain);
  createSession(plain, { scope: "acme" });
});

test("loader must be a function, and the session uses the direct loader when none is supplied", async () => {
  const { definition, plain } = setup({ list: [option(1)] });
  for (const loader of [5, null, {}, "direct"])
    for (const [form, scope] of [
      [definition, "acme"],
      [plain, undefined],
    ])
      assert.throws(() => createSession(form, { scope, loader }), {
        message: "Session loader must be a function",
      });
  const views = [{ scope: "acme" }, { scope: "acme", loader: undefined }].map(
    (options) => watch(createSession(definition, options), "contact").view,
  );
  for (const view of views) view.open();
  await settle();
  for (const view of views) assert.deepEqual(view.getSnapshot().options, [option(1)]);
});

test("list is available only on async fields and names the missing field", () => {
  const { definition } = setup();
  const session = createSession(definition, { scope: "acme" });
  for (const [name, type] of [
    ["note", "text"],
    ["amount", "number"],
    ["done", "checkbox"],
    ["size", "select"],
  ])
    rejects(session, () => session.list(name), `Field "${name}" (${type}) has no option list`);
  for (const name of ["nope", "toString", "__proto__"])
    rejects(session, () => session.list(name), `Unknown field "${name}"`);
});

test("search throws a TypeError for non-text input without changing the view or making a request", () => {
  const { definition } = setup();
  const { loader, calls } = scriptedLoader();
  const watched = watch(createSession(definition, { scope: "acme", loader }), "customer");
  const before = watched.view.getSnapshot();
  for (const text of [5, undefined, null, ["an"], { text: "an" }])
    assert.throws(
      () => watched.view.search(text),
      (error) => {
        assert.ok(error instanceof TypeError);
        assert.equal(error.message, 'Field "customer" list: search text must be a string');
        return true;
      },
    );
  assert.equal(watched.view.getSnapshot(), before);
  assert.deepEqual([watched.notifications, calls.length], [0, 0]);
});

// run fails with the diagnostic itself, and the view keeps it as the cause of
// its error, which names the field.
const assertRejected = async (served, name, cause, second = false) => {
  const { definition } = setup(served);
  const { loader, calls } = scriptedLoader();
  const { view } = watch(createSession(definition, { scope: "acme", loader }), name);
  view.open();
  if (second) {
    await calls[0].resolve();
    view.more();
  }
  const call = calls.at(-1);
  await assert.rejects(
    Promise.try(() => call.run(call.signal)),
    { message: cause },
  );
  await call.resolve();
  const { status, error } = view.getSnapshot();
  assert.equal(status, "error", cause);
  assert.equal(error.message, `Field "${name}" list: request failed: ${cause}`);
  assert.ok(error.cause instanceof Error);
  assert.equal(error.cause.message, cause);
};

test("run rejects each invalid option endpoint page with its diagnostic", async () => {
  const shape = 'Endpoint "customers" page 1: expected { options, more }';
  const option3 = 'Endpoint "customers" page 1: option 3:';
  const cases = [
    [null, shape],
    [[], shape],
    [{ options: [] }, shape],
    [{ options: {}, more: false }, shape],
    [{ options: [], more: "no" }, shape],
    [
      new (class Page {
        options = [];
        more = false;
      })(),
      shape,
    ],
    [page([...three, { value: 4 }]), `${option3} expected value and label`],
    [page([...three, { value: Number.NaN, label: "NaN" }]), `${option3} expected value and label`],
    [page([...three, { value: 4, label: 4 }]), `${option3} expected value and label`],
    [
      page([...three, { ...option(4), load() {} }]),
      `${option3} option must be plain data: a function at "load"`,
    ],
    [
      page([...three, { ...option(4), since: new Date(0) }]),
      `${option3} option must be plain data: a Date at "since"`,
    ],
    [page([option(17), option(17)]), 'Endpoint "customers" page 1: duplicate option value 17'],
    [
      page([
        { value: "ES", label: "Spain" },
        { value: "ES", label: "Other" },
      ]),
      'Endpoint "customers" page 1: duplicate option value "ES"',
    ],
  ];
  const pages = { 1: page(three, true), 2: { options: [option(4)], more: 1 } };
  const second = 'Endpoint "customers" page 2: expected { options, more }';
  await Promise.all([
    ...cases.map(([served, cause]) => assertRejected({ pages: { 1: served } }, "customer", cause)),
    assertRejected({ pages }, "customer", second, true),
  ]);
});

test("run rejects each invalid full list with its diagnostic", async () => {
  const shape = 'Endpoint "contacts": expected an array of options';
  const cases = [
    [{}, shape],
    [null, shape],
    [page(three), shape],
    [[...three, { label: "No value" }], 'Endpoint "contacts": option 3: expected value and label'],
    [
      [...three, { ...option(4), since: new Date(0) }],
      'Endpoint "contacts": option 3: option must be plain data: a Date at "since"',
    ],
    [[option(17), option(17)], 'Endpoint "contacts": duplicate option value 17'],
  ];
  await Promise.all(cases.map(([list, cause]) => assertRejected({ list }, "contact", cause)));
});
