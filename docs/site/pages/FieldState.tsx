import { Example } from "../lib/Example";
import { Link } from "../lib/router";
import { Snippet } from "../lib/Snippet";

export const FieldState = () => (
  <>
    <h1>Field state</h1>
    <p className="lead">
      Along with its value, each field publishes its state. This includes whether it is disabled,
      read-only, hidden, or required, the reasons, and the label and placeholder it shows. The field
      definition, the entries in <code>rules</code>, and the form lock determine this state.
    </p>
    <Snippet>{`fields: {
  code: field.text({ readOnly: "Assigned by the system" }),
},
rules: {
  note: { disabled: [({ includeNote }) => !includeNote, ({ confirmed }) => confirmed] },
  city: { label: ({ country }) => (country === "ES" ? "Municipality" : undefined) },
  delivery: { states: ({ delivery }) => (delivery === "pickup" ? { city: { hidden: true } } : undefined) },
},
form: { readOnly: [{ value: ({ confirmed }) => confirmed && "Order confirmed", except: ["confirmed"] }] },`}</Snippet>
    <ul>
      <li>
        Read the state in <code>snapshot.fieldStates[name]</code> with properties{" "}
        <code>
          {
            "{ disabled, readOnly, hidden, required, label, reasons, errors, externalErrors, warnings, dirty, touched }"
          }
        </code>
        , plus <code>placeholder</code> on text, number, date, async, and multiAsync fields. It is
        frozen, and each field keeps the same object while its state stays the same.{" "}
        <code>errors</code> and <code>warnings</code> are its messages (see{" "}
        <Link to="validation">Validation</Link>). <code>externalErrors</code> are the errors the
        application contributes from outside the rules (see{" "}
        <Link to="submission" section="server-errors">
          Server errors
        </Link>
        ). <code>dirty</code> tells you whether the field's value differs from the baseline (see{" "}
        <Link to="changes">Changes</Link>). <code>touched</code> tells you whether the field was
        touched (see{" "}
        <Link to="validation" section="when-messages-appear">
          When messages appear
        </Link>
        ).
      </li>
      <li>
        A number also publishes <code>decimals</code>, <code>min</code>, and <code>max</code>, and a
        date publishes <code>min</code> and <code>max</code>, as long as a state contribution
        supplies them. See <Link to="decimals-and-limits">Decimals and limits</Link>.
      </li>
      <li>
        State formulas evaluate on opening, when the final value of a field they read through{" "}
        <code>values</code> changes, and on every <code>reset()</code>. They read the final values
        of the operation and can read their own field. <code>peek</code> reads without creating a
        dependency. Given the same values, they produce the same state on opening and after reset.
      </li>
      <li>
        No state clears the value or blocks writes. <code>session.edit</code>, formulas, and events
        can still write. A hidden field retains its value in <code>values</code> and in derived
        outputs. <code>required</code> produces an error while the field is empty and still allows
        writes.
      </li>
      <li>
        In React, a hidden field is skipped when rendering, and the binding ignores the renderer's{" "}
        <code>onChange</code> while the field is disabled or read-only. See{" "}
        <Link to="react" section="renderer-registry">
          React
        </Link>
        .
      </li>
    </ul>

    <h2 id="flags-and-reasons">Boolean state properties and reasons</h2>
    <ul>
      <li>
        <code>disabled</code>, <code>readOnly</code>, <code>hidden</code>, and <code>required</code>{" "}
        accept a formula or an array of formulas. Each formula makes an independent state
        contribution, and the property is <code>true</code> if any contribution is true.{" "}
        <code>false</code> and <code>undefined</code> withdraw that contribution. A contribution
        from another formula can still keep the property active.
      </li>
      <li>
        For <code>disabled</code> and <code>readOnly</code>, a nonempty string counts as{" "}
        <code>true</code> with that reason. <code>reasons</code> collects the reasons for both,
        without duplicates and in declaration order. The field comes first, followed by the entries
        in <code>rules</code>, and finally the lock.
      </li>
      <li>
        <code>field.text</code>, <code>field.number</code>, <code>field.checkbox</code>,{" "}
        <code>field.select</code>, and <code>field.async</code> also accept these four properties.
        This is the state declared on the field, a contribution that no rule can withdraw.
      </li>
    </ul>
    <Example
      id="delivery-note"
      title="Delivery note with declared state, two causes, and a conditional field"
      files={["examples/state/flags.tsx"]}
      steps={[
        "“Order” is read-only and shows the reason declared on the field.",
        "Enter a floor and uncheck “Include note”. The note is disabled with “No note included”, and the floor disappears. The floor keeps its value in snapshot.values.",
        "Check “Order confirmed”. The note shows both reasons in array order.",
        "Check “Include note” again. The confirmation keeps the note disabled, and the floor reappears with its value and is required.",
        "Try typing in the note. Its value stays the same. Click the button. The core accepts the write.",
      ]}
    />

    <h2 id="label-and-placeholder">Label and placeholder</h2>
    <ul>
      <li>
        <code>label</code> and <code>placeholder</code> accept a single formula that returns a
        string or <code>undefined</code>. <code>placeholder</code> is only available on text,
        number, date, async, and multiAsync fields.
      </li>
      <li>
        The last declared contribution that returns a string wins. <code>undefined</code> falls back
        to the previous contribution and ultimately to the definition. <code>""</code> is a value
        and clears the label.
      </li>
      <li>
        The <code>label</code> and <code>placeholder</code> on a <code>Field</code> take precedence
        in that view.
      </li>
    </ul>
    <Example
      id="municipality-and-postal-code"
      title="Municipality in Spain and a compact postal code"
      files={["examples/state/labels.tsx"]}
      steps={[
        "With Spain selected, city is labeled “Municipality” and suggests “E.g., Madrid”.",
        "Choose Mexico. The definition's “City” label returns, and the field suggests “E.g., Mexico City”.",
        "Choose “No selection”. The city has no placeholder because the definition supplies none.",
        'Check “Compact view”. The postal code label becomes "" and the placeholder takes its place.',
        "The second view of city keeps its label in every step.",
      ]}
    />

    <h2 id="patch">State patch</h2>
    <ul>
      <li>
        <code>states</code> is a formula that returns state properties for several fields as{" "}
        <code>
          {
            "{ [field]: { disabled?, readOnly?, hidden?, required?, label?, placeholder?, decimals?, min?, max?, error?, warning? } }"
          }
        </code>{" "}
        or <code>undefined</code>. By convention, declare it under the field that motivates it. This
        position determines its order.
      </li>
      <li>
        Each evaluation replaces the entire patch. A field or property that drops out loses its
        previous contribution, and <code>undefined</code> withdraws them all.
      </li>
      <li>
        A state patch writes no values. <Link to="events">Events</Link> handle those writes. Fields,
        properties, and values are checked in types and at runtime.
      </li>
    </ul>
    <Example
      id="patch-demo"
      title="Shipping or store pickup"
      files={["examples/state/patch.tsx"]}
      steps={[
        "With “Shipping” selected, the store is hidden and the address and city are required.",
        "Enter an address and choose “Store pickup”. The address and city disappear, and the store appears as a required field.",
        "Switch back to “Shipping”. The address keeps what you entered because hiding it preserves the value.",
      ]}
    />

    <h2 id="form-lock">Form lock</h2>
    <ul>
      <li>
        The <code>form</code> section of <code>defineForm</code> accepts <code>readOnly</code> as
        one <code>{"{ value, except? }"}</code> entry or an array of entries. <code>value</code> is
        a formula like those for <code>readOnly</code>, and its reason goes at the end of{" "}
        <code>reasons</code>.
      </li>
      <li>
        Each entry contributes read-only state to all fields except those in <code>except</code>, a
        fixed list. An exception excludes only that contribution. The field can still be read-only
        because of its own rules.
      </li>
      <li>
        State formulas and the lock can also read session context such as the mode. For example,{" "}
        <code>{'{ value: (_, { context }) => context.mode === "view" && "Read-only" }'}</code>. See{" "}
        <Link to="context">Context</Link>.
      </li>
    </ul>
    <Example
      id="confirmed-order"
      title="A confirmed order"
      files={["examples/state/lock.tsx"]}
      steps={[
        "Check “Order confirmed”. The customer, quantity, and review fields become read-only and show the reason. The internal comment stays editable.",
        "Try entering a quantity. Its value stays the same. Click the button. The core accepts the write.",
        "Uncheck the confirmation, check “Under review”, and confirm again. The comment becomes read-only because of its own rule, even though it is exempt from the lock.",
        "Uncheck the confirmation. The other fields become editable again.",
      ]}
    />

    <h2 id="conditional-configuration">Conditional configuration</h2>
    <ul>
      <li>
        Setting an optional property to <code>undefined</code> is equivalent to omitting it in types
        and at runtime. This applies to field configuration, sections of <code>defineForm</code>,
        rule entries or their properties, and the lock and its <code>except</code>. You can write{" "}
        <code>hidden: enabled ? rule : undefined</code> without conditional spreads.
      </li>
      <li>
        A <code>default</code> of <code>undefined</code> leaves the field at its empty value.
      </li>
      <li>
        An unknown key remains an error even when set to <code>undefined</code>. The same goes for
        an omitted required member such as <code>fields</code>, a select field's{" "}
        <code>options</code>, or the lock's <code>value</code>, an <code>undefined</code> element in
        an array of formulas, and an <code>undefined</code> value in <code>initial</code>. A{" "}
        <code>placeholder</code> on a checkbox or select is a type and runtime error, with two
        exceptions. In the definition, <code>placeholder: undefined</code> contributes nothing. The{" "}
        <code>Field</code> prop is ignored at runtime.
      </li>
      <li>
        Derived output names are part of the definition's type, so an <code>outputs</code> section
        that can be <code>undefined</code> declares no derived outputs. For a conditional derived
        output, put the condition inside the function.
      </li>
      <li>
        The application configuration chooses the definition here. For settings that change per
        session, such as opening a record in view mode, <Link to="context">Context</Link> is a
        better fit. Use one definition and a different <code>key</code> for each mode.
      </li>
    </ul>
    <Example
      id="optional-discounts"
      title="Optional discounts and view mode"
      files={["examples/state/conditional.tsx"]}
      steps={[
        "With discounts off, “Discount (%)” is hidden and has a value of 0 in snapshot.values.",
        "Click “The company uses discounts”. Another session opens with the other definition. The discount appears empty, with null, and disabled with “Choose a customer”.",
        "Enter a customer. The discount becomes enabled.",
        "Click “View mode”. Another session opens without a customer, and all three fields become read-only with “View mode”.",
      ]}
    />

    <h2 id="errors">Errors</h2>
    <p>
      If a state formula throws or returns a value outside its domain, the whole operation is
      rejected. The error names the field and property, the array element, or the lock entry, as in{" "}
      <code>Field "note" readOnly[1]: formula failed: …</code>,{" "}
      <code>{'Field "delivery" states: unknown property "value" for field "city"'}</code>, or{" "}
      <code>Form readOnly[0]: incompatible result 5, …</code>. See{" "}
      <Link to="errors">Errors and limits</Link>.
    </p>
  </>
);
