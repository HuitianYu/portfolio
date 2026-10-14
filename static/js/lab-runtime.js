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
