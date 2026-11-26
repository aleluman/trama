// The negatives of async fields in rows: required params that rise to rules,
// params of a row, and the defineForm that takes them.
import {
  createForms,
  createSession,
  defineEndpoints,
  defineForm as coreDefineForm,
  endpoint,
  field as coreField,
} from "trama-forms/core";
import { defineForm, enabled, field, header, lineFields } from "./rows-async.js";

const collections = { lines: { fields: lineFields } };
const lotParams = ({
  product,
  warehouse,
}: {
  product: { value: string } | null;
  warehouse: string | null;
}) => (product === null || warehouse === null ? undefined : { product: product.value, warehouse });
// What every valid form needs: lot requires params, because lots requires them.
const lot = { params: lotParams };

// @ts-expect-error lots requires params: without rules, the form does not compile.
defineForm({ fields: header, collections });
// @ts-expect-error Nor with rules that lack the collection.
defineForm({ fields: header, collections, rules: {} });
// @ts-expect-error Nor with a collection without each.
defineForm({ fields: header, collections, rules: { lines: {} } });
// @ts-expect-error Nor with an each without lot.
defineForm({ fields: header, collections, rules: { lines: { each: {} } } });
defineForm({
  fields: header,
  collections,
  // @ts-expect-error Nor with an entry of lot without params.
  rules: { lines: { each: { lot: { hidden: () => false } } } },
});
defineForm({
  fields: header,
  collections,
  // @ts-expect-error params cannot be undefined then.
  rules: { lines: { each: { lot: { params: undefined } } } },
});
// @ts-expect-error Rules that may be left out by a spread cannot hold them either.
defineForm({
  fields: header,
  collections,
  ...(enabled ? { rules: { lines: { each: { lot } } } } : {}),
});
defineForm({ fields: header, collections, rules: { lines: { each: { lot } } } });

defineForm({
  fields: header,
  collections,
  rules: {
    lines: {
      each: {
        lot,
        // @ts-expect-error A number field of a row has no params.
        quantity: { params: () => ({}) },
      },
    },
  },
});
defineForm({
  fields: header,
  collections,
  rules: {
    lines: {
      each: {
        lot: {
          // @ts-expect-error The params of lot are those of lots: warehouse is missing.
          params: ({ product }) => (product === null ? undefined : { product: product.value }),
        },
      },
    },
  },
});
defineForm({
  fields: header,
  collections,
  rules: {
    lines: {
      each: {
        // @ts-expect-error null does not suspend; only undefined does.
        lot: { params: () => null },
      },
    },
  },
});
defineForm({
  fields: header,
  collections,
  rules: {
    lines: {
      each: {
        lot,
        // @ts-expect-error The whole list of lots does not fit field "price" of "lines".
        price: { query: { endpoint: "lots", params: lotParams } },
      },
    },
  },
});

coreDefineForm({
  fields: { note: coreField.text() },
  // @ts-expect-error The defineForm of trama-forms/core takes no async field in rows.
  collections: { lines: { fields: { product: field.async("products") } } },
});
const other = createForms({
  endpoints: [
    defineEndpoints({
      customers: endpoint.options(() =>
        Promise.resolve({ options: [{ value: 1, label: "One" }], more: false }),
      ),
    }),
  ],
});
other.defineForm({
  fields: { note: other.field.text() },
  // @ts-expect-error An async field of another registry, in a row.
  collections: { lines: { fields: { product: field.async("products") } } },
});

// A section of collections typed as a union may have async fields in any
// member: its sessions require a scope.
const withProducts = { lines: { fields: { product: field.async("products") } } };
const withNotes = { notes: { fields: { note: field.text() } } };
const chooseCollections = (on: boolean): typeof withProducts | typeof withNotes =>
  on ? withProducts : withNotes;
const chosen = defineForm({
  fields: { title: field.text() },
  collections: chooseCollections(true),
});
// @ts-expect-error scope is required, also when only a member of the union has async fields.
createSession(chosen);
// The fields of a row typed as a union: rules name only the fields of every
// member, so a field whose params are required in some member cannot be given
// them, and the form does not type-check.
const withLot = { fields: { lot: field.async("lots") } };
const withNote = { fields: { note: field.text() } };
const chooseFields = (on: boolean): typeof withLot | typeof withNote => (on ? withLot : withNote);
// @ts-expect-error lots requires params in a member of the union.
defineForm({ fields: { title: field.text() }, collections: { lines: chooseFields(true) } });
