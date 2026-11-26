import type { ReactNode } from "react";
import type { ThemedToken } from "shiki";
import { Snippet } from "../lib/Snippet";

// An entry of the API reference: its signature, then its explanation.
export const Entry = ({
  id,
  signature,
  tokens,
  children,
}: {
  id: string;
  signature: string;
  // Added by vite.config.mjs from the signature literal.
  tokens?: ThemedToken[][];
  children: ReactNode;
}) => (
  <section className="api-entry" id={id}>
    <Snippet tokens={tokens} className="signature">
      {signature}
    </Snippet>
    {children}
  </section>
);
