import fs from "node:fs/promises";
import vm from "node:vm";
import assert from "node:assert/strict";
export async function checkLabData(root) {
  const context = { window: {}, AbortController, Blob, fetch, setTimeout, clearTimeout };
  vm.runInNewContext(await fs.readFile(new URL("static/js/lab-data.js", root), "utf8"), context);
  const data = context.window.LabData,
    signal = new AbortController().signal;
  const sources = [];
  const result = await data.load({
    signal,
    local: async () => {
      throw Error("Local unavailable");
    },
    cloud: async () => 42,
    onSource: (source) => sources.push(source),
  });
  assert.equal(result.value, 42);
  assert.equal(result.source, "cloud");
  assert.deepEqual(sources, ["local", "cloud"]);
  let cloudCalls = 0;
  const stopped = new AbortController();
  await assert.rejects(
    data.load({
      signal: stopped.signal,
      local: async () => {
        stopped.abort();
        throw stopped.signal.reason;
      },
      cloud: async () => {
        cloudCalls++;
      },
    }),
    { name: "AbortError" },
  );
  assert.equal(cloudCalls, 0, "Cancellation must not start Cloud fallback");
  await assert.rejects(
    data.load({
      signal,
      local: async () => {
        throw Error("missing");
      },
      cloud: async () => {
        throw Error("private");
      },
    }),
    /Local and Cloud/,
  );
  let attempts = 0;
  context.fetch = async () => {
    if (++attempts === 1) throw TypeError("Interrupted");
    return new Response("local data");
  };
  assert.equal(await (await data.request("/example", { signal })).text(), "local data");
  assert.equal(attempts, 2);
  attempts = 0;
  context.fetch = async () => {
    attempts++;
    return new Response("missing", { status: 404 });
  };
  await assert.rejects(data.request("/missing", { signal }), /website could not provide/);
  assert.equal(attempts, 1);
  context.fetch = async () => new Response("oversized");
  await assert.rejects(data.request("/large", { signal, maxBytes: 3 }), /download limit/);
  const deadlines = [];
  context.setTimeout = (callback) => {
    deadlines.push(callback);
    return deadlines.length;
  };
  context.clearTimeout = () => {};
  context.fetch = (_, options) =>
    new Promise((resolve, reject) =>
      options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true }),
    );
  const stalled = assert.rejects(data.request("/stalled", { signal, attempts: 1 }), /timed out/);
  deadlines[0]();
  await stalled;
  context.fetch = async () => new Response("retry succeeded");
  assert.equal(await (await data.request("/stalled", { signal })).text(), "retry succeeded");
  console.log(
    "Data sources: local retry, explicit Cloud fallback, cancellation and limits passed.",
  );
}
