/** Host sizing and section history. Sticky positioning belongs to the browser. */
(() => {
  const frame = document.querySelector("#lab-frame");
  if (!frame) return;
  let observer, sectionObserver, releaseToolbar, positionDocument;
  let rememberPosition = () => {};
  const positions = new Map();
  addEventListener("lab:before-section-change", () => rememberPosition());
  addEventListener("scroll", () => rememberPosition(), { passive: true });
  function connect() {
    observer?.disconnect();
    sectionObserver?.disconnect();
    releaseToolbar?.();
    const body = frame.contentDocument?.body;
    const controls = body?.querySelector(".fixed-workspace-header");
    if (!controls) return;
    releaseToolbar = window.LabNativeToolbar(frame, controls);
    if (positionDocument !== body.ownerDocument) positions.clear();
    positionDocument = body.ownerDocument;
    function sizeContent() {
      if (frame.contentDocument?.body !== body) return;
      const height = Math.ceil(body.getBoundingClientRect().height);
      if (height > 0 && frame.style.height !== height + "px") frame.style.height = height + "px";
    }
    const update = window.UIControls.frameTask(sizeContent);
    observer = new ResizeObserver(update.schedule);
    observer.observe(body);
    let section = body.dataset.section;
    let restoring = false;
    function sectionStart() {
      const headerBottom = Math.max(
        0,
        document.querySelector(".site-header")?.getBoundingClientRect().bottom || 0,
      );
      return (
        scrollY +
        frame.getBoundingClientRect().top -
        headerBottom -
        frame.previousElementSibling.offsetHeight
      );
    }
    rememberPosition = () => {
      if (!restoring && body.dataset.section === section)
        positions.set(section, Math.max(0, scrollY - sectionStart()));
    };
    sectionObserver = new MutationObserver(() => {
      if (section === body.dataset.section) return;
      section = body.dataset.section;
      restoring = true;
      const destination = section;
      const restore = () => {
        if (destination !== body.dataset.section || frame.contentDocument?.body !== body) return;
        sizeContent();
        window.labNavigationUntil = performance.now() + 350;
        window.scrollTo({
          top: Math.max(0, sectionStart() + (positions.get(destination) || 0)),
          behavior: "instant",
        });
      };
      // Restore before first paint, and reconcile once before the following paint.
      restore();
      requestAnimationFrame(() => {
        restore();
        requestAnimationFrame(() => {
          if (destination === body.dataset.section) restoring = false;
        });
      });
    });
    sectionObserver.observe(body, { attributes: true, attributeFilter: ["data-section"] });
    frame.contentDocument.fonts?.ready.then(update.schedule);
    update.schedule();
  }
  frame.addEventListener("load", connect);
  const siteHeader = document.querySelector(".site-header");
  if (siteHeader) {
    const sizeHeader = () =>
      document.documentElement.style.setProperty(
        "--site-header-height",
        siteHeader.offsetHeight + "px",
      );
    new ResizeObserver(sizeHeader).observe(siteHeader);
    sizeHeader();
  }
  if (frame.contentDocument?.readyState === "complete") connect();
})();
