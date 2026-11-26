// The endpoints of the remote fields of a form, in the header and in the rows
// of each collection. Only the defineForm of createForms has a registry to
// resolve them in.
import { describe } from "./data.js";
import type { EndpointTable } from "./compiled.js";
import type { ResolvedEndpoint } from "./endpoints.js";
import { remote, type FieldDefinition } from "./fields.js";

// A remote field takes the options of an endpoint, never a value.
export const givesValue = "gives a value; use an options or list endpoint";
// Who declares fields and rules: a form, or a rule set. Without a registry,
// the diagnostics send each one to its function of createForms.
export type Owner = "Form" | "Rule set";
export const unbound = (owner: Owner) =>
  owner === "Form"
    ? "define the form with the defineForm of createForms"
    : "define the rule set with the defineRules of createForms";

// The endpoint of each async field among fields, by name; label names a field
// in the diagnostics, with its collection in a row.
export const resolveEndpoints = (
  fields: Readonly<Record<string, FieldDefinition>>,
  table: EndpointTable | undefined,
  label: (name: string) => string,
  owner: Owner,
): EndpointTable => {
  const resolved = new Map<string, ResolvedEndpoint>();
  for (const [name, item] of Object.entries(fields)) {
    if (!remote(item)) continue;
    const prefix = `${label(name)} (${item.type})`;
    if (table === undefined) throw new Error(`${prefix}: ${unbound(owner)}`);
    const found = table.get(item.endpoint);
    if (found === undefined)
      throw new Error(`${prefix}: unknown endpoint ${describe(item.endpoint)}`);
    if (found.kind === "value") throw new Error(`${prefix}: endpoint "${found.key}" ${givesValue}`);
    resolved.set(name, found);
  }
  return resolved;
};
