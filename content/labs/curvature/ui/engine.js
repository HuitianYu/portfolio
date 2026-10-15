/** Pure mesh calculations. Shared by the page and its worker; no DOM or UI state. */
((scope) => {
  "use strict";
  const sub = (a, b) => a.map((x, i) => x - b[i]),
    dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0),
    cross = (a, b) => [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
  function curvature(m) {
    const v = m.vertices,
      n = v.length,
      A = new Float64Array(n),
      angles = new Float64Array(n),
      N = Array.from({ length: n }, () => [0, 0, 0]),
      L = Array.from({ length: n }, () => [0, 0, 0]);
    let signedVolume = 0;
    for (const f of m.faces) {
      let p = f.map((i) => v[i]),
        cr = cross(sub(p[1], p[0]), sub(p[2], p[0])),
        twice = Math.hypot(...cr);
      if (twice < 1e-15) continue;
      signedVolume += dot(p[0], cross(p[1], p[2]));
      let cot = [],
        angle = [],
        len = [];
      for (let k = 0; k < 3; k++) {
        let a = sub(p[(k + 1) % 3], p[k]),
          b = sub(p[(k + 2) % 3], p[k]);
        cot[k] = dot(a, b) / twice;
        angle[k] = Math.atan2(twice, dot(a, b));
        len[k] = dot(sub(p[(k + 1) % 3], p[(k + 2) % 3]), sub(p[(k + 1) % 3], p[(k + 2) % 3]));
      }
      let obt = cot.findIndex((x) => x <= 0);
      for (let k = 0; k < 3; k++) {
        let i = f[k],
          a = (k + 1) % 3,
          b = (k + 2) % 3;
        A[i] +=
          obt >= 0
            ? (twice / 2) * (k === obt ? 0.5 : 0.25)
            : (len[a] * cot[a] + len[b] * cot[b]) / 8;
        angles[i] += angle[k];
        for (let j = 0; j < 3; j++) {
          N[i][j] += (cr[j] / twice) * angle[k];
          L[i][j] += cot[b] * (p[a][j] - p[k][j]) + cot[a] * (p[b][j] - p[k][j]);
        }
      }
    }
    let orientation = signedVolume < 0 ? -1 : 1,
      H = [],
      K = [],
      k1 = [],
      k2 = [];
    for (let i = 0; i < n; i++) {
      if (A[i] <= 0) {
        H.push(null);
        K.push(null);
        k1.push(null);
        k2.push(null);
        continue;
      }
      let h = (Math.hypot(...L[i]) / (4 * A[i])) * Math.sign(-orientation * dot(L[i], N[i])),
        k = (2 * Math.PI - angles[i]) / A[i],
        delta = Math.sqrt(Math.max(0, h * h - k));
      H.push(h);
      K.push(k);
      k1.push(h + delta);
      k2.push(h - delta);
    }
    return { H, K, k1, k2, areas: Array.from(A) };
  }

  function smoothMesh(
    m,
    initialH,
    iterations = 5,
    finalIterations = 5,
    strength = 0.5,
    progress = null,
  ) {
    const neighbours = Array.from({ length: m.vertices.length }, () => new Set());
    for (const f of m.faces)
      for (let k = 0; k < 3; k++) {
        neighbours[f[k]].add(f[(k + 1) % 3]);
        neighbours[f[(k + 1) % 3]].add(f[k]);
      }
    const adjacency = neighbours.map((s) => [...s]),
      absolute = initialH.map((x) => Math.abs(x || 0));
    let lo = Infinity,
      hi = -Infinity;
    for (const x of absolute) {
      lo = Math.min(lo, x);
      hi = Math.max(hi, x);
    }
    const weights = absolute.map((x) => (hi > lo ? (x - lo) / (hi - lo) : 0.5));
    let completed = 0,
      total = iterations * 2 + finalIterations,
      points = m.vertices.map((v) => v.slice());
    function pass(count, factor) {
      for (let t = 0; t < count; t++) {
        const next = points.map((p, i) => {
          const ids = adjacency[i];
          if (!ids.length) return p.slice();
          const w = typeof factor === "number" ? factor : factor[i],
            mean = [0, 0, 0];
          for (const j of ids) for (let k = 0; k < 3; k++) mean[k] += points[j][k] / ids.length;
          return p.map((x, k) => w * x + (1 - w) * mean[k]);
        });
        points = next;
        completed++;
        if (progress) progress(completed / Math.max(1, total));
      }
    }
    pass(iterations, weights);
    pass(
      iterations,
      weights.map((x) => 1 - x),
    );
    pass(finalIterations, 1 - strength);
    return { vertices: points, faces: m.faces };
  }

  function histogramCounts(values, bins = 100) {
    const finite = values.filter(Number.isFinite);
    let lo = Infinity,
      hi = -Infinity;
    for (const x of finite) {
      lo = Math.min(lo, x);
      hi = Math.max(hi, x);
    }
    if (lo === hi) {
      lo -= 0.5;
      hi += 0.5;
    }
    const width = (hi - lo) / bins,
      counts = new Array(bins).fill(0);
    for (const x of finite) counts[Math.min(bins - 1, Math.max(0, Math.floor((x - lo) / width)))]++;
    return { counts, centres: counts.map((_, i) => lo + (i + 0.5) * width), width, lo, hi };
  }
  function multiOtsu(values, classes = 5) {
    const h = histogramCounts(values, 256),
      n = h.counts.length,
      W = new Float64Array(n + 1),
      M = new Float64Array(n + 1);
    if (h.counts.filter((x) => x > 0).length < classes)
      throw Error("Too few distinct curvature levels for the requested class count.");
    for (let i = 0; i < n; i++) {
      W[i + 1] = W[i] + h.counts[i];
      M[i + 1] = M[i] + h.counts[i] * h.centres[i];
    }
    const score = (a, b) => {
      const w = W[b + 1] - W[a],
        m = M[b + 1] - M[a];
      return w > 0 ? (m * m) / w : -Infinity;
    };
    let previous = new Float64Array(n),
      paths = [];
    for (let b = 0; b < n; b++) previous[b] = score(0, b);
    for (let c = 2; c <= classes; c++) {
      const next = new Float64Array(n).fill(-Infinity),
        path = new Int32Array(n).fill(-1);
      for (let b = c - 1; b < n; b++)
        for (let t = c - 2; t < b; t++) {
          const value = previous[t] + score(t + 1, b);
          if (value > next[b]) {
            next[b] = value;
            path[b] = t;
          }
        }
      paths[c] = path;
      previous = next;
    }
    let b = n - 1,
      thresholds = [];
    for (let c = classes; c >= 2; c--) {
      b = paths[c][b];
      if (b < 0) throw Error("Unable to partition curvature histogram");
      thresholds.unshift(h.centres[b]);
    }
    return thresholds;
  }
  function classifyMean(m, H, nClasses = 5) {
    const ordered = H.filter(Number.isFinite)
        .slice()
        .sort((a, b) => a - b),
      cut = Math.ceil(ordered.length * 0.001),
      lo = ordered[Math.min(cut, ordered.length - 1)],
      hi = ordered[Math.max(0, ordered.length - cut)],
      neighbours = Array.from({ length: m.vertices.length }, () => new Set());
    for (const f of m.faces)
      for (let k = 0; k < 3; k++) {
        neighbours[f[k]].add(f[(k + 1) % 3]);
        neighbours[f[(k + 1) % 3]].add(f[k]);
      }
    const ids = neighbours.map((s) => [...s]);
    let target = H.map((x) => Math.max(lo, Math.min(hi, Number.isFinite(x) ? x : lo)));
    for (let t = 0; t < 10; t++)
      target = target.map((x, i) =>
        ids[i].length
          ? 0.1 * x + (0.9 * ids[i].reduce((sum, j) => sum + target[j], 0)) / ids[i].length
          : x,
      );
    const thresholds = multiOtsu(target, nClasses),
      classes = target.map((x) => thresholds.filter((t) => x > t).length);
    return { target, thresholds, classes, nClasses };
  }

  function smoothScalar(values, faces, iterations = 10, selfWeight = 0.1) {
    const n = values.length,
      ordered = values
        .filter(Number.isFinite)
        .slice()
        .sort((a, b) => a - b);
    if (!ordered.length) return values.map(() => 0);
    const cut = Math.ceil(ordered.length * 0.001),
      lo = ordered[Math.min(cut, ordered.length - 1)],
      hi = ordered[Math.max(0, ordered.length - cut)],
      neighbours = Array.from({ length: n }, () => new Set());
    for (const f of faces)
      for (let k = 0; k < 3; k++) {
        neighbours[f[k]].add(f[(k + 1) % 3]);
        neighbours[f[(k + 1) % 3]].add(f[k]);
      }
    const ids = neighbours.map((s) => [...s]);
    let target = values.map((x) => Math.max(lo, Math.min(hi, Number.isFinite(x) ? x : lo)));
    for (let t = 0; t < iterations; t++)
      target = target.map((x, i) =>
        ids[i].length
          ? selfWeight * x +
            ((1 - selfWeight) * ids[i].reduce((sum, j) => sum + target[j], 0)) / ids[i].length
          : x,
      );
    return target;
  }
  function processSurface(m, c, options) {
    const display = {};
    for (const f of ["H", "K", "k1", "k2"])
      display[f] = options.enabled
        ? smoothScalar(c[f], m.faces, options.iterations, 1 - options.strength)
        : c[f];
    const target = display[options.targetField || "H"];
    let maximum = 0;
    for (const x of target) maximum = Math.max(maximum, x);
    const sigma = maximum * (options.sigmaRatio || 1 / 3),
      weights = target.map((x) =>
        sigma > 0
          ? 1 - Math.exp(-((Math.max(0, x) / (sigma * Math.sqrt(2))) ** (options.order || 4)))
          : 0,
      ),
      total = c.areas.reduce((a, b) => a + b, 0),
      roundness = c.areas.reduce((sum, a, i) => sum + a * weights[i], 0) / total;
    display.weights = weights;
    return { display, roundness, weights, target };
  }

  function classifyTarget(target, nClasses = 3, positiveOnly = true) {
    const subset = positiveOnly ? target.filter((x) => x > 0) : target;
    const thresholds = multiOtsu(subset, nClasses),
      classes = target.map((x) => thresholds.filter((t) => x > t).length);
    return { target, thresholds, classes, nClasses };
  }

  scope.CurvatureEngine = Object.freeze({
    curvature,
    smoothMesh,
    histogramCounts,
    multiOtsu,
    classifyMean,
    smoothScalar,
    processSurface,
    classifyTarget,
  });
})(globalThis);
