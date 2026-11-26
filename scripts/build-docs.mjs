import { readFile, writeFile } from "node:fs/promises";

const source = new URL("../docs/technical/", import.meta.url);
const output = new URL("../docs/technical.html", import.meta.url);
const read = (name) => readFile(new URL(name, source), "utf8");
const [template, content, styles, reader] = await Promise.all(
  ["template.html", "content.html", "styles.css", "reader.js"].map((name) => read(name)),
);

const figures = await Promise.all(
  [...content.matchAll(/<!-- figure: ([a-z-]+\.svg) -->/gu)].map(async (match) => [
    match[0],
    (await read(`figures/${match[1]}`)).trim(),
  ]),
);
let body = content;
for (const [placeholder, svg] of figures) {
  body = body.replace(placeholder, svg);
}

const chapters = [...body.matchAll(/<section class="chapter" id="([a-z-]+)"><h2>(.*?)<\/h2>/gu)];
if (chapters.length === 0) throw new Error("The document contains no chapters.");
const toc = chapters.map(([, id, title]) => `<a href="#${id}">${title}</a>`).join("\n");
const slots = { styles, toc, body, reader };
const html = template.replaceAll(/\{\{(styles|toc|body|reader)\}\}/gu, (_, key) => slots[key]);
if (/<!-- figure:|\{\{(?:styles|toc|body|reader)\}\}/u.test(html)) {
  throw new Error("The document still has unresolved resources.");
}

if (process.argv.includes("--check")) {
  if ((await readFile(output, "utf8")) !== html) {
    throw new Error("HTML is out of date. Run pnpm run docs:build.");
  }
  console.log("The document is reproducible and up to date.");
} else {
  await writeFile(output, html);
  console.log("Generated docs/technical.html.");
}
