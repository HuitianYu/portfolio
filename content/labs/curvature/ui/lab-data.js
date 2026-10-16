/** Shared data acquisition: cancellation, bounded requests and explicit source fallback. */
(() => {
  function deadline(parent, milliseconds) {
    const controller = new AbortController();
    const cancel = () => controller.abort(parent.reason);
    if (parent.aborted) cancel();
    else parent.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(
      () =>
        controller.abort(Object.assign(Error("Data loading timed out."), { name: "TimeoutError" })),
      milliseconds,
    );
    return {
      signal: controller.signal,
      dispose() {
        clearTimeout(timer);
        parent.removeEventListener("abort", cancel);
      },
    };
  }
  function check(signal) {
    if (signal?.aborted)
      throw signal.reason || Object.assign(Error("Cancelled."), { name: "AbortError" });
  }
  async function load({ local, cloud, signal, onSource = () => {} }) {
    let localError;
    for (const [source, action] of [
      ["local", local],
      ["cloud", cloud],
    ]) {
      if (!action) continue;
      check(signal);
      onSource(source, localError);
      try {
        const value = await action();
        check(signal);
        return { value, source };
      } catch (error) {
        check(signal);
        if (error.name === "AbortError") throw error;
        if (source === "local" && cloud) {
          localError = error;
          continue;
        }
        if (localError)
          throw Object.assign(Error("Local and Cloud data could not be loaded. Please retry."), {
            cause: error,
            localError,
          });
        throw error;
      }
    }
    throw Error("No data source is available.");
  }
  async function request(
    url,
    { signal, timeout = 45000, attempts = 2, maxBytes = 32 * 1024 * 1024 },
  ) {
    for (let attempt = 0; attempt < attempts; attempt++) {
      const task = deadline(signal, timeout);
      try {
        const response = await fetch(url, {
          signal: task.signal,
          cache: attempt ? "reload" : "default",
        });
        if (!response.ok) {
          await response.body?.cancel();
          throw Object.assign(
            Error("The website could not provide this Local example. Please retry."),
            { status: response.status },
          );
        }
        const chunks = [];
        let total = 0;
        const reader = response.body.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > maxBytes) {
              await reader.cancel();
              throw Error("Local example exceeds the download limit.");
            }
            chunks.push(value);
          }
        } finally {
          reader.releaseLock();
        }
        if (!total) throw Error("The Local example response was empty.");
        return new Blob(chunks);
      } catch (error) {
        check(signal);
        if (attempt + 1 === attempts || [403, 404].includes(error.status)) throw error;
      } finally {
        task.dispose();
      }
    }
  }
  window.LabData = Object.freeze({ deadline, load, request });
})();
