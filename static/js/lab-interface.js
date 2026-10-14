/** Shared UI behavior. Scientific state and calculations stay inside each app. */
(() => {
  function foldIcon(hidden) {
    return `<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false"><path d="${hidden ? "M5 8l5 5 5-5" : "M5 12l5-5 5 5"}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

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

  function initializeToolbarMenus() {
    const entries = [];
    let lastTouch = -Infinity;
    const mouseHover = matchMedia("(hover:hover) and (pointer:fine)");
    function register(owner, trigger, panel, readOpen, writeOpen) {
      let openTimer, closeTimer;
      const cancel = () => {
        clearTimeout(openTimer);
        clearTimeout(closeTimer);
      };
      const entry = {
        owner,
        trigger,
        readOpen,
        close() {
          cancel();
          writeOpen(false);
          trigger.setAttribute("aria-expanded", "false");
        },
      };
      function open() {
        cancel();
        entries.forEach((other) => {
          if (other !== entry) other.close();
        });
        writeOpen(true);
        trigger.setAttribute("aria-expanded", "true");
        position();
      }
      function enter(event) {
        if (
          event.pointerType !== "mouse" ||
          !mouseHover.matches ||
          performance.now() - lastTouch < 1000
        )
          return;
        cancel();
        if (!readOpen()) openTimer = setTimeout(open, 100);
      }
      function leave(event) {
        if (event.pointerType !== "mouse" || !mouseHover.matches) return;
        cancel();
        closeTimer = setTimeout(entry.close, 220);
      }
      owner.addEventListener("pointerenter", enter);
      owner.addEventListener("pointerleave", leave);
      owner.addEventListener("pointerdown", (event) => {
        cancel();
        if (event.pointerType !== "mouse") lastTouch = performance.now();
      });
      owner.addEventListener("focusin", cancel);
      owner.addEventListener("focusout", (event) => {
        if (
          !owner.contains(event.relatedTarget) &&
          (!mouseHover.matches || !owner.matches(":hover"))
        )
          entry.close();
      });
      trigger.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        cancel();
        if (readOpen()) entry.close();
        else open();
      });
      entries.push(entry);
      entry.close();
    }
    const menus = [...document.querySelectorAll(".toolbar-options")];
    const modules = [...document.querySelectorAll(".header-module")];
    function position() {
      for (const owner of [...menus, ...modules]) {
        const anchor = owner.querySelector("summary,.header-action");
        if (!anchor) continue;
        owner.style.setProperty(
          "--lab-menu-room",
          Math.max(80, innerHeight - anchor.getBoundingClientRect().bottom - 12) + "px",
        );
        owner.style.setProperty(
          owner.matches(".header-module") ? "--module-menu-top" : "--toolbar-menu-top",
          anchor.offsetHeight + 6 + "px",
        );
        const panel = owner.matches(".header-module")
          ? owner.querySelector(".module-popover")
          : anchor.nextElementSibling;
        if (panel && panel.getBoundingClientRect().width) {
          const width = panel.getBoundingClientRect().width,
            bounds = anchor.getBoundingClientRect(),
            preferred = owner.matches(".export-options") ? bounds.right - width : bounds.left,
            available = document.documentElement.clientWidth,
            left = Math.max(8, Math.min(preferred, available - width - 8));
          owner.style.setProperty(
            "--lab-menu-left",
            left - owner.getBoundingClientRect().left + "px",
          );
        }
      }
    }
    for (const menu of menus) {
      const summary = menu.querySelector("summary"),
        panel = summary?.nextElementSibling;
      if (!summary || !panel) continue;
      register(
        menu,
        summary,
        panel,
        () => menu.open,
        (open) => {
          menu.open = open;
        },
      );
    }
    for (const module of modules) {
      const panel = module.querySelector(".module-popover"),
        action = module.querySelector(".header-action");
      if (!panel?.children.length || !action) continue;
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "module-menu-toggle";
      toggle.setAttribute("aria-label", action.textContent.trim() + " settings");
      toggle.innerHTML = foldIcon(true);
      module.append(toggle);
      module.classList.add("has-module-menu");
      register(
        module,
        toggle,
        panel,
        () => module.classList.contains("popover-open"),
        (open) => {
          module.classList.toggle("popover-open", open);
          panel.setAttribute("aria-hidden", String(!open));
          panel.inert = !open;
        },
      );
    }
    document.addEventListener("pointerdown", (event) => {
      entries.forEach((entry) => {
        if (!entry.owner.contains(event.target)) entry.close();
      });
    });
    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key !== "Escape") return;
        const mathMenu = document.querySelector(".math-menu:not([hidden])");
        if (mathMenu) {
          event.preventDefault();
          mathMenu.hidden = true;
          const trigger = mathMenu.parentElement.querySelector("[aria-expanded]");
          trigger?.setAttribute("aria-expanded", "false");
          trigger?.focus();
          return;
        }
        const open = entries.find((entry) => entry.readOpen());
        if (open) {
          event.preventDefault();
          open.close();
          open.trigger.focus();
        }
      },
      { capture: true },
    );
    document.addEventListener(
      "scroll",
      (event) => {
        entries.forEach((entry) => {
          if (!entry.owner.contains(event.target)) entry.close();
        });
      },
      { capture: true, passive: true },
    );
    const header = document.querySelector(".fixed-workspace-header");
    if (header) new ResizeObserver(position).observe(header);
    addEventListener("resize", position);
    position();
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
  const workspaceHeader = document.querySelector(".fixed-workspace-header");
  const workspaceNav = workspaceHeader?.querySelector(":scope > nav");
  if (workspaceNav) {
    const compactToggle = document.createElement("button");
    compactToggle.type = "button";
    compactToggle.className = "mobile-controls-toggle";
    compactToggle.innerHTML = foldIcon(false);
    compactToggle.setAttribute("aria-expanded", "true");
    compactToggle.setAttribute("aria-label", "Hide Lab controls");

    function setCompact(collapsed) {
      workspaceHeader.classList.toggle("mobile-controls-collapsed", collapsed);
      compactToggle.setAttribute("aria-expanded", String(!collapsed));
      compactToggle.setAttribute(
        "aria-label",
        collapsed ? "Show Lab controls" : "Hide Lab controls",
      );
      compactToggle.innerHTML = foldIcon(collapsed);
      dispatchEvent(new Event("resize"));
    }
    compactToggle.addEventListener("click", () =>
      setCompact(!workspaceHeader.classList.contains("mobile-controls-collapsed")),
    );
    document.addEventListener(
      "keydown",
      (event) => {
        if (
          event.key !== "Escape" ||
          event.defaultPrevented ||
          workspaceHeader.classList.contains("mobile-controls-collapsed") ||
          document.querySelector(".toolbar-options[open], .math-menu:not([hidden])") ||
          [...document.querySelectorAll(".module-popover")].some(
            (panel) => panel.children.length && getComputedStyle(panel).display !== "none",
          ) ||
          event.target.tagName === "SELECT"
        )
          return;
        event.preventDefault();
        setCompact(true);
        compactToggle.focus();
      },
      { capture: true },
    );
    // Keep the disclosure outside the tablist so it is not treated as a page tab.
    workspaceHeader.append(compactToggle);
  }
  function alignToolbarUtilities() {
    if (!workspaceHeader) return;
    const header = workspaceHeader.querySelector(":scope > header");
    if (!header) return;
    const primary = header.querySelector(".header-playback, .header-computation, .common-controls");
    const secondary = header.querySelector(
      ".secondary-controls, .header-file-actions, .grid-reset-controls",
    );
    if (!primary || !secondary) return;
    const a = primary.getBoundingClientRect(),
      b = secondary.getBoundingClientRect();
    header.classList.toggle("utilities-wrapped", a.height > 0 && b.top >= a.bottom - 1);
  }
  if (workspaceHeader) new ResizeObserver(alignToolbarUtilities).observe(workspaceHeader);
  addEventListener("resize", alignToolbarUtilities);
  document.fonts?.ready.then(alignToolbarUtilities);
  alignToolbarUtilities();
  function reportViewport() {
    if (window.parent !== window)
      parent.postMessage(
        { type: "lab:viewport", scrollbar: innerWidth - document.documentElement.clientWidth },
        location.origin,
      );
  }
  new ResizeObserver(reportViewport).observe(document.documentElement);
  addEventListener("resize", reportViewport);
  reportViewport();
  let scrollFrame = null,
    scrollPosition = 0;
  document.addEventListener(
    "scroll",
    (event) => {
      if (window.parent === window) return;
      const target = event.target;
      scrollPosition = target === document ? scrollY : target.scrollTop;
      if (!Number.isFinite(scrollPosition) || scrollFrame !== null) return;
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = null;
        parent.postMessage({ type: "lab:scroll", y: scrollPosition }, location.origin);
      });
    },
    { passive: true, capture: true },
  );
  initializePointerBehavior();
  initializeMetricSizing();
  initializeToolbarMenus();
  initializeSectionLabels();
  const sections = document.querySelector(SECTION_SELECTOR);
  if (sections) initializeNavigation(sections, { tabs: true, label: "Lab sections" });
  document.querySelectorAll(CATEGORY_SELECTOR).forEach((container) => {
    initializeNavigation(container, { tabs: false, label: categoryLabel(container) });
  });
  initializeStatusFeedback();
  initializeWorkspaceLifecycle();
})();
