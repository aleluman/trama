import { Link } from "../lib/router";
import { Entry } from "./ApiEntry";

export const SubtypesReference = () => (
  <Entry
    id="subtype"
    signature={`subtype.text<P>(), subtype.number<P>(), subtype.checkbox<P>(), subtype.date<P>()
subtype.select<P>(), subtype.multiSelect<P>(), subtype.async<P>(), subtype.multiAsync<P>()

field.<subtype>({ ...base configuration, presentation?: P })   // from the field returned by createForms
field.<remote subtype>(key, { ...base configuration, presentation?: P })`}
  >
    <p>
      <code>subtype.&lt;base&gt;&lt;P&gt;()</code> declares a subtype for <code>createForms</code>,
      specifying its base type and the type <code>P</code> of its presentation. The presentation is
      an object of plain data, with <code>{"{}"}</code> as the type when the argument is omitted.
      The subtype's name is its key in <code>subtypes</code> and cannot be the name of a base type.
    </p>
    <p>
      Each subtype provides a factory on <code>field</code> with its base type's configuration and{" "}
      <code>presentation</code>, which is required if <code>{"{}"}</code> does not satisfy{" "}
      <code>P</code>. Creating the field copies and freezes the presentation. In a remote subtype,{" "}
      <code>OptionKey</code> within <code>P</code> is a key of the option from the field's endpoint.
      The definition is a <code>SubtypeDefinition&lt;D, N, P&gt;</code>, which is the base
      definition <code>D</code> with <code>subtype: N</code> and its presentation. See{" "}
      <Link to="subtypes">Subtypes</Link>.
    </p>
  </Entry>
);
