import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as prettier from "prettier";
import goTemplate from "prettier-plugin-go-template";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");
const options = JSON.parse(await fs.readFile(path.join(root, ".prettierrc.json"), "utf8"));
const files = [];
async function collect(relative, recursive = true) {
  for (const entry of await fs.readdir(path.join(root, relative), { withFileTypes: true })) {
    const file = path.join(relative, entry.name);
    if (entry.isDirectory() && recursive) await collect(file);
    else if (entry.isFile()) files.push(file);
  }
}
for (const directory of ["layouts", "static/js", "static/css", "tools"]) await collect(directory);
for (const lab of await fs.readdir(path.join(root, "content/labs"), { withFileTypes: true })) {
  if (lab.isDirectory()) await collect(`content/labs/${lab.name}/ui`, false);
}
let changed = 0;
for (const relative of files) {
  const name = path.basename(relative);
  if (["catalog.js", "archive-index.js"].includes(name)) continue;
  const parser = relative.startsWith("layouts")
    ? "go-template"
    : /\.m?js$/.test(name)
      ? "babel"
      : name.endsWith(".css")
        ? "css"
        : name === "workspace.txt"
          ? "html"
          : null;
  if (!parser) continue;
  const file = path.join(root, relative);
  const source = await fs.readFile(file, "utf8");
  const formatted = await prettier.format(source, { ...options, parser, plugins: [goTemplate] });
  if (source === formatted) continue;
  changed++;
  if (check) console.error(`Needs formatting: ${relative}`);
  else await fs.writeFile(file, formatted);
}
console.log(`${changed} source files ${check ? "need formatting" : "formatted"}.`);
if (check && changed) process.exitCode = 1;
