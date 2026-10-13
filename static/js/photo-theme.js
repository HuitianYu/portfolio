/* Photo-derived UI palette. Scientific plot scales are deliberately independent. */
(() => {
  const script = document.currentScript,
    url = script.dataset.portrait,
    key = "portrait-theme-harmony-v4:" + url;
  const mix = (a, b, t) => a.map((v, i) => Math.round(v * (1 - t) + b[i] * t));
  const hex = (c) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  const lum = (c) =>
    c
      .map((v) => {
        v /= 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      })
      .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const contrast = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  const apply = (p) => {
    for (const [k, v] of Object.entries(p)) document.documentElement.style.setProperty("--" + k, v);
  };
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (saved) apply(saved);
  } catch {}
  const photo = new Image();
  photo.onload = () => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 48;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(photo, 0, 0, 48, 48);
      const data = ctx.getImageData(0, 0, 48, 48).data,
        bins = new Map();
      for (let i = 0; i < data.length; i += 4) {
        const c = [data[i], data[i + 1], data[i + 2]],
          max = Math.max(...c),
          min = Math.min(...c),
          sat = (max - min) / Math.max(max, 1);
        if (max < 45 || max > 220 || sat < 0.12) continue;
        const id = c.map((v) => Math.floor(v / 32)).join(",");
        const b = bins.get(id) || { sum: [0, 0, 0], n: 0 };
        c.forEach((v, j) => (b.sum[j] += v));
        b.n++;
        bins.set(id, b);
      }
      const ranked = [...bins.values()].sort((a, b) => b.n - a.n);
      let accent = ranked.length
        ? ranked[0].sum.map((v) => Math.round(v / ranked[0].n))
        : [77, 83, 55]; // Compare restrained tonal, analogous and complementary harmonies against the source.
      const source = accent;
      const candidates = [
        { name: "tonal", accent: mix(source, [255, 249, 220], 0.2), paper: [253, 251, 245] },
        { name: "analogous", accent: mix(source, [144, 141, 85], 0.24), paper: [253, 252, 246] },
        { name: "complementary", accent: mix(source, [71, 91, 117], 0.35), paper: [250, 251, 250] },
      ];
      for (const c of candidates) {
        while (contrast(c.accent, c.paper) < 4.7) c.accent = mix(c.accent, [0, 0, 0], 0.05);
        const distance = Math.sqrt(c.accent.reduce((v, n, i) => v + (n - source[i]) ** 2, 0));
        c.score =
          100 -
          distance * 0.55 +
          Math.min(contrast(c.accent, c.paper), 7) * 2 +
          (c.name === "analogous" ? 3 : 0);
      }
      const best = candidates.sort((a, b) => b.score - a.score)[0];
      accent = best.accent;
      let paper = best.paper,
        ink = mix(source, [22, 24, 21], 0.76);
      let muted = mix(ink, paper, 0.32);
      while (contrast(muted, paper) < 4.5) muted = mix(muted, ink, 0.08);
      const p = {
        paper: hex(paper),
        ink: hex(ink),
        muted: hex(muted),
        teal: hex(accent),
        accent: hex(accent),
        pale: hex(mix(accent, paper, 0.92)),
        line: hex(mix(accent, paper, 0.82)),
        white: hex(mix(paper, [255, 255, 255], 0.85)),
        card: hex(mix(paper, [255, 255, 255], 0.85)),
        success: "#28704d",
        warning: "#926119",
        danger: "#a44335",
        info: "#356b91",
        highlight: hex(mix(accent, [192, 149, 65], 0.65)),
      };
      apply(p);
      try {
        localStorage.setItem(key, JSON.stringify(p));
      } catch {}
    } catch {}
  };
  photo.src = url;
})();
