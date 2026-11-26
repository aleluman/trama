import { Example } from "../lib/Example";
import { Link } from "../lib/router";
import { Snippet } from "../lib/Snippet";

export const Outputs = () => (
  <>
    <h1>Derived outputs</h1>
    <p className="lead">
      <code>outputs</code> declares values calculated from fields for display outside the form, such
      as totals, summaries, and text. Outputs are separate from fields. They cannot be edited, they
      are absent from <code>values</code>, and rules cannot read them.
    </p>

    <h2 id="declaring-outputs">Declare outputs</h2>
    <Snippet>{`outputs: ({ output }) => {
  const subtotal = output(({ quantity, price }) => (quantity ?? 0) * (price ?? 0));
  const discount = output(({ hasDiscount }, { read }) =>
    hasDiscount ? Math.round(read(subtotal) * 0.1) : 0,
  );
  const tax = output((_, { read }) => Math.round((read(subtotal) - read(discount)) * 0.2));
  const total = output((_, { read }) => read(subtotal) - read(discount) + read(tax));
  return { subtotal, discount, tax, total };
},`}</Snippet>
    <ul>
      <li>
        Each formula receives <code>(values, {"{ read }"})</code>. You can read fields in{" "}
        <code>values</code> and destructure them. <code>read(other)</code> reads another output from
        the same definition. Trama tracks dependencies automatically, including when you
        destructure. If the form declares a context, the formula also receives <code>context</code>,
        which does not count as a dependency (see{" "}
        <Link to="context" section="outputs">
          Context
        </Link>
        ).
      </li>
      <li>
        The returned object names the outputs. An output that is omitted can still serve as an
        intermediate step, but it cannot be read from outside and appears in diagnostics as{" "}
        <code>#N</code>, its declaration position. The types are inferred and can be read with{" "}
        <code>FormOutputs&lt;typeof definition&gt;</code>.
      </li>
      <li>
        A result can be a primitive, an array, or an object of plain data without cycles. Functions,{" "}
        <code>Date</code>, <code>Map</code>, <code>Set</code>, and class instances are rejected.
      </li>
      <li>
        Results are delivered as deeply frozen copies. Modifying an application object returned by a
        formula leaves the published result unchanged.
      </li>
      <li>
        An output recalculates only when something it read changes. A result with the same content
        as the previous result (deep equality) keeps the previous reference and does not trigger a
        notification.
      </li>
    </ul>
    <Example
      id="chained-outputs"
      title="Chained outputs"
      files={["examples/outputs/chained.tsx"]}
      steps={[
        "Change Quantity to 5. The summary shows a subtotal of 5000 JPY, a tax of 1000 JPY, and a total of 6000 JPY.",
        "Check “10% discount”. The discount takes 500 JPY off the subtotal, the tax drops to 900 JPY, and the total drops to 5400 JPY.",
        <>
          Look at the panel. <code>values</code> contains the three fields and no outputs.
        </>,
      ]}
    />

    <h2 id="use-outputs">useOutputs in React</h2>
    <p>
      <code>useOutputs(session)</code> returns an object you can destructure. It tracks which names
      the component reads during render and rerenders it only when one of them changes. Reading a
      property counts even if you never use it. Destructuring with <code>...rest</code> reads them
      all. Tracking applies to the entire output, regardless of which properties of its result are
      read.
    </p>
    <Example
      id="each-component-tracks-its-reads"
      title="Each component tracks what it reads"
      files={["examples/outputs/tracking.tsx"]}
      steps={[
        "Change A. Only the “Reads doubleA” count goes up.",
        "Change B. Only the “Reads doubleB” count goes up.",
      ]}
    />

    <h2 id="watch-outputs">watchOutputs without React</h2>
    <p>
      <code>session.watchOutputs(callback, {"{ onError }"})</code> calls the callback immediately
      and again whenever an output it read changes. It tracks reads during the synchronous part of
      the callback. It returns the unsubscribe function.
    </p>
    <Example
      id="watch"
      title="Notifications only when content changes"
      files={["examples/outputs/watch.tsx"]}
      steps={[
        "Change the weight from 2 to 3. The formula returns a new object with the same content, so no notification appears.",
        "Change the weight to 8. A notification appears with band “heavy”.",
        "Check “Express shipping”. Another notification appears.",
        "Enter a reference. No output reads it, so no notification appears.",
      ]}
    >
      <p>
        This example creates the session with <code>createSession</code> and watches it from an
        effect using the same calls as code outside React.
      </p>
    </Example>

    <h2 id="failures">Failures</h2>
    <ul>
      <li>
        If a formula throws, its output and any outputs that read it fail. The edit is accepted and
        the other outputs stay available.
      </li>
      <li>
        Reading a failed output throws <code>Output "name": calculation failed: …</code> with the
        original error in <code>cause</code>. The previous result is never delivered as if it were
        current.
      </li>
      <li>
        The output recovers on its own when something it reads changes. Observers stay subscribed
        and receive the new result.
      </li>
      <li>
        If the <code>watchOutputs</code> callback reads a failed output, the error goes to{" "}
        <code>onError</code>. Without <code>onError</code>, it is reported with{" "}
        <code>reportError</code>. In React, <code>OutputBoundary</code> shows a fallback while an
        output read by its children is failing and shows the children again when it recovers.
      </li>
    </ul>
    <Example
      id="boundary"
      title="OutputBoundary"
      files={["examples/outputs/boundary.tsx"]}
      steps={[
        "Enter 0 in “People”. The fallback appears and the panel shows the perPerson error.",
        "Change “Bill” while the output is failing. caption keeps updating and the form remains editable.",
        "Enter 4 in “People”. The boundary recovers on its own without a “Retry” button.",
      ]}
    >
      <p>
        <code>OutputBoundary</code> catches only output failures from its <code>session</code>. Any
        other error propagates to the application's error boundary.
      </p>
    </Example>
  </>
);
