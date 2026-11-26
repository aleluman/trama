import { Example } from "../lib/Example";
import { Link } from "../lib/router";
import { Snippet } from "../lib/Snippet";
import { RemoteMultiple } from "./RemoteMultiple";

export const RemoteSelection = () => (
  <>
    <h1>Remote select</h1>
    <p className="lead">
      An async field selects an option from an endpoint, such as a customer among hundreds, with
      server-side search and pagination, or one of that customer's contacts, which arrive as a
      complete list. The field's value is the selected option, with the data that the rules read.
    </p>
    <Snippet>{`// Declare endpoints once, without React or TanStack Query.
const sales = defineEndpoints({
  customers: endpoint.options(async ({ search, page, signal }) => ({ options, more })),
  contacts: endpoint.list(async ({ signal }, { customer }: { customer: number }) => options),
});
export const { defineForm, field } = createForms({ endpoints: [sales] });

// The definition refers to them by key.
fields: {
  customer: field.async("customers", { label: "Customer", placeholder: "Search for a customer" }),
  contact: field.async("contacts", { label: "Contact" }),
},
rules: {
  customer: { onChange: ({ customer }) => ({ contact: customer?.defaultContact ?? null }) },
  contact: {
    params: ({ customer }) => (customer === null ? undefined : { customer: customer.value }),
  },
},

// The session sets its scope.
const editor = useFormSession(order, { key, scope: "south-trading" });`}</Snippet>

    <h2 id="endpoints">Endpoints and registry</h2>
    <ul>
      <li>
        <code>endpoint.options(load)</code> returns options in pages with server-side search.{" "}
        <code>{"load({ search, page, signal, scope }, params)"}</code> returns{" "}
        <code>{"{ options, more }"}</code>. <code>page</code> starts at 1, and <code>more</code>{" "}
        indicates whether there is another page.
      </li>
      <li>
        <code>endpoint.list(load)</code> returns the complete list.{" "}
        <code>{"load({ signal, scope }, params)"}</code> returns the options, which are searched
        locally by label, ignoring case and accents.
      </li>
      <li>
        <code>endpoint.value(load)</code> returns a single value for a{" "}
        <Link to="queries">query</Link> to write. Async fields accept only endpoints that return
        options.
      </li>
      <li>
        Each option has a unique <code>value</code> (a string or a number) and a <code>label</code>,
        plus the data the rules read, which must be plain data.{" "}
        <code>Option&lt;Metadata, Value&gt;</code> gives its type. Declare metadata with{" "}
        <code>type</code> because <code>interface</code> is unsupported.
      </li>
      <li>
        <code>defineEndpoints</code> groups endpoints by key. <code>createForms</code> joins the
        application's registries and returns the <code>defineForm</code> and <code>field</code> that
        know about them. <code>field.async(key, config)</code> is only available there. An unknown
        key or a key declared in two registries is an error in TypeScript and at runtime, and{" "}
        <code>defineForm</code> from <code>trama-forms/core</code> rejects async fields.
      </li>
    </ul>
    <Example
      id="sales-endpoints-and-guide-registry"
      title="The sales endpoints and this guide's registry"
      files={["examples/complete/endpoints.ts", "forms.ts"]}
    />

    <h2 id="search-and-pages">Search and pages</h2>
    <ul>
      <li>
        Each view of an async field has its own option list. Each call to <code>open()</code>{" "}
        requests page 1 with the current search. For a paged endpoint, <code>search(text)</code>{" "}
        discards the pages and requests page 1 with the new text. A complete list that has loaded
        filters its options locally. <code>more()</code> adds the next page. The list never writes
        to the session.
      </li>
      <li>
        An option that appears on more than one page keeps its first occurrence, and a late response
        to an earlier search is discarded.
      </li>
      <li>
        The renderer decides when to open and search. This guide's renderer opens the list when you
        enter the search box and searches 250 ms after the last keystroke. Each view keeps its
        search text. When you reopen it, the renderer requests page 1 again with that text and
        selects it so that typing replaces it.
      </li>
    </ul>
    <Example
      id="paged-customers-with-server-search"
      title="Paginated customers with server-side search"
      files={["examples/remote/search.tsx"]}
      steps={[
        "Open “Customer”. It shows 20 options and “Load more”.",
        "Click “Load more”. The next 20 arrive, bringing the list to 40 with another page still available.",
        "Press Escape and reopen “Customer”. The list starts again at page 1. The page is still fresh in the TanStack Query cache, so it arrives without waiting for the server.",
        "Type “orbita” without the accent. The six “Órbita” options remain and “Load more” disappears.",
        "Choose “Órbita Trading”. snapshot.values stores the complete option, including its default contact, Camila, and its delivery hint.",
      ]}
    />

    <h2 id="parameters-and-suspension">Parameters and suspension</h2>
    <ul>
      <li>
        <code>params</code>, in the <code>rules</code> entry for an async field, calculates the
        parameters that <code>load</code> receives. <code>(values, {"{ peek }"}) =&gt;</code> a
        plain object or <code>undefined</code>. It recalculates when a field it reads changes. If
        the form declares a <Link to="context">context</Link>, the rule receives it too.
      </li>
      <li>
        <code>undefined</code> suspends the list, leaving it without options or requests. If the
        endpoint has required parameters, TypeScript requires <code>params</code>. Without a rule,
        the endpoint receives <code>{"{}"}</code>.
      </li>
      <li>
        Parameters with equal data count as unchanged. If they change, the list discards its pages
        and requests page 1 again if it has already been opened. A parameter change leaves the
        selection in place. Declare an event to clear it when the parent field changes.
      </li>
    </ul>
    <Example
      id="contacts-by-customer"
      title="Contacts that depend on the customer"
      files={["examples/remote/dependent.tsx"]}
      steps={[
        "Open “Contact”. Without a customer, the list is suspended and shows “Fill in the fields this depends on first.”",
        "In “Customer”, type “horizon” and choose “Horizon Distribution”. Open “Contact” and its contacts, Gloria and Héctor, arrive.",
        "Type “hector” without the accent. After a short wait, only Héctor remains, without showing “Loading…” because the complete list is searched locally. Choose Héctor.",
        "In “Customer”, type “compass” and choose “Compass Trading”, which has no contacts. Open “Contact” and you see “No results.” This is a successful response. Héctor stays selected because changing the parameters keeps the field's value.",
        "Click “Remove” in “Customer” and open “Contact”. The list is suspended again, and Héctor stays selected.",
      ]}
    />

    <h2 id="the-option-is-the-value">The option is the value</h2>
    <ul>
      <li>
        The value of an async field is the complete option or <code>null</code>.{" "}
        <code>initial</code>, <code>edit</code>, events, formulas, and <code>default</code> take the
        complete option for a selection. Its <code>value</code> alone is insufficient.
      </li>
      <li>
        Trama copies and freezes the option on write, so the original object stays independent. Data
        that is not plain is rejected with its path, as in{" "}
        <code>option must be plain data: a Date at "since"</code>.
      </li>
      <li>
        The <code>value</code> provides the identity. Writing another option with the same{" "}
        <code>value</code> keeps the current option and counts as unchanged, so it triggers no
        events.
      </li>
      <li>
        Rules read the typed metadata. An event can copy a nested option to another async field, and
        a formula can read an item of metadata.
      </li>
    </ul>
    <Example
      id="metadata"
      title="Default contact and delivery hint"
      files={["examples/remote/metadata.tsx"]}
      steps={[
        "Choose “Prisma Trading”. The contact changes to Camila, its default contact, and the note suggests “Call on arrival”.",
        "Choose Diego in “Contact”, then choose “Prisma Trading” again in “Customer”. Diego stays selected. The option has the same value, so there is no change or event.",
        "In “Customer”, type “compass” and choose “Compass Trading”. It has no contacts, so the contact changes to null, and the note suggests “Deliver to the warehouse”.",
        "Click “Remove” in “Customer”. The contact stays null, and the note goes back to “No instructions”, the placeholder from the definition.",
      ]}
    />

    <h2 id="lists-per-view">Lists per view</h2>
    <ul>
      <li>
        <code>session.list(name)</code> creates an option list for a view. The binding creates one
        for each mounted <code>Field</code>. A hidden field creates none.
      </li>
      <li>
        <code>getSnapshot()</code> returns a frozen{" "}
        <code>{"{ status, text, options, complete, error }"}</code>. <code>status</code> is{" "}
        <code>"idle"</code> until opening, <code>"suspended"</code>, <code>"loading"</code>,{" "}
        <code>"ready"</code>, or <code>"error"</code>. An empty response is <code>"ready"</code>.
      </li>
      <li>
        The actions are <code>open()</code>, <code>search(text)</code>, <code>more()</code> (only in{" "}
        <code>"ready"</code> with more pages), and <code>retry()</code> (only in{" "}
        <code>"error"</code>). Retrying requests the failed page again and keeps the earlier pages.
      </li>
      <li>
        Only a list with subscribers makes requests to the loader. The list stores errors in{" "}
        <code>error</code> without throwing them, as in{" "}
        <code>Field "customer" list: request failed: …</code>, with the original error in{" "}
        <code>cause</code>.
      </li>
    </ul>
    <Example
      id="two-views-of-the-same-field"
      title="Two views of the same field"
      files={["examples/remote/two-views.tsx"]}
      steps={[
        "In view A, type “café” to show the ten cafés.",
        "Press Escape and type “bookshop” in view B to show the ten bookshops.",
        "Press Escape and reopen view A. It keeps “café” and its options. Each view searches separately.",
        "Choose “Atlas Café” in view A. Both views show the same value, the field's value.",
      ]}
    />

    <h2 id="loader">Scope and loader</h2>
    <ul>
      <li>
        <code>scope</code>, a string or finite number, separates remote data, for example by
        company. If the form has async fields or queries, <code>scope</code> is required in
        TypeScript and at runtime in <code>createSession</code> and <code>useFormSession</code>. In{" "}
        <code>useFormSession</code>, changing it requires a different <code>key</code>.{" "}
        <code>load</code> receives the scope. The rules read a separate{" "}
        <Link to="context">context</Link>. A company can provide both.
      </li>
      <li>
        Trama builds each request's key using{" "}
        <code>["trama", scope, endpoint, params, search, page]</code> for a page and{" "}
        <code>["trama", scope, endpoint, params]</code> for a complete list or value.
      </li>
      <li>
        The loader runs the requests. The <code>createSession</code> loader runs them directly and
        stores nothing. Passing <code>queryLoader(queryClient)</code> to{" "}
        <code>createReactBinding</code> uses the TanStack Query cache. Sessions with the same scope
        share pages, and <code>setQueryDefaults(["trama"], {"{ staleTime }"})</code> determines how
        long they stay fresh.
      </li>
      <li>
        Each opening goes through the loader, and the cache determines whether it reaches the
        server. Invalidating the TanStack Query cache leaves an open list unchanged. The change
        appears when the list reopens.
      </li>
    </ul>
    <Example
      id="guide-loader"
      title="This guide's loader"
      files={["ui/form-ui.ts", "lib/query.ts"]}
    />

    <h2 id="renderer">The renderer</h2>
    <p>
      <code>AsyncFieldProps</code> adds <code>placeholder</code> and <code>list</code> to the common
      props. <code>list</code> contains the snapshot of the view's list and its actions, which keep
      their identity. The binding ignores <code>onChange</code> while the field is disabled or
      read-only. The list actions have no such guard. See{" "}
      <Link to="react" section="renderer-registry">
        React
      </Link>
      .
    </p>
    <Example id="combo" title="This guide's async renderer" files={["ui/async-input.tsx"]} />

    <RemoteMultiple />

    <h2 id="limits">Limits</h2>
    <ul>
      <li>
        Automatic clearing, free-form values, and local filtering by metadata are unsupported.
        Declare automatic selection with a{" "}
        <Link to="queries" section="auto-selecting-the-only-option">
          query
        </Link>
        . Pages use numbers only.
      </li>
      <li>
        Required <code>params</code> is checked only in TypeScript.
      </li>
      <li>
        Metadata declared with <code>interface</code> fails to satisfy the plain-data index, and{" "}
        <code>DeepReadonly</code> can conflict with mutable application types. Symbol keys in
        metadata and <code>params</code> pass unchecked in TypeScript and are rejected at runtime.
      </li>
      <li>
        Options for <code>field.select</code> carry no metadata.
      </li>
      <li>
        Trama leaves a child <code>multiAsync</code> intact when its parent changes to another
        nonempty set. An event cannot read the field it writes. It can clear the child when the
        parent becomes empty.
      </li>
      <li>
        Trama has no ID hydration. To restore a filter from the URL, the application builds the
        complete options on opening and passes them in <code>initial</code>.
      </li>
    </ul>
    <p>
      The <Link to="complete-example">Complete example</Link> uses these endpoints in an order that
      opens with its customer and contact. See <Link to="async-in-rows">Async in rows</Link> for
      async fields in collection rows.
    </p>
  </>
);
