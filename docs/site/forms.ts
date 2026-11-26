import { createForms, subtype, type OptionKey } from "trama-forms/core";
import { sales } from "./examples/complete/endpoints.ts";
import { pricing } from "./examples/queries/endpoints.ts";
import { catalog } from "./examples/remote/catalog.ts";
import { inventory } from "./examples/rows-async/endpoints.ts";

// Once per application, this combines the endpoint registries with the subtypes and returns
// defineForm, defineRules, and field with access to them. Definitions with async fields,
// queries, or subtypes import them from here.
export const forms = createForms({
  endpoints: [sales, pricing, inventory, catalog],
  subtypes: {
    // A text area with its rows.
    textarea: subtype.text<{ rows?: number }>(),
    // A toggle is a checkbox with a different renderer.
    toggle: subtype.checkbox(),
    // A search with a table where each column shows a key from its endpoint's option.
    search: subtype.async<{ columns: readonly { key: OptionKey; title: string }[] }>(),
  },
});
export const { defineForm, defineRules, field } = forms;
