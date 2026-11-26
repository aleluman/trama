import { Example } from "../lib/Example";
import { Link } from "../lib/router";
import { Snippet } from "../lib/Snippet";

export const RowsAsync = () => (
  <>
    <h1>Async in rows</h1>
    <p className="lead">
      Rows in a collection also have async fields and queries. Each order line selects its product
      with search and pagination, selects its lot from a list that depends on that line's product
      and warehouse, and queries its price. Each row has its own parameters, each field view has its
      own list, and each query in each row has its own generation.
    </p>
    <Snippet>{`const order = defineForm({
  fields: { notes: field.text() },
  collections: {
    lines: {
      fields: {
        product: field.async("products"),
        warehouse: field.select({ options: warehouses }),
        lot: field.async("lots"),
      },
    },
  },
  rules: {
    lines: {
      each: {
        lot: {
          params: ({ product, warehouse }) =>
            product === null || warehouse === null ? undefined : { product: product.value, warehouse },
        },
      },
    },
  },
});

const session = createSession(order, { scope: "inventory", initial: { lines: [{}] } });
const [key] = session.getSnapshot().rows.lines;
const lots = session.row("lines", key).list("lot"); // one view, without React`}</Snippet>

    <h2 id="row-fields-and-params">Row fields and parameters</h2>
    <ul>
      <li>
        <code>collections.lines.fields</code> accepts <code>field.async</code> with endpoints from
        the registry, just as the header does. Only the <code>defineForm</code> from{" "}
        <code>createForms</code> knows about those endpoints. The one from{" "}
        <code>trama-forms/core</code> rejects an async field in a row too. The session requires a{" "}
        <code>scope</code> when its rows contain an async field.
      </li>
      <li>
        <code>rules.lines.each.lot.params</code> computes the parameters for the lot lists in each
        row using the tools of a row formula,{" "}
        <code>{"(row, { values, key, peek: { row, values }, context })"}</code>. It reads its row,
        the header, and the other collections through <code>values</code>. It returns a plain object
        or <code>undefined</code>, which suspends that row's lists. If the endpoint requires
        parameters, the types require the rule. Without a rule, the endpoint receives{" "}
        <code>{"{}"}</code>.
      </li>
      <li>
        When something a row's parameters read changes, the parameters are recalculated only in that
        row. Equivalent data does not count as a change. The cache key still consists of scope,
        endpoint, parameters, search, and page, with no row key. Two lines with the same product and
        warehouse share what the cache stores.
      </li>
      <li>
        An option written to a row is a frozen copy. Selecting the same <code>value</code> again
        preserves that row's option, and a row never adopts the option another row retained.
      </li>
      <li>
        A <code>field.multiAsync</code> works the same way in a row. It uses that row's parameters,{" "}
        <code>handle.list</code> provides its view's list, and its value is that row's array of
        options. See{" "}
        <Link to="remote-select" section="multiple">
          Remote multi-select
        </Link>
        .
      </li>
    </ul>

    <h2 id="lists-per-view">Lists per view</h2>
    <ul>
      <li>
        <code>handle.list(field)</code> creates a new list on every call with the actions from{" "}
        <Link to="remote-select">Remote select</Link>, <code>open</code>, <code>search</code>,{" "}
        <code>more</code>, and <code>retry</code>. It follows the field's parameters in that row,
        makes requests only while it has subscribers, and never writes to the session.{" "}
        <code>session.list</code> takes header field names. For a row field, its error refers you to
        the handle.
      </li>
      <li>
        <code>{"<Field row={handle} name>"}</code> for an async field creates its view's list when
        it mounts. A table cell and the modal for the same line are two views and search
        independently. Reset remounts them, and a <code>Field</code> that switches to another row
        mounts another list.
      </li>
      <li>
        If the row is removed, its list suspends, its in-flight request is discarded, and{" "}
        <code>handle.list</code> throws the same error as <code>edit</code>. If reset restores the
        row, the list follows its parameters again. Moving a row leaves its lists unchanged.
      </li>
    </ul>
    <Example
      id="select-in-a-line"
      title="Selection in a line"
      files={[
        "examples/rows-async/lines.tsx",
        "examples/rows-async/order.ts",
        "examples/rows-async/endpoints.ts",
      ]}
      wide
      steps={[
        "Open “Product” on line 1 and type “screw”. Eight products arrive and “Load more” appears. Click it to add the remaining two.",
        "Open “Lot” on line 1. It lists the lots for its product in “Central”, and “Server requests” logs the request.",
        "Select “North” in the warehouse on line 2 and open its lot. The server receives a request only for line 2's lots in “North”. The lot on line 1 stays the same.",
        "Click “Open” on line 1 and search for “802” in its lot. The modal shows only C-802. Close it and open the lot on line 1 in the table. It keeps its list with no search text.",
        "Click “Remove” next to the product on line 1. The lot clears and its list is suspended, with no options.",
        "Type “lathe” in the product on line 2. Once the request starts and before the options arrive, click “Move down” on line 1. The list on the line that moves up stays the same. Its request remains in flight, and reopening its product retains “lathe” and shows “Bench screw-cutting lathe” without another server request.",
      ]}
    />

    <h2 id="queries-per-line">Queries per line</h2>
    <Snippet>{`rules: {
  lines: {
    each: {
      price: {
        query: {
          endpoint: "linePrice",
          params: ({ product }, { values }) =>
            product === null ? undefined : { product: product.value, list: values.priceList },
        },
      },
      lot: {
        query: {
          endpoint: "lots",
          params: lotParams,
          patch: (lots, { row }) => (row.lot === null && lots.length === 1 ? { lot: lots[0] } : undefined),
        },
      },
    },
  },
},
// In the application
const line = session.row("lines", key);
line.getSnapshot()?.queries.price.status; // "idle" | "pending" | "error"
line.retry("price");`}</Snippet>
    <ul>
      <li>
        <code>rules.lines.each.price.query</code> applies the query described in{" "}
        <Link to="queries">Queries</Link> to each row. It declares{" "}
        <code>{"{ endpoint, params?, patch? }"}</code>, with a value or complete-list endpoint and{" "}
        <code>params</code> using the tools of a row formula. Without <code>patch</code>, the result
        is written to the entry's field in its row.{" "}
        <code>{"patch(result, { row, values, key, context })"}</code> receives the row and the
        published values as data and returns fields in its own row. It never writes to the header or
        other rows.
      </li>
      <li>
        Each line queries independently. On opening, adding, and resetting, a line makes a request
        if its parameters are defined and that field was not supplied. A saved or duplicated line
        with its price does not query. Afterward, as in the header, different parameters trigger
        another request, and editing the entry's field stops its query.
      </li>
      <li>
        A response writes only if its generation is still current and none of its targets in that
        row has changed since the request began. Removing the line discards its query. Moving the
        line preserves the query, and the response reaches it by its key. Reset discards all queries
        even if the line returns.
      </li>
      <li>
        Responses that arrive together, such as when repricing with a fresh cache, are applied in
        one operation and publish once along with header responses. Each is checked again against
        the state before the batch before it is applied. Writes from another response in the same
        batch do not invalidate it.
      </li>
      <li>
        <code>handle.getSnapshot().queries</code> holds the state of each query in the row,{" "}
        <code>{"{ status, error }"}</code>, and <code>handle.retry(field)</code> requests again with
        the current parameters. A cell reads it with a selector that returns one query's state,
        which retains its identity as long as it stays the same. A <code>Field</code> does not
        rerender when query state changes. <code>snapshot.queries</code> and{" "}
        <code>session.retry</code> still apply to the header.
      </li>
      <li>
        A form with queries in its rows requires a <code>scope</code>. Queries start in the header
        first, then by collection, row, and query.
      </li>
    </ul>
    <Example
      id="queries-per-line-demo"
      title="Queries per line"
      files={[
        "examples/rows-async/queries.tsx",
        "examples/rows-async/priced.ts",
        "examples/rows-async/endpoints.ts",
      ]}
      wide
      steps={[
        "Click “Add line” and select a product on line 3. Its status changes to “Querying…” and its price arrives in two seconds. The two saved lines did not query on opening.",
        "Select “Port” in the warehouse on line 3. Its only lot is selected automatically.",
        "Click “Duplicate” on line 1. The copy comes with its price and lot, and “Server requests” shows no new entries.",
        "Select “Wholesale” in the price list. All lines query and update, and lines with the same product share a request. The simulated server answers requests that arrive together as a group, so the responses are applied in one operation. “Publications” shows one for the edit and one afterward.",
        "Change the product on line 1 and click “Remove” in its row actions while its query is in flight. The response writes nothing.",
        "Change the product on line 2 and click “Move down” while its query is in flight. The price reaches that line in its new position.",
        "Change the product on line 1 and enter a price while its query is in flight. The response does not overwrite it.",
        "Click “Fail the next price request” and change a product. The line shows the error. “Retry” recovers it.",
        "Click “Discard changes”. The two saved lines return without querying.",
      ]}
    />

    <h2 id="limits">Limits</h2>
    <ul>
      <li>
        Only responses that arrive together share an operation. Those that arrive in separate tasks
        are applied in separate operations. Within a batch, if a response changes the parameters of
        another query, that query's old response still writes and the query requests again. A query
        cannot write to the header or to other rows. There is no aggregate state per collection, and
        a query that calls its own field's endpoint repeats its parameters.
      </li>
      <li>
        Each visible async <code>Field</code> creates its list when it mounts, even if it never
        opens, and each list listens to every session publication. A thousand rows with two combo
        boxes each make two thousand lists.
      </li>
    </ul>
  </>
);
