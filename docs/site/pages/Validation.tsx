import { Example } from "../lib/Example";
import { Link } from "../lib/router";
import { Snippet } from "../lib/Snippet";

export const Validation = () => (
  <>
    <h1>Validation</h1>
    <p className="lead">
      Errors and warnings are state properties. Rules contribute them to a field, row, collection,
      or form, and each field also validates its <code>required</code>, <code>min</code>, and{" "}
      <code>max</code>. The session calculates all of this without mounted controls, and you can
      still write a value.
    </p>
    <Snippet>{`fields: {
  since: field.date({ required: "Choose the period" }),
  until: field.date({ required: true }),
},
rules: {
  until: { min: ({ since }) => since },
  codes: { required: ({ ids }) => ids === "" && "Choose a type or enter IDs" },
  lines: {
    row: { error: ({ debit, credit }) => debit === null && credit === null && "Enter a debit or a credit" },
    collection: { error: ({ lines }) => lines.length === 0 && "Add at least one line" },
    each: { quantity: { warning: ({ quantity }) => (quantity ?? 0) > 100 && "More than 100" } },
  },
},
form: { warning: ({ since, until }) => … && "The period crosses a year boundary" },`}</Snippet>

    <h2 id="rule-messages">Rule messages</h2>
    <ul>
      <li>
        Like <code>disabled</code>, <code>error</code> and <code>warning</code> accept a formula or
        an array of formulas. Each formula returns a nonempty message, or <code>false</code> or{" "}
        <code>undefined</code> to withdraw its contribution, as in <code>cond && "Message"</code>.
      </li>
      <li>
        A field receives messages from its entry in <code>rules</code>, from <code>each</code> for
        rows, and from <code>states</code> patches. Its state publishes them in <code>errors</code>{" "}
        and <code>warnings</code> in declaration order without duplicates.
      </li>
      <li>
        A row receives its own messages in <code>{"rules.<collection>.row"}</code>, which reads row
        values, and a collection in <code>{"rules.<collection>.collection"}</code>, which reads the
        header. The form has its own messages in the <code>form</code> section, alongside the form
        lock. Rule sets add messages for rows and collections (see{" "}
        <Link to="rule-sets">Rule sets</Link>).
      </li>
    </ul>

    <h2 id="built-in-validation">Built-in validation</h2>
    <ul>
      <li>
        <code>required</code> accepts a boolean or a message in the definition, rules, and patches.
        An empty required field has an error. The empty value is <code>""</code>, <code>null</code>,{" "}
        <code>[]</code>, or an unchecked checkbox. The last active contribution with a message
        supplies it. If none supplies a message, the application text is used.
      </li>
      <li>
        <code>min</code> and <code>max</code> reject nonempty values outside their inclusive bounds
        during validation. The value is stored unchanged, and its error appears alongside the
        others. Limits never clamp or round (see{" "}
        <Link to="decimals-and-limits">Decimals and limits</Link>).
      </li>
      <li>
        The validation error comes first in <code>errors</code>, and a rule that returns the same
        text does not repeat it.
      </li>
      <li>
        State never excludes a field from validation. If a hidden field should be optional, make its{" "}
        <code>required</code> conditional.
      </li>
    </ul>

    <h2 id="application-text">Application text</h2>
    <p>
      <code>{"createForms({ endpoints, messages })"}</code> declares the text for{" "}
      <code>required</code>, <code>min</code>, and <code>max</code> once. <code>required</code>{" "}
      receives <code>{"{ label }"}</code>, and <code>min</code> and <code>max</code> receive{" "}
      <code>{"{ type, min | max, label }"}</code>. None ever receives the value. Without these
      functions, the texts are <code>Required</code>, <code>Minimum 0</code>, and{" "}
      <code>Maximum 100</code>. If a message function throws or fails to return a nonempty string,
      Trama rejects the operation.
    </p>

    <h2 id="counts">Counts</h2>
    <ul>
      <li>
        <code>snapshot.form</code> publishes the form's messages and, in <code>collections</code>,
        the messages for each collection. A row's snapshot publishes its own messages.
      </li>
      <li>
        Each scope totals <code>errorCount</code> and <code>warningCount</code>, the number of
        targets with at least one message, including its fields, itself, and anything it contains. A
        field with three errors counts once.
      </li>
      <li>
        Moving a row keeps its messages, and removing it subtracts them from the counts. An object
        keeps its identity while it stays unchanged.
      </li>
    </ul>
    <h2 id="when-messages-appear">When messages appear</h2>
    <p>
      The session calculates full validity even when nothing is shown. The binding decides which
      local errors each renderer receives in <code>errors</code>. Warnings always arrive in{" "}
      <code>warnings</code>, and external errors such as those from the server always arrive in{" "}
      <code>errors</code> after local errors (see{" "}
      <Link to="submission" section="server-errors">
        Server errors
      </Link>
      ).
    </p>
    <ul>
      <li>
        With <code>showErrors: "touched"</code>, the default for <code>createReactBinding</code>{" "}
        (see <Link to="react">React</Link>), a field shows its errors after it is touched, when its
        renderer calls <code>onBlur</code>, or after an attempt, which <code>prepare</code> marks.
        With <code>"attempted"</code>, it shows them only after an attempt. An application that uses
        two policies needs two bindings.
      </li>
      <li>
        A cell uses its row's attempt. A new row has no attempt mark. With <code>"touched"</code>,
        its local cell and row errors appear on touch or on the next attempt. With{" "}
        <code>"attempted"</code>, they appear on the next attempt. Touching a cell also touches its
        row, so with <code>"touched"</code> the row shows its own errors when the row or one of its
        cells is touched. A collection and the form show their own errors after an attempt.
      </li>
      <li>
        <code>session.touch(name)</code>, <code>row.touch(name)</code>, and <code>row.touch()</code>{" "}
        mark the target as touched without a renderer. The field state and row snapshot publish{" "}
        <code>touched</code>. Editing does not mark the target as touched, touching it again does
        not publish, and resetting clears the marks. <code>commit</code> keeps them.
      </li>
      <li>
        <code>ui.useFormState</code> returns a scope's state with the errors its binding displays
        (see <Link to="react">React</Link>).
      </li>
    </ul>
    <Example
      id="errors-on-touch-and-after-an-attempt"
      title="The same errors on touch and after an attempt"
      wide
      files={["examples/validation/visibility.tsx", "ui/inputs.tsx"]}
      steps={[
        <>
          On opening, the panel counts 2 errors and neither column shows any. Focus “Customer” in
          the “On touch” column and leave it without typing. Only that column shows “Choose the
          customer”.
        </>,
        <>
          Click “Prepare”. Both columns show “Choose the customer” and “Product is missing”, and the
          panel says “Attempted”.
        </>,
        <>
          Click “Add line”. The panel counts 3 errors, but neither column shows the new line's
          error. Focus its product in “On touch” and leave the field. That column shows the error.
        </>,
        "Click “Reset”. The errors are hidden again and the panel says “No attempt”.",
      ]}
    />
    <Example
      id="report-period-validation"
      title="A report that validates its period"
      files={["examples/validation/report.ts"]}
      steps={[
        <>
          On opening, <code>since</code> has “Choose the period”, <code>until</code> has the
          application's “To is required”, and <code>kinds</code> has its own message. The form
          counts three errors.
        </>,
        <>
          With “To” before “From”, <code>until</code> has “No earlier than 2026-03-10”, and its
          value stays <code>2026-03-01</code>.
        </>,
        <>
          A period that crosses a year boundary leaves only the <code>kinds</code> error and the
          form warning.
        </>,
        "With IDs, kinds stops being required. errorCount reaches 0, and the warning remains.",
      ]}
    />
    <Example
      id="document-with-lines"
      title="A document with lines"
      files={["examples/validation/document.ts"]}
      steps={[
        <>
          With no lines, the collection has “Add at least one line” and counts one error, which the
          form includes in its count.
        </>,
        <>
          With two lines, the first has “Enter a debit or a credit” and the second has a warning on
          its quantity. The collection counts one error and one warning.
        </>,
        "A credit of -5 has “Minimum 0”, the default text. With 5, the collection has no errors.",
      ]}
    />
  </>
);
