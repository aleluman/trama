import { labelAt, pathLabel, type Field } from "./address.js";
import type { FieldEvent } from "./rules.js";
export type { Field } from "./address.js";

// A field of the header or of a row, or an event: the steps an attempt settles.
export type Step = Field | FieldEvent;
export const isEvent = (step: Step): step is FieldEvent =>
  typeof step === "object" && "handler" in step;
// A field that settled without its writer event, which was still settling; the
// stack that reached the field; and the step where the cycle would close: the
// event when the field reached it as a writer, or the field when the event read
// it again.
export type Deferred = {
  readonly event: FieldEvent;
  readonly name: Field;
  readonly stack: readonly Step[];
  readonly step: Step;
};

// Keeps the annotations of each event in the order they happened, so that its
// patch checks only its own.
export const annotate = (annotations: Map<FieldEvent, Deferred[]>, deferred: Deferred) => {
  const list = annotations.get(deferred.event);
  if (list === undefined) annotations.set(deferred.event, [deferred]);
  else list.push(deferred);
};

// The first writer edge on the path of a cycle: a field that settles and, right
// above it, one of its writer events, skipping the events given. The path runs
// above the last appearance of the step reached again: the edge that leaves the
// step is the one being confirmed, or not a writer edge.
export const writerEdge = (
  stack: readonly Step[],
  step: Step,
  skip: readonly FieldEvent[],
): FieldEvent | undefined => {
  for (let at = stack.lastIndexOf(step) + 1; at < stack.length - 1; at++) {
    const event = stack[at + 1];
    if (
      event !== undefined &&
      !isEvent(stack[at] as Step) &&
      isEvent(event) &&
      !skip.includes(event)
    )
      return event;
  }
  return undefined;
};

// The cycle closes at the step reached again. An event that closes it, as the
// writer skipped or as the reader, is named; otherwise the field reached again is.
// A field that completes without its writer event appears twice on the stack, so
// the path starts at its last appearance.
export const cycle = (stack: readonly Step[], step: Step) => {
  const reader = stack.at(-1);
  const closer = !isEvent(step) && reader !== undefined && isEvent(reader) ? reader : step;
  const rule = isEvent(closer) ? closer.label : `${labelAt(closer)} value`;
  const path = [...stack.slice(stack.lastIndexOf(step)), step].map((item) =>
    isEvent(item)
      ? `${pathLabel(item.address)}.${item.edit ? "onEdit" : "onChange"}`
      : pathLabel(item),
  );
  return new Error(`${rule}: cyclic dependency ${path.join(" → ")}`);
};
