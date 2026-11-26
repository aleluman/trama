import { createForms, defineEndpoints, endpoint } from "trama-forms/core";

// The defineForm and field of createForms, with an endpoint of customers that
// gives no options, for the async fields of a test.
export const remote = createForms({
  endpoints: [
    defineEndpoints({
      customers: endpoint.options(() => Promise.resolve({ options: [], more: false })),
    }),
  ],
});
