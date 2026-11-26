import { Example } from "../lib/Example";
import { Link } from "../lib/router";
import { Snippet } from "../lib/Snippet";

export const Events = () => (
  <>
    <h1>Events</h1>
    <p className="lead">
      Use <code>onChange</code> to respond to a change in value, even when another rule writes it.
      Use <code>onEdit</code> to respond only to a direct edit by the application. Choose one per
      field. Both go in the entry for the field that triggers them and return a patch with the
      values they write to other fields.
    </p>
    <Snippet>{`rules: {
  country: {
    onChange: ({ country, useCapital }, { toDefaults }) =>
      useCapital && country !== null ? { city: capitals[country] } : toDefaults("city"),
  },
},`}</Snippet>

    <h2 id="when-an-event-runs">When an event runs</h2>
    <ul>
      <li>
        <code>onChange</code> responds to a change in its field, whether it comes from a command, a
        rule, or a query response. It does not run on opening, on <code>reset()</code>, or if the
        field returns to its previous value within the same operation.
      </li>
      <li>
        <code>onEdit</code> runs only when <code>session.edit</code>, <code>row(...).edit</code>, or{" "}
        <code>session.patch</code> changes its field. It does not run when a rule or query response
        writes the field, when adding rows with <code>add</code>, on opening, on{" "}
        <code>reset()</code>, or on <code>commit</code>. If it reads its own field, it sees the
        value from the command, and that read creates no dependency.
      </li>
      <li>
        Changing only another field that the event reads does not trigger it. Both events receive
        read-only values, <code>toDefaults</code>, <code>before</code>, and <code>context</code> if
        the form declares it (see <Link to="context">Context</Link>). They do not receive{" "}
        <code>peek</code>.
      </li>
      <li>
        The handler is synchronous and has no side effects. Trama can call it again within the same
        operation if it read a value that later changed. It applies only the last result.
      </li>
    </ul>

    <h2 id="patch">The patch</h2>
    <ul>
      <li>
        A patch is a plain object containing the values the event writes, and it can write to
        multiple fields at once. It skips fields that are absent or set to <code>undefined</code>.
        Returning <code>undefined</code> writes nothing.
      </li>
      <li>
        Its keys must be fields, and each value must match its field type, both in the types and at
        runtime.
      </li>
      <li>
        After validating the <code>onEdit</code> patch, Trama discards targets the command already
        wrote, even if the command repeated their values. <code>onChange</code> can replace values
        written by the same command.
      </li>
      <li>
        <code>toDefaults(...fields)</code> returns a patch that restores those fields to their
        default values. It uses the value provided by <code>defaults</code> from context, the
        field’s <code>default</code>, or the empty value for its type (<code>""</code>,{" "}
        <code>false</code>, <code>null</code>, or <code>[]</code>). It never restores the baseline.
        You can compose it with spread syntax as in{" "}
        <code>{'{ ...toDefaults("city", "zone"), city: capital }'}</code>.
      </li>
    </ul>

    <h2 id="dependent-field">A field that depends on another field</h2>
    <Example
      id="city-default-or-capital"
      title="The city returns to its default value or takes the capital"
      files={["examples/rules/city.tsx"]}
      steps={[
        "In the form that opens with Japan selected, enter “Osaka” and change the country to Mexico. The city returns to its default value, which is empty.",
        <>
          Check “Fill with the capital”. Nothing happens because the event belongs to{" "}
          <code>country</code>.
        </>,
        "Change the country to Spain. The city becomes “Madrid”.",
        "Enter another city. It stays until the next country change.",
      ]}
    />

    <h2 id="writing-multiple-fields">Writing multiple fields</h2>
    <Example
      id="customer-contact-terms-and-country"
      title="A customer fills in the contact, payment terms, and country"
      files={["examples/rules/customer.tsx"]}
      steps={[
        "Select “Atlas Trading”. A single patch sets the contact to Bruno, the payment terms to 45, and the country to Spain.",
        "Edit the contact by hand and select “Horizon Distribution”. The three fields change to Gloria, 60, and Mexico.",
        "Select “No selection”. The contact becomes empty, the payment terms return to 30, and the country returns to Japan.",
      ]}
    />

    <h2 id="on-edit-debit-and-credit">Debit and credit with onEdit</h2>
    <p>
      Editing the debit sets the credit to zero, and vice versa. Neither event triggers the other
      because a rule write does not count as a direct edit. If the command writes both fields,{" "}
      <code>onEdit</code> replaces neither.
    </p>
    <Example
      id="edit-debit-or-credit"
      title="Edit one side without clearing values written by a patch"
      files={["examples/rules/debit-credit.tsx"]}
      steps={[
        "Enter 50 in “Debit”. “Credit” drops from 10 to 0.",
        "Enter 20 in “Credit”. “Debit” becomes 0.",
        "Click “Apply patch”. “Debit” is 30 and “Credit” is 40.",
      ]}
    />

    <h2 id="manual-total-with-a-mode-field">Manual total with a mode field</h2>
    <p>
      If you edit the total, <code>onEdit</code> checks <code>totalManual</code> and the formula
      stops writing. Entering the same total does not trigger the event or change the mode. The mode
      field is an ordinary field. If it differs from the baseline, the form becomes dirty. It is
      saved if the application includes it when saving, and <code>reset()</code> restores it to the
      baseline.
    </p>
    <Example
      id="keep-a-manual-total"
      title="Keep a manually entered total"
      files={["examples/rules/manual-total.tsx"]}
      steps={[
        "Enter 25 in “Total” and change “Quantity” from 2 to 3. The total stays at 25.",
        "Click “Return to calculation”. “Manual total” is cleared and the total becomes 30.",
      ]}
    />
    <p>
      The same pattern works for a per-line exchange rate. While <code>rateManual</code> is checked,
      the parameters return <code>undefined</code> and the query is suspended. Changing the currency
      returns the line to automatic mode. The response from the simulated <code>exchangeRate</code>{" "}
      endpoint does not trigger <code>onEdit</code>.
    </p>
    <Example
      id="manual-rate"
      title="A line with a manual rate and a simulated endpoint"
      files={[
        "examples/rules/manual-rate.tsx",
        "examples/queries/endpoints.ts",
        "examples/queries/api.ts",
      ]}
      steps={[
        "Wait for the USD rate. “Rate” shows 150 JPY per dollar and “Manual rate” stays unchecked.",
        "Select “November 24” in “Date”. In automatic mode, the query requests the rate again and the value becomes 152.",
        "Enter 155 in “Rate” and go back to “November 23”. The rate stays at 155 and “Manual rate” stays checked.",
        "Change “Currency” to EUR. Manual mode is cleared and, when the response arrives, the rate becomes 170.",
      ]}
    />

    <h2 id="previous-values">Previous values</h2>
    <p>
      <code>before</code> contains the read-only values from the start of the operation. In the
      header, it contains the values of the entire form, including its collections. In a row, you
      receive <code>{"{ row, values }"}</code>. <code>before.row</code> is the previous row with the
      same key, and <code>before.values</code> holds the previous form values. Rows added by the
      operation are absent from <code>before</code>. Reading it creates no dependencies.
    </p>
    <Example
      id="fill-an-empty-address"
      title="Fill in the address only if it was empty"
      files={["examples/rules/customer-address.tsx"]}
      steps={[
        "With “Address” empty, select “Atlas Trading”. It fills in with “24 Olive Street”.",
        "Enter your own address and select “Horizon Distribution”. Your address stays.",
        "Click “Restore”. The demo returns to the empty baseline and applies a patch with the customer and the address “42 New Street”. The address from the patch stays.",
      ]}
    />
    <p>
      In a row, <code>before.row</code> is the row at the start of the operation. The product on
      each line fills in its description only if it was empty.
    </p>
    <Example
      id="fill-an-empty-description"
      title="Fill in a line description only if it was empty"
      files={["examples/rules/product-description.tsx"]}
      steps={[
        "On the first line, select “Screw”. The description fills in with “6 mm screw”.",
        "On the second line, which already says “Entered by hand”, select “Nut”. The description stays.",
      ]}
    />
    <p>
      Choose <code>onEdit</code> to keep the address written by the same command. If you also need
      to fill it in when another rule or a query writes the customer, use the <code>onChange</code>{" "}
      variant. If the address was empty at the start and the command writes the customer and address
      together, this variant replaces the address from the command.
    </p>
    <Snippet>{`customer: {
  onChange: ({ customer }, { before }) =>
    before.address === "" && customer !== null ? { address: customers[customer] } : undefined,
},`}</Snippet>

    <h2 id="multiple-writers-for-one-field">Multiple writers for one field</h2>
    <p>
      If two editable fields are calculated from each other, declare a bidirectional relation (see{" "}
      <Link to="relations">Relations</Link>) so the driver decides which value stays.
    </p>
    <ul>
      <li>
        If a formula and an event, or two events, write the same field in an edit, the last one
        declared in the order of the <code>rules</code> entries wins. A writer that returns{" "}
        <code>undefined</code> or a patch without that field does not compete.
      </li>
      <li>
        The command’s value is the starting point for the edited field. A formula or an{" "}
        <code>onChange</code> can still write to it. An <code>onEdit</code> does not replace it.
      </li>
      <li>
        If an event reads the current value of a field it also writes and closes a cycle, directly
        or through a chain, the operation is rejected. To fill in a field only if it was empty, read
        its value from <code>before</code>. A query patch can read the current values of its own
        targets (see{" "}
        <Link to="queries" section="patch">
          Queries
        </Link>
        ).
      </li>
    </ul>

    <h2 id="to-defaults-and-session-reset">toDefaults and session.reset()</h2>
    <p>
      <code>toDefaults</code> writes the default value and participates in propagation like any
      other write. <code>session.reset()</code> instead restores the session’s baseline without
      running value formulas or events (see{" "}
      <Link to="sessions" section="read-watch-edit-and-reset">
        Sessions
      </Link>
      ).
    </p>

    <h2 id="when-an-event-fails">When an event fails</h2>
    <p>
      If the handler throws or returns an invalid patch, the entire edit is rejected with an error
      that names the field and event, such as <code>Field "country" onChange: event failed: …</code>
      . The session keeps the previous snapshot.
    </p>
  </>
);
