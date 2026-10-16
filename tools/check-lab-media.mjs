import fs from "node:fs/promises";
import vm from "node:vm";
import assert from "node:assert/strict";
export async function checkLabMedia(root) {
  const recordingApp = new URL("content/labs/stablegsensor/ui/app.js", root);
  try {
    const source = await fs.readFile(recordingApp, "utf8");
    const section = source.slice(
      source.indexOf("function page("),
      source.indexOf("document\n", source.indexOf("function page(")),
    );
    const navigation = {
      loadedOnce: false,
      window: { LabWorkspace: { selectSection: () => true } },
      load() {
        assert.fail("Viewing Display must not start a download");
      },
      pause() {
        assert.fail("Viewing a section must not change playback intent");
      },
    };
    vm.createContext(navigation);
    vm.runInContext(section + '\npage("display"); page("overview"); page("display");', navigation);
    assert.equal(navigation.loadedOnce, false);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  let tick = null;
  const context = {
    window: {},
    AbortController,
    setTimeout,
    clearTimeout,
    setInterval: (callback) => ((tick = callback), 1),
    clearInterval: () => {
      tick = null;
    },
  };
  vm.runInNewContext(await fs.readFile(new URL("static/js/lab-data.js", root), "utf8"), context);
  vm.runInNewContext(await fs.readFile(new URL("static/js/lab-media.js", root), "utf8"), context);
  const videos = [0, 1].map(() => ({
    currentTime: 0,
    duration: 20,
    readyState: 4,
    paused: true,
    seeking: false,
    ended: false,
    play() {
      this.paused = false;
      return Promise.resolve();
    },
    pause() {
      this.paused = true;
    },
  }));
  const states = [];
  let position = 0;
  const transport = context.window.LabMedia.create({
    getVideos: () => videos,
    getDuration: () => 20,
    onTime: (value) => {
      position = value;
    },
    onState: (state) => states.push(state),
  });
  assert.equal(transport.playing, false, "Fresh media must not announce Pause");
  assert.equal(transport.state, "ready");
  transport.seek(0);
  assert.deepEqual(states, [], "Preparing a display must not request playback");
  assert.ok(videos.every((video) => video.paused));
  assert.equal(await transport.play(), true);
  const transitions = states.length;
  transport.seek(12);
  assert.equal(transport.playing, true);
  assert.ok(videos.every((video) => !video.paused && video.currentTime === 12));
  assert.equal(states.length, transitions, "Seeking must not toggle play/pause UI");
  videos[0].seeking = true;
  videos[0].currentTime = 3;
  tick();
  assert.equal(position, 12, "Synchronization must not fight an in-flight seek");
  videos[0].seeking = false;
  transport.pause();
  transport.seek(8);
  assert.ok(videos.every((video) => video.paused && video.currentTime === 8));
  assert.equal(transport.playing, false);
  assert.equal(tick, null);
  transport.seek(100);
  assert.ok(transport.time < 20);
  await transport.play();
  videos[0].currentTime = 20;
  videos[0].ended = true;
  tick();
  assert.equal(transport.state, "complete");
  assert.equal(transport.playing, false);
  assert.equal(transport.time, 20);
  videos[0].ended = false;
  await transport.play();
  assert.equal(transport.time, 0, "Replay starts a fresh playback task");
  transport.pause();
  let resolvePlay;
  videos[0].play = () =>
    new Promise((resolve) => {
      resolvePlay = resolve;
    });
  const pending = transport.play();
  transport.pause();
  resolvePlay();
  assert.equal(await pending, false);
  assert.ok(videos.every((video) => video.paused));
  videos[0].play = () => Promise.reject(Error("not ready"));
  assert.equal(await transport.play(), false);
  assert.equal(transport.playing, false);
  const availability = context.window.LabMedia.availability;
  const bufferedVideo = {
    duration: 20,
    readyState: 4,
    buffered: { length: 1, start: () => 0, end: () => 3 },
  };
  assert.equal(availability([bufferedVideo]).playable, true);
  assert.equal(
    availability([bufferedVideo]).fullyBuffered,
    false,
    "Playable is not fully downloaded",
  );
  bufferedVideo.buffered.end = () => 20;
  assert.equal(availability([bufferedVideo]).fullyBuffered, true);
  bufferedVideo.buffered = { length: 2, start: (i) => (i ? 15 : 0), end: (i) => (i ? 20 : 5) };
  assert.equal(
    availability([bufferedVideo]).fullyBuffered,
    false,
    "Gaps must not count as full buffering",
  );
  console.log(
    "Media transport: playing/paused seek, in-flight seek, stale play cancellation and playback failure passed.",
  );
  class Video extends EventTarget {
    attempts = [];
    set src(url) {
      this.attempts.push(url);
      queueMicrotask(() => this.dispatchEvent(new Event(url === "local" ? "error" : "canplay")));
    }
    pause() {}
    removeAttribute() {}
    load() {}
  }
  const video = new Video(),
    sources = [];
  const loaded = await context.window.LabMedia.loadVideo(video, {
    local: "local",
    cloud: "cloud",
    signal: new AbortController().signal,
    onSource: (source) => sources.push(source),
  });
  assert.equal(loaded.source, "cloud");
  assert.deepEqual(video.attempts, ["local", "local", "cloud"]);
  assert.deepEqual(sources, ["local", "cloud"]);
  class StalledVideo extends EventTarget {
    attempts = [];
    set src(url) {
      this.attempts.push(url);
    }
    pause() {}
    removeAttribute() {}
    load() {}
  }
  const waiting = new StalledVideo(),
    stop = new AbortController();
  const waitingLoad = context.window.LabMedia.loadVideo(waiting, {
    local: "local",
    cloud: "cloud",
    signal: stop.signal,
  });
  const waitingCheck = assert.rejects(waitingLoad, { name: "AbortError" });
  stop.abort();
  await waitingCheck;
  assert.deepEqual(waiting.attempts, ["local"], "Cancelling a video does not start Cloud fallback");
}
