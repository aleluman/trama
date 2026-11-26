import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { readFile } from "node:fs/promises";
import { codeToTokens } from "shiki";

const highlightSource = {
  name: "guide-source-highlighting",
  enforce: "pre",
  async load(id) {
    const [file, query] = id.split("?");
    if (query !== "highlight") return null;
    this.addWatchFile(file);
    const { tokens } = await codeToTokens(await readFile(file, "utf8"), {
      lang: file.endsWith(".tsx") ? "tsx" : "typescript",
      themes: { light: "github-light", dark: "github-dark" },
      defaultColor: "light-dark()",
    });
    return `export default ${JSON.stringify(tokens)}`;
  },
};

const literal = /(`(?:[^`\\$]|\\.)*`|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/u.source;
// <Snippet lang?>{literal}</Snippet> and <Entry signature={literal}> gain pre-highlighted tokens.
const snippetPattern = new RegExp(
  String.raw`<Snippet(?: lang="(tsx|bash)")?>\s*\{${literal}\}\s*</Snippet>|(\bsignature=\{${literal}\})`,
  "gu",
);

const tokensOf = async (source, lang) =>
  JSON.stringify(
    (
      await codeToTokens(new Function(`return ${source}`)(), {
        lang,
        themes: { light: "github-light", dark: "github-dark" },
        defaultColor: "light-dark()",
      })
    ).tokens,
  );

const highlightSnippets = {
  name: "guide-snippet-highlighting",
  enforce: "pre",
  async transform(code, id) {
    if (!/\/pages\/[^/?]+\.tsx$/u.test(id)) return null;
    const matches = [...code.matchAll(snippetPattern)];
    if (matches.length === 0) return null;
    const replacements = await Promise.all(
      matches.map(async (match) => {
        if (match[3] !== undefined)
          return `${match[3]} tokens={${await tokensOf(match[4], "tsx")}}`;
        const lang = match[1] ?? "tsx";
        return `<Snippet lang="${lang}" tokens={${await tokensOf(match[2], lang)}} />`;
      }),
    );
    let index = 0;
    return { code: code.replace(snippetPattern, () => replacements[index++]), map: null };
  },
};

// The guide shows the version of the package it documents.
const { version } = JSON.parse(await readFile(new URL("package.json", import.meta.url), "utf8"));

export default defineConfig({
  root: "docs/site",
  // Relative asset paths, so the same build works at the root and under the GitHub Pages subpath.
  base: "./",
  define: { "import.meta.env.TRAMA_VERSION": JSON.stringify(version) },
  plugins: [
    highlightSource,
    highlightSnippets,
    react({
      compiler: { target: "19", logDiagnostics: true },
      // The package in dist is already compiled by scripts/build.mjs.
      include: /\/docs\/site\/.*\.[jt]sx?$/u,
    }),
  ],
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
  preview: { host: "127.0.0.1", port: 4173, strictPort: true },
  build: {
    outDir: "../../.artifacts/site",
    emptyOutDir: true,
    // Preserve native light-dark() so the explicit theme can override the system preference.
    cssTarget: "esnext",
  },
});
