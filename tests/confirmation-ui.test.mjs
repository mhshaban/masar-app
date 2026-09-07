import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { confirmDialog } from "../src/modules/shared/ui-states.js";

test("confirmation awaits approval, defaults to cancel, and rejects simultaneous requests", async () => {
  const previousDocument = globalThis.document;
  let current, focused = false;
  class Element {
    listeners = {};
    children = {};
    open = false;
    setAttribute() {}
    querySelector(key) { return this.children[key] ||= new Element(); }
    addEventListener(name, fn) { this.listeners[name] = fn; }
    showModal() { this.open = true; }
    close() { this.open = false; this.listeners.close?.(); }
    remove() {}
  }
  globalThis.document = {
    activeElement: { isConnected: true, focus() { focused = true; } },
    body: { appendChild(node) { current = node; } },
    createElement() { return new Element(); },
  };
  try {
    let resolved = false;
    const pending = confirmDialog("<img src=x>").then(value => { resolved = true; return value; });
    await Promise.resolve();
    assert.equal(resolved, false);
    assert.equal(current.querySelector("p").textContent, "<img src=x>");
    assert.equal(await confirmDialog("second action"), false);
    current.querySelector("[data-cancel]").listeners.click();
    assert.equal(await pending, false);
    assert.equal(focused, true);
    const approved = confirmDialog("delete");
    current.querySelector("[data-approve]").listeners.click();
    assert.equal(await approved, true);
    const escaped = confirmDialog("delete");
    current.listeners.cancel({ preventDefault() {} });
    assert.equal(await escaped, false);
    const closed = confirmDialog("delete");
    current.close();
    assert.equal(await closed, false);
  } finally { globalThis.document = previousDocument; }
});

test("all destructive confirmation call sites await the decision", () => {
  for (const file of readdirSync(new URL("../src/modules/", import.meta.url), { recursive: true })) {
    if (!file.endsWith(".js") || file === "shared/ui-states.js") continue;
    const source = readFileSync(new URL(`../src/modules/${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /\b(?:alert|confirm)\s*\(/, file);
    for (const match of source.matchAll(/confirmDialog\(/g)) {
      assert.match(source.slice(Math.max(0, match.index - 7), match.index), /await\s+$/, file);
    }
  }
});
