"use strict";

/* ============================================================
 * 背景音乐播放器（三首曲目，见下方 TRACKS）
 * - 默认不自动播放：进入每个页面时音乐都是关闭的
 * - 用户点击 ▶ 才开始播放（浏览器也允许直接出声）
 * - 记忆上次曲目，播放/暂停/切歌、.lrc 歌词同步
 * ============================================================ */

(function () {
  if (!document.getElementById("music-dock")) return;

  var TRACKS = [
    { file: "music/A%20Rusty%20Dream%20.mp3", title: "A Rusty Dream", artist: "DOUDOU", lyric: "music/A%20Rusty%20Dream.lrc" },
    { file: "music/Die%20on%20the%20Dancefloor.mp3", title: "Die on the Dancefloor", artist: "Chelle Mok", lyric: "music/Die%20on%20the%20Dancefloor.lrc" },
    { file: "music/LIFE.mp3", title: "LIFE", artist: "Neuro-sama", lyric: "music/LIFE.lrc" },
  ];
  var KEY = "yaolin-music";
  var SKEY = "yaolin-music-session";

  var state = { idx: 0, muted: false };
  try {
    var saved = JSON.parse(localStorage.getItem(KEY) || "null");
    if (saved && typeof saved === "object") state = Object.assign(state, saved);
  } catch (e) {}

  /* 跨页面续播：记录播放状态，切页后自动接上（不中断 BGM） */
  var session = null;
  try {
    session = JSON.parse(sessionStorage.getItem(SKEY) || "null");
  } catch (e) {}
  if (session && typeof session === "object" && session.idx !== undefined) {
    if (session.idx >= 0 && session.idx < TRACKS.length) state.idx = session.idx;
  }
  var resumeTime = session && typeof session.time === "number" ? session.time : 0;
  var resumePlaying = !!(session && session.playing);

  var audio = new Audio();
  audio.loop = false;
  audio.preload = "none";
  audio.muted = !!state.muted;

  function saveSession(playing, time) {
    try {
      sessionStorage.setItem(
        SKEY,
        JSON.stringify({
          idx: state.idx,
          time: typeof time === "number" ? time : (audio.currentTime || 0),
          playing: playing !== undefined ? playing : !audio.paused,
        })
      );
    } catch (e) {}
  }

  var dock = document.getElementById("music-dock");
  var playBtn = document.getElementById("music-play");
  var nextBtn = document.getElementById("music-next");
  var titleEl = document.getElementById("music-title");
  var eq = document.getElementById("music-eq");
  var lyricBtn = document.getElementById("music-lyric-btn");
  var lyricPanel = document.getElementById("music-lyrics");
  var lyricTitleEl = document.getElementById("lyric-title");
  var lyricBody = document.getElementById("lyric-body");
  var progBar = document.getElementById("music-progress-bar");
  var sideNow = document.getElementById("side-now-title");

  function progressSync() {
    if (!progBar) return;
    var d = audio.duration;
    progBar.style.width =
      (d && isFinite(d) ? (audio.currentTime / d) * 100 : 0) + "%";
  }

  /* ---------- 歌词引擎（LRC 同步） ---------- */
  var lyricLines = [];
  var lyricCur = -1;

  function parseLrc(text) {
    var tagRe = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
    var lines = [];
    text.split(/\r?\n/).forEach(function (raw) {
      var tags = [];
      var m;
      tagRe.lastIndex = 0;
      while ((m = tagRe.exec(raw)) !== null) {
        tags.push(
          parseFloat(m[1]) * 60 +
            parseFloat(m[2]) +
            parseFloat((m[3] || "0").slice(0, 3).padEnd(3, "0")) / 1000
        );
      }
      if (!tags.length) return;
      var txt = raw.replace(tagRe, "").trim();
      tags.forEach(function (t) { lines.push({ t: t, text: txt }); });
    });
    lines.sort(function (a, b) { return a.t - b.t; });
    return lines;
  }

  function setLyricDom() {
    if (!lyricBody) return;
    lyricBody.innerHTML = "";
    lyricCur = -1;
    var d = document.createElement("div");
    d.className = "lrc-line active";
    d.textContent = lyricLines.length ? "♪" : "（暂无歌词）";
    lyricBody.appendChild(d);
  }

  function loadLyric(idx) {
    var t = TRACKS[idx];
    if (lyricTitleEl) lyricTitleEl.textContent = t.title;
    lyricLines = [];
    setLyricDom();
    if (!t.lyric || !lyricBody) return;
    fetch(t.lyric)
      .then(function (r) {
        if (!r.ok) throw new Error("no lyric");
        return r.text();
      })
      .then(function (txt) {
        lyricLines = parseLrc(txt);
        setLyricDom();
      })
      .catch(function () {
        lyricLines = [];
        setLyricDom();
      });
  }

  function syncLyric() {
    if (!lyricLines.length || !lyricPanel || lyricPanel.hidden || !lyricBody) return;
    var t = audio.currentTime;
    var idx = -1;
    for (var i = 0; i < lyricLines.length; i++) {
      if (lyricLines[i].t <= t) idx = i;
      else break;
    }
    if (idx === lyricCur) return;
    lyricCur = idx;
    var el = lyricBody.firstElementChild;
    if (!el) return;
    el.textContent = idx >= 0 && lyricLines[idx].text ? lyricLines[idx].text : "♪";
    /* 重新触发换行动画 */
    el.classList.remove("active");
    void el.offsetWidth;
    el.classList.add("active");
  }

  function toggleLyric() {
    if (!lyricPanel) return;
    var open = lyricPanel.hidden;
    lyricPanel.hidden = !open;
    if (dock) dock.classList.toggle("lyric-open", open);
    if (open) syncLyric();
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ idx: state.idx, muted: audio.muted }));
    } catch (e) {}
  }

  function update() {
    var t = TRACKS[state.idx];
    titleEl.textContent = t.artist ? t.title + " · " + t.artist : t.title;
    if (sideNow) {
      sideNow.textContent = audio.paused
        ? "♪ 还没有播放～"
        : t.artist
          ? "♪ " + t.title + " · " + t.artist
          : "♪ " + t.title;
    }
    eq.classList.toggle("playing", !audio.paused && !audio.muted);
    dock.classList.toggle("playing", !audio.paused && !audio.muted);
    dock.classList.toggle("muted", audio.muted);
  }

  function play() {
    if (!audio.src) audio.src = TRACKS[state.idx].file;
    var p = audio.play();
    if (p && p.catch) p.catch(function () {});
    /* 播放时自动弹出歌词面板 */
    if (lyricPanel) {
      lyricPanel.hidden = false;
      if (dock) dock.classList.add("lyric-open");
      syncLyric();
    }
  }

  function toggle() {
    if (audio.paused) play();
    else audio.pause();
    update();
    save();
  }

  function next() {
    state.idx = (state.idx + 1) % TRACKS.length;
    audio.src = TRACKS[state.idx].file;
    loadLyric(state.idx);
    play();
    update();
    save();
  }

  var lastSave = 0;
  audio.addEventListener("ended", next);
  audio.addEventListener("timeupdate", syncLyric);
  audio.addEventListener("timeupdate", progressSync);
  audio.addEventListener("timeupdate", function () {
    /* 节流：每 3 秒记一次进度，防止突然切页丢位置 */
    if (Date.now() - lastSave > 3000) {
      lastSave = Date.now();
      saveSession();
    }
  });
  audio.addEventListener("play", function () { saveSession(true); });
  audio.addEventListener("pause", function () {
    /* 暂停时收起歌词，只让页面干净地展示内容 */
    if (lyricPanel) lyricPanel.hidden = true;
    if (dock) dock.classList.remove("lyric-open");
    saveSession(false);
  });
  playBtn.addEventListener("click", toggle);
  nextBtn.addEventListener("click", next);
  if (lyricBtn) lyricBtn.addEventListener("click", toggleLyric);

  /* 离开/隐藏页面时存档，切换页面后自动接上 BGM */
  window.addEventListener("pagehide", function () { saveSession(); });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") saveSession();
  });

  /* 默认关闭：不自动播放，等用户点击 */
  update();

  /* 续播：上个页面正在播放时，进入本页自动接上（不掉 BGM） */
  if (resumePlaying) {
    audio.src = TRACKS[state.idx].file;
    audio.load(); /* 强制加载：让 loadedmetadata 必然触发，把续播进度写进元素 */
    audio.addEventListener(
      "loadedmetadata",
      function () {
        try {
          audio.currentTime = Math.min(resumeTime, Math.max(0, audio.duration - 0.5));
        } catch (e) {}
      },
      { once: true }
    );
    /* 先把「暂停 + 续播位置」存档（play 事件触发后会改写为 playing）：
       手机端被自动播放策略拦住时保留进度，点一下就从上次位置继续 */
    saveSession(false, resumeTime);
    play();
    update();
  }

  loadLyric(state.idx);
})();