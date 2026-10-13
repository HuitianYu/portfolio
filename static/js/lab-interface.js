/** Shared UI behavior. Scientific state and calculations stay inside each app. */
(() => {
  const SECTION_SELECTOR = ".fixed-workspace-header > nav";
  const CATEGORY_SELECTOR = "nav.parameter-tabs, nav.parameter-subtabs, nav.result-tabs";
  const NAVIGATION_KEYS = ["ArrowLeft", "ArrowRight", "Home", "End"];

  function initializeSectionLabels() {
    const labels = window.LAB_CONFIG?.ui?.sections;
    if (!labels) return;
    document.querySelectorAll(`${SECTION_SELECTOR} button`).forEach((button) => {
      const key = button.dataset.section;
      if (labels[key]) button.textContent = labels[key];
    });
  }

  /** One keyboard convention for sections and parameter/result categories. */
  function initializeNavigation(container, { tabs, label }) {
    container.setAttribute("role", tabs ? "tablist" : "toolbar");
    container.setAttribute("aria-label", label);
    const buttons = () => [...container.querySelectorAll("button")];
    const isSelected = (button) =>
      button.classList.contains("active") || (!tabs && button.classList.contains("selected"));
    function synchronize() {
      const items = buttons();
      const selected =
        items.find((button) => !button.disabled && isSelected(button)) ||
        items.find((button) => !button.disabled);
      items.forEach((button) => {
        button.type = "button";
        if (tabs) button.setAttribute("role", "tab");
        button.setAttribute(
          tabs ? "aria-selected" : "aria-pressed",
          String(tabs ? isSelected(button) : button === selected),
        );
        button.tabIndex = button === selected ? 0 : -1;
      });
    }
    new MutationObserver(synchronize).observe(container, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "disabled"],
    });
    container.addEventListener("keydown", (event) => {
      if (!NAVIGATION_KEYS.includes(event.key)) return;
      const available = buttons().filter((button) => !button.disabled);
      const current = available.indexOf(document.activeElement);
      if (current < 0) return;
      event.preventDefault();
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? available.length - 1
            : (current + (event.key === "ArrowRight" ? 1 : -1) + available.length) %
              available.length;
      const target = available[next];
      target.click();
      // A scientific app may rebuild this category row in its click handler.
      const refreshed = buttons().filter((button) => !button.disabled);
      (target.isConnected ? target : refreshed[next])?.focus();
    });
    synchronize();
  }

  function categoryLabel(container) {
    if (container.classList.contains("primary-subtabs")) return "Controller model";
    if (container.classList.contains("parameter-subtabs")) return "Parameter topics";
    if (container.classList.contains("parameter-tabs")) return "Parameter categories";
    return "Result views";
  }

  function initializeStatusFeedback() {
    document.querySelectorAll("button[data-ui-action]").forEach((button) => {
      if (!button.hasAttribute("type")) button.type = "button";
    });
    document.querySelectorAll('[role="status"]').forEach((status) => {
      status.setAttribute("aria-live", "polite");
      status.setAttribute("aria-atomic", "true");
    });
  }

  function initializeWorkspaceLifecycle() {
    const suspend = (reason) =>
      window.dispatchEvent(new CustomEvent("lab:suspend", { detail: { reason } }));
    window.addEventListener("pagehide", () => suspend("page-exit"));
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) suspend("background");
    });
    document.addEventListener("keydown", (event) => {
      if (
        event.key === "Escape" &&
        !event.defaultPrevented &&
        !document.documentElement.classList.contains("lab-header-hidden") &&
        window.parent !== window
      ) {
        window.parent.postMessage({ type: "lab:exit-focus" }, location.origin);
      }
    });
  }

  function initializeHeaderVisibility() {
    let hidden = false;
    let button;
    function setHidden(value) {
      hidden = value;
      document.documentElement.classList.toggle("lab-header-hidden", hidden);
      if (button) {
        const label = hidden
          ? window.LAB_CONFIG.ui.shell.showHeaders
          : window.LAB_CONFIG.ui.shell.hideHeaders;
        button.setAttribute("aria-label", label);
        button.title = label;
        button.setAttribute("aria-pressed", String(hidden));
        button.textContent = hidden ? "▾" : "▴";
      }
      window.dispatchEvent(new Event("resize"));
    }
    if (window.parent === window) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "lab-header-toggle";
      document.body.append(button);
      button.addEventListener("click", () => setHidden(!hidden));
      setHidden(false);
    }
    window.addEventListener("message", (event) => {
      if (
        event.origin === location.origin &&
        event.source === window.parent &&
        event.data?.type === "lab:headers"
      )
        setHidden(event.data.hidden === true);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !hidden) return;
      event.preventDefault();
      setHidden(false);
      if (window.parent !== window)
        window.parent.postMessage({ type: "lab:show-headers" }, location.origin);
    });
  }
  function initializeToolbarMenus() {
    const menus = [...document.querySelectorAll(".toolbar-options")];
    document.addEventListener("click", (event) => {
      for (const menu of menus) if (menu.open && !menu.contains(event.target)) menu.open = false;
    });
    document.addEventListener(
      "keydown",
      (event) => {
        const open = menus.find((menu) => menu.open);
        if (event.key !== "Escape" || !open) return;
        event.preventDefault();
        open.open = false;
        open.querySelector("summary").focus();
      },
      { capture: true },
    );
  }
  function initializeMetricSizing() {
    for (const container of document.querySelectorAll("#headline-metrics, .metrics")) {
      let frame = null;
      function fit() {
        frame = null;
        for (const value of container.querySelectorAll(
          ".metric strong, .metric .value, :scope > div > strong",
        )) {
          if (!value.clientWidth) continue;
          const rendered = value.querySelector("mjx-container");
          const width = rendered
            ? Math.max(
                rendered.scrollWidth,
                rendered.querySelector("svg")?.getBoundingClientRect().width || 0,
                rendered.getBoundingClientRect().width,
              )
            : value.scrollWidth;
          const current = parseFloat(getComputedStyle(value).fontSize);
          const next = Math.min(
            26,
            Math.max(16, (current * (value.clientWidth - 2)) / Math.max(width, 1)),
          );
          if (Math.abs(next - current) > 0.5)
            value.style.setProperty("--metric-value-size", next.toFixed(1) + "px");
        }
      }
      const schedule = () => {
        if (frame === null) frame = requestAnimationFrame(fit);
      };
      new MutationObserver(schedule).observe(container, {
        subtree: true,
        childList: true,
        characterData: true,
      });
      new ResizeObserver(schedule).observe(container);
      schedule();
    }
  }
  function initializePointerBehavior() {
    document.addEventListener("keydown", (event) => {
      if (["Tab", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key))
        document.body.classList.add("keyboard-navigation");
    });
    document.addEventListener(
      "pointermove",
      () => document.body.classList.remove("keyboard-navigation"),
      { passive: true },
    );
    document.addEventListener("pointerdown", () =>
      document.body.classList.remove("keyboard-navigation"),
    );
  }
  initializePointerBehavior();
  initializeMetricSizing();
  initializeToolbarMenus();
  initializeHeaderVisibility();
  initializeSectionLabels();
  const sections = document.querySelector(SECTION_SELECTOR);
  if (sections) initializeNavigation(sections, { tabs: true, label: "Lab sections" });
  document.querySelectorAll(CATEGORY_SELECTOR).forEach((container) => {
    initializeNavigation(container, { tabs: false, label: categoryLabel(container) });
  });
  initializeStatusFeedback();
  initializeWorkspaceLifecycle();
})();
