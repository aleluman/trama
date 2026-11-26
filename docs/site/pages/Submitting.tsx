import { Example } from "../lib/Example";
import { Link } from "../lib/router";
import { Snippet } from "../lib/Snippet";

export const Submitting = () => (
  <>
    <h1>Submission</h1>
    <p className="lead">
      <code>prepare</code> validates the form and captures what will be sent. The application
      projects its payload and sends it. When the server accepts it, <code>commit</code> makes the
      saved values the new baseline while preserving edits made in the meantime. If the server
      rejects it, <code>setErrors</code> places its errors where they belong.
    </p>
    <Snippet>{`const sent = await session.prepare({ signal });
if (sent.status === "invalid") show(sent.issues);
if (sent.status === "ready") {
  const reply = await server.save(toPayload(sent.values));
  if (reply.ok) session.commit(sent, { number: reply.number });
  else session.setErrors("server", toIssues(reply, sent), { from: sent });
}`}</Snippet>

    <h2 id="prepare">Prepare</h2>
    <ul>
      <li>
        <code>session.prepare(options?)</code> returns a promise of one of three results.
        <ul>
          <li>
            <code>{'{ status: "ready", values, rows, warnings }'}</code> contains the values and row
            keys at that moment, by identity, plus the warnings. This is the{" "}
            <em>prepared submission</em>, immutable and tied to its session.
          </li>
          <li>
            <code>{'{ status: "invalid", issues }'}</code> means a target has an error or a query
            required for submission failed.
          </li>
          <li>
            <code>{'{ status: "cancelled" }'}</code> means something canceled preparation while it
            was waiting.
          </li>
        </ul>
      </li>
      <li>
        Each issue is an <code>Issue</code> with a <code>message</code> and a location given by{" "}
        <code>field</code>, <code>collection</code>, and <code>key</code>. Issues come in visual
        order. First comes the form, then the header in declaration order, and then each
        collection’s own error and its rows in position order, with each row’s own error before its
        cells. Warnings do not block preparation.
      </li>
      <li>
        Field state never excludes a field. <code>values</code> contains all fields, including
        hidden and disabled ones. The application decides what to send when it projects the payload.
      </li>
      <li>
        It marks the attempt. <code>snapshot.form.attempted</code> becomes <code>true</code>, as
        does <code>attempted</code> in the snapshot of each existing row. A row added afterward does
        not inherit it until the next <code>prepare</code>, and a reset clears it.
      </li>
    </ul>

    <h2 id="required-queries">Required queries</h2>
    <ul>
      <li>
        <code>prepare</code> waits only for queries with <code>forPrepare: true</code>, in the
        header, in <code>each</code>, or in a rule set, and for the batch of their responses. If a
        required response starts another required query, it waits for that query too.
      </li>
      <li>
        With nothing to wait for, it captures the values immediately and later edits are excluded. A
        suspended query or an optional query in flight does not stop preparation. Preparation has no
        timeout of its own. Use <code>signal</code> for that.
      </li>
      <li>
        A failed required query is an issue on its field, with the <code>messages.query</code> text
        from <code>createForms</code> (see{" "}
        <Link to="validation" section="application-text">
          Validation
        </Link>
        ).
        <code>retry</code> requests it again.
      </li>
    </ul>

    <h2 id="cancellation">Cancellation</h2>
    <ul>
      <li>
        There is one pending attempt per session. An application operation that changes values or
        rows, a reset, the signal, and another <code>prepare</code> cancel it. An operation with no
        effect, a query response, and <code>commit</code> leave it pending.
      </li>
      <li>
        Canceling stops no queries. The promise resolves with the <code>cancelled</code> result
        without rejecting.
      </li>
      <li>
        The application owns the “sending” status. It sets it before calling <code>prepare</code>{" "}
        and clears it when transport finishes.
      </li>
    </ul>

    <h2 id="commit">Commit</h2>
    <ul>
      <li>
        <code>session.commit(prepared, canonical?)</code> commits a save. The prepared values, with
        the server’s canonical values, become the new baseline for dirty tracking and reset.
      </li>
      <li>
        <code>canonical</code> has the shape of <code>session.patch</code>, with header fields and
        the fields of the rows in the prepared submission, by key. An ID the server assigns to a
        line is located using <code>prepared.rows</code>. It does not create, remove, or reorder
        rows.
      </li>
      <li>
        A canonical value applies to a current field only if the field has not changed since
        preparation. A field that changed counts as changed even if it returned to its previous
        value. Edits made in the meantime are preserved, even if a formula would recalculate the
        field using the canonical value, unless a formula has written to the field again afterward,
        even with the same value. Formulas continue to derive the other values. For this protection,
        a field <code>onEdit</code> writes after preparation counts as changed even when it repeats
        its value. With <code>onChange</code>, only changes in value count.
      </li>
      <li>
        It returns <code>true</code> if it accepts the prepared submission and publishes once. It
        returns <code>false</code> without publishing if the prepared submission predates a reset, a
        later prepared submission has already been accepted, or it has already been accepted. It
        throws if the prepared submission is from another session or if the canonical values are
        invalid, without consuming the prepared submission.
      </li>
      <li>
        After <code>commit</code>, reset restores the committed values and does not query for the
        values that were already committed. It runs a query again if it was in flight or had failed
        at preparation time, its <code>params</code> are defined, and the server did not write its
        field. <code>commit</code> does not clear the attempt.
      </li>
    </ul>
    <h2 id="server-errors">Server errors</h2>
    <p>
      An <em>external error</em> is a message the application supplies from outside the rules, such
      as a response from its server. It is informational, always appears, and does not block another
      attempt to prepare.
    </p>
    <Snippet>{`session.setErrors("server", [
  { message: "Could not save" },                             // the form
  { field: "customer", message: "Credit suspended" },        // a header field
  { collection: "lines", message: "Up to 3 lines" },         // a collection
  { collection: "lines", key, message: "Duplicate line" },  // a row
  { collection: "lines", key, field: "quantity", message: "Out of stock" }, // a cell
], { from: sent });
session.setWarnings("server", warnings, { from: sent });`}</Snippet>
    <ul>
      <li>
        <code>setErrors(source, issues, options?)</code> and <code>setWarnings</code> replace what a{" "}
        <em>source</em> such as <code>"server"</code> supplied in its channel. An empty list clears
        that source’s contribution for the method you call. Its warnings leave its errors alone, and
        two sources do not clear each other’s messages. The whole list is validated before anything
        changes, and the replacement publishes once.
      </li>
      <li>
        Each issue is an <code>Issue&lt;typeof form&gt;</code> using the form’s names. A field,
        collection, or property that does not exist is a type error. Mapping the response takes a{" "}
        <code>.map</code>, and a line index resolves through <code>sent.rows</code> to the row’s key
        at preparation time, even if it moved afterward. Anything the server does not locate goes on
        the form.
      </li>
      <li>
        A row that has already been removed is skipped. A key the session never issued or an unknown
        field causes an exception.
      </li>
      <li>
        With <code>from</code>, the prepared submission that was sent, targets that changed after
        preparation are skipped, even if they returned to their previous values. A late response
        does not mark what the user already corrected. It returns <code>true</code> if it accepts
        the replacement, even if no targets remain, and <code>false</code> without replacing
        anything if the prepared submission predates a reset, a later one has already been
        committed, or it predates the submission the source last wrote with. After{" "}
        <code>commit</code> of its own prepared submission, <code>from</code> is valid until the
        next change in values.
      </li>
      <li>
        They clear automatically when their target changes.
        <ul>
          <li>Changing a field clears its messages.</li>
          <li>Changing a cell also clears its row’s own messages.</li>
          <li>Adding, removing, or moving rows clears the collection’s messages.</li>
          <li>Removing a row clears all its messages, and moving it keeps them.</li>
          <li>A reset clears them all.</li>
          <li>Form-level messages stay until their source replaces them.</li>
        </ul>
        The change can come from an edit, a formula, a query response, or a canonical value from{" "}
        <code>commit</code>.
      </li>
      <li>
        External errors are read separately from local errors. Field state, row snapshots,{" "}
        <code>form</code>, and each collection publish <code>externalErrors</code>, and their{" "}
        <code>warnings</code> combine local and external warnings. <code>errorCount</code> counts a
        target once if it has a local error, an external error, or both. The count no longer
        corresponds to invalidity because only local errors block preparation.
      </li>
      <li>
        The binding wires this up. Each renderer always receives the external errors in{" "}
        <code>errors</code>, after the local errors its policy displays. <code>useFormState</code>{" "}
        provides the errors for its scope the same way.
      </li>
    </ul>
    <Example
      id="save-while-editing"
      title="Save a voucher while continuing to edit"
      wide
      files={[
        "examples/submitting/save.tsx",
        "examples/submitting/voucher.ts",
        "examples/submitting/server.ts",
        "examples/queries/endpoints.ts",
      ]}
      steps={[
        "Click “Save” with no customer. Nothing is sent, and the issue is “customer: Choose the customer”.",
        "Select “Atlas Trading” and click “Save” immediately. “Preparing…” waits 2.5 seconds for the list price, then comes “Sending to the simulated server…” for 2 seconds, then “Saved as No. 1001”. The line receives its ID and the form shows “No changes”.",
        "Select “Prisma Trading”, click “Save”, and change the quantity to 3 before the price arrives. The status shows “Canceled because you made a change during preparation”. The price still arrives.",
        "Click “Save” and while it says “Sending to the simulated server…”, change the quantity to 5. When the server responds, “No.” becomes 1002, the quantity stays at 5, and the form shows “Changes made”.",
        "Click “Reset”. The form goes back to the saved values with “No.” at 1002 and the submitted quantity. It shows “No changes”.",
        "Change the quantity to 150 and click “Save”. The status shows “The server rejected the voucher”, and the quantity shows “Only 100 in stock”, even though no one touched it afterward. Change it to 60. The error clears as you type.",
        "Select “Compass Trading”, click “Save”, and wait. “Customer” shows “This customer’s credit is suspended”. Click “Save” again without changing anything. The error does not block preparation, and the server rejects it again.",
        "Add lines until you have 4 and click “Save”. The panel shows “The server allows up to 3 lines”, in addition to the customer error. Change the customer. Its error clears, and the panel error stays.",
        "With “Atlas Trading” selected, set the first two quantities to 150 and click “Save”. While it says “Sending to the simulated server…”, change the first to 10. When the server responds, only the second shows “Only 100 in stock” because the first changed after preparation.",
        "Click “Reset”. The form returns to the saved values with one line, and the server errors clear. Set the quantity to 60 and click “Save”. The status shows “Saved as No. 1003”, and the line shows the warning “Ships in two deliveries”.",
      ]}
    >
      <p>
        The server is simulated. It takes 2 seconds to save and assigns a number to the voucher and
        an ID to each line without one. It rejects a quantity above 100, the customer “Compass
        Trading”, and more than 3 lines. It warns when a quantity exceeds 50.
      </p>
    </Example>

    <h2 id="pending-input">Pending input</h2>
    <p>
      A renderer that holds text it cannot convert to a value, such as an incomplete or invalid
      date, reports it with <code>onInputError(message)</code>. When it converts the text to a
      value, it calls <code>onChange(value)</code> and then <code>onInputError()</code>. If the
      write fails, the error stays.
    </p>
    <ul>
      <li>
        The message is a local error for its field, appears first in <code>errors</code>, and is
        displayed like other errors. <code>prepare</code> returns <code>invalid</code> and{" "}
        <code>form.inputPending</code> is true. The value and dirty state stay the same.
      </li>
      <li>
        Each view reports its own error. A list and a detail view of the same field do not clear
        each other’s errors.
      </li>
      <li>
        The renderer owns the text and Trama does not store it. A view that unmounts, changes field
        or session, or remounts on reset clears its error. Removing a row clears the errors in its
        cells, and <code>commit</code> preserves those errors.
      </li>
      <li>
        Without the binding, <code>session.input(name)</code> and <code>row.input(name)</code>{" "}
        provide a view controller, <code>{"{ error, dispose }"}</code>. <code>error(message)</code>{" "}
        reports the error, <code>error()</code> clears it, and <code>dispose()</code> ends the view.
      </li>
    </ul>
    <Example
      id="partial-date-in-two-views"
      title="A partially entered date in two views"
      wide
      files={["examples/submitting/transient.tsx", "ui/partial-date.tsx"]}
      steps={[
        "Enter 2026- in “Departure” in the list. The value stays the same, the panel says “Pending input” and “No changes”, and “Discard” appears.",
        "Leave the field. Both views show “Incomplete date (YYYY-MM-DD) · Choose the departure date”. “Prepare” lists both issues for “since”.",
        "In the detail view, enter 2026-05-01. The panel says “Changes made”, the list keeps its draft, and the input is still pending.",
        "Click “Discard” in the list. It shows 2026-05-01, there is no more pending input, and “Prepare” gives “Ready to submit”.",
        "Enter 2026-02-30 in “Day” for the stop and leave the field. “That date does not exist” appears, the stop is touched, and the panel counts one error in the stops.",
      ]}
    >
      <p>
        The date renderer in this demo, <code>ui/partial-date.tsx</code>, uses a text input. The
        guide uses the native control, which keeps its own draft.
      </p>
    </Example>
  </>
);
