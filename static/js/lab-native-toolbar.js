/** Native sticky presentation; original controls remain the single source of scientific state. */
(() => {
  window.LabNativeToolbar = function (frame, source) {
    const originalDocument = source.ownerDocument;
    const host = document.createElement("div");
    host.className = "lab-native-toolbar";
    const view = document.createElement("iframe");
    view.title = "Lab controls";
    view.setAttribute("scrolling", "no");
    host.append(view);
    frame.before(host);
    const doc = view.contentDocument;
    doc.open();
    doc.write(
      '<!doctype html><html class="embedded-workspace"><head></head><body class="embedded-lab"></body></html>',
    );
    doc.close();
    // Keep fragment-only SVG glyph references inside this document. A base URL
    // pointing at the source workspace sends MathJax <use> references elsewhere.
    for (const style of originalDocument.querySelectorAll(
      'head style,head link[rel="stylesheet"]',
    )) {
      const clonedStyle = doc.importNode(style, true);
      if (style.tagName === "LINK") clonedStyle.href = style.href;
      doc.head.append(clonedStyle);
    }
    const style = doc.createElement("style");
    style.textContent =
      "html.embedded-workspace,html.embedded-workspace body{margin:0!important;min-height:0!important;height:100%!important;overflow:visible!important;background:transparent!important}.fixed-workspace-header{position:relative!important;top:0!important;transform:none!important;visibility:visible!important}";
    doc.head.append(style);
    // Runtime theme tokens live on the source root, outside the cloned controls.
    const theme = originalDocument.defaultView.getComputedStyle(originalDocument.documentElement);
    for (const property of theme) {
      if (property.startsWith("--"))
        doc.documentElement.style.setProperty(property, theme.getPropertyValue(property));
    }
    const originals = new WeakMap();
    const copies = new WeakMap();
    function copy(node) {
      const cloned = doc.importNode(node, false);
      originals.set(cloned, node);
      copies.set(node, cloned);
      for (const child of node.childNodes) cloned.append(copy(child));
      return cloned;
    }
    const controls = copy(source);
    doc.body.append(controls);
    source.classList.add("native-toolbar-source");
    source.inert = true;
    function reconcile(node) {
      const cloned = copies.get(node);
      if (!cloned) return;
      if (node.nodeType === 3) {
        if (cloned.nodeValue !== node.nodeValue) cloned.nodeValue = node.nodeValue;
        return;
      }
      if (node.nodeType !== 1) return;
      for (const attribute of [...cloned.attributes])
        if (!node.hasAttribute(attribute.name)) cloned.removeAttribute(attribute.name);
      for (const attribute of node.attributes) {
        let value = attribute.value;
        if (attribute.name === "inert") continue;
        if (attribute.name === "class") value = value.replace(/\bnative-toolbar-source\b/g, "");
        if (attribute.name === "style") value = value.replace(/transform\s*:[^;]+;?/g, "");
        if (cloned.getAttribute(attribute.name) !== value)
          cloned.setAttribute(attribute.name, value);
      }
      if ("value" in node && doc.activeElement !== cloned && cloned.value !== node.value)
        cloned.value = node.value;
      if ("checked" in node) cloned.checked = node.checked;
      for (let index = 0; index < node.childNodes.length; index++) {
        const child = node.childNodes[index];
        const target = copies.get(child) || copy(child);
        if (cloned.childNodes[index] !== target)
          cloned.insertBefore(target, cloned.childNodes[index] || null);
        reconcile(child);
      }
      while (cloned.childNodes.length > node.childNodes.length) cloned.lastChild.remove();
    }
    function resize() {
      const height = Math.ceil(controls.getBoundingClientRect().height);
      if (!height) return;
      host.style.height = height + "px";
      let extent = height;
      const room = Math.max(
        height,
        window.innerHeight - Math.max(0, host.getBoundingClientRect().top),
      );
      for (const panel of controls.querySelectorAll(
        ".module-popover,.export-options-list,.math-menu,.toolbar-options[open] > :not(summary)",
      )) {
        if (!panel.getClientRects().length || getComputedStyle(panel).visibility === "hidden")
          continue;
        const top = panel.getBoundingClientRect().top;
        panel.style.maxHeight = Math.max(80, room - top - 8) + "px";
        panel.style.overflowY = "auto";
        extent = Math.max(extent, panel.getBoundingClientRect().bottom);
      }
      view.style.height = Math.ceil(extent + 2) + "px";
    }
    const update = window.UIControls.frameTask(() => {
      reconcile(source);
      resize();
    });
    const observer = new MutationObserver(update.schedule);
    observer.observe(source, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    for (const eventName of ["input", "change"]) {
      doc.addEventListener(eventName, (event) => {
        const target = originals.get(event.target);
        if (!target) return;
        target.value = event.target.value;
        if ("checked" in target) target.checked = event.target.checked;
        target.dispatchEvent(new originalDocument.defaultView.Event(eventName, { bubbles: true }));
        update.schedule();
      });
    }
    doc.addEventListener("pointerdown", (event) => {
      if (event.target.closest(".fixed-workspace-header")) return;
      originalDocument.body.dispatchEvent(
        new originalDocument.defaultView.PointerEvent("pointerdown", { bubbles: true }),
      );
      update.schedule();
    });
    doc.addEventListener("click", (event) => {
      const clicked = event.target.closest('button,summary,a,input[type="checkbox"]');
      if (!clicked) return;
      const target = originals.get(clicked);
      if (!target) return;
      event.preventDefault();
      // Native checkbox forwarding is handled by the click, not a second change event.
      if (target.dataset.section) window.dispatchEvent(new Event("lab:before-section-change"));
      target.click();
      update.schedule();
    });
    doc.addEventListener("keydown", (event) => {
      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        const target = originals.get(event.target);
        if (target?.closest("nav[role=tablist],nav[role=toolbar]")) {
          event.preventDefault();
          target.dispatchEvent(
            new originalDocument.defaultView.KeyboardEvent("keydown", {
              key: event.key,
              bubbles: true,
            }),
          );
          update.schedule();
        }
        return;
      }
      if (event.key !== "Escape") return;
      originalDocument.dispatchEvent(
        new originalDocument.defaultView.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      update.schedule();
    });
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(controls);
    for (const link of doc.querySelectorAll('link[rel="stylesheet"]'))
      link.addEventListener("load", resize);
    doc.fonts?.ready.then(resize);
    const outside = (event) => {
      if (host.contains(event.target)) return;
      originalDocument.body.dispatchEvent(
        new originalDocument.defaultView.PointerEvent("pointerdown", { bubbles: true }),
      );
      update.schedule();
    };
    document.addEventListener("pointerdown", outside);
    update.schedule();
    return () => {
      observer.disconnect();
      resizeObserver.disconnect();
      update.cancel();
      document.removeEventListener("pointerdown", outside);
      source.classList.remove("native-toolbar-source");
      source.inert = false;
      host.remove();
    };
  };
})();
