import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const file = new URL("../docs/technical.html", import.meta.url);

test("the HTML is self-contained and its navigation links and local documents exist", async () => {
  const dom = new JSDOM(await readFile(file, "utf8"));
  try {
    const document = dom.window.document;
    const ids = [...document.querySelectorAll("[id]")].map((node) => node.id);
    assert.equal(new Set(ids).size, ids.length, "There are duplicate IDs");
    assert.equal(document.querySelectorAll("script[src], link[rel=stylesheet], img").length, 0);
    assert.ok(document.querySelectorAll("svg").length > 0);
    const localFiles = [];
    for (const link of document.querySelectorAll("a[href]")) {
      const href = link.getAttribute("href");
      if (href.startsWith("#")) {
        assert.ok(ids.includes(href.slice(1)), `Missing target: ${href}`);
      } else if (!/^[a-z]+:/iu.test(href)) {
        localFiles.push(access(new URL(href, file)));
      }
    }
    await Promise.all(localFiles);
  } finally {
    dom.window.close();
  }
});

test("the mobile table of contents opens, navigates, and closes with Escape, and printing uses the browser", async () => {
  let prints = 0;
  const dom = new JSDOM(await readFile(file, "utf8"), {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    beforeParse(window) {
      window.matchMedia = () => ({ matches: true });
      window.print = () => {
        prints += 1;
      };
    },
  });
  try {
    const { document, KeyboardEvent } = dom.window;
    const toggle = document.querySelector("#toc-toggle");
    toggle.click();
    assert.equal(toggle.getAttribute("aria-expanded"), "true");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    assert.equal(document.activeElement, toggle);
    toggle.click();
    document.querySelector(".sidebar a").click();
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    document.querySelector("#print").click();
    assert.equal(prints, 1);
  } finally {
    dom.window.close();
  }
});
