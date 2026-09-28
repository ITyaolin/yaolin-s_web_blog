"use strict";

/* ============================================================
 * 家页小功能
 * - 摸鱼指数随机生成
 * - 戳戳乐爱心特效
 * ============================================================ */

(function () {
  /* ---------- 摸鱼指数 ---------- */
  var btn = document.getElementById("fortune-btn");
  var meter = document.getElementById("meter-fill");
  var text = document.getElementById("fortune-text");

  var FORTUNES = [
    { min: 0, max: 20, label: "今天居然在认真干活！" },
    { min: 20, max: 40, label: "摸了一点点鱼，问题不大～" },
    { min: 40, max: 60, label: "一半时间在摸鱼，一半在装忙" },
    { min: 60, max: 80, label: "摸鱼高手！今天收获满满～" },
    { min: 80, max: 95, label: "鱼都被你摸光了！" },
    { min: 95, max: 100, label: "你就是传说中的摸鱼仙人！" },
  ];

  function rollFortune() {
    var val = Math.floor(Math.random() * 101);
    meter.style.width = val + "%";

    var fortune = FORTUNES.find(function (f) {
      return val >= f.min && val < f.max;
    }) || FORTUNES[FORTUNES.length - 1];

    text.textContent = fortune.label + " （" + val + "%）";
  }

  if (btn) {
    btn.addEventListener("click", rollFortune);
    /* 页面加载后自动来一次 */
    setTimeout(rollFortune, 600);
  }

  /* ---------- 戳戳乐 ---------- */
  var zone = document.getElementById("heart-zone");
  var HEARTS = ["V", "W", "U", "R", "X", "M", "Q", "J"];

  function spawnHeart(e) {
    var rect = zone.getBoundingClientRect();
    var x = (e.clientX || e.touches?.[0]?.clientX || rect.width / 2) - rect.left;
    var y = (e.clientY || e.touches?.[0]?.clientY || rect.height / 2) - rect.top;

    var heart = document.createElement("span");
    heart.className = "float-heart";
    heart.textContent = HEARTS[Math.floor(Math.random() * HEARTS.length)];
    heart.style.left = (x - 12) + "px";
    heart.style.top = (y - 12) + "px";
    heart.style.fontSize = (18 + Math.random() * 20) + "px";
    heart.style.color = "var(--accent)";
    zone.appendChild(heart);

    setTimeout(function () { heart.remove(); }, 1200);
  }

  if (zone) {
    zone.addEventListener("click", spawnHeart);
    zone.addEventListener("touchstart", function (e) {
      spawnHeart(e);
    }, { passive: true });
  }
})();