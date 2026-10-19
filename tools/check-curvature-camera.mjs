import fs from "node:fs/promises";
import vm from "node:vm";
import assert from "node:assert/strict";
export async function checkCurvatureCamera(root) {
  const source = await fs.readFile(new URL("content/labs/curvature/ui/app.js", root), "utf8");
  let camera = {
    eye: { x: 0.4, y: 0.3, z: 0.2 },
    center: { x: 0.1, y: 0.2, z: 0 },
    up: { x: 0, y: 0, z: 1 },
  };
  const snapshot = structuredClone(camera);
  const plot = {
    _fullLayout: {
      scene: { camera: snapshot, _scene: { getCamera: () => structuredClone(camera) } },
    },
  };
  let updates = 0;
  const context = {
    Math,
    Promise,
    document: { hidden: false },
    rotating: true,
    mesh: {},
    last: 0,
    rotationFrame: null,
    rotationUpdating: false,
    rotationInteractionUntil: 0,
    rotationPointers: new Set(),
    numericInput: () => 0.4,
    $: (id) => (id === "plot" ? plot : { hidden: false }),
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
    Plotly: {
      relayout(_, update) {
        updates++;
        camera = update["scene.camera"];
        return Promise.resolve();
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(
    source.slice(
      source.indexOf("function canRotate()"),
      source.indexOf('document.addEventListener("visibilitychange"'),
    ),
    context,
  );
  const tick = async (t) => {
    context.animate(t);
    await new Promise((resolve) => setImmediate(resolve));
  };
  const baseline = {
    eye: { x: 1.5, y: 1.5, z: 1.1 },
    center: { x: 0, y: 0, z: 0 },
    up: { x: 0, y: 0, z: 1 },
  };
  const near = (a, b) => a.forEach((n, i) => assert.ok(Math.abs(n - b[i]) < 1e-9));
  near(context.worldRotationAxis(baseline), [0, 0, 1]);
  const tilted = {
    eye: { x: 2, y: 0.7, z: -0.5 },
    center: { x: 0, y: 0, z: 0 },
    up: { x: 0.1, y: 0.2, z: 1 },
  };
  const axis = context.worldRotationAxis(tilted);
  assert.ok(
    Math.hypot(axis[0], axis[1]) > 0.1,
    "After manual tilt, world Z must differ from the object's original Z",
  );
  const dot = (a, b) => a.reduce((sum, n, i) => sum + n * b[i], 0);
  const axisInView = (c) => context.cameraFrame(c).map((b) => dot(b, context.worldRotationAxis(c)));
  const distance = (c) =>
    Math.hypot(c.eye.x - c.center.x, c.eye.y - c.center.y, c.eye.z - c.center.z);
  camera = structuredClone(tilted);
  camera.center = { x: 0.3, y: -0.2, z: 0.1 };
  const before = structuredClone(camera);
  const frameBefore = axisInView(camera);
  await tick(100);
  for (let i = 0; i < 15; i++) {
    await tick(200 + i * 100);
    near(axisInView(camera), frameBefore);
    assert.ok(
      Math.abs(distance(camera) - distance(before)) < 1e-9,
      "Rotation must preserve live zoom",
    );
    assert.deepEqual(
      structuredClone(camera.center),
      before.center,
      "Pan must not co-rotate and cancel the orbital motion",
    );
  }
  // Project the original crystal centre to verify pan actually produces an orbit.
  const project = (c) => {
    const frame = context.cameraFrame(c),
      origin = [-c.center.x, -c.center.y, -c.center.z];
    return [dot(frame[0], origin), dot(frame[1], origin)];
  };
  assert.ok(
    Math.hypot(...project(camera).map((n, i) => n - project(before)[i])) > 0.01,
    "Panned crystal must move around the fixed pivot",
  );
  const fullTurn = context.rotateCamera(before, Math.PI * 2);
  near(Object.values(fullTurn.eye), Object.values(before.eye));
  near(Object.values(fullTurn.up), Object.values(before.up));
  camera.eye = { x: 4, y: 2, z: 1 };
  const zoom = distance(camera);
  await tick(1800);
  assert.ok(
    Math.abs(distance(camera) - zoom) < 1e-9,
    "A wheel zoom must survive the next rotation frame",
  );
  const count = updates;
  context.rotationPointers.add(1);
  await tick(1900);
  assert.equal(updates, count);
  context.rotationPointers.clear();
  context.rotationInteractionUntil = 2200;
  await tick(2000);
  assert.equal(updates, count);
  await tick(2300);
  assert.equal(updates, count + 1);
  context.rotating = false;
  await tick(2400);
  assert.equal(updates, count + 1);
  assert.deepEqual(
    plot._fullLayout.scene.camera,
    snapshot,
    "Regression must exercise a stale serialized camera",
  );
  assert.ok(!source.includes("Plotly.restyle("), "Rotation must not rebuild mesh coordinates");
  console.log(
    "Curvature camera-only rotation: independent fixed axis, pan orbit, live zoom and gesture pause passed.",
  );
}
