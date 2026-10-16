import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";
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
function setup(fetch, overrides = {}) {
  const window = {
    LAB_CONFIG: { data: { remoteEnabled: true, recordURL: "https://example.test/records/1" } },
    ARCHIVE_INDEX: { test: { archive: "sample.zip", start: 123, length: bytes.length } },
    ...overrides.window,
  };
  const context = {
    window,
    fetch,
    Blob,
    Uint8Array,
    DecompressionStream,
    // Simulate an older runtime without AbortSignal.any/timeout.
    AbortSignal: {},
    AbortController,
    atob,
    setTimeout,
    clearTimeout,
    ...overrides,
    window,
  };
  vm.runInNewContext(
    readFileSync(new URL("../static/js/lab-data.js", import.meta.url), "utf8"),
    context,
  );
  vm.runInNewContext(source, context);
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
const cancellable = setup(
  (_, options) =>
    new Promise((resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
    }),
);
const cancelled = cancellable.load("test");
const cancellation = assert.rejects(cancelled, { name: "AbortError" });
await Promise.resolve();
cancellable.cancel();
await cancellation;
const deadlines = [],
  cleared = [];
const timeoutLoader = setup(
  (_, options) =>
    new Promise((resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
    }),
  {
    setTimeout(callback) {
      deadlines.push(callback);
      return deadlines.length;
    },
    clearTimeout(timer) {
      cleared.push(timer);
    },
  },
);
const timedOut = assert.rejects(timeoutLoader.load("test"), /Zenodo timed out/);
await new Promise((resolve) => setImmediate(resolve));
deadlines[0]();
await new Promise((resolve) => setImmediate(resolve));
deadlines[1]();
await timedOut;
assert.deepEqual(cleared, [1, 2]);
console.log(
  "Cloud ranges, interrupted-part retry, decoded cache, progress, full-archive rejection and incomplete response passed.",
);

const localFile = new URL(
  "../content/labs/curvature/ui/demo-data/300_350__crystal_307_0p43761.js",
  import.meta.url,
);
const script = readFileSync(localFile, "utf8");
const localID = "300_350__crystal_307_0p43761";
const localSignals = [];
let cloudRequests = 0;
const localFailure = setup(
  async (_, options) => {
    if (!options.headers) return new Response("missing", { status: 404 });
    cloudRequests++;
    const [start, end] = options.headers.Range.slice(6).split("-").map(Number);
    return new Response(bytes.subarray(start - 123, end - 122), { status: 206 });
  },
  { window: { EMBEDDED_INDEX: { test: "missing.js" } } },
);
assert.equal(
  (await localFailure.load("test", undefined, (source) => localSignals.push(source))).single.volume,
  1,
);
assert.deepEqual(localSignals, ["local", "cloud"]);
assert.ok(cloudRequests > 0);
const cachedSignals = [];
await localFailure.load("test", undefined, (source) => cachedSignals.push(source));
assert.deepEqual(cachedSignals, ["cloud"], "Cached fallback keeps the actual source label");
const bundled = setup(async () => new Response(script), {
  window: { EMBEDDED_INDEX: { [localID]: "example.js" } },
});
assert.ok((await bundled.load(localID)).single.vertices.length > 3);
const cancelledLocal = setup(
  (_, options) =>
    new Promise((resolve, reject) =>
      options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true }),
    ),
  { window: { EMBEDDED_INDEX: { test: "example.js" } } },
);
const localAttempt = cancelledLocal.load("test");
const stoppedLocal = assert.rejects(localAttempt, { name: "AbortError" });
await Promise.resolve();
cancelledLocal.cancel();
await stoppedLocal;
const workspace = readFileSync(
  new URL("../content/labs/curvature/ui/workspace.txt", import.meta.url),
  "utf8",
);
for (const [, relative] of workspace.matchAll(/"(demo-data\/[^" ]+\.js)"/g)) {
  const body = readFileSync(
    new URL("../content/labs/curvature/ui/" + relative, import.meta.url),
    "utf8",
  );
  const payload = body.match(/window\.EMBEDDED\["[^"]+"\]="([A-Za-z0-9+/=]+)"/)[1];
  assert.ok(
    JSON.parse(gunzipSync(Buffer.from(payload, "base64"))).single,
    `Missing geometry: ${relative}`,
  );
}
console.log(
  "Bundled crystal files, text loading, Local-to-Cloud fallback and cancellation passed.",
);
