const { curvature, smoothMesh, histogramCounts, multiOtsu, classifyMean } =
  globalThis.CurvatureEngine;
const computationWorkerURL = new URL("worker.js", document.currentScript.src);
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
  loadToken = 0;
let loadingData = false,
  operationBusy = false;
const groups = [...new Set(catalog.map((c) => c.group))];
renderRotationButton();
$("rotate").setAttribute("aria-label", rotating ? "Pause rotation" : "Start rotation");
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
      ($("source-filter").value === "all" || crystalSourceKey(c) === $("source-filter").value) &&
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
function openLibraryCrystal(crystal, geometry = "single") {
  $("geometry").value = geometry;
  select(crystal);
  tab("display");
}
function rows() {
  let subset = filtered.slice(page * 20, page * 20 + 20);
  $("rows").replaceChildren();
  function action(label, accessibleName, onClick, className = "library-link") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    button.setAttribute("aria-label", accessibleName);
    button.onclick = onClick;
    return button;
  }
  for (const c of subset) {
    const tr = document.createElement("tr");
    const name = document.createElement("td");
    name.textContent = c.name;
    const geometries = document.createElement("td");
    const choices = document.createElement("div");
    choices.className = "library-geometries";
    for (const [value, label] of [
      ["single", "Single"],
      ["agglomerate", "Agglo"],
      ["broken", "Broken"],
    ]) {
      choices.append(
        action(
          label,
          "Inspect " + c.name + " · " + value,
          () => openLibraryCrystal(c, value),
          "library-geometry",
        ),
      );
    }
    geometries.append(choices);
    const size = document.createElement("td");
    size.textContent = c.group;
    const roundness = document.createElement("td");
    roundness.textContent = c.roundness.toString();
    const source = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = "source-badge";
    badge.dataset.source = crystalSourceKey(c);
    badge.textContent = crystalSource(c);
    source.append(badge);
    const inspect = document.createElement("td");
    inspect.append(
      action(
        "Inspect",
        "Inspect " + c.name + " as single crystal",
        () => openLibraryCrystal(c),
        "library-inspect",
      ),
    );
    tr.append(name, geometries, size, roundness, source, inspect);
    $("rows").append(tr);
  }
  $("matches").textContent = filtered.length + " matching crystals";
  $("page").textContent = `${page + 1} / ${Math.max(1, Math.ceil(filtered.length / 20))}`;
  $("prev").disabled = page === 0;
  $("next").disabled = (page + 1) * 20 >= filtered.length;
}
for (const id of ["group", "sort", "search", "source-filter"])
  $(id).addEventListener(id === "search" ? "input" : "change", list);
$("prev").onclick = () => {
  page--;
  rows();
};
$("next").onclick = () => {
  page++;
  rows();
};
const rememberedCrystals = new Map();
function crystalOptions(g, id) {
  $("crystal").replaceChildren();
  for (const c of catalog.filter((c) => c.group === g)) {
    const option = new Option(c.name, c.id);
    option.dataset.source = crystalSourceKey(c);
    $("crystal").add(option);
  }
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
  loadingData = true;
  selected = c;
  rememberedCrystals.set(c.group, c.id);
  const source = crystalSourceKey(c);
  $("crystal").dataset.source = source;
  $("data-source").dataset.source = source;
  $("data-source").textContent = crystalSource(c);
  $("data-source").title = window.LAB_CONFIG.ui.dataSources[source].description;
  clearSurface();
  $("viewgroup").value = c.group;
  crystalOptions(c.group, c.id);
  setProgress(
    0,
    source === "cloud" ? "Connecting to Zenodo…" : "Loading Local crystal…",
    "running",
  );
  $("data-error").hidden = true;
  let downloadPercent = -1;
  try {
    const loaded = await window.CrystalData.load(c.id, (fraction) => {
      const percent = Math.round(fraction * 100);
      if (token !== loadToken || percent <= downloadPercent) return;
      downloadPercent = percent;
      setProgress(
        percent,
        percent >= 100 ? "Unpacking crystal data…" : "Downloading crystal data…",
        "running",
      );
    });
    if (token !== loadToken) return;
    if (!loaded?.single) throw Error("The crystal data does not contain a single-crystal mesh.");
    loadingData = false;
    shapes = loaded;
    for (const o of $("geometry").options) o.disabled = !shapes[o.value];
    if (!shapes[$("geometry").value]) $("geometry").value = "single";
    setMesh();
  } catch (e) {
    if (token !== loadToken) return;
    loadingData = false;
    clearSurface();
    setProgress(0, "Unable to load crystal data", "error");
    window.LabUI.dataFailure($("data-error"), e.message);
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
  const group = $("viewgroup").value;
  const candidates = catalog.filter((c) => c.group === group);
  const preferred =
    candidates.find((c) => c.id === rememberedCrystals.get(group)) ||
    candidates.find((c) => crystalSourceKey(c) === "local") ||
    candidates[0];
  crystalOptions(group, preferred?.id);
  select(catalog.find((c) => c.id === $("crystal").value));
};
$("crystal").onchange = () => select(catalog.find((c) => c.id === $("crystal").value));
$("geometry").onchange = setMesh;
$("scale").onchange = setMesh;
let calculationTask = 0;
async function calculate() {
  if (!mesh) return;
  const task = ++calculationTask;
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
    if (e.name !== "AbortError") setProgress(0, e.message, "error");
  }
}
$("field").onchange = () => {
  if ($("field").value !== "solid" && !curves) calculate();
  else draw();
};
for (const id of ["palette", "edges", "axes", "limits"]) $(id).onchange = draw;
const activeComputations = new Set(),
  operationComputations = new Map();
function cancelComputations() {
  for (const cancel of [...activeComputations]) cancel();
}
let progressSerial = 0;
async function computeInWorker(operation, m, options = {}) {
  operationComputations.get(operation)?.();
  const workerID = ++progressSerial;
  const worker = new Worker(computationWorkerURL);
  return new Promise((resolve, reject) => {
    let cancel, deadline;
    const finish = () => {
      clearTimeout(deadline);
      worker.terminate();
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
        "Calculation stopped after 120 seconds. Reduce smoothing iterations and retry, or use Reset all.",
      );
      reject(
        Error(
          "Calculation time limit reached. Reduce smoothing iterations and retry, or use Reset all.",
        ),
      );
    }, 120000);
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
    if (e.name !== "AbortError") setProgress(0, e.message, "error");
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
      smoothTimer = setTimeout(
        () => applySmoothing().catch((e) => setProgress(0, e.message, "error")),
        300,
      );
  };
const WEIGHT_COLORSCALE = [
  [0, "rgb(247,251,255)"],
  [0.125, "rgb(222,235,247)"],
  [0.25, "rgb(198,219,239)"],
  [0.375, "rgb(158,202,225)"],
  [0.5, "rgb(107,174,214)"],
  [0.625, "rgb(66,146,198)"],
  [0.75, "rgb(33,113,181)"],
  [0.875, "rgb(8,81,156)"],
  [1, "rgb(8,48,107)"],
];
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
let classificationState = null;
function classificationForCurrent() {
  const source = displayCurves || curves;
  if (
    ($("render-mode").value !== "discrete" && $("calculation-mode").value !== "discrete") ||
    !source
  )
    return null;
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
        setProgress(0, error.message, "error");
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
  window.LabMath.plot(
    Plotly.react,
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
    window.LabCharts.config(),
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
    const tex = classified ? "\\text{Curvature class}" : curvatureLabel($("field").value, true);
    await renderFormula(element, tex);
    if (token !== colourTitleToken) return;
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
  $("discrete").disabled = false;
  const classificationData = classificationForCurrent();
  const classified = $("render-mode").value === "discrete" ? classificationData : null;
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
    trace.colorscale = WEIGHT_COLORSCALE;
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
  window.LabMath.plot(
    Plotly.react,
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
        camera: readCamera() || { eye: { x: 1.5, y: 1.5, z: 1.1 } },
      },
      uirevision: "surface-camera",
    },
    window.LabCharts.config({ modeBarButtonsToRemove: ["toImage"] }),
  ).then(() => updateColourTitle(classified));
  updateFieldHeading(classified);
  updateRoundnessMetric(classificationData);
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
  renderRotationButton();
  $("rotate").setAttribute("aria-label", rotating ? "Pause rotation" : "Start rotation");
  syncRotationLoop();
};
let last = 0,
  rotationFrame = null;
let rotationUpdating = false,
  rotationInteractionUntil = 0;
const rotationPointers = new Set();
$("plot").addEventListener("pointerdown", (event) => rotationPointers.add(event.pointerId), {
  passive: true,
  capture: true,
});
for (const eventName of ["pointerup", "pointercancel"])
  window.addEventListener(
    eventName,
    (event) => {
      if (rotationPointers.delete(event.pointerId))
        rotationInteractionUntil = performance.now() + 150;
    },
    { passive: true, capture: true },
  );
$("plot").addEventListener(
  "wheel",
  () => {
    rotationInteractionUntil = performance.now() + 250;
  },
  { passive: true, capture: true },
);
window.addEventListener("blur", () => rotationPointers.clear());
function canRotate() {
  return !document.hidden && rotating && mesh && !$("display").hidden;
}
function syncRotationLoop() {
  if (rotationFrame !== null) cancelAnimationFrame(rotationFrame);
  rotationFrame = null;
  last = 0;
  if (canRotate()) rotationFrame = requestAnimationFrame(animate);
}
function readCamera() {
  // Layout camera values may lag behind wheel, drag and touch interactions.
  return $("plot")._fullLayout?.scene?._scene?.getCamera();
}
function rotateCamera(camera, angle) {
  const cos = Math.cos(angle),
    sin = Math.sin(angle);
  const rotate = (v) => ({ x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos, z: v.z });
  // Rotate the whole camera frame around the immutable world Z axis through
  // (0, 0, 0). Neither a panned target nor the camera's up vector defines it.
  return {
    ...camera,
    eye: rotate(camera.eye),
    center: rotate(camera.center),
    up: rotate(camera.up),
  };
}
function animate(t) {
  rotationFrame = null;
  if (!canRotate()) return;
  if (!last) last = t;
  if (rotationPointers.size || t < rotationInteractionUntil || rotationUpdating) last = t;
  else if (t - last > 60) {
    const camera = readCamera();
    if (camera) {
      rotationUpdating = true;
      Promise.resolve(
        Plotly.relayout("plot", {
          "scene.camera": rotateCamera(camera, (numericInput("speed") * (t - last)) / 1000),
        }),
      )
        .catch(() => {})
        .finally(() => {
          rotationUpdating = false;
        });
    }
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
            if (e.name !== "AbortError") setProgress(0, e.message, "error");
          }),
        200,
      );
    },
  );
$("smooth-preset").onchange = () => {
  updateIterationControls();
  if ($("smooth-enabled").checked)
    applySmoothing().catch((e) => setProgress(0, e.message, "error"));
};
$("positive-only").onchange = () => {
  classificationState = null;
  draw();
};

const formulaCache = new Map();
async function renderFormula(element, tex, fallback = window.LabMath.plain(tex)) {
  element.dataset.tex = tex;
  if (!element.querySelector("mjx-container")) element.classList.add("formula-pending");
  try {
    await window.LabMath.ready();
    if (!formulaCache.has(tex))
      formulaCache.set(tex, MathJax.tex2svgPromise(tex, { display: false }));
    const node = await window.LabMath.bounded(formulaCache.get(tex));
    if (element.dataset.tex !== tex) return;
    element.replaceChildren(node.cloneNode(true));
    delete element.dataset.mathFallback;
    element.title = "";
  } catch (e) {
    formulaCache.delete(tex);
    if (element.dataset.tex !== tex) return;
    element.dataset.mathFallback = "true";
    element.textContent = fallback;
    element.title = "Formula rendering could not be loaded. Reload the page to retry.";
  } finally {
    if (element.dataset.tex === tex) element.classList.remove("formula-pending");
  }
}
renderFormula($("vertices-symbol"), "N_{\\mathrm{v}}", "Nᵥ");
renderFormula($("faces-symbol"), "N_{\\mathrm{f}}", "N𝒻");
const mathPickers = [
  { trigger: "field-trigger", menu: "field-menu", compact: false },
  { trigger: "toolbar-field-trigger", menu: "toolbar-field-menu", compact: true },
  { trigger: "normalization-trigger", menu: "normalization-menu", normalization: true },
];
let mathFieldKey = "";
function updateMathField() {
  syncCalculationControls();
  const source = $("curvature-source").value,
    key = source + "|" + $("scale").value;
  if (key === mathFieldKey) return;
  mathFieldKey = key;
  updateWeightFormula();
  const names = {
    H: "Mean curvature",
    K: "Gaussian curvature",
    k1: "Principal curvature",
    k2: "Principal curvature",
  };
  const symbols = { H: "H", K: "K", k1: "κ₁", k2: "κ₂" };
  const texSymbols = { H: "H", K: "K", k1: "\\kappa_1", k2: "\\kappa_2" };
  async function content(e, v, compact) {
    const token = `${v}|${compact}|${key}`;
    e.dataset.contentToken = token;
    const fragment = document.createDocumentFragment();
    if (!compact)
      fragment.append(
        document.createTextNode(
          e.id === "field-trigger"
            ? { H: "Mean", K: "Gaussian", k1: "Principal 1", k2: "Principal 2" }[v]
            : names[v],
        ),
      );
    const f = document.createElement("span");
    f.className = "inline-formula";
    await renderFormula(f, texSymbols[v], symbols[v]);
    fragment.append(f);
    if (e.dataset.contentToken === token) e.replaceChildren(fragment);
  }
  for (const picker of mathPickers) {
    const trigger = $(picker.trigger),
      menu = $(picker.menu);
    if (picker.normalization) {
      const active = $("scale").value;
      async function normalizationContent(element, value) {
        element.dataset.normalization = value;
        if (value === "native") {
          element.textContent = "No";
          return;
        }
        const formula = document.createElement("span");
        formula.className = "inline-formula";
        await renderFormula(formula, "d_{\\mathrm{e}}", "dₑ");
        if (element.dataset.normalization === value) element.replaceChildren(formula);
      }
      normalizationContent(trigger, active);
      menu.replaceChildren();
      for (const value of ["native", "normalized"]) {
        const option = document.createElement("button");
        option.type = "button";
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", String(value === active));
        option.setAttribute(
          "aria-label",
          value === "native" ? "No normalization" : "Normalize by equivalent diameter",
        );
        normalizationContent(option, value);
        option.onclick = () => {
          menu.hidden = true;
          trigger.setAttribute("aria-expanded", "false");
          trigger.focus();
          if (value === $("scale").value) return;
          $("scale").value = value;
          mathFieldKey = "";
          updateMathField();
          $("scale").onchange();
        };
        menu.append(option);
      }
      continue;
    }
    content(trigger, source, picker.compact);
    menu.replaceChildren();
    for (const value of ["H", "K", "k1", "k2"]) {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.value = value;
      b.setAttribute("role", "option");
      b.setAttribute("aria-selected", value === source);
      b.setAttribute(
        "aria-label",
        value === "k1"
          ? "First principal curvature"
          : value === "k2"
            ? "Second principal curvature"
            : names[value],
      );
      content(b, value, picker.compact);
      b.onclick = () => {
        $("curvature-source").value = value;
        menu.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
        trigger.focus();
        syncCalculationMode();
      };
      menu.append(b);
    }
  }
}

function updateFieldHeading(classified) {
  const e = $("fieldtitle"),
    mode = $("render-mode").selectedOptions[0].text;
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
  renderFormula(formula, "\\kappa_{1,2}=H\\pm\\sqrt{\\max(H^2-K,0)}", "κ₁,₂ = H ± √max(H² − K, 0)");
  note.append(document.createTextNode(". Colour clipping affects display only."));
}
for (const picker of mathPickers) {
  const trigger = $(picker.trigger),
    menu = $(picker.menu);
  trigger.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    for (const other of mathPickers) {
      if (other !== picker) {
        $(other.menu).hidden = true;
        $(other.trigger).setAttribute("aria-expanded", "false");
      }
    }
    menu.hidden = !menu.hidden;
    trigger.setAttribute("aria-expanded", String(!menu.hidden));
  };
  document.addEventListener("click", (e) => {
    if (!trigger.parentElement.contains(e.target)) {
      menu.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
    }
  });
  trigger.onkeydown = (e) => {
    if (e.key === "Escape") {
      menu.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      menu.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      (menu.querySelector('[aria-selected="true"]') || menu.querySelector("button"))?.focus();
    }
  };
  menu.onkeydown = (e) => {
    const options = [...menu.querySelectorAll("button")],
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
      menu.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      trigger.focus();
    }
  };
}

// Render the calculation pickers immediately; crystal downloads need not finish first.
updateMathField();

function setProgress(
  value,
  message,
  state = value >= 100 ? "complete" : value > 0 ? "running" : "ready",
) {
  window.LabUI.progress($("analysis-progress"), { state, value, message });
  $("status").textContent = message;
  $("analysis-progress").hidden = false;
  $("analysis-progress").dataset.state = state;
  $("progress-track").hidden = false;
  $("progress-percent").hidden = false;
  $("progress-percent").style.visibility = state === "running" ? "visible" : "hidden";
  $("data-error").hidden = state !== "error";
  if (state === "error") $("data-error").textContent = message;
  operationBusy = state === "running";
  $("recalculate").textContent = operationBusy ? "Cancel" : mesh ? "Calculate" : "Download";
  $("recalculate").setAttribute(
    "aria-label",
    operationBusy
      ? loadingData
        ? "Cancel download"
        : "Cancel calculation"
      : mesh
        ? "Calculate curvature"
        : "Download crystal data",
  );
  window.LabUI.operationState($("recalculate"), state, message, value);
  $("recalculate").style.setProperty("--run-progress", Math.max(0, Math.min(100, value)) + "%");
  $("recalculate").setAttribute("aria-busy", String(operationBusy));
  $("recalculate").title = message;
  $("progress-fill").style.width = Math.max(0, Math.min(100, value)) + "%";
  $("progress-percent").textContent = Math.round(value) + "%";
  $("progress-track").setAttribute("aria-valuenow", String(Math.round(value)));
  $("recalculate").disabled = !mesh && !selected;
  $("progress-track").setAttribute("aria-valuetext", message);
  $("progress-track").setAttribute("aria-busy", String(operationBusy));
}
$("recalculate").onclick = () => {
  if (operationBusy) {
    loadToken++;
    loadingData = false;
    window.CrystalData.cancel();
    clearTimeout(smoothTimer);
    clearTimeout(surfaceTimer);
    smoothTask++;
    calculationTask++;
    cancelComputations();
    setProgress(0, "Cancelled · ready to retry", "cancelled");
    return;
  }
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
  renderRotationButton();
  $("rotate").setAttribute("aria-label", rotating ? "Pause rotation" : "Start rotation");
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
  $("render-mode").value = "continuous";
  $("calculation-mode").value = "weights";
  const mode = $("calculation-mode");
  mode.value =
    [...mode.options].find((option) => option.defaultSelected)?.value || mode.options[0].value;
  syncCalculationControls();
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
function syncCalculationControls() {
  $("toolbar-curvature").value = $("curvature-source").value;
  $("toolbar-estimator").value = $("calculation-mode").value;
}
function syncCalculationMode() {
  syncCalculationControls();
  const mode = $("calculation-mode").value;
  const rendering = $("render-mode").value;
  $("field").value =
    rendering === "weights"
      ? "weights"
      : rendering === "solid"
        ? "solid"
        : $("curvature-source").value;
  $("discrete").checked = rendering === "discrete";
  $("otsu-settings").hidden = mode !== "discrete";
  $("weight-settings").hidden = mode === "solid";
  classificationState = null;
  mathFieldKey = "";
  updateMathField();
  if (curves)
    updateSurfaceProcessing().catch((e) => {
      if (e.name !== "AbortError") setProgress(0, e.message, "error");
    });
  else draw();
}
$("calculation-mode").onchange = syncCalculationMode;
$("toolbar-curvature").onchange = () => {
  $("curvature-source").value = $("toolbar-curvature").value;
  syncCalculationMode();
};
$("toolbar-estimator").onchange = () => {
  $("calculation-mode").value = $("toolbar-estimator").value;
  syncCalculationMode();
};

$("render-mode").onchange = () => {
  const mode = $("render-mode").value;
  $("field").value =
    mode === "solid" ? "solid" : mode === "weights" ? "weights" : $("curvature-source").value;
  $("discrete").checked = mode === "discrete";
  draw();
};
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
    "w(c; r, n) = 1 − exp[−(max(c, 0) / (√2 σ))^n]; σ = r max(c)",
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
    renderRotationButton();
    $("rotate").setAttribute("aria-label", "Start rotation");
    syncRotationLoop();
  }
});

function renderRotationButton() {
  window.LabUI.playback($("rotate"), { active: rotating, idleLabel: "Rotate" });
}

for (const [buttonKey, panelKey, selector] of [
  ["parameterPage", "parameterPanel", "[data-parameter-page]"],
  ["displayParameter", "displayPanel", "[data-display-parameter]"],
  ["appearancePage", "appearancePanel", "[data-appearance-page]"],
]) {
  window.LabWorkspace.connectPanels({
    container: document.querySelector(selector).parentElement,
    buttonKey,
    panelKey,
  });
}
