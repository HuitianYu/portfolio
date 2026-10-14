/** DOM-only disclosure behavior shared by the website and scientific workspaces. */
(() => {
  function disclosure({
    owner,
    trigger,
    readOpen,
    writeOpen,
    hoverTargets = [owner],
    canOpen = () => true,
    onOpen = () => {},
    openDelay = 100,
    closeDelay = 220,
    mouseClick = true,
    focusOpen = false,
    escape = true,
  }) {
    const hover = matchMedia("(hover:hover) and (pointer:fine)");
    let opening,
      closing,
      touched = -Infinity;
    function cancel() {
      clearTimeout(opening);
      clearTimeout(closing);
    }
    function setOpen(value) {
      cancel();
      const open = Boolean(value && canOpen());
      if (open && !readOpen()) onOpen();
      writeOpen(open);
      trigger.setAttribute("aria-expanded", String(open));
    }
    function close() {
      setOpen(false);
    }
    for (const target of hoverTargets) {
      target.addEventListener("pointerenter", (event) => {
        if (event.pointerType !== "mouse" || !hover.matches || performance.now() - touched < 1000)
          return;
        cancel();
        if (!readOpen()) opening = setTimeout(() => setOpen(true), openDelay);
      });
      target.addEventListener("pointerleave", (event) => {
        if (event.pointerType !== "mouse" || !hover.matches) return;
        cancel();
        closing = setTimeout(close, closeDelay);
      });
    }
    owner.addEventListener("pointerdown", (event) => {
      cancel();
      if (event.pointerType !== "mouse") touched = performance.now();
    });
    owner.addEventListener("focusin", () => {
      cancel();
      if (focusOpen) setOpen(true);
    });
    owner.addEventListener("focusout", (event) => {
      if (!owner.contains(event.relatedTarget) && (!hover.matches || !owner.matches(":hover")))
        close();
    });
    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      if (
        mouseClick ||
        !hover.matches ||
        event.detail === 0 ||
        event.pointerType === "touch" ||
        event.pointerType === "pen"
      )
        setOpen(!readOpen());
    });
    owner.ownerDocument.addEventListener("pointerdown", (event) => {
      if (!owner.contains(event.target)) close();
    });
    if (escape)
      owner.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && readOpen()) {
          event.preventDefault();
          trigger.focus();
          close();
        }
      });
    close();
    return Object.freeze({ setOpen, close, cancel });
  }
  window.UIControls = Object.freeze({ disclosure });
})();
