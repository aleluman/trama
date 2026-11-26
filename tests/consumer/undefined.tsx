import { createSession, defineForm, field } from "trama-forms/core";
import {
  createReactBinding,
  type CheckboxFieldProps,
  type NumberFieldProps,
  type SelectFieldProps,
  type TextFieldProps,
} from "trama-forms/react";

const enabled = Math.random() < 2;
const when = <T,>(value: T): T | undefined => (enabled ? value : undefined);
const options = [
  { value: "ES", label: "Spain" },
  { value: "MX", label: "Mexico" },
] as const;

// An optional property with an explicit undefined means the same as leaving it
// out: in field definitions, in the configuration of field.*, and in
// hand-written fields.
const shape = {
  country: field.select({
    options,
    label: undefined,
    default: when("ES"),
    disabled: undefined,
    readOnly: when("Read-only"),
    hidden: undefined,
    required: when(true),
  }),
  city: field.text({ label: when("City"), placeholder: undefined, default: undefined }),
  total: field.number({ placeholder: when("0"), default: when(null) }),
  confirmed: field.checkbox({ label: undefined, default: undefined, hidden: when(false) }),
  note: { type: "text", label: undefined, placeholder: undefined, default: undefined },
} as const;

// In the sections of defineForm, in inline entries and their properties, and
// in the lock.
const form = defineForm({
  fields: shape,
  rules: {
    country: undefined,
    city: {
      value: enabled ? ({ country }) => (country === "ES" ? "Madrid" : undefined) : undefined,
      disabled: undefined,
      readOnly: enabled ? [({ confirmed }) => confirmed && "Confirmed"] : undefined,
      hidden: enabled ? ({ country }) => country === null : undefined,
      required: undefined,
      label: undefined,
      placeholder: enabled ? () => "e.g., Madrid" : undefined,
      states: undefined,
      onChange: undefined,
    },
    total: enabled ? { disabled: ({ confirmed }) => confirmed } : undefined,
    confirmed: { onChange: enabled ? () => ({ note: "" }) : undefined },
  },
  form: {
    readOnly: enabled
      ? [
          { value: ({ confirmed }) => confirmed, except: when(["confirmed"] as const) },
          { value: () => false, except: undefined },
        ]
      : undefined,
  },
  outputs: undefined,
});
defineForm({ fields: shape, rules: undefined, form: undefined });
defineForm({ fields: shape, form: { readOnly: undefined } });
defineForm({ fields: shape, form: { readOnly: { value: () => true, except: undefined } } });
// A whole section that may be undefined still types its formulas.
defineForm({
  fields: shape,
  rules: enabled ? { city: { hidden: ({ country }) => country === null } } : undefined,
  form: enabled ? { readOnly: { value: ({ confirmed }) => confirmed } } : undefined,
});

// Reused objects, spreads and unions of entries and of whole sections.
const entry = { hidden: when(() => true), label: undefined };
const entries = { city: entry, total: undefined };
defineForm({ fields: shape, rules: { city: entry, total: undefined } });
defineForm({ fields: shape, rules: entries });
defineForm({ fields: shape, rules: { city: { ...entry, required: undefined } } });
defineForm({
  fields: shape,
  rules: {
    country: undefined,
    ...(enabled ? { city: { hidden: undefined } } : { total: undefined }),
  },
});
const pickRules = (on: boolean) => (on ? { city: { hidden: undefined } } : { total: undefined });
defineForm({ fields: shape, rules: pickRules(enabled) });
const lock = { readOnly: when({ value: () => true }) };
defineForm({ fields: shape, form: lock });
const pickForm = (on: boolean) =>
  on ? { readOnly: undefined } : { readOnly: { value: () => true, except: undefined } };
defineForm({ fields: shape, form: pickForm(enabled) });

// In the options of createSession and watchOutputs.
const session = createSession(form, { initial: undefined });
createSession(form, { initial: when({ city: "Barcelona" }) });
const ignore = (value: unknown) => void value;
session.watchOutputs(ignore, { onError: undefined });
session.watchOutputs(ignore, { onError: when(ignore) });

// In the registry of the binding, where undefined registers nothing, and in the
// presentation props of Field.
const text = (props: TextFieldProps) => <span>{props.value}</span>;
const number = (props: NumberFieldProps) => <span>{props.value}</span>;
const checkbox = (props: CheckboxFieldProps) => <span>{String(props.value)}</span>;
const select = (props: SelectFieldProps) => <span>{props.value}</span>;
const ui = createReactBinding({ text, number, checkbox, select });
const view = (
  <ui.Field session={session} name="city" label={when("Municipality")} placeholder={undefined} />
);
void view;
const textOnly = defineForm({ fields: { title: field.text() } });
createReactBinding({ text, select: undefined }).useFormSession(textOnly);
export function Editor() {
  ui.useFormSession(form, { key: undefined, initial: undefined });
  return null;
}

// Explicit type arguments, partial or with every section, take undefined too.
defineForm<typeof shape>({ fields: shape });
defineForm<typeof shape, {}, {}, {}>({ fields: shape, rules: undefined, form: undefined });

// The names of the outputs are part of the definition's type: a section of
// outputs that may be undefined declares none.
defineForm({ fields: shape, outputs: enabled ? () => ({}) : undefined });
// @ts-expect-error A section of outputs that may be undefined cannot declare outputs.
defineForm({
  fields: shape,
  outputs: enabled ? ({ output }) => ({ caption: output(({ city }) => city) }) : undefined,
});

// Required members do not take undefined.
// @ts-expect-error fields is required.
defineForm({ fields: undefined });
// @ts-expect-error A select needs its options.
field.select({ options: undefined });
defineForm({
  fields: shape,
  // @ts-expect-error The lock needs its formula.
  form: { readOnly: { value: undefined } },
});
defineForm({
  fields: shape,
  // @ts-expect-error An array only takes formulas.
  rules: { city: { hidden: [undefined] } },
});

// Every check still applies to a section, an entry or a property that may be
// undefined.
defineForm({
  fields: shape,
  // @ts-expect-error A section that may be undefined keeps its checks.
  rules: enabled ? { city: { hiden: () => true } } : undefined,
});
defineForm({
  fields: shape,
  // @ts-expect-error An entry that may be undefined keeps its checks.
  rules: { city: enabled ? { hiden: () => true } : undefined },
});
defineForm({
  fields: shape,
  // @ts-expect-error A lock that may be undefined keeps its checks.
  form: enabled ? { readOnly: { value: () => "" } } : undefined,
});
const foreignRules = { ghost: { hidden: () => true } };
const sectionFrom = (on: boolean): typeof entries | typeof foreignRules =>
  on ? entries : foreignRules;
defineForm({
  fields: shape,
  // @ts-expect-error A union of sections that may be undefined keeps its checks.
  rules: enabled ? sectionFrom(enabled) : undefined,
});

// Unknown keys are rejected even when they are undefined.
defineForm({
  fields: shape,
  // @ts-expect-error Entries name fields of the definition.
  rules: { ghost: undefined },
});
defineForm({
  fields: shape,
  // @ts-expect-error Entries only take rule properties.
  rules: { city: { ghost: undefined } },
});
defineForm({
  fields: shape,
  // @ts-expect-error form only takes readOnly.
  form: { ghost: undefined },
});
defineForm({
  fields: shape,
  // @ts-expect-error A lock entry only takes value and except.
  form: { readOnly: { value: () => true, ghost: undefined } },
});
// @ts-expect-error defineForm only takes its sections.
defineForm({ fields: shape, ghost: undefined });
// @ts-expect-error Unknown registry entries have no renderer contract.
createReactBinding({ text, time: undefined });

// placeholder stays where the field type declares it.
// @ts-expect-error A checkbox has no placeholder.
field.checkbox({ placeholder: undefined });
// @ts-expect-error A select has no placeholder.
field.select({ options, placeholder: undefined });
defineForm({
  fields: shape,
  // @ts-expect-error A checkbox entry has no placeholder.
  rules: { confirmed: { placeholder: undefined } },
});
defineForm({
  fields: shape,
  // @ts-expect-error A select entry has no placeholder.
  rules: { country: { placeholder: undefined } },
});
// @ts-expect-error Field has no placeholder for a checkbox.
const checkboxPlaceholder = <ui.Field session={session} name="confirmed" placeholder={undefined} />;
void checkboxPlaceholder;

// An undefined renderer does not cover its field type.
export function Uncovered() {
  // @ts-expect-error The registry has no select renderer.
  createReactBinding({ text, number, checkbox, select: undefined }).useFormSession(form);
  return null;
}

// Initial values are data: undefined is not a value of any field.
// @ts-expect-error An initial value cannot be undefined.
createSession(form, { initial: { city: undefined } });
