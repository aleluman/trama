import { Example } from "../lib/Example";
import { Link } from "../lib/router";
import { Snippet } from "../lib/Snippet";

export const Subtypes = () => (
  <>
    <h1>Subtypes</h1>
    <p className="lead">
      A subtype specializes a base field type. A text area is a text field, a switch is a checkbox,
      and a search with a table is an async field. A subtype keeps the value, rules, and state of
      its base type and changes its renderer and its static presentation. Trama supplies no
      subtypes. Each application declares its own in <code>createForms</code>.
    </p>
    <Snippet>{`export const forms = createForms({
  endpoints: [inventory],
  subtypes: {
    textarea: subtype.text<{ rows?: number }>(),
    toggle: subtype.checkbox(),
    search: subtype.async<{ columns: readonly { key: OptionKey; title: string }[] }>(),
  },
});
export const { field, defineForm } = forms;

notes: field.textarea({ presentation: { rows: 3 } }),
product: field.search("products", { presentation: { columns: [{ key: "unit", title: "Unit" }] } }),`}</Snippet>

    <h2 id="declaration">Declaration</h2>
    <ul>
      <li>
        Each value in <code>subtypes</code> comes from{" "}
        <code>{"subtype.<base><Presentation>()"}</code> for any of the eight base types. Its key
        names the subtype, its factory in <code>field</code>, and its renderer.
      </li>
      <li>
        A name cannot match a base type or be ordered as an index (for example,{" "}
        <code>Subtype "date" has the name of a field type</code>). A repeated name in the object
        literal is a type error.
      </li>
      <li>
        Combine subtypes from several modules with shorthand properties, as in{" "}
        <code>{"subtypes: { textarea, search }"}</code>. A spread would silently discard a repeated
        key.
      </li>
    </ul>

    <h2 id="fields-and-presentation">Fields and presentation</h2>
    <ul>
      <li>
        <code>field.textarea(config)</code> takes its base configuration and{" "}
        <code>presentation</code>. For a remote base type, the factory takes the endpoint first,
        like <code>field.async</code> (for example,{" "}
        <code>{'field.search("products", config)'}</code>). The definition has the base{" "}
        <code>type</code> and the subtype's name in <code>subtype</code>.
      </li>
      <li>
        <code>presentation</code> is required if <code>{"{}"}</code> does not satisfy its type. It
        consists of plain data that Trama copies and freezes when it creates the field, and the
        renderer receives the same object on every render. It is separate from state. Rules cannot
        read or change it.
      </li>
      <li>
        <code>OptionKey</code> marks a key of the endpoint's option. Each field's presentation is
        checked against the option of its own endpoint.
      </li>
    </ul>
    <Snippet>{`field.search("products", { presentation: { columns: [{ key: "price", title: "Price" }] } });
// Type '"price"' is not assignable to type '"label" | "unit" | "value"'.`}</Snippet>

    <h2 id="renderers">Renderers</h2>
    <ul>
      <li>
        With <code>{"createReactBinding(renderers, { forms, loader })"}</code>, the registry keys
        are the base types and the subtypes of <code>forms</code>. Without <code>forms</code>, they
        are only the base types.
      </li>
      <li>
        Coverage is strict. A subtype without a renderer is an error even if its base type has one.
        Reusing the base renderer is an explicit fallback, as in <code>toggle: CheckboxInput</code>.
        A class component with the base props also works.
      </li>
      <li>
        A renderer written in the registry gets inferred props. A separate renderer can name them
        with <code>{'SubtypeProps<typeof forms, "search">'}</code>. It gets the base props and{" "}
        <code>presentation</code>, where <code>OptionKey</code> can be any key because one renderer
        serves all endpoints.
      </li>
    </ul>
    <Example
      id="purchase-request"
      title="A purchase request"
      files={["examples/subtypes/request.tsx", "ui/subtypes.tsx", "forms.ts", "ui/form-ui.ts"]}
      steps={[
        <>
          Focus the “Product” search input. The table shows each option's code, name, and unit in
          the columns from its presentation.
        </>,
        <>
          Type “washer” and click “Select” in the first row. <code>product</code> stores the full
          option, and the “Notes” placeholder changes to “Quantity (box)”.
        </>,
        <>
          Check “Urgent”, which uses the checkbox renderer. <code>urgent</code> becomes{" "}
          <code>true</code> and the <code>notes</code> formula writes “Ship today”.
        </>,
        "Type in “Notes”. The text area has the three rows specified in its presentation.",
        <>
          Click “Remove Flat washer”. <code>product</code> returns to <code>null</code> and “Urgent”
          is disabled again, with its reason.
        </>,
      ]}
    />

    <h2 id="admission">Where subtypes are accepted</h2>
    <ul>
      <li>
        A subtype field is accepted only in the forms, rule sets, and bindings of its{" "}
        <code>createForms</code>. An unrelated registry produces{" "}
        <code>Field "notes" (subtype "textarea") belongs to other forms</code>. The core's{" "}
        <code>defineForm</code> and <code>defineRules</code> reject it with{" "}
        <code>
          Field "notes" (subtype "textarea"): define the form with the defineForm of createForms
        </code>
        .
      </li>
      <li>
        At runtime, Trama recognizes its <code>createForms</code> by identity. A marker on the field
        survives a spread and is lost during serialization.
      </li>
      <li>
        A rule set that requires a base type accepts its subtypes (see{" "}
        <Link to="rule-sets">Rule sets</Link>). The presentation and subtype belong to the form that
        includes it.
      </li>
      <li>
        A binding without <code>forms</code> cannot render subtypes ({" "}
        <code>Field "notes" (subtype "textarea"): pass its forms to createReactBinding</code>). The
        binding checks each field template once with the <code>defineRules</code> of its{" "}
        <code>forms</code>.
      </li>
    </ul>
    <Example
      id="where-a-field-fits"
      title="Where a field is accepted"
      files={["examples/subtypes/admission.ts"]}
    />

    <h2 id="limits">Limits</h2>
    <ul>
      <li>Presentation is static, and a subtype neither changes nor normalizes the value.</li>
      <li>
        The type system checks <code>presentation</code> and <code>OptionKey</code>. At runtime,
        Trama checks that <code>presentation</code> is a plain data object.
      </li>
      <li>
        In the type system, a field fits a subtype from another <code>forms</code> if its
        presentation satisfies the subtype, and two instances of <code>forms</code> with the same
        shape are indistinguishable. Runtime checks distinguish them.
      </li>
      <li>
        Adding a base field type with the same name as an application's subtype is a major change.
      </li>
    </ul>
  </>
);
