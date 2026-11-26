import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { coreSuites, declaredTypes, integralSuites, reactSuites } from "./package-suites.mjs";
import { emittedModules, reconsumedModules } from "./package-relations.mjs";

const run = promisify(execFile);
// A nested node --test inherits the runner's context: it reports failures to the
// parent runner and exits successfully. Installed suites run as top-level runs.
const testEnv = { ...process.env };
delete testEnv.NODE_TEST_CONTEXT;
const runTests = (file, cwd) => run(process.execPath, ["--test", file], { cwd, env: testEnv });
const pnpm = process.env.npm_execpath ?? "pnpm";
// The local store when it has the package, the registry otherwise, as on a fresh CI runner.
const install = ["--prefer-offline", "--ignore-scripts"];
const root = fileURLToPath(new URL("../", import.meta.url));
const artifacts = path.join(root, ".artifacts/package-check");
let consumer;
const installed = (...parts) => path.join(consumer, "node_modules/trama-forms", ...parts);
let manifest;

before(async () => {
  await rm(artifacts, { recursive: true, force: true });
  await mkdir(artifacts, { recursive: true });
  // prepack rebuilds dist. Isolate that real build so parallel applications never
  // lose the entry points they are importing from the working package.
  const staging = path.join(artifacts, "source");
  await mkdir(staging);
  await Promise.all(
    [
      "src",
      "scripts",
      "package.json",
      "tsconfig.json",
      "tsconfig.build.json",
      "README.md",
      "LICENSE",
    ].map((file) => cp(path.join(root, file), path.join(staging, file), { recursive: true })),
  );
  await symlink(path.join(root, "node_modules"), path.join(staging, "node_modules"), "dir");
  const packed = await run(pnpm, ["pack", "--json", "--pack-destination", artifacts], {
    cwd: staging,
  });
  manifest = JSON.parse(packed.stdout);
  consumer = await mkdtemp(path.join(tmpdir(), "trama-consumer-"));
  await writeFile(
    path.join(consumer, "package.json"),
    JSON.stringify({ private: true, type: "module", packageManager: "pnpm@12.4.2" }),
  );
  await run(pnpm, ["add", manifest.filename, ...install], { cwd: consumer });
});

after(async () => {
  if (consumer) await rm(consumer, { recursive: true, force: true });
});

test("the package distributes dist and declarations without sources or tools", async () => {
  const files = manifest.files.map(({ path: name }) => name);
  for (const entry of ["core", "react"]) {
    assert.ok(files.includes(`dist/${entry}/index.js`));
    assert.ok(files.includes(`dist/${entry}/index.d.ts`));
  }
  assert.ok(files.includes("LICENSE"));
  assert.ok(
    files.every(
      (name) => name.startsWith("dist/") || ["package.json", "README.md", "LICENSE"].includes(name),
    ),
  );
  const pkg = JSON.parse(await readFile(installed("package.json"), "utf8"));
  assert.deepEqual(pkg.dependencies ?? {}, {});
  assert.deepEqual(pkg.optionalDependencies ?? {}, {});
  assert.deepEqual(Object.keys(pkg.peerDependencies), ["react"]);
  assert.equal(pkg.peerDependenciesMeta.react.optional, true);
});

test("the isolated application runs core without React and rejects internal imports", async () => {
  await writeFile(
    path.join(consumer, "probe.mjs"),
    `
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
assert.throws(() => require.resolve("react"), { code: "MODULE_NOT_FOUND" });
const { defineForm, field, createSession } = await import("trama-forms/core");
const form = defineForm({
  fields: { title: field.text(), amount: field.number(), total: field.number() },
  rules: { total: { value: ({ amount }) => (amount ?? 0) * 10 } },
});
const session = createSession(form, { initial: { title: "Installed" } });
session.edit("amount", 5);
assert.deepEqual(session.getSnapshot().values, { title: "Installed", amount: 5, total: 50 });
session.edit("total", 25);
assert.equal(session.getSnapshot().values.total, 25);
session.reset();
assert.equal(session.getSnapshot().values.amount, null);
assert.equal(session.getSnapshot().values.total, 0);
await assert.rejects(import("trama-forms/src/core/index.js"), { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" });
`,
  );
  await run(process.execPath, ["probe.mjs"], { cwd: consumer });
});

test("the application using the installed package runs the full example definition without React", async () => {
  await cp(path.join(root, "docs/site"), path.join(consumer, "docs/site"), { recursive: true });
  await mkdir(path.join(consumer, "tests"));
  await copyToConsumer("tests/helpers");
  // Both suites import the example from docs/site, next to them.
  await Promise.all(
    integralSuites.map(async (file) => {
      await copyToConsumer(`tests/${file}`);
      await runTests(`tests/${file}`, consumer);
    }),
  );
});

test("the packaged binding uses the Compiler runtime included in React 19", async () => {
  // The members of a binding are built in binding.js.
  const entry = await readFile(installed("dist/react/binding.js"), "utf8");
  assert.ok(
    /from ["']react\/compiler-runtime["']/u.test(entry),
    "The package must include the compiled binding, including for applications without Compiler",
  );
});

test("the application using the installed package exercises values, state contributions, and rejections through core", async () => {
  await cp(path.join(root, "tests/helpers"), path.join(consumer, "helpers"), { recursive: true });
  await Promise.all(
    coreSuites.map(async (file) => {
      await cp(path.join(root, "tests", file), path.join(consumer, file));
      await runTests(file, consumer);
    }),
  );
});

test("the application uses react and its declarations without installing TanStack Query", async () => {
  const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  await run(
    pnpm,
    [
      "add",
      ...["react", "@types/react"].map((name) => `${name}@${pkg.devDependencies[name]}`),
      ...install,
    ],
    { cwd: consumer },
  );
  await writeModules(emittedModules);
  const compiler = path.join(root, "node_modules/typescript/bin/tsc");
  await compileIndependent(compiler);

  await run(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      'import { createReactBinding } from "trama-forms/react"; createReactBinding({ text: () => null });',
    ],
    { cwd: consumer },
  );
});

test("the application checks inference, JSX, and expected type errors with TanStack Query v5.96.0", async () => {
  const compiler = path.join(root, "node_modules/typescript/bin/tsc");
  await run(pnpm, ["add", "@tanstack/react-query@5.96.0", ...install], {
    cwd: consumer,
  });
  await copyToConsumer("tests/consumer");
  await copyToConsumer("tests/integral-types.tsx");
  await run(process.execPath, [compiler, "-p", "tests/consumer/tsconfig.json"], { cwd: consumer });
  await Promise.all(
    manifest.files
      .filter((item) => item.path.startsWith("dist/"))
      .map(async (file) => {
        const source = await readFile(installed(file.path), "utf8");
        assert.doesNotMatch(source, /@tanstack/u);
        if (file.path.startsWith("dist/core/")) assert.doesNotMatch(source, /from ["']react/u);
      }),
  );
});

test("the installed binding verifies state and readiness with React, real TanStack Query, and a scripted source", async () => {
  const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  await run(
    pnpm,
    [
      "add",
      ...["react-dom", "jsdom"].map((name) => `${name}@${pkg.devDependencies[name]}`),
      ...install,
    ],
    { cwd: consumer },
  );
  await cp(path.join(root, "tests/helpers"), path.join(consumer, "helpers"), { recursive: true });
  await Promise.all(
    reactSuites.map(async (file) => {
      await cp(path.join(root, "tests", file), path.join(consumer, file));
      await runTests(file, consumer);
    }),
  );
  await copyToConsumer("tests/helpers");
  await copyToConsumer("tests/integral-react.test.mjs");
  await runTests("tests/integral-react.test.mjs", consumer);
});

test("builds the guide from the tarball, with relative assets for Pages and its version", async () => {
  await cp(path.join(root, "tsconfig.json"), path.join(consumer, "tsconfig.json"));
  await run(
    process.execPath,
    [
      path.join(root, "node_modules/vite/bin/vite.js"),
      "build",
      path.join(consumer, "docs/site"),
      "--config",
      path.join(root, "vite.config.mjs"),
      "--outDir",
      path.join(artifacts, "site"),
      "--emptyOutDir",
    ],
    { cwd: consumer },
  );
  const html = await readFile(path.join(artifacts, "site/index.html"), "utf8");
  assert.doesNotMatch(html, /(?:src|href)="(?!\.\/assets\/)/u);
  const [, script] = /<script type="module"[^>]* src="([^"]+)"/u.exec(html);
  const bundle = await readFile(path.join(artifacts, "site", script), "utf8");
  assert.ok(bundle.includes(`guide · ${manifest.version}`));
});

test("prepares a native browser check from the same installed artifact", async () => {
  const browser = path.join(artifacts, "browser");
  await mkdir(browser, { recursive: true });
  await cp(installed("dist"), path.join(browser, "dist"), {
    recursive: true,
  });
  await cp(path.join(root, "tests/consumer/browser.html"), path.join(browser, "index.html"));
  assert.equal(
    await readFile(path.join(browser, "dist/core/index.js"), "utf8"),
    await readFile(installed("dist/core/index.js"), "utf8"),
  );
});

// Runs the compiler in the application in strict mode for NodeNext and ES2022.
const tsc = (compiler, ...args) =>
  run(
    process.execPath,
    [
      compiler,
      "--strict",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "--target",
      "ES2022",
      ...args,
    ],
    { cwd: consumer },
  );

async function compileIndependent(compiler) {
  // Emitting declarations requires every exported type to be named from the package.
  const files = Object.keys(emittedModules);
  await tsc(
    compiler,
    "--declaration",
    "--emitDeclarationOnly",
    "--outDir",
    "declarations",
    ...files,
  );
  const emitted = files.map((name) =>
    readFile(path.join(consumer, `declarations/${name.replace(/\.ts$/u, ".d.ts")}`), "utf8"),
  );
  const declarations = (await Promise.all(emitted)).join("\n");
  for (const [entry, names] of Object.entries(declaredTypes))
    for (const name of names)
      assert.match(declarations, new RegExp(`import\\("${entry}"\\)\\.${name}\\b`, "u"));
  assert.doesNotMatch(declarations, /trama\/dist/u);
  assert.ok(!declarations.includes(consumer), "No machine-specific paths");
  // A rule set carries what its rules derive, not the rules as written.
  const titles = declarations.slice(declarations.indexOf("export declare const titles"));
  assert.doesNotMatch(titles.slice(0, titles.indexOf(";\n")), /=>/u);
  // Modules that compose again the sets, and render with the binding, from the
  // declarations emitted for them.
  await writeModules(reconsumedModules);
  await tsc(compiler, "--noEmit", "--jsx", "react-jsx", ...Object.keys(reconsumedModules));
}
// Writes each application module under its file name.
function writeModules(modules) {
  return Promise.all(
    Object.entries(modules).map(([name, text]) => writeFile(path.join(consumer, name), text)),
  );
}

// Copies a repository path to the same path in the application.
function copyToConsumer(name) {
  return cp(path.join(root, name), path.join(consumer, name), { recursive: true });
}
