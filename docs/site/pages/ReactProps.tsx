import { Link } from "../lib/router";

// The table of props a renderer receives, in “React”.
export const RendererProps = () => (
  <div className="table-scroll">
    <table>
      <thead>
        <tr>
          <th>Prop</th>
          <th>Field types</th>
          <th>Contents</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <code>id</code>
          </td>
          <td>all</td>
          <td>
            Unique to each mounted <code>Field</code> (<code>useId</code>). Used for{" "}
            <code>htmlFor</code>.
          </td>
        </tr>
        <tr>
          <td>
            <code>name</code>
          </td>
          <td>all</td>
          <td>The field's name in the definition.</td>
        </tr>
        <tr>
          <td>
            <code>label</code>
          </td>
          <td>all</td>
          <td>
            The value from <code>Field</code>, or the value from field state, which starts with the
            value from the definition.
          </td>
        </tr>
        <tr>
          <td>
            <code>value</code> / <code>onChange</code>
          </td>
          <td>all</td>
          <td>
            <code>string</code>, <code>number | null</code>, <code>boolean</code>, a{" "}
            <code>YYYY-MM-DD</code> date <code>| null</code>, an option's value <code>| null</code>,
            or, for async fields, the complete option <code>| null</code>. For multiSelect, it is an
            array of values, and for multiAsync, it is an array of complete options.{" "}
            <code>onChange</code> calls <code>session.edit</code> except when the field is disabled
            or read-only, in which case the binding ignores it.
          </td>
        </tr>
        <tr>
          <td>
            <code>disabled</code> / <code>readOnly</code> / <code>required</code>
          </td>
          <td>all</td>
          <td>
            Field state (see <Link to="field-state">Field state</Link>). <code>required</code> is a
            marker and does not validate.
          </td>
        </tr>
        <tr>
          <td>
            <code>reasons</code>
          </td>
          <td>all</td>
          <td>
            Reasons for <code>disabled</code> and <code>readOnly</code>, in order and without
            duplicates.
          </td>
        </tr>
        <tr>
          <td>
            <code>errors</code> / <code>warnings</code>
          </td>
          <td>all</td>
          <td>
            The field errors shown by the registry policy (see{" "}
            <Link to="react" section="visible-errors">
              Visible errors
            </Link>
            ), followed by external errors, which are always shown, and warnings, which are also
            always shown. A renderer that does not read them shows no messages.
          </td>
        </tr>
        <tr>
          <td>
            <code>dirty</code>
          </td>
          <td>all</td>
          <td>
            Whether the value differs from the baseline (see <Link to="changes">Changes</Link>).
          </td>
        </tr>
        <tr>
          <td>
            <code>onBlur</code>
          </td>
          <td>all</td>
          <td>Marks the field as touched. The renderer calls it when focus leaves the field.</td>
        </tr>
        <tr>
          <td>
            <code>onInputError</code>
          </td>
          <td>all</td>
          <td>
            Reports text that the renderer could not convert into a value, or, with no message,
            reports that there is no such text. It is called after <code>onChange</code>, which can
            fail (see{" "}
            <Link to="submission" section="pending-input">
              Pending input
            </Link>
            ).
          </td>
        </tr>
        <tr>
          <td>
            <code>placeholder</code>
          </td>
          <td>text, number, date, async, multiAsync</td>
          <td>
            The value from <code>Field</code>, or the value from field state, which starts with the
            value from the definition.
          </td>
        </tr>
        <tr>
          <td>
            <code>decimals</code> / <code>min</code> / <code>max</code>
          </td>
          <td>number, with min and max also on date</td>
          <td>
            The properties from field state, or <code>undefined</code> while no contribution
            supplies them. They do not change the value, and the renderer decides how to show them
            (see <Link to="decimals-and-limits">Decimals and limits</Link>).
          </td>
        </tr>
        <tr>
          <td>
            <code>options</code>
          </td>
          <td>select, multiSelect</td>
          <td>
            The options from the definition, <code>{"{ value, label }[]"}</code>.
          </td>
        </tr>
        <tr>
          <td>
            <code>list</code>
          </td>
          <td>async, multiAsync</td>
          <td>
            The option list for that view, with its snapshot and <code>open</code>,{" "}
            <code>search</code>, <code>more</code>, and <code>retry</code>. See{" "}
            <Link to="remote-select" section="renderer">
              Remote select
            </Link>
            .
          </td>
        </tr>
        <tr>
          <td>
            <code>presentation</code>
          </td>
          <td>subtypes</td>
          <td>
            The presentation from the definition, frozen and with the same identity on every render.
            See <Link to="subtypes">Subtypes</Link>.
          </td>
        </tr>
      </tbody>
    </table>
  </div>
);
