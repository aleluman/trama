import type { ThemedToken } from "shiki";

// vite.config.mjs replaces the literal child with pre-highlighted tokens at build time.
export const Snippet = ({
  tokens,
  className = "",
  children,
}: {
  tokens?: ThemedToken[][] | undefined;
  lang?: "tsx" | "bash";
  className?: string;
  children?: string;
}) => (
  <pre className={`snippet ${className}`.trim()}>
    <code>
      {tokens === undefined
        ? children
        : tokens.map((line, lineIndex) => (
            // oxlint-disable-next-line no-array-index-key -- Lines of a static snippet.
            <span key={lineIndex}>
              {line.map((token) => (
                <span key={token.offset} style={token.htmlStyle}>
                  {token.content}
                </span>
              ))}
              {"\n"}
            </span>
          ))}
    </code>
  </pre>
);
