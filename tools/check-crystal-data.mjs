import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { randomBytes } from "node:crypto";
const source = readFileSync(
  new URL("../content/labs/curvature/ui/data-loader.js", import.meta.url),
  "utf8",
);
const mesh = {
  vertices: [
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
  faces: [[0, 1, 2]],
  volume: 1,
};
const bytes = gzipSync(
  JSON.stringify({ single: mesh, padding: randomBytes(2400000).toString("base64") }),
);
function setup(fetch) {
  const window = {
    LAB_CONFIG: { data: { remoteEnabled: true, recordURL: "https://example.test/records/1" } },
    ARCHIVE_INDEX: { test: { archive: "sample.zip", start: 123, length: bytes.length } },
  };
  vm.runInNewContext(source, {
    window,
    fetch,
    Blob,
    Uint8Array,
    DecompressionStream,
    AbortSignal,
    AbortController,
    atob,
    setTimeout,
    clearTimeout,
  });
  return window.CrystalData;
}
const ranges = [];
let failed = false;
const loader = setup(async (_, options) => {
  const range = options.headers.Range;
  ranges.push(range);
  const [start, end] = range.slice(6).split("-").map(Number);
  if (start > 123 && !failed) {
    failed = true;
    throw new TypeError("Network interrupted");
  }
  return new Response(bytes.subarray(start - 123, end - 122), {
    status: 206,
    headers: { "Content-Range": `bytes ${start}-${end}/9999999` },
  });
});
const progress = [];
assert.equal((await loader.load("test", (v) => progress.push(v))).single.volume, 1);
assert.equal(progress.at(-1), 1);
assert.equal(ranges.length, 3);
assert.equal(ranges[1], ranges[2]);
await loader.load("test");
assert.equal(ranges.length, 3);
let fullAttempts = 0;
await assert.rejects(
  setup(async () => {
    fullAttempts++;
    return new Response("archive", { status: 200 });
  }).load("test"),
  /partial download/,
);
assert.equal(fullAttempts, 2);
await assert.rejects(
  setup(async () => new Response(bytes.subarray(0, 10), { status: 206 })).load("test"),
  /incomplete/,
);
console.log(
  "Cloud ranges, interrupted-part retry, decoded cache, progress, full-archive rejection and incomplete response passed.",
);
