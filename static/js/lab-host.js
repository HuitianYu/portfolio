/** One page scroller. Lab controls remain pinned within naturally sized content. */
(() => {
  const frame = document.querySelector("#lab-frame");
  if (!frame) return;
  let observer, sectionObserver;
  let updateLayout = () => {};
  function connect() {
    observer?.disconnect();
    sectionObserver?.disconnect();
    const body = frame.contentDocument?.body;
    if (!body) return;
    const controls = body.querySelector(".fixed-workspace-header");
    function layout() {
      if (frame.contentDocument?.body !== body) return;
      const height = Math.ceil(body.getBoundingClientRect().height);
      if (height > 0 && frame.style.height !== height + "px") frame.style.height = height + "px";
      if (!controls) return;
      const headerBottom = Math.max(
        0,
        document.querySelector(".site-header")?.getBoundingClientRect().bottom || 0,
      );
      const offset = Math.min(
        Math.max(0, height - controls.offsetHeight),
        Math.max(0, headerBottom - frame.getBoundingClientRect().top),
      );
      controls.style.transform = `translateY(${Math.round(offset)}px)`;
    }
    const update = window.UIControls.frameTask(layout);
    observer = new ResizeObserver(update.schedule);
    observer.observe(body);
    let section = body.dataset.section;
    sectionObserver = new MutationObserver(() => {
      if (section === body.dataset.section) return;
      section = body.dataset.section;
      const headerHeight = document.querySelector(".site-header")?.offsetHeight || 0;
      if (frame.getBoundingClientRect().top < headerHeight)
        window.scrollTo({
          top: Math.max(0, scrollY + frame.getBoundingClientRect().top - headerHeight),
          behavior: "instant",
        });
      update.schedule();
    });
    sectionObserver.observe(body, { attributes: true, attributeFilter: ["data-section"] });
    frame.contentDocument.fonts?.ready.then(update.schedule);
    updateLayout = update.schedule;
    update.schedule();
  }
  frame.addEventListener("load", connect);
  for (const event of ["scroll", "resize"])
    addEventListener(event, () => updateLayout(), { passive: true });
  const siteHeader = document.querySelector(".site-header");
  if (siteHeader) {
    new ResizeObserver(() => updateLayout()).observe(siteHeader);
    siteHeader.addEventListener("transitionend", () => updateLayout());
  }
  if (frame.contentDocument?.readyState === "complete") connect();
})();
