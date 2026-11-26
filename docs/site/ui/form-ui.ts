import { createReactBinding, queryLoader } from "trama-forms/react";
import { forms } from "../forms.ts";
import { queryClient } from "../lib/query";
import { AsyncInput } from "./async-input";
import { Chips } from "./chips";
import { DateInput } from "./date-input";
import { CheckboxInput, NumberInput, SelectInput, TextInput } from "./inputs";
import { MultiSelectInput } from "./multi-select";
import { SearchTable, Textarea } from "./subtypes";

// One registry per application connects each field type and each subtype in forms with its
// renderer, and the lists of async fields with the Query cache. All examples in this guide
// use this Field, useFormSession, and useFormState. A field's local errors appear when the
// field is touched or after an attempt, which is the default.
export const { Field, useFormSession, useFormState } = createReactBinding(
  {
    text: TextInput,
    number: NumberInput,
    checkbox: CheckboxInput,
    select: SelectInput,
    async: AsyncInput,
    date: DateInput,
    multiSelect: MultiSelectInput,
    multiAsync: Chips,
    textarea: Textarea,
    // The fallback to the base renderer is explicit.
    toggle: CheckboxInput,
    search: SearchTable,
  },
  { forms, loader: queryLoader(queryClient) },
);
