// What createReactBinding builds at run time: the renderers and options it
// checks once, a Field that checks the coverage of its source and renders
// it, and a useFormSession that checks its definition. The public entry gives
// them their types.
import { memo } from "react";
import type { FormDefinition } from "../core/index.js";
import { checkBinding, coverageOf, type RendererTable } from "./coverage.js";
import { sourceOf } from "./field.js";
import { formStateOf } from "./form-state.js";
import { useSession, type SessionOptions } from "./opening.js";
import { typeProps, useFieldRenderer, type FieldProps } from "./render.js";

export const bind = (registry: object, options: unknown) => {
  const { loader, forms, showErrors } = checkBinding(registry, typeProps, options);
  const renderers: RendererTable = Object.freeze({ ...registry });
  const { assertCoverage, assertDefinition } = coverageOf(renderers, forms);
  const Field = (props: FieldProps) => {
    const source = sourceOf(props);
    if (source.definition === undefined) assertCoverage(source.fields, source.collection);
    else assertDefinition(source.definition);
    return useFieldRenderer(renderers, source, props, showErrors);
  };
  const useFormSession = (
    definition: FormDefinition,
    sessionOptions?: SessionOptions<FormDefinition>,
  ) => {
    assertDefinition(definition);
    return useSession(definition, sessionOptions ?? {}, loader);
  };
  // memo preserves the props contract.
  return { Field: memo(Field), useFormSession, useFormState: formStateOf(showErrors) };
};
