/** Shared UI behavior. Scientific state and calculations stay inside each app. */
(() => {
  function foldIcon(hidden) {
    return `<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false"><path d="${hidden ? "M5 8l5 5 5-5" : "M5 12l5-5 5 5"}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  const SECTION_SELECTOR = ".fixed-workspace-header > nav";
  const CATEGORY_SELECTOR = "nav.parameter-tabs, nav.parameter-subtabs, nav.result-tabs";

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
    const buttons = () => [...container.querySelectorAll(":scope > button")];
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
    window.UIControls.roving({ owner: container, items: buttons });
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
    function register(owner, trigger, panel, readOpen, writeOpen) {
      const controller = window.UIControls.disclosure({
        owner,
        trigger,
        readOpen,
        writeOpen,
        escape: false,
        onOpen: () => {
          entries.forEach((other) => {
            if (other.owner !== owner) other.close();
          });
        },
      });
      trigger.addEventListener("click", (event) => event.stopPropagation());
      const entry = { owner, trigger, readOpen, close: controller.close };
      entries.push(entry);
      // Position after opening, once the panel has measurable dimensions.
      const reposition = () => {
        if (readOpen()) placement.schedule();
      };
      new MutationObserver(reposition).observe(owner, {
        attributes: true,
        attributeFilter: ["open", "class"],
      });
    }
    const menus = [...document.querySelectorAll(".toolbar-options")];
    const modules = [...document.querySelectorAll(".header-module")];
    const placement = window.UIControls.frameTask(position);
    function position() {
      const updates = [];
      for (const owner of [...menus, ...modules]) {
        const module = owner.matches(".header-module");
        if (!(module ? owner.classList.contains("popover-open") : owner.open)) continue;
        const anchor = owner.querySelector("summary,.header-action");
        if (!anchor) continue;
        const bounds = anchor.getBoundingClientRect();
        updates.push([
          owner,
          "--lab-menu-room",
          Math.max(80, innerHeight - bounds.bottom - 12) + "px",
        ]);
        updates.push([
          owner,
          module ? "--module-menu-top" : "--toolbar-menu-top",
          anchor.offsetHeight + 6 + "px",
        ]);
        const panel = module ? owner.querySelector(".module-popover") : anchor.nextElementSibling;
        const width = panel?.getBoundingClientRect().width;
        if (width) {
          const preferred = owner.matches(".export-options") ? bounds.right - width : bounds.left,
            available = document.documentElement.clientWidth,
            left = Math.max(8, Math.min(preferred, available - width - 8));
          updates.push([
            owner,
            "--lab-menu-left",
            left - owner.getBoundingClientRect().left + "px",
          ]);
        }
      }
      updates.forEach(([owner, property, value]) => {
        if (owner.style.getPropertyValue(property) !== value)
          owner.style.setProperty(property, value);
      });
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
    if (header) new ResizeObserver(placement.schedule).observe(header);
    addEventListener("resize", placement.schedule);
    position();
  }
  function initializeMetricSizing() {
    for (const container of document.querySelectorAll("#headline-metrics, .metrics")) {
      function fit() {
        const updates = [];
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
          if (Math.abs(next - current) > 0.5) updates.push([value, next.toFixed(1) + "px"]);
        }
        // Measure all values before changing any font, avoiding repeated layout flushes.
        updates.forEach(([value, size]) => value.style.setProperty("--metric-value-size", size));
      }
      const { schedule } = window.UIControls.frameTask(fit);
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
  function initializeCompactControls() {
    const workspaceNav = workspaceHeader?.querySelector(":scope > nav");
    if (workspaceNav) {
      const compactToggle = document.createElement("button");
      compactToggle.type = "button";
      compactToggle.className = "mobile-controls-toggle";
      compactToggle.innerHTML = foldIcon(false);
      compactToggle.setAttribute("aria-expanded", "true");
      compactToggle.setAttribute("aria-label", "Hide Lab controls");

      function setCompact(collapsed) {
        if (window.parent !== window) parent.postMessage({ type: "lab:layout" }, location.origin);
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
  }
  function initializeToolbarAlignment() {
    function alignToolbarUtilities() {
      if (!workspaceHeader) return;
      const header = workspaceHeader.querySelector(":scope > header");
      if (!header) return;
      const primary = header.querySelector(
        ".header-playback, .header-computation, .common-controls",
      );
      const secondary = header.querySelector(
        ".secondary-controls, .header-file-actions, .grid-reset-controls",
      );
      if (!primary || !secondary) return;
      const a = primary.getBoundingClientRect(),
        b = secondary.getBoundingClientRect();
      const wrapped = a.height > 0 && b.top >= a.bottom - 1;
      if (header.classList.contains("utilities-wrapped") !== wrapped)
        header.classList.toggle("utilities-wrapped", wrapped);
    }
    const alignment = window.UIControls.frameTask(alignToolbarUtilities);
    if (workspaceHeader) new ResizeObserver(alignment.schedule).observe(workspaceHeader);
    addEventListener("resize", alignment.schedule);
    document.fonts?.ready.then(alignment.schedule);
    alignToolbarUtilities();
  }
  function initializeViewportBridge() {
    if (window.parent === window) return;
    function reportViewport() {
      parent.postMessage(
        { type: "lab:viewport", scrollbar: innerWidth - document.documentElement.clientWidth },
        location.origin,
      );
    }
    const viewport = window.UIControls.frameTask(reportViewport);
    new ResizeObserver(viewport.schedule).observe(document.documentElement);
    addEventListener("resize", viewport.schedule);
    reportViewport();
    // Transfer an unconsumed gesture across the iframe boundary immediately.
    // Ordinary pages/posts keep their single native document scroller.
    function handoff(event, delta) {
      if (!event.cancelable || !Number.isFinite(delta) || !delta) return;
      let host;
      try {
        host = parent.document.scrollingElement;
      } catch {
        return;
      }
      if (!host) return;
      for (let node = event.target; node && node !== document.body; node = node.parentElement) {
        if (
          node.scrollHeight > node.clientHeight + 1 &&
          /auto|scroll/.test(getComputedStyle(node).overflowY)
        ) {
          const room =
            delta > 0 ? node.scrollHeight - node.clientHeight - node.scrollTop : node.scrollTop;
          if (room > 1) return;
        }
      }
      const local = document.scrollingElement;
      const localRoom = Math.max(0, local.scrollHeight - local.clientHeight - local.scrollTop);
      const hostRoom =
        delta > 0 ? host.scrollHeight - host.clientHeight - host.scrollTop : host.scrollTop;
      if (hostRoom <= 0 || (delta > 0 && delta <= localRoom)) return;
      if (delta < 0 && host.scrollTop <= 0) return;
      event.preventDefault();
      if (delta > 0 && localRoom > 0) {
        local.scrollTop += localRoom;
        delta -= localRoom;
      }
      parent.scrollBy({
        top: Math.sign(delta) * Math.min(Math.abs(delta), hostRoom),
        behavior: "instant",
      });
    }
    addEventListener(
      "wheel",
      (event) => {
        if (event.ctrlKey || event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY))
          return;
        const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1;
        handoff(event, event.deltaY * scale);
      },
      { passive: false },
    );
    let touch = null;
    addEventListener(
      "touchstart",
      (event) => {
        touch =
          event.touches.length === 1
            ? { x: event.touches[0].clientX, y: event.touches[0].clientY }
            : null;
      },
      { passive: true },
    );
    addEventListener(
      "touchmove",
      (event) => {
        if (!touch || event.touches.length !== 1) return;
        const next = event.touches[0];
        const dy = touch.y - next.clientY,
          dx = touch.x - next.clientX;
        touch = { x: next.clientX, y: next.clientY };
        if (Math.abs(dy) > Math.abs(dx)) handoff(event, dy);
      },
      { passive: false },
    );
    addEventListener(
      "touchend",
      () => {
        touch = null;
      },
      { passive: true },
    );
    let scrollPosition = 0;
    const scroll = window.UIControls.frameTask(() => {
      parent.postMessage({ type: "lab:scroll", y: scrollPosition }, location.origin);
    });
    addEventListener(
      "scroll",
      () => {
        scrollPosition = scrollY;
        scroll.schedule();
      },
      { passive: true },
    );
  }
  if (window.parent !== window) document.body.classList.add("embedded-lab");
  // Shared container height follows wrapped and collapsed workspace controls.
  if (workspaceHeader) {
    const sizeChrome = window.UIControls.frameTask(() => {
      document.documentElement.style.setProperty(
        "--lab-chrome-height",
        `${workspaceHeader.getBoundingClientRect().height}px`,
      );
    });
    new ResizeObserver(sizeChrome.schedule).observe(workspaceHeader);
    sizeChrome.schedule();
  }
  initializeCompactControls();
  initializeToolbarAlignment();
  initializeViewportBridge();
  initializePointerBehavior();
  initializeMetricSizing();
  initializeToolbarMenus();
  initializeSectionLabels();
  const sections = document.querySelector(SECTION_SELECTOR);
  if (sections) initializeNavigation(sections, { tabs: true, label: "Lab sections" });
  document.querySelectorAll(CATEGORY_SELECTOR).forEach((container) => {
    initializeNavigation(container, {
      tabs: container.dataset.panelTabs === "true",
      label: container.getAttribute("aria-label") || categoryLabel(container),
    });
  });
  initializeStatusFeedback();
  initializeWorkspaceLifecycle();
})();
