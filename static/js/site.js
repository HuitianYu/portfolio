function initializeSiteControls() {
  const toggle = document.querySelector(".menu-toggle"),
    nav = document.querySelector("#site-nav");
  toggle?.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", String(open));
    nav.classList.toggle("open", open);
  });
  const focus = document.querySelector("#focus-lab");
  focus?.addEventListener("click", () => {
    const active = document.body.classList.toggle("lab-focus");
    focus.setAttribute("aria-pressed", String(active));
    focus.textContent = active ? focus.dataset.labelExit + " ⤡" : focus.dataset.labelFocus + " ⤢";
  });
  document.addEventListener("keydown", (e) => {
    if (
      e.key === "Escape" &&
      document.body.classList.contains("lab-focus") &&
      !document.body.classList.contains("lab-header-hidden")
    )
      focus.click();
  });
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
      const w = step(),
        index = Math.round(track.scrollLeft / w);
      if (index < pad) jump(track.scrollLeft + count * w);
      else if (index >= count + pad) jump(track.scrollLeft - count * w);
    };
    const move = (direction) => {
      normalize();
      track.scrollBy({ left: direction * step(), behavior: reduced ? "instant" : "smooth" });
    };
    const refresh = () => {
      clearInterval(timer);
      if (!stopped && !hover && !focused && visible && !document.hidden)
        timer = setInterval(() => move(1), 3000);
      pause.textContent = stopped ? "▶" : "Ⅱ";
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
        scrollTimer = setTimeout(normalize, 180);
      },
      { passive: true },
    );
    const hoverArea = track.closest(".home-section") || track;
    hoverArea.addEventListener("mouseenter", () => {
      hover = true;
      track.scrollTo({ left: track.scrollLeft, behavior: "instant" });
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
  function setOpen(open) {
    layout.classList.toggle("outline-collapsed", !open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.title = open ? "Collapse contents" : "Expand contents";
  }
  setOpen(false);
  const outline = layout.querySelector(".page-outline"),
    hoverDevice = matchMedia("(hover:hover) and (pointer:fine)");
  outline.addEventListener("mouseenter", () => {
    if (hoverDevice.matches) setOpen(true);
  });
  outline.addEventListener("mouseleave", () => {
    if (hoverDevice.matches) setOpen(false);
  });
  outline.addEventListener("focusin", () => setOpen(true));
  outline.addEventListener("focusout", () => {
    if (!outline.contains(document.activeElement) && !outline.matches(":hover")) setOpen(false);
  });
  toggle.addEventListener("click", () => {
    if (!hoverDevice.matches) setOpen(toggle.getAttribute("aria-expanded") !== "true");
  });
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

// Accept Escape from the embedded workspace only, without replacing its instance.
window.addEventListener("message", (event) => {
  const frame = document.querySelector("#lab-frame");
  if (
    event.origin !== location.origin ||
    event.source !== frame?.contentWindow ||
    event.data?.type !== "lab:exit-focus"
  )
    return;
  if (document.body.classList.contains("lab-focus")) {
    document.querySelector("#focus-lab")?.click();
    document.querySelector("#focus-lab")?.focus();
  }
});

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
  const fresh = old.cloneNode(false);
  old.replaceWith(fresh);
});

initializeSiteControls();
initializeCarousels();
initializePageOutline();
initializeMobileKeyboardExit();

function initializeLabHeaderToggle() {
  const button = document.querySelector("#toggle-lab-headers");
  if (!button) return;
  const send = () =>
    document
      .querySelector("#lab-frame")
      ?.contentWindow.postMessage(
        { type: "lab:headers", hidden: document.body.classList.contains("lab-header-hidden") },
        location.origin,
      );
  function setHidden(hidden) {
    document.body.classList.toggle("lab-header-hidden", hidden);
    button.setAttribute("aria-pressed", String(hidden));
    button.setAttribute("aria-label", hidden ? button.dataset.labelShow : button.dataset.labelHide);
    button.title = hidden ? button.dataset.labelShow + " (Escape)" : button.dataset.labelHide;
    button.querySelector("span").textContent = hidden ? "▾" : "▴";
    send();
    window.dispatchEvent(new Event("resize"));
  }
  button.addEventListener("click", () =>
    setHidden(!document.body.classList.contains("lab-header-hidden")),
  );
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.body.classList.contains("lab-header-hidden")) {
      event.preventDefault();
      setHidden(false);
      button.focus();
    }
  });
  document.addEventListener(
    "load",
    (event) => {
      if (event.target.id === "lab-frame") send();
    },
    true,
  );
  window.addEventListener("message", (event) => {
    const frame = document.querySelector("#lab-frame");
    if (
      event.origin === location.origin &&
      event.source === frame?.contentWindow &&
      event.data?.type === "lab:show-headers"
    ) {
      setHidden(false);
      button.focus();
    }
  });
}
initializeLabHeaderToggle();
