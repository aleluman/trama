import { Example } from "../lib/Example";
import { Link } from "../lib/router";
import { Snippet } from "../lib/Snippet";

export const Limits = () => (
  <>
    <h1>Decimals and limits</h1>
    <p className="lead">
      A number field also publishes its decimals, minimum, and maximum, and a date field publishes
      its minimum and maximum. Like the label, these are state properties. The definition, rules,
      and state patches supply them, and the renderer decides how to display them. They never change
      the value. A value outside its limits is stored with an error (see{" "}
      <Link to="validation">Validation</Link>).
    </p>
    <Snippet>{`fields: {
  price: field.number({ decimals: 0, min: 0 }),
  discount: field.number({ min: 0, max: 100 }),
  to: field.date({ max: "2026-12-31" }),
},
rules: {
  price: { decimals: ({ currency }) => (currency === "USD" ? 2 : undefined) },
  discount: { max: ({ free }) => (free ? null : undefined) },
  to: { min: ({ from }) => from },
},`}</Snippet>

    <h2 id="declaration">Declaration</h2>
    <ul>
      <li>
        <code>{"field.number({ decimals?, min?, max? })"}</code> and{" "}
        <code>{"field.date({ min?, max? })"}</code>. <code>decimals</code> is a nonnegative integer.
        A number limit is a finite number, and a date limit is a <code>YYYY-MM-DD</code> civil date.
        The definition rejects <code>null</code>. Omit a limit to leave it unset.
      </li>
      <li>
        <code>defineForm</code> rejects a minimum greater than the maximum (
        <code>Field "price" (number): min 20 exceeds max 10</code>). Other types lack these
        properties (for example, <code>Field "note": text fields have no min</code>).
      </li>
      <li>
        In <code>rules</code>, each property accepts one formula, like <code>label</code>. You can
        also declare them in rows with <code>each</code>, in <code>states</code> patches such as{" "}
        <code>{"{ discount: { max: null } }"}</code>, and in rule sets (see{" "}
        <Link to="rule-sets">Rule sets</Link>).
      </li>
    </ul>

    <h2 id="contributions">Contributions</h2>
    <ul>
      <li>
        The last declared contribution wins. The definition comes first, followed by rule sets in{" "}
        <code>include</code> order, then the form's rules in their declaration order. A state patch
        counts at the position of its entry.
      </li>
      <li>
        <code>undefined</code> withdraws that rule's contribution, so the previous contribution
        applies, falling back to the definition.
      </li>
      <li>
        <code>null</code> is allowed only for <code>min</code> and <code>max</code> in a rule or
        patch. It removes the limit from earlier contributions, and a later contribution can restore
        it. <code>decimals: null</code> is an error. Use <code>0</code> for no decimals.
      </li>
      <li>
        State is sparse. <code>fieldStates[field]</code> has <code>decimals</code>, <code>min</code>
        , or <code>max</code> only while a contribution supplies it, and none of these can ever be{" "}
        <code>null</code>. State keeps its identity while it stays unchanged.
      </li>
    </ul>

    <h2 id="renderer">The value and the renderer</h2>
    <ul>
      <li>
        Trama neither rounds nor clamps. A price of 123.456 with two decimals stays 123.456 in{" "}
        <code>values</code>, and a negative quantity with a minimum of 0 is stored with a{" "}
        <code>Minimum 0</code> error in its state. Limits do not prevent writes.
      </li>
      <li>
        <code>NumberFieldProps</code> adds <code>decimals</code>, <code>min</code>, and{" "}
        <code>max</code> as <code>number | undefined</code>. <code>DateFieldProps</code> adds{" "}
        <code>min</code> and <code>max</code> as <code>string | undefined</code>. A renderer that
        ignores them still compiles.
      </li>
      <li>
        This guide's number renderer displays the value with its decimals while the field is idle.
        It leaves the stored value unchanged and shows a hint below with the limits and decimals. It
        uses a text input, where the <code>min</code> and <code>max</code> attributes would have no
        effect.
      </li>
    </ul>
    <Example
      id="order-in-yen-or-dollars"
      title="An order in yen or dollars"
      files={["examples/limits/order.tsx", "ui/inputs.tsx"]}
      steps={[
        <>
          The first price was prefilled with 123.456. In yen, the input shows 123 and the hint says
          “No decimals”. In <code>snapshot.values</code>, <code>price</code> is still 123.456.
        </>,
        "Click that price. While you edit it, the input shows 123.456. Leave the input and it shows 123 again.",
        <>
          Choose “Dollars”. Both lines publish <code>decimals: 2</code> and display 123.46 and
          80.00. The values stay the same.
        </>,
        <>
          Check “No cap” on the first line. <code>max</code> disappears from its discount state,
          leaving <code>{"{ min: 0 }"}</code>, and the hint says “Minimum 0”. Uncheck it and{" "}
          <code>max: 100</code> returns.
        </>,
        <>
          Enter -3 as the quantity on the second line. <code>quantity</code> becomes -3 even though
          its minimum is 0, and its state publishes <code>{'errors: ["Minimum 0"]'}</code>, which
          the state panel shows.
        </>,
      ]}
    />

    <h2 id="date-limits">Date limits</h2>
    <ul>
      <li>
        One date limits another through a formula, as in{" "}
        <code>{"to: { min: ({ from }) => from }"}</code>. While <code>from</code> is{" "}
        <code>null</code>, the formula returns <code>null</code> and <code>to</code> does not
        publish <code>min</code>.
      </li>
      <li>
        This guide's date renderer passes the limits to the browser's input, whose calendar does not
        offer dates outside them.
      </li>
    </ul>
    <Example
      id="non-overlapping-period"
      title="A period whose dates stay in order"
      files={["examples/limits/period.tsx", "ui/date-input.tsx"]}
      steps={[
        <>
          With no dates, neither <code>from</code> nor <code>to</code> publishes <code>min</code> or{" "}
          <code>max</code>.
        </>,
        <>
          Choose March 10, 2026, in “From”. <code>to</code> publishes <code>min: "2026-03-10"</code>
          , and the “To” calendar does not offer earlier dates.
        </>,
        <>
          Choose March 20 in “To”. <code>from</code> publishes <code>max: "2026-03-20"</code>, and
          its calendar does not offer later dates.
        </>,
        <>
          Click “Remove” next to “From”. <code>from</code> returns to <code>null</code> and{" "}
          <code>min</code> disappears from the state of <code>to</code>.
        </>,
      ]}
    />

    <h2 id="consistency">Consistency</h2>
    <ul>
      <li>
        Trama checks only the combined result for each field. A minimum above the definition's
        maximum is accepted if a later contribution supplies another maximum.
      </li>
      <li>
        If the resulting minimum exceeds the maximum, Trama rejects the entire operation and the
        session keeps its snapshot. For example,{" "}
        <code>Field "price" of "lines" row "r3" (number): min 10 exceeds max 5</code>. During
        opening, <code>createSession</code> throws.
      </li>
    </ul>
    <Example
      id="minimum-crosses-the-maximum"
      title="A minimum that exceeds the maximum"
      files={["examples/limits/coherence.ts"]}
    />

    <h2 id="errors">Errors</h2>
    <ul>
      <li>
        When a formula or patch returns a result outside its domain, Trama rejects the operation.
        For example,{" "}
        <code>
          Field "price" decimals: incompatible result -1, expected a non-negative integer or
          undefined
        </code>{" "}
        or <code>{'Field "trigger" states: text field "note" has no min'}</code>.
      </li>
      <li>
        Type diagnostics include <code>field "from" has no decimals</code>,{" "}
        <code>field "to" min takes a date or null</code>, and{" "}
        <code>field "price" max takes a number or null</code>, with <code>of "lines"</code> for
        rows. See{" "}
        <Link to="errors" section="common-messages">
          Errors and limits
        </Link>
        .
      </li>
    </ul>

    <h2 id="limits">Limits</h2>
    <ul>
      <li>
        The limits never change the value: a value outside them is a built-in validation error. See{" "}
        <Link to="validation" section="built-in-validation">
          Validation
        </Link>
        .
      </li>
      <li>
        Like <code>label</code>, these properties accept one formula each. They reject arrays.
      </li>
      <li>
        The renderer alone handles formatting, such as thousands separators, currency, and date
        formats.
      </li>
    </ul>
  </>
);
