import { Entry } from "./ApiEntry";

// The auxiliary types in trama-forms/core.
export const TypesReference = () => (
  <Entry
    id="core-types"
    signature={`type FormValues<typeof definition>   // values by field
type FormOutputs<typeof definition>  // read-only derived outputs
type Snapshot<D>, Session<D>, FormDefinition
type FieldDefinition, FieldValue<F>, SelectOption<V>
type TextDefinition, NumberDefinition, CheckboxDefinition, SelectDefinition, AsyncDefinition
type DateDefinition, MultiSelectDefinition, MultiAsyncDefinition, SubtypeDefinition<D, N, P>, OptionKey
type Option<Metadata, Value>, DeepReadonly<T>
type Endpoint, Registry, Merged<R>, BoundField<M, S>, BoundDefineForm<M, S>, BoundDefineRules<M, S>
type Scope, LoadKey, Loader, OptionList<O>, OptionListSnapshot<O>
type ContextDeclaration<T>, FormContext<typeof definition>
type QueryState, FormQueries<typeof definition>
type RowKey<N>, RowHandle<N, R>, RowHandleOf<typeof definition, N>, RowSnapshot<R>
type FormInitial<typeof definition>, CollectionName<typeof definition>
type Issue                              // { message, field?, collection?, key? }
type Prepared<typeof definition>        // the ready result of prepare`}
  >
    <p>
      Auxiliary types. The names and types of values and derived outputs are inferred from the
      definition. <code>Option</code> describes an option with its metadata and the type of its{" "}
      <code>value</code>. <code>Loader</code> receives the key that Trama builds,{" "}
      <code>LoadKey</code>, and <code>run</code>, which calls the endpoint and validates its result.
    </p>
    <p>
      <code>Issue</code> specifies a message's location. With no location, it applies to the form.
      With <code>field</code>, it applies to a header field. With <code>collection</code>, it
      applies to a collection, and with <code>key</code>, it applies to a row or, if{" "}
      <code>field</code> is also present, to a cell. <code>setErrors</code> and{" "}
      <code>setWarnings</code> take <code>Issue&lt;typeof form&gt;</code> with that form's fields,
      collections, and keys. <code>prepare</code> returns issues with no type argument and can use
      any name. <code>Prepared</code> carries a marker that only <code>prepare</code> provides. A
      hand-written object lacks it. The type cannot distinguish a prepared submission from another
      definition with the same fields or more. At runtime, <code>commit</code> rejects it just as it
      rejects a prepared submission from another session.
    </p>
    <p>
      <code>ContextDeclaration&lt;T&gt;</code> is what <code>declareContext&lt;T&gt;()</code>{" "}
      returns. <code>FormContext</code> gives the context a definition declares, or{" "}
      <code>undefined</code> if it declares none. It is useful for generic wrappers such as{" "}
      <code>
        {
          "<D extends FormDefinition>(definition: D, scope: Scope, context: FormContext<D>) => createSession(definition, { scope, context })"
        }
      </code>
      .
    </p>
    <p>
      <code>Session&lt;D&gt;</code> is covariant in its definition. Any specific session is a{" "}
      <code>Session&lt;FormDefinition&gt;</code>, so a function that works on any session can be
      written and exported once, such as{" "}
      <code>
        {
          "export const resetAll = (sessions: readonly Session<FormDefinition>[]) => sessions.forEach((session) => session.reset())"
        }
      </code>
      . Between two specific sessions, compatibility depends on what one definition accepts from the
      other. A session with a wider context cannot serve as one with a narrower context. Widening
      works for reading, subscribing, or resetting. A widened session accepts writes at
      type-checking time that its definition rejects at runtime, so keep the specific definition
      when writing values.
    </p>
    <p>
      <code>QueryState</code> describes a query's state, <code>{"{ status, error }"}</code>, and{" "}
      <code>FormQueries</code> describes <code>snapshot.queries</code>, with one key per entry with
      a query. The key is optional if the query can be absent.
    </p>
    <p>
      <code>RowKey&lt;N&gt;</code> is the key of a row in collection <code>N</code>, an opaque
      string. <code>RowHandle</code> is the handle of a row, parameterized by its collection and row
      fields. <code>RowHandleOf</code> derives it from a definition so you can type a row component.{" "}
      <code>FormInitial</code> is the type of <code>initial</code>, which contains header fields and
      partial rows. A computed key loses its marker inside a patch, and two forms with a collection
      of the same name share the key type. In both cases, runtime validation rejects a key from
      another collection or session.
    </p>
  </Entry>
);
