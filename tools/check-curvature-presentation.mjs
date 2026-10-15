import fs from "node:fs/promises";
import vm from "node:vm";
import assert from "node:assert/strict";
export async function checkCurvaturePresentation(root) {
  const source = await fs.readFile(new URL("content/labs/curvature/ui/app.js", root), "utf8");
  const pending = new Map();
  const ctx = {
    Map,
    setTimeout,
    clearTimeout,
    window: {},
    MathJax: {
      startup: { promise: Promise.resolve() },
      tex2svgPromise: (tex) =>
        new Promise((resolve, reject) => pending.set(tex, { resolve, reject })),
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(await fs.readFile(new URL("static/js/lab-runtime.js", root), "utf8"), ctx);
  vm.runInContext(
    source.slice(
      source.indexOf("const formulaCache ="),
      source.indexOf('renderFormula($("vertices-symbol")'),
    ),
    ctx,
  );
  const make = () => ({
    dataset: {},
    children: [],
    classList: {
      set: new Set(),
      add(v) {
        this.set.add(v);
      },
      remove(v) {
        this.set.delete(v);
      },
    },
    querySelector() {
      return this.children[0] || null;
    },
    replaceChildren(...v) {
      this.children = v;
    },
    textContent: "",
  });
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  const element = make();
  const first = ctx.renderFormula(element, "H", "H");
  await settle();
  const second = ctx.renderFormula(element, "K", "K");
  await settle();
  pending.get("K").resolve({ cloneNode: () => ({ formula: "K" }) });
  await second;
  pending.get("H").resolve({ cloneNode: () => ({ formula: "H" }) });
  await first;
  assert.equal(element.children[0].formula, "K");
  assert.equal(element.classList.set.has("formula-pending"), false);
  const failed = make();
  const task = ctx.renderFormula(failed, "bad", "N_v");
  await settle();
  pending.get("bad").reject(Error("unavailable"));
  await task;
  assert.equal(failed.textContent, "N_v");
  assert.equal(failed.dataset.mathFallback, "true");
  assert.equal(failed.classList.set.has("formula-pending"), false);
  const retry = ctx.renderFormula(failed, "bad", "N_v");
  await settle();
  pending.get("bad").resolve({ cloneNode: () => ({ formula: "recovered" }) });
  await retry;
  assert.equal(failed.children[0].formula, "recovered");
  assert.equal(failed.title, "");
  vm.runInContext(
    source.slice(source.indexOf("const WEIGHT_COLORSCALE"), source.indexOf("const CLASS_COLOURS")) +
      ";globalThis.scale=WEIGHT_COLORSCALE;",
    ctx,
  );
  assert.equal(ctx.scale[0][1], "rgb(247,251,255)");
  assert.equal(ctx.scale.at(-1)[1], "rgb(8,48,107)");
  assert.ok(source.includes("trace.colorscale = WEIGHT_COLORSCALE;"));
  console.log(
    "Curvature presentation: asynchronous formula ordering, fallback visibility and Python Blues endpoints passed.",
  );
}
