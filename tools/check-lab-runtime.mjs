import fs from "node:fs/promises";
import vm from "node:vm";
import assert from "node:assert/strict";

export async function checkLabRuntime(root) {
  class Element {
    dataset = {};
    attributes = {};
    classes = new Set();
    listeners = {};
    hidden = false;
    classList = {
      add: (name) => this.classes.add(name),
      contains: (name) => this.classes.has(name),
      toggle: (name, active) => (active ? this.classes.add(name) : this.classes.delete(name)),
    };
    setAttribute(name, value) {
      this.attributes[name] = value;
    }
    addEventListener(name, handler) {
      this.listeners[name] = handler;
    }
    click() {
      this.listeners.click?.();
    }
  }
  const context = { window: {}, document: {} };
  vm.runInNewContext(await fs.readFile(new URL("static/js/lab-runtime.js", root), "utf8"), context);
  vm.runInNewContext(await fs.readFile(new URL("static/js/lab-math.js", root), "utf8"), context);
  const { LabWorkspace, LabUI } = context.window;
  const { LabMath } = context.window;
  assert.equal(LabMath.plain(String.raw`\kappa_{1} \cdot d_{\mathrm e}`), "κ_1 · d_e");
  const textNode = {
    nodeValue: String.raw`Value $\gamma_1$ and \(N_{\mathrm v}\)`,
    parentElement: { closest: () => null },
  };
  context.NodeFilter = { SHOW_TEXT: 4 };
  context.document.createTreeWalker = () => {
    let read = false;
    return { currentNode: textNode, nextNode: () => !read && (read = true) };
  };
  await LabMath.typeset([{}]);
  assert.equal(textNode.nodeValue, "Value γ_1 and N_v");
  const scientific = [1, 2, 3];
  await LabMath.plot(
    (element, data, layout, config) => {
      assert.equal(data[0].name, "γ_1");
      assert.equal(data[0].x, scientific);
      assert.equal(layout.yaxis.title.text, "N_v");
      assert.equal(config.typesetMath, false);
    },
    {},
    [{ name: String.raw`$\gamma_1$`, x: scientific }],
    { yaxis: { title: { text: String.raw`$N_{\mathrm v}$` } } },
    {},
  );
  context.setTimeout = setTimeout;
  context.clearTimeout = clearTimeout;
  await assert.rejects(LabMath.bounded(new Promise(() => {}), 5), /timed out/);

  const removedButtons = ["lasso2d", "sendDataToCloud"];
  const chartOptions = { format: "svg", width: 1100 };
  const chartConfig = context.window.LabCharts.config({
    modeBarButtonsToRemove: removedButtons,
    toImageButtonOptions: chartOptions,
  });
  assert.equal(
    chartConfig.modeBarButtonsToRemove.filter((name) => name === "sendDataToCloud").length,
    1,
  );
  assert.ok(chartConfig.modeBarButtonsToRemove.includes("sendChartToCloud"));
  assert.deepEqual(
    removedButtons,
    ["lasso2d", "sendDataToCloud"],
    "Chart defaults must not mutate a caller's options",
  );
  assert.equal(chartConfig.toImageButtonOptions, chartOptions);
  const makeGroup = (values, buttonKey, panelKey) => {
    const container = new Element();
    const buttons = values.map((value) => {
      const item = new Element();
      item.dataset[buttonKey] = value;
      return item;
    });
    const panels = values.map((value) => {
      const item = new Element();
      item.dataset[panelKey] = value;
      return item;
    });
    buttons[0].classList.add("active");
    container.querySelectorAll = () => buttons;
    const control = LabWorkspace.connectPanels({
      container,
      buttonKey,
      panelKey,
      scope: { querySelectorAll: () => panels },
    });
    return { container, buttons, panels, control };
  };
  const parent = makeGroup(["smoothing", "display"], "page", "panel");
  const child = makeGroup(["mesh", "curvature"], "topic", "topicPanel");
  child.buttons[1].click();
  parent.buttons[1].click();
  parent.buttons[0].click();
  assert.equal(child.panels[0].hidden, true, "Parent changes must preserve the child choice");
  assert.equal(child.panels[1].hidden, false);
  assert.equal(child.buttons[1].attributes["aria-controls"], child.panels[1].id);
  assert.equal(child.panels[1].attributes["aria-labelledby"], child.buttons[1].id);
  parent.buttons[1].disabled = true;
  assert.equal(parent.control.select(parent.buttons[1]), false);
  assert.equal(parent.panels[0].hidden, false);
  const playback = new Element();
  LabUI.playback(playback, { active: false });
  assert.equal(playback.textContent, "Play");
  assert.equal(playback.dataset.playbackState, "paused");
  LabUI.playback(playback, { active: true });
  assert.equal(playback.textContent, "Pause");
  assert.equal(playback.attributes["aria-pressed"], "true");
  LabUI.playback(playback, { active: false, label: "Resume", disabled: true });
  assert.equal(playback.textContent, "Resume");
  assert.equal(playback.disabled, true);
}
