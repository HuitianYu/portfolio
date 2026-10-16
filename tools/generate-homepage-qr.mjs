/** Build-only brand QR. The URL and colours come from site configuration. */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import { parse } from "yaml";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = parse(await fs.readFile(path.join(root, "config.yaml"), "utf8"));
const url = new URL(config.baseURL);
if (!["http:", "https:"].includes(url.protocol))
  throw Error("A website URL is required for the homepage code.");
const tokens = await fs.readFile(path.join(root, "ui/styles/tokens.css"), "utf8");
const colour = (name) => tokens.match(new RegExp("--" + name + ":\\s*(#[0-9a-f]{6})", "i"))[1];
const paper = colour("paper"),
  ink = colour("ink"),
  primary = colour("teal");
const blend = (a, b, t) =>
  "#" +
  [1, 3, 5]
    .map((i) =>
      Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
const muted = blend(primary, paper, 0.24);
const qr = QRCode.create(url.href, { errorCorrectionLevel: "H", maskPattern: 4 });
const n = qr.modules.size,
  unit = 132 / n,
  left = 44;
const raw = [
  [32, 12.625],
  [48.7792, 22.3125],
  [48.7792, 41.6875],
  [32, 51.375],
  [15.2208, 41.6875],
  [15.2208, 22.3125],
  [32, 23.875],
  [39.0365, 36.0625],
  [24.9635, 36.0625],
];
const points = raw.map(([x, y]) => [
  110 + ((x - 32) * 200) / 38.75,
  110 + ((y - 32) * 200) / 38.75,
]);
const edges = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
  [5, 0],
  [6, 7],
  [7, 8],
  [8, 6],
  [0, 6],
  [6, 1],
  [1, 7],
  [2, 7],
  [7, 3],
  [3, 8],
  [4, 8],
  [8, 5],
  [5, 6],
];
const reinforced = edges.filter((_, i) => ![1, 4, 7].includes(i));
const distance = (x, y, [a, b]) => {
  const [ax, ay] = points[a],
    [bx, by] = points[b],
    vx = bx - ax,
    vy = by - ay,
    t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(x - ax - t * vx, y - ay - t * vy);
};
const locators = [
  [left + 3.5 * unit, left + 3.5 * unit],
  [left + (n - 3.5) * unit, left + 3.5 * unit],
  [left + 3.5 * unit, left + (n - 3.5) * unit],
];
const polygon = points
  .slice(0, 6)
  .map(([x, y]) => `${110 + (x - 110) * 1.025},${110 + (y - 110) * 1.025}`)
  .join(" ");
const parts = [
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 220" role="img"><title>HYU homepage code</title><rect width="220" height="220" fill="${paper}"/><defs><clipPath id="hex"><polygon points="${polygon}"/></clipPath><mask id="facets"><rect width="220" height="220" fill="white"/><rect x="77" y="94" width="66" height="32" rx="3" fill="black"/>`,
];
for (const [x, y] of locators) parts.push(`<circle cx="${x}" cy="${y}" r="31" fill="black"/>`);
parts.push('</mask></defs><g clip-path="url(#hex)">');
for (let y = 10; y <= 210; y += 4)
  for (let x = 22; x <= 198; x += 4) {
    if (x >= 40 && x <= 180 && y >= 40 && y <= 180) continue;
    if (
      Math.min(...edges.map((e) => distance(x + 2, y + 2, e))) > 2.7 ||
      locators.some(([a, b]) => Math.hypot(x + 2 - a, y + 2 - b) < 31)
    )
      continue;
    parts.push(`<rect x="${x}" y="${y}" width="3.7" height="3.7" rx=".7" fill="${ink}"/>`);
  }
for (let y = 0; y < n; y++)
  for (let x = 0; x < n; x++)
    if (qr.modules.get(y, x)) {
      const px = left + x * unit,
        py = left + y * unit,
        c =
          Math.min(...reinforced.map((e) => distance(px + unit / 2, py + unit / 2, e))) < 3.2
            ? ink
            : muted;
      parts.push(
        `<rect x="${px}" y="${py}" width="${unit}" height="${unit}" rx="${unit * 0.175}" fill="${c}"/>`,
      );
    }
for (const [x, y] of locators)
  for (const [r, c] of [
    [4.5, paper],
    [3.5, primary],
    [2.5, paper],
    [1.5, primary],
  ])
    parts.push(`<circle cx="${x}" cy="${y}" r="${r * unit}" fill="${c}"/>`);
parts.push(
  `<g mask="url(#facets)" stroke="${ink}" fill="none" stroke-linecap="round" stroke-linejoin="round">`,
);
for (let i = 0; i < edges.length; i++) {
  const [a, b] = edges[i],
    strong = ![1, 4, 7].includes(i);
  parts.push(
    `<path d="M${points[a].join(" ")}L${points[b].join(" ")}" stroke-width="${strong ? 2.4 : 1.2}" stroke-opacity="${strong ? 0.32 : 0.25}"/>`,
  );
}
const mark = (await fs.readFile(path.join(root, "ui/brand/hyu.svg"), "utf8"))
  .replace(/<\/?svg[^>]*>/g, "")
  .replaceAll("#23251c", ink);
parts.push(
  `</g><rect x="77" y="94" width="66" height="32" rx="3" fill="${paper}"/>${mark}</g></svg>\n`,
);
const output = path.join(root, "static/images/homepage-qr.svg"),
  svg = parts.join("");
if (process.argv.includes("--check")) {
  if ((await fs.readFile(output, "utf8").catch(() => "")) !== svg)
    throw Error("Homepage code is stale. Run npm run build:qr.");
} else {
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, svg);
}
console.log("Homepage code " + (process.argv.includes("--check") ? "checked" : "generated") + ".");
