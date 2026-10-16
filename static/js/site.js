function initializeSiteControls() {
  const toggle = document.querySelector(".menu-toggle"),
    nav = document.querySelector("#site-nav"),
    header = document.querySelector(".header-inner"),
    brand = header?.querySelector(".wordmark");
  if (!toggle || !nav || !header || !brand) return;
  const menu = window.UIControls.disclosure({
    owner: header,
    trigger: toggle,
    hoverTargets: [toggle, nav],
    readOpen: () => nav.classList.contains("open"),
    writeOpen: (open) => nav.classList.toggle("open", open),
    canOpen: () => header.classList.contains("nav-compact"),
    mouseClick: false,
    openDelay: 0,
    closeDelay: 180,
  });
  const setOpen = menu.setOpen;
  function measure() {
    const previous = nav.getAttribute("style");
    for (const [name, value] of Object.entries({
      display: "flex",
      position: "absolute",
      visibility: "hidden",
      width: "max-content",
      "flex-wrap": "nowrap",
      "max-width": "none",
      padding: "0",
      gap: "20px",
    }))
      nav.style.setProperty(name, value, "important");
    const required = nav.getBoundingClientRect().width;
    if (previous === null) nav.removeAttribute("style");
    else nav.setAttribute("style", previous);
    const style = getComputedStyle(header),
      available =
        header.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight) -
        brand.getBoundingClientRect().width -
        24;
    const compact = required > available;
    if (header.classList.contains("nav-compact") !== compact) setOpen(false);
    header.classList.toggle("nav-compact", compact);
    if (!compact) setOpen(false);
  }
  nav.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => setOpen(false)));
  const measurement = window.UIControls.frameTask(measure);
  new ResizeObserver(measurement.schedule).observe(header);
  addEventListener("resize", measurement.schedule);
  document.fonts?.ready.then(measurement.schedule);
  measure();
}

function initializeContextLabel() {
  const toolbar = document.querySelector(".lab-toolbar"),
    brand = toolbar?.querySelector(".lab-toolbar-brand"),
    name = brand?.lastElementChild;
  if (!toolbar || !brand || !name) return;
  function fit() {
    const previous = name.getAttribute("style");
    for (const [key, value] of Object.entries({
      display: "inline-block",
      position: "absolute",
      visibility: "hidden",
      width: "max-content",
    }))
      name.style.setProperty(key, value, "important");
    const required = name.getBoundingClientRect().width;
    if (previous === null) name.removeAttribute("style");
    else name.setAttribute("style", previous);
    const style = getComputedStyle(toolbar),
      icon = brand.querySelector(".theme-icon"),
      back = toolbar.querySelector(":scope > a"),
      actions = toolbar.querySelector(".lab-toolbar-actions");
    const available =
      toolbar.clientWidth -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight) -
      (back?.getBoundingClientRect().width || 0) -
      (actions?.getBoundingClientRect().width || 0) -
      (icon?.getBoundingClientRect().width || 0) -
      40;
    toolbar.classList.toggle("context-name-hidden", required > available);
  }
  const measurement = window.UIControls.frameTask(fit);
  new ResizeObserver(measurement.schedule).observe(toolbar);
  addEventListener("resize", measurement.schedule);
  document.fonts?.ready.then(measurement.schedule);
  fit();
}

function initializeCarousels() {
  document.querySelectorAll(".home-carousel").forEach((track) => {
    const originals = [...track.children],
      count = originals.length;
    if (count < 2) return;
    const pad = Math.min(2, count),
      pause = document.querySelector('[data-pause="' + track.id + '"]'),
      reduced = matchMedia("(prefers-reduced-motion:reduce)").matches;
    let stopped = reduced,
      hover = false,
      focused = false,
      visible = false,
      timer = null,
      scrollTimer = null;
    const clone = (el) => {
      const copy = el.cloneNode(true);
      copy.setAttribute("aria-hidden", "true");
      copy.removeAttribute("id");
      copy.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
      copy.querySelectorAll("a,button").forEach((a) => a.setAttribute("tabindex", "-1"));
      return copy;
    };
    originals
      .slice(-pad)
      .reverse()
      .forEach((el) => track.prepend(clone(el)));
    originals.slice(0, pad).forEach((el) => track.append(clone(el)));
    const step = () => track.children[1].offsetLeft - track.children[0].offsetLeft;
    const jump = (value) => {
      track.style.scrollBehavior = "auto";
      track.style.scrollSnapType = "none";
      track.scrollLeft = value;
      requestAnimationFrame(() => {
        track.style.scrollBehavior = "";
        track.style.scrollSnapType = "";
      });
    };
    const normalize = () => {
      if (performance.now() < movingUntil) return;
      const w = step(),
        index = Math.round(track.scrollLeft / w);
      if (index < pad) jump(track.scrollLeft + count * w);
      else if (index >= count + pad) jump(track.scrollLeft - count * w);
    };
    let movingUntil = 0;
    const move = (direction) => {
      if (performance.now() < movingUntil) return;
      normalize();
      movingUntil = performance.now() + 700;
      track.scrollBy({ left: direction * step(), behavior: reduced ? "instant" : "smooth" });
    };
    const refresh = () => {
      clearInterval(timer);
      if (!stopped && !hover && !focused && visible && !document.hidden)
        timer = setInterval(() => move(1), 3000);
      pause.innerHTML = playbackIcon(stopped);
      pause.setAttribute("aria-pressed", String(stopped));
      pause.setAttribute(
        "aria-label",
        (stopped ? "Resume " : "Pause ") + track.id.replace("home-", "") + " carousel",
      );
    };
    pause.addEventListener("click", () => {
      stopped = !stopped;
      refresh();
    });
    document.querySelectorAll('[data-carousel="' + track.id + '"]').forEach((b) => {
      b.disabled = false;
      b.addEventListener("click", () => {
        move(Number(b.dataset.direction));
        refresh();
      });
    });
    track.addEventListener(
      "scroll",
      () => {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(normalize, 500);
      },
      { passive: true },
    );
    const hoverArea = track;
    hoverArea.addEventListener("mouseenter", () => {
      hover = true;
      refresh();
    });
    hoverArea.addEventListener("mouseleave", () => {
      hover = false;
      refresh();
    });
    track.addEventListener("focusin", () => {
      focused = true;
      refresh();
    });
    track.addEventListener("focusout", () => {
      focused = track.contains(document.activeElement);
      refresh();
    });
    document.addEventListener("visibilitychange", refresh);
    new IntersectionObserver(
      (entries) => {
        visible = entries[0].isIntersecting;
        refresh();
      },
      { threshold: 0 },
    ).observe(track);
    let width = 0;
    new ResizeObserver(() => {
      const next = track.clientWidth;
      if (next !== width) {
        width = next;
        jump(pad * step());
      }
    }).observe(track);
    requestAnimationFrame(() => jump(pad * step()));
    refresh();
  });
}

function initializePageOutline() {
  const layout = document.querySelector(".with-page-outline"),
    toggle = document.querySelector("#outline-toggle");
  if (!layout || !toggle) return;
  const links = [...document.querySelectorAll("#page-outline-links a")];
  const outline = layout.querySelector(".page-outline");
  const menu = window.UIControls.disclosure({
    owner: outline,
    trigger: toggle,
    readOpen: () => !layout.classList.contains("outline-collapsed"),
    writeOpen: (open) => {
      layout.classList.toggle("outline-collapsed", !open);
      toggle.title = open ? "Collapse contents" : "Expand contents";
    },
    focusOpen: true,
    mouseClick: false,
    openDelay: 0,
    closeDelay: 0,
  });
  const setOpen = menu.setOpen;
  const sections = links
    .map((a) => document.getElementById(decodeURIComponent(a.hash.slice(1))))
    .filter(Boolean);
  function update() {
    let current = sections[0];
    for (const section of sections) {
      if (section.getBoundingClientRect().top <= 180) current = section;
    }
    links.forEach((a) => {
      if (a.hash === "#" + current?.id) a.setAttribute("aria-current", "location");
      else a.removeAttribute("aria-current");
    });
  }
  links.forEach((a) =>
    a.addEventListener("click", () => {
      if (innerWidth <= 760) setOpen(false);
    }),
  );
  addEventListener("scroll", update, { passive: true });
  update();
}

// The mobile navigation is a disclosure, with an explicit keyboard exit.
function initializeMobileKeyboardExit() {
  const button = document.querySelector(".menu-toggle"),
    nav = document.querySelector("#site-nav");
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && button?.getAttribute("aria-expanded") === "true") {
      button.setAttribute("aria-expanded", "false");
      nav.classList.remove("open");
      button.focus();
    }
  });
}

// The recovery control belongs to the host, so it does not depend on lab scripts.
document.querySelector("#restart-lab")?.addEventListener("click", () => {
  const old = document.querySelector("#lab-frame");
  if (!old) return;
  // Keep the shared host sizing/sticky observers attached when restarting.
  old.src = old.src;
});

initializeSiteControls();
initializeContextLabel();
initializeCarousels();
initializePageOutline();
initializeMobileKeyboardExit();

function playbackIcon(play) {
  return `<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">${play ? '<path d="M6 3.5v13l10-6.5z" fill="currentColor"/>' : '<rect x="5" y="4" width="3" height="12" rx=".7" fill="currentColor"/><rect x="12" y="4" width="3" height="12" rx=".7" fill="currentColor"/>'}</svg>`;
}
function initializeResponsiveHeader() {
  let previousY = 0,
    travel = 0,
    transitionUntil = 0;
  function revealNavigation(hidden) {
    if (document.body.classList.contains("mobile-nav-away") !== hidden)
      transitionUntil = performance.now() + 300;
    document.body.classList.toggle("mobile-nav-away", hidden);
  }
  function followScroll(y) {
    if (!Number.isFinite(y)) return;
    const delta = y - previousY;
    previousY = y;
    if (performance.now() < Math.max(transitionUntil, window.labNavigationUntil || 0)) {
      travel = 0;
      return;
    }
    if (!matchMedia("(max-width:760px), (max-height:480px) and (orientation:landscape)").matches)
      return;
    if (document.querySelector(".menu-toggle")?.getAttribute("aria-expanded") === "true") return;
    travel = Math.sign(delta) === Math.sign(travel) ? travel + delta : delta;
    const lab = document.body.classList.contains("lab-route");
    if (y < (lab ? 4 : 40) || travel < -20) {
      revealNavigation(false);
      travel = 0;
    } else if (y > (lab ? 8 : 100) && travel > (lab ? 8 : 32)) {
      revealNavigation(true);
      travel = 0;
    }
  }
  addEventListener(
    "scroll",
    () => {
      followScroll(scrollY);
    },
    { passive: true },
  );
  document.querySelector(".menu-toggle")?.addEventListener("click", () => {
    revealNavigation(false);
  });
  document
    .querySelector(".site-header")
    ?.addEventListener("focusin", () => revealNavigation(false));
  addEventListener("resize", () => {
    if (!matchMedia("(max-width:760px), (max-height:480px) and (orientation:landscape)").matches)
      revealNavigation(false);
  });
}
initializeResponsiveHeader();
