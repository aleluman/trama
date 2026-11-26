import { defineForm, defineRules, field } from "trama-forms/core";

const fields = { debit: field.number(), credit: field.number(), note: field.text() };
const collections = { lines: { fields } };
const skip = () => ({});

const editing = defineRules({
  fields,
  collections,
  rules: {
    debit: {
      onEdit: ({ debit }, { before, rows, toDefaults }) => {
        const earlier: number | null = before.debit;
        const notes: readonly { readonly note: string }[] = before.lines;
        // @ts-expect-error Cannot assign to 'debit' because it is a read-only property.
        before.debit = 1;
        // @ts-expect-error Index signature in type 'readonly ...[]' only permits reading.
        before.lines[0] = { debit: null, credit: null, note: "" };
        void [earlier, notes, rows.lines];
        return debit === null ? toDefaults("credit") : { credit: 0 };
      },
    },
    lines: {
      each: {
        debit: {
          onEdit: ({ debit }, { before, values, key }) => {
            const earlier: number | null = before.row.debit;
            const note: string = before.values.note;
            // @ts-expect-error Cannot assign to 'note' because it is a read-only property.
            before.row.note = "change";
            // @ts-expect-error Property 'missing' does not exist on the row.
            void before.row.missing;
            void [earlier, note, values.note, key];
            return { credit: debit };
          },
        },
      },
    },
  },
});

defineForm({ fields, collections, include: [editing] });
defineForm({
  fields,
  rules: {
    debit: {
      onChange: skip,
      // @ts-expect-error field "debit" declares onChange or onEdit, not both
      onEdit: skip,
    },
  },
});
defineRules({
  collections,
  rules: {
    lines: {
      each: {
        debit: {
          onChange: skip,
          // @ts-expect-error field "debit" of "lines" declares onChange or onEdit, not both
          onEdit: skip,
        },
      },
    },
  },
});
const changing = defineRules({ fields, rules: { debit: { onChange: skip } } });
defineForm({
  fields,
  collections,
  // @ts-expect-error field "debit" onChange or onEdit is declared by another rule set
  include: [changing, editing],
});
defineForm({
  fields,
  // @ts-expect-error field "debit" onChange or onEdit is declared in rules too
  include: [changing],
  rules: { debit: { onEdit: skip } },
});
defineForm({
  fields,
  rules: {
    debit: {
      // @ts-expect-error Property 'before' does not exist on the tools of a formula.
      value: (_, { before }) => {
        void before;
        return 0;
      },
    },
  },
});

declare const useEdit: boolean;
defineForm({ fields, rules: { debit: useEdit ? { onEdit: skip } : { onChange: skip } } });
