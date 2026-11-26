import { StrictMode, useLayoutEffect } from "react";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { defineForm, field } from "trama-forms/core";
import {
  createReactBinding,
  initialFromQuery,
  OutputBoundary,
  useOutputs,
} from "trama-forms/react";
import { createElement as h, deferred, mount } from "./react.mjs";
import { createQueryClient } from "./query.mjs";

export const form = defineForm({
  fields: { amount: field.number(), title: field.text() },
  outputs: ({ output }) => {
    const amount = output((values) => {
      if (!values.amount || values.amount < 0) throw new Error("Positive amount required");
      return { doubled: values.amount * 2 };
    });
    const caption = output((_, { read }) => `${read(amount).doubled} units`);
    const independent = output((values) => {
      if (!values.title) throw new Error("Title required");
      return values.title;
    });
    return { caption, independent };
  },
});

export async function mountQueryBoundary() {
  const request = deferred();
  const client = createQueryClient();
  const { useFormSession } = createReactBinding({ number: () => null, text: () => null });
  let editor;
  let loads = 0;
  let attempts = 0;
  function Summary({ session }) {
    attempts++;
    const { caption } = useOutputs(session);
    return h("output", null, caption);
  }
  function Editor() {
    const query = useQuery({
      queryKey: ["boundary"],
      queryFn: () => {
        loads++;
        return request.promise;
      },
      staleTime: Infinity,
    });
    const current = useFormSession(form, { initial: initialFromQuery(query) });
    useLayoutEffect(() => {
      editor = current;
    });
    if (current.status !== "ready") return current.status;
    return h(
      "div",
      null,
      h("button", { onClick: () => current.session.edit("amount", 2) }, "Edit"),
      h(
        OutputBoundary,
        { session: current.session, fallback: "Summary unavailable" },
        h(Summary, { session: current.session }),
      ),
    );
  }
  return {
    view: await mount(() => h(StrictMode, null, h(QueryClientProvider, { client }, h(Editor)))),
    request,
    client,
    getEditor: () => editor,
    getLoads: () => loads,
    getAttempts: () => attempts,
  };
}
