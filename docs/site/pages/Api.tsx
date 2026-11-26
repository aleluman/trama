import { Link } from "../lib/router";
import { Entry } from "./ApiEntry";
import { ReactReference } from "./ApiReact";
import { RowsReference } from "./ApiRows";
import { SessionReference } from "./ApiSession";
import { SubtypesReference } from "./ApiSubtypes";
import { TypesReference } from "./ApiTypes";

export const Api = () => (
  <>
    <h1>API reference</h1>
    <p className="lead">
      Everything exported by <code>trama-forms/core</code> and <code>trama-forms/react</code>. See{" "}
      <Link to="errors">Errors and limits</Link> for details about errors.
    </p>
    <p>
      An optional property (<code>?</code>) accepts <code>undefined</code>, which has the same
      effect as omitting it. The values in <code>initial</code> and <code>defaults</code> do not
      accept it. An <code>outputs</code> section that can be <code>undefined</code> declares no
      derived outputs, and a <code>context</code> section that can be <code>undefined</code>{" "}
      declares no context. TypeScript rejects a <code>rules</code> section that can be{" "}
      <code>undefined</code> and declares queries. See{" "}
      <Link to="field-state" section="conditional-configuration">
        Conditional configuration
      </Link>
      .
    </p>

    <h2 id="core">trama-forms/core</h2>

    <Entry
      id="field"
      signature={`field.text({ label?, placeholder?, default?: string, ...state })
field.number({ label?, placeholder?, default?: number | null, decimals?: number, min?: number, max?: number, ...state })
field.checkbox({ label?, default?: boolean, ...state })
field.date({ label?, placeholder?, default?: string | null, min?: string, max?: string, ...state })   // YYYY-MM-DD
field.select({ options: { value: string | number; label: string }[], label?, default?, ...state })
field.multiSelect({ options: { value: string | number; label: string }[], label?, default?: value[], ...state })
field.async(key, { label?, placeholder?, default?: option, ...state })   // from the field returned by createForms
field.multiAsync(key, { label?, placeholder?, default?: option[], ...state })   // from the field returned by createForms

state: { disabled?: boolean | reason, readOnly?: boolean | reason, hidden?: boolean, required?: boolean | message }`}
    >
      <p>
        Each factory creates a field declaration for <code>fields</code>. A reason is a nonempty
        string that counts as <code>true</code>. State declared on the field is a contribution that
        no rule withdraws. If <code>default</code> is omitted or <code>undefined</code>, the field
        starts with the empty value of its type. See <Link to="fields">Fields</Link> and{" "}
        <Link to="field-state">Field state</Link>.
      </p>
      <p>
        <code>field.date</code> stores a civil date, <code>YYYY-MM-DD</code> with years from 0001
        through 9999, or <code>null</code>. <code>field.multiSelect</code> stores an array of option
        values without duplicates. It starts at <code>[]</code>, and a rule can write it without{" "}
        <code>as const</code>. <code>decimals</code> is a nonnegative integer, and <code>min</code>{" "}
        and <code>max</code> take a finite number or a civil date, excluding <code>null</code>.
        These <Link to="decimals-and-limits">state properties</Link> leave the value unchanged.
      </p>
      <p>
        <code>field.async</code> and <code>field.multiAsync</code> exist only on the{" "}
        <code>field</code> returned by <code>createForms</code>. An async field's value is the
        complete option from the endpoint or <code>null</code>. A <code>multiAsync</code> field's
        value is an array of complete options. For both multi-select field types, the same set in a
        different order counts as unchanged. See <Link to="remote-select">Remote select</Link>.
      </p>
    </Entry>

    <Entry
      id="endpoints"
      signature={`endpoint.options(load: ({ search, page, signal, scope }, params) => Promise<{ options, more }>)
endpoint.list(load: ({ signal, scope }, params) => Promise<option[]>)
endpoint.value(load: ({ signal, scope }, params) => Promise<value>)
defineEndpoints({ [key]: endpoint }): Registry

option: { value: string | number; label: string; ...plain data }`}
    >
      <p>
        These declare remote sources without React or TanStack Query. The type of{" "}
        <code>params</code> comes from the annotation on the second parameter of <code>load</code>,
        or defaults to <code>{"{}"}</code>. The type of the option or value comes from its result.{" "}
        <code>page</code> starts at 1. Trama validates each response, requires unique{" "}
        <code>value</code>s within it, and copies and freezes it. A list endpoint is searched
        locally. A value endpoint returns plain data, which can include <code>undefined</code>.
        Without a <code>patch</code> callback, a query writes a defined result to its field. An
        async field cannot use a value endpoint. See{" "}
        <Link to="remote-select" section="endpoints">
          Endpoints and registry
        </Link>{" "}
        and{" "}
        <Link to="queries" section="endpoints">
          Value endpoints
        </Link>
        .
      </p>
    </Entry>

    <Entry
      id="create-forms"
      signature={`createForms({
  endpoints: [registry, ...],
  subtypes?: { [name]: subtype.<base>() },
  messages?: { required?, min?, max?, query? },
}): { defineForm, defineRules, field }`}
    >
      <p>
        Combines the application's registries and subtypes once. It returns <code>defineForm</code>{" "}
        and <code>defineRules</code>, which resolve the keys for async fields and queries and
        support the application's subtypes. It also returns <code>field</code> with{" "}
        <code>field.async</code>, <code>field.multiAsync</code>, and a factory for each subtype.
        Declaring a key in two registries is an error at type-checking time and at runtime.{" "}
        <code>defineForm</code> and <code>defineRules</code> from <code>trama-forms/core</code>{" "}
        reject async fields, subtypes, and queries. <code>messages</code> declares the validation
        messages for these forms. <code>{"required({ label })"}</code>,{" "}
        <code>{"min({ type, min, label })"}</code>, <code>{"max({ type, max, label })"}</code>, and{" "}
        <code>{"query({ label })"}</code> each return nonempty text. <code>query</code> is used when
        a query with <code>forPrepare: true</code> fails. See{" "}
        <Link to="validation" section="application-text">
          Validation
        </Link>
        .
      </p>
    </Entry>

    <SubtypesReference />

    <Entry id="declare-context" signature={`declareContext<T>(): ContextDeclaration<T>`}>
      <p>
        Declares a form's context in its <code>context</code> section. It carries only the type.
        Each session supplies its own data. <code>T</code> must describe an object of plain data
        declared with <code>type</code> rather than <code>interface</code>. Omitting the type
        argument is a type error. See <Link to="context">Context</Link>.
      </p>
    </Entry>

    <Entry
      id="define-form"
      signature={`defineForm({ fields, collections?, context?, defaults?, include?, rules?, form?, outputs? }): FormDefinition`}
    >
      <p>
        Validates and freezes the definition. It throws for invalid configuration, including unknown
        keys, incompatible fields or default values, context that does not come from{" "}
        <code>declareContext</code>, and malformed rules or derived outputs. Sections can appear in
        any order. Only the definitions it returns can be opened. A copy is rejected.
      </p>
      <ul>
        <li>
          <code>{"collections: { [collection]: { fields } }"}</code> defines the collections of
          rows. See <Link to="rows">Rows</Link>.
        </li>
        <li>
          <code>context: declareContext&lt;T&gt;()</code> defines the context its sessions and rules
          receive. See <Link to="context">Context</Link>.
        </li>
        <li>
          <code>defaults: (context) =&gt; ({"{ [field]: value }"})</code> defines default values
          from the context, which it requires. It runs synchronously once when each session is
          created. See{" "}
          <Link to="context" section="defaults">
            Default values
          </Link>
          .
        </li>
        <li>
          <code>include: [ruleSet, condition && ruleSet, ...]</code> lists the rule sets to include
          before <code>rules</code> in declaration order. It skips <code>false</code>,{" "}
          <code>null</code>, and <code>undefined</code>. See <Link to="rule-sets">Rule sets</Link>.
        </li>
        <li>
          <code>
            rules:{" "}
            {
              "{ [field]: { value?, disabled?, readOnly?, hidden?, required?, label?, placeholder?, decimals?, min?, max?, error?, warning?, params?, states?, onChange?, onEdit?, query?, relation? }, [collection]: { each?, row?: { error?, warning? }, collection?: { error?, warning? } } }"
            }
          </code>
          . See <Link to="formulas">Value formulas</Link>, <Link to="events">Events</Link>,{" "}
          <Link to="relations">Relations</Link>, <Link to="field-state">Field state</Link>,{" "}
          <Link to="validation">Validation</Link>, and <Link to="queries">Queries</Link>.
        </li>
        <li>
          <code>form: {"{ readOnly?: entry | entry[], error?, warning? }"}</code>, where{" "}
          <code>
            {
              "entry = { value: (values, { peek, context }) => boolean | reason | undefined, except?: fields[] }"
            }
          </code>
          . See{" "}
          <Link to="field-state" section="form-lock">
            Form lock
          </Link>
          .
        </li>
        <li>
          <code>
            outputs: ({"{ output }"}) =&gt; ({"{ [name]: output(formula) }"})
          </code>
          . See <Link to="outputs">Derived outputs</Link>.
        </li>
      </ul>
    </Entry>

    <Entry
      id="define-rules"
      signature={`defineRules({ fields?, collections?, context?, rules }): RuleSet`}
    >
      <p>
        Defines a separate rule set. <code>fields</code>, <code>collections</code>, and{" "}
        <code>context</code> are its requirements, declared as in <code>defineForm</code>. Write{" "}
        <code>rules</code> as in a form, without having to supply required parameters. It validates
        when called and returns an opaque, frozen value. A form can include it if it has those
        fields with the same type and endpoint, those collections, and the context. The bare{" "}
        <code>RuleSet</code> type accepts any rule set and provides no additional type information.{" "}
        <code>BoundDefineRules</code> is the type of <code>defineRules</code> from{" "}
        <code>createForms</code>. See <Link to="rule-sets">Rule sets</Link>.
      </p>
    </Entry>

    <Entry
      id="rules"
      signature={`value: (values, { peek, context }) => value | undefined
disabled, readOnly: formula | formula[]   // (values, { peek, context }) => boolean | reason | undefined
hidden: formula | formula[]               // (values, { peek, context }) => boolean | undefined
required: formula | formula[]             // (values, { peek, context }) => boolean | message | undefined
label, placeholder: formula               // (values, { peek, context }) => string | undefined
decimals: formula                         // (values, { peek, context }) => integer >= 0 | undefined
min, max: formula                         // (values, { peek, context }) => limit | null | undefined
params: formula                           // (values, { peek, context }) => plain object | undefined
states: formula                           // (values, { peek, context }) => state patch | undefined
onChange: (values, { toDefaults, rows, before, context }) => patch | undefined
onEdit: (values, { toDefaults, rows, before, context }) => patch | undefined
query: { endpoint, params?, patch?, forPrepare? }   // value or list endpoint; forPrepare makes prepare wait for it
  params: (values, { peek, context }) => plain object | undefined
  patch: (result, { values, context }) => patch | undefined
relation: { default: field, members: { [field]: (values, { peek, context }) => value | undefined } }

toDefaults(...fields): patch
patch: { [field]?: value | undefined }
state patch: { [field]?: { disabled?, readOnly?, hidden?, required?, label?, placeholder?, decimals?, min?, max? } }`}
    >
      <p>
        These are the properties of each <code>rules</code> entry. <code>values</code> is read-only,
        and each field read through it is a dependency. <code>peek</code> reads without creating
        one. <code>context</code> exists only if the form declares it. It is the session's read-only
        context and never becomes a dependency. <code>toDefaults</code> returns the value from{" "}
        <code>defaults</code> or, if none is supplied there, the field's <code>default</code>.
        Fields absent from the patch or set to <code>undefined</code> are skipped.{" "}
        <code>placeholder</code> is available only on text, number, date, async, and multiAsync
        fields, including in a state patch. <code>decimals</code> is available on number fields, and{" "}
        <code>min</code> and <code>max</code> on number and date fields. <code>params</code> is
        available only on async and multiAsync fields. It calculates their endpoint parameters, and{" "}
        <code>undefined</code> suspends their option list. Formulas and events are synchronous.
        Declaring <code>rules</code> as a function is an error at type-checking time and at runtime.
      </p>
      <p>
        A field can declare at most one of <code>onChange</code> and <code>onEdit</code>. In both
        events, <code>before</code> contains the header and collection values at the start of the
        operation. It is read-only and creates no dependencies. <code>onEdit</code> runs only on a
        direct edit, reads the command's value for its own field, and leaves targets written by the
        command intact. See <Link to="events">Events</Link>.
      </p>
      <p>
        Declare <code>relation</code> in the driver's entry. The driver is a text or select field
        whose choices are the two members. <code>default</code> names the member that drives when
        the driver is empty. Each formula in <code>members</code> calculates its field's value when
        that field is the derived member. See <Link to="relations">Relations</Link>.
      </p>
      <p>
        <code>query</code> calls a value or list endpoint on any field type. <code>params</code>{" "}
        follows the same rule, and <code>patch</code> converts the response into a patch. Without a{" "}
        <code>patch</code> callback, a defined response is written to the entry field, and a{" "}
        <code>patch</code> callback can return <code>undefined</code> to skip all writes. Declare
        queries with the <code>defineForm</code> or <code>defineRules</code> returned by{" "}
        <code>createForms</code>. See <Link to="queries">Queries</Link>.
      </p>
    </Entry>

    <Entry id="outputs" signature={`output((values, { read, context }) => result)`}>
      <p>
        A formula for a derived output. <code>values</code> reads fields, and{" "}
        <code>read(other)</code> reads another output from the same definition. If the form declares{" "}
        <code>context</code>, it is the session's context and creates no dependency.
      </p>
    </Entry>

    <SessionReference />

    <RowsReference />

    <TypesReference />

    <ReactReference />
  </>
);
