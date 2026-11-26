import { Example } from "../lib/Example";
import { Link } from "../lib/router";
import { Snippet } from "../lib/Snippet";

export const Queries = () => (
  <>
    <h1>Queries</h1>
    <p className="lead">
      A query requests a value from an endpoint and writes the response to the form, such as a price
      based on the customer or a rate based on the currency. Declare it in the <code>rules</code>{" "}
      entry for the field it writes. A saved record keeps its saved value, a new record runs the
      query, and a late response never overwrites an edit.
    </p>
    <Snippet>{`// Declare a value endpoint in a registry, just like an options endpoint.
const pricing = defineEndpoints({
  listPrice: endpoint.value(({ signal }, { customer }: { customer: number }) =>
    fetchListPrice(customer, signal),
  ),
});

// Put the query in the entry for the field it writes.
rules: {
  price: {
    query: {
      endpoint: "listPrice",
      params: ({ customer }) => (customer === null ? undefined : { customer }),
    },
  },
},

// The session sets its scope.
const editor = useFormSession(orderLine, { scope: "south-trading" });`}</Snippet>
    <h2 id="endpoints">Value endpoints</h2>
    <ul>
      <li>
        <code>endpoint.value(load)</code> delivers a value.{" "}
        <code>{"load({ signal, scope }, params)"}</code> returns a promise of plain data. Trama
        validates, copies, and freezes it. Non-plain data fails with its path, as in{" "}
        <code>Endpoint "listPrice": result must be plain data: a Date at "since"</code>.{" "}
        <code>undefined</code> is also valid and writes nothing.
      </li>
      <li>
        Register it with <code>defineEndpoints</code> in the options endpoint registry or another.
        <code>createForms</code> combines them (see{" "}
        <Link to="remote-select" section="endpoints">
          Endpoints and registry
        </Link>
        ). An async field rejects it with{" "}
        <code>Endpoint "listPrice" gives a value; use an options or list endpoint</code>.
      </li>
    </ul>
    <Example
      id="page-endpoints"
      title="Endpoints on this page"
      files={[
        "examples/queries/endpoints.ts",
        "examples/queries/api.ts",
        "forms.ts",
        "lib/query.ts",
      ]}
    >
      <p>
        The simulated server takes 2.5 seconds, so you can edit with a response in flight. In{" "}
        <code>lib/query.ts</code>, responses are never fresh, so each demo query calls the server.
      </p>
    </Example>
    <h2 id="when-a-query-runs">When a query runs</h2>
    <ul>
      <li>
        <code>{"query: { endpoint, params?, patch? }"}</code> goes in the <code>rules</code> entry
        for the field it writes, which can be of any type. That field is the query entry, and each
        entry has only one query.
      </li>
      <li>
        <code>params</code> works like it does for an async field.{" "}
        <code>(values, {"{ peek }"}) =&gt;</code> returns a plain object or <code>undefined</code>{" "}
        to suspend the query. It also receives any context the form declares (see{" "}
        <Link to="context">Context</Link>). Required endpoint parameters make the rule mandatory in
        the types. Without a rule, the endpoint receives <code>{"{}"}</code>.
      </li>
      <li>
        When the session is created, it runs the query if its <code>params</code> are defined and
        its field is absent from <code>initial</code>. A saved record keeps its saved value. A value
        from <code>default</code> or <code>defaults</code> does not count as saved. The query then
        runs on each operation that changes its <code>params</code>, compared as data. If they
        become <code>undefined</code>, it invalidates the request in flight without starting
        another.
      </li>
      <li>
        Without <code>patch</code>, the response is written to the entry field. The affected
        formulas and <code>onChange</code> handlers run, and derived outputs are recalculated. With{" "}
        <code>forPrepare: true</code>, <code>prepare</code> waits for the query (see{" "}
        <Link to="submission">Submission</Link>).
      </li>
    </ul>
    <h2 id="responses-in-flight">Responses in flight</h2>
    <ul>
      <li>
        Each request is a generation of its query. A change to or suspension of its{" "}
        <code>params</code>, an edit to the entry field, <code>reset()</code>, and{" "}
        <code>retry()</code> invalidate it. Its response is ignored and its signal is aborted.
        Editing the entry field sets the query to <code>"idle"</code> immediately.
      </li>
      <li>
        A current response is also discarded in full, without notice, if any field it writes changed
        after the query started, even if the field returned to its original value. A query that
        starts after the edit can write.
      </li>
    </ul>
    <Example
      id="slow-price-and-an-edit-in-flight"
      title="A slow price response and an edit while it is in flight"
      files={["examples/queries/slow.tsx"]}
      steps={[
        "Select “Atlas Trading”. snapshot.queries.price becomes pending. After 2.5 seconds, the price becomes 1,100, the total becomes 2,200, and the query returns to idle.",
        "Select “Prisma Trading” and enter 900 in “Unit price” before the response arrives. The query goes idle as you enter the price. After 2.5 seconds, the price stays at 900 and the total stays at 1,800.",
        "Select “Compass Trading”. The query started after your edit, so the response writes 1,300, with a total of 2,600.",
        "Select “Atlas Trading” and then “No selection” within 2.5 seconds. With no customer, params returns undefined. The query goes idle without making another request, and the price stays at 1,300.",
      ]}
    />
    <h2 id="patch">The patch</h2>
    <ul>
      <li>
        <code>patch: (result, {"{ values, context }"}) =&gt; patch | undefined</code> maps the
        response to the fields it writes. It runs when a current response arrives, with the values
        at that moment, and creates no dependencies. It can read its own targets. A response from an
        invalidated generation does not run it. Trama decides afterward whether to discard the
        response because a target changed, based on the fields the patch returns.
      </li>
      <li>
        It returns a patch like a field event does (see <Link to="events">Events</Link>), and Trama
        validates it the same way. It skips fields set to <code>undefined</code>. Returning{" "}
        <code>undefined</code> writes nothing. <code>context</code> exists only if the form declares
        it.
      </li>
      <li>
        Its fields are written in one operation with their formulas, <code>onChange</code> handlers,
        and derived outputs. Responses that arrive before the batch closes in the microtask
        scheduled by the first response share the operation and publish once. At closing, each
        response is checked again against the state before the batch, and writes from another
        response in the same batch do not invalidate it. If two responses write the same field, the
        first wins. If the operation fails, the responses are applied one at a time.
      </li>
      <li>
        With a list endpoint, <code>result</code> is the complete, frozen list. Its key is the same
        as the key for the field’s list request, so with <code>queryLoader</code> they share the
        cache. Without <code>patch</code>, the entire list is written to a <code>multiAsync</code>.
      </li>
    </ul>
    <Example
      id="auto-selecting-the-only-option"
      title="Automatically selecting the only option"
      files={["examples/queries/autoselect.tsx"]}
      steps={[
        "In “Create”, select “Prisma Trading”. snapshot.queries.contact becomes pending and then goes idle almost immediately. The customer has two contacts, so “Contact” stays empty.",
        "Select “Atlas Trading”. Its only contact, Bruno, is selected automatically.",
        "Select “Lighthouse Trading”, which also has one contact, Héctor. The contact stays Bruno because the field was already filled. You can use an event to clear it when the customer changes.",
        "Click “Edit” and select “Atlas Trading”. In edit mode, params returns undefined and no query runs. snapshot.queries.contact stays idle, the contact stays empty, and its list is available for manual selection.",
      ]}
    >
      <p>
        The query runs only in create mode, as determined by context, and the patch writes only when
        the contact is empty and the customer has one contact.
      </p>
    </Example>
    <h2 id="status-and-retry">Status and retry</h2>
    <ul>
      <li>
        <code>snapshot.queries</code> holds the status of each entry with a query,{" "}
        <code>{"{ status, error }"}</code>. <code>status</code> is <code>"pending"</code> while a
        request is in flight, <code>"error"</code> if the last request failed, and{" "}
        <code>"idle"</code> otherwise. <code>error</code> is the error or <code>undefined</code>.
        The object is frozen, and it and its entries keep their identity while unchanged. With no
        queries it is <code>{"{}"}</code>. A status-only change publishes a snapshot with the same{" "}
        <code>values</code> and <code>fieldStates</code>, and the renderer props stay the same.
      </li>
      <li>
        Errors are not thrown. The query goes to <code>"error"</code> and writes nothing. An
        endpoint failure gives <code>Field "price" query: request failed: …</code>, a patch failure
        gives <code>patch failed</code>, and a formula or event that fails with the response gives{" "}
        <code>response operation failed</code>. The original error is in <code>cause</code>.
      </li>
      <li>
        <code>session.retry(entry)</code> requests again with the same <code>params</code>, even if
        there is already a request in flight, which it invalidates. It does nothing if the query is
        suspended. Editing the entry field also clears the error by setting the query to{" "}
        <code>"idle"</code>.
      </li>
    </ul>
    <Example
      id="quote-with-error-and-retry"
      title="A two-field quote with an error and retry"
      files={["examples/queries/retry.tsx"]}
      steps={[
        'Click “Fail the next query” and select “Atlas Trading”. After 2.5 seconds, the snapshot.queries.price error appears: “Field "price" query: request failed: The price list is not responding”. Nothing was written.',
        "Click “Retry”. The query goes back to pending with the same params. After 2.5 seconds, it writes the price and discount in one operation: 1,100, 5, and a final price of 1,045.",
        "Select “Prisma Trading” and enter 20 in “Discount (%)” before the response arrives. The query stays pending because the discount is a different field from its entry. When the response arrives, it is discarded in full. The price stays at 1,100, the final price becomes 880 with your discount, and the query goes idle.",
      ]}
    />
    <h2 id="reset">Reset</h2>
    <p>
      A successful <code>reset()</code> sets each query to idle, invalidates requests in flight,
      aborts their signals, and, as on opening, runs the queries with defined <code>params</code>{" "}
      whose entry fields were absent from <code>initial</code>. After <code>commit</code>, it runs
      only the queries that were in flight or had failed at preparation time, with defined{" "}
      <code>params</code> and no server write to their field (see{" "}
      <Link to="submission">Submission</Link>). Meanwhile, the field shows the baseline.
    </p>
    <Example
      id="reset-new-and-saved-orders"
      title="Resetting a new order and a saved order"
      files={["examples/queries/reset.tsx"]}
      steps={[
        "Click “Restart” to open both again. The new order opens with Atlas Trading and requests its price. The query is pending and the price becomes 1,100 after 2.5 seconds. The saved order opens with its price of 900 and does not run a query. Its status is idle.",
        "In the new order, change the price to 950 and click “Reset”. The price returns to 5,000, its opening value, and the query runs again. After 2.5 seconds, the price becomes 1,100.",
        "In the new order, select “Prisma Trading” and click “Reset” before its price arrives. Atlas Trading and 5,000 return, and its price is requested and arrives 2.5 seconds later. Prisma’s price of 1,200 is never written.",
        "In the saved order, select “Compass Trading”. The query runs and the price becomes 1,300. Click “Reset”. Atlas Trading and 900 return, with no request, as on opening.",
      ]}
    />
    <h2 id="loader">Scope, loader, and StrictMode</h2>
    <ul>
      <li>
        Queries require <code>scope</code> in the types and at runtime, even without async fields (
        <code>Form with queries requires a scope</code>). <code>load</code> receives it.
      </li>
      <li>
        The key is <code>["trama", scope, endpoint, params]</code>, just like a complete list’s key,
        and the session’s loader executes the request. With <code>queryLoader</code>, two sessions
        with the same scope, endpoint, and <code>params</code> share the request in flight and the
        cached response while it is still fresh.
      </li>
      <li>
        Queries whose field <code>initial</code> does not supply start when the session is created,
        without waiting for subscribers. In StrictMode, the candidate session also queries. The
        direct loader repeats the request and <code>queryLoader</code> shares it.
      </li>
      <li>
        Invalidation aborts the signal the loader receives. <code>queryLoader</code> uses the
        TanStack Query signal, which does not abort a shared request. The response reaches the cache
        without writing to the form.
      </li>
    </ul>
    <h2 id="types">Types</h2>
    <ul>
      <li>
        Without <code>patch</code>, the result must fit the entry field. Otherwise, TypeScript gives{" "}
        <code>query result of "listPrice" does not fit field "note"</code>. <code>patch</code>{" "}
        receives the typed result as deeply read-only.
      </li>
      <li>
        <code>snapshot.queries</code> has one key per entry with a query, optional if the query can
        be absent, and <code>retry</code> accepts only those entries.{" "}
        <code>FormQueries&lt;typeof definition&gt;</code> and <code>QueryState</code> provide the
        types.
      </li>
      <li>
        TypeScript rejects a paginated endpoint (
        <code>query endpoint "customers" is paged; use a value or list endpoint</code>), an unknown
        property (<code>query property "x" does not exist</code>), a patch handler that returns
        neither an object nor <code>undefined</code>, an async patch handler, and an unknown field
        in its patch. An unknown endpoint key gives{" "}
        <code>Type 'string' is not assignable to type 'never'</code> or, at runtime,{" "}
        <code>unknown endpoint "x"</code>.
      </li>
    </ul>
    <h2 id="limits">Limits</h2>
    <ul>
      <li>
        There is only one query per entry, with no paginated endpoints. There is no delay for{" "}
        <code>params</code> that change with each keystroke. Every change runs a query. A patch that
        changes its own <code>params</code> starts another query, with no loop detection.
      </li>
      <li>
        An operation’s cause is private. A batch of responses is an edit, runs the same{" "}
        <code>onChange</code> handlers, and can mark what it writes dirty (see{" "}
        <Link to="changes">Changes</Link>). TanStack Query handles automatic retries, and{" "}
        <code>retry</code> does not force another request while its cache is fresh. There is no way
        to close a session. A discarded session can finish its requests, and it never writes to
        another session.
      </li>
      <li>
        The types reject a <code>rules</code> section that can be <code>undefined</code> and
        declares queries. A conditional entry or query is valid, with an optional key. A reused
        query object needs <code>as const</code>. With explicit type arguments to{" "}
        <code>defineForm</code>, <code>snapshot.queries</code> has no keys in the types, and the
        types do not check that the result fits the field.
      </li>
    </ul>
    <p>
      The <Link to="complete-example">Complete example</Link> queries the order’s list price when
      you select a customer. Rows in a collection also run queries, each on its own (see{" "}
      <Link to="async-in-rows" section="queries-per-line">
        Queries per line
      </Link>
      ).
    </p>
  </>
);
