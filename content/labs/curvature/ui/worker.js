/** Explicit worker protocol; calculation functions live only in engine.js. */
importScripts("engine.js");
const { curvature, smoothMesh, processSurface, classifyTarget } = globalThis.CurvatureEngine;
self.onmessage = ({ data: { operation, m, options = {} } }) => {
  const progress = (value, message) => postMessage({ progress: value, message });
  try {
    let result;
    switch (operation) {
      case "surface":
        progress(65, "Smoothing curvature values…");
        result = processSurface(m, options.curves, options);
        break;
      case "classify":
        progress(94, "Calculating Multi-Otsu classes…");
        result = classifyTarget(options.H, options.nClasses, options.positiveOnly);
        break;
      case "smooth": {
        progress(15, "Calculating initial curvature…");
        const initial = curvature(m);
        const mesh = smoothMesh(
          m,
          initial.H,
          options.iterations,
          options.finalIterations,
          options.strength,
          (fraction) => progress(Math.round(25 + fraction * 30), "Smoothing mesh…"),
        );
        progress(60, "Calculating smoothed curvature…");
        result = { mesh, curves: curvature(mesh) };
        break;
      }
      default:
        progress(20, "Calculating curvature…");
        result = curvature(m);
    }
    postMessage({ result });
  } catch (error) {
    postMessage({ error: error.message });
  }
};
