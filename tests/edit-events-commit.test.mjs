import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";

// What an onEdit writes after preparing counts as a change for commit and for
// from even when it repeats the value, also when an onChange of the same
// command writes that value again, before or after it in declaration order.
const event = {
  trigger: { onEdit: () => ({ mode: true }) },
  other: { onChange: () => ({ mode: true }) },
};
const orders = {
  "onEdit first": event,
  "onChange first": { other: event.other, trigger: event.trigger },
};
const fields = { trigger: field.checkbox(), other: field.checkbox(), mode: field.checkbox() };

for (const [order, rules] of Object.entries(orders))
  test(`an onChange that repeats the value does not remove protection from an onEdit (${order})`, async () => {
    const session = createSession(defineForm({ fields, rules }), { initial: { mode: true } });
    const sent = await session.prepare();
    session.patch({ trigger: true, other: true });
    session.setErrors("server", [{ field: "mode", message: "Mode" }], { from: sent });
    assert.deepEqual(session.getSnapshot().fieldStates.mode.externalErrors, []);
    assert.equal(session.commit(sent, { mode: false }), true);
    assert.equal(session.getSnapshot().values.mode, true);
  });

for (const [order, rules] of Object.entries(orders))
  test(`in a row, an onChange that repeats the value does not remove protection either (${order})`, async () => {
    const session = createSession(
      defineForm({
        fields: {},
        collections: { lines: { fields } },
        rules: { lines: { each: rules } },
      }),
      { initial: { lines: [{ mode: true }, { mode: true }] } },
    );
    const [both, alone] = session.getSnapshot().rows.lines;
    const sent = await session.prepare();
    session.patch({
      lines: { [both]: { trigger: true, other: true }, [alone]: { trigger: true } },
    });
    const issues = [both, alone].map((key) => ({
      collection: "lines",
      key,
      field: "mode",
      message: "Mode",
    }));
    session.setErrors("server", issues, { from: sent });
    for (const key of [both, alone])
      assert.deepEqual(session.row("lines", key).getSnapshot().fieldStates.mode.externalErrors, []);
    const canonical = { lines: { [both]: { mode: false }, [alone]: { mode: false } } };
    assert.equal(session.commit(sent, canonical), true);
    assert.deepEqual(
      session.getSnapshot().values.lines.map(({ mode }) => mode),
      [true, true],
    );
  });
