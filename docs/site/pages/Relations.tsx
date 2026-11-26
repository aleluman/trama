import { Example } from "../lib/Example";
import { Link } from "../lib/router";
import { Snippet } from "../lib/Snippet";

export const Relations = () => (
  <>
    <h1>Relations</h1>
    <p className="lead">
      A bidirectional relation connects two editable fields that express the same information using
      a base value. For a discount, you can edit the percentage or the amount applied to the gross
      amount. A third field, the driver, specifies which member keeps its value. The other member,
      the derived member, is calculated by its formula.
    </p>

    <h2 id="declaring-a-relation">How to declare a relation</h2>
    <p>
      Put <code>{"relation: { default, members: { a, b } }"}</code> in the driver’s entry. You can
      declare it in <code>rules</code> for the header or in <code>each</code> for a row, including
      in a <code>defineRules</code> that the form incorporates with <code>include</code>. Each
      member has a formula that runs when that member is derived.
    </p>
    <p>
      The driver is a text or select field. A select driver declares exactly the member names as its
      options. When the driver is empty (<code>{'""'}</code> for text or <code>null</code> for a
      select), the member specified by <code>default</code> drives the relation.
    </p>
    <Example
      id="discount"
      title="The discount"
      files={["examples/relations/discount.tsx"]}
      steps={[
        "With “Gross amount” at 1,000, enter 12.345 in “Percentage” (12.345%, with a decimal point in the input). “Discount amount” becomes 123 and the percentage keeps all three decimal places.",
        "Enter 150 in “Discount amount”. “Discount by” changes to “Amount” and the percentage becomes 15.",
        "Change “Gross amount” to 2000. The discount amount stays at 150 and the percentage is recalculated as 7.5.",
        "In “Discount by”, choose “No selection” and change the gross amount to 3000. The percentage now drives the relation, and the discount amount becomes 225.",
      ]}
    >
      <p>
        The amount formula rounds to whole numbers. If the amount drives the relation and the gross
        amount is zero, the percentage formula returns <code>undefined</code> to keep the percentage
        and avoid division by zero.
      </p>
    </Example>

    <h2 id="what-happens-on-edit">What happens on edit</h2>
    <ul>
      <li>
        A direct edit that changes a member proposes it as the driving member. The relation’s event
        writes its name to the driver. If a command changes both members and omits the driver, the
        relation’s events choose the default member. The relation’s events respect the driver
        written by the command, even if the command leaves it empty. Another writer of the driver,
        such as a later <code>onChange</code>, can take precedence by declaration order.
      </li>
      <li>
        In a command that changes something, the derived member’s formula runs if a value it reads
        changes or if the command itself writes that field, even if it repeats the field’s value.
        The formula result replaces the command’s value unless a later writer takes precedence. If
        the formula returns <code>undefined</code>, it keeps the existing value.
      </li>
      <li>
        A value written to the derived member by another rule, a query response, or a canonical
        value stays until one of the values the formula reads changes. If the formula runs in the
        same operation, declaration order determines which rule wins (see{" "}
        <Link to="events" section="multiple-writers-for-one-field">
          Events
        </Link>
        ). A query response or a canonical value comes in as supplied, and the formula replaces it.
        To keep the value another rule gives a member, also write the driver.
      </li>
    </ul>
    <Snippet>{`// A rules entry that sets the amount and makes it drive the discount.
promotion: {
  onChange: () => ({ amount: 150, discountBy: "amount" }),
},`}</Snippet>

    <Example
      id="foreign-currency-line"
      title="The foreign currency line"
      files={[
        "examples/relations/foreign-currency.tsx",
        "examples/queries/endpoints.ts",
        "examples/queries/api.ts",
      ]}
      steps={[
        "Wait for the simulated endpoint to fill in “Rate” with 150. With a foreign amount of 100 USD, the local amount is 15,000 JPY.",
        "Enter 155.126 in “Rate” and select “November 24” in “Date”. The query is suspended, the rate stays at 155.126, and the local amount of 15,512.6 is rounded to 15,513 JPY.",
        "Enter 16000 in “Local amount (JPY)”. The local amount becomes the driving member and the rate is recalculated as 160.",
        "Change “Currency” to “EUR”. The driver is cleared and “Fetching the rate…” reappears. The response sets the rate to 172 and the local amount to 17,200 JPY.",
        "In “Document type”, select “Credit”. “Total debit” becomes 0 and “Total credit” becomes 17,200. The rate, local amount, and driver keep their values.",
      ]}
    >
      <p>
        In each row, <code>driver</code> is a text field. The query requests the rate from the
        simulated <code>exchangeRate</code> endpoint while the driver is empty and the currency and
        date are set. Changing the currency clears the driver. Each row puts its local amount on the
        debit or credit side based on the header’s document type, and the voucher totals each side
        separately.
      </p>
    </Example>

    <h2 id="open-save-and-reset">Open, save, and reset</h2>
    <p>
      The driver is an ordinary field. Changing it counts toward the form’s dirty state (see{" "}
      <Link to="changes">Changes</Link>). It is included in the prepared submission’s values and is
      saved if your application includes it in what it sends. <code>session.reset()</code> restores
      its baseline value.
    </p>
    <p>
      If you include the driver in <code>initial</code>, its value must be a member name or the
      field’s empty value (<code>{'""'}</code> for text or <code>null</code> for a select). If the
      final value of a text driver is unknown, the operation fails. The session keeps both values in
      the pair when they are in <code>initial</code>, even if their rounding differs from the
      formula’s. A <code>patch</code> that changes the pair triggers the derived member’s
      calculation.
    </p>

    <h2 id="limits">Limits</h2>
    <p>
      Each relation has two members distinct from the driver, in the same header or the same row.
      Each field can be a member of only one relation. The relation handles <code>value</code>,{" "}
      <code>onChange</code>, and <code>onEdit</code> for its members, so their entries must omit
      those properties. A member can receive a query value, such as the line’s rate.
    </p>
  </>
);
