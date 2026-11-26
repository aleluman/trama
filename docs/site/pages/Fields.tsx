import { Example } from "../lib/Example";
import { Link } from "../lib/router";
import { DateAndMultiple } from "./FieldsDateMultiple";

export const Fields = () => (
  <>
    <h1>Fields</h1>
    <p className="lead">
      Declare fields in <code>fields</code> with the <code>field</code> helpers. The field type
      determines what value the field stores, its empty value, and what configuration it accepts.
    </p>

    <h2 id="available-types">Available types</h2>
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Helper</th>
            <th>Value</th>
            <th>Without a default</th>
            <th>Configuration</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>field.text()</code>
            </td>
            <td>
              <code>string</code>
            </td>
            <td>
              <code>""</code>
            </td>
            <td>
              <code>label</code>, <code>placeholder</code>, <code>default</code>, state
            </td>
          </tr>
          <tr>
            <td>
              <code>field.number()</code>
            </td>
            <td>
              <code>number | null</code>, finite numbers only
            </td>
            <td>
              <code>null</code>
            </td>
            <td>
              <code>label</code>, <code>placeholder</code>, <code>default</code>,{" "}
              <code>decimals</code>, <code>min</code>, <code>max</code>, state
            </td>
          </tr>
          <tr>
            <td>
              <code>field.checkbox()</code>
            </td>
            <td>
              <code>boolean</code>
            </td>
            <td>
              <code>false</code>
            </td>
            <td>
              <code>label</code>, <code>default</code>, state
            </td>
          </tr>
          <tr>
            <td>
              <code>field.date()</code>
            </td>
            <td>
              <code>string | null</code>, a civil date <code>YYYY-MM-DD</code>
            </td>
            <td>
              <code>null</code>
            </td>
            <td>
              <code>label</code>, <code>placeholder</code>, <code>default</code>, <code>min</code>,{" "}
              <code>max</code>, state
            </td>
          </tr>
          <tr>
            <td>
              <code>field.select({"{ options }"})</code>
            </td>
            <td>
              One of the <code>value</code> entries in <code>options</code>, or <code>null</code>
            </td>
            <td>
              <code>null</code>
            </td>
            <td>
              <code>options</code> (required), <code>label</code>, <code>default</code>, state
            </td>
          </tr>
          <tr>
            <td>
              <code>field.multiSelect({"{ options }"})</code>
            </td>
            <td>
              A frozen array of unique <code>value</code> entries from <code>options</code>
            </td>
            <td>
              <code>[]</code>
            </td>
            <td>
              <code>options</code> (required), <code>label</code>, <code>default</code> (an array of
              option values), state
            </td>
          </tr>
          <tr>
            <td>
              <code>field.async(key)</code>
            </td>
            <td>
              The complete option returned by the endpoint, frozen, or <code>null</code>
            </td>
            <td>
              <code>null</code>
            </td>
            <td>
              <code>label</code>, <code>placeholder</code>, <code>default</code> (a complete
              option), state
            </td>
          </tr>
          <tr>
            <td>
              <code>field.multiAsync(key)</code>
            </td>
            <td>
              A frozen array of complete options with unique <code>value</code> entries
            </td>
            <td>
              <code>[]</code>
            </td>
            <td>
              <code>label</code>, <code>placeholder</code>, <code>default</code> (an array of
              complete options), state
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <ul>
      <li>
        Options for <code>select</code> and <code>multiSelect</code> have a unique{" "}
        <code>value</code> (a string or number) and a <code>label</code>. The value type is the
        union of the literal values, such as <code>"free" | "pro"</code>. A general{" "}
        <code>string</code> is too broad.
      </li>
      <li>
        <code>field.async</code> and <code>field.multiAsync</code> are only available on the{" "}
        <code>field</code> that <code>createForms</code> returns, which knows the application's
        endpoints. The key names the endpoint, which determines the option type. See{" "}
        <Link to="remote-select">Remote select</Link>.
      </li>
      <li>
        A text area, a switch, or a search with a table are <Link to="subtypes">Subtypes</Link> the
        application declares in <code>createForms</code>. They retain the value of their base field
        type and have their own renderer.
      </li>
      <li>
        <code>label</code> and <code>placeholder</code> are the default texts. Rules can change them
        (see{" "}
        <Link to="field-state" section="label-and-placeholder">
          Label and placeholder
        </Link>
        ) and each <code>Field</code> can override them without changing the definition (see{" "}
        <Link to="react" section="field">
          Field
        </Link>
        ).
      </li>
      <li>
        <code>decimals</code>, <code>min</code>, and <code>max</code> are state properties. Rules
        can change them, the renderer receives them, and they leave the value unchanged (see{" "}
        <Link to="decimals-and-limits">Decimals and limits</Link>).
      </li>
      <li>
        For state, <code>disabled</code> and <code>readOnly</code> accept <code>true</code> or a
        nonempty reason, <code>hidden</code> accepts a boolean, and <code>required</code> accepts a
        boolean or a nonempty validation message. No rule can withdraw this state declared on the
        field (see{" "}
        <Link to="field-state" section="flags-and-reasons">
          Boolean state properties and reasons
        </Link>
        ).
      </li>
      <li>
        A <code>default</code> must be compatible with the field type. <code>defineForm</code>{" "}
        checks it when called. With <code>undefined</code>, the field starts at its empty value,
        just as when no default is given (see{" "}
        <Link to="field-state" section="conditional-configuration">
          Conditional configuration
        </Link>
        ).
      </li>
    </ul>

    <Example
      id="text-number-checkbox-and-select"
      title="Text, number, checkbox, and select"
      files={["examples/fields/all-types.tsx"]}
      steps={[
        <>
          Clear “Age”. <code>age</code> becomes <code>null</code>. It does not become <code>0</code>{" "}
          or <code>""</code>.
        </>,
        <>
          In “Plan”, choose “No selection”. <code>plan</code> becomes <code>null</code>.
        </>,
        <>
          “Seats” has no default and starts at <code>null</code>. Choose “5 seats” to get the number{" "}
          <code>5</code>. The value is never the string <code>"5"</code>.
        </>,
      ]}
    >
      <p>
        <code>FormValues&lt;typeof profile&gt;</code> gives you the type of the values without
        writing it by hand. The comment in the file shows the inferred type.
      </p>
    </Example>

    <DateAndMultiple />

    <h2 id="runtime-validation">Runtime validation</h2>
    <p>
      TypeScript checks names and types as you write code. Trama also validates data at runtime when
      it comes from outside, such as from an API or untyped code. An incompatible value throws an{" "}
      <code>Error</code> and leaves the session unchanged. This check covers types. An empty
      required field or an out-of-range value is accepted, and the resulting validation error
      prevents preparing a submission.
    </p>
    <Example
      id="rejected-values"
      title="Rejected values"
      files={["examples/fields/runtime-checks.ts"]}
    >
      <p>
        The <code>@ts-expect-error</code> comments mark the attempts that TypeScript already
        rejects. The attempts still run, and Trama also rejects them through the session when
        editing or through <code>defineForm</code> when creating the definition. A date that does
        not exist or a duplicate option value passes TypeScript, and runtime validation rejects it.
      </p>
    </Example>
  </>
);
