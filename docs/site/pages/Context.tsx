import { Example } from "../lib/Example";
import { Link } from "../lib/router";
import { Snippet } from "../lib/Snippet";

export const Context = () => (
  <>
    <h1>Context</h1>
    <p className="lead">
      Context is application data a session receives when it is created, such as its opening mode,
      permissions, today's date, or the company's currency. Rules, derived outputs, and default
      values read it. Each form declares the context it needs, and it stays fixed throughout the
      session.
    </p>
    <Snippet>{`type OrderContext = { mode: "create" | "edit" | "view"; today: string };

const order = defineForm({
  context: declareContext<OrderContext>(),
  defaults: ({ today }) => ({ deliveryDate: today }),
  fields: { … },
  form: { readOnly: { value: (_, { context }) => context.mode === "view" && "Read-only" } },
});

// Each session receives its own context. A different mode opens another session with a different key.
const editor = useFormSession(order, { key: \`\${id}:\${mode}\`, context: { mode, today } });`}</Snippet>

    <h2 id="declaring-context">Declaring context</h2>
    <ul>
      <li>
        Put <code>declareContext&lt;T&gt;()</code> from <code>trama-forms/core</code> in the{" "}
        <code>context</code> section of <code>defineForm</code>. It only declares the type. The data
        arrives with each session. The sections can go in any order, including in the{" "}
        <code>defineForm</code> from <code>createForms</code>.
      </li>
      <li>
        <code>T</code> is an object of plain data containing strings, finite numbers, booleans,{" "}
        <code>null</code>, arrays, and objects. Represent dates as strings, for example{" "}
        <code>"2026-09-27"</code>. Declare it with <code>type</code>. An <code>interface</code> is
        rejected.
      </li>
      <li>
        With <code>context</code> omitted or set to <code>context: undefined</code>, the form
        declares no context. Its rules receive no <code>context</code>, and its sessions reject it.
      </li>
    </ul>

    <h2 id="session-context">A session's context</h2>
    <ul>
      <li>
        Pass it to <code>createSession(definition, {"{ context }"})</code> and{" "}
        <code>useFormSession(definition, {"{ key, context }"})</code>. It is required if the form
        declares it and rejected otherwise, in types and at runtime.
      </li>
      <li>
        Trama makes a deep copy and freezes it throughout. Later changes to the application's object
        leave the session unchanged. Data that is not plain is rejected with its path, as in{" "}
        <code>Session context must be plain data: a Date at "today"</code>.
      </li>
      <li>
        Context stays fixed throughout the session. <code>defaults</code>, rules, and derived
        outputs receive the same read-only object.
      </li>
      <li>
        In React, context with the same data preserves the session even if it is a different object.
        Once the session is ready, different context throws{" "}
        <code>Changing context requires a different session key</code>. To change the mode, change
        the <code>key</code>. While opening loads with TanStack Query, Trama uses the context from
        the most recent render.
      </li>
      <li>
        Calculate data that changes on its own, such as today's date, only on opening. Otherwise, a
        render on another day would throw the error above.
      </li>
    </ul>

    <h2 id="reading-context-in-rules">Reading context in rules</h2>
    <Snippet>{`value, disabled, readOnly, hidden, required, label, placeholder, states, params:
  (values, { peek, context }) => …
form.readOnly: { value: (values, { peek, context }) => …, except? }
onChange: (values, { toDefaults, context }) => …
query.params: (values, { peek, context }) => …
query.patch: (result, { values, context }) => …
output((values, { read, context }) => …)`}</Snippet>
    <ul>
      <li>
        Context comes in the second argument, alongside <code>peek</code>, <code>toDefaults</code>,{" "}
        <code>read</code>, or <code>values</code> in a query's patch (see{" "}
        <Link to="queries">Queries</Link>). It is available only if the form declares it.
      </li>
      <li>
        Context creates no dependency. Because it stays fixed, a rule that only reads context does
        not recalculate on edits. State formulas and derived outputs still run again on every{" "}
        <code>reset()</code>.
      </li>
      <li>
        This lets the mode determine the lock, a label, or which fields are visible without
        requiring a definition for each mode.
      </li>
    </ul>
    <Example
      id="customer-create-edit-and-view"
      title="Create, edit, and view a customer"
      files={["examples/context/mode.tsx"]}
      steps={[
        "In “Edit”, the customer opens with saved data. “Code” is read-only with “Assigned by the system”. You can edit the legal name and email.",
        "Change the legal name and click “View”. Another session opens with the saved data, without your change. All three fields become read-only with “Read-only”, and “Code” shows “Assigned by the system · Read-only”.",
        "Click “Create”. The form opens empty, with “Code” hidden and the legal name labeled “New customer's legal name”.",
        "Click “Edit”. “Code”, the “Legal name” label, and the saved data return.",
      ]}
    />

    <h2 id="defaults">Default values</h2>
    <ul>
      <li>
        <code>defaults: (context) =&gt; ({"{ field: value }"})</code> calculates default values from
        context. It requires a context declaration. It supplies values to some fields, and the
        others start at their field <code>default</code> or their field type's empty value.
      </li>
      <li>
        It runs once when each session is created, and its values are validated like those in{" "}
        <code>initial</code>. <code>undefined</code> is invalid as a value. Omit the field to leave
        it unset, for example with{" "}
        <code>
          mode === "create" ? {"{ deliveryDate: today }"} : {"{}"}
        </code>
        .
      </li>
      <li>
        A field's initial value comes from the first source that supplies one, in this order:{" "}
        <code>initial</code>, the contextual <code>defaults</code>, and the field's{" "}
        <code>default</code>.
      </li>
      <li>
        <code>toDefaults</code> returns the value from <code>defaults</code> or falls back to the
        field's <code>default</code>. It never returns the value from <code>initial</code>.{" "}
        <code>reset()</code> restores the baseline, which includes values from <code>defaults</code>
        .
      </li>
      <li>
        On opening, a value from <code>defaults</code> does not count as supplied. If the field has
        a value formula, the formula replaces it, just as it replaces a <code>default</code>. Only{" "}
        <code>initial</code> prevents that.
      </li>
      <li>
        The function is synchronous and has no side effects. In React, StrictMode can create more
        than one candidate session, and each evaluates <code>defaults</code>.
      </li>
    </ul>
    <Example
      id="pickup-defaults"
      title="A pickup that defaults to today and the company's warehouse"
      files={["examples/context/defaults.tsx"]}
      steps={[
        "“New pickup” opens with today's date and “South warehouse” from the context through defaults, even though the field's default is “North warehouse”. The time slot, 09:00–13:00, is the field's default.",
        "“Saved pickup” opens with the date 2027-03-15 and the time slot 14:00–18:00, both from initial, which takes precedence. Because initial supplies no warehouse, it is “South warehouse”.",
        "In “Saved pickup”, choose “North warehouse” and check “Urgent pickup”. The date becomes today, the warehouse becomes “South warehouse”, and the time slot becomes 09:00–13:00. toDefaults does not restore values from initial.",
        "Click its “Reset” button. 2027-03-15, “South warehouse”, and 14:00–18:00 return, and “Urgent pickup” is unchecked.",
        "In “New pickup”, choose “North warehouse” and click “Reset”. “South warehouse” returns because the baseline includes the values from defaults.",
      ]}
    />

    <h2 id="outputs">Derived outputs</h2>
    <p>
      Derived outputs receive context alongside <code>read</code>. This way a company's currency,
      rate, or format can reach the totals without a module constant, and the same definition can
      serve each company. Open a different session for a different company.
    </p>
    <Example
      id="totals-in-each-companys-currency"
      title="Totals in each company's currency"
      files={["examples/context/outputs.tsx"]}
      steps={[
        "With “South Trading”, 2 × 5,000 gives net 10,000 and tax 2,000, and the summary shows “Total: 12000 JPY”.",
        "Change the quantity to 3. The net becomes 15,000, the tax becomes 3,000, and the summary shows “Total: 18000 JPY”.",
        "Click “Horizon Distribution”. Another session opens, the quantity returns to 2, and the summary shows “Total: 11500 EUR”, with tax of 1,500 at the simulated 15% rate.",
        "Click “Compass Trading”. The summary shows “Total: 12500 MXN”, with tax of 2,500 at the simulated 25% rate.",
      ]}
    />

    <h2 id="types">Types</h2>
    <ul>
      <li>
        Rules receive typed context that is read-only throughout.{" "}
        <code>FormContext&lt;typeof definition&gt;</code> gives that type, or <code>undefined</code>{" "}
        if the form declares no context. <code>ContextDeclaration&lt;T&gt;</code> is the type
        returned by <code>declareContext&lt;T&gt;()</code>.
      </li>
      <li>
        TypeScript rejects <code>declareContext()</code> without a type argument, a <code>T</code>{" "}
        that is not an object of plain data (<code>context data must be plain</code>
        ), a <code>T</code> with no properties (<code>context data needs a property</code>
        ), <code>defaults</code> without context (<code>defaults require a context</code>), an
        unknown field in its values (<code>defaults field "x" does not exist</code>), and an
        asynchronous function (<code>defaults are synchronous</code>).
      </li>
    </ul>
    <Snippet>{`// A generic wrapper passes the context for the definition it opens.
const open = <D extends FormDefinition>(definition: D, scope: Scope, context: FormContext<D>) =>
  createSession(definition, { scope, context });`}</Snippet>

    <h2 id="limits">Limits</h2>
    <ul>
      <li>
        Context stays fixed for each session. You cannot change it in an open session. To switch
        modes, open another session with a different <code>key</code>.
      </li>
      <li>
        Runtime validation only checks that context is an object of plain data and does not check
        its keys.
      </li>
      <li>
        Scope is a separate concept. <code>scope</code> separates remote data and is part of the
        cache key. Context is what rules read (see{" "}
        <Link to="remote-select" section="loader">
          Scope and loader
        </Link>
        ). A company can supply both.
      </li>
      <li>
        The types reject a <code>context</code> section that can be <code>undefined</code>, such as{" "}
        <code>cond ? declareContext&lt;T&gt;() : undefined</code>. Whether a form declares context
        is fixed.
      </li>
      <li>
        With explicit type arguments in <code>defineForm</code>, you must also supply the context
        type argument, and the keys of <code>defaults</code> are no longer checked in types. An
        unknown key reaches runtime. Omit the type arguments to have the keys inferred and checked.
      </li>
      <li>
        Symbol keys bypass the type checks, as they do in <code>params</code> and option metadata.
        Runtime validation rejects them.
      </li>
      <li>
        For a union of definitions with and without context, <code>context</code> is optional in
        types, and creating a session for one of them throws at runtime.
      </li>
    </ul>
    <p>
      The <Link to="complete-example">Complete example</Link> opens saved orders in edit or view
      mode, defaults the delivery date to today, and calculates totals with the currency from
      context.
    </p>
  </>
);
