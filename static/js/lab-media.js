/** Shared media transport. Data loading and Lab models remain independent. */
(() => {
  function create({
    getVideos,
    getDuration,
    onTime = () => {},
    onState = () => {},
    onError = () => {},
  }) {
    let wantsPlay = false;
    let time = 0,
      playing = false,
      timer = null,
      revision = 0;
    const stopClock = () => {
      clearInterval(timer);
      timer = null;
    };
    function pause() {
      revision++;
      wantsPlay = false;
      stopClock();
      playing = false;
      getVideos().forEach((video) => video.pause());
      onState(false);
    }
    function seek(value) {
      if (!Number.isFinite(value)) return;
      time = Math.max(0, Math.min(value, Math.max(0, getDuration() - 0.01)));
      for (const video of getVideos()) {
        if (video.readyState < 1) continue;
        const target = Math.min(time, Math.max(0, video.duration - 0.01));
        if (Math.abs(video.currentTime - target) > 0.015) video.currentTime = target;
      }
      onTime(time);
    }
    function tick() {
      const active = getVideos();
      if (!playing || !active.length) return;
      if (active.some((video) => video.seeking || video.readyState < 3)) {
        onTime(time);
        return;
      }
      time = active[0].currentTime;
      for (const video of active.slice(1)) {
        if (Math.abs(video.currentTime - time) > 0.12) video.currentTime = time;
      }
      onTime(time);
      if (active[0].ended || time >= getDuration() - 0.04) {
        pause();
      }
    }
    async function play() {
      const active = [...getVideos()];
      if (!active.length) return false;
      if (time >= getDuration() - 0.1) seek(0);
      wantsPlay = true;
      const token = ++revision;
      const results = await Promise.allSettled(active.map((video) => video.play()));
      if (token !== revision) {
        if (!wantsPlay) active.forEach((video) => video.pause());
        return false;
      }
      if (results.some((result) => result.status === "rejected")) {
        pause();
        onError("Playback could not start. Try again when recordings are ready.");
        return false;
      }
      playing = true;
      stopClock();
      timer = setInterval(tick, 80);
      onState(true);
      return true;
    }
    return Object.freeze({
      get time() {
        return time;
      },
      get state() {
        if (playing)
          return getVideos().some((video) => video.seeking || video.readyState < 3)
            ? "buffering"
            : "running";
        if (time >= getDuration() - 0.04) return "complete";
        return time > 0 ? "paused" : "ready";
      },
      get playing() {
        return playing;
      },
      play,
      pause,
      seek,
    });
  }
  function availability(videos) {
    const fullyBuffered =
      videos.length > 0 &&
      videos.every((video) => {
        if (!Number.isFinite(video.duration) || !video.buffered?.length) return false;
        let covered = 0;
        for (let i = 0; i < video.buffered.length; i++) {
          if (video.buffered.start(i) > covered + 0.05) return false;
          covered = Math.max(covered, video.buffered.end(i));
        }
        return covered >= video.duration - 0.05;
      });
    return {
      playable: videos.length > 0 && videos.every((video) => video.readyState >= 3),
      fullyBuffered,
    };
  }
  window.LabMedia = Object.freeze({ create, availability });
})();
