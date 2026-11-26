import type { FieldDefinition, FormDefinition, Loader } from "../core/index.js";
import type { ShowErrors } from "./visible-messages.js";

// The renderers of a binding by field type or subtype, as its checks see
// them. The types of the entry keep the names that the declarations of a
// consumer expand.
export type RendererTable = Readonly<Record<string, unknown>>;
// The forms of a binding, as its checks see them: its field names its
// subtypes, and its defineRules admits the fields of a template.
type Forms = {
  readonly field: Readonly<Record<string, unknown>>;
  readonly defineRules: (config: object) => unknown;
};
type Fields = Readonly<Record<string, FieldDefinition>>;

// The subtype of a field, undefined for a field of a base type.
export const subtypeOf = (item: FieldDefinition) => (item as { readonly subtype?: string }).subtype;
// How a diagnostic names the subtype of a field.
const subtypeLabel = (subtype: string | undefined) => `subtype ${JSON.stringify(subtype)}`;
// A field takes the renderer of its subtype, or else of its type.
export const rendererOf = (renderers: RendererTable, item: FieldDefinition, label: string) => {
  const subtype = subtypeOf(item);
  const key = subtype ?? item.type;
  const Renderer = Object.hasOwn(renderers, key) ? renderers[key] : undefined;
  if (Renderer === undefined)
    throw new Error(
      `${label} (${subtype === undefined ? key : subtypeLabel(subtype)}): missing renderer`,
    );
  return Renderer;
};

// Every field of a definition, also of its collections, or of a row, needs
// the renderer of its subtype or of its type. Before, the fields of subtypes
// need the forms of the binding, whose defineRules admits them: it compiles no
// rules and calls no endpoint. Each template of fields is checked once.
export const coverageOf = (renderers: RendererTable, forms: Forms | undefined) => {
  const checked = new WeakSet<object>();
  // A field of a row is named with its collection.
  const assertCoverage = (fields: Fields, collection?: string) => {
    if (checked.has(fields)) return;
    const of = collection === undefined ? "" : ` of "${collection}"`;
    admit(forms, fields, collection, of);
    for (const [name, item] of Object.entries(fields))
      rendererOf(renderers, item, `Field "${name}"${of}`);
    checked.add(fields);
  };
  const assertDefinition = (definition: FormDefinition) => {
    if (checked.has(definition)) return;
    assertCoverage(definition.fields);
    const collections = definition.collections as Readonly<
      Record<string, { readonly fields: Fields }>
    >;
    for (const [name, collection] of Object.entries(collections))
      assertCoverage(collection.fields, name);
    checked.add(definition);
  };
  return { assertCoverage, assertDefinition };
};
const admit = (
  forms: Forms | undefined,
  fields: Fields,
  collection: string | undefined,
  of: string,
) => {
  const subtyped = Object.entries(fields).filter(([, item]) => subtypeOf(item) !== undefined);
  const [first] = subtyped;
  if (first === undefined) return;
  if (forms === undefined)
    throw new Error(
      `Field "${first[0]}"${of} (${subtypeLabel(subtypeOf(first[1]))}): pass its forms to createReactBinding`,
    );
  const template = Object.fromEntries(subtyped);
  forms.defineRules(
    collection === undefined
      ? { fields: template, rules: {} }
      : { collections: { [collection]: { fields: template } }, rules: {} },
  );
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
type Options = {
  readonly loader: Loader | undefined;
  readonly forms: Forms | undefined;
  readonly showErrors: ShowErrors;
};
const bindingOptions = (options: unknown): Options => {
  if (options === undefined) return bindingOptions({});
  if (!isObject(options)) throw new Error("Binding options must be an object");
  for (const key of Object.keys(options))
    if (key !== "loader" && key !== "forms" && key !== "showErrors")
      throw new Error(`Binding options: unknown property "${key}"`);
  const { loader, forms, showErrors = "touched" } = options;
  if (showErrors !== "touched" && showErrors !== "attempted")
    throw new Error('createReactBinding: showErrors must be "touched" or "attempted"');
  if (loader !== undefined && typeof loader !== "function")
    throw new Error("Binding loader must be a function");
  if (
    forms !== undefined &&
    (!isObject(forms) || !isObject(forms.field) || typeof forms.defineRules !== "function")
  )
    throw new Error("Binding forms must be returned by createForms");
  return { loader: loader as Loader | undefined, forms: forms as Forms | undefined, showErrors };
};

// A binding takes an object whose keys are field types, or subtypes of its
// forms, each with a renderer or undefined, and its options, checked in this
// order: the object, the options and each renderer. Returns the options
// checked: the loader, the forms and when the renderers show the errors.
export const checkBinding = (registry: unknown, types: object, options: unknown) => {
  if (!isObject(registry)) throw new Error("Renderer registry must be an object");
  const checked = bindingOptions(options);
  const { forms } = checked;
  // Besides the field types, the field of forms has a factory per subtype.
  for (const [kind, renderer] of Object.entries(registry)) {
    if (!Object.hasOwn(types, kind) && (forms === undefined || !Object.hasOwn(forms.field, kind)))
      throw new Error(
        forms === undefined
          ? `${kind}: invalid renderer`
          : `"${kind}" is neither a field type nor a subtype of forms`,
      );
    if (renderer !== undefined && !isRenderer(renderer))
      throw new Error(`${kind}: invalid renderer`);
  }
  return checked;
};

const isRenderer = (value: unknown): boolean => {
  if (typeof value === "function") return true;
  if (typeof value !== "object" || value === null || !("$$typeof" in value)) return false;
  return [
    Symbol.for("react.memo"),
    Symbol.for("react.forward_ref"),
    Symbol.for("react.lazy"),
  ].includes(value.$$typeof as symbol);
};
