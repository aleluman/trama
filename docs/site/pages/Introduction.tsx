import { Example } from "../lib/Example";
import { Link } from "../lib/router";
import { Snippet } from "../lib/Snippet";

export const Introduction = () => (
  <>
    <h1>Trama</h1>
    <p className="lead">
      Trama is a forms library for browsers. A definition declares the fields, the rules between
      them, and the derived values. A session stores the values of an edit, applies the rules on
      each change, and notifies its observers. The core is independent of React. The React binding
      renders each field with your own components.
    </p>

    <h2 id="concepts">Concepts</h2>
    <dl className="terms">
      <dt>Form definition</dt>
      <dd>
        Created with <code>defineForm</code>. It contains <code>fields</code> and, optionally,{" "}
        <code>rules</code>, <code>form</code>, <code>outputs</code>, <code>context</code>, and{" "}
        <code>defaults</code>. It stores no values. One definition can open many sessions.
      </dd>
      <dt>Session</dt>
      <dd>
        A particular edit of a definition. It stores values, runs rules, and publishes snapshots.
        Two sessions of the same definition share nothing.
      </dd>
      <dt>Snapshot</dt>
      <dd>
        A frozen object with <code>values</code>, <code>fieldStates</code>,{" "}
        <code>resetVersion</code>, and <code>queries</code>. An edit that changes the session
        publishes a new one, and so do current query responses that change it. Responses that arrive
        together publish once.
      </dd>
      <dt>Context</dt>
      <dd>
        Application data that a session receives when it is created, such as the mode or today's
        date. Rules and derived outputs read it, and it stays fixed throughout the session.
      </dd>
      <dt>Baseline</dt>
      <dd>
        The values the session opened with, including default values, initial values, and what the
        formulas calculated during opening, until a <code>commit</code> replaces them with the
        committed values. <code>reset()</code> restores the current baseline. The opening baseline
        excludes query responses, and a committed baseline includes every committed value, query
        results among them.
      </dd>
      <dt>Derived output</dt>
      <dd>
        A value calculated for display outside the form, such as a total. It is separate from the
        fields and does not appear in <code>values</code>.
      </dd>
      <dt>Query</dt>
      <dd>
        A request to an endpoint that the session starts through a field's <code>query</code> rule
        and whose response writes values. A late response never overwrites an edit.
      </dd>
    </dl>

    <h2 id="installation">Installation</h2>
    <p>Install the package from npm.</p>
    <Snippet lang="bash">{"npm install trama-forms"}</Snippet>
    <ul>
      <li>
        <code>trama-forms/core</code> provides definitions and sessions. It has no dependencies.
      </li>
      <li>
        <code>trama-forms/react</code> provides <code>Field</code>, <code>useFormSession</code>,
        derived outputs, and loading with TanStack Query. It requires React <code>^19.3.0</code>, an
        optional peer dependency. TanStack Query is optional and Trama does not import it.{" "}
        <code>initialFromQuery</code> accepts a compatible <code>InitialQuery</code> source, such as
        the result of <code>useQuery</code>, and <code>queryLoader</code> accepts a client with{" "}
        <code>fetchQuery</code>.
      </li>
    </ul>
    <p>Both entry points are ESM, include TypeScript types, and target modern browsers.</p>

    <h2 id="first-form">A first form</h2>
    <Example id="core-only" title="Core only" files={["examples/start/core.ts"]}>
      <p>
        This example defines a form, opens a session, edits it, and resets it without React. The
        panel on the right shows what <code>run()</code> prints when it executes on this page.
      </p>
    </Example>
    <Example
      id="react"
      title="The same form in React"
      files={["examples/start/react.tsx", "ui/form-ui.ts"]}
      steps={[
        <>
          Type in “Age” and watch <code>age</code> change in the panel.
        </>,
        <>
          Clear the age. The value returns to <code>null</code>, the empty value for a number.
        </>,
        <>
          Click “Reset” to restore <code>name: "Ana"</code> and the default values.
        </>,
      ]}
    >
      <p>
        <code>useFormSession</code> opens the session, and <code>Field</code> draws each field with
        the renderer registered for its type. The registry is in <code>form-ui.ts</code> and is
        explained in <Link to="react">React</Link>.
      </p>
    </Example>

    <h2 id="how-to-read-this-guide">How to read this guide</h2>
    <ul>
      <li>
        Each example shows the file on the left that runs the demo on the right. Both use the same
        source, so changing the file changes both.
      </li>
      <li>
        The <code>snapshot.values</code>, <code>snapshot.fieldStates</code>,{" "}
        <code>snapshot.queries</code>, and <code>outputs</code> panels belong to this guide (
        <code>lib/SessionState.tsx</code>) and use only the public interface. They highlight each
        value that changes.
      </li>
      <li>“Restart” mounts the demo again from scratch.</li>
    </ul>
    <p>
      Suggested order is <Link to="fields">Fields</Link>, <Link to="sessions">Sessions</Link>,{" "}
      <Link to="react">React</Link>, <Link to="query">Loading with TanStack Query</Link>,{" "}
      <Link to="formulas">Value formulas</Link>, <Link to="events">Events</Link>,{" "}
      <Link to="relations">Relations</Link>, <Link to="field-state">Field state</Link>,{" "}
      <Link to="remote-select">Remote select</Link>, <Link to="outputs">Derived outputs</Link>,{" "}
      <Link to="context">Context</Link>, and <Link to="queries">Queries</Link>. The{" "}
      <Link to="complete-example">Complete example</Link> combines them. See{" "}
      <Link to="api">API</Link> and <Link to="errors">Errors and limits</Link> for reference.
    </p>
  </>
);
