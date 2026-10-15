/** Shared workspace primitives; scientific state remains in each app. */
(() => {
  /** Avoid rebuilding labels on every simulation tick. */
  function text(element, value) {
    if (element.textContent !== value) element.textContent = value;
  }
  function playback(
    button,
    { active, idleLabel = "Play", activeLabel = "Pause", label, disabled },
  ) {
    const caption = label ?? (active ? activeLabel : idleLabel);
    text(button, caption);
    button.classList.add("playback-toggle");
    button.dataset.playbackState = active ? "playing" : "paused";
    button.setAttribute("aria-pressed", String(active));
    button.setAttribute("aria-label", caption);
    if (disabled !== undefined) button.disabled = disabled;
  }
  function presentPanel(button, panel, active) {
    button.classList.toggle("active", active);
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
    if (!panel) return;
    button.setAttribute("aria-controls", panel.id);
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", button.id);
    panel.hidden = !active;
  }
  /** Connect one level of nested tabs without changing its parent selection. */
  function connectPanels({ container, buttonKey, panelKey, scope = document }) {
    const attribute = (key) => key.replace(/[A-Z]/g, (letter) => "-" + letter.toLowerCase());
    const buttons = [
      ...container.querySelectorAll(`:scope > button[data-${attribute(buttonKey)}]`),
    ];
    const panels = [...scope.querySelectorAll(`[data-${attribute(panelKey)}]`)];
    container.dataset.panelTabs = "true";
    function select(button) {
      if (!buttons.includes(button) || button.disabled) return false;
      for (const item of buttons) {
        const active = item === button;
        const panel = panels.find((entry) => entry.dataset[panelKey] === item.dataset[buttonKey]);
        if (panel) {
          panel.id ||= `lab-${attribute(panelKey)}-${item.dataset[buttonKey]}`;
          item.id ||= panel.id + "-tab";
        }
        presentPanel(item, panel, active);
      }
      return true;
    }
    buttons.forEach((button) => button.addEventListener("click", () => select(button)));
    select(buttons.find((button) => button.classList.contains("active")) || buttons[0]);
    return Object.freeze({ select });
  }
  function font(size = 12, muted = false) {
    const style = getComputedStyle(document.documentElement);
    return {
      family: style.getPropertyValue("--sans").trim() || "Inter, Segoe UI, sans-serif",
      size,
      color: style.getPropertyValue(muted ? "--muted" : "--ink").trim() || "#23251c",
    };
  }
  /** Common local chart actions; each view retains its own export format and size. */
  function chartConfig({ modeBarButtonsToRemove = [], ...options } = {}) {
    return {
      responsive: true,
      displaylogo: false,
      ...options,
      modeBarButtonsToRemove: [
        ...new Set(["sendDataToCloud", "sendChartToCloud", ...modeBarButtonsToRemove]),
      ],
    };
  }
  function selectSection(key) {
    const buttons = [...document.querySelectorAll(".fixed-workspace-header > nav [data-section]")];
    const panelFor = (button) =>
      document.querySelector(`[data-section-panel="${button.dataset.section}"]`) ||
      document.getElementById(button.dataset.section);
    const selected = buttons.find((button) => button.dataset.section === key);
    if (!selected || selected.disabled || !panelFor(selected)) return false;
    document.body.dataset.section = key;
    for (const button of buttons) {
      const active = button === selected;
      const panel = panelFor(button);
      button.id ||= "lab-section-" + button.dataset.section;
      presentPanel(button, panel, active);
    }
    return true;
  }
  window.LabCharts = Object.freeze({ font, config: chartConfig });
  window.LabWorkspace = Object.freeze({ selectSection, connectPanels });
  function dataFailure(element, detail) {
    element.textContent = detail || "Data unavailable. Check public access and try again.";
    element.hidden = false;
    element.dataset.error = "true";
    element.setAttribute("role", "status");
  }
  function operationState(
    button,
    state,
    message,
    progress = 0,
    { busy = state === "running" } = {},
  ) {
    button.dataset.state = state;
    button.dataset.progressControl = "true";
    button.setAttribute("aria-busy", String(busy));
    button.style.setProperty("--run-progress", Math.max(0, Math.min(100, progress)) + "%");
    button.title = message;
  }
  function progress(root, { state = "ready", value = 0, message = "Ready", detail = "" } = {}) {
    if (!root) return;
    const percent = Math.max(0, Math.min(100, value));
    root.dataset.state = state;
    const caption = root.querySelector("[data-progress-message]");
    const info = root.querySelector("[data-progress-detail]");
    const track = root.querySelector('[role="progressbar"]');
    const fill = root.querySelector("[data-progress-fill]");
    if (caption) text(caption, message);
    if (info) text(info, detail || Math.round(percent) + "%");
    if (track) {
      track.setAttribute("aria-valuenow", String(percent));
      track.setAttribute("aria-valuetext", detail || message);
      track.setAttribute("aria-busy", String(state === "running"));
    }
    if (fill) fill.style.width = percent + "%";
  }
  const tasks = new WeakMap();
  const taskKinds = new Set(["download", "calculation", "playback"]);
  function taskState(owner, kind) {
    return tasks.get(owner)?.[kind] || null;
  }
  function task({ root, button, kind, state, value = null, message, detail = "", present = true }) {
    if (!taskKinds.has(kind)) throw Error("Unknown task kind");
    state = { pending: "running", active: "running" }[state] || state;
    if (
      ![
        "idle",
        "ready",
        "running",
        "buffering",
        "paused",
        "complete",
        "cancelled",
        "error",
      ].includes(state)
    )
      throw Error("Unknown task state");
    const owner = root || button;
    if (owner)
      tasks.set(owner, {
        ...tasks.get(owner),
        [kind]: Object.freeze({ kind, state, value, message, detail }),
      });
    if (!present) return;
    if (root) {
      root.dataset.kind = kind;
      root.dataset.indeterminate = String(value === null && state === "running");

      progress(root, { state, value: value ?? 0, message, detail });
      if (value === null) {
        root.querySelector('[role="progressbar"]')?.removeAttribute("aria-valuenow");
        const info = root.querySelector("[data-progress-detail]");
        if (info) text(info, detail);
      }
    }
    if (button) {
      button.dataset.kind = kind;
      operationState(button, state, message, value ?? 0, {
        busy: kind !== "playback" && state === "running",
      });
    }
  }
  const lightStates = new WeakMap();
  function syncStatusLights(root = document) {
    const phase = -((performance.timeOrigin + performance.now()) % 2400) + "ms";
    for (const light of root.querySelectorAll(".header-action, .operation-status, .status")) {
      const state = light.dataset.state;
      if (lightStates.get(light) === state) continue;
      lightStates.set(light, state);
      if (state === "active") light.style.setProperty("--lab-light-phase", phase);
      else light.style.removeProperty("--lab-light-phase");
    }
  }
  function sourceInfo(key) {
    if (!["local", "cloud"].includes(key)) throw Error("Unknown data source");
    return (
      window.LAB_CONFIG?.ui?.dataSources?.[key] || {
        label: key === "local" ? "Local" : "Cloud",
        description: key === "local" ? "Supplied with this Lab" : "Requires network access",
      }
    );
  }
  function source(element, key, { text: replaceText = true } = {}) {
    const info = sourceInfo(key);
    element.dataset.source = key;
    if (replaceText) element.textContent = info.label;
    element.title = info.description;
    return element;
  }
  window.LabUI = Object.freeze({
    text,
    playback,
    dataFailure,
    operationState,
    task,
    taskState,
    progress,
    syncStatusLights,
    sourceInfo,
    source,
  });
})();
