import { checkCurvaturePresentation } from "./check-curvature-presentation.mjs";
import { checkCurvatureCamera } from "./check-curvature-camera.mjs";
import "./check-crystal-data.mjs";
import { checkUIControls } from "./check-ui-controls.mjs";
import { checkLabRuntime } from "./check-lab-runtime.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const labs = (await fs.readdir(path.join(root, "content/labs"), { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
const files = (await fs.readdir(path.join(root, "static/js")))
  .filter((name) => name.endsWith(".js"))
  .map((name) => path.join(root, "static/js", name));
for (const lab of labs) {
  const directory = path.join(root, "content/labs", lab, "ui");
  const workspace = await fs.readFile(path.join(directory, "workspace.txt"), "utf8");
  const ids = [...workspace.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, `Duplicate workspace IDs: ${lab}`);
  const app = await fs.readFile(path.join(directory, "app.js"), "utf8");
  const generated = new Set(
    [...app.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)].map((match) => match[1]),
  );
  for (const [, id] of app.matchAll(/\$\("([^"\n]+)"\)/g)) {
    assert.ok(ids.includes(id) || generated.has(id), `Missing workspace element ${lab}: #${id}`);
  }
  if (/type\s*=\s*["']file["']/i.test(workspace))
    throw Error(`User file input is disabled: ${lab}`);

  for (const name of await fs.readdir(directory)) {
    if (name.endsWith(".js") && !["catalog.js", "archive-index.js"].includes(name))
      files.push(path.join(directory, name));
  }
}
for (const file of files) {
  new vm.Script(await fs.readFile(file, "utf8"), { filename: file });
}
await checkUIControls(new URL("../", import.meta.url));
await checkLabRuntime(new URL("../", import.meta.url));
await checkCurvatureCamera(new URL("../", import.meta.url));
await checkCurvaturePresentation(new URL("../", import.meta.url));
// A stalled local asset must reject and allow a new attempt, rather than stay at 5%.
const loaderTimers = [],
  loaderScripts = [];
const loaderContext = {
  AbortController,
  window: { EMBEDDED_INDEX: { example: "example.js" } },
  document: {
    createElement: () => ({ remove() {} }),
    head: {
      append(script) {
        loaderScripts.push(script);
      },
    },
  },
  setTimeout(callback) {
    loaderTimers.push(callback);
    return loaderTimers.length;
  },
  clearTimeout() {},
};
vm.runInNewContext(
  await fs.readFile(path.join(root, "content/labs/curvature/ui/data-loader.js"), "utf8"),
  loaderContext,
);
const stalledLoad = loaderContext.window.CrystalData.load("example");
const timeoutCheck = assert.rejects(stalledLoad, /timed out/);
loaderTimers[0]();
await timeoutCheck;
const retryLoad = loaderContext.window.CrystalData.load("example");
const retryCheck = assert.rejects(retryLoad, /could not be loaded/);
assert.equal(loaderScripts.length, 2);
loaderScripts[1].onerror();
await retryCheck;
const cancelledLocal = loaderContext.window.CrystalData.load("example");
const cancelCheck = assert.rejects(cancelledLocal, { name: "AbortError" });
loaderContext.window.CrystalData.cancel();
await cancelCheck;
const mpc = require("../content/labs/mpcrystal/ui/engine.js");
const schemaContext = { window: {} };
vm.runInNewContext(
  await fs.readFile(path.join(root, "content/labs/mpcrystal/ui/schema.js"), "utf8"),
  schemaContext,
);
const fields = schemaContext.window.PARAMETER_GROUPS.flatMap((group) => group.fields);
const fieldKeys = fields.map((field) => field.key);
if (new Set(fieldKeys).size !== fieldKeys.length) throw Error("Duplicate MPC parameter fields");
for (const key of ["params.K_I_T", "params.K_I_T_sigma", "params.K_I_T_G", "params.K_P_T_applied"])
  if (!fieldKeys.includes(key)) throw Error(`Missing temperature gain: ${key}`);
for (const target of ["sigma", "G"]) {
  const derived = mpc.derive(
    { ...mpc.defaults, "params.K_I_T_sigma": 0.12, "params.K_I_T_G": 0.34 },
    target,
  );
  for (const field of fields) {
    if (!(field.key in derived)) throw Error(`Unresolved MPC parameter: ${field.key}`);
    if (typeof derived[field.key] === "number" && !Number.isFinite(derived[field.key]))
      throw Error(`Non-finite MPC parameter: ${field.key}`);
  }
  if (derived["params.K_I_T"] !== (target === "sigma" ? 0.12 : 0.34))
    throw Error("Temperature integral gain did not follow target");
}
for (const mode of ["MPC", "PI"])
  for (const target of ["sigma", "G"]) {
    const simulation = new mpc.Simulation(mpc.defaults, { mode, target });
    while (simulation.step()) {}
    if (simulation.history.length !== simulation.p.steps) throw Error("Incomplete MPC run");
  }
// Switching targets after the former sigma limit must preserve the run budget.
const switchedRun = new mpc.Simulation(
  { ...mpc.defaults, steps: 1100 },
  { mode: "PI", target: "G" },
);
for (let i = 0; i < 1000; i++) assert.ok(switchedRun.step());
switchedRun.update(switchedRun.values, { target: "sigma" });
assert.equal(switchedRun.p.steps, 1100);
assert.ok(switchedRun.step());
switchedRun.update(switchedRun.values, { target: "G" });
assert.equal(switchedRun.p.steps, 1100);
while (switchedRun.step()) {}
assert.equal(switchedRun.history.length, 1100);
assert.ok(fieldKeys.includes("steps"));
assert.ok(!fieldKeys.includes("steps_sigma") && !fieldKeys.includes("steps_G"));
assert.throws(() => mpc.validate({ ...mpc.defaults, steps: 0 }));
assert.throws(() => mpc.validate({ ...mpc.defaults, steps: 1.5 }));
if (labs.includes("orbitalflatness")) {
  const orbital = require("../content/labs/orbitalflatness/ui/engine.js");
  for (const dimension of [1, 2, 3]) {
    const config = { ...orbital.defaultConfig(dimension), numPoints: 21 };
    const progress = [];
    const baseline = orbital.solve(config);
    assert.deepEqual(
      orbital.solve(config, (value) => progress.push(value)),
      baseline,
    );
    assert.equal(progress.at(-1), 100);
    assert.ok(
      progress.every(
        (value, index) => value >= 0 && value <= 100 && (!index || value >= progress[index - 1]),
      ),
    );
  }
}
console.log(
  `${files.length} scripts passed syntax checks; default MPC/PI runs completed${labs.includes("orbitalflatness") ? "; three Orbital dimensions completed" : "; Orbital checks skipped (Lab not present)"}.`,
);
