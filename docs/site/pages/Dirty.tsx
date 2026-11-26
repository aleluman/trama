import { Example } from "../lib/Example";
import { Link } from "../lib/router";
import { Snippet } from "../lib/Snippet";

export const Dirty = () => (
  <>
    <h1>Changes</h1>
    <p className="lead">
      Every field, row, collection, and the form publish <code>dirty</code> to indicate whether they
      differ from the values the session opened with or the values from the last committed save.
      Opening with saved data leaves the state clean, and returning to the baseline value clears the
      dirty state.
    </p>
    <Snippet>{`const { fieldStates, form } = session.getSnapshot();
fieldStates.note.dirty;           // the field
fieldStates.lines[0].price.dirty; // a cell
session.row("lines", key).getSnapshot()?.dirty; // the row
form.collections.lines.dirty;     // the collection
form.dirty;                       // the form`}</Snippet>

    <h2 id="how-values-are-compared">How values are compared</h2>
    <ul>
      <li>
        Trama compares against the baseline, which starts as the opening values, including values
        from formulas and defaults. A formula that changes a value after opening also makes it
        dirty.
      </li>
      <li>
        Each field type has its own comparison. A remote select compares by <code>value</code>, and
        a multi-select compares by its members in any order.
      </li>
      <li>A new row and its cells are dirty. A saved row is dirty only if a value changed.</li>
      <li>
        A collection is dirty if any row is dirty or if its row order or membership changed. Moving
        a row makes the collection dirty and leaves the row's dirty state unchanged.
      </li>
      <li>The form is dirty if a header field or a collection is dirty.</li>
      <li>
        <code>reset</code> restores the baseline, leaving everything clean. A query that writes a
        value after opening also makes it dirty.
      </li>
      <li>
        After <code>commit</code>, the committed values are the baseline. The saved values are
        clean, and the values the person edited while saving stay dirty. See{" "}
        <Link to="submission" section="commit">
          Submission
        </Link>
        .
      </li>
    </ul>
    <Example
      id="saved-document"
      title="A saved document"
      files={["examples/dirty/document.ts"]}
      steps={[
        "On opening with saved data, nothing is dirty.",
        <>
          Editing the note makes <code>note</code> and the form dirty and leaves the collection
          clean.
        </>,
        "Restoring the note and writing the tags in a different order leaves everything clean.",
        <>
          Moving a line makes the collection and the form dirty and leaves the rows clean. A new
          line is dirty.
        </>,
        "After reset, nothing is dirty.",
      ]}
    />
  </>
);
