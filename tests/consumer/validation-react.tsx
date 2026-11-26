// Renderer validation props and the binding's showErrors option are inferred
// without annotations.
import { createSession, defineForm, field } from "trama-forms/core";
import { createReactBinding, type DateFieldProps, type TextFieldProps } from "trama-forms/react";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
export const errors: Equal<TextFieldProps["errors"], readonly string[]> = true;
export const warnings: Equal<TextFieldProps["warnings"], readonly string[]> = true;
export const dirty: Equal<TextFieldProps["dirty"], boolean> = true;
export const blur: Equal<TextFieldProps["onBlur"], () => void> = true;
export const input: Equal<DateFieldProps["onInputError"], (message?: string | undefined) => void> =
  true;

// A renderer that keeps its draft: it writes the value it converts, and
// reports the text it cannot convert.
const convert =
  ({ onChange, onInputError }: Pick<DateFieldProps, "onChange" | "onInputError">) =>
  (text: string) => {
    if (/^\d{4}-\d{2}-\d{2}$/u.test(text)) {
      onChange(text);
      onInputError();
    } else onInputError("Incomplete date");
  };
const DateText = (props: DateFieldProps) => {
  void convert(props);
  return <span aria-invalid={props.errors.length > 0}>{props.value}</span>;
};
const Text = (props: TextFieldProps) => <span>{props.value}</span>;

export const touched = createReactBinding({ date: DateText, text: Text });
export const attempted = createReactBinding({ date: DateText }, { showErrors: "attempted" });
// @ts-expect-error showErrors is "touched" or "attempted".
createReactBinding({ date: DateText }, { showErrors: "always" });

const trip = defineForm({ fields: { since: field.date(), note: field.text() } });
export const session = createSession(trip);
export const fields = <touched.Field session={session} name="since" />;
