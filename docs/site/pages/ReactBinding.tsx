import { Example } from "../lib/Example";
import { RendererProps } from "./ReactProps";
import { Link } from "../lib/router";
import { Snippet } from "../lib/Snippet";

export const ReactBinding = () => (
  <>
    <h1>React</h1>
    <p className="lead">
      <code>trama-forms/react</code> connects sessions to components. The application supplies a
      renderer for each field type. <code>createReactBinding</code> registers them and returns{" "}
      <code>Field</code> and <code>useFormSession</code> typed for that registry.
    </p>

    <h2 id="renderer-registry">The renderer registry</h2>
    <p>
      A renderer is an ordinary component. It receives the value and an <code>onChange</code> typed
      for the field, and it decides the markup, styles, and accessibility. An application usually
      has one registry. This example shows the renderers used in this guide.
    </p>
    <Example
      id="renderers"
      title="This guide's renderers and registry"
      files={["ui/inputs.tsx", "ui/form-ui.ts"]}
    />
    <RendererProps />
    <p>
      These prop types are exported as <code>TextFieldProps</code>, <code>NumberFieldProps</code>,{" "}
      <code>CheckboxFieldProps</code>, <code>DateFieldProps</code>, <code>SelectFieldProps</code>,{" "}
      <code>MultiSelectFieldProps</code>, <code>AsyncFieldProps</code>, and{" "}
      <code>MultiAsyncFieldProps</code>. This guide's date, multi-select, and remote multi-select
      renderers appear in{" "}
      <Link to="fields" section="civil-date">
        Civil date
      </Link>
      ,{" "}
      <Link to="fields" section="multiple">
        Multi-select
      </Link>
      , and{" "}
      <Link to="remote-select" section="multiple">
        Remote multi-select
      </Link>
      .
    </p>
    <p>
      With <code>{"{ forms }"}</code>, the registry also has a renderer for each subtype of those{" "}
      <code>forms</code>, and a subtype field uses its own subtype renderer. It receives its base
      props and <code>presentation</code>. <code>SubtypeProps&lt;typeof forms, "search"&gt;</code>{" "}
      names those props for a separate renderer. See <Link to="subtypes">Subtypes</Link>.
    </p>

    <h2 id="field">Field</h2>
    <Snippet>
      {'<Field session={session} name="total" label="Net total" placeholder="0" />'}
    </Snippet>
    <ul>
      <li>
        <code>name</code> is checked against the session's definition. <code>label</code> and{" "}
        <code>placeholder</code> are optional and affect only that view.
      </li>
      <li>
        Each <code>Field</code> subscribes only to its own field. It rerenders when its value or
        state changes. Changes to other fields leave it alone.
      </li>
      <li>
        A hidden field is not rendered. <code>Field</code> stays subscribed so the field reappears
        when it is no longer hidden.
      </li>
      <li>
        After <code>session.reset()</code>, the renderer remounts. This discards its local state,
        such as a partially typed number.
      </li>
    </ul>

    <h2 id="visible-errors">Visible errors</h2>
    <Snippet>{`const { Field, useFormSession, useFormState } = createReactBinding(renderers, {
  showErrors: "touched", // or "attempted"
});`}</Snippet>
    <ul>
      <li>
        With the default, <code>"touched"</code>, a field shows its errors after its renderer calls{" "}
        <code>onBlur</code> or after an attempt. <code>prepare</code> marks the attempt for the form
        and the rows that already exist. With <code>"attempted"</code>, errors appear only after an
        attempt. Warnings are always shown (see{" "}
        <Link to="validation" section="when-messages-appear">
          When messages appear
        </Link>
        ).
      </li>
      <li>
        External errors, such as server errors, always arrive in <code>errors</code> after visible
        local errors without repeating any text (see{" "}
        <Link to="submission" section="server-errors">
          Server errors
        </Link>
        ).
      </li>
      <li>
        An attempt rerenders only the mounted <code>Field</code> components whose errors it reveals.
        An application that uses two policies needs two bindings. Both can use the same renderer
        registry.
      </li>
      <li>
        The renderers in this guide set <code>aria-invalid</code> when there is a visible error and
        reference messages and reasons in <code>aria-describedby</code>.
      </li>
    </ul>
    <h3 id="use-form-state">useFormState</h3>
    <Snippet>{`const form = useFormState(session); // { errors, warnings, errorCount, warningCount, dirty, inputPending, attempted }
const lines = useFormState(session, "lines"); // { errors, warnings, errorCount, warningCount, dirty }
const line = useFormState(row); // { …, touched, attempted } or undefined if the row no longer exists`}</Snippet>
    <p>
      It returns only the scope's own state. This includes its errors as shown by the registry
      policy, with external errors always included afterward, its warnings, its full counts and{" "}
      <code>dirty</code> state, and its markers. A row shows its own errors according to the{" "}
      <code>showErrors</code> policy: on touch or after an attempt with <code>"touched"</code>, and
      only after an attempt with <code>"attempted"</code>. A collection and the form show theirs
      after an attempt. The result keeps the same object while it is unchanged, so one row's hook
      does not rerender because another row changes.
    </p>

    <h2 id="use-form-session">useFormSession</h2>
    <Snippet>{"const editor = useFormSession(definition, { key, initial });"}</Snippet>
    <p>
      It returns an <code>editor</code> with a <code>status</code>.
    </p>
    <ul>
      <li>
        <code>"ready"</code> comes with <code>editor.session</code>. With no <code>initial</code> or
        with a values object, the session is ready on the first render.
      </li>
      <li>
        <code>"loading"</code> and <code>"error"</code> (with <code>error</code> and{" "}
        <code>retry()</code>) appear only when loading with TanStack Query (see{" "}
        <Link to="query">Loading with TanStack Query</Link>).
      </li>
    </ul>
    <p>
      <code>key</code> (a string or finite number) identifies the session. While it stays the same,
      the hook keeps the same session even if <code>initial</code> changes. Changing the key opens
      another session and discards the previous one. Changing the definition without changing{" "}
      <code>key</code> throws an error. A definition with remote fields or queries also requires{" "}
      <code>scope</code>, which also cannot change without a different <code>key</code> (see{" "}
      <Link to="remote-select" section="loader">
        Scope and loader
      </Link>
      ). A definition that declares a context requires <code>context</code>. Another object with the
      same data keeps the session, and once the session is ready, different data also requires a
      different <code>key</code> (see{" "}
      <Link to="context" section="session-context">
        Context
      </Link>
      ).
    </p>
    <Example
      id="key"
      title="Switch records with key"
      files={["examples/react/session-key.tsx"]}
      steps={[
        "Change the name for Contact 1.",
        "Switch to Contact 2 and back to Contact 1. The edit is gone. Each key change opened a new session with the saved values.",
      ]}
    />

    <h2 id="multiple-registries">Multiple registries</h2>
    <p>
      A registry can cover only some field types. Its <code>Field</code> and{" "}
      <code>useFormSession</code> then accept only definitions with those types. TypeScript rejects
      the others, and at runtime the binding throws <code>missing renderer</code>. Several
      registries can display the same session at once.
    </p>
    <Example
      id="same-session-two-registries"
      title="The same session with two registries"
      files={["examples/react/custom-renderers.tsx"]}
      steps={[
        "Click the switch. The checkbox in the other column changes too.",
        "Choose a density with the buttons or the select. Both views read the same session.",
      ]}
    />
  </>
);
