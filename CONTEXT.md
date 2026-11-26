# Trama

Declarative forms library for expressing fields and their relationships.

## Language

**Form**:
A set of values that a person can view or edit to complete a task, together with the rules that relate those values.
_Avoid_: Document, when referring to the library's generic concept.

**Form definition**:
Reusable declaration of a form's fields and behaviors, independent of any particular edit.
_Avoid_: Session.

**Field**:
Identified element of a form that holds a value.
_Avoid_: Control, when referring to the data as distinct from its visual representation.

**Field type**:
Category of field that determines the values it accepts, its empty value, its configuration, and the state properties it accepts. The types are text, number, checkbox, select, remote select (async), date, multi-select, and remote multi-select.
_Avoid_: Type alone, when it could be confused with the TypeScript type of the value. Control, when referring to the type as distinct from its renderer.

**Subtype**:
Specialization of a field type that the application declares, with its own renderer and presentation. It retains the value, rules, and state properties of its base type. For example, a tax identifier is text.
_Avoid_: Variant, which names a form variant. Custom type, when referring to a subtype.

**Presentation**:
Static data for a subtype's field that only its renderer reads, such as the rows of a text area or the columns of a lookup. It stays fixed at runtime and has no effect on the value.
_Avoid_: Option, which names a value accepted by a select field. Props, when referring to the declared data.

**Civil date**:
Calendar date without a time or time zone, written as `YYYY-MM-DD`. It is the value of a date field.
_Avoid_: Date and time, timestamp.

**Multi-select value**:
A multi-select value contains the selected options without duplicates, and their order has no effect on equality. A static multi-select field stores the selected options' `value` entries, and a remote multi-select field stores the complete selected options. Both use an empty list as their empty value. Writing the same elements in a different order leaves the field unchanged.
_Avoid_: Array, list, when referring to the concept.

**Collection**:
Ordered set of rows in a form, with the same fields in each row. The order is visible data and never serves as identity.
_Avoid_: Array, list, when referring to the concept. Table, grid, when referring to the data as distinct from its view.

**Row**:
Record of fields in a collection, with its own identity. Moving it leaves its values unchanged.
_Avoid_: Item. Index, when referring to its identity.

**Row key**:
Opaque identity that the session assigns to a row. It is distinct from the position and the persisted ID, and is never reused.
_Avoid_: Index, ID, when referring to the row's identity in the session.

**Header**:
Fields of a form that do not belong to a collection.
_Avoid_: Form, when referring only to these fields.

**Session**:
Editing instance of a form with its own state, independent of other sessions of the same definition.
_Avoid_: Form, when the distinction between a particular edit and its definition matters.

**Snapshot**:
View of a session's state at a particular moment.
_Avoid_: Form definition.

**Baseline**:
Set of values that represents the starting point for editing in a session. It consists of the values from opening until the application commits a submission, and the committed values from then on.
_Avoid_: Saved data, when it does not represent the complete starting point.

**Dirty**:
Difference between a session's values or rows and its baseline, read by field, row, collection, or form. Writes during opening leave the state clean, and returning to the baseline value clears the dirty state.
_Avoid_: Edited, modified, when referring to the comparison with the baseline.

**State property**:
Property of a field distinct from its value. It includes whether the field is disabled, read-only, hidden, or required, its label and placeholder, the decimals of a number, the minimum and maximum of a number or date, and its errors and warnings. It leaves the field's value unchanged and does not prevent writing to it.
_Avoid_: Mode, flag, when referring to the property.

**State contribution**:
Contribution to a field's state properties made by a rule, the form lock, or the state declared on the field itself, distinguishable from the other contributions and the resulting state of the field. A rule can withdraw its contribution. The field cannot.
_Avoid_: Field state, when referring only to a contribution.

**Reason**:
Text that explains why a field is disabled or read-only. It comes with the contribution that activates the property and stops being published when that contribution is withdrawn.
_Avoid_: Message, error, outside the context of validation.

**Error**:
Local message that prevents preparing the submission. A rule, or validation of a field that is required and empty or outside its limits, contributes it to a field, row, collection, or the form.
_Avoid_: Reason. Problem, when referring to a local error.

**Warning**:
Message that provides information about a field, row, collection, or the form without preventing submission. It is always shown.
_Avoid_: Error, notice.

**External error**:
Message that the application contributes from outside the rules, such as a server response, placed on a field, row, collection, or the form. It is always shown, has no effect on whether the submission can be prepared, and is withdrawn when its target changes.
_Avoid_: Server error, when the source can be something else.

**Source**:
Identity that the application uses to contribute external errors or warnings. Each contribution replaces what that source contributed before, and two sources cannot clear each other's contributions.
_Avoid_: Origin, channel.

**Touched**:
Marker that the person interacted with a field or row. It determines when their local errors are shown. Their validity is independent of the marker.
_Avoid_: Visited, focused. Dirty, which compares with the baseline.

**Attempt**:
Preparation of a submission, which allows the local errors of rows that already existed to be shown. A row created afterward does not inherit it.
_Avoid_: Submission, when referring to the marker.

**Pending input**:
Text that a view could not convert into a value, such as a partially entered date, and that the view reports as an error. It prevents preparing the submission without making the state dirty, and the renderer keeps the text.
_Avoid_: Draft, which names the separate edit of a row.

**Prepared submission**:
Ready result of preparing a submission, containing the values, row keys, and warnings at that moment, tied to its session. The application projects it into its payload and commits it when the server accepts it.
_Avoid_: Payload, which is what the application sends. Snapshot.

**Derived output**:
Named result calculated from the form's values or other derived outputs. The application reads it separately from the field values.
_Avoid_: Field, when referring to a result separate from the form's values.

**Rule**:
Part of a form definition that sets a field property or reacts to a field change.
_Avoid_: Action, when referring to authoring.

**Rule set**:
Separately defined group of rules, with the fields, collections, and context it requires, that a form includes.
_Avoid_: Fragment, preset, mixin.

**Formula**:
Rule that maintains a field property, such as its value or a state property, or the state properties of multiple fields, calculated from the form's values.
_Avoid_: Derivation.

**Dependency**:
Field that a formula or derived output reads and whose change causes it to be recalculated. A formula can read a field without making it a dependency.
_Avoid_: Trigger, when referring to what a formula reads.

**Field event**:
Rule associated with a field that runs when its value changes or, for `onEdit`, when a command edits it directly, and writes values to other fields.
_Avoid_: Trigger, write, effect.

**Direct edit**:
Each field that an application command changes by writing to it. The commands are `edit`, editing a row, and `patch`. Writes from rules, query responses, opening, reset, and `commit` do not count as direct edits.
_Avoid_: User edit, manual input.

**Mode field**:
A field that indicates whether another field follows its calculation or retains the manually written value. It is an ordinary field. It can be read and edited, and it participates in the prepared submission, "dirty," and reset.
_Avoid_: Override, lock, when referring to the data that stores the mode.

**Patch**:
Values that a field event returns for multiple fields. An absent field or a field with an undefined value is skipped. A patch can write row fields nested by collection and row key, and the application can apply it to the session in one operation.
_Avoid_: Changes, update, when referring to what an event returns.

**State patch**:
State properties that a formula contributes to multiple fields at once. Each evaluation replaces that formula's previous patch. An absent field or property withdraws its contribution. It never writes values.
_Avoid_: Patch, when referring to state properties.

**Context**:
Application data that a session receives when it is created and that its rules and outputs read, such as the mode, permissions, or today's date. Each form declares the context it needs. It stays fixed during the session, so it does not count as a dependency.
_Avoid_: Scope, which separates remote data. Environment.

**Default value**:
Value that the definition assigns to a field when it receives no other value, fixed on the field or calculated from the context when the session is created. It is distinct from a session's baseline.
_Avoid_: Baseline, when referring to the definition's value.

**Option**:
Value accepted by a select field, together with its label and associated data that rules can read. In an async field, the complete option is the field's value and is identified by its `value`. Writing another option with the same `value` leaves the field unchanged. Its data is plain and read-only.
_Avoid_: Item.

**Async field**:
Select field whose options come from an endpoint and whose value is the complete selected option.
_Avoid_: Lookup. Combo, when referring to the field as distinct from its renderer.

**Remote field**:
Select field whose options come from an endpoint. It can be an async field, which stores one option, or a remote multi-select, which stores several. It has parameters, lists per view, and queries that write to it.
_Avoid_: Async field, when referring to both.

**Endpoint**:
Named remote source that returns options or a value based on parameters and that multiple forms can share. Options arrive in pages with server-side search, or as a complete list with local search.
_Avoid_: URL, service, when referring to the declared source.

**Parameters**:
Data that a remote field or query sends to its endpoint, calculated by its `params` rule from the form's values. If the rule returns `undefined`, the list or query is suspended.
_Avoid_: Filters.

**Option list**:
Options that a view of a remote field shows according to its search, from pages or from a complete list. Each view searches separately, and the list never writes to the session.
_Avoid_: Field options, when referring to what a view shows.

**Scope**:
Identity that separates a session's remote data, for example, an account's identity. It is set when the session is created. Each endpoint receives it, and it is part of the cache key.
_Avoid_: Context, which is what the rules read. Tenant.

**Loader**:
Adapter that runs a session's requests to its endpoints, with the key Trama builds. The direct loader stores nothing. The TanStack Query loader shares the application's cache.
_Avoid_: Fetcher, client.

**Query**:
Request to an endpoint that a session starts through a field's `query` rule and whose response writes to fields. The response writes only if its generation is still current and none of its targets has changed since it started. Responses that arrive together are applied in one operation.
_Avoid_: Effect. Use the full name TanStack Query for the library.

**Generation**:
Identity of the in-flight query of a `query` rule in the header or a row. A later operation that invalidates it, such as changing its parameters, changing its field, removing its row, or a reset, prevents its response from writing.
_Avoid_: Epoch, which is the binding's opening attempt. Token.

**Endpoint registry**:
Set of endpoints that an application declares once and that its definitions reference by key.
_Avoid_: Catalog.

**Form lock**:
Read-only contribution that applies to all fields except its exceptions. An exception does not guarantee that the field becomes editable.
_Avoid_: View mode, when referring to the contribution.

**Bidirectional relation**:
Link between two editable fields, its members, that represent the same data in two ways and whose correspondence is expressed through one calculation for each direction. It is declared with `relation` in its driver's entry. The driving member retains its value and the other, the derived member, takes its calculated value.
_Avoid_: Derived output, when both values are editable fields.

**Driver**:
Field that indicates which member of a relation is retained. Its empty value lets the default member drive. It is an ordinary field. It can be read and edited, and it participates in the prepared submission, "dirty," and reset.
_Avoid_: Direction, mode, when referring to the field of the relation.
