import { execFileSync } from "node:child_process";
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { transformSync } from "oxc-transform-react";

const root = fileURLToPath(new URL("../", import.meta.url));
await rm(path.join(root, "dist"), { recursive: true, force: true });
execFileSync(
  process.execPath,
  [path.join(root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.build.json"],
  {
    cwd: root,
    stdio: "inherit",
  },
);

// Compiler must see original source, before TypeScript or JSX lowering.
// TypeScript's core JavaScript and all declarations remain unchanged.
const source = path.join(root, "src/react");
const files = (await readdir(source, { recursive: true })).filter(
  (file) => /\.tsx?$/u.test(file) && !file.endsWith(".d.ts"),
);
const outputs = await Promise.all(
  files.map(async (file) => {
    const filename = path.join(source, file);
    const result = transformSync(filename, await readFile(filename, "utf8"), {
      reactCompiler: { target: "19" },
      jsx: { runtime: "automatic" },
    });
    for (const diagnostic of result.errors) {
      console.warn(`${filename}: ${diagnostic.message}\n${diagnostic.codeframe ?? ""}`);
    }
    if (result.fatal) throw new Error(`React Compiler failed: ${filename}`);
    return { file, code: result.code };
  }),
);
await Promise.all(
  outputs.map(({ file, code }) =>
    writeFile(path.join(root, "dist/react", file.replace(/\.tsx?$/u, ".js")), code),
  ),
);
