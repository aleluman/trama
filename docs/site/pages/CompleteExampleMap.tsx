import { Link } from "../lib/router";

// Where each behavior of the order editor lives, and the page of the guide that explains it.
export const OrderMap = () => (
  <div className="table-scroll">
    <table>
      <thead>
        <tr>
          <th>Behavior</th>
          <th>Code</th>
          <th>Guide</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Waiting for data before opening, with error and retry</td>
          <td>
            <code>useQuery</code> + <code>initialFromQuery</code> in <code>OrderEditor.tsx</code>
          </td>
          <td>
            <Link to="query">Loading with TanStack Query</Link>
          </td>
        </tr>
        <tr>
          <td>
            Adapting the server response to the fields, with the customer and contact as options
          </td>
          <td>
            <code>toOrderValues</code> in <code>api.ts</code>, used as <code>select</code>
          </td>
          <td>
            <Link to="query" section="after-opening">
              After opening
            </Link>
          </td>
        </tr>
        <tr>
          <td>Paginated server-side customer search and complete contact lists</td>
          <td>
            <code>endpoints.ts</code>, <code>forms.ts</code> and <code>field.async</code> in{" "}
            <code>order.ts</code>
          </td>
          <td>
            <Link to="remote-select" section="endpoints">
              Endpoints and registry
            </Link>
          </td>
        </tr>
        <tr>
          <td>Contact lists suspended without a customer</td>
          <td>
            <code>params</code> for <code>contact</code>
          </td>
          <td>
            <Link to="remote-select" section="parameters-and-suspension">
              Parameters and suspension
            </Link>
          </td>
        </tr>
        <tr>
          <td>List price when choosing a customer, with saved orders keeping their price</td>
          <td>
            <code>query</code> for <code>price</code> and <code>unitPrice</code> in{" "}
            <code>endpoints.ts</code>
          </td>
          <td>
            <Link to="queries" section="when-a-query-runs">
              When a query runs
            </Link>
          </td>
        </tr>
        <tr>
          <td>Default contact and suggested note</td>
          <td>
            <code>onChange</code> for <code>customer</code> and <code>placeholder</code> for{" "}
            <code>note</code>
          </td>
          <td>
            <Link to="remote-select" section="the-option-is-the-value">
              The option is the value
            </Link>
          </td>
        </tr>
        <tr>
          <td>Remote data per company, using the TanStack Query cache</td>
          <td>
            <code>scope</code> in <code>OrderEditor.tsx</code> and <code>queryLoader</code> in{" "}
            <code>form-ui.ts</code>
          </td>
          <td>
            <Link to="remote-select" section="loader">
              Scope and loader
            </Link>
          </td>
        </tr>
        <tr>
          <td>Calculated, editable total preserved on opening</td>
          <td>
            <code>value</code> for <code>total</code>
          </td>
          <td>
            <Link to="formulas" section="initial-values">
              Initial values
            </Link>
          </td>
        </tr>
        <tr>
          <td>City cleared or set to the capital</td>
          <td>
            <code>onChange</code> for <code>country</code>
          </td>
          <td>
            <Link to="events" section="dependent-field">
              A field that depends on another field
            </Link>
          </td>
        </tr>
        <tr>
          <td>Required customer</td>
          <td>
            <code>required</code> in <code>field.async</code> for <code>customer</code>
          </td>
          <td>
            <Link to="field-state" section="flags-and-reasons">
              Boolean state properties and reasons
            </Link>
          </td>
        </tr>
        <tr>
          <td>Address hidden for store pickup and city required for shipping</td>
          <td>
            <code>states</code> for <code>delivery</code>
          </td>
          <td>
            <Link to="field-state" section="patch">
              State patch
            </Link>
          </td>
        </tr>
        <tr>
          <td>“Municipality” in Spain and a suggested city</td>
          <td>
            <code>label</code> and <code>placeholder</code> for <code>city</code>
          </td>
          <td>
            <Link to="field-state" section="label-and-placeholder">
              Label and placeholder
            </Link>
          </td>
        </tr>
        <tr>
          <td>Note disabled for two reasons</td>
          <td>
            <code>disabled</code> for <code>note</code>
          </td>
          <td>
            <Link to="field-state" section="flags-and-reasons">
              Boolean state properties and reasons
            </Link>
          </td>
        </tr>
        <tr>
          <td>Confirmed order is read-only</td>
          <td>
            <code>form.readOnly</code>
          </td>
          <td>
            <Link to="field-state" section="form-lock">
              Form lock
            </Link>
          </td>
        </tr>
        <tr>
          <td>Mode, today's date, and currency for each open order</td>
          <td>
            <code>declareContext</code> in <code>order.ts</code> and <code>context</code> in{" "}
            <code>OrderEditor.tsx</code>
          </td>
          <td>
            <Link to="context" section="session-context">
              A session's context
            </Link>
          </td>
        </tr>
        <tr>
          <td>Each mode opens another session for the order</td>
          <td>
            <code>keyOf</code> and <code>ModePicker</code> in <code>OrderEditor.tsx</code>
          </td>
          <td>
            <Link to="context" section="customer-create-edit-and-view">
              Create, edit, and view
            </Link>
          </td>
        </tr>
        <tr>
          <td>Entire order read-only in view mode</td>
          <td>
            The second entry in <code>form.readOnly</code>
          </td>
          <td>
            <Link to="context" section="reading-context-in-rules">
              Reading context in rules
            </Link>
          </td>
        </tr>
        <tr>
          <td>Delivery date defaults to today</td>
          <td>
            <code>defaults</code>
          </td>
          <td>
            <Link to="context" section="defaults">
              Default values
            </Link>
          </td>
        </tr>
        <tr>
          <td>Summary with an isolated failure</td>
          <td>
            <code>outputs</code>, <code>useOutputs</code>, <code>OutputBoundary</code>
          </td>
          <td>
            <Link to="outputs" section="failures">
              Failures
            </Link>
          </td>
        </tr>
        <tr>
          <td>Totals in the currency from context</td>
          <td>
            <code>context.currency</code> in <code>outputs</code>
          </td>
          <td>
            <Link to="context" section="outputs">
              Derived outputs
            </Link>
          </td>
        </tr>
        <tr>
          <td>Two views of the same session</td>
          <td>
            Two <code>Field</code> components with the same <code>name</code> in{" "}
            <code>OrderForm</code>
          </td>
          <td>
            <Link to="react" section="field">
              Field
            </Link>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
);
