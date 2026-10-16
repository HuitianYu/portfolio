/** Verify emitted local references rather than relying only on source checks. */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
const pages = [];
async function collect(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await collect(file);
    else if (entry.name.endsWith(".html")) pages.push(file);
  }
}
await collect(root);
let checked = 0;
const missing = new Set();

for (const page of pages) {
  const text = await fs.readFile(page, "utf8");
  for (const match of text.matchAll(/\b(?:src|href)=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/g)) {
    const raw = (match[1] || match[2] || match[3]).replaceAll("&amp;", "&");
    if (/^(?:[a-z]+:|\/\/|#)/i.test(raw)) continue;
    const url = new URL(
      raw,
      "https://output.test/" + path.relative(root, page).replaceAll(path.sep, "/"),
    );
    let target = path.join(root, decodeURIComponent(url.pathname));
    if (url.pathname.endsWith("/")) target = path.join(target, "index.html");
    try {
      await fs.access(target);
      checked++;
    } catch {
      missing.add(path.relative(root, page) + " -> " + raw);
    }
  }
}
if (missing.size) throw Error([...missing].join("\n"));
console.log(`${pages.length} emitted pages; ${checked} local references passed.`);
