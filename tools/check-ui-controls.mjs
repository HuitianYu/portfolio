import fs from "node:fs/promises";
import vm from "node:vm";
import assert from "node:assert/strict";

export async function checkUIControls(root) {
  const frames = new Map();
  const timers = new Map();
  let serial = 0,
    now = 0;
  class Target {
    listeners = new Map();
    attributes = new Map();
    children = [];
    hovering = false;
    addEventListener(name, fn) {
      this.listeners.set(name, [...(this.listeners.get(name) || []), fn]);
    }
    emit(name, props = {}) {
      const e = { detail: 1, preventDefault() {}, ...props };
      for (const fn of this.listeners.get(name) || []) fn(e);
    }
    contains(node) {
      return node === this || this.children.includes(node);
    }
    matches() {
      return this.hovering;
    }
    setAttribute(k, v) {
      this.attributes.set(k, v);
    }
    focus() {
      this.focused = true;
      this.owner.emit("focusin");
    }
  }
  const document = new Target(),
    owner = new Target(),
    trigger = new Target(),
    outside = new Target();
  owner.ownerDocument = document;
  owner.children.push(trigger);
  trigger.owner = owner;
  const context = {
    window: {},
    matchMedia: () => ({ matches: true }),
    performance: { now: () => now },
    setTimeout(fn) {
      timers.set(++serial, fn);
      return serial;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    requestAnimationFrame(fn) {
      frames.set(++serial, fn);
      return serial;
    },
    cancelAnimationFrame(id) {
      frames.delete(id);
    },
  };
  vm.runInNewContext(await fs.readFile(new URL("static/js/ui-controls.js", root), "utf8"), context);
  // Resize, observer and font events share one update; canceled work cannot run later.
  let layoutUpdates = 0;
  const layout = context.window.UIControls.frameTask(() => layoutUpdates++);
  for (let i = 0; i < 30; i++) layout.schedule();
  assert.equal(frames.size, 1);
  const flushFrames = () => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((fn) => fn());
  };
  flushFrames();
  assert.equal(layoutUpdates, 1);
  layout.schedule();
  layout.cancel();
  flushFrames();
  assert.equal(layoutUpdates, 1);
  layout.schedule();
  flushFrames();
  assert.equal(layoutUpdates, 2);
  let open = false;
  const control = context.window.UIControls.disclosure({
    owner,
    trigger,
    readOpen: () => open,
    writeOpen: (v) => {
      open = v;
    },
    mouseClick: false,
    focusOpen: true,
  });
  const flush = () => {
    const pending = [...timers.values()];
    timers.clear();
    pending.forEach((fn) => fn());
  };
  // Leaving/outside click cancels a pending hover instead of reopening later.
  owner.emit("pointerenter", { pointerType: "mouse" });
  document.emit("pointerdown", { target: outside });
  flush();
  assert.equal(open, false);
  // Touch activation works on hybrid hardware even when mouse hover is supported.
  owner.emit("pointerdown", { pointerType: "touch" });
  trigger.emit("click", { pointerType: "touch" });
  assert.equal(open, true);
  control.close();
  now = 100;
  owner.emit("pointerenter", { pointerType: "mouse" });
  flush();
  assert.equal(open, false);
  // Keyboard activation and Escape restore the trigger without reopening on focus.
  trigger.emit("click", { detail: 0 });
  assert.equal(open, true);
  owner.emit("keydown", { key: "Escape" });
  assert.equal(open, false);
  assert.equal(trigger.focused, true);
  now = 2000;
  owner.emit("pointerenter", { pointerType: "mouse" });
  flush();
  assert.equal(open, true);
  owner.emit("pointerleave", { pointerType: "mouse" });
  flush();
  assert.equal(open, false);
  owner.emit("focusin");
  owner.emit("focusout", { relatedTarget: outside });
  assert.equal(open, false);
  assert.equal(trigger.attributes.get("aria-expanded"), "false");
  // Navigation skips disabled choices, wraps, and focuses a replacement after rebuilding.
  const navigation = new Target();
  navigation.ownerDocument = document;
  const choice = () => ({
    disabled: false,
    isConnected: true,
    focus() {
      document.activeElement = this;
    },
  });
  let choices = [choice(), choice(), choice()];
  choices[1].disabled = true;
  document.activeElement = choices[0];
  const activated = [];
  context.window.UIControls.roving({
    owner: navigation,
    items: () => choices,
    activate: (item) => activated.push(item),
  });
  navigation.emit("keydown", { key: "ArrowRight" });
  assert.equal(document.activeElement, choices[2]);
  navigation.emit("keydown", { key: "ArrowRight" });
  assert.equal(document.activeElement, choices[0]);
  navigation.emit("keydown", { key: "End" });
  assert.equal(document.activeElement, choices[2]);
  navigation.emit("keydown", { key: "Home" });
  assert.equal(document.activeElement, choices[0]);
  navigation.listeners.clear();
  context.window.UIControls.roving({
    owner: navigation,
    items: () => choices,
    activate: () => {
      choices.forEach((item) => {
        item.isConnected = false;
      });
      choices = [choice(), choice()];
    },
  });
  navigation.emit("keydown", { key: "End" });
  assert.equal(document.activeElement, choices[1]);
}
