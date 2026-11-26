import { createSession, defineForm, field } from "trama-forms/core";

const kinds = [
  { value: "a", label: "A" },
  { value: "b", label: "B" },
];
// A saved document with a note, its tags, and its lines.
const document = defineForm({
  fields: { note: field.text(), tags: field.multiSelect({ options: kinds }) },
  collections: { lines: { fields: { price: field.number() } } },
});

export const run = (log: (label: string, value: unknown) => void) => {
  const session = createSession(document, {
    initial: { note: "Saved", tags: ["a", "b"], lines: [{ price: 10 }, { price: 20 }] },
  });
  const dirty = (label: string) => {
    const { fieldStates, form, rows } = session.getSnapshot();
    log(label, {
      note: fieldStates.note.dirty,
      tags: fieldStates.tags.dirty,
      lines: form.collections.lines.dirty,
      rows: rows.lines.map((key) => session.row("lines", key).getSnapshot()?.dirty),
      form: form.dirty,
    });
  };
  dirty("on opening with saved data");
  session.edit("note", "Another note");
  dirty("note edited");
  session.edit("note", "Saved");
  session.edit("tags", ["b", "a"]);
  dirty("note restored and tags in a different order");
  const [first, second] = session.getSnapshot().rows.lines;
  if (first === undefined || second === undefined) return;
  session.move("lines", second, 0);
  dirty("lines in a different order");
  session.move("lines", second, 1);
  session.add("lines", [{}]);
  dirty("a new line");
  session.reset();
  dirty("after reset");
};
