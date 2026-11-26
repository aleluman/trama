import { Example } from "../lib/Example";
import { Link } from "../lib/router";
import { Snippet } from "../lib/Snippet";

export const Query = () => (
  <>
    <h1>Loading with TanStack Query</h1>
    <p className="lead">
      To edit saved data, pass the result of <code>useQuery</code> to <code>initialFromQuery</code>.
      The editor stays in <code>"loading"</code> until data is available to use as initial values.
      It then opens the session once.
    </p>
    <Snippet>{`const query = useQuery({ queryKey: ["customer", id], queryFn: … });
const editor = useFormSession(customer, { key: id, initial: initialFromQuery(query) });`}</Snippet>

    <Example
      id="load-a-customer"
      title="Open a customer from the server"
      files={["examples/query/load.tsx", "examples/query/api.ts"]}
      steps={[
        <>On mount, “Loading customer…” appears for almost a second, followed by the form.</>,
        "Edit the line of credit and click “Reset” to restore the loaded value without requesting it again.",
        <>Click “Fail the next request” and switch customers. An error appears. Click “Retry”.</>,
        "Edit the line of credit, then switch to the other customer and back. The customer loads again and the edit is lost because the key changed.",
      ]}
    >
      <p>
        This demo leaves <code>staleTime</code> unset, so cached data is always stale and each
        opening waits for a new response. The <Link to="complete-example">Complete example</Link>{" "}
        uses <code>staleTime: 30_000</code> and opens recently visited orders immediately.
      </p>
    </Example>

    <h2 id="when-the-session-opens">When the session opens</h2>
    <ul>
      <li>
        If the query has successful data that is fresh according to its <code>staleTime</code>, the
        session opens with that data immediately.
      </li>
      <li>
        If data is missing, stale, or <code>placeholderData</code>, Trama calls{" "}
        <code>refetch()</code> and opens once the refresh returns usable, non-placeholder data with
        a newer <code>dataUpdatedAt</code>. It never opens with stale cache data. It reuses an
        in-flight request if one exists.
      </li>
      <li>
        If the query is disabled (<code>enabled: false</code> or <code>skipToken</code>), the editor
        stays in <code>"loading"</code>.
      </li>
      <li>
        If the request fails or the data is invalid for the definition, the editor moves to{" "}
        <code>"error"</code>. <code>retry()</code> requests the data again, even if it is fresh.
      </li>
    </ul>

    <h2 id="after-opening">After opening</h2>
    <ul>
      <li>
        The session owns the values. A later refetch, a <code>setQueryData</code> call, or a query
        error leaves the open session unchanged.
      </li>
      <li>
        <code>reset()</code> restores the baseline, which starts as the data accepted on opening,
        without repeating the initial TanStack Query request. If the definition has{" "}
        <Link to="queries">Queries</Link>, the reset starts again those with defined parameters
        whose field the baseline does not supply, as on opening.
      </li>
      <li>
        To edit another record, change <code>key</code>. A new session opens and loads its own data.
      </li>
      <li>
        The data must match the shape of the form values. If the API responds in a different format,
        adapt it with <code>select</code> in <code>useQuery</code>, as in the{" "}
        <Link to="complete-example">Complete example</Link>.
      </li>
      <li>
        Trama creates no TanStack Query queries, has no cache of its own, and does not cancel your
        query. It only reads the result and calls <code>refetch</code>.{" "}
        <code>trama-forms/react</code> does not import TanStack Query. Any object shaped like{" "}
        <code>InitialQuery</code> works.
      </li>
    </ul>
  </>
);
