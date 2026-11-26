import { Link } from "../lib/router";
import { Entry } from "./ApiEntry";

// Sessions of trama-forms/core: opening one, its interface and its option lists.
export const SessionReference = () => (
  <>
    <Entry
      id="create-session"
      signature={`createSession(definition, { context?: FormContext, initial?: FormInitial, scope?: Scope, loader?: Loader }): Session`}
    >
      <p>
        Opens a session with a baseline composed of the field default values, the values from{" "}
        <code>defaults</code>, <code>initial</code>, and the value formulas. The rows of each
        collection come from <code>initial</code>, with their fields filled in by default values,
        and receive their keys in that order. It throws if the definition does not come from{" "}
        <code>defineForm</code>, if <code>defaults</code> fails, if <code>initial</code> has an
        unknown field or incompatible value, or if a formula fails. See{" "}
        <Link to="sessions">Sessions</Link>.
      </p>
      <p>
        <code>context</code> is required if the definition declares a context and is rejected
        otherwise. It must be a plain data object. The session keeps a deeply frozen copy that stays
        fixed. See{" "}
        <Link to="context" section="session-context">
          A session's context
        </Link>
        .
      </p>
      <p>
        <code>scope</code>, a string or finite number, separates remote data and is required if the
        definition has remote fields or queries. <code>loader</code> runs the requests for their
        lists and queries. If omitted, a direct loader that stores nothing is used. The session
        starts its queries when it is created, except those whose field <code>initial</code>{" "}
        supplies or whose <code>params</code> return <code>undefined</code>. See{" "}
        <Link to="remote-select" section="loader">
          Scope and loader
        </Link>{" "}
        and <Link to="queries">Queries</Link>.
      </p>
    </Entry>

    <Entry
      id="session"
      signature={`session.definition
session.getSnapshot(): { values, fieldStates, rows, resetVersion, queries, form }
fieldStates[field]: { disabled, readOnly, hidden, required, label, placeholder?, reasons, decimals?, min?, max?, errors, externalErrors, warnings, dirty, touched }
form: { errors, externalErrors, warnings, errorCount, warningCount, dirty, attempted, inputPending, collections: { [collection]: { errors, externalErrors, warnings, errorCount, warningCount, dirty } } }
queries[entry]: { status: "idle" | "pending" | "error", error: Error | undefined }
session.subscribe(listener: () => void): () => void
session.edit(name, value): void
session.reset(): void
session.retry(entry): void   // entries with a query
session.touch(name): void
session.input(name): { error(message?): void; dispose(): void }
session.watchOutputs(callback: (outputs) => void, { onError? }): () => void
session.list(name): OptionList   // async and multiAsync fields`}
    >
      <ul>
        <li>
          <code>getSnapshot</code> returns a frozen object with the same reference until the next
          publication.
        </li>
        <li>
          <code>fieldStates</code> holds each field's frozen state. <code>placeholder</code> exists
          only on text, number, date, async, and multiAsync fields. <code>decimals</code> on number
          fields and <code>min</code> and <code>max</code> on number and date fields exist only
          while a contribution supplies them, and are never <code>null</code> (see{" "}
          <Link to="decimals-and-limits">Decimals and limits</Link>). <code>externalErrors</code>{" "}
          holds the errors contributed by <code>setErrors</code>, and <code>warnings</code> combines
          local and external warnings. <code>touched</code> indicates whether the field was touched.
          A field's object is retained while unchanged, and <code>fieldStates</code> is also
          retained if no field changed.
        </li>
        <li>
          <code>rows</code> holds the row keys of each collection in visual order, or{" "}
          <code>{"{}"}</code> without collections. <code>values</code> and <code>fieldStates</code>{" "}
          have an array of rows for each collection in the same order. See{" "}
          <Link to="rows">Rows</Link>.
        </li>
        <li>
          <code>form</code> holds the messages for the form and each collection, with external
          errors separate, the counts of targets with any local or external message in each scope,
          and whether each scope differs from the baseline. <code>attempted</code> indicates whether
          there has been a <code>prepare</code> since opening or the last reset, and{" "}
          <code>inputPending</code> indicates whether any view reports text it could not convert.
          The object retains its identity while unchanged. See{" "}
          <Link to="validation" section="counts">
            Validation
          </Link>{" "}
          and <Link to="changes">Changes</Link>.
        </li>
        <li>
          <code>queries</code> holds the frozen state of each entry with a query. It retains its
          identity and that of each entry while unchanged. Without queries, it is{" "}
          <code>{"{}"}</code>.
        </li>
        <li>
          <code>subscribe</code> notifies after each publication, whether from <code>edit</code>,{" "}
          <code>reset</code>, a query response, or a change to a query's status. It returns a
          function that unsubscribes.
        </li>
        <li>
          <code>edit</code> runs synchronously. It validates, runs formulas and events, and
          publishes. If anything fails, it throws without publishing. It accepts only header field
          names and throws for a collection name.
        </li>
        <li>
          <code>reset</code> returns to the baseline, increments <code>resetVersion</code>, and
          starts again the queries with defined parameters whose field the baseline does not supply,
          as at opening. The baseline is the state at opening or the state committed by the last{" "}
          <code>commit</code>.
        </li>
        <li>
          <code>retry</code> runs the entry's query again with the same <code>params</code>. If the
          query is suspended, it does nothing. It throws for an entry without a query.
        </li>
        <li>
          <code>touch</code> marks a header field as touched, and its state publishes{" "}
          <code>touched</code>. Calling it again does not publish, editing does not mark the field
          as touched, and reset clears the marker. See{" "}
          <Link to="validation" section="when-messages-appear">
            When messages appear
          </Link>
          .
        </li>
        <li>
          <code>input</code> provides the controller for a view of a header field.{" "}
          <code>error(message)</code> reports text the view could not convert as a field error,{" "}
          <code>error()</code> clears it, and <code>dispose()</code> ends the view. Reset
          invalidates the controllers. See{" "}
          <Link to="submission" section="pending-input">
            Pending input
          </Link>
          .
        </li>
        <li>
          <code>watchOutputs</code> runs the callback immediately and when the derived outputs it
          read change. See{" "}
          <Link to="outputs" section="watch-outputs">
            watchOutputs
          </Link>
          .
        </li>
        <li>
          <code>list</code> creates an option list for a view of an async or multiAsync field. It
          does not write to the session.
        </li>
      </ul>
    </Entry>

    <Entry
      id="prepare"
      signature={`session.prepare({ signal?: AbortSignal }): Promise<
  | Prepared<D>                                  // { status: "ready", values, rows, warnings }
  | { status: "invalid", issues: readonly Issue[] }
  | { status: "cancelled" }>
session.commit(prepared: Prepared<D>, canonical?: FormPatch<D>): boolean`}
    >
      <ul>
        <li>
          <code>prepare</code> marks the attempt, waits for queries with{" "}
          <code>forPrepare: true</code>, and captures the values, row keys, and warnings, or the
          issues in visual order. Another <code>prepare</code>, an application operation that
          changes values or rows, reset, and the signal cancel it. It throws without marking
          anything if the options are invalid or if called during a notification.
        </li>
        <li>
          <code>commit</code> sets the baseline to the prepared submission with the canonical values
          applied. The canonical values are a patch to the header and to the rows of the prepared
          submission by key. It applies canonical values to the current values wherever nothing
          changed after preparation. It publishes once and returns <code>true</code>. It returns{" "}
          <code>false</code> without publishing for a prepared submission from before a reset or one
          that is no newer than the last accepted one. It throws for a prepared submission from
          another session or an invalid patch, without consuming the prepared submission.
        </li>
      </ul>
      <p>
        See <Link to="submission">Submission</Link>.
      </p>
    </Entry>

    <Entry
      id="set-errors"
      signature={`session.setErrors(source: string, issues: readonly Issue<D>[], { from?: Prepared<D> }): boolean
session.setWarnings(source: string, issues: readonly Issue<D>[], { from?: Prepared<D> }): boolean`}
    >
      <ul>
        <li>
          They replace the errors or warnings a source contributes from outside the rules. Each
          issue has a <code>message</code> and a location: no location for the form,{" "}
          <code>field</code>, <code>collection</code>, <code>collection</code> and <code>key</code>{" "}
          for a row, and additionally <code>field</code> for a cell. They validate the entire list
          before changing anything, publish once or not at all if nothing changes, and do not cancel
          a waiting <code>prepare</code>.
        </li>
        <li>
          A row that has already been removed is skipped. They throw for an empty source, an unknown
          property, an empty message, a field or collection that does not exist, a cell without its
          row key, a key the session never issued, and a <code>from</code> from another session.
          They also throw during a notification.
        </li>
        <li>
          With <code>from</code>, they skip targets that changed after preparation and return{" "}
          <code>false</code> without replacing anything if the prepared submission predates a reset,
          a later one already committed, or the last one the source wrote from. They also return{" "}
          <code>false</code> if any value changed after that prepared submission was committed.
          Without <code>from</code>, they always return <code>true</code>.
        </li>
        <li>
          External messages are always shown, do not block <code>prepare</code>, and are cleared
          when their target changes. Form-level messages are cleared when their source replaces
          them, and all external messages are cleared on reset.
        </li>
      </ul>
      <p>
        See{" "}
        <Link to="submission" section="server-errors">
          Server errors
        </Link>
        .
      </p>
    </Entry>

    <Entry
      id="option-list"
      signature={`list.getSnapshot(): { status, text, options, complete, error }
status: "idle" | "suspended" | "loading" | "ready" | "error"
list.subscribe(listener: () => void): () => void
list.open(): void
list.search(text: string): void
list.more(): void
list.retry(): void`}
    >
      <p>
        The snapshot is frozen and retains its identity while unchanged. Only a list with
        subscribers makes requests to the loader. <code>more</code> acts in <code>"ready"</code>{" "}
        when more pages are available, and <code>retry</code> acts in <code>"error"</code>. They do
        nothing in other states. Errors remain in <code>error</code>, with the original in{" "}
        <code>cause</code>. See{" "}
        <Link to="remote-select" section="lists-per-view">
          Lists per view
        </Link>
        .
      </p>
    </Entry>
  </>
);
