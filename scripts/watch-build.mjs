import { execFileSync } from "node:child_process";
import { watch } from "node:fs";
import { fileURLToPath } from "node:url";

const build = fileURLToPath(new URL("./build.mjs", import.meta.url));
let pending;

const rebuild = () => {
  try {
    execFileSync(process.execPath, [build], { stdio: "inherit" });
    console.log("Build complete. Waiting for changes…");
  } catch {
    console.error("Build failed. Waiting for the next edit…");
  }
};

const schedule = () => {
  clearTimeout(pending);
  pending = setTimeout(rebuild, 100);
};

watch(new URL("../src/", import.meta.url), { recursive: true }, schedule);
watch(new URL("./", import.meta.url), (_, file) => {
  if (file === "build.mjs") schedule();
});
watch(new URL("../", import.meta.url), (_, file) => {
  if (file === "tsconfig.json" || file === "tsconfig.build.json") schedule();
});
rebuild();
