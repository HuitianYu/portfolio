(() => {
  const cache = new Map(),
    pending = new Map();
  async function loadLocal(id) {
    if (window.EMBEDDED?.[id] || !window.EMBEDDED_INDEX?.[id]) return;
    if (!pending.has(id))
      pending.set(
        id,
        new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = window.EMBEDDED_INDEX[id];
          let settled = false;
          const finish = (error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            script.onload = script.onerror = null;
            script.remove();
            if (error) {
              pending.delete(id);
              reject(error);
            } else resolve();
          };
          const timeout = setTimeout(
            () =>
              finish(
                Error(
                  "Crystal data loading timed out. Retry loading or choose another Local example.",
                ),
              ),
            30000,
          );
          script.onload = () =>
            finish(
              window.EMBEDDED?.[id]
                ? null
                : Error(
                    "The bundled crystal example contains no crystal data. Choose another Local example.",
                  ),
            );
          script.onerror = () =>
            finish(
              Error(
                "The bundled crystal example could not be loaded. Retry loading or check that the complete Lab folder is present.",
              ),
            );
          document.head.append(script);
        }),
      );
    await pending.get(id);
  }
  async function decode(blob) {
    if (!globalThis.DecompressionStream)
      throw Error(
        "This browser does not support gzip decompression. Use a current Chrome, Edge or Firefox.",
      );
    if (blob.size > 32 * 1024 * 1024)
      throw Error("Crystal data exceeds the browser size limit. Choose a Local example.");
    const reader = blob.stream().pipeThrough(new DecompressionStream("gzip")).getReader(),
      chunks = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > 128 * 1024 * 1024) {
          await reader.cancel();
          throw Error(
            "Expanded crystal data exceeds the browser size limit. Choose a Local example.",
          );
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    let data;
    try {
      data = JSON.parse(await new Blob(chunks).text());
    } catch (e) {
      throw Error("Crystal data could not be decoded. Retry or choose a Local example.");
    }
    for (const name of ["single", "agglomerate", "broken"]) {
      const mesh = data?.[name];
      if (!mesh) continue;
      if (
        !Array.isArray(mesh.vertices) ||
        !Array.isArray(mesh.faces) ||
        mesh.vertices.length < 4 ||
        mesh.vertices.length > 1000000 ||
        !mesh.faces.length ||
        mesh.faces.length > 2000000 ||
        !Number.isFinite(mesh.volume) ||
        mesh.volume <= 0
      )
        throw Error(
          "Crystal geometry is invalid or exceeds the browser mesh limit. Choose another crystal.",
        );
      if (
        mesh.vertices.some(
          (v) => !Array.isArray(v) || v.length !== 3 || v.some((x) => !Number.isFinite(x)),
        ) ||
        mesh.faces.some(
          (f) =>
            !Array.isArray(f) ||
            f.length !== 3 ||
            f.some((i) => !Number.isInteger(i) || i < 0 || i >= mesh.vertices.length),
        )
      )
        throw Error(
          "Crystal geometry contains invalid coordinates or face indices. Choose another crystal.",
        );
    }
    if (!data?.single) throw Error("Crystal data is missing its single-crystal geometry.");
    return data;
  }
  window.CrystalData = {
    async load(id) {
      await loadLocal(id);
      const key = (window.EMBEDDED?.[id] || window.EMBEDDED_INDEX?.[id] ? "local:" : "cloud:") + id;
      if (cache.has(key)) return cache.get(key);
      let blob;
      if (window.EMBEDDED?.[id]) {
        const bytes = Uint8Array.from(atob(window.EMBEDDED[id]), (c) => c.charCodeAt(0));
        blob = new Blob([bytes]);
      } else {
        const cfg = window.LAB_CONFIG?.data,
          entry = window.ARCHIVE_INDEX?.[id];
        if (!cfg?.remoteEnabled || !cfg.recordURL || !entry)
          throw Error("This crystal is unavailable. Choose a Local example from Crystal library.");
        if (
          !Number.isSafeInteger(entry.start) ||
          entry.start < 0 ||
          !Number.isSafeInteger(entry.length) ||
          entry.length < 1 ||
          entry.length > 32 * 1024 * 1024
        )
          throw Error(
            "The dataset entry exceeds the browser download limit. Choose a Local example.",
          );
        const url =
          (cfg.fileBaseURL ||
            cfg.recordURL.replace("/records/", "/api/records/").replace(/\/$/, "") + "/files/") +
          encodeURIComponent(entry.archive) +
          "/content";
        let response;
        try {
          response = await fetch(url, {
            headers: { Range: `bytes=${entry.start}-${entry.start + entry.length - 1}` },
            signal: AbortSignal.timeout(45000),
          });
        } catch (e) {
          throw Error(
            "Zenodo data could not be loaded (network, timeout or browser access restriction). Retry, or choose a Local example.",
          );
        }
        if (response.status !== 206) {
          response.body?.cancel();
          throw Error(
            "Zenodo did not return a partial data response. Choose a Local example; the full ZIP will not be downloaded automatically.",
          );
        }
        const reader = response.body.getReader(),
          chunks = [];
        let received = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            received += value.byteLength;
            if (received > entry.length) {
              await reader.cancel();
              throw Error("The server returned more data than requested. Choose a Local example.");
            }
            chunks.push(value);
          }
        } finally {
          reader.releaseLock();
        }
        blob = new Blob(chunks);
        if (blob.size !== entry.length)
          throw Error("The downloaded crystal data is incomplete. Please retry.");
      }
      const data = await decode(blob);
      cache.set(key, data);
      while (cache.size > 2) cache.delete(cache.keys().next().value);
      return data;
    },
  };
})();
