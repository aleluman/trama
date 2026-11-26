import { Example } from "../lib/Example";
import { OrderMap } from "./CompleteExampleMap";

export const CompleteExample = () => (
  <>
    <h1>Complete example</h1>
    <p className="lead">
      An order editor brings together the pieces of the guide. It loads with TanStack Query, looks
      up a customer on the server and lists their contacts, queries the list price when you choose a
      customer, calculates an editable total, links the city to the country and the address to the
      delivery method, and disables the note for two reasons while suggesting the customer's
      delivery hint. It also shows a lock on confirmation, context with the mode, today's date, and
      the currency, derived outputs with an isolated failure, and two views of the same session.
    </p>
    <Example
      id="order-editor"
      title="Order editor"
      files={[
        "examples/complete/OrderEditor.tsx",
        "examples/complete/order.ts",
        "examples/complete/endpoints.ts",
        "examples/complete/api.ts",
        "forms.ts",
        "ui/form-ui.ts",
      ]}
      wide
      steps={[
        <>
          “New order” opens in create mode with the default values. The summary shows a net amount
          of 10,000 JPY (2 × 5,000), a tax of 2,000 JPY, and a total of 12,000 JPY. “Delivery date”
          suggests today, the date shown on the context line. “Customer” is required, and the
          “Contact” list is suspended until you choose a customer.
        </>,
        <>
          The summary shows <code>5000.00 JPY per unit</code>, with two decimal places for the
          average price. Open “Session state” and the <code>caption</code> output reads{" "}
          <code>Total: 12000 JPY</code>.
        </>,
        "Choose “Atlas Trading” in “Customer”. The contact changes to Bruno. A second and a half later, the list price of 1,100 arrives and the net total changes to 2,200. In “Session state”, snapshot.queries.price goes from pending to idle.",
        "Choose “Prisma Trading” and enter a different price within a second and a half. The query goes idle when you enter it, and Prisma’s price leaves yours intact.",
        <>
          Open order 1001. It opens with its customer, “Atlas Trading”, its contact, Bruno, and its
          saved price of 2,500, without querying. It keeps its negotiated total of 9,500, which
          differs from 4 × 2,500. Change the quantity and the total recalculates. Its saved delivery
          date, 2026-10-15, takes precedence over the date suggested by the default values.
        </>,
        "Choose “Prisma Trading” in “Customer”. The contact changes to Camila, its default contact, and the price changes to its list price of 1,200, which recalculates the total. Clear the note and it suggests “Call on arrival”, the customer's delivery hint.",
        "Click “Reset”. The saved customer, price, and total return without querying. As on opening, the price came from the saved data.",
        "Change the quantity in the quick view. The main form and the summary change together.",
        "Clear the quantity. The price per unit shows its fallback and the rest of the summary keeps working.",
        "In Spain, the field is called “Municipality” and suggests “E.g., Madrid”. Check “Use the capital when changing countries” and choose Mexico. The field goes back to “City” and takes the value “Mexico City”.",
        "Choose “Store pickup”. The country, city, and capital setting disappear, and their values remain in the session state. Go back to “Shipping”. The city reappears and is required.",
        "Check “Order confirmed”. Every field except the confirmation becomes read-only with “Order confirmed”, and the note is also disabled. Uncheck it to restore the state.",
        "Open order 1002. It is confirmed, so it opens locked. It has no saved delivery date, so it suggests today. “Reset” returns it to the state at opening.",
        "Return to 1001 within 30 seconds of its last load. It opens immediately with fresh data from the cache.",
        "Change the quantity on 1001, then click “View” under “Saved order mode”. Another session opens for the same order, with the saved data and without your change. The context line shows view mode, and all fields, including “Order confirmed”, become read-only with “Read-only”.",
        "Open 1002 in “View”. Its fields show “Order confirmed · Read-only”, and the confirmation shows only “Read-only”.",
        "Click “Edit”. Order 1002 reopens in edit mode. Its fields show only “Order confirmed”, and you can uncheck the confirmation.",
        "Click “View” and then “New order”. A new order always opens in create mode, editable, and “Delivery date” suggests today.",
        "Click “Fail the next load” and open another order. The error appears. Click “Retry”.",
      ]}
    >
      <p>
        <code>order.ts</code> is the complete definition. The repository's tests import it and also
        verify its behavior through the installed package.
      </p>
    </Example>

    <h2 id="where-to-find-each-part">Where to find each part</h2>
    <OrderMap />
  </>
);
