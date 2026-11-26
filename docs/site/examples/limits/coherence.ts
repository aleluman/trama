import { createSession, defineForm, field } from "trama-forms/core";

// A line with a price of up to 5. Its floor sets the minimum, and “Higher cap” raises the maximum to 50.
const order = defineForm({
  fields: {},
  collections: {
    lines: {
      fields: {
        floor: field.number({ label: "Floor" }),
        wide: field.checkbox({ label: "Higher cap" }),
        price: field.number({ label: "Price", max: 5 }),
      },
    },
  },
  rules: {
    lines: {
      each: {
        price: {
          min: ({ floor }) => floor ?? undefined,
          max: ({ wide }) => (wide ? 50 : undefined),
        },
      },
    },
  },
});

export const run = (log: (label: string, value: unknown) => void) => {
  const attempt = (label: string, action: () => void) => {
    try {
      action();
      log(label, "accepted");
    } catch (error) {
      log(label, error);
    }
  };

  // The definition rejects a minimum greater than its maximum.
  attempt("field.number({ min: 20, max: 10 })", () =>
    defineForm({ fields: { price: field.number({ min: 20, max: 10 }) } }),
  );

  const session = createSession(order, { initial: { lines: [{}, {}, {}] } });
  const [, , key] = session.getSnapshot().rows.lines;
  if (key === undefined) return;
  const line = session.row("lines", key);
  const before = session.getSnapshot();

  // Trama checks the combined result for each field, here a minimum of 10 and a maximum of 5.
  attempt('edit("floor", 10)', () => line.edit("floor", 10));
  log("the session keeps its snapshot", session.getSnapshot() === before);

  // With “Higher cap”, the last contribution sets the maximum to 50, so the minimum of 10 fits.
  attempt('edit("wide", true)', () => line.edit("wide", true));
  attempt('edit("floor", 10)', () => line.edit("floor", 10));
  const price = line.getSnapshot()?.fieldStates.price;
  log("price state", { min: price?.min, max: price?.max });
  attempt('edit("wide", false)', () => line.edit("wide", false));
};
