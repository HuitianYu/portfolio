function parseNumericExpression(expression) {
  const input = String(expression).trim();
  if (!input || input.length > 250)
    throw Error("Enter a numeric expression of at most 250 characters.");
  const tokens =
    input.match(
      /(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|(?:np\.)?[A-Za-z_][A-Za-z_0-9]*|\*\*|[+\-*/%(),]/g,
    ) || [];
  if (tokens.join("") !== input.replace(/\s/g, "")) throw Error("Unsupported numeric expression");
  let i = 0;
  const functions = {
    sqrt: Math.sqrt,
    exp: Math.exp,
    log: Math.log,
    log10: Math.log10,
    log2: Math.log2,
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    arcsin: Math.asin,
    arccos: Math.acos,
    arctan: Math.atan,
    abs: Math.abs,
    floor: Math.floor,
    ceil: Math.ceil,
    round: Math.round,
    power: Math.pow,
    minimum: Math.min,
    maximum: Math.max,
    clip: (x, a, b) => Math.min(b, Math.max(a, x)),
  };
  function atom() {
    const t = tokens[i++];
    if (t === "(") {
      const v = sum();
      if (tokens[i++] !== ")") throw Error("Missing closing parenthesis");
      return v;
    }
    if (t && /^(?:\d|\.)/.test(t)) return Number(t);
    const name = (t || "").replace(/^np\./, "");
    if (name === "pi") return Math.PI;
    if (name === "e") return Math.E;
    if (!functions[name] || tokens[i++] !== "(")
      throw Error("Use scalar arithmetic or a supported np function");
    let args = [sum()];
    while (tokens[i] === ",") {
      i++;
      args.push(sum());
    }
    if (tokens[i++] !== ")") throw Error("Missing closing parenthesis");
    return functions[name](...args);
  }
  function power() {
    let v = atom();
    if (tokens[i] === "**") {
      i++;
      v = v ** unary();
    }
    return v;
  }
  function unary() {
    if (tokens[i] === "+") {
      i++;
      return unary();
    }
    if (tokens[i] === "-") {
      i++;
      return -unary();
    }
    return power();
  }
  function product() {
    let v = unary();
    while (["*", "/", "%"].includes(tokens[i])) {
      const op = tokens[i++],
        b = unary();
      v = op === "*" ? v * b : op === "/" ? v / b : v % b;
    }
    return v;
  }
  function sum() {
    let v = product();
    while (["+", "-"].includes(tokens[i])) {
      const op = tokens[i++],
        b = product();
      v = op === "+" ? v + b : v - b;
    }
    return v;
  }
  const value = sum();
  if (i !== tokens.length || !Number.isFinite(value))
    throw Error("Expression must produce one finite number");
  return value;
}
function numericInput(id) {
  const e = document.getElementById(id);
  try {
    const v = parseNumericExpression(e.value);
    e.setCustomValidity("");
    return v;
  } catch (error) {
    e.setCustomValidity(error.message);
    throw error;
  }
}
const $ = (id) => document.getElementById(id),
  catalog = window.CRYSTALS.sort(
    (a, b) =>
      a.group.localeCompare(b.group) || Number(a.name.split("_")[1]) - Number(b.name.split("_")[1]),
  );
let filtered = [],
  page = 0,
  selected = null,
  shapes = null,
  mesh = null,
  curves = null,
  displayCurves = null,
  roundnessInfo = null,
  baseMesh = null,
  rotating = !matchMedia("(prefers-reduced-motion: reduce)").matches,
  theta = 0,
  loadToken = 0;
const groups = [...new Set(catalog.map((c) => c.group))];
$("rotate").textContent = rotating ? "Pause rotation" : "Resume rotation";
function tab(id) {
  if (!window.LabWorkspace.selectSection(id)) return;
  syncRotationLoop();
  if (id === "display") {
    if ($("plot").data) Plotly.Plots.resize("plot");
    if ($("histogram").data) Plotly.Plots.resize("histogram");
    setTimeout(() => updateColourTitle(!!classificationForCurrent()), 150);
  }
}
document
  .querySelectorAll("[data-section]")
  .forEach((b) => (b.onclick = () => tab(b.dataset.section)));
$("browse").onclick = () => tab("library");
$("count").textContent = catalog.length.toLocaleString("en-US");
for (const g of groups) {
  $("group").add(new Option(g, g));
  $("viewgroup").add(new Option(g, g));
}
$("group").value = groups[Math.floor(groups.length / 2)];
$("sort").value = "name";
function list() {
  let q = $("search").value.toLowerCase();
  filtered = catalog.filter(
    (c) =>
      ($("group").value === "all" || c.group === $("group").value) &&
      (!q || c.name.toLowerCase().includes(q) || String(c.roundness).includes(q)),
  );
  filtered.sort((a, b) =>
    $("sort").value === "name"
      ? a.group.localeCompare(b.group) ||
        Number(a.name.split("_")[1]) - Number(b.name.split("_")[1])
      : ($("sort").value === "asc" ? 1 : -1) * (a.roundness - b.roundness),
  );
  page = 0;
  rows();
}
function crystalSourceKey(c) {
  return window.EMBEDDED?.[c.id] || window.EMBEDDED_INDEX?.[c.id] ? "local" : "cloud";
}
function crystalSource(c) {
  return window.LAB_CONFIG.ui.dataSources[crystalSourceKey(c)].label;
}
function rows() {
  let subset = filtered.slice(page * 20, page * 20 + 20);
  $("rows").replaceChildren();
  for (const c of subset) {
    let tr = document.createElement("tr");
    for (const t of [
      c.name,
      c.group,
      c.roundness.toString(),
      crystalSource(c),
      "Single · Agglomerate · Broken",
    ]) {
      let td = document.createElement("td");
      td.textContent = t;
      tr.append(td);
    }
    let td = document.createElement("td"),
      b = document.createElement("button");
    b.textContent = "Inspect →";
    b.onclick = () => {
      select(c);
      tab("display");
    };
    td.append(b);
    tr.append(td);
    $("rows").append(tr);
  }
  $("matches").textContent = filtered.length + " matching crystals";
  $("page").textContent = `${page + 1} / ${Math.max(1, Math.ceil(filtered.length / 20))}`;
  $("prev").disabled = page === 0;
  $("next").disabled = (page + 1) * 20 >= filtered.length;
}
for (const id of ["group", "sort", "search"])
  $(id).addEventListener(id === "search" ? "input" : "change", list);
$("prev").onclick = () => {
  page--;
  rows();
};
$("next").onclick = () => {
  page++;
  rows();
};
function crystalOptions(g, id) {
  $("crystal").replaceChildren();
  for (const c of catalog.filter((c) => c.group === g))
    $("crystal").add(new Option(c.name + " · " + crystalSource(c), c.id));
  if (id) $("crystal").value = id;
}
function clearSurface() {
  cancelComputations();
  for (const id of ["recalculate", "export", "rotate", "reset"]) {
    $(id).disabled = true;
    $(id).title = "Load a crystal before using this control.";
  }
  shapes = null;
  mesh = null;
  curves = null;
  displayCurves = null;
  roundnessInfo = null;
  baseMesh = null;
  smoothTask++;
  calculationTask++;
  classificationState = null;
  for (const id of ["plot", "histogram"]) {
    const el = $(id);
    if (el) Plotly.purge(el);
  }
  for (const id of [
    "roundness",
    "calculated-roundness",
    "equivalent-diameter",
    "vertices",
    "faces",
    "type",
    "size",
  ]) {
    if ($(id)) $(id).textContent = "—";
  }
  $("histogram-card").hidden = true;
  $("plottitle").textContent = "No data loaded";
  $("method").textContent = "";
}
async function select(c) {
  if (!c) return;
  const token = ++loadToken;
  selected = c;
  const source = crystalSourceKey(c);
  $("data-source").dataset.source = source;
  $("data-source").textContent = crystalSource(c);
  $("data-source").title = window.LAB_CONFIG.ui.dataSources[source].description;
  clearSurface();
  $("viewgroup").value = c.group;
  crystalOptions(c.group, c.id);
  setProgress(5, "Loading crystal data…");
  $("data-error").hidden = true;
  try {
    const loaded = await window.CrystalData.load(c.id);
    if (token !== loadToken) return;
    if (!loaded?.single) throw Error("The crystal data does not contain a single-crystal mesh.");
    shapes = loaded;
    for (const o of $("geometry").options) o.disabled = !shapes[o.value];
    if (!shapes[$("geometry").value]) $("geometry").value = "single";
    setMesh();
  } catch (e) {
    if (token !== loadToken) return;
    clearSurface();
    setProgress(0, "Unable to load crystal data");
    $("data-error").textContent = e.message;
    $("data-error").hidden = false;
    $("data-error").dataset.error = "true";
  }
}

function setMesh() {
  if (!shapes) return;
  cancelComputations();
  for (const id of ["export", "rotate", "reset"]) {
    $(id).disabled = false;
    $(id).title = "";
  }
  const original = shapes[$("geometry").value],
    pixel = 1,
    d =
      $("scale").value === "normalized"
        ? Math.cbrt((6 * original.volume * pixel ** 3) / Math.PI)
        : 1;
  $("voxel-size").value = 8;
  $("voxel-size").readOnly = true;
  mesh = {
    vertices: original.vertices.map((v) => v.map((x) => (x * pixel) / d)),
    faces: original.faces,
  };
  baseMesh = mesh;
  syncRotationLoop();
  curves = null;
  displayCurves = null;
  roundnessInfo = null;
  $("calculated-roundness").textContent = "…";
  updateIterationControls();
  const roundnessHeading = $("roundness").previousElementSibling;
  roundnessHeading.replaceChildren(document.createTextNode("Rheinhold roundness "));
  const roundnessUnit = document.createElement("span");
  roundnessHeading.append(roundnessUnit);
  renderFormula(roundnessUnit, "r_{\\mathrm{ref}}\\;[-]");
  $("roundness").nextElementSibling.textContent = "Parent single crystal";
  $("roundness").textContent = Number.isFinite(selected.roundness)
    ? selected.roundness
    : "Not supplied";
  const equivalentDiameter = Math.cbrt((6 * original.volume * pixel ** 3) / Math.PI);
  $("equivalent-diameter").textContent = equivalentDiameter.toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
  const diameterUnit = nativeUnit(),
    unitTex = diameterUnit === "µm" ? "\\mu\\mathrm{m}" : "\\mathrm{" + diameterUnit + "}";
  $("diameter-heading").replaceChildren(document.createTextNode("Equivalent diameter "));
  const headingUnit = document.createElement("span");
  $("diameter-heading").append(headingUnit);
  renderFormula(headingUnit, "d_{\\mathrm{e}}\\;[" + unitTex + "]");
  $("diameter-unit").textContent = "Volume-equivalent diameter";
  $("vertices").textContent = mesh.vertices.length.toLocaleString("en-US");
  $("faces").textContent = mesh.faces.length.toLocaleString("en-US");
  $("type").textContent = $("geometry").selectedOptions[0].text;
  $("size").textContent = "Original size group " + selected.group;
  $("plottitle").textContent = selected.name;
  $("status").textContent = "Mesh ready";
  $("method").textContent =
    "Reference roundness is independent of the local curvature estimator. " +
    ($("scale").value === "normalized"
      ? "Coordinates are normalised by this geometry’s volume-equivalent diameter."
      : "Coordinates retain the source units.");
  draw();
  if ($("smooth-enabled").checked) applySmoothing();
  else calculate();
}
$("viewgroup").onchange = () => {
  crystalOptions($("viewgroup").value);
  select(catalog.find((c) => c.id === $("crystal").value));
};
$("crystal").onchange = () => select(catalog.find((c) => c.id === $("crystal").value));
$("geometry").onchange = setMesh;
$("scale").onchange = setMesh;
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
        obt >= 0 ? (twice / 2) * (k === obt ? 0.5 : 0.25) : (len[a] * cot[a] + len[b] * cot[b]) / 8;
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
let calculationTask = 0;
async function calculate() {
  if (!mesh) return;
  const task = ++calculationTask,
    requestedField = $("field").value;
  $("status").textContent = "Calculating curvature…";
  await new Promise((r) => setTimeout(r, 30));
  if (task !== calculationTask || !mesh) return;
  try {
    const calculatedMesh = mesh;
    const calculated = await computeInWorker("curvature", calculatedMesh);
    if (mesh !== calculatedMesh || task !== calculationTask) return;
    curves = calculated;
    await updateSurfaceProcessing();
    if (mesh !== calculatedMesh || task !== calculationTask) return;
    draw();
    setProgress(100, "Ready");
    showMathMethod();
  } catch (e) {
    if (e.name !== "AbortError") setProgress(0, e.message);
  } finally {
  }
}
$("field").onchange = () => {
  if ($("field").value !== "solid" && !curves) calculate();
  else draw();
};
for (const id of ["palette", "edges", "axes", "limits"]) $(id).onchange = draw;
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
const activeComputations = new Set(),
  operationComputations = new Map();
function cancelComputations() {
  for (const cancel of [...activeComputations]) cancel();
}
let progressSerial = 0;
async function computeInWorker(operation, m, options = {}) {
  operationComputations.get(operation)?.();
  const workerID = ++progressSerial;
  const source =
    "const sub=" +
    sub.toString() +
    ";const dot=" +
    dot.toString() +
    ";const cross=" +
    cross.toString() +
    ";" +
    curvature.toString() +
    ";" +
    smoothMesh.toString() +
    ";" +
    histogramCounts.toString() +
    ";" +
    multiOtsu.toString() +
    ";" +
    classifyMean.toString() +
    ";" +
    smoothScalar.toString() +
    ";" +
    processSurface.toString() +
    ";" +
    classifyTarget.toString() +
    ";onmessage=e=>{try{const {operation,m,options}=e.data;if(operation==='surface'){postMessage({progress:65,message:'Smoothing curvature values…'});postMessage({result:processSurface(m,options.curves,options)});}else if(operation==='classify'){postMessage({progress:94,message:'Calculating Multi-Otsu classes…'});postMessage({result:classifyTarget(options.H,options.nClasses,options.positiveOnly)});}else if(operation==='smooth'){postMessage({progress:15,message:'Calculating initial curvature…'});const initial=curvature(m);const mesh=smoothMesh(m,initial.H,options.iterations,options.finalIterations,options.strength,fraction=>postMessage({progress:Math.round(25+fraction*30),message:'Smoothing mesh…'}));postMessage({progress:60,message:'Calculating smoothed curvature…'});postMessage({result:{mesh,curves:curvature(mesh)}});}else{postMessage({progress:20,message:'Calculating curvature…'});postMessage({result:curvature(m)});}}catch(error){postMessage({error:error.message});}}";
  const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" })),
    worker = new Worker(url);
  return new Promise((resolve, reject) => {
    let cancel, deadline;
    const finish = () => {
      clearTimeout(deadline);
      worker.terminate();
      URL.revokeObjectURL(url);
      activeComputations.delete(cancel);
      if (operationComputations.get(operation) === cancel) operationComputations.delete(operation);
    };
    cancel = () => {
      finish();
      const error = Error("Calculation replaced by a newer request.");
      error.name = "AbortError";
      reject(error);
    };
    activeComputations.add(cancel);
    operationComputations.set(operation, cancel);
    deadline = setTimeout(() => {
      finish();
      setProgress(
        0,
        "Calculation stopped after 30 seconds. Reduce smoothing iterations and retry, or use Reset all.",
      );
      reject(
        Error(
          "Calculation time limit reached. Reduce smoothing iterations and retry, or use Reset all.",
        ),
      );
    }, 30000);
    worker.onmessage = (e) => {
      if (e.data.progress !== undefined) {
        if (workerID === progressSerial) setProgress(e.data.progress, e.data.message);
        return;
      }
      finish();
      e.data.error ? reject(Error(e.data.error)) : resolve(e.data.result);
    };
    worker.onerror = (e) => {
      finish();
      reject(Error(e.message));
    };
    worker.postMessage({ operation, m, options });
  });
}
let smoothTask = 0;
async function applySmoothing() {
  if (!baseMesh) return;
  if (!$("smooth-enabled").checked) {
    setMesh();
    return;
  }
  updateIterationControls();
  let iterations = numericInput("smooth-iterations"),
    finalIterations = numericInput("smooth-final"),
    strength = numericInput("smooth-strength");
  if (
    !Number.isInteger(iterations) ||
    iterations < 0 ||
    iterations > 50 ||
    !Number.isInteger(finalIterations) ||
    finalIterations < 0 ||
    finalIterations > 50 ||
    !Number.isFinite(strength) ||
    strength < 0 ||
    strength > 1
  ) {
    $("status").textContent = "Use 0–50 iterations and strength from 0 to 1.";
    return;
  }
  const inputMesh = baseMesh,
    task = ++smoothTask;
  setProgress(10, "Preparing mesh smoothing…");
  try {
    const result = await computeInWorker("smooth", inputMesh, {
      iterations,
      finalIterations,
      strength,
    });
    if (inputMesh !== baseMesh || task !== smoothTask || !$("smooth-enabled").checked) return;
    mesh = result.mesh;
    curves = result.curves;
    await updateSurfaceProcessing();
    if (inputMesh !== baseMesh || task !== smoothTask) return;
    draw();
    setProgress(100, "Ready · smoothed mesh");
    $("method").textContent =
      "Mesh smoothing: " +
      iterations +
      " curvature-weighted iterations + " +
      iterations +
      " complementary iterations + " +
      finalIterations +
      " uniform iterations (strength " +
      strength +
      "). Curvature is recalculated on the smoothed geometry. Original data and reference roundness are preserved.";
  } catch (e) {
    if (e.name !== "AbortError") setProgress(0, e.message);
  } finally {
    if (task === smoothTask) {
    }
  }
}
$("smooth-enabled").onchange = () => {
  if ($("smooth-enabled").checked) applySmoothing();
  else {
    smoothTask++;
    setMesh();
  }
};
let smoothTimer;
for (const id of ["smooth-iterations", "smooth-final", "smooth-strength"])
  $(id).oninput = () => {
    markAnalysisPending(true);
    clearTimeout(smoothTimer);
    if ($("smooth-enabled").checked)
      smoothTimer = setTimeout(() => applySmoothing().catch((e) => setProgress(0, e.message)), 300);
  };
const CLASS_COLOURS = [
  "#1e90ff",
  "#32cd32",
  "#ff6347",
  "#ffa500",
  "#ffff00",
  "#00ffff",
  "#ff00ff",
  "#800080",
  "#b0c4de",
  "#bc8f8f",
];
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
let classificationState = null;
function classificationForCurrent() {
  const source = displayCurves || curves;
  if (!$("discrete").checked || $("calculation-mode").value !== "discrete" || !source) return null;
  const n = numericInput("n-classes");
  if (!Number.isInteger(n) || n < 2 || n > 10) {
    $("status").textContent = "Choose 2–10 Multi-Otsu classes.";
    return null;
  }
  if (
    classificationState?.source === source &&
    classificationState.n === n &&
    classificationState.positive === $("positive-only").checked
  )
    return classificationState.result || null;
  const state = (classificationState = {
    source,
    n,
    positive: $("positive-only").checked,
    result: null,
  });
  $("status").textContent = "Calculating Multi-Otsu classes…";
  computeInWorker("classify", mesh, {
    H: source[$("curvature-source").value],
    nClasses: n,
    positiveOnly: $("positive-only").checked,
  })
    .then((result) => {
      if (state !== classificationState || state.source !== (displayCurves || curves)) return;
      state.result = result;
      setProgress(100, "Ready · Multi-Otsu");
      draw();
    })
    .catch((error) => {
      if (state === classificationState && error.name !== "AbortError")
        setProgress(0, error.message);
    });
  return null;
}
function drawHistogram(classified) {
  const field = $("field").value,
    weightMode = field === "weights",
    weightCurve = weightMode || !!classified,
    axisField = weightMode ? $("curvature-source").value : field,
    values = weightMode
      ? roundnessInfo?.target
      : classified?.target || displayCurves?.[field] || curves?.[field];
  $("histogram-card").hidden = !values;
  if (!values) return;
  const h = histogramCounts(values, 100),
    smoothed = h.counts.map(
      (_, i) => ((h.counts[i - 1] || 0) + h.counts[i] + (h.counts[i + 1] || 0)) / 3,
    ),
    thresholds = classified?.thresholds || [],
    traces = [];
  if (classified && !weightMode) {
    for (let c = 0; c < classified.nClasses; c++) {
      const indices = h.centres
        .map((x, i) => (thresholds.filter((t) => x > t).length === c ? i : -1))
        .filter((i) => i >= 0);
      traces.push({
        type: "bar",
        x: indices.map((i) => h.centres[i]),
        y: indices.map((i) => smoothed[i]),
        width: h.width,
        name: "Class " + (c + 1),
        marker: { color: CLASS_COLOURS[c] },
        hovertemplate:
          "Curvature %{x:.4g}<br>Vertex count %{y:.4g}<extra>Class " + (c + 1) + "</extra>",
      });
    }
  } else
    traces.push({
      type: "bar",
      x: h.centres,
      y: smoothed,
      width: h.width,
      name: "Vertex count",
      marker: {
        color: weightMode
          ? h.centres.map((x) => {
              let maximum = -Infinity;
              for (const v of values) maximum = Math.max(maximum, v);
              const sigma = maximum * numericInput("sigma-ratio");
              return sigma > 0
                ? 1 -
                    Math.exp(
                      -((Math.max(0, x) / (sigma * Math.sqrt(2))) ** numericInput("weight-order")),
                    )
                : 0;
            })
          : h.centres,
        colorscale: colourMapping?.scale || "Rainbow",
        cmin: colourMapping?.lo,
        cmax: colourMapping?.hi,
        showscale: false,
      },
      hovertemplate: "Curvature %{x:.4g}<br>Vertex count %{y:.4g}<extra></extra>",
    });
  if (weightCurve) {
    let maximum = -Infinity;
    for (const x of roundnessInfo?.target || values) maximum = Math.max(maximum, x);
    const sigma = maximum * numericInput("sigma-ratio"),
      x = Array.from({ length: 256 }, (_, i) => h.lo + ((h.hi - h.lo) * i) / 255),
      y = x.map((v) =>
        sigma > 0
          ? 1 -
            Math.exp(-((Math.max(0, v) / (sigma * Math.sqrt(2))) ** numericInput("weight-order")))
          : 0,
      );
    traces.push({
      type: "scatter",
      mode: "lines",
      x,
      y,
      yaxis: "y2",
      name: "Weight",
      line: { color: "#263b33", width: 2, dash: "dot" },
      hovertemplate: "Weight %{y:.4f}<extra></extra>",
    });
  }
  $("histogram-title").textContent = weightMode
    ? "CURVATURE DISTRIBUTION & WEIGHT"
    : classified
      ? "MULTI-OTSU & WEIGHT · MATCHED CLASS COLOURS"
      : "100 BINS · 3-BIN MOVING AVERAGE";
  const title =
    "$\\text{" +
    {
      H: "Mean curvature",
      K: "Gaussian curvature",
      k1: "Principal curvature",
      k2: "Principal curvature",
    }[axisField] +
    "}\\;" +
    curvatureLabel(axisField, true) +
    "$";
  Plotly.react(
    "histogram",
    traces,
    {
      margin: { l: 65, r: weightCurve ? 80 : 25, t: 35, b: 65 },
      paper_bgcolor: "#fff",
      plot_bgcolor: "#fff",
      bargap: 0,
      barmode: "overlay",
      font: window.LabCharts.font(12),
      xaxis: { title: { text: title }, gridcolor: "#edf0eb", zeroline: false },
      yaxis: {
        title: { text: "$\\text{Vertex count}\\;[\\#]$" },
        gridcolor: "#edf0eb",
        zeroline: false,
      },
      ...(weightCurve
        ? {
            yaxis2: {
              title: { text: "$\\text{Weight}\\;w\\;[-]$" },
              overlaying: "y",
              side: "right",
              range: [0, 1],
              showgrid: false,
              zeroline: false,
            },
          }
        : {}),
      showlegend: !!classified || weightCurve,
      legend: { orientation: "h", y: 1.17 },
      shapes: weightMode
        ? []
        : thresholds.map((x) => ({
            type: "line",
            x0: x,
            x1: x,
            y0: 0,
            y1: 1,
            yref: "paper",
            line: { color: "red", width: 1.5, dash: "dash" },
          })),
    },
    { responsive: true, displaylogo: false },
  );
}

$("discrete").onchange = () => {
  $("otsu-settings").hidden = !$("discrete").checked;
  draw();
};
$("n-classes").oninput = () => {
  updateRoundnessClasses();
  classificationState = null;
  draw();
};

function curvatureLabel(field, latex = false) {
  if (field === "weights") return latex ? "w\\;[-]" : "Roundness weight w [–]";
  const normal = $("scale").value === "normalized",
    unit = nativeUnit(),
    names = {
      H: "Mean curvature",
      K: "Gaussian curvature",
      k1: "Principal curvature",
      k2: "Principal curvature",
    },
    symbols = { H: "H", K: "K", k1: "κ₁", k2: "κ₂" },
    texSymbols = { H: "H", K: "K", k1: "\\kappa_1", k2: "\\kappa_2" };
  if (!names[field]) return "";
  if (latex) {
    const u = unit === "µm" ? "\\mu\\mathrm{m}" : "\\mathrm{" + unit + "}",
      variable =
        texSymbols[field] +
        (normal ? (field === "K" ? "\\cdot d_{\\mathrm{e}}^{2}" : "\\cdot d_{\\mathrm{e}}") : ""),
      units = normal ? "[-]" : "[" + u + "^{" + (field === "K" ? "-2" : "-1") + "}]";
    return variable + "\\;" + units;
  }
  return (
    names[field] +
    " " +
    symbols[field] +
    (normal ? (field === "K" ? "·dₑ²" : "·dₑ") : "") +
    " [" +
    (normal ? "–" : unit + (field === "K" ? "⁻²" : "⁻¹")) +
    "]"
  );
}
let colourTitleToken = 0;
async function updateColourTitle(classified) {
  const token = ++colourTitleToken,
    element = $("colorbar-title");
  if ($("field").value === "solid") {
    element.hidden = true;
    return;
  }
  try {
    await MathJax.startup.promise;
    if (token !== colourTitleToken) return;
    const tex = classified ? "\\text{Curvature class}" : curvatureLabel($("field").value, true),
      rendered = await MathJax.tex2svgPromise(tex, { display: false });
    if (token !== colourTitleToken) return;
    element.replaceChildren(rendered);
    const fill = $("plot").querySelector(".cbfill");
    if (!fill) {
      element.hidden = true;
      return;
    }
    const box = fill.getBoundingClientRect(),
      parent = element.parentElement.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) {
      element.hidden = true;
      return;
    }
    element.style.left = box.left + box.width / 2 - parent.left + "px";
    element.style.top = box.top - parent.top - 12 + "px";
    element.hidden = false;
  } catch (e) {
    element.hidden = true;
  }
}
let colourMapping = null;
function draw() {
  if (!mesh) return;
  updateMathField();
  $("lighting").disabled = $("field").value !== "solid";
  $("palette").disabled =
    $("field").value === "solid" || $("field").value === "weights" || $("discrete").checked;
  $("limits").disabled = $("palette").disabled;
  for (const id of ["cut-left", "cut-right"])
    $(id).disabled = $("limits").disabled || $("limits").value === "full";
  for (const o of $("field").options) if (o.value !== "solid") o.text = curvatureLabel(o.value);
  const coordinateNote = $("coordinate-note");
  if ($("scale").value === "normalized") {
    coordinateNote.replaceChildren(document.createTextNode("Coordinates are divided by "));
    const symbol = document.createElement("span");
    coordinateNote.append(symbol);
    renderFormula(symbol, "d_{\\mathrm{e}}");
    coordinateNote.append(document.createTextNode("; curvature labels are dimensionless."));
  } else coordinateNote.textContent = "Coordinate unit: " + nativeUnit() + ".";
  $("discrete").disabled = false;
  const classified = classificationForCurrent();
  const v = mesh.vertices,
    f = mesh.faces,
    field = $("field").value,
    values = displayCurves?.[field] || curves?.[field];
  let trace = {
    type: "mesh3d",
    x: v.map((p) => p[0]),
    y: v.map((p) => p[1]),
    z: v.map((p) => p[2]),
    i: f.map((p) => p[0]),
    j: f.map((p) => p[1]),
    k: f.map((p) => p[2]),
    color: "#d5e6db",
    vertexcolor: null,
    facecolor: null,
    intensity: null,
    colorscale: null,
    showscale: false,
    cmin: null,
    cmax: null,
    flatshading: false,
    lighting: { ambient: 0.55, diffuse: 0.85, specular: 0.15, roughness: 0.65 },
    hoverinfo: "skip",
  };
  if (values) {
    let sorted = values.filter(Number.isFinite).sort((a, b) => a - b),
      robust = $("limits").value === "robust";
    Object.assign(trace, {
      intensity: values,
      colorscale: $("palette").value,
      cmin: sorted[
        Math.floor(
          sorted.length *
            (robust ? Math.min(49, Math.max(0, numericInput("cut-left") || 0)) / 100 : 0),
        )
      ],
      cmax: sorted[
        Math.min(
          sorted.length - 1,
          Math.floor(
            sorted.length *
              (robust ? 1 - Math.min(49, Math.max(0, numericInput("cut-right") || 0)) / 100 : 1),
          ),
        )
      ],
      showscale: true,
      colorbar: { title: { text: "" }, thickness: 16, len: 0.8 },
    });
  }
  if (classified) {
    trace.vertexcolor = null;
    trace.intensity = classified.classes.map((c) => c + 1);
    trace.cmin = 0.5;
    trace.cmax = classified.nClasses + 0.5;
    trace.colorscale = CLASS_COLOURS.slice(0, classified.nClasses).flatMap((colour, i) => [
      [i / classified.nClasses, colour],
      [(i + 1) / classified.nClasses, colour],
    ]);
    trace.showscale = true;
    trace.colorbar = {
      title: { text: "" },
      tickvals: CLASS_COLOURS.slice(0, classified.nClasses).map((_, i) => i + 1),
      ticktext: CLASS_COLOURS.slice(0, classified.nClasses).map((_, i) => "Class " + (i + 1)),
      thickness: 16,
      len: 0.8,
    };
  }
  if (field === "weights" && values) {
    trace.cmin = 0;
    trace.cmax = 1;
    trace.colorscale = "Blues";
  }
  colourMapping = { scale: trace.colorscale, lo: trace.cmin, hi: trace.cmax };
  const lightingPresets = {
    soft: { ambient: 0.8, diffuse: 0.65, specular: 0.12, roughness: 0.8 },
    studio: { ambient: 0.55, diffuse: 0.85, specular: 0.35, roughness: 0.45 },
    side: { ambient: 0.35, diffuse: 0.95, specular: 0.2, roughness: 0.65 },
  };
  trace.lighting =
    lightingPresets[$("field").value === "solid" ? $("lighting").value : "soft"] ||
    lightingPresets.soft;
  trace.lightposition = { x: 100, y: 150, z: 200 };
  if (field === "solid") {
    trace.intensity = v.map(() => 0);
    trace.colorscale = [
      [0, "#a8c8bc"],
      [1, "#a8c8bc"],
    ];
    trace.cmin = 0;
    trace.cmax = 1;
    trace.showscale = false;
  }
  let traces = [trace];
  if ($("edges").checked) {
    let x = [],
      y = [],
      z = [];
    for (const t of f) {
      for (const i of [...t, t[0]]) {
        x.push(v[i][0]);
        y.push(v[i][1]);
        z.push(v[i][2]);
      }
      x.push(null);
      y.push(null);
      z.push(null);
    }
    traces.push({
      type: "scatter3d",
      mode: "lines",
      x,
      y,
      z,
      line: { color: "#3d5d52", width: 1 },
      hoverinfo: "skip",
      showlegend: false,
    });
  }
  let axes = $("axes").checked,
    axis = (t) => ({
      visible: axes,
      title: { text: t },
      showbackground: false,
      gridcolor: "#e6ebe4",
      zeroline: false,
    });
  Plotly.react(
    "plot",
    traces,
    {
      margin: { l: 0, r: values ? 85 : 0, t: 0, b: 0 },
      paper_bgcolor: "#fff",
      font: window.LabCharts.font(12),
      scene: {
        aspectmode: "data",
        xaxis: axis($("scale").value === "normalized" ? "x/dₑ [–]" : "x [" + nativeUnit() + "]"),
        yaxis: axis($("scale").value === "normalized" ? "y/dₑ [–]" : "y [" + nativeUnit() + "]"),
        zaxis: axis($("scale").value === "normalized" ? "z/dₑ [–]" : "z [" + nativeUnit() + "]"),
        camera: { eye: { x: 1.5, y: 1.5, z: 1.1 } },
      },
      uirevision: "surface-camera",
    },
    { responsive: true, displaylogo: false, modeBarButtonsToRemove: ["toImage"] },
  ).then(() => updateColourTitle(classified));
  updateFieldHeading(classified);
  updateRoundnessMetric(classified);
  drawHistogram(classified);
}
window.addEventListener("resize", () =>
  setTimeout(() => updateColourTitle(!!classificationForCurrent()), 120),
);
$("reset").onclick = () =>
  Plotly.relayout("plot", { "scene.camera.eye": { x: 1.5, y: 1.5, z: 1.1 } });
$("export").onclick = () => {
  if (mesh)
    Plotly.downloadImage("plot", {
      format: "png",
      filename: selected.name + "_" + $("geometry").value,
      width: 1200,
      height: 1000,
    });
};
$("rotate").onclick = () => {
  rotating = !rotating;
  $("rotate").textContent = rotating ? "Pause rotation" : "Resume rotation";
  syncRotationLoop();
};
let last = 0,
  rotationFrame = null;
function canRotate() {
  return !document.hidden && rotating && mesh && !$("display").hidden;
}
function syncRotationLoop() {
  if (rotationFrame !== null) cancelAnimationFrame(rotationFrame);
  rotationFrame = null;
  last = 0;
  if (canRotate()) rotationFrame = requestAnimationFrame(animate);
}
function animate(t) {
  rotationFrame = null;
  if (!canRotate()) return;
  if (!last) last = t;
  if (t - last > 60) {
    theta += (numericInput("speed") * (t - last)) / 1000;
    Plotly.relayout("plot", {
      "scene.camera.eye": { x: 2 * Math.cos(theta), y: 2 * Math.sin(theta), z: 0.9 },
    });
    last = t;
  }
  rotationFrame = requestAnimationFrame(animate);
}
document.addEventListener("visibilitychange", syncRotationLoop);
function nativeUnit() {
  return "µm";
}
function updateIterationControls() {
  if (!baseMesh) return;
  const n = (baseMesh.vertices.length / 1e4) ** 0.25,
    paper = $("smooth-preset").value === "paper";
  const meshOff = !$("smooth-enabled").checked;
  $("smooth-preset").disabled = meshOff;
  $("smooth-iterations").disabled = paper || meshOff;
  $("smooth-final").disabled = paper || meshOff;
  $("smooth-strength").disabled = paper || meshOff;
  if (paper) $("smooth-strength").value = 0.5;
  if (paper) {
    $("smooth-iterations").value = Math.floor(3 * n);
    $("smooth-final").value = Math.floor(3 * n);
  }
  const surfacePaper = $("surface-preset").value === "paper";
  const surfaceOff = !$("surface-smooth").checked;
  $("surface-preset").disabled = surfaceOff;
  $("surface-iterations").disabled = surfacePaper || surfaceOff;
  if (surfacePaper) {
    $("surface-iterations").value = Math.floor(15 * n);
    $("surface-strength").value = 0.99;
  }
  $("surface-strength").disabled = surfacePaper || surfaceOff;
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
function markAnalysisPending(cancelOld = false) {
  if (cancelOld) {
    cancelComputations();
    smoothTask++;
    calculationTask++;
    surfaceTask++;
    clearTimeout(surfaceTimer);
    clearTimeout(smoothTimer);
  }
  roundnessInfo = null;
  classificationState = null;
  $("calculated-roundness").textContent = "—";
  $("export").disabled = true;
  $("export").title = "Wait for a successful calculation before exporting the updated analysis.";
}
let surfaceTask = 0;
async function updateSurfaceProcessing() {
  if (!mesh || !curves) return;
  markAnalysisPending();
  updateIterationControls();
  const inputMesh = mesh,
    inputCurves = curves,
    task = ++surfaceTask,
    iterations = numericInput("surface-iterations"),
    strength = numericInput("surface-strength");
  if (
    !Number.isInteger(iterations) ||
    iterations < 0 ||
    iterations > 200 ||
    !Number.isFinite(strength) ||
    strength < 0 ||
    strength > 1
  ) {
    throw Error("Use 0–200 curvature iterations and strength from 0 to 1.");
  }
  setProgress(65, "Processing curvature and roundness…");
  const result = await computeInWorker("surface", mesh, {
    curves,
    enabled: $("surface-smooth").checked,
    iterations,
    strength,
    targetField: $("curvature-source").value,
    sigmaRatio: numericInput("sigma-ratio"),
    order: numericInput("weight-order"),
  });
  if (inputMesh !== mesh || inputCurves !== curves || task !== surfaceTask) return;
  displayCurves = result.display;
  roundnessInfo = result;
  $("calculated-roundness").textContent = result.roundness.toFixed(5);
  draw();
  setProgress(100, "Ready");
  $("export").disabled = false;
  $("export").title = "";
}
let surfaceTimer;
for (const id of ["surface-smooth", "surface-preset", "surface-iterations", "surface-strength"])
  $(id).addEventListener(
    id === "surface-iterations" || id === "surface-strength" ? "input" : "change",
    () => {
      markAnalysisPending(true);
      clearTimeout(surfaceTimer);
      surfaceTimer = setTimeout(
        () =>
          updateSurfaceProcessing().catch((e) => {
            if (e.name !== "AbortError") setProgress(0, e.message);
          }),
        200,
      );
    },
  );
$("smooth-preset").onchange = () => {
  updateIterationControls();
  if ($("smooth-enabled").checked) applySmoothing().catch((e) => setProgress(0, e.message));
};
$("positive-only").onchange = () => {
  classificationState = null;
  draw();
};

const formulaCache = new Map();
async function renderFormula(element, tex) {
  element.dataset.tex = tex;
  try {
    await MathJax.startup.promise;
    if (!formulaCache.has(tex))
      formulaCache.set(tex, MathJax.tex2svgPromise(tex, { display: false }));
    const node = await formulaCache.get(tex);
    if (element.dataset.tex !== tex) return;
    element.replaceChildren(node.cloneNode(true));
  } catch (e) {
    element.textContent = tex;
  }
}
let mathFieldKey = "";
function updateMathField() {
  const source = $("curvature-source").value,
    key = source + "|" + $("scale").value + "|" + nativeUnit();
  if (key === mathFieldKey) return;
  mathFieldKey = key;
  updateWeightFormula();
  const names = {
    H: "Mean curvature",
    K: "Gaussian curvature",
    k1: "Principal curvature",
    k2: "Principal curvature",
  };
  function content(e, v) {
    e.replaceChildren(document.createTextNode(names[v]));
    const f = document.createElement("span");
    f.className = "inline-formula";
    e.append(f);
    renderFormula(f, curvatureLabel(v, true));
  }
  content($("field-trigger"), source);
  $("field-menu").replaceChildren();
  for (const value of ["H", "K", "k1", "k2"]) {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.value = value;
    b.setAttribute("role", "option");
    b.setAttribute("aria-selected", value === source);
    content(b, value);
    b.onclick = () => {
      $("curvature-source").value = value;
      $("field-menu").hidden = true;
      $("field-trigger").setAttribute("aria-expanded", "false");
      $("field-trigger").focus();
      syncCalculationMode();
    };
    $("field-menu").append(b);
  }
}

function updateFieldHeading(classified) {
  const e = $("fieldtitle"),
    mode = $("calculation-mode").selectedOptions[0].text;
  e.replaceChildren(document.createTextNode(mode + " · "));
  const f = document.createElement("span");
  e.append(f);
  renderFormula(f, curvatureLabel($("curvature-source").value, true));
}

function showMathMethod() {
  const note = $("method");
  note.textContent =
    "Mixed Voronoi vertex areas, angle-weighted normals, angle-defect Gaussian curvature and the signed cotangent Laplacian. Principal curvatures: ";
  const formula = document.createElement("span");
  note.append(formula);
  renderFormula(formula, "\\kappa_{1,2}=H\\pm\\sqrt{\\max(H^2-K,0)}");
  note.append(document.createTextNode(". Colour clipping affects display only."));
}
$("field-trigger").onclick = (e) => {
  e.preventDefault();
  e.stopPropagation();
  $("field-menu").hidden = !$("field-menu").hidden;
  $("field-trigger").setAttribute("aria-expanded", String(!$("field-menu").hidden));
};
document.addEventListener("click", (e) => {
  if (!e.target.closest(".math-select")) {
    $("field-menu").hidden = true;
    $("field-trigger").setAttribute("aria-expanded", "false");
  }
});
$("field-trigger").onkeydown = (e) => {
  if (e.key === "Escape") {
    $("field-menu").hidden = true;
    $("field-trigger").setAttribute("aria-expanded", "false");
  }
  if (e.key === "ArrowDown") {
    e.preventDefault();
    $("field-menu").hidden = false;
    $("field-trigger").setAttribute("aria-expanded", "true");
    (
      $("field-menu").querySelector('[aria-selected="true"]') ||
      $("field-menu").querySelector("button")
    )?.focus();
  }
};
$("field-menu").onkeydown = (e) => {
  const options = [...$("field-menu").querySelectorAll("button")],
    index = options.indexOf(document.activeElement);
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    options[(index + (e.key === "ArrowDown" ? 1 : options.length - 1)) % options.length]?.focus();
  }
  if (e.key === "Home" || e.key === "End") {
    e.preventDefault();
    options[e.key === "Home" ? 0 : options.length - 1]?.focus();
  }
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    $("field-menu").hidden = true;
    $("field-trigger").setAttribute("aria-expanded", "false");
    $("field-trigger").focus();
  }
};

function setProgress(value, message) {
  $("status").textContent = message;
  $("recalculate").textContent =
    value === 5 && !mesh
      ? "Loading data…"
      : value > 0 && value < 100
        ? "Calculating " + Math.round(value) + "%"
        : !mesh && selected
          ? "Retry loading"
          : "Recalculate";
  $("recalculate").title = message;
  $("progress-fill").style.width = Math.max(0, Math.min(100, value)) + "%";
  $("progress-percent").textContent = Math.round(value) + "%";
  $("progress-track").setAttribute("aria-valuenow", String(Math.round(value)));
  $("recalculate").disabled = (!mesh && !selected) || (value < 100 && value > 0);
  $("progress-track").setAttribute("aria-valuetext", message);
  $("progress-track").setAttribute("aria-busy", String(value > 0 && value < 100));
}
$("recalculate").onclick = () => {
  if (!mesh && selected) {
    select(selected);
    return;
  }
  setProgress(0, "Preparing recalculation…");
  setMesh();
};

window.CurvatureLab = {
  curvature,
  smoothMesh,
  multiOtsu,
  classifyMean,
  get roundness() {
    return roundnessInfo;
  },
  get displayCurves() {
    return displayCurves;
  },
  get classification() {
    return classificationState?.result;
  },
  get mesh() {
    return mesh;
  },
  get curves() {
    return curves;
  },
  get selected() {
    return selected;
  },
  select,
};
const defaultGroup = groups[Math.floor(groups.length / 2)],
  defaultCrystals = catalog.filter((c) => c.group === defaultGroup),
  defaultCrystal =
    catalog.find((c) => c.id === "300_350__crystal_307_0p43761") || defaultCrystals[0];
list();
crystalOptions(defaultGroup);
select(defaultCrystal);

$("reset-all").onclick = async () => {
  rotating = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  theta = 0;
  $("rotate").textContent = rotating ? "Pause rotation" : "Resume rotation";
  clearTimeout(smoothTimer);
  clearTimeout(surfaceTimer);
  smoothTask++;
  calculationTask++;
  classificationState = null;
  selectedRoundnessClasses.clear();
  selectedRoundnessClasses.add(1);
  selectedRoundnessClasses.add(2);
  roundnessClassCount = 3;
  for (const id of ["discrete", "edges", "axes"]) $(id).checked = false;
  $("smooth-enabled").checked = true;
  for (const id of ["smooth-iterations", "smooth-final", "smooth-strength", "n-classes"])
    $(id).value = $(id).defaultValue;
  $("surface-smooth").checked = true;
  $("positive-only").checked = true;
  $("surface-preset").value = "paper";
  $("smooth-preset").value = "paper";
  $("surface-iterations").value = 15;
  $("surface-strength").value = 0.99;
  $("otsu-settings").hidden = true;
  $("field").value = "H";
  $("scale").value = "normalized";
  $("palette").value = "Rainbow";
  $("limits").value = "robust";
  $("speed").value = "0.4";
  $("group").value = defaultGroup;
  $("sort").value = "name";
  $("search").value = "";
  $("lighting").value = "soft";
  $("geometry").value = "single";
  $("curvature-source").value = "H";
  const mode = $("calculation-mode");
  mode.value =
    [...mode.options].find((option) => option.defaultSelected)?.value || mode.options[0].value;
  for (const id of ["sigma-ratio", "weight-order", "cut-left", "cut-right"])
    $(id).value = $(id).defaultValue;
  document.querySelectorAll("input").forEach((input) => {
    input.setCustomValidity("");
    input.classList.remove("invalid");
  });
  list();
  await select(defaultCrystal);
  if ($("plot").data) Plotly.relayout("plot", { "scene.camera.eye": { x: 1.5, y: 1.5, z: 1.1 } });
};

$("lighting").onchange = () => draw();

for (const id of ["cut-left", "cut-right"]) $(id).oninput = () => draw();

function updateRoundnessMetric(classified) {
  if (!roundnessInfo) return;
  const heading = $("calculated-roundness").previousElementSibling;
  heading.replaceChildren(
    document.createTextNode(
      $("curvature-source").value === "H" ? "Roundness " : "Extended roundness ",
    ),
  );
  const unit = document.createElement("span");
  heading.append(unit);
  renderFormula(unit, "r\\;[-]");
  let value = roundnessInfo.roundness;
  if ($("calculation-mode").value === "discrete") {
    if (!classified) {
      $("calculated-roundness").textContent = "…";
      return;
    }
    const areas = curves.areas;
    value =
      areas.reduce(
        (sum, a, i) => sum + (selectedRoundnessClasses.has(classified.classes[i]) ? a : 0),
        0,
      ) / areas.reduce((a, b) => a + b, 0);
  }
  $("calculated-roundness").textContent = value.toFixed(5);
  const text =
    $("calculation-mode").value === "discrete"
      ? "Classes " +
        [...selectedRoundnessClasses]
          .sort((a, b) => a - b)
          .map((i) => i + 1)
          .join(" + ") +
        " / total area"
      : "Continuous weighted";
  $("roundness-difference").textContent =
    text +
    " · " +
    {
      H: "mean curvature",
      K: "Gaussian curvature",
      k1: "first principal curvature",
      k2: "second principal curvature",
    }[$("curvature-source").value];
}
function syncCalculationMode() {
  const mode = $("calculation-mode").value;
  $("field").value =
    mode === "weights" ? "weights" : mode === "solid" ? "solid" : $("curvature-source").value;
  $("discrete").checked = mode === "discrete";
  $("otsu-settings").hidden = mode !== "discrete";
  $("weight-settings").hidden = mode === "solid";
  classificationState = null;
  mathFieldKey = "";
  updateMathField();
  if (curves)
    updateSurfaceProcessing().catch((e) => {
      if (e.name !== "AbortError") setProgress(0, e.message);
    });
  else draw();
}
$("calculation-mode").onchange = syncCalculationMode;
for (const id of ["sigma-ratio", "weight-order"])
  $(id).onchange = () => {
    const ratio = numericInput("sigma-ratio"),
      order = numericInput("weight-order");
    if (!(ratio > 0) || !(order >= 1 && order <= 20)) return;
    syncCalculationMode();
  };
function updateWeightFormula() {
  const c = curvatureLabel($("curvature-source").value, true).replace(/\\;\[.*\]$/, "");
  renderFormula(
    $("weight-formula"),
    "\\begin{aligned}&w(c;r,n)=1-\\exp\\!\\left[-\\left(\\frac{\\max(c,0)}{\\sqrt{2}\\sigma}\\right)^n\\right]\\\\[4pt]&c=" +
      c +
      ",\\qquad\\sigma=r\\max(c)\\end{aligned}",
  );
}
updateWeightFormula();

const selectedRoundnessClasses = new Set([1, 2]);
let roundnessClassCount = 3;
function updateRoundnessClasses() {
  let n;
  try {
    n = numericInput("n-classes");
  } catch (e) {
    return;
  }
  if (!Number.isInteger(n) || n < 2 || n > 10) return;
  for (const c of [...selectedRoundnessClasses]) if (c >= n) selectedRoundnessClasses.delete(c);
  if (n > roundnessClassCount)
    for (let c = roundnessClassCount; c < n; c++) selectedRoundnessClasses.add(c);
  roundnessClassCount = n;
  const container = $("roundness-class-options");
  container.replaceChildren();
  for (let c = 0; c < n; c++) {
    const label = document.createElement("label");
    label.className = "check";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = selectedRoundnessClasses.has(c);
    input.dataset.classIndex = c;
    input.onchange = () => {
      input.checked ? selectedRoundnessClasses.add(c) : selectedRoundnessClasses.delete(c);
      updateRoundnessMetric(classificationState?.result);
    };
    const swatch = document.createElement("span");
    swatch.className = "class-swatch";
    swatch.style.background = CLASS_COLOURS[c];
    label.append(input, swatch, document.createTextNode("Class " + (c + 1)));
    container.append(label);
  }
}
updateRoundnessClasses();

for (const id of ["smooth-enabled", "surface-smooth"])
  $(id).addEventListener("change", updateIterationControls);

window.addEventListener("lab:suspend", (event) => {
  if (event.detail.reason === "page-exit") {
    for (const cancel of [...activeComputations]) cancel();
    rotating = false;
    $("rotate").textContent = "Resume rotation";
    syncRotationLoop();
  }
});
