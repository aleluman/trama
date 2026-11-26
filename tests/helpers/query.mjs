import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { StrictMode, useLayoutEffect, useState } from "react";
import { defineForm, field } from "trama-forms/core";
import { createReactBinding, initialFromQuery } from "trama-forms/react";
import { createElement, deferred, mount } from "./react.mjs";

export const definition = defineForm({ fields: { title: field.text() } });
const { useFormSession } = createReactBinding({ text: () => null });

export const createQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
// Like the guide's client: the answers of Trama stay fresh.
export const createFreshClient = () => {
  const client = createQueryClient();
  client.setQueryDefaults(["trama"], { staleTime: Infinity });
  return client;
};

export async function setup(options = {}) {
  const client = createQueryClient();
  const requests = [];
  let editor;
  let query;
  if (options.cached)
    client.setQueryData(["task"], options.cached, { updatedAt: options.updatedAt ?? 1 });
  function Editor(props) {
    const [local, setLocal] = useState(0);
    const currentQuery = useQuery({
      queryKey: props.id === undefined ? ["task"] : ["task", props.id],
      queryFn: ({ signal, queryKey }) => {
        const request = { ...deferred(), signal, key: queryKey };
        requests.push(request);
        return request.promise;
      },
      staleTime: options.staleTime ?? 0,
      ...options.query,
      ...props.query,
    });
    void currentQuery.fetchStatus;
    const currentEditor = useFormSession(options.definition ?? definition, {
      key: props.id,
      initial: props.isNew ? undefined : initialFromQuery(currentQuery),
    });
    useLayoutEffect(() => {
      query = currentQuery;
      editor = currentEditor;
    });
    return createElement("button", { onClick: () => setLocal(local + 1) }, String(local));
  }
  const view = await mount(queryApp(client, Editor, options.strict), options.props);
  return {
    client,
    requests,
    view,
    get editor() {
      return editor;
    },
    get query() {
      return query;
    },
    async close() {
      await view.unmount();
      client.clear();
    },
  };
}

function queryApp(client, Editor, strict) {
  return (props) =>
    createElement(
      QueryClientProvider,
      { client },
      strict
        ? createElement(StrictMode, null, createElement(Editor, props))
        : createElement(Editor, props),
    );
}
