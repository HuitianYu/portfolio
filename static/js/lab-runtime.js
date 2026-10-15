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
    const selected = buttons.find((button) => button.dataset.section === key);
    if (!selected || selected.disabled) return false;
    document.body.dataset.section = key;
    for (const button of buttons) {
      const active = button === selected;
      const panel = document.getElementById(button.dataset.section);
      button.id ||= "lab-section-" + button.dataset.section;
      presentPanel(button, panel, active);
    }
    return true;
  }
  window.LabCharts = Object.freeze({ font, config: chartConfig });
  window.LabWorkspace = Object.freeze({ selectSection, connectPanels });
  window.LabUI = Object.freeze({ text, playback });
})();

/** Readable math when the local renderer is unavailable; never changes scientific state. */
(() => {
  const symbols = {
    gamma: "γ",
    Gamma: "Γ",
    beta: "β",
    tau: "τ",
    kappa: "κ",
    sigma: "σ",
    Delta: "Δ",
    mu: "µ",
    phi: "φ",
    pi: "π",
    rho: "ρ",
    times: "×",
    cdot: "·",
    pm: "±",
    circ: "°",
    int: "∫",
    sum: "Σ",
    exp: "exp",
    ln: "ln",
    max: "max",
    min: "min",
  };
  function plain(tex) {
    return tex
      .replace(/\\(?:mathrm|text|boldsymbol)\s*\{([^{}]*)\}/g, "$1")
      .replace(/\\(?:mathrm|text|boldsymbol)\s+([A-Za-z])/g, "$1")
      .replace(/\\(?:left|right|rm)\b/g, "")
      .replace(/\\(?:qquad|quad|[,;! ])/g, " ")
      .replace(/\\([A-Za-z]+)/g, (_, name) => symbols[name] ?? name)
      .replace(/[{}]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  function bounded(promise, milliseconds = 8000) {
    let timer;
    return Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error("Math renderer timed out")), milliseconds);
      }),
    ]).finally(() => clearTimeout(timer));
  }
  let rendererFailed = false;
  async function ready() {
    try {
      if (!window.MathJax?.startup?.promise) throw Error("Math renderer unavailable");
      await bounded(window.MathJax.startup.promise);
      rendererFailed = false;
      return window.MathJax;
    } catch (error) {
      rendererFailed = true;
      throw error;
    }
  }
  function plainLabels(value) {
    if (typeof value === "string") return value.replace(/\$([^$]+)\$/g, (_, tex) => plain(tex));
    if (!value || typeof value !== "object" || ArrayBuffer.isView(value)) return value;
    if (Array.isArray(value) && (typeof value[0] === "number" || Array.isArray(value[0])))
      return value;
    if (Array.isArray(value)) return value.map(plainLabels);
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plainLabels(item)]));
  }
  async function plot(method, element, data, layout, config) {
    if (!rendererFailed) {
      try {
        await ready();
      } catch {
        /* Use readable labels below. */
      }
    }
    if (rendererFailed || !window.MathJax?.startup?.promise) {
      return method(element, plainLabels(data), plainLabels(layout), {
        ...config,
        typesetMath: false,
      });
    }
    return method(element, data, layout, config);
  }
  function fallback(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.parentElement?.closest("svg,mjx-container,script,style,code,textarea")) continue;
      node.nodeValue = node.nodeValue.replace(
        /\$\$([\s\S]*?)\$\$|\$([^$\n]+)\$|\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/g,
        (_, display, inline, paren, bracket) => plain(display ?? inline ?? paren ?? bracket),
      );
    }
  }
  async function typeset(roots) {
    try {
      const math = await ready();
      if (!math.typesetPromise) throw Error("Math typesetting unavailable");
      await bounded(math.typesetPromise(roots));
    } catch {
      roots.forEach(fallback);
    }
  }
  window.LabMath = Object.freeze({ plain, bounded, ready, typeset, plot });
})();
