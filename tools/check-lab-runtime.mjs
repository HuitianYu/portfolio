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
    removeAttribute(name) {
      delete this.attributes[name];
    }
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
  const sectionButtons = ["overview", "parameters", "results"].map((key) => {
    const button = new Element();
    button.dataset.section = key;
    return button;
  });
  const sectionPanels = sectionButtons.map(() => new Element());
  sectionPanels.forEach((panel, index) => {
    panel.id = "wrapper-" + index;
  });
  const innerForm = new Element();
  innerForm.id = "parameters";
  context.document.body = { dataset: {} };
  context.document.querySelectorAll = () => sectionButtons;
  context.document.querySelector = (selector) => {
    const key = selector.match(/data-section-panel="([^"]+)"/)[1];
    return sectionPanels[sectionButtons.findIndex((button) => button.dataset.section === key)];
  };
  context.document.getElementById = () => innerForm;
  assert.equal(LabWorkspace.selectSection("parameters"), true);
  assert.equal(sectionPanels[1].hidden, false);
  assert.equal(sectionPanels[0].hidden, true);
  assert.equal(innerForm.hidden, false, "The parameter form is content, not the panel wrapper");
  assert.equal(sectionButtons[1].attributes["aria-controls"], "wrapper-1");
  assert.equal(LabWorkspace.selectSection("missing"), false);
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
  const progressTrack = new Element();
  const progressMessage = new Element();
  const progressDetail = new Element();
  const progressFill = { style: {} };
  const progressRoot = {
    dataset: {},
    querySelector(selector) {
      return {
        "[data-progress-message]": progressMessage,
        "[data-progress-detail]": progressDetail,
        '[role="progressbar"]': progressTrack,
        "[data-progress-fill]": progressFill,
      }[selector];
    },
  };
  LabUI.progress(progressRoot, {
    state: "paused",
    value: 25,
    message: "Paused",
    detail: "25 / 100 steps",
  });
  assert.equal(progressRoot.dataset.state, "paused");
  assert.equal(progressFill.style.width, "25%");
  assert.equal(progressTrack.attributes["aria-valuetext"], "25 / 100 steps");
  assert.equal(progressMessage.textContent, "Paused");
  LabUI.progress(progressRoot, { state: "complete", value: 150 });
  assert.equal(progressTrack.attributes["aria-valuenow"], "100");
  assert.equal(progressDetail.textContent, "100%");
  let clock = 1000;
  context.performance = { timeOrigin: 0, now: () => clock };
  function light() {
    const properties = {};
    return {
      dataset: { state: "inactive" },
      properties,
      style: {
        setProperty: (name, value) => (properties[name] = value),
        removeProperty: (name) => delete properties[name],
      },
    };
  }
  const controller = light(),
    sensor = light();
  const lights = { querySelectorAll: () => [controller, sensor] };
  controller.dataset.state = "active";
  LabUI.syncStatusLights(lights);
  assert.equal(controller.properties["--lab-light-phase"], "-1000ms");
  clock = 1300;
  sensor.dataset.state = "active";
  LabUI.syncStatusLights(lights);
  assert.equal(controller.properties["--lab-light-phase"], "-1000ms");
  assert.equal(sensor.properties["--lab-light-phase"], "-1300ms");
  assert.equal(
    300 - parseFloat(controller.properties["--lab-light-phase"]),
    -parseFloat(sensor.properties["--lab-light-phase"]),
  );
  for (const state of ["paused", "inactive"]) {
    controller.dataset.state = sensor.dataset.state = state;
    LabUI.syncStatusLights(lights);
    assert.equal(controller.properties["--lab-light-phase"], undefined);
    assert.equal(sensor.properties["--lab-light-phase"], undefined);
  }
  LabUI.task({ root: progressRoot, kind: "download", state: "running", message: "Loading" });
  LabUI.task({
    root: progressRoot,
    kind: "playback",
    state: "paused",
    value: 40,
    message: "Paused",
    detail: "Frame 040 / 100",
  });
  assert.equal(LabUI.taskState(progressRoot, "download").state, "running");
  assert.equal(LabUI.taskState(progressRoot, "playback").value, 40);
  LabUI.task({
    root: progressRoot,
    kind: "download",
    state: "complete",
    value: 100,
    message: "Buffered",
    present: false,
  });
  assert.equal(
    progressRoot.dataset.kind,
    "playback",
    "Background download must not replace playback UI",
  );
  assert.equal(progressMessage.textContent, "Paused");
  assert.equal(progressDetail.textContent, "Frame 040 / 100");
  assert.equal(LabUI.taskState(progressRoot, "download").state, "complete");
  // Presenting task progress never invents a Play/Pause/Cancel command.
  for (const kind of ["download", "calculation", "playback"]) {
    const button = new Element();
    const properties = {};
    button.style = { setProperty: (key, value) => (properties[key] = value) };
    button.textContent = kind === "calculation" ? "Calculate" : "Play";
    const label = button.textContent;
    for (const [state, value] of [
      ["ready", 0],
      ["running", 35],
      ["paused", 35],
      ["complete", 100],
      ["ready", 0],
    ]) {
      LabUI.task({ button, kind, state, value, message: state });
      assert.equal(
        button.textContent,
        label,
        "Progress presentation must not change command intent",
      );
      assert.equal(button.dataset.state, state);
      assert.equal(properties["--run-progress"], value + "%");
      assert.equal(
        button.attributes["aria-busy"],
        String(kind !== "playback" && state === "running"),
      );
    }
  }

  const interfaceSource = await fs.readFile(new URL("static/js/lab-interface.js", root), "utf8");
  assert.ok(!interfaceSource.includes('addEventListener("wheel"'));
  assert.ok(!interfaceSource.includes('type: "lab:scroll"'));
  let contentHeight = 1200,
    frameTop = 132;
  const controls = { offsetHeight: 100, style: {} };
  const body = {
    dataset: { section: "overview" },
    getBoundingClientRect: () => ({ height: contentHeight }),
    querySelector: () => controls,
  };
  const frame = {
    style: {},
    contentDocument: { body, readyState: "complete" },
    addEventListener() {},
    getBoundingClientRect: () => ({ top: frameTop }),
  };
  const header = { getBoundingClientRect: () => ({ bottom: 80 }), addEventListener() {} };
  const listeners = {};
  const sizing = {
    document: { querySelector: (selector) => (selector === "#lab-frame" ? frame : header) },
    window: { UIControls: { frameTask: (callback) => ({ schedule: callback }) } },
    MutationObserver: class {
      constructor() {}
      observe() {}
      disconnect() {}
    },
    ResizeObserver: class {
      constructor() {}
      observe() {}
      disconnect() {}
    },
    addEventListener: (event, callback) => (listeners[event] = callback),
  };
  vm.runInNewContext(await fs.readFile(new URL("static/js/lab-host.js", root), "utf8"), sizing);
  assert.equal(frame.style.height, "1200px");
  contentHeight = 420;
  listeners.resize();
  assert.equal(frame.style.height, "420px", "Shorter tabs shrink natural content height");
  frameTop = -100;
  listeners.scroll();
  assert.equal(
    controls.style.transform,
    "translateY(180px)",
    "Lab controls pin below the shared site header",
  );
  frameTop = -1000;
  listeners.scroll();
  assert.equal(
    controls.style.transform,
    "translateY(320px)",
    "Pinned controls stop at the Lab boundary before the footer",
  );
}
