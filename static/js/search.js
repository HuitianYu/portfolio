(() => {
  const script = document.currentScript,
    input = document.querySelector("#site-search"),
    results = document.querySelector("#search-results"),
    status = document.querySelector("#search-status");
  let items = null,
    indexFailed = false;
  const normalize = (s) =>
    String(s || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/ß/g, "ss")
      .replace(/[\u2010-\u2015-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  async function search() {
    const q = normalize(input.value.trim());
    results.replaceChildren();
    if (!q) {
      status.textContent = "Search across papers, conferences, labs and pages.";
      return;
    }
    if (!items) {
      status.textContent = indexFailed
        ? "Search index could not be loaded. Please reload the page."
        : "Loading search index…";
      return;
    }
    const words = q.split(/\s+/),
      found = items
        .filter((item) =>
          words.every((w) => normalize(item.title + " " + item.text + " " + item.type).includes(w)),
        )
        .sort(
          (a, b) => Number(normalize(b.title).includes(q)) - Number(normalize(a.title).includes(q)),
        );
    status.textContent = found.length
      ? `${found.length} result${found.length === 1 ? "" : "s"}`
      : "No results. Try a shorter term or another keyword.";
    for (const item of found) {
      const a = document.createElement("a");
      a.href = item.url;
      a.className = "search-result";
      const type = document.createElement("span");
      type.className = "eyebrow";
      type.textContent = item.type;
      const title = document.createElement("h2");
      title.textContent = item.title;
      const text = document.createElement("p");
      text.textContent = (item.summary || item.text).slice(0, 200);
      a.append(type, title, text);
      results.append(a);
    }
  }
  const readQuery = () => {
    input.value = new URL(location.href).searchParams.get("q") || "";
    search();
  };
  input.addEventListener("input", () => {
    const url = new URL(location.href);
    const query = input.value.trim();
    if (query) url.searchParams.set("q", query);
    else url.searchParams.delete("q");
    history.replaceState(null, "", url);
    search();
  });
  window.addEventListener("popstate", readQuery);
  readQuery();
  fetch(script.dataset.index, { cache: "no-cache", signal: AbortSignal.timeout(15000) })
    .then((r) => {
      if (!r.ok) throw Error();
      return r.json();
    })
    .then((data) => {
      items = data;
      search();
    })
    .catch(() => {
      indexFailed = true;
      search();
    });
})();
