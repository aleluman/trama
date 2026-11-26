import { Example } from "../lib/Example";
import { Link } from "../lib/router";
import { Snippet } from "../lib/Snippet";

export const Formulas = () => (
  <>
    <h1>Value formulas</h1>
    <p className="lead">
      <code>rules</code> describes each field like a component’s props, with one entry per field
      containing its properties. <code>value</code> is a formula that calculates the field’s value
      from other fields within each <code>edit</code>, before publishing the snapshot.
    </p>
    <Snippet>{`rules: {
  total: { value: ({ quantity, price }) => … },
  country: { onChange: (values, { toDefaults }) => … },
  note: { disabled: ({ confirmed }) => confirmed },
},`}</Snippet>
    <p>
      Each entry accepts <code>value</code>, covered on this page, <code>onChange</code> or{" "}
      <code>onEdit</code> (see <Link to="events">Events</Link>), and the state properties{" "}
      <code>disabled</code>, <code>readOnly</code>, <code>hidden</code>, <code>required</code>,{" "}
      <code>label</code>, <code>placeholder</code>, and <code>states</code> (see{" "}
      <Link to="field-state">Field state</Link>). A key that does not name a field, or an unknown
      property, is an error in the types and at runtime. The sections of <code>defineForm</code> can
      appear in any order.
    </p>

    <h2 id="dependencies-and-execution">Dependencies and execution</h2>
    <ul>
      <li>
        <strong>Tracked reads.</strong> Every field the formula reads from its first argument is a
        dependency, including when destructuring. There is no dependency list.
      </li>
      <li>
        <strong>When it runs.</strong> It runs when the session opens and whenever a dependency’s
        value changes, within the same edit. Editing a field with the same value runs nothing.
      </li>
      <li>
        <strong>
          <code>peek</code>
        </strong>{" "}
        in the second argument reads a field without creating a dependency.
      </li>
      <li>
        <strong>
          <code>context</code>
        </strong>{" "}
        is also in the second argument if the form declares a context. It stays fixed for the
        session and does not create a dependency (see <Link to="context">Context</Link>).
      </li>
      <li>
        <strong>Result.</strong> Returning <code>undefined</code> writes nothing. <code>false</code>
        , <code>0</code>, and <code>""</code> are values. The result must match the field type.
      </li>
      <li>
        <strong>Editable field.</strong> A direct edit to the field stays until one of its
        dependencies changes.
      </li>
      <li>
        <strong>Propagation.</strong> A value written by a formula recalculates the formulas that
        depend on it and triggers the changed field’s <code>onChange</code>, if declared, within the
        same edit, regardless of field order. A result equal to the previous one triggers nothing.
      </li>
      <li>
        <strong>Cycles.</strong> A formula cannot read its own field or depend on itself through
        other formulas. The operation is rejected and the error shows the path.
      </li>
      <li>
        Formulas are synchronous and must have no side effects. Trama does not guarantee how many
        times it calls them.
      </li>
    </ul>

    <h2 id="value">A calculated and editable value</h2>
    <Example
      id="total"
      title="value calculates total as quantity × price"
      files={["examples/rules/total.tsx"]}
      steps={[
        "On opening, “Total” is 20 because the formula ran when the session opened.",
        "Change “Quantity” to 3. “Total” becomes 30.",
        <>Enter 99 in “Total”. The value stays because the field is still editable.</>,
        "Change “Price” to 5. The formula runs again and “Total” becomes 15.",
        "Click “Reset” to return to 2, 10, and 20.",
      ]}
    />

    <h2 id="initial-values">Initial values</h2>
    <p>
      On opening, a value supplied in <code>initial</code> takes precedence. No formula replaces it.
      The formula still runs to track its dependencies, so changing one of them later recalculates
      the value. If the field is absent from <code>initial</code>, the formula calculates it, even
      if it has a <code>default</code> or a value from <code>defaults</code>. The values on opening
      become the baseline, and <code>reset()</code> restores them without running value formulas.
    </p>
    <Example
      id="three-sessions"
      title="Three sessions for the same line"
      files={["examples/rules/initial-values.tsx"]}
      steps={[
        <>
          Compare the totals. The first is calculated as 20, the second uses the saved value of 17,
          and the third is calculated as 30 from the saved quantity.
        </>,
        "On the second line, change the quantity to 4. The total becomes 40.",
        "Click its “Reset”. The total returns to 17, its baseline.",
      ]}
    />

    <h2 id="peek">Reading without creating a dependency</h2>
    <p>
      With <code>peek</code>, the formula uses a field’s current value, and changing that field does
      not rerun the formula. Use it for data that goes into a calculation without determining when
      it runs.
    </p>
    <Example
      id="product-price"
      title="Changing the product recalculates the price at the current exchange rate"
      files={["examples/rules/peek.tsx"]}
      steps={[
        "On opening, the price is 1,500 JPY (10 USD × 150).",
        "Change the exchange rate to 155. The price stays at 1,500 because the formula reads rate with peek.",
        "Change the product to “Pro (USD 25)”. The price becomes 3,875 JPY (25 USD × 155).",
        "Enter 3200 in the price. It stays until you change the product again.",
      ]}
    />

    <h2 id="when-a-formula-fails">When a formula fails</h2>
    <p>
      If a formula throws or returns a value that does not match the field, the entire edit is
      rejected. <code>edit</code> throws an error that names the field and property, such as{" "}
      <code>Field "perInstallment" value: formula failed: …</code>, and the session keeps the
      previous snapshot. If it fails on opening, the session does not open.{" "}
      <code>createSession</code> throws and, with TanStack Query, the editor goes to{" "}
      <code>"error"</code>.
    </p>
    <Example
      id="rejected-edit"
      title="A rejected edit"
      files={["examples/rules/failing-formula.tsx"]}
      steps={[
        <>Click “edit("installments", 3)”. The amount per installment becomes 40.</>,
        <>
          Click “edit("installments", 0)”. The error appears and <code>installments</code> stays at
          3.
        </>,
      ]}
    >
      <p>
        A renderer calls <code>session.edit</code> from its <code>onChange</code>. If a formula can
        fail with what the user enters, catch the error in the renderer. Otherwise it escapes the
        event handler without being displayed.
      </p>
    </Example>
  </>
);
