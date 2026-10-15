/** Readable math when the local renderer is unavailable; never changes scientific state. */
(() => {
  const symbols = {
    gamma: "γ",
    Gamma: "Γ",
    beta: "β",
    tau: "τ",
    kappa: "κ",
    sigma: "σ",
    Delta: "Δ",
    mu: "µ",
    phi: "φ",
    pi: "π",
    rho: "ρ",
    times: "×",
    cdot: "·",
    pm: "±",
    circ: "°",
    int: "∫",
    sum: "Σ",
    exp: "exp",
    ln: "ln",
    max: "max",
    min: "min",
  };
  function plain(tex) {
    return tex
      .replace(/\\(?:mathrm|text|boldsymbol)\s*\{([^{}]*)\}/g, "$1")
      .replace(/\\(?:mathrm|text|boldsymbol)\s+([A-Za-z])/g, "$1")
      .replace(/\\(?:left|right|rm)\b/g, "")
      .replace(/\\(?:qquad|quad|[,;! ])/g, " ")
      .replace(/\\([A-Za-z]+)/g, (_, name) => symbols[name] ?? name)
      .replace(/[{}]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  function bounded(promise, milliseconds = 8000) {
    let timer;
    return Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error("Math renderer timed out")), milliseconds);
      }),
    ]).finally(() => clearTimeout(timer));
  }
  let rendererFailed = false;
  async function ready() {
    try {
      if (!window.MathJax?.startup?.promise) throw Error("Math renderer unavailable");
      await bounded(window.MathJax.startup.promise);
      rendererFailed = false;
      return window.MathJax;
    } catch (error) {
      rendererFailed = true;
      throw error;
    }
  }
  function plainLabels(value) {
    if (typeof value === "string") return value.replace(/\$([^$]+)\$/g, (_, tex) => plain(tex));
    if (!value || typeof value !== "object" || ArrayBuffer.isView(value)) return value;
    if (Array.isArray(value) && (typeof value[0] === "number" || Array.isArray(value[0])))
      return value;
    if (Array.isArray(value)) return value.map(plainLabels);
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plainLabels(item)]));
  }
  async function plot(method, element, data, layout, config) {
    if (!rendererFailed) {
      try {
        await ready();
      } catch {
        /* Use readable labels below. */
      }
    }
    if (rendererFailed || !window.MathJax?.startup?.promise) {
      return method(element, plainLabels(data), plainLabels(layout), {
        ...config,
        typesetMath: false,
      });
    }
    return method(element, data, layout, config);
  }
  function fallback(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.parentElement?.closest("svg,mjx-container,script,style,code,textarea")) continue;
      node.nodeValue = node.nodeValue.replace(
        /\$\$([\s\S]*?)\$\$|\$([^$\n]+)\$|\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/g,
        (_, display, inline, paren, bracket) => plain(display ?? inline ?? paren ?? bracket),
      );
    }
  }
  async function typeset(roots) {
    try {
      const math = await ready();
      if (!math.typesetPromise) throw Error("Math typesetting unavailable");
      await bounded(math.typesetPromise(roots));
    } catch {
      roots.forEach(fallback);
    }
  }
  window.LabMath = Object.freeze({ plain, bounded, ready, typeset, plot });
})();
