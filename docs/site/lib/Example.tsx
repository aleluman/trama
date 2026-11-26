import { Component, useState, type ComponentType, type ReactNode } from "react";
import type { ThemedToken } from "shiki";
import { format, messageOf } from "./format";
import { usePage } from "./router";

type Log = (label: string, value: unknown) => void;
type ExampleModule = { Demo?: ComponentType; run?: (log: Log) => void };

// Paths are relative to docs/site. The code shown is the file that runs the demo.
const byPath = <T,>(entries: Record<string, T>) =>
  Object.fromEntries(
    Object.entries(entries).map(([key, value]) => [
      key.startsWith("./") ? `lib/${key.slice(2)}` : key.slice(3),
      value,
    ]),
  );
const sources = byPath(
  import.meta.glob<ThemedToken[][]>(
    [
      "../examples/**/*.{ts,tsx}",
      "../ui/*.{ts,tsx}",
      "../forms.ts",
      "./SessionState.tsx",
      "./query.ts",
    ],
    { query: "?highlight", import: "default", eager: true },
  ),
);
const modules = byPath(
  import.meta.glob<ExampleModule>("../examples/**/*.{ts,tsx}", { eager: true }),
);

const noSteps: readonly ReactNode[] = [];

export const Example = ({
  id,
  title,
  files,
  steps = noSteps,
  wide = false,
  children,
}: {
  id: string;
  title: string;
  // The first file provides the demo: an exported Demo component or run(log).
  files: readonly [string, ...string[]];
  steps?: readonly ReactNode[];
  wide?: boolean;
  children?: ReactNode;
}) => {
  const example = modules[files[0]];
  const page = usePage();
  const hasDemo = example?.Demo !== undefined || example?.run !== undefined;
  const layout = hasDemo ? (wide ? "wide" : "side") : "code-only";
  return (
    <section className="example" id={id} aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>
        <a href={`#/${page}/${id}`}>{title}</a>
      </h3>
      {children}
      <div className={`example-grid ${layout}`}>
        <CodePanel files={files} />
        {example !== undefined && hasDemo && <DemoPanel example={example} steps={steps} />}
      </div>
    </section>
  );
};

const DemoPanel = ({ example, steps }: { example: ExampleModule; steps: readonly ReactNode[] }) => {
  const [attempt, setAttempt] = useState(0);
  const { Demo, run } = example;
  return (
    <div className="demo-panel">
      <div className="panel-bar">
        <span>{run === undefined ? "Demo" : "Output of run()"}</span>
        <button type="button" className="quiet" onClick={() => setAttempt(attempt + 1)}>
          Restart
        </button>
      </div>
      <div className="demo-body">
        <DemoBoundary key={attempt}>
          {Demo === undefined ? run !== undefined && <LogPanel run={run} /> : <Demo />}
        </DemoBoundary>
      </div>
      {steps.length > 0 && (
        <div className="steps">
          <p>Try it</p>
          <ol>
            {steps.map((step, index) => (
              // oxlint-disable-next-line no-array-index-key -- Steps are static prose in authoring order.
              <li key={index}>{step}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
};

const CodePanel = ({ files }: { files: readonly string[] }) => {
  const [active, setActive] = useState(files[0] ?? "");
  const tokens = sources[active] ?? [];
  const text = tokens.map((line) => line.map((token) => token.content).join("")).join("\n");
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className="code-panel">
      <div className="panel-bar">
        {files.length > 1 ? (
          <div role="tablist" aria-label="Example files" className="tabs">
            {files.map((file) => (
              <button
                key={file}
                type="button"
                role="tab"
                aria-selected={file === active}
                onClick={() => setActive(file)}
              >
                {file.split("/").at(-1)}
              </button>
            ))}
          </div>
        ) : (
          <span className="code-path">{active.split("/").at(-1)}</span>
        )}
        <button type="button" className="quiet" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="code-path full">docs/site/{active}</p>
      <Source file={active} tokens={tokens} />
    </div>
  );
};

const Source = ({ file, tokens }: { file: string; tokens: ThemedToken[][] }) => (
  // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users must be able to scroll the source.
  <pre tabIndex={0} aria-label={`Code for ${file}`}>
    <code>
      {tokens.map((line, lineIndex) => (
        // oxlint-disable-next-line no-array-index-key -- Lines of a static source file.
        <span key={lineIndex} className="line">
          <span className="code">
            {line.map((token) => (
              <span key={token.offset} style={token.htmlStyle}>
                {token.content}
              </span>
            ))}
            {"\n"}
          </span>
        </span>
      ))}
    </code>
  </pre>
);

const LogPanel = ({ run }: { run: (log: Log) => void }) => {
  const [lines] = useState(() => {
    const written: { id: number; label: string; text: string }[] = [];
    const log: Log = (label, value) => {
      written.push({
        id: written.length,
        label,
        text: typeof value === "string" ? value : format(value),
      });
    };
    try {
      run(log);
    } catch (error) {
      log("run() threw", error);
    }
    return written;
  });
  return (
    <ol className="log">
      {lines.map(({ id, label, text }) => (
        <li key={id}>
          <span className="log-label">{label}</span>
          <code className={text.startsWith("Error:") ? "failed" : undefined}>{text}</code>
        </li>
      ))}
    </ol>
  );
};

// Keeps a failing demo from taking down the rest of the page.
class DemoBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  override state: { error: unknown } = { error: undefined };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  override render() {
    if (this.state.error === undefined) return this.props.children;
    return (
      <p role="alert" className="error">
        The demo failed: {messageOf(this.state.error)}. Use “Restart”.
      </p>
    );
  }
}
