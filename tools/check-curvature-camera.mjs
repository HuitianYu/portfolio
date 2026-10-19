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
  await tick(100);
  for (const [index, eye] of [
    { x: 0.4, y: 0.3, z: 0.2 },
    { x: 4, y: 3, z: 2 },
    { x: 0.04, y: 0.03, z: -0.2 },
  ].entries()) {
    camera.eye = { ...eye };
    const targetBefore = { ...camera.center };
    await tick(200 + index * 100);
    assert.ok(
      Math.abs(
        Math.hypot(camera.eye.x - camera.center.x, camera.eye.y - camera.center.y) -
          Math.hypot(eye.x - targetBefore.x, eye.y - targetBefore.y),
      ) < 1e-10,
      "Rotation must preserve zoom distance",
    );
    assert.equal(camera.eye.z, eye.z, "Rotation must preserve camera height");
  }
  assert.ok(Math.abs(Math.hypot(camera.center.x, camera.center.y) - Math.hypot(0.1, 0.2)) < 1e-10);
  assert.deepEqual(structuredClone(camera.up), { x: 0, y: 0, z: 1 });
  // The serialized snapshot is deliberately stale: user zoom/pan/tilt only
  // changed the live scene. Reading layout.camera must fail this regression.
  camera = {
    eye: { x: 0.8, y: -0.2, z: 0.6 },
    center: { x: 0.3, y: -0.4, z: 0.1 },
    up: { x: 0.2, y: 0.4, z: 0.8 },
    projection: { type: "perspective" },
  };
  const before = structuredClone(camera);
  const view = (c) => [c.eye.x - c.center.x, c.eye.y - c.center.y, c.eye.z - c.center.z];
  const dot = (a, b) => a.reduce((sum, n, i) => sum + n * b[i], 0);
  await tick(500);
  assert.ok(
    Math.abs(Math.hypot(...view(camera)) - Math.hypot(...view(before))) < 1e-10,
    "Live zoom distance must survive stale layout state",
  );
  assert.ok(
    Math.abs(
      Math.hypot(...Object.values(camera.center)) - Math.hypot(...Object.values(before.center)),
    ) < 1e-10,
  );
  assert.deepEqual(structuredClone(camera.up), before.up, "Displayed vertical must remain fixed");
  assert.ok(
    Math.abs(
      dot(view(camera), Object.values(camera.up)) - dot(view(before), Object.values(before.up)),
    ) < 1e-10,
    "Camera tilt must remain consistent",
  );
  assert.deepEqual(
    structuredClone(camera.center),
    before.center,
    "Pan translation must not co-rotate with the viewing frame and cancel orbital motion",
  );
  assert.deepEqual(camera.projection, before.projection);
  assert.deepEqual(
    plot._fullLayout.scene.camera,
    snapshot,
    "Test must retain the stale layout snapshot",
  );
  const quarterTurn = context.rotateCamera(
    { eye: { x: 2, y: 0, z: 3 }, center: { x: 1, y: 0, z: 1 }, up: { x: 1, y: 0, z: 0 } },
    Math.PI / 2,
  );
  for (const [key, expected] of Object.entries({
    eye: [2, -2, 1],
    center: [1, 0, 1],
    up: [1, 0, 0],
  })) {
    Object.values(quarterTurn[key]).forEach((value, index) =>
      assert.ok(
        Math.abs(value - expected[index]) < 1e-10,
        "World axis must not follow a translated target or tilted camera",
      ),
    );
  }
  let count = updates;
  context.rotationPointers.add(1);
  await tick(600);
  assert.equal(updates, count, "Dragging must pause automatic rotation");
  context.rotationPointers.clear();
  context.rotationInteractionUntil = 900;
  await tick(800);
  assert.equal(updates, count, "Zoom gesture must pause automatic rotation");
  await tick(1000);
  assert.equal(updates, count + 1, "Rotation must resume after interaction");
  context.rotating = false;
  await tick(1100);
  assert.equal(updates, count + 1, "Pause must stop camera updates");
  console.log(
    "Curvature camera: fixed displayed vertical, live zoom, pan, tilt and gesture pause passed.",
  );
}
