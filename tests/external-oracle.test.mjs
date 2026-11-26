import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cells,
  header,
  open,
  operationOf,
  placesOf,
  published,
  run,
} from "./helpers/external-oracle.mjs";
import { pick, random } from "./helpers/session.mjs";

// An oracle of the external messages: random sequences of replacements by
// three sources, in both channels, edits, rows added, removed and moved, and
// resets. A slow model keeps what each source gives each destination and
// withdraws it by comparing the values published before and after each step,
// without evaluating any rule. After each step, every scope must publish the
// lists of the model, and count once its destinations with some error and
// those with some warning; the form has no local warnings.
const nameOf = ({ field: name, collection, key }) =>
  collection === undefined
    ? name === undefined
      ? "form"
      : `header.${name}`
    : key === undefined
      ? "lines"
      : `${key}${name === undefined ? "" : `.${name}`}`;

// The model: the sources in declaration order, and per destination and
// source, its errors and warnings.
const modelOf = () => ({ sources: [], given: new Map() });
const replace = (model, live, source, channel, places) => {
  if (!model.sources.includes(source)) model.sources.push(source);
  for (const lists of model.given.values()) delete lists[`${source}.${channel}`];
  for (const place of places) {
    if (place.key !== undefined && !live.includes(place.key)) continue;
    const lists = model.given.get(nameOf(place)) ?? {};
    model.given.set(nameOf(place), lists);
    (lists[`${source}.${channel}`] ??= []).push(place.message);
  }
};
// What the model expects a destination to publish in a channel.
const expected = (model, name, channel) => {
  const texts = [];
  for (const source of model.sources)
    for (const text of model.given.get(name)?.[`${source}.${channel}`] ?? [])
      if (!texts.includes(text)) texts.push(text);
  return texts;
};
// The destinations whose value changed between two snapshots.
const withdraw = (model, before, after) => {
  for (const name of header)
    if (!Object.is(before.values[name], after.values[name])) model.given.delete(`header.${name}`);
  if (before.rows.lines !== after.rows.lines) model.given.delete("lines");
  for (const [at, key] of before.rows.lines.entries()) {
    const now = after.rows.lines.indexOf(key);
    for (const name of cells) {
      if (now >= 0 && Object.is(before.values.lines[at][name], after.values.lines[now][name]))
        continue;
      model.given.delete(`${key}.${name}`);
      model.given.delete(key);
    }
  }
};

// Whether a scope is a row or one of its cells.
const within = (key) => (name) => name === key || name.startsWith(`${key}.`);

const check = (session, model, label) => {
  const { rows } = session.getSnapshot();
  const found = published(session);
  const scopes = [
    ["form", found.form],
    ["lines", found.lines],
    ...header.map((name) => [`header.${name}`, found.header[name]]),
    ...rows.lines.flatMap((key, at) => [
      [key, found.rows[at]],
      ...cells.map((name) => [`${key}.${name}`, found.rows[at].cells[name]]),
    ]),
  ];
  // How many of the scopes that a predicate takes have some error, and some
  // warning.
  const errors = (takes) =>
    scopes.filter(
      ([name, scope]) => takes(name) && scope.errors.length + scope.externalErrors.length > 0,
    ).length;
  const warned = (takes) =>
    scopes.filter(([name, scope]) => takes(name) && scope.warnings.length > 0).length;
  for (const [name, scope] of scopes) {
    assert.deepEqual(scope.externalErrors, expected(model, name, "errors"), `${label} ${name}`);
    assert.deepEqual(scope.warnings, expected(model, name, "warnings"), `${label} ${name}`);
  }
  for (const [channel, count] of [errors, warned].entries()) {
    const inRows = rows.lines.reduce((sum, key) => sum + count(within(key)), 0);
    const inLines = inRows + count((name) => name === "lines");
    assert.equal(found.lines.counts[channel], inLines, `${label} lines ${channel}`);
    const inHeader = count((name) => name === "form" || name.startsWith("header."));
    assert.equal(found.form.counts[channel], inLines + inHeader, `${label} form ${channel}`);
    for (const [at, key] of rows.lines.entries())
      assert.equal(
        found.rows[at].counts[channel],
        count(within(key)),
        `${label} ${key} ${channel}`,
      );
  }
};

const sequence = (seed) => {
  const next = random(seed);
  const session = open();
  let model = modelOf();
  const gone = [];
  for (let step = 0; step < 60; step++) {
    const before = session.getSnapshot();
    const kind = pick(next, ["set", "set", "change", "change", "change", "reset"]);
    if (kind === "set") {
      const source = pick(next, ["s", "t", "u"]);
      const channel = pick(next, ["errors", "warnings"]);
      // Rows that left are named too, and left out.
      const places = placesOf(next, [...before.rows.lines, ...gone.slice(-2)], 5);
      session[channel === "errors" ? "setErrors" : "setWarnings"](source, places);
      replace(model, before.rows.lines, source, channel, places);
    } else if (kind === "reset" && next() < 0.2) {
      session.reset();
      model = modelOf();
    } else {
      run(session, operationOf(next, before.rows.lines.length));
      const after = session.getSnapshot();
      gone.push(...before.rows.lines.filter((key) => !after.rows.lines.includes(key)));
      withdraw(model, before, after);
    }
    check(session, model, `seed ${seed} step ${step}`);
  }
};

test("Each scope publishes what the model expects from its sources across 60 random sequences of 60 steps", () => {
  for (let seed = 1; seed <= 60; seed++) sequence(seed);
});
