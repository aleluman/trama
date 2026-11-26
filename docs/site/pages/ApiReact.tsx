import { Link } from "../lib/router";
import { Entry } from "./ApiEntry";

export const ReactReference = () => (
  <>
    <h2 id="react">trama-forms/react</h2>

    <Entry
      id="create-react-binding"
      signature={`createReactBinding(
  { text?, number?, checkbox?, select?, async?, date?, multiSelect?, multiAsync?, [subtype]? },
  { loader?, forms?, showErrors? },
): {
  Field: FieldComponent<R, S>;
  useFormSession: UseFormSession<R, S>;
  useFormState;
}`}
    >
      <p>
        Registers a component for each field type and each subtype of <code>forms</code>, the result
        of <code>createForms</code>. An <code>undefined</code> component leaves its key
        unregistered. <code>Field</code> and <code>useFormSession</code> only accept definitions
        whose types and subtypes are registered. A subtype field uses its subtype's component and
        uses its base component only if registered under the subtype key. <code>loader</code> is the
        loader for sessions opened by <code>useFormSession</code>. <code>showErrors</code>,{" "}
        <code>"touched"</code> by default or <code>"attempted"</code>, determines which local errors
        the renderers receive. It throws if the registry is not an object, if a key or component is
        invalid, or if the options are invalid. The options object is optional and accepts the
        optional keys <code>loader</code> (a function), <code>forms</code> (from{" "}
        <code>createForms</code>), and <code>showErrors</code>. See <Link to="react">React</Link>{" "}
        and <Link to="subtypes">Subtypes</Link>.
      </p>
      <p>
        <code>R</code> is the set of keys with a component, and <code>S</code> is the set of
        subtypes in <code>forms</code>. <code>trama-forms/react</code> exports{" "}
        <code>FieldComponent</code> and <code>UseFormSession</code>, so a module that exports{" "}
        <code>{"const { Field, useFormSession } = createReactBinding(…)"}</code> emits its
        declarations with the package installed.{" "}
        <code>{'SubtypeProps<typeof forms, "search">'}</code> gives the props of a subtype's
        component: the props of its base type and <code>presentation</code>, where an{" "}
        <code>OptionKey</code> is any key.
      </p>
    </Entry>

    <Entry
      id="field-component"
      signature={`<Field session={session} name="field" label? placeholder? />
<Field row={handle} name="field" label? placeholder? />`}
    >
      <p>
        Renders the field using its type’s renderer, or renders nothing if the field is hidden.{" "}
        <code>label</code> and <code>placeholder</code> override the state properties in that view.{" "}
        <code>placeholder</code> exists only for <code>text</code>, <code>number</code>,{" "}
        <code>date</code>, <code>async</code>, and <code>multiAsync</code>. The renderer props are{" "}
        <code>TextFieldProps</code>, <code>NumberFieldProps</code>, <code>CheckboxFieldProps</code>,{" "}
        <code>DateFieldProps</code>, <code>SelectFieldProps</code>,{" "}
        <code>MultiSelectFieldProps</code>, <code>AsyncFieldProps</code>, and{" "}
        <code>MultiAsyncFieldProps</code>, with <code>disabled</code>, <code>readOnly</code>,{" "}
        <code>required</code>, and <code>reasons</code>. While the field is disabled or read-only,
        the binding ignores its <code>onChange</code>.
      </p>
      <p>
        All also include <code>errors</code>, which covers errors shown by the registry policy and
        external errors, plus <code>warnings</code>, <code>dirty</code>, <code>onBlur()</code>,
        which marks the field as touched, and <code>onInputError(message?)</code>, which reports
        text the renderer could not convert. The binding creates the view controller with the first
        message and discards it on unmount, when the source or name changes, or on reset. A
        hand-written props object must include them. See{" "}
        <Link to="react" section="visible-errors">
          Visible errors
        </Link>{" "}
        and{" "}
        <Link to="submission" section="pending-input">
          Pending input
        </Link>
        .
      </p>
      <p>
        With <code>row</code>, it renders a row field from its handle. If the row disappears, it
        renders nothing. Each prop accepts only its own source. A session cannot go in{" "}
        <code>row</code>, and a handle cannot go in <code>session</code>.
      </p>
      <p>
        <code>AsyncFieldProps</code> adds <code>placeholder</code> and <code>list</code> (
        <code>OptionListProps</code>), the snapshot of that view's option list and its actions,
        which retain their identity and are not subject to the <code>onChange</code> guard. A hidden
        field does not create its list. See{" "}
        <Link to="remote-select" section="renderer">
          The renderer
        </Link>
        .
      </p>
      <p>
        <code>NumberFieldProps</code> adds <code>decimals</code>, <code>min</code>, and{" "}
        <code>max</code> (<code>number | undefined</code>), and <code>DateFieldProps</code> has{" "}
        <code>value: string | null</code>, <code>placeholder</code>, <code>min</code>, and{" "}
        <code>max</code> (<code>string | undefined</code>). These properties come from the state, or
        are <code>undefined</code> while no contribution supplies them. See{" "}
        <Link to="decimals-and-limits" section="renderer">
          The value and the renderer
        </Link>
        . <code>MultiSelectFieldProps</code> has <code>value: readonly V[]</code> and the
        definition's <code>options</code>, with no placeholder. <code>MultiAsyncFieldProps</code>{" "}
        has <code>value: readonly Option[]</code>, <code>placeholder</code>, and <code>list</code>,
        like <code>AsyncFieldProps</code>. The option list reflects the view's current search and
        loaded results, so the renderer retains selected options outside them. See{" "}
        <Link to="remote-select" section="multiple">
          Remote multi-select
        </Link>
        .
      </p>
    </Entry>

    <Entry id="use-rows" signature={`useRows(session, collection): RowKey[]`}>
      <p>
        The row keys of a collection, in order. The array retains its identity while its rows and
        their order stay the same, so a table that uses it does not re-render when a row is written
        to. See{" "}
        <Link to="rows" section="react">
          Handles and React
        </Link>
        .
      </p>
    </Entry>

    <Entry
      id="use-form-state"
      signature={`useFormState(session): { errors, warnings, errorCount, warningCount, dirty, inputPending, attempted }
useFormState(session, collection): { errors, warnings, errorCount, warningCount, dirty }
useFormState(row): { errors, warnings, errorCount, warningCount, dirty, touched, attempted } | undefined`}
    >
      <p>
        A member of the result of <code>createReactBinding</code>. It returns the state of a scope,
        excluding the state of what it contains. <code>errors</code> includes that scope's own
        errors as shown by the registry policy and always includes its external errors. The rest of
        the state is returned in full, except for <code>externalErrors</code>. It retains its object
        identity while unchanged, and a row that no longer exists returns <code>undefined</code>. An
        unknown collection throws <code>Unknown collection "absent"</code>. See{" "}
        <Link to="react" section="use-form-state">
          useFormState
        </Link>
        .
      </p>
    </Entry>

    <Entry
      id="use-form-session"
      signature={`useFormSession(definition, { key?, initial?, scope?, context? }): FormEditor

type FormEditor =
  | { status: "loading" }
  | { status: "error"; error: unknown; retry(): void }
  | { status: "ready"; session: Session }`}
    >
      <p>
        <code>key</code> is a string, a finite number, or <code>undefined</code>.{" "}
        <code>initial</code> is an object of values or <code>initialFromQuery(query)</code>.{" "}
        <code>scope</code> is required if the definition has remote fields or queries, and changing
        it requires a different <code>key</code>. <code>context</code> is required if the definition
        declares a context, and is rejected otherwise. While the session is opening, it uses the
        context from the latest render. Once the session is ready, a context with different data
        requires a different <code>key</code>. See{" "}
        <Link to="react" section="use-form-session">
          useFormSession
        </Link>{" "}
        and{" "}
        <Link to="context" section="session-context">
          A session's context
        </Link>
        .
      </p>
    </Entry>

    <Entry
      id="initial-from-query"
      signature={`initialFromQuery(query: InitialQuery<T>): QueryInitial<T>`}
    >
      <p>
        Wraps the result of <code>useQuery</code> (TanStack Query v5) for use as{" "}
        <code>initial</code>. <code>InitialQuery</code> describes the fields it reads:{" "}
        <code>data</code>, <code>error</code>, <code>status</code>, <code>isEnabled</code>,{" "}
        <code>isStale</code>, <code>isPlaceholderData</code>, <code>dataUpdatedAt</code>, and{" "}
        <code>refetch</code>. See <Link to="query">Loading with TanStack Query</Link>.
      </p>
    </Entry>

    <Entry id="query-loader" signature={`queryLoader(queryClient: QueryClientLike): Loader`}>
      <p>
        A loader that uses the cache of a TanStack Query v5 <code>QueryClient</code> with Trama's
        key, without structural sharing. Sessions with the same scope share their pages and queries.
        Configure freshness with <code>setQueryDefaults(["trama"], {"{ staleTime }"})</code>. It
        throws if it receives no client. See{" "}
        <Link to="remote-select" section="loader">
          Scope and loader
        </Link>
        .
      </p>
    </Entry>

    <Entry id="use-outputs" signature={`useOutputs(session): FormOutputs`}>
      <p>
        Returns the session's derived outputs and re-renders the component when the outputs it read
        during render change.
      </p>
    </Entry>

    <Entry
      id="output-boundary"
      signature={`<OutputBoundary session={session} fallback={node}>…</OutputBoundary>`}
    >
      <p>
        Shows <code>fallback</code> while a derived output of <code>session</code> that its children
        read is failing, and shows the children again when it recovers. Other errors propagate
        upward.
      </p>
    </Entry>
  </>
);
