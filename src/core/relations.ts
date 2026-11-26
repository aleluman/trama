import { fieldLabel, templateLabel } from "./address.js";
import { describe, ownEntries } from "./data.js";
import type { Declaration } from "./declarations.js";
import type { Fields } from "./definition.js";
import { traitsOf } from "./field-traits.js";
import { accepts, fieldAt, isPlainRecord, SeparateCause, type FieldDefinition } from "./fields.js";
import type { RuleFormula } from "./reads.js";

type Relation = Extract<Declaration, { readonly property: "relation" }>;
type Driver = Pick<Relation, "collection" | "name" | "label">;

// The declaration reserves the driver and expands in its place to ordinary
// writers. Only the default member's event needs to move to the end.
export const relationOf = (
  driver: Driver,
  item: FieldDefinition,
  declared: unknown,
  fields: Fields,
): Declaration[] => {
  const { name, label, collection } = driver;
  const { formulas, fallback, members } = checkRelation(
    `${label} relation`,
    name,
    declared,
    fields,
  );
  checkDriver(`${label} relation`, item, members);
  const { empty } = traitsOf(item.type);
  const conducts = (value: unknown) => {
    if (value === empty) return fallback;
    if (typeof value === "string" && members.includes(value)) return value;
    throw new SeparateCause(`the driver "${name}" holds ${describe(value)}, which is no member`);
  };
  const formulasOfMembers: Declaration[] = [];
  const edits: Declaration[] = [];
  for (const [member, formula] of formulas) {
    const common = {
      collection,
      name: member,
      label: collection === undefined ? fieldLabel(member) : templateLabel(member, collection),
      drivenBy: name,
    };
    const value: RuleFormula = (values, tools) =>
      conducts(values[name]) === member ? undefined : formula(values, tools);
    const patch = Object.freeze({ [name]: member });
    const edit: RuleFormula = () => patch;
    formulasOfMembers.push(
      Object.freeze({ ...common, property: "value", formulas: [["", value]] as const }),
    );
    const event = Object.freeze({ ...common, property: "onEdit", formulas: [["", edit]] as const });
    if (member === fallback) edits.push(event);
    else edits.unshift(event);
  }
  return [
    Object.freeze({ ...driver, property: "relation", members }),
    ...formulasOfMembers,
    ...edits,
  ];
};

const checkRelation = (at: string, driver: string, declared: unknown, fields: Fields) => {
  if (!isPlainRecord(declared))
    throw new Error(`${at}: expected an object with default and members`);
  for (const key of Reflect.ownKeys(declared))
    if (key !== "default" && key !== "members")
      throw new Error(`${at}: unknown property "${String(key)}"`);
  const { members, default: fallback } = declared;
  if (!isPlainRecord(members))
    throw new Error(`${at} members: expected an object of formulas keyed by field`);
  const formulas = ownEntries(members).map(([member, formula]) => {
    if (member === driver) throw new Error(`${at}: the driver cannot be one of its members`);
    if (typeof member !== "string" || fieldAt(fields, member) === undefined)
      throw new Error(`${at}: member "${String(member)}" is not a field`);
    if (typeof formula !== "function")
      throw new Error(`${at} members.${member}: formula must be a function`);
    return [member, formula as RuleFormula] as const;
  });
  const names = Object.freeze(formulas.map(([name]) => name));
  if (names.length !== 2) throw new Error(`${at}: expected two members, got ${names.length}`);
  if (typeof fallback !== "string" || !names.includes(fallback))
    throw new Error(`${at} default: expected "${names[0]}" or "${names[1]}"`);
  return { formulas, fallback, members: names };
};

// The rule set and the receiving form each check their own field options.
export const checkDriver = (at: string, item: FieldDefinition, members: readonly string[]) => {
  if (item.type === "text") {
    if (members.includes("")) throw new Error(`${at}: a member cannot name the empty text ""`);
    return;
  }
  if (item.type !== "select")
    throw new Error(`${at}: ${item.type} fields cannot drive a relation; use a text or a select`);
  for (const member of members)
    if (!accepts(item, member))
      throw new Error(`${at}: member "${member}" is not an option of the select`);
  for (const { value } of item.options)
    if (!members.some((member) => member === value))
      throw new Error(`${at}: option ${describe(value)} of the select is not a member`);
};
