(() => {
  "use strict";
  const $ = (id) => document.getElementById(id),
    E = window.MPCrystal;
  let values = { ...E.defaults },
    category = "Control",
    view = "all",
    tab = "operations",
    running = false,
    paused = false,
    sensor = false,
    adaptive = false,
    sim = null,
    timer = null,
    lastDraw = 0,
    busy = false,
    queued = false,
    renderRevision = 0,
    toastTimer;
  const header = document.querySelector(".topbar"),
    controls = document.querySelector(".common-controls");
  const statusHub = document.createElement("div");
  statusHub.className = "header-status-hub";
  statusHub.append(document.querySelector(".status-strip"));
  header.insertBefore(statusHub, document.querySelector(".top-actions"));
  let lastSelectedTarget = $("target").value;
  function markControllerRefresh(needed) {
    $("refresh").classList.toggle("refresh-needed", needed);
    document.querySelectorAll("[data-controller-refresh]").forEach((b) => {
      b.classList.toggle("refresh-needed", needed);
      b.title = needed ? "Target changed — refresh controller" : "";
    });
  }

  for (const [action, note, refresh, choice] of [
    ["start", ".status", "refresh", ".target-choice"],
    ["sensor", "#sensor-note", "refresh-sensor", null],
    ["adaptive", "#adapt-note", null, ".adapt-choice"],
    ["seed", "#seed-note", null, null],
  ]) {
    const module = document.createElement("div");
    module.className = "header-module";
    const button = document.createElement("button");
    button.className = "header-action";
    button.dataset.action = action;
    button.textContent = {
      start: "Controller",
      sensor: "GSensor",
      adaptive: "Adapter",
      seed: "Seed",
    }[action];
    button.setAttribute("aria-label", $(action).textContent.trim());
    button.onclick = () => $(action).click();
    module.append(button, statusHub.querySelector(note));
    const panel = document.createElement("div");
    panel.className = "module-popover";
    module.append(panel);
    statusHub.append(module);
    for (const node of [
      refresh ? $(refresh) : null,
      choice ? document.querySelector(choice) : null,
    ].filter(Boolean)) {
      const clone = node.cloneNode(true);
      clone.removeAttribute("id");
      clone.querySelectorAll("[id]").forEach((e) => e.removeAttribute("id"));
      if (node.tagName === "BUTTON" && refresh === "refresh")
        clone.dataset.controllerRefresh = "true";
      if (node.tagName === "BUTTON") clone.textContent = "Refresh";
      if (node.tagName === "BUTTON")
        clone.onclick = () => {
          flashRefresh(clone);
          node.click();
        };
      else {
        const legend = clone.querySelector("legend");
        if (legend) {
          clone.setAttribute(
            "aria-label",
            action === "start" ? "Control target" : "Adaptive parameters",
          );
          legend.remove();
        }
        clone.querySelectorAll("input").forEach((input, i) => {
          if (input.type === "radio") {
            input.name = "header-control-target";
            input.setAttribute(
              "aria-label",
              input.value === "sigma" ? "Supersaturation" : "Growth rate",
            );
            input.closest("label").querySelector("span").textContent =
              input.value === "sigma" ? "$\\sigma$" : "$G$";
          }
          input.onchange = () => {
            const source = node.querySelectorAll("input")[i];
            source.checked = input.checked;
            source.dispatchEvent(new Event("change"));
          };
        });
      }
      if (node.tagName !== "BUTTON")
        node.querySelectorAll("input").forEach((source, i) =>
          source.addEventListener("change", () => {
            clone
              .querySelectorAll("input")
              .forEach((input, j) => (input.checked = node.querySelectorAll("input")[j].checked));
          }),
        );
      panel.append(clone);
    }
  }
  statusHub.querySelector(".status-strip").remove();
  for (const [i, selector] of [
    ".header-module>.status",
    "#sensor-note",
    "#adapt-note",
    "#seed-note",
  ].entries()) {
    const source = document.querySelector(selector),
      copy = document.createElement("small");
    copy.className = "operation-status";
    controls.querySelectorAll(".operation-group")[i].append(copy);
    const sync = () => {
      copy.textContent = source.textContent;
      copy.dataset.state = source.dataset.state || "ready";
      copy.classList.toggle(
        "active-status",
        source.classList.contains("active-status") || (i === 0 && running),
      );
    };
    new MutationObserver(sync).observe(source, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });
    sync();
  }

  function playbackIcon(play = false) {
    return `<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">${play ? '<path d="M6 3.5v13l10-6.5z" fill="currentColor"/>' : '<rect x="5" y="4" width="3" height="12" rx=".7" fill="currentColor"/><rect x="12" y="4" width="3" height="12" rx=".7" fill="currentColor"/>'}</svg>`;
  }
  function stepIcon() {
    return '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false"><path d="M5 4v12l8-6z" fill="currentColor"/><path d="M15 4v12" stroke="currentColor" stroke-width="1.5"/></svg>';
  }
  const headerPlayback = document.createElement("div");
  headerPlayback.className = "header-playback";
  for (const action of ["pause", "step"]) {
    const b = document.createElement("button");
    b.className = "button header-playback-action";
    b.dataset.uiAction = "true";
    b.dataset.action = action;
    b.innerHTML = action === "step" ? stepIcon() : playbackIcon();
    b.setAttribute("aria-label", $(action).textContent);
    b.title = $(action).title;
    b.disabled = $(action).disabled;
    b.onclick = () => $(action).click();
    headerPlayback.append(b);
  }
  const primaryToolbar = document.createElement("div");
  primaryToolbar.className = "primary-toolbar";
  primaryToolbar.dataset.toolbarGroup = "primary";
  document.querySelector(".header-file-actions").dataset.toolbarGroup = "secondary";
  statusHub.before(primaryToolbar);
  primaryToolbar.append(statusHub, headerPlayback);
  document.body.classList.add("header-controls-permanent");
  const { coloursDefault, curves, panels } = window.MPCChartSchema;
  let colours = { ...coloursDefault };
  let visiblePanels = new Set(panels.map((p) => p.id));
  const panelViews = new Map();
  function escape(s) {
    return String(s).replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  }
  function fmt(v) {
    return typeof v === "number"
      ? v === 0
        ? "0"
        : Math.abs(v) < 1e-3 || Math.abs(v) >= 1e5
          ? v.toExponential(4)
          : Number(v.toPrecision(7)).toString()
      : Array.isArray(v)
        ? "[" + v.join(", ") + "]"
        : String(v);
  }
  function notify(text, error = false) {
    $("message").textContent = text;
    $("message").classList.toggle("error", error);
    $("message").hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ($("message").hidden = true), error ? 10000 : 5000);
  }
  let mathQueue = Promise.resolve(),
    lastTargetLabel = "",
    lastMetricDraw = 0;
  function typeset(nodes) {
    mathQueue = mathQueue
      .catch(() => {})
      .then(async () => {
        await window.LabMath.typeset(nodes);
      });
    return mathQueue;
  }
  function clearMath(node) {
    if (window.MathJax?.typesetClear) MathJax.typesetClear([node]);
  }
  function setAdaptiveSelection(mode) {
    const selected =
      mode === "all" ? ["E_A", "k_0", "n"] : mode === "none" ? [] : mode.split("_and_");
    document
      .querySelectorAll("[data-adapt]")
      .forEach((c) => (c.checked = selected.includes(c.dataset.adapt)));
    $("adaptive-mode").value = mode;
  }
  function strategyChanged() {
    if (lastSelectedTarget !== $("target").value) {
      markControllerRefresh(true);
      lastSelectedTarget = $("target").value;
    }
    if (sim) sim.update(values, options());
    updateDerived();
    summary();
    render(true);
  }
  function options() {
    return {
      mode: $("mode").value,
      target: $("target").value,
      adaptiveMode: $("adaptive-mode").value,
      sensor,
      adaptive,
    };
  }
  function status(text, kind = "") {
    $("status-text").textContent =
      "Controller · " + text.replace(/^Controller /i, "").replace("Ready to simulate", "Ready");
    $("status-dot").className = kind;
    $("status-dot").closest(".status").dataset.state =
      kind === "error"
        ? "error"
        : kind === "paused"
          ? "paused"
          : text === "Running"
            ? "active"
            : text === "Complete"
              ? "complete"
              : "ready";
  }
  function showTab(next) {
    if (!window.LabWorkspace.selectSection(next)) return;
    tab = next;
    if (next === "display") render(true);
    else invalidateRender();
    typeset([$(next)]);
  }
  // A small arithmetic parser: no eval, Function, property access, or executable imports.
  function numberExpression(text) {
    if (!text.trim() || text.length > 250)
      throw Error("Enter a numeric expression of at most 250 characters.");
    const str = text.trim().replace(/np\./g, "").replace(/\*\*/g, "^");
    let pos = 0;
    const tokens = str.match(/(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?|[a-zA-Z_]+|[+\-*/^(),]/g) || [];
    if (tokens.join("") !== str.replace(/\s/g, ""))
      throw Error("Use a number or a supported arithmetic expression.");
    function primary() {
      const t = tokens[pos++];
      if (t === "+" || t === "-") return (t === "-" ? -1 : 1) * power();
      if (t === "(") {
        const v = sum();
        if (tokens[pos++] !== ")") throw Error("Missing closing parenthesis.");
        return v;
      }
      if (/^(?:\d|\.)/.test(t || "")) return Number(t);
      if (t === "pi") return Math.PI;
      if (t === "e") return Math.E;
      const f = {
        sqrt: Math.sqrt,
        exp: Math.exp,
        log: Math.log,
        log10: Math.log10,
        abs: Math.abs,
        sin: Math.sin,
        cos: Math.cos,
        tan: Math.tan,
        power: Math.pow,
        pow: Math.pow,
      }[t];
      if (f && tokens[pos++] === "(") {
        const args = [sum()];
        while (tokens[pos] === ",") {
          pos++;
          args.push(sum());
        }
        if (tokens[pos++] !== ")") throw Error("Missing closing parenthesis.");
        return f(...args);
      }
      throw Error("Unsupported expression.");
    }
    function power() {
      let v = primary();
      if (tokens[pos] === "^") {
        pos++;
        v = v ** power();
      }
      return v;
    }
    function product() {
      let v = power();
      while (["*", "/"].includes(tokens[pos])) {
        const op = tokens[pos++],
          q = power();
        v = op === "*" ? v * q : v / q;
      }
      return v;
    }
    function sum() {
      let v = product();
      while (["+", "-"].includes(tokens[pos])) {
        const op = tokens[pos++],
          q = product();
        v = op === "+" ? v + q : v - q;
      }
      return v;
    }
    const v = sum();
    if (pos !== tokens.length || !Number.isFinite(v))
      throw Error("Expression must resolve to a finite number.");
    return v;
  }
  function parseField(text, key) {
    return key === "r_diag_G_measure"
      ? text
          .replace(/^\s*\[/, "")
          .replace(/\]\s*$/, "")
          .split(/[,;\s]+/)
          .filter(Boolean)
          .map(numberExpression)
      : numberExpression(text);
  }
  const inputs = new Map();
  const parameterSubtabs = {
    Control: [
      "Loop interval",
      "Target",
      "Primary controller",
      "Secondary controller",
      "Time lag",
      "Initial values",
      "Run length",
      "Seed",
    ],
    Filter: ["Controller", "GSensor"],
    Growth: ["For control", "For model"],
    Reactor: ["Heat transfer", "Reactor limits", "Jacket"],
    Adaptation: ["Adaptation"],
    Display: ["Time base", "Constants"],
  };
  const subtabByTitle = {
    "Loop interval": "Loop interval",
    Target: "Target",
    "Primary controller (MPC)": "Primary controller",
    "Primary controller (PI)": "Primary controller",
    "Secondary controller": "Secondary controller",
    "Time lag": "Time lag",
    "Kalman filter for MPC": "Controller",
    "Kalman filter for growth measurement": "GSensor",
    "Growth rate model (for control)": "For control",
    "Growth rate model (for model)": "For model",
    "Heat transfer model": "Heat transfer",
    "Reactor temperature limit": "Reactor limits",
    "Jacket temperature limit": "Jacket",
    Adaptation: "Adaptation",
    "Initial values": "Initial values",
    "Jacket dynamics": "Jacket",
    "Run length": "Run length",
    Seed: "Seed",
    Display: "Time base",
    "Constant parameters": "Constants",
  };
  const selectedSubtabs = {};
  let primarySubtab = "MPC";
  function buildParameterSubtabs() {
    const tabs = parameterSubtabs[category];
    if (!tabs.includes(selectedSubtabs[category])) selectedSubtabs[category] = tabs[0];
    $("parameter-subtabs").hidden = tabs.length < 2 || !!$("search").value.trim();
    $("parameter-subtabs").innerHTML = tabs
      .map(
        (t) =>
          `<button data-subcategory="${escape(t)}" class="${selectedSubtabs[category] === t ? "active" : ""}" aria-pressed="${selectedSubtabs[category] === t}">${escape(t)}</button>`,
      )
      .join("");
    $("parameter-subtabs")
      .querySelectorAll("button")
      .forEach(
        (b) =>
          (b.onclick = () => {
            selectedSubtabs[category] = b.dataset.subcategory;
            filterParameters();
          }),
      );
  }

  function buildParameters() {
    const cats = ["Control", "Filter", "Growth", "Reactor", "Adaptation", "Display"];
    $("parameter-tabs").innerHTML = cats
      .map((c) => `<button data-category="${escape(c)}">${escape(c)}</button>`)
      .join("");
    const holder = $("parameter-groups");
    for (const [gi, g] of PARAMETER_GROUPS.entries()) {
      const section = document.createElement("section");
      section.className = "property-section";
      section.dataset.category = g.category;
      section.dataset.subcategory = subtabByTitle[g.title];
      section.dataset.primary =
        g.title === "Primary controller (MPC)"
          ? "MPC"
          : g.title === "Primary controller (PI)"
            ? "PI"
            : "";
      section.dataset.search = g.title.toLowerCase();
      section.innerHTML = `<details class="parameter-group" open><summary>${escape(g.title)}<span class="group-caption">${g.fields.length} parameters</span></summary><div class="fields"></div></details>`;
      let lastSection = "";
      for (const f of g.fields) {
        if (f.section !== lastSection) {
          const heading = document.createElement("h3");
          heading.className = "field-section-title";
          heading.textContent = f.section;
          section.querySelector(".fields").append(heading);
          lastSection = f.section;
        }
        const field = document.createElement("div");
        field.className = "field";
        if (f.feedback) field.dataset.feedback = f.feedback;
        if (f.gain) field.dataset.gain = f.gain;
        field.dataset.search = (f.name + " " + f.key + " " + f.tex).toLowerCase();
        const id = "parameter-" + f.key.replace(/\./g, "-");
        field.innerHTML = `<span class="parameter-name">${escape(f.name)}</span><label for="${id}"><span>$${escape(f.tex)}$</span><span class="unit">[$${escape(f.unit)}$]</span></label><input id="${id}" class="expression" ${f.derived ? 'readonly aria-readonly="true"' : ""} aria-label="${escape(f.name)}" autocomplete="off" spellcheck="false"><small class="resolved">${f.derived ? "Calculated from dependencies" : ""}</small>`;
        if (f.note) {
          const note = document.createElement("small");
          note.className = "parameter-note";
          note.textContent = f.note;
          field.append(note);
        }
        const input = field.querySelector("input");
        inputs.set(f.key, { input, field, f });
        if (!f.derived)
          input.addEventListener("change", () => {
            try {
              const value = parseField(input.value, f.key),
                next = { ...values, [f.key]: value };
              E.validate(next);
              if (
                value !== values[f.key] &&
                (f.key === ($("target").value === "sigma" ? "sigma_set" : "G_set") ||
                  f.key === "target_set")
              )
                markControllerRefresh(true);
              values = next;
              input.classList.remove("invalid");
              showParameterValue(field, value, f.unit);
              if (sim) {
                sim.update(values, options());
              }
              updateDerived();
              summary();
              notify(
                ["T_init_sigma", "T_init_G", "T_j_init", "T_j_set_init", "c_init"].includes(f.key)
                  ? "Initial condition saved for the next run."
                  : "Parameter applied.",
              );
            } catch (e) {
              input.classList.add("invalid");
              field.querySelector(".resolved").textContent = e.message;
              notify(e.message, true);
            }
          });
        section.querySelector(".fields").append(field);
      }
      holder.append(section);
    }
    document.querySelectorAll("button[data-category]").forEach(
      (b) =>
        (b.onclick = () => {
          category = b.dataset.category;
          $("search").value = "";
          filterParameters();
        }),
    );
    $("search").oninput = filterParameters;
    updateDerived(true);
    filterParameters();
  }
  function showParameterValue(field, value, unit) {
    const result = field.querySelector(".resolved");
    if (!Number.isFinite(value)) {
      result.textContent = "";
      return;
    }
    const text =
      "= " + fmt(value) + (unit && !["-", "−", "—"].includes(unit) ? " $" + unit + "$" : "");
    if (result.dataset.value === text) return;
    clearMath(result);
    result.innerHTML = text;
    result.dataset.value = text;
    typeset([result]);
  }
  function updateDerived(all = false) {
    const p = E.derive(sim?.values || values, $("target").value);
    const activeUnit = inputs.get("target_set").field.querySelector(".unit"),
      unitTex = $("target").value === "G" ? "$\\mathrm{m}\\,\\mathrm{s}^{-1}$" : "$-$";
    if (activeUnit.dataset.tex !== unitTex) {
      clearMath(activeUnit);
      activeUnit.innerHTML = unitTex;
      activeUnit.dataset.tex = unitTex;
      typeset([activeUnit]);
    }
    for (const [key, { input, field, f }] of inputs) {
      if (f.derived || all) {
        input.value = key === "params.PI_mode" ? "Ziegler–Nichols" : fmt(p[key]);
        input.classList.remove("invalid");
      }
      if (!f.derived && sim && ["params.n", "params.k_0", "params.E_A"].includes(key) && adaptive) {
        input.value = fmt(sim.values[key]);
      }
      showParameterValue(
        field,
        Number(p[key]),
        key === "target_set"
          ? $("target").value === "G"
            ? "\\mathrm{m}\\,\\mathrm{s}^{-1}"
            : "-"
          : f.unit,
      );
    }
  }
  function filterParameters() {
    buildParameterSubtabs();
    primarySubtab = $("mode").value;
    document.querySelectorAll("[data-controller-mode]").forEach((button) => {
      const active = button.dataset.controllerMode === primarySubtab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    const q = $("search").value.trim().toLowerCase();
    let count = 0;
    document.querySelectorAll(".property-section").forEach((s) => {
      let found = 0;
      for (const f of s.querySelectorAll(".field")) {
        f.hidden = !!q && !f.dataset.search.includes(q) && !s.dataset.search.includes(q);
        if (!f.hidden) found++;
      }
      s.hidden =
        !found ||
        (!q &&
          (s.dataset.category !== category ||
            s.dataset.subcategory !== selectedSubtabs[category] ||
            (s.dataset.primary && s.dataset.primary !== primarySubtab)));
      if (!s.hidden) {
        count++;
        if (q) s.querySelector("details").open = true;
      }
    });
    document.querySelectorAll(".field-section-title").forEach((h) => {
      let n = h.nextElementSibling,
        visible = false;
      while (n && !n.classList.contains("field-section-title")) {
        if (!n.hidden) visible = true;
        n = n.nextElementSibling;
      }
      h.hidden = !visible;
    });
    $("no-results").hidden = count > 0;
    document
      .querySelectorAll("button[data-category]")
      .forEach((b) => b.classList.toggle("active", !q && b.dataset.category === category));
    typeset([$("parameter-groups")]);
  }
  function moduleState(enabled) {
    return !enabled ? "inactive" : !running ? "ready" : paused ? "paused" : "active";
  }
  function moduleLabel(name, enabled) {
    const labels = { inactive: "Inactive", ready: "Ready", paused: "Paused", active: "Active" };
    return name + " · " + labels[moduleState(enabled)];
  }
  function summary() {
    if (!running) {
      sensor = false;
      adaptive = false;
    }
    if (!sensor) adaptive = false;
    if (sim) sim.update(values, options());
    const p = E.derive(sim?.values || values, $("target").value),
      n = sim?.history.length || 0,
      time = sim?.history.at(-1)?.t || 0;
    const unit =
        p.t_base === 60
          ? "min"
          : p.t_base === 3600
            ? "h"
            : p.t_base === 1
              ? "s"
              : `× ${fmt(p.t_base)} s`,
      timeLabel = (time / p.t_base).toFixed(2) + " " + unit;
    const targetLabel =
      "$" +
      ($("target").value === "sigma" ? "\\sigma" : "G") +
      "_{\\mathrm{set}} = " +
      fmt(p.target_set).replace(/e([+-]?\d+)/, " \\times 10^{$1}") +
      "$";
    if (targetLabel !== lastTargetLabel) {
      clearMath($("active-target"));
      $("active-target").innerHTML = targetLabel;
      typeset([$("active-target")]);
      lastTargetLabel = targetLabel;
    }
    $("run-time").textContent = timeLabel;
    const displayClock = $("display-time");
    if (!displayClock.querySelector(".elapsed-value"))
      displayClock.innerHTML =
        '<span class="elapsed-value"></span><span class="elapsed-unit"></span>';
    displayClock.querySelector(".elapsed-value").textContent = (time / p.t_base).toFixed(2);
    displayClock.querySelector(".elapsed-unit").textContent = unit;
    $("run-progress").textContent = $("display-step").textContent = `${n} / ${p.steps} steps`;
    const runMode =
      $("mode").value + " → $" + ($("target").value === "sigma" ? "\\sigma" : "G") + "$";
    if ($("run-mode").dataset.label !== runMode) {
      clearMath($("run-mode"));
      $("run-mode").innerHTML = runMode;
      $("run-mode").dataset.label = runMode;
      typeset([$("run-mode")]);
    }
    $("start").classList.toggle("stop-action", running);
    $("start").setAttribute("aria-pressed", String(running));
    $("sensor").classList.toggle("stop-action", sensor);
    $("adaptive").classList.toggle("stop-action", adaptive);
    window.LabUI.text($("start"), running ? "Stop controller" : "Start controller");
    window.LabUI.playback($("pause"), {
      active: running && !paused,
      label: paused ? "Resume" : "Pause",
      disabled: !running,
    });
    const progressValue = p.steps ? Math.min(100, (n / p.steps) * 100) : 0;
    const progressState =
      n >= p.steps ? "complete" : running ? (paused ? "paused" : "running") : "ready";
    const progressMessage =
      n >= p.steps ? "Complete" : running ? (paused ? "Paused" : "Simulating…") : "Ready";
    window.LabUI.task({
      root: $("simulation-progress"),
      button: $("pause"),
      kind: "calculation",
      state: progressState,
      value: progressValue,
      message: progressMessage,
      detail: `${n} / ${p.steps} steps`,
    });

    $("step").disabled = !sim || !paused;
    $("sensor").disabled = !running;
    $("seed").disabled = !running;
    $("adaptive").disabled = !running || !sensor || $("adaptive-mode").value === "none";
    $("sensor").title = !running ? "Start controller first" : "";
    $("seed").title = !running ? "Start controller first" : "";
    $("adaptive").title = !running
      ? "Start controller first"
      : !sensor
        ? "Start GSensor first"
        : "";
    document
      .querySelectorAll("[name=control-target]")
      .forEach((r) => (r.checked = r.value === $("target").value));
    window.LabUI.text($("sensor-note"), moduleLabel("GSensor", sensor));
    $("sensor-note").classList.toggle("active-status", sensor);
    $("sensor-note").dataset.state = moduleState(sensor);
    $("adapt-note").dataset.state = moduleState(adaptive);
    $("seed-note").dataset.state = !running
      ? "inactive"
      : paused && (sim?.seedPending || sim?.sizes.length)
        ? "paused"
        : sim?.seedPending
          ? "pending"
          : sim?.sizes.length
            ? "complete"
            : "inactive";
    $("adapt-note").classList.toggle("active-status", adaptive);
    $("seed-note").classList.toggle(
      "active-status",
      !!(running && (sim?.seedPending || sim?.sizes.length)),
    );
    $("sensor").textContent = sensor ? "Stop GSensor" : "Start GSensor";
    $("sensor").classList.toggle("on", sensor);
    $("sensor").setAttribute("aria-pressed", sensor);
    $("adaptive").textContent = adaptive ? "Stop adapter" : "Start adapter";
    $("adaptive").classList.toggle("on", adaptive);
    $("adaptive").setAttribute("aria-pressed", adaptive);
    window.LabUI.text($("adapt-note"), moduleLabel("Adapter", adaptive));
    const acceptedSeedBatches =
      sim?.runEvents.filter((event) => event.kind === "seed-queued").length || 0;
    const pendingSeedBatches = sim?.seedPending || 0;
    $("seed").textContent = acceptedSeedBatches ? "Add seed · " + acceptedSeedBatches : "Add seed";
    $("seed-note").textContent = acceptedSeedBatches
      ? "Seed · " +
        (acceptedSeedBatches - pendingSeedBatches) +
        " added · " +
        pendingSeedBatches +
        " queued"
      : "Seed · Empty";
    if (running) $("seed").title = "Each click adds one seed batch.";
    document.querySelectorAll(".header-playback-action[data-action]").forEach((b) => {
      const main = $(b.dataset.action);
      const icon = b.dataset.action === "step" ? stepIcon() : playbackIcon(paused);
      if (b.dataset.icon !== icon) {
        b.innerHTML = icon;
        b.dataset.icon = icon;
      }
      b.setAttribute("aria-label", main.textContent);
      b.title = main.textContent;
      b.disabled = main.disabled;
      if (b.dataset.action === "pause") {
        window.LabUI.task({
          button: b,
          kind: "calculation",
          state: progressState,
          value: progressValue,
          message: `${progressMessage} · ${n} / ${p.steps} steps`,
        });
        b.dataset.playbackState = running && !paused ? "playing" : "paused";
        b.setAttribute("aria-pressed", String(running && !paused));
      }
    });
    document.querySelectorAll(".header-action").forEach((b) => {
      const main = $(b.dataset.action);
      let label = b.querySelector(".module-label");
      if (!label) {
        label = document.createElement("span");
        label.className = "module-label";
        b.replaceChildren(label);
      }
      let nextLabel = {
        start: "Controller",
        sensor: "GSensor",
        adaptive: "Adapter",
        seed: "Seed",
      }[b.dataset.action];
      if (b.dataset.action === "seed" && acceptedSeedBatches)
        nextLabel += " · " + acceptedSeedBatches;
      if (label.textContent !== nextLabel) label.textContent = nextLabel;
      b.setAttribute("aria-label", main.textContent.trim());
      b.classList.toggle("primary", main.classList.contains("primary"));
      b.classList.toggle("on", main.classList.contains("on"));
      b.classList.toggle("stop-action", main.classList.contains("stop-action"));
      b.disabled = main.disabled;
      const note = b.closest(".header-module")?.querySelector("small,.status");
      b.dataset.state = running ? note?.dataset.state || "ready" : "inactive";
      b.title = [main.title, note?.textContent.trim()].filter(Boolean).join(" · ");
      if (b.dataset.action === "seed") b.removeAttribute("aria-pressed");
      else b.setAttribute("aria-pressed", main.getAttribute("aria-pressed") || "false");
    });
    window.LabUI.syncStatusLights();
    const r = sim?.history.at(-1);
    const metrics = [
      [
        "Jacket setpoint",
        r ? (r.TjSet - 273.15).toFixed(2) : "—",
        "$T_{\\mathrm{j},\\mathrm{set}}\\;[{}^\\circ\\mathrm{C}]$",
      ],
      ["Reactor temperature", r ? (r.T - 273.15).toFixed(2) : "—", "$T\\;[{}^\\circ\\mathrm{C}]$"],
      ["Concentration", r ? r.c.toFixed(5) : "—", "$c\\;[\\mathrm{g}\\,\\mathrm{g}^{-1}]$"],
      ["Relative supersaturation", r ? r.sigma.toFixed(5) : "—", "$\\sigma\\;[-]$"],
      [
        "Model growth rate",
        r ? r.G.toExponential(3) : "—",
        "$G\\;[\\mathrm{m}\\,\\mathrm{s}^{-1}]$",
      ],
    ];
    metrics.push([
      "Measured growth rate",
      sensor && Number.isFinite(r?.Gmeasure) ? r.Gmeasure.toExponential(3) : "—",
      String.raw`$G_{\mathrm{meas}}\;[\mathrm{m}\,\mathrm{s}^{-1}]$`,
    ]);
    $("headline-metrics").classList.add("with-measurement");
    if ($("headline-metrics").children.length !== metrics.length) {
      clearMath($("headline-metrics"));
      lastMetricDraw = 0;
      $("headline-metrics").innerHTML = metrics
        .map(
          ([name, v, s]) =>
            `<div class="metric"><span>${name}</span><strong></strong><small>${s}</small></div>`,
        )
        .join("");
      typeset([$("headline-metrics")]);
    }
    const measuredCard = $("headline-metrics").children[5];
    measuredCard.classList.toggle("metric-inactive", !sensor);
    let measuredState = measuredCard.querySelector(".metric-state");
    if (!measuredState) {
      measuredState = document.createElement("span");
      measuredState.className = "metric-state";
      measuredCard.append(measuredState);
    }
    measuredState.textContent = sensor ? "" : "Inactive";
    if (performance.now() - lastMetricDraw > 350 || !running || paused) {
      lastMetricDraw = performance.now();
      metrics.forEach((m, i) => {
        const strong = $("headline-metrics").children[i].querySelector("strong");
        const next = m[1].replace(
          /e([+-]?)(\d+)/,
          (_, sign, exp) => " × 10<sup>" + (sign === "-" ? "−" : "") + Number(exp) + "</sup>",
        );
        if (strong.innerHTML !== next) strong.innerHTML = next;
      });
    }
  }
  function buildPanels() {
    for (const [i, p] of panels.entries()) {
      const card = document.createElement("section");
      card.className = "plot-card";
      card.id = "card-" + p.id;
      card.innerHTML = `<div class="plot-head"><h3>${p.title}</h3><span class="panel-number">${String(i + 1).padStart(2, "0")}</span></div><div class="plot" id="plot-${p.id}" aria-label="${escape(p.title)}"></div><div class="live-legend" aria-label="Latest curve values"></div>`;
      $("plot-grid").append(card);
      const label = document.createElement("label");
      label.innerHTML = `<input type="checkbox" checked> ${p.title}`;
      label.querySelector("input").onchange = (e) => {
        if (e.target.checked) visiblePanels.add(p.id);
        else visiblePanels.delete(p.id);
        render(true);
      };
      $("panel-switches").append(label);
    }
    const names = {
      T: "$T, T_{\\mathrm{KF}}$",
      Tj: "$T_{\\mathrm{j}}$",
      TjSet: "$T_{\\mathrm{j},\\mathrm{set}}$",
      dT: "$\\dot T$",
      dTset: "$\\dot T_{\\mathrm{set}}$",
      c: "$c,c_{\\mathrm{KF}}$",
      dc: "$\\dot c$",
      target: "$y_{\\mathrm{set}}$",
      sigma: "$\\sigma$",
      G: "$G$",
      Gu: "$G_u$",
      Gv: "$G_v$",
      Gmeasure: "$G_{\\mathrm{meas}}$",
      n: "$n$",
      lnk: "$\\ln k_0$",
      EA: "$E_{\\mathrm{A}}$",
      f: "$J$",
      lag: "$t_{\\mathrm{lag}}$",
      lagPercent: "$\\Delta_{\\mathrm{lag}}$",
      seed: "Seed",
    };
    for (const [k, c] of Object.entries(colours)) {
      const label = document.createElement("label");
      label.innerHTML = `<input type="color" value="${c}" data-colour="${k}" aria-label="Colour for ${k}"><span>${names[k]}</span>`;
      label.querySelector("input").oninput = (e) => {
        colours[k] = e.target.value;
        render(true);
      };
      $("colour-controls").append(label);
    }
  }
  function chartValue(r, k) {
    if (["T", "TKF", "Tj", "TjSet"].includes(k)) return r[k] - 273.15;
    if (k === "n") return r.n * 100;
    if (k === "lnk") return r.lnk * 10;
    return r[k] ?? null;
  }
  function invalidateRender() {
    renderRevision++;
    if (busy) queued = true;
  }
  function panelVisible(panel) {
    return visiblePanels.has(panel.id) && (view === "all" || panel.group === view);
  }
  function syncPanelVisibility() {
    for (const panel of panels) {
      const card = $("card-" + panel.id);
      const hidden = !panelVisible(panel);
      if (card.hidden !== hidden) card.hidden = hidden;
    }
  }
  async function render(force = false) {
    if (force) invalidateRender();
    if (tab !== "display") return;
    if (force) syncPanelVisibility();
    if (busy) {
      queued ||= force;
      return;
    }
    const now = performance.now();
    if (!force && now - lastDraw < 350) return;
    busy = true;
    lastDraw = now;
    const revision = renderRevision;
    try {
      const p = sim?.p || E.derive(values, $("target").value),
        history = sim?.history || [],
        stride = Math.max(1, Math.ceil(history.length / 1500)),
        rows = history.filter((_, i) => i % stride === 0 || i === history.length - 1),
        time = rows.map((r) => r.t / p.t_base);
      const unit =
        p.t_base === 60
          ? "\\mathrm{min}"
          : p.t_base === 3600
            ? "\\mathrm h"
            : p.t_base === 1
              ? "\\mathrm s"
              : `${p.t_base}\\,\\mathrm s`;
      const mathUpdates = [];
      let drawn = 0;
      for (const panel of panels) {
        if (tab !== "display" || revision !== renderRevision) break;
        const card = $("card-" + panel.id);
        if (!panelVisible(panel)) continue;
        let traces = [];
        if (panel.population) {
          traces = [
            {
              x: history.length ? [0, ...history.map((r) => r.t / p.t_base)] : [0],
              y: history.length ? [0, ...history.map((r) => r.population)] : [0],
              name: "$N$",
              type: "scatter",
              mode: "lines",
              line: { color: colours.seed, shape: "hv", width: 1.8 },
            },
          ];
        } else
          for (const k of panel.keys) {
            const def = curves[k],
              y = rows.map((r) =>
                panel.target &&
                ((["sigmaSet", "GSet"].includes(k) && history.at(-1)?.target !== panel.target) ||
                  (r.target !== panel.target && ["f", "sigmaSet", "GSet"].includes(k)))
                  ? null
                  : chartValue(r, k),
              );
            traces.push({
              x: time,
              y,
              name: "$" + def[0] + "$",
              type: "scatter",
              mode: "lines",
              connectgaps: false,
              line: { color: colours[def[1]], dash: def[2] || "solid", width: 1.6 },
              yaxis: k === "f" || k === "lagPercent" ? "y2" : "y",
              hovertemplate: "%{x:.3f}<br>%{y:.5g}<extra></extra>",
            });
          }
        if (panel.id === "temperature" && sim?.seedEvents.length)
          traces.push({
            x: sim.seedEvents.map((s) => s.t / p.t_base),
            y: sim.seedEvents.map((s) => s.T - 273.15),
            mode: "markers",
            name: "Seed",
            marker: { symbol: "star", size: 10, color: colours.seed },
          });
        const legend = card.querySelector(".live-legend");
        const unitFor = (k) =>
          ["T", "TKF", "Tj", "TjSet"].includes(k)
            ? String.raw`{}^\circ\mathrm{C}`
            : ["dT", "dTKF", "dTset"].includes(k)
              ? String.raw`\mathrm{K}\,\mathrm{s}^{-1}`
              : ["c", "cKF"].includes(k)
                ? String.raw`\mathrm{g}\,\mathrm{g}^{-1}`
                : ["dc", "dcKF"].includes(k)
                  ? String.raw`\mathrm{g}\,\mathrm{g}^{-1}\mathrm{s}^{-1}`
                  : k === "lag"
                    ? String.raw`\mathrm{s}`
                    : k === "lagPercent"
                      ? String.raw`\%`
                      : k === "population" || k === "Seed"
                        ? String.raw`\#`
                        : ["sigma", "sigmaSet", "f", "n", "lnk", "EA"].includes(k)
                          ? "-"
                          : String.raw`\mathrm{m}\,\mathrm{s}^{-1}`;
        const legendMarkup = traces
          .map((trace, i) => {
            const key = panel.population ? "population" : panel.keys[i] || "Seed";
            const latest = key === "Seed" ? sim.seedEvents.length : trace.y.at(-1);
            const value = Number.isFinite(latest)
              ? Number(latest.toPrecision(4))
                  .toString()
                  .replace(/e([+-]?\d+)/, String.raw`\times 10^{$1}`)
              : String.raw`\text{—}`;
            const symbol = trace.name.startsWith("$")
              ? trace.name.slice(1, -1)
              : String.raw`\mathrm{Seed}`;
            trace.name = "$" + symbol + " = " + value + "$";
            return `<button class="legend-value" data-trace="${i}" title="Show or hide curve"><i style="--curve:${trace.line?.color || trace.marker?.color};border-top-style:${trace.line?.dash === "dot" ? "dotted" : trace.line?.dash === "dash" ? "dashed" : "solid"}"></i><span class="legend-symbol">$${symbol}$</span><span class="legend-equals">=</span><span class="legend-number"></span><span class="legend-unit">$${unitFor(key)}$</span></button>`;
          })
          .join("");
        if (legend.dataset.markup !== legendMarkup) {
          clearMath(legend);
          legend.dataset.markup = legendMarkup;
          legend.innerHTML = legendMarkup;
          mathUpdates.push(legend);
          legend.querySelectorAll("button").forEach(
            (button) =>
              (button.onclick = () => {
                const hidden = button.classList.toggle("curve-hidden");
                Plotly.restyle($("plot-" + panel.id), { visible: hidden ? "legendonly" : true }, [
                  Number(button.dataset.trace),
                ]);
              }),
          );
        }
        legend.querySelectorAll(".legend-number").forEach((node, i) => {
          const key = panel.population ? "population" : panel.keys[i] || "Seed";
          const latest = key === "Seed" ? sim.seedEvents.length : traces[i].y.at(-1);
          const value = Number.isFinite(latest) ? Number(latest.toPrecision(4)).toString() : "—";
          const html = value.replace(
            /e([+-]?)(\d+)/,
            (_, sign, exp) => " × 10<sup>" + (sign === "-" ? "−" : "") + Number(exp) + "</sup>",
          );
          if (node.innerHTML !== html) node.innerHTML = html;
        });
        legend.querySelectorAll("button").forEach((button, i) => {
          if (traces[i])
            traces[i].visible = button.classList.contains("curve-hidden") ? "legendonly" : true;
        });
        const layout = {
          paper_bgcolor: "#fff",
          plot_bgcolor: "#fff",
          margin: { l: 65, r: panel.secondary ? 65 : 18, t: 16, b: 46 },
          font: window.LabCharts.font(12),
          xaxis: {
            title: { text: "$t\\;[" + unit + "]$", standoff: 8 },
            gridcolor: "#edf1eb",
            zeroline: false,
          },
          yaxis: {
            title: { text: "$" + panel.unit + "$", standoff: 6 },
            gridcolor: "#edf1eb",
            zeroline: false,
            exponentformat: "e",
          },
          legend: { orientation: "h", x: 0, y: -0.3, font: window.LabCharts.font(11) },
          showlegend: false,
          hovermode: "closest",
          uirevision: panel.id + "-" + view,
        };
        if (panel.population && !sim?.seedEvents.length) {
          traces = [];
          layout.annotations = [
            {
              text: "Add seed to initialize the crystal population",
              xref: "paper",
              yref: "paper",
              x: 0.5,
              y: 0.5,
              showarrow: false,
              font: { size: 11, color: "#6d7975" },
            },
          ];
          layout.yaxis.range = [0, 1];
        }
        if (panel.target) {
          const set = panel.target === "sigma" ? p.sigma_set : p.G_set,
            tolerance = panel.target === "sigma" ? 0.005 : 5e-9,
            last = history.at(-1),
            active = last?.target === panel.target,
            current = active ? last[panel.target] : null,
            good = active && Math.abs(current - set) <= tolerance;
          if (active) {
            layout.yaxis.range = [set - tolerance, set + tolerance];
            layout.yaxis.autorange = false;
          } else {
            layout.yaxis.autorange = true;
          }
          layout.shapes = [
            {
              type: "rect",
              xref: "paper",
              yref: "y",
              x0: 0,
              x1: 1,
              y0: set - tolerance,
              y1: set + tolerance,
              fillcolor: active ? "rgba(23,108,96,.045)" : "rgba(0,0,0,0)",
              line: { width: 0 },
              layer: "below",
            },
          ];
          let badge = card.querySelector(".tracking-state");
          if (!badge) {
            badge = document.createElement("span");
            badge.className = "tracking-state";
            card.querySelector(".plot-head").append(badge);
          }
          card.classList.toggle("tracking-active", !!active);
          card.classList.toggle("tracking-inactive", !active);
          card.classList.toggle("tracking-good", !!good);
          card.classList.toggle("tracking-bad", !!active && !good);
          badge.textContent = active ? (good ? "Good" : "Bad") : "Inactive";
          badge.className = "tracking-state " + (active ? (good ? "good" : "bad") : "");
          badge.title =
            "Within tolerance when |error| ≤ " +
            tolerance +
            "; fixed window " +
            (set - tolerance) +
            " to " +
            (set + tolerance);
        }
        if (panel.id === "parameters-growth") {
          const count = sim?.adaptSamples.length || 0,
            latest = history.at(-1),
            enabled = adaptive,
            adjusting = enabled && sensor && count >= p.min_num_adapt && latest?.adapted;
          let badge = card.querySelector(".adaptation-state");
          if (!badge) {
            badge = document.createElement("span");
            badge.className = "tracking-state adaptation-state";
            card.querySelector(".plot-head").append(badge);
          }
          card.classList.toggle("tracking-active", enabled);
          card.classList.toggle("tracking-inactive", !enabled);
          card.classList.toggle("tracking-good", !!adjusting);
          card.classList.remove("tracking-bad");
          badge.textContent = count + " / " + p.min_num_adapt;
          badge.className =
            "tracking-state adaptation-state " + (enabled ? (adjusting ? "good" : "pending") : "");
          badge.title =
            (enabled ? (adjusting ? "Adjusting. " : "Waiting. ") : "Inactive. ") +
            "Valid points: " +
            count +
            "; minimum: " +
            p.min_num_adapt +
            "; rolling maximum: " +
            p.max_num_adapt +
            (enabled && !sensor ? ". Start GSensor to collect data." : "");
        }
        if (panel.secondary)
          layout.yaxis2 = {
            title: { text: "$" + panel.secondary + "$", standoff: 4 },
            overlaying: "y",
            side: "right",
            showgrid: false,
            zeroline: false,
          };
        await window.LabMath.plot(
          Plotly.react,
          $("plot-" + panel.id),
          traces,
          layout,
          window.LabCharts.config({
            modeBarButtonsToRemove: ["lasso2d", "select2d"],
            toImageButtonOptions: { format: "png", filename: "mpcrystal-" + panel.id, scale: 2 },
          }),
        );
        if (++drawn % 2 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
      }
      if (mathUpdates.length && revision === renderRevision) await typeset(mathUpdates);
    } catch (e) {
      notify("Chart update failed: " + e.message, true);
    } finally {
      busy = false;
      if (queued) {
        queued = false;
        requestAnimationFrame(() => render(true));
      }
    }
  }
  function hasInvalid() {
    return [...inputs.values()].some(({ input }) => input.classList.contains("invalid"));
  }
  function newSimulation() {
    markControllerRefresh(false);
    if (hasInvalid()) throw Error("Correct the highlighted parameter before starting.");
    const pending = sim?.seedPending && !sim.history.length;
    sim = new E.Simulation(values, options());
    invalidateRender();
    if (pending) sim.addSeed();
  }
  function tick() {
    if (!running || paused) return;
    const start = performance.now();
    try {
      const row = sim.step();
      if (!row) {
        finish();
        return;
      }
      if (adaptive) values = { ...sim.values };
      summary();
      updateDerived();
      render();
      if (sim.history.length >= sim.p.steps) {
        finish();
        return;
      }
    } catch (e) {
      running = false;
      paused = false;
      status("Simulation stopped", "error");
      summary();
      notify(e.message, true);
      return;
    }
    const delay = Number($("interval").value);
    timer = setTimeout(tick, Math.max(delay === 0 ? 8 : 0, delay - (performance.now() - start)));
  }
  function finish() {
    running = false;
    paused = false;
    clearTimeout(timer);
    status("Complete");
    summary();
    render(true);
    notify("Simulation complete. Results are ready to export.");
  }
  function start() {
    try {
      if (running) {
        running = false;
        paused = false;
        clearTimeout(timer);
        status("Controller stopped");
        summary();
        render(true);
        return;
      }
      newSimulation();
      running = true;
      paused = false;
      lastDraw = 0;
      status("Running");
      summary();
      tick();
    } catch (e) {
      notify(e.message, true);
    }
  }
  function download(name, text, type = "application/json") {
    const url = URL.createObjectURL(new Blob([text], { type })),
      a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function saveVariables() {
    if (!sim?.history.length) {
      notify("Run the simulation before saving variables.");
      return;
    }
    download(
      "mpcrystal-variables.json",
      JSON.stringify(
        {
          format: "mpcrystal-results-v1",
          initialParameters: sim.initialParameters,
          initialOptions: sim.initialOptions,
          runEvents: sim.runEvents,
          parameters: sim.values,
          options: sim.options,
          history: sim.history,
          seedEvents: sim.seedEvents,
          crystalDiameters: sim.sizes,
        },
        null,
        2,
      ),
    );
  }
  function exportCSV() {
    if (!sim?.history.length) {
      notify("Run the simulation before exporting results.");
      return;
    }
    const keys = [...new Set(sim.history.flatMap(Object.keys))];
    download(
      "mpcrystal-results.csv",
      keys.join(",") +
        "\n" +
        sim.history.map((r) => keys.map((k) => r[k] ?? "").join(",")).join("\n"),
      "text/csv",
    );
  }
  document.querySelectorAll("[data-display-mode]").forEach(
    (button) =>
      (button.onclick = () => {
        const numeric = button.dataset.displayMode === "values";
        document
          .querySelectorAll(".plot-card")
          .forEach((card) => card.classList.toggle("values-view", numeric));
        document.querySelectorAll("[data-display-mode]").forEach((b) => {
          b.classList.toggle("active", b === button);
          b.setAttribute("aria-pressed", String(b === button));
        });
        if (!numeric)
          requestAnimationFrame(() =>
            document
              .querySelectorAll(".plot-card:not([hidden]) .plot")
              .forEach((plot) => Plotly.Plots.resize(plot)),
          );
      }),
  );
  document
    .querySelectorAll("[data-section]")
    .forEach((b) => (b.onclick = () => showTab(b.dataset.section)));
  $("view-display").onclick = () => showTab("display");
  $("edit-target").onclick = () => {
    category = "Control";
    selectedSubtabs.Control = "Target";
    $("search").value = "";
    showTab("parameters");
    filterParameters();
    inputs.get($("target").value === "sigma" ? "sigma_set" : "G_set").input.focus();
  };
  $("start").onclick = start;
  $("pause").onclick = () => {
    if (!running || !sim) return;
    paused = !paused;
    clearTimeout(timer);
    status(paused ? "Paused" : "Running", paused ? "paused" : "");
    summary();
    if (paused) render(true);
    else tick();
  };
  $("step").onclick = () => {
    if (!sim || !paused || !running) return;
    try {
      if (hasInvalid()) throw Error("Correct the highlighted parameter before advancing.");
      if (sim.history.length >= sim.p.steps) {
        notify("Run is complete. Start controller to begin a new run.");
        return;
      }
      sim.update(values, options());
      sim.step();
      if (adaptive) values = { ...sim.values };
      summary();
      updateDerived();
      render(true);
      status("One step complete · paused", "paused");
      if (sim.history.length >= sim.p.steps) finish();
    } catch (e) {
      notify(e.message, true);
    }
  };
  $("sensor").onclick = () => {
    if (!running) return;
    sensor = !sensor;
    if (!sensor) adaptive = false;
    if (sim) sim.update(values, options());
    summary();
    render(true);
  };
  $("adaptive").onclick = () => {
    if (!running || !sensor || $("adaptive-mode").value === "none") return;
    adaptive = !adaptive;
    if (sim) sim.update(values, options());
    summary();
    render(true);
  };
  $("seed").onclick = () => {
    if (!running) return;
    try {
      if (!sim) newSimulation();
      sim.addSeed();
      summary();
      flashRefresh($("seed"));
      const headerSeed = document.querySelector('.header-action[data-action="seed"]');
      if (headerSeed) flashRefresh(headerSeed);
      notify("Seed queued for the next simulation step.");
    } catch (e) {
      notify(e.message, true);
    }
  };
  function flashRefresh(button) {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    button.getAnimations().forEach((animation) => animation.cancel());
    const style = getComputedStyle(button);
    const background = style.backgroundColor;
    const color = style.color;
    const theme = getComputedStyle(document.documentElement);
    const accent = theme.getPropertyValue("--teal").trim();
    const paper = theme.getPropertyValue("--paper").trim();
    const channels = background
      .match(/[\d.]+/g)
      ?.slice(0, 3)
      .map(Number) || [255, 255, 255];
    const dark = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722 < 160;
    button.animate(
      [
        { backgroundColor: background, color },
        { offset: 0.5, backgroundColor: dark ? paper : accent, color: dark ? accent : paper },
        { backgroundColor: background, color },
      ],
      { duration: 2200, easing: "ease-in-out" },
    );
  }
  $("refresh").onclick = () => {
    markControllerRefresh(false);
    flashRefresh($("refresh"));
    if (sim) {
      sim.update(values, options());
      sim.refresh();
      summary();
      render(true);
      notify(
        "Controller and adaptation filters refreshed; adaptation samples cleared. Tuned parameters retained.",
      );
    } else notify("Controller will initialize when started.");
  };
  $("refresh-sensor").onclick = () => {
    flashRefresh($("refresh-sensor"));
    sim?.refreshSensor();
    summary();
    render(true);
    notify("Growth measurement filter refreshed; adaptation samples cleared.");
  };
  $("save-data").onclick = saveVariables;
  $("save-data-operation").onclick = saveVariables;
  $("export-csv").onclick = exportCSV;
  document.querySelectorAll("[data-controller-mode]").forEach((button) => {
    button.onclick = () => {
      $("mode").value = button.dataset.controllerMode;
      strategyChanged();
      filterParameters();
    };
  });
  for (const id of ["mode", "target", "adaptive-mode"]) $(id).onchange = strategyChanged;
  document.querySelectorAll("[name=control-target]").forEach(
    (r) =>
      (r.onchange = () => {
        $("target").value = r.value;
        strategyChanged();
      }),
  );
  controls.querySelectorAll("[data-adapt]").forEach(
    (c) =>
      (c.onchange = () => {
        const selected = [...controls.querySelectorAll("[data-adapt]:checked")].map(
          (c) => c.dataset.adapt,
        );
        $("adaptive-mode").value =
          selected.length === 3 ? "all" : selected.length ? selected.join("_and_") : "none";
        if (!selected.length) adaptive = false;
        strategyChanged();
      }),
  );
  $("interval").onchange = () => {
    if (running && !paused) {
      clearTimeout(timer);
      timer = setTimeout(tick, Math.max(8, Number($("interval").value)));
    }
  };
  $("reset").onclick = () => {
    markControllerRefresh(false);
    lastSelectedTarget = "sigma";
    clearTimeout(timer);
    running = false;
    paused = false;
    sim = null;
    sensor = false;
    adaptive = false;
    setAdaptiveSelection("all");
    values = { ...E.defaults };
    $("mode").value = "MPC";
    $("target").value = "sigma";
    $("adaptive-mode").value = "all";
    $("interval").value = "500";
    view = "all";
    category = "Control";
    primarySubtab = "MPC";
    Object.keys(selectedSubtabs).forEach((key) => delete selectedSubtabs[key]);
    $("search").value = "";
    visiblePanels = new Set(panels.map((panel) => panel.id));
    $("panel-switches")
      .querySelectorAll("input")
      .forEach((input) => (input.checked = true));
    colours = { ...coloursDefault };
    document
      .querySelectorAll("[data-colour]")
      .forEach((input) => (input.value = colours[input.dataset.colour]));
    $("columns").value = "auto";
    $("plot-grid").style.gridTemplateColumns = "";
    document.querySelectorAll(".plot-card").forEach((card) => card.classList.remove("values-view"));
    document.querySelectorAll("[data-display-mode]").forEach((button) => {
      const active = button.dataset.displayMode === "diagram";
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    document
      .querySelectorAll("[data-view]")
      .forEach((button) => button.classList.toggle("active", button.dataset.view === "all"));
    for (const { input, field } of inputs.values()) {
      input.classList.remove("invalid");
      input.setCustomValidity("");
      field.querySelector(".resolved").textContent = "";
    }
    filterParameters();
    updateDerived(true);
    summary();
    status("Ready to simulate");
    render(true);
    notify("All simulation parameters and operations reset.");
  };
  document.querySelectorAll("[data-view]").forEach(
    (b) =>
      (b.onclick = () => {
        view = b.dataset.view;
        document
          .querySelectorAll("[data-view]")
          .forEach((x) => x.classList.toggle("active", x === b));
        render(true);
      }),
  );
  $("columns").onchange = () => {
    $("plot-grid").style.gridTemplateColumns =
      $("columns").value === "auto" ? "" : `repeat(${$("columns").value},minmax(0,1fr))`;
    render(true);
  };
  $("restore-colours").onclick = () => {
    colours = { ...coloursDefault };
    document
      .querySelectorAll("[data-colour]")
      .forEach((i) => (i.value = colours[i.dataset.colour]));
    render(true);
  };
  window.addEventListener("resize", () => {
    if (tab === "display")
      document
        .querySelectorAll(".plot-card:not([hidden]) .plot")
        .forEach((n) => Plotly.Plots.resize(n));
  });

  window.addEventListener("lab:suspend", (event) => {
    if (event.detail.reason !== "page-exit") return;
    clearTimeout(timer);
    if (running) {
      paused = true;
      status("Paused", "paused");
      summary();
    }
  });

  buildParameters();
  buildPanels();
  summary();
  showTab("overview");
  typeset([document.body]);
  window.MPCrystalUI = {
    get simulation() {
      return sim;
    },
    get values() {
      return values;
    },
    showTab,
    numberExpression,
    render,
  };
})();

// Page history may preserve this document; never resume a saved run implicitly.
