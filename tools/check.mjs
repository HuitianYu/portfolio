import { checkCurvatureEngine } from "./check-curvature-engine.mjs";
import { checkCurvaturePresentation } from "./check-curvature-presentation.mjs";
import { checkCurvatureCamera } from "./check-curvature-camera.mjs";
import { checkUIControls } from "./check-ui-controls.mjs";
import { checkLabData } from "./check-lab-data.mjs";
import { checkLabMedia } from "./check-lab-media.mjs";
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
  assert.equal((workspace.match(/<main\b/g) || []).length, 1, `One main container: ${lab}`);
  assert.ok(workspace.includes('class="lab-content"'), `Shared container: ${lab}`);
  assert.equal(
    (workspace.match(/<!-- LAB_FOOTER -->/g) || []).length,
    1,
    `One shared footer: ${lab}`,
  );
  for (const [, key] of workspace.matchAll(/data-section="([^"]+)"/g))
    assert.ok(
      workspace.includes(`data-section-panel="${key}"`),
      `Panel wrapper missing: ${lab}/${key}`,
    );
  for (const [, relative] of workspace.matchAll(
    /<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["']/g,
  )) {
    if (/^(?:https?:|data:|#|\/)/.test(relative)) continue;
    await fs.access(path.join(directory, relative.split(/[?#]/)[0]));
  }
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
await checkLabData(new URL("../", import.meta.url));
await checkLabMedia(new URL("../", import.meta.url));
if (labs.includes("stablegsensor")) {
  const recordingContext = { window: { LAB_CONFIG: { data: {} } }, URL };
  vm.runInNewContext(
    await fs.readFile(
      path.join(root, "content/labs/stablegsensor/ui/recording-sources.js"),
      "utf8",
    ),
    recordingContext,
  );
  const recordingSource = recordingContext.window.RecordingSources.source;
  const catalogContext = { window: {} };
  vm.runInNewContext(
    await fs.readFile(path.join(root, "content/labs/stablegsensor/ui/catalog.js"), "utf8"),
    catalogContext,
  );
  for (const name of Object.keys(catalogContext.window.CATALOG.case_3)) {
    const file = path.join(root, "content/labs/stablegsensor/ui/assets/case_3", name + ".mp4");
    assert.ok((await fs.stat(file)).size > 8, `Bundled video is empty: ${name}`);
  }

  const videoFile = "loftr_image_correction_animation.mp4";
  assert.equal(recordingSource("case_1", videoFile), `assets/case_1/${videoFile}`);
  const remoteRecordings = { remoteEnabled: true, fileBaseURL: "https://example.org/files/" };
  assert.equal(
    recordingSource("case_3", videoFile, remoteRecordings),
    `assets/case_3/${videoFile}`,
  );
  assert.equal(
    recordingSource("case_1", videoFile, remoteRecordings),
    `https://example.org/files/case_1_${videoFile}`,
  );
  assert.throws(() => recordingSource("case_10", videoFile), /Unknown/);
  assert.throws(
    () =>
      recordingSource("case_1", videoFile, {
        remoteEnabled: true,
        fileBaseURL: "http://example.org/",
      }),
    /HTTPS/,
  );
} else {
  console.log("StableGSensor source checks skipped (Lab not present).");
}

if (labs.includes("curvature")) {
  await import("./check-crystal-data.mjs");
  await checkCurvatureEngine(new URL("../", import.meta.url));
  await checkCurvatureCamera(new URL("../", import.meta.url));
  await checkCurvaturePresentation(new URL("../", import.meta.url));
}

if (labs.includes("mpcrystal")) {
  const chartContext = { window: {} };
  vm.runInNewContext(
    await fs.readFile(path.join(root, "content/labs/mpcrystal/ui/chart-schema.js"), "utf8"),
    chartContext,
  );
  const chartSchema = chartContext.window.MPCChartSchema;
  assert.equal(
    new Set(chartSchema.panels.map((panel) => panel.id)).size,
    chartSchema.panels.length,
  );
  for (const panel of chartSchema.panels)
    for (const key of panel.keys) assert.ok(chartSchema.curves[key], `Missing chart curve: ${key}`);
  for (const [, colour] of Object.values(chartSchema.curves))
    assert.ok(chartSchema.coloursDefault[colour], `Missing chart colour: ${colour}`);
  const mpc = require("../content/labs/mpcrystal/ui/engine.js");
  const schemaContext = { window: {} };
  vm.runInNewContext(
    await fs.readFile(path.join(root, "content/labs/mpcrystal/ui/schema.js"), "utf8"),
    schemaContext,
  );
  const fields = schemaContext.window.PARAMETER_GROUPS.flatMap((group) => group.fields);
  const fieldKeys = fields.map((field) => field.key);
  if (new Set(fieldKeys).size !== fieldKeys.length) throw Error("Duplicate MPC parameter fields");
  for (const key of [
    "params.K_I_T",
    "params.K_I_T_sigma",
    "params.K_I_T_G",
    "params.K_P_T_applied",
  ])
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
}

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
  `${files.length} scripts passed syntax checks; checks completed for present Labs: ${labs.join(", ") || "none"}.`,
);

// Embedded paper/DOI links require user-initiated top navigation and independent popup documents.
{
  const template = await fs.readFile(
    new URL("../layouts/labs/single.html", import.meta.url),
    "utf8",
  );
  const permissions = template.match(/sandbox="([^"]+)"/)[1].split(/\s+/);
  for (const permission of [
    "allow-top-navigation-by-user-activation",
    "allow-popups",
    "allow-popups-to-escape-sandbox",
  ])
    assert.ok(permissions.includes(permission), `Lab link navigation requires ${permission}`);
  assert.ok(
    !permissions.includes("allow-top-navigation"),
    "Top navigation must require user activation",
  );
}
