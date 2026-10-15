import fs from "node:fs/promises";
import vm from "node:vm";
import assert from "node:assert/strict";

export async function checkCurvatureEngine(root) {
  const engine = await fs.readFile(new URL("content/labs/curvature/ui/engine.js", root), "utf8");
  const worker = await fs.readFile(new URL("content/labs/curvature/ui/worker.js", root), "utf8");
  const context = {};
  vm.runInNewContext(engine, context);
  const E = context.CurvatureEngine;
  const mesh = {
    vertices: [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ],
    faces: [
      [0, 2, 4],
      [2, 1, 4],
      [1, 3, 4],
      [3, 0, 4],
      [2, 0, 5],
      [1, 2, 5],
      [3, 1, 5],
      [0, 3, 5],
    ],
  };
  const curves = E.curvature(mesh);
  const scaled = { ...mesh, vertices: mesh.vertices.map((v) => v.map((x) => x * 3)) };
  const scaledCurves = E.curvature(scaled);
  for (const field of ["H", "K", "k1", "k2", "areas"]) {
    const factor = field === "areas" ? 9 : field === "K" ? 1 / 9 : 1 / 3;
    curves[field].forEach((x, i) =>
      assert.ok(Math.abs(scaledCurves[field][i] - x * factor) < 1e-12, field),
    );
  }
  const options = {
    enabled: true,
    iterations: 2,
    strength: 0.9,
    targetField: "H",
    sigmaRatio: 1 / 3,
    order: 4,
  };
  assert.ok(
    Math.abs(
      E.processSurface(mesh, curves, options).roundness -
        E.processSurface(scaled, scaledCurves, options).roundness,
    ) < 1e-12,
  );
  const canonical = (x) => JSON.parse(JSON.stringify(x));
  assert.deepEqual(canonical(E.smoothMesh(mesh, curves.H, 0, 0, 0.5)), mesh);
  const target = Array.from({ length: 90 }, (_, i) =>
    i < 30 ? i / 100 : i < 60 ? 2 + i / 100 : 5 + i / 100,
  );
  const messages = [];
  const workerContext = { self: {}, postMessage: (message) => messages.push(message) };
  workerContext.importScripts = (filename) => {
    assert.equal(filename, "engine.js");
    vm.runInNewContext(engine, workerContext);
  };
  vm.runInNewContext(worker, workerContext);
  const operations = [
    ["curvature", {}, curves],
    ["surface", { ...options, curves }, E.processSurface(mesh, curves, options)],
    ["classify", { H: target, nClasses: 3, positiveOnly: true }, E.classifyTarget(target, 3, true)],
    ["smooth", { iterations: 1, finalIterations: 1, strength: 0.5 }, null],
  ];
  for (const [operation, config, expected] of operations) {
    messages.length = 0;
    workerContext.self.onmessage({ data: { operation, m: mesh, options: config } });
    assert.ok(messages.some((message) => typeof message.progress === "number"));
    const result = messages.at(-1);
    assert.ok(result.result, operation + ": " + result.error);
    if (expected) assert.deepEqual(canonical(result.result), canonical(expected));
    else {
      const smoothed = E.smoothMesh(mesh, curves.H, 1, 1, 0.5);
      assert.deepEqual(
        canonical(result.result),
        canonical({ mesh: smoothed, curves: E.curvature(smoothed) }),
      );
    }
  }
  messages.length = 0;
  workerContext.self.onmessage({ data: { operation: "curvature", m: null } });
  assert.equal(typeof messages.at(-1).error, "string");
  console.log(
    "Curvature engine: scale laws, roundness invariance and all four worker operations passed.",
  );
}
