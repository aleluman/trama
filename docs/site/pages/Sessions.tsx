import { Example } from "../lib/Example";
import { Link } from "../lib/router";
import { Snippet } from "../lib/Snippet";

export const Sessions = () => (
  <>
    <h1>Sessions</h1>
    <p className="lead">
      A session is an edit of a definition. It stores values, runs rules, and publishes a snapshot
      after each change. Open it with <code>createSession</code> in the core or{" "}
      <code>useFormSession</code> in React.
    </p>

    <h2 id="open-a-session">Open a session</h2>
    <Snippet>{'const session = createSession(definition, { initial: { name: "Ana" } });'}</Snippet>
    <p>On opening, Trama builds the baseline in this order.</p>
    <ol>
      <li>Each field's default value, or its empty value if it has no default.</li>
      <li>
        If the definition declares <code>defaults</code>, the values calculated from the context
        replace the fields' defaults (see{" "}
        <Link to="context" section="defaults">
          Default values
        </Link>
        ).
      </li>
      <li>
        The values in <code>initial</code>, which Trama validates and uses to replace the preceding
        values. An unknown field or an incompatible value throws.
      </li>
      <li>
        Value formulas. They never overwrite a value from <code>initial</code> (see{" "}
        <Link to="formulas" section="initial-values">
          Value formulas
        </Link>
        ).
      </li>
    </ol>
    <p>
      When a definition declares a context, it requires it on opening, as in{" "}
      <code>{'createSession(definition, { context: { mode: "edit" } })'}</code>. See{" "}
      <Link to="context">Context</Link>.
    </p>
    <p>
      If the definition has <Link to="queries">Queries</Link>, the queries that start on opening
      already appear as <code>"pending"</code> in the first snapshot. A query stays idle if its
      field already has an <code>initial</code> value or its <code>params</code> return{" "}
      <code>undefined</code>.
    </p>
    <p>
      <code>createSession</code> only accepts definitions created by <code>defineForm</code>. It
      rejects a copy (<code>{"{ ...definition }"}</code>).
    </p>

    <h2 id="read-watch-edit-and-reset">Read, watch, edit, and reset</h2>
    <ul>
      <li>
        <code>getSnapshot()</code> returns the current snapshot. It returns the same object until
        the session publishes another one, so you can compare it by reference.
      </li>
      <li>
        <code>subscribe(listener)</code> calls the listener after each publication and returns the
        unsubscribe function. The listener receives no arguments and reads{" "}
        <code>getSnapshot()</code>.
      </li>
      <li>
        <code>edit(name, value)</code> is synchronous. It validates, runs the affected formulas and
        events, and, when it changes the session, publishes before returning. If anything fails, it
        throws without publishing.
      </li>
      <li>
        <code>reset()</code> restores the baseline, recalculates state and derived outputs,
        increments <code>resetVersion</code>, and publishes. It runs no value formulas or events.
        Queries with defined parameters whose field the baseline does not supply start again, as on
        opening.
      </li>
      <li>
        The baseline comes from opening until the application commits a save with{" "}
        <code>commit</code>. It then consists of the committed values. See{" "}
        <Link to="submission">Submission</Link>.
      </li>
      <li>
        <code>touch(name)</code> marks a field as touched and <code>input(name)</code> returns the
        controller for a view's pending text. The binding uses them through its renderers (see{" "}
        <Link to="validation" section="when-messages-appear">
          When messages appear
        </Link>{" "}
        and{" "}
        <Link to="submission" section="pending-input">
          Pending input
        </Link>
        ).
      </li>
    </ul>
    <Example
      id="snapshot-subscribe-edit-and-reset"
      title="Snapshot, subscribe, edit, and reset"
      files={["examples/sessions/lifecycle.ts"]}
    >
      <p>
        The snapshot and its values are frozen. Always use <code>edit</code> to change a value.
      </p>
    </Example>

    <Example
      id="two-sessions"
      title="Two sessions of the same definition"
      files={["examples/sessions/two-sessions.tsx"]}
      steps={[
        "Type in the title in session A. Session B stays the same.",
        <>Click “Reset” in A. It returns to its empty baseline.</>,
        <>Edit B and reset it. It returns to “Buy bread”, the initial value it opened with.</>,
      ]}
    />

    <h2 id="rules-for-watchers">Rules for watchers</h2>
    <ul>
      <li>
        If a listener throws, publishing stands and the other listeners still receive the
        notification. The browser's <code>reportError</code> reports the error.
      </li>
      <li>
        Calling <code>edit</code>, <code>reset</code>, or <code>retry</code> on the same session
        from a listener or a <code>watchOutputs</code> callback throws, for example{" "}
        <code>Cannot edit a session during its notification</code>. This counts as a watcher
        failure. To respond to one change with another, declare a rule.
      </li>
    </ul>
  </>
);
