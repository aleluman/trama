import { createSession, defineForm, field } from "trama-forms/core";

const product = defineForm({
  fields: {
    price: field.number(),
    size: field.select({
      options: [
        { value: "s", label: "S" },
        { value: "m", label: "M" },
      ],
    }),
    since: field.date(),
    tags: field.multiSelect({
      options: [
        { value: "new", label: "New" },
        { value: "sale", label: "Sale" },
      ],
    }),
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
  const session = createSession(product);

  attempt('edit("price", 12.5)', () => session.edit("price", 12.5));
  attempt('edit("price", null)', () => session.edit("price", null));
  // number accepts only finite numbers or null.
  attempt('edit("price", Infinity)', () => session.edit("price", Infinity));
  // @ts-expect-error TypeScript rejects this, and the value is also checked at runtime.
  attempt('edit("price", "12")', () => session.edit("price", "12"));
  // @ts-expect-error Only option values are accepted.
  attempt('edit("size", "xl")', () => session.edit("size", "xl"));
  // TypeScript accepts any string and any array of option values. Runtime validation checks both.
  attempt('edit("since", "2028-02-29")', () => session.edit("since", "2028-02-29"));
  attempt('edit("since", "2026-02-30")', () => session.edit("since", "2026-02-30"));
  attempt('edit("tags", ["sale", "sale"])', () => session.edit("tags", ["sale", "sale"]));
  log("values after the attempts", session.getSnapshot().values);

  // The definition is also validated when it is created.
  attempt("duplicate options", () =>
    defineForm({
      fields: {
        size: field.select({
          options: [
            { value: "s", label: "S" },
            { value: "s", label: "Small" },
          ],
        }),
      },
    }),
  );
  attempt("placeholder on a select field", () =>
    defineForm({
      fields: {
        size: field.select({
          options: [{ value: "s", label: "S" }],
          // @ts-expect-error A select field has no placeholder.
          placeholder: "Choose a size",
        }),
      },
    }),
  );
};
