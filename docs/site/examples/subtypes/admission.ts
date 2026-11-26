import {
  createForms,
  defineForm as defineCoreForm,
  field as coreField,
  subtype,
} from "trama-forms/core";
import { field } from "../../forms.ts";

// A separate forms registry with a subtype of the same name.
const other = createForms({ endpoints: [], subtypes: { textarea: subtype.text() } });

export const run = (log: (label: string, value: unknown) => void) => {
  const attempt = (label: string, action: () => void) => {
    try {
      action();
      log(label, "accepted");
    } catch (error) {
      log(label, error);
    }
  };
  const notes = field.textarea({ presentation: { rows: 3 } });

  // A subtype field is accepted only in the forms and rule sets of its createForms.
  // @ts-expect-error TypeScript rejects it, and it is also checked at runtime.
  attempt("core defineForm", () => defineCoreForm({ fields: { notes } }));
  // The types accept it as the textarea of other, whose presentation is {}. At runtime,
  // Trama checks its identity.
  attempt("another forms registry", () => other.defineForm({ fields: { notes } }));
  // Its createForms marker survives a spread and is lost in JSON.
  attempt("spread", () => other.defineForm({ fields: { notes: { ...other.field.textarea() } } }));
  attempt("JSON", () =>
    other.defineForm({ fields: { notes: JSON.parse(JSON.stringify(notes)) as typeof notes } }),
  );
  // Presentation belongs to a subtype.
  attempt("presentation without a subtype", () =>
    defineCoreForm({ fields: { notes: { ...coreField.text(), presentation: { rows: 3 } } } }),
  );
  log("frozen presentation", Object.isFrozen(notes.presentation));
};
