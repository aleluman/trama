import { Example } from "../lib/Example";
import { Link } from "../lib/router";
import { Snippet } from "../lib/Snippet";

export const RuleSets = () => (
  <>
    <h1>Rule sets</h1>
    <p className="lead">
      A rule set is defined separately and included in multiple forms. An order and a quote share
      rules for lots, prices, and totals, and each includes its own rule set for line amounts. A
      variant chooses which rule sets to include. It never removes or replaces a rule.
    </p>
    <Snippet>{`const { defineForm, defineRules, field } = createForms({ endpoints: [inventory] });
const sale = { fields: header, collections: { lines } };

// A rule set declares what it needs from the form and defines its rules without type annotations.
const amounts = defineRules({
  ...sale,
  rules: { lines: { each: { amount: { value: ({ quantity, price }) => (quantity ?? 0) * (price ?? 0) } } } },
});
const salePreset = [lots, pricing, amounts, totals] as const;

const order = defineForm({
  ...sale,
  context: sent,
  include: [...salePreset, sentLock],
  rules: { lines: { each: { lot: { hidden: ({ product }) => product === null } } } },
});
const quote = defineForm({ ...sale, include: [lots, pricing, discountedAmounts, totals] });`}</Snippet>

    <h2 id="rule-sets-and-requirements">Rule sets and requirements</h2>
    <ul>
      <li>
        <code>{"defineRules({ fields?, collections?, context?, rules })"}</code> declares its
        requirements using the vocabulary of <code>defineForm</code> and defines <code>rules</code>{" "}
        as in a form, with header entries and <code>each</code> for collections, including{" "}
        <code>params</code> and <code>query</code>. It takes no <code>form</code>,{" "}
        <code>outputs</code>, <code>defaults</code>, or <code>include</code>.
      </li>
      <li>
        Rules are inferred from the requirements. TypeScript cannot infer fields from what a
        function reads. Declaring the family's shape, <code>{"{ ...sale, rules }"}</code>, is
        simplest. A rule set used by multiple form families declares the fields and collections its
        rules require, including the fields they write.
      </li>
      <li>
        <code>defineRules</code> validates its rules when called, with messages that start with{" "}
        <code>Rule set</code>, and returns an opaque, frozen value. A copy does not count as a rule
        set. Only <code>defineRules</code> from <code>createForms</code> accepts async fields and
        queries.
      </li>
      <li>
        A form meets a rule set's requirements if it has every field with the same field type, the
        same value type, and, for a remote field, the same endpoint. It must have each collection
        with those fields in its rows. If the rule set declares a context, the form must provide the
        same context or a broader one. Field labels and default values come from the form, as do the
        options of select fields.
      </li>
    </ul>

    <h2 id="include">Include rule sets</h2>
    <ul>
      <li>
        <code>include</code> is a list of rule sets. It skips <code>false</code>, <code>null</code>,{" "}
        and <code>undefined</code>, so an element can be conditional, as in{" "}
        <code>{"[base, enabled && extra, quote ? a : b]"}</code>. A preset is a list. With{" "}
        <code>as const</code>, TypeScript checks it element by element. A rule set does not include
        other rule sets.
      </li>
      <li>
        The form's declarations follow the rule sets in <code>include</code> order, then{" "}
        <code>rules</code>. As in a single section of rules, the last declared writer wins. When a
        formula from one rule set and an event from another both write, the one later in the
        sequence writes.
      </li>
      <li>
        <code>disabled</code>, <code>readOnly</code>, <code>hidden</code>, <code>required</code>,{" "}
        <code>label</code>, <code>placeholder</code>, <code>decimals</code>, <code>min</code>,{" "}
        <code>max</code>, and <code>states</code> accumulate from each rule set and from{" "}
        <code>rules</code> in sequence. <code>value</code>, <code>onChange</code>,{" "}
        <code>params</code>, and <code>query</code> can each appear only once per field across the
        entire form. A second declaration is an error. Repeating a rule set is also an error.
      </li>
      <li>
        <code>rules</code> can add properties to a field covered by a rule set. The order hides the
        lot, whose parameters come from <code>lots</code>.
      </li>
      <li>
        Diagnostics for rules from a rule set append the rule's location to its label, as in{" "}
        <code>{'Field "amount" of "lines" row "r6" value (include[2]): formula failed: …'}</code>.
        Inline rules keep their labels.
      </li>
      <li>
        <code>FormQueries</code> and <code>RowQueries</code> add queries from the rule sets. Those
        queries are optional if their element can be absent. A composed form has the same type as if
        it were written inline, and its session works like any other session.
      </li>
    </ul>
    <Example
      id="order-and-quote-with-shared-rule-sets"
      title="An order and a quote with shared rule sets"
      files={[
        "examples/rule-sets/variants.tsx",
        "examples/rule-sets/forms.ts",
        "examples/rule-sets/rules.ts",
        "examples/rule-sets/fields.ts",
        "examples/rule-sets/document.tsx",
      ]}
      wide
      steps={[
        "Both documents open with the same line, 4 boxes of “Screw 3 × 20 mm” at 200 with a 10% discount. The order amount is 800 and the quote amount is 720, because only the quote includes discounted amounts.",
        "Change the quantity to 5 on both lines. The order shows 1,000 and the quote shows 900. The totals follow the amounts.",
        "Select “Wholesale” in the order's price list. Its line queries the price again. When the price of 170 arrives, the amount becomes 850. The quote stays the same.",
        "Remove the product from the order line. The order's inline rule hides the lot. The lot remains visible in the quote.",
        "Click “Send”. The order opens another session with the context of a sent order. “Notes” becomes disabled with “Sent” as its reason, and the quantity becomes read-only. The quote does not include that rule set.",
      ]}
    />

    <h2 id="variants">Variants</h2>
    <ul>
      <li>
        Composition is fixed when the form is defined. A variant is a separate definition with its
        own sessions. An application function builds it with a ternary inside <code>include</code>.
        Changes per session come from rules that read the context.
      </li>
      <li>
        A rule set that is always present supplies required parameters. An element that may be
        absent cannot guarantee them, and <code>rules</code> cannot supply them either because they
        would collide. That is why the variant alternates between <code>lots</code> and{" "}
        <code>lotParamsOnly</code>, both of which supply the lot parameters.
      </li>
      <li>
        Without a rule set to supply them, the form requires them in <code>rules</code>. The type
        diagnostic explains why with <code>{'field "lot" of "lines" needs params: …'}</code>{" "}
        followed by <code>give them in rules or in a rule set always included</code>,{" "}
        <code>the rule set that gives them may be absent</code> o{" "}
        <code>a list without "as const" may lack the rule set that gives them</code>.
      </li>
    </ul>
    <Example
      id="variant-chosen-at-definition"
      title="A variant chosen at definition time"
      files={["examples/rule-sets/selector.tsx", "examples/rule-sets/forms.ts"]}
      wide
      steps={[
        "With “Select the lot if it is the only one” on, the definition includes lots. Select “Port” in the line's warehouse. The lot clears, and the lot query returns one lot and selects it.",
        "Turn the switch off. The definition now includes lotParamsOnly and opens another session with the saved line. Select “Port” again. The lot stays empty, and the field's list still offers the lot from “Port”.",
        "Turn it back on to open another session with lots. Edits in the other variant do not carry over.",
      ]}
    />

    <h2 id="errors">Errors</h2>
    <ul>
      <li>
        The types check requirements, collisions, and the registry on the <code>include</code>{" "}
        element. Diagnostics include <code>{'rule set requires field "rate"'}</code>,{" "}
        <code>rule set requires another context</code>,{" "}
        <code>{'field "amount" of "lines" value is declared by another rule set'}</code> o{" "}
        <code>… is declared in rules too</code>.
      </li>
      <li>
        At definition time, <code>defineForm</code> checks each element in the order written and
        throws the first error. It checks that the element is a rule set, that it appears only once,
        that it comes from the same <code>createForms</code>, and that its requirements and context
        are met. See the messages in{" "}
        <Link to="errors" section="common-messages">
          Errors and limits
        </Link>
        .
      </li>
    </ul>
    <Example
      id="repeated-rule-set"
      title="A repeated rule set"
      files={["examples/rule-sets/repeated.tsx"]}
      steps={[
        "Click “Define with sentLock twice”. defineForm throws Form include[2]: repeats the rule set of include[1]. sentLock declares no value, onChange, params, or query, so the types do not detect the duplicate.",
      ]}
    />

    <h2 id="limits">Limits</h2>
    <ul>
      <li>
        A rule set that may be absent does not supply required parameters. A list without{" "}
        <code>as const</code>, an <code>include</code> that may be absent, or the broad{" "}
        <code>RuleSet</code> type offers no guarantees in the types. <code>defineForm</code> checks
        them at runtime. Fixed rule sets before a rest element, as in <code>[lots, ...others]</code>
        , do guarantee what they supply.
      </li>
      <li>
        For a configuration assembled separately with an optional <code>include</code>,{" "}
        <code>{"{ …; include?: readonly [typeof lots] }"}</code>, the types treat it as present.
        Write <code>include</code> in the call to <code>defineForm</code>.
      </li>
      <li>
        With explicit type arguments in <code>defineForm</code>, the types do not check{" "}
        <code>include</code>. A repeated rule set with no unique properties or two instances of{" "}
        <code>createForms</code> with the same endpoints can be distinguished only at runtime.
      </li>
      <li>
        A variant that omits fields is out of scope. It cannot include a rule set that requires a
        missing field. A formula cycle names the fields and omits the rule set. A cycle closed by an
        event names the event and its location.
      </li>
    </ul>
  </>
);
