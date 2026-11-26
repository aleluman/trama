import { Example } from "../lib/Example";
import { Link } from "../lib/router";

// The sections of “Fields” on dates and multi-select.
export const DateAndMultiple = () => (
  <>
    <h2 id="civil-date">Civil date</h2>
    <ul>
      <li>
        <code>field.date()</code> stores a calendar date without a time or time zone as text, such
        as <code>"2026-10-22"</code>, or <code>null</code>. It is independent of the viewer's time
        zone.
      </li>
      <li>
        It accepts years from 0001 to 9999 and a day that exists in its month, including leap days.
        It accepts <code>"2028-02-29"</code> and rejects <code>"2026-02-30"</code>. Trama does no
        normalization. It rejects <code>"2026-2-1"</code>, a date with a time, or a{" "}
        <code>Date</code> with <code>expected a civil date YYYY-MM-DD between 0001 and 9999</code>.
      </li>
      <li>
        It has a <code>placeholder</code>, like text and number fields, and a minimum and maximum,
        which can come from another date (see{" "}
        <Link to="decimals-and-limits" section="date-limits">
          Date limits
        </Link>
        ). A date that depends on the day, like today's date, comes from context through{" "}
        <code>defaults</code> (see{" "}
        <Link to="context" section="defaults">
          Default values
        </Link>
        ).
      </li>
      <li>
        The renderer determines the format the person sees. This guide uses the browser's date
        control. It writes <code>null</code> while the date is incomplete and shows the placeholder
        below the control because the control itself displays none.
      </li>
    </ul>
    <Example
      id="period-with-today"
      title="A period that defaults to today"
      files={["examples/fields/date.tsx", "ui/date-input.tsx"]}
      steps={[
        <>
          “From” starts at <code>null</code> and shows its placeholder, “No limit”. “To” opens with
          today's date, which <code>defaults</code> gets from context.
        </>,
        <>
          Click “Remove” in “To”. <code>to</code> becomes <code>null</code>, and “No limit” appears.
          The value does not become <code>""</code>.
        </>,
        <>
          In “From”, choose February 29, 2028, in a leap year. <code>from</code> becomes{" "}
          <code>"2028-02-29"</code>.
        </>,
        <>
          Click the day in “From” and delete it. The date becomes incomplete, <code>from</code>{" "}
          returns to <code>null</code>, and “No limit” reappears, although the control keeps the
          month and year.
        </>,
      ]}
    />

    <h2 id="multiple">Multi-select</h2>
    <ul>
      <li>
        <code>field.multiSelect({"{ options }"})</code> stores the <code>value</code> entries of the
        selected options in a frozen array with no duplicates that starts at <code>[]</code>. Its
        options work like those of <code>select</code>, and neither has a placeholder.
      </li>
      <li>
        The value is a set. Writing the same option values in a different order leaves the field
        unchanged. It keeps its array and its <code>onChange</code> does not run.
      </li>
      <li>
        A <code>default</code>, a formula, an event, or <code>edit</code> writes an array literal
        without <code>as const</code>, such as <code>["sale"]</code>, and TypeScript checks its
        values against the options. Runtime validation rejects unrecognized or duplicate values and
        anything other than a plain array.
      </li>
    </ul>
    <Example
      id="report-document-types"
      title="The document types in a report"
      files={["examples/fields/multiple.tsx", "ui/multi-select.tsx"]}
      steps={[
        <>
          “Document types” opens with “Sale” checked. <code>kinds</code> is <code>["sale"]</code>,
          an array containing only option values.
        </>,
        <>
          Check “Return” and then “Quote”. <code>kinds</code> becomes{" "}
          <code>["sale", "quote", "return"]</code>. The renderer writes in option order, so checking
          them in a different order gives the same array.
        </>,
        <>
          Enter 3 in “Page” and check “All types”. The formula writes{" "}
          <code>["return", "quote", "sale"]</code>, the same set in a different order.{" "}
          <code>kinds</code> stays the same, its event does not run, and the page stays at 3. The
          types become read-only.
        </>,
        <>
          Uncheck “All types” and then “Quote”. <code>kinds</code> becomes{" "}
          <code>["sale", "return"]</code> and the page returns to 1.
        </>,
      ]}
    />
  </>
);
