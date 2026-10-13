/** Shared workspace primitives; scientific state remains in each app. */
(() => {
  function font(size = 12, muted = false) {
    const style = getComputedStyle(document.documentElement);
    return {
      family: style.getPropertyValue("--sans").trim() || "Inter, Segoe UI, sans-serif",
      size,
      color: style.getPropertyValue(muted ? "--muted" : "--ink").trim() || "#23251c",
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
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
      if (!panel) continue;
      button.id ||= "lab-section-" + button.dataset.section;
      button.setAttribute("aria-controls", panel.id);
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", button.id);
      panel.hidden = !active;
    }
    return true;
  }
  window.LabCharts = Object.freeze({ font });
  window.LabWorkspace = Object.freeze({ selectSection });
})();
