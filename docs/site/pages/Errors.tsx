import { Link } from "../lib/router";
import { messages } from "./error-messages";
import { limitMessages } from "./error-messages-limits";
import { rowMessages } from "./error-messages-rows";
import { relationMessages } from "./error-messages-relations";
import { ruleSetMessages } from "./error-messages-rule-sets";
import { externalMessages } from "./error-messages-external";
import { submittingMessages } from "./error-messages-submitting";
import { subtypeMessages } from "./error-messages-subtypes";
import { validationMessages } from "./error-messages-validation";
import { valueMessages } from "./error-messages-values";

export const Errors = () => (
  <>
    <h1>Errors and limits</h1>
    <p className="lead">
      Trama throws ordinary <code>Error</code> objects with a message that names the field or
      derived output. When the error comes from your code, such as a formula or a listener, the
      original is available in <code>cause</code>.
    </p>

    <h2 id="where-each-error-appears">Where each error appears</h2>
    <ul>
      <li>
        <strong>During definition:</strong> <code>defineForm</code> and <code>defineRules</code>{" "}
        throw immediately. These are programming errors.
      </li>
      <li>
        <strong>During type checking:</strong> TypeScript rejects many of them earlier. Some show
        their reason as the expected type, such as <code>context data must be plain</code>,{" "}
        <code>context data needs a property</code>, <code>defaults require a context</code>,{" "}
        <code>defaults field "x" does not exist</code>, <code>defaults are synchronous</code>,{" "}
        <code>query result of "x" does not fit field "y"</code>, or{" "}
        <code>field "to" min takes a date or null</code>.
      </li>
      <li>
        <strong>When opening and editing:</strong> <code>createSession</code> and <code>edit</code>{" "}
        throw without publishing anything. With TanStack Query, an opening error appears as{" "}
        <code>status: "error"</code>.
      </li>
      <li>
        <strong>In derived outputs:</strong> errors are thrown when reading a failed output, not
        when editing. See{" "}
        <Link to="outputs" section="failures">
          Output failures
        </Link>
        .
      </li>
      <li>
        <strong>
          With <code>undefined</code>:
        </strong>{" "}
        passing it for an optional property is equivalent to omitting the property and is not an
        error. See{" "}
        <Link to="field-state" section="conditional-configuration">
          Conditional configuration
        </Link>{" "}
        for cases that are still errors.
      </li>
      <li>
        <strong>In option lists:</strong> an endpoint failure or an invalid response does not throw.
        The list moves to <code>"error"</code>, and <code>retry()</code> requests the page again.
        See{" "}
        <Link to="remote-select" section="lists-per-view">
          Lists per view
        </Link>
        .
      </li>
      <li>
        <strong>In queries:</strong> a failure in the endpoint, the patch, or the operation that
        applies the response does not throw. The query moves to <code>"error"</code> in{" "}
        <code>snapshot.queries</code> without writing anything, and <code>retry(entry)</code> makes
        the request again. See{" "}
        <Link to="queries" section="status-and-retry">
          Status and retry
        </Link>
        .
      </li>
      <li>
        <strong>In observers:</strong> an error inside <code>subscribe</code> or{" "}
        <code>watchOutputs</code> does not propagate through <code>edit</code>. It goes to{" "}
        <code>onError</code> (only for <code>watchOutputs</code>) or to the browser's{" "}
        <code>reportError</code>.
      </li>
    </ul>

    <h2 id="common-messages">Common messages</h2>
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Where</th>
            <th>Message</th>
            <th>Cause</th>
          </tr>
        </thead>
        <tbody>
          {[
            ...messages,
            ...valueMessages,
            ...limitMessages,
            ...validationMessages,
            ...submittingMessages,
            ...externalMessages,
            ...subtypeMessages,
            ...rowMessages,
            ...ruleSetMessages,
            ...relationMessages,
          ].map(([where, message, cause]) => (
            <tr key={`${where}:${message}`}>
              <td>{where}</td>
              <td>
                <code>{message}</code>
              </td>
              <td>{cause}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    <h2 id="current-limitations">What Trama does not do yet</h2>
    <ul>
      <li>
        Rows: writes from one row to its siblings or to the header, including from a query, drafts
        for canceling a line edit, nested collections, atomic replacement, access to a row's
        position in its rules, row default values from context, and undeclared row data, which is
        modeled as fields or stored separately by key. Current row and header query responses that
        arrive before the batch closes are applied together and publish once if they change the
        session. If that operation fails, the responses are processed separately. See{" "}
        <Link to="rows">Rows</Link>.
      </li>
      <li>
        The cost of rows: each operation recalculates only what its change affects, but a rule that
        reads a field from every row, such as a total, reads them all again when one changes. That
        makes a row rule that does this quadratic, as is a cascade whose row events write a field
        that a header formula has already read. Each mounted <code>Field</code> listens to every
        publication, though it re-renders only if its field changed.
      </li>
      <li>
        Patterns, lengths, schemas, and asynchronous validators are unsupported. Domain validation
        uses <code>error</code> and <code>warning</code>. <code>decimals</code> does not round, and{" "}
        <code>min</code> and <code>max</code> validate without clipping or preventing writes. See{" "}
        <Link to="validation">Validation</Link>.
      </li>
      <li>
        <code>prepare</code> prepares the entire form using a single validation policy, and
        projection, transport, and focus are the application's responsibility. Trama provides
        neither a translator for server paths nor business codes. The application locates each
        external error, and a transport failure does not become one. <code>from</code> does not
        order server responses. The core does not store a view's partially entered text, move focus,
        or open sections. A renderer that does not read <code>errors</code> or{" "}
        <code>onInputError</code> does not display the messages or report its pending text. See{" "}
        <Link to="submission">Submission</Link>.
      </li>
      <li>
        Hiding or disabling a field does not clear its value. A hidden field retains its value and
        remains in derived outputs. To clear a field, use an event.
      </li>
      <li>
        The form lock only contributes <code>readOnly</code>, and its exceptions are fixed. There is
        no per-view lock.
      </li>
      <li>
        Context stays fixed for each session. It cannot change in an open session, and switching
        modes requires a different <code>key</code>. Its keys are not checked at runtime, it accepts
        only plain data, and it does not replace scope. A union of definitions with and without
        context leaves <code>context</code> optional in the types. See{" "}
        <Link to="context" section="limits">
          Limits
        </Link>
        .
      </li>
      <li>
        Asynchronous formulas: a server value is written through a query. Remote options are
        available only on async fields. <code>field.select</code> does not load them or carry
        metadata.
      </li>
      <li>
        Async fields: no automatic clearing, free-form values, or local filtering by metadata.
        Automatic selection is declared with a query. Pages are numbered only, invalidating in
        TanStack Query does not refresh an open list, and required <code>params</code> are checked
        only in the types. See{" "}
        <Link to="remote-select" section="limits">
          Limits
        </Link>
        .
      </li>
      <li>
        Queries: one per entry, with no paged endpoints, no delay for <code>params</code> that
        change on every keystroke, and no loop detection if a patch changes its own{" "}
        <code>params</code>. <code>retry</code> does not force TanStack Query to make another
        request if its cache is still fresh. See{" "}
        <Link to="queries" section="limits">
          Limits
        </Link>
        .
      </li>
      <li>
        Subtypes: no presentation that rules can change, no domain subtypes in the core, and no
        validation of presentation at runtime beyond checking that it is a plain data object. See{" "}
        <Link to="subtypes" section="limits">
          Limits
        </Link>
        .
      </li>
      <li>
        Persistence: Trama does not save data. The application reads the values and sends them.
      </li>
      <li>
        Date fields store civil dates: a calendar day with no time or time zone. The application
        models currencies and formats amounts. See{" "}
        <Link to="fields" section="civil-date">
          Civil date
        </Link>
        .
      </li>
      <li>
        Multi-selects: Trama does not prune a child <code>multiAsync</code> when its parent changes
        to a different nonempty set or hydrate IDs. The application builds the options at opening.
        For Trama, <code>[]</code> does not mean “all”. The server decides. See{" "}
        <Link to="remote-select" section="limits">
          Limits
        </Link>
        .
      </li>
    </ul>
    <p>
      The repository's technical document (<code>docs/technical.html</code>) records the current
      limits and decisions.
    </p>
  </>
);
