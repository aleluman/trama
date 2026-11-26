import { Example } from "../lib/Example";
import { Link } from "../lib/router";

// The Remote select section on selecting multiple remote options.
export const RemoteMultiple = () => (
  <>
    <h2 id="multiple">Remote multi-select</h2>
    <ul>
      <li>
        <code>field.multiAsync(key, config)</code> selects multiple options from an endpoint. Its
        value is a frozen array of complete options with unique <code>value</code>s, starting at{" "}
        <code>[]</code>. Everything else works as it does for an async field, including lists per
        view, <code>params</code>, suspension, scope, and the loader.
      </li>
      <li>
        The value is a set. Writing the same options in a different order counts as unchanged. If
        the set changes, options already in the field keep their identity by <code>value</code>, and
        only new ones are copied and frozen.
      </li>
      <li>
        The list belongs to the view and shows a page of options independently of the field's value.{" "}
        <code>MultiAsyncFieldProps</code> has the props of <code>AsyncFieldProps</code>, with an
        array in <code>value</code>. This guide's renderer adds with <code>[...value, option]</code>{" "}
        and removes by filtering <code>value</code>. It never rebuilds the value from{" "}
        <code>list.options</code>, so it keeps selected options even if the list does not show them.
      </li>
      <li>
        The server usually receives only the IDs, for example{" "}
        <code>families.map((family) =&gt; family.value)</code>, in <code>params</code> or the
        application's request. For Trama, <code>[]</code> does not mean “all”. Each report's server
        decides that.
      </li>
      <li>
        A{" "}
        <Link to="queries" section="patch">
          query
        </Link>{" "}
        with a list endpoint and no <code>patch</code> writes the entire list to a{" "}
        <code>multiAsync</code>.
      </li>
    </ul>
    <Example
      id="report-families-and-subfamilies"
      title="Families and subfamilies in a report"
      files={["examples/remote/multiple.tsx", "examples/remote/catalog.ts", "ui/chips.tsx"]}
      steps={[
        <>
          Open “Families” and choose “Beverages” and “Dairy”. The list stays open, and both appear
          as chips below it. <code>families</code> stores the complete options, and{" "}
          <code>request.families</code> stores their IDs, <code>[1, 2]</code>.
        </>,
        "Open “Subfamilies”. The subfamilies of both families arrive, from “Waters” to “Yogurts”. Choose “Juices” and press Escape.",
        "In “Families”, remove “Beverages” with its ×. “Juices” stays selected even though its family is no longer selected. Trama keeps the selected subfamilies when the families change to another nonempty set.",
        <>
          Open “Subfamilies”. The list shows only the Dairy subfamilies, and “Juices” remains as a
          chip. The renderer keeps selected options that the list does not show.{" "}
          <code>request</code> is <code>{"{ families: [2], subfamilies: [12] }"}</code>.
        </>,
        "Remove “Dairy”. The families become empty, the event clears the subfamilies, and “Subfamilies” closes and is disabled with “Choose a family first”.",
        "Open “Families” and choose “Bakery”. “Subfamilies” becomes enabled and empty. Open it to see Breads, Cookies, and Cakes.",
      ]}
    />
  </>
);
