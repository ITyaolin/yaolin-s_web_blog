"use strict";

/* ============================================================
 * 「家」页面：站点存活时间（从 posts/config.txt 的 created 起算）
 *            + 春节倒计时（spring 目标）
 * 「友链」页面：根据 config.txt 的 friend= 行渲染友链卡片
 * ============================================================ */

(function () {
  function two(n) { return (n < 10 ? "0" : "") + n; }

  function render() {
    var UP_Y = document.getElementById("up-y");
    if (!UP_Y) return; // 非「家」页面
    var UP_D = document.getElementById("up-d");
    var UP_H = document.getElementById("up-h");
    var UP_M = document.getElementById("up-m");
    var UP_S = document.getElementById("up-s");
    var SP_D = document.getElementById("sp-d");
    var SP_H = document.getElementById("sp-h");
    var SP_M = document.getElementById("sp-m");
    var SP_S = document.getElementById("sp-s");
    var now = Date.now();
    var up = Math.max(0, now - window.SITE_CONFIG.created);
    /* 近年春节（农历正月初一）真实日期表：
       已过后自动滚到表中下一个真实日期（不再简单地 +365 天近似）；
       config.txt 里手动设置的 spring 若在未来，仍优先使用（可覆盖）。 */
    var CNY_DATES = [
      "2026-02-17", "2027-02-06", "2028-01-26", "2029-02-13", "2030-02-03",
      "2031-01-23", "2032-02-11", "2033-01-31", "2034-02-19", "2035-02-08",
      "2036-01-28", "2037-02-15", "2038-02-04", "2039-01-24", "2040-02-12"
    ].map(function (s) { return new Date(s + "T00:00:00").getTime(); });
    var springTs = window.SITE_CONFIG.spring;
    if (springTs <= now) {
      var next = null;
      for (var i = 0; i < CNY_DATES.length; i++) {
        if (CNY_DATES[i] > now) { next = CNY_DATES[i]; break; }
      }
      if (next) springTs = next;
    }
    var sp = springTs - now;
    var upDays = Math.floor(up / 86400000);
    UP_Y.textContent = Math.floor(upDays / 365);
    UP_D.textContent = upDays % 365;
    UP_H.textContent = two(Math.floor(up / 3600000) % 24);
    UP_M.textContent = two(Math.floor(up / 60000) % 60);
    UP_S.textContent = two(Math.floor(up / 1000) % 60);

    SP_D.textContent = Math.floor(sp / 86400000);
    SP_H.textContent = two(Math.floor(sp / 3600000) % 24);
    SP_M.textContent = two(Math.floor(sp / 60000) % 60);
    SP_S.textContent = two(Math.floor(sp / 1000) % 60);

    /* 「自 YYYY-MM-DD 建站起…」那句里的日期也跟 config 走：
       以后改 posts/config.txt 的 created，这句文案不用再手改 */
    var since = document.getElementById("live-since");
    if (since) {
      var d0 = new Date(window.SITE_CONFIG.created);
      since.textContent = d0.getFullYear() + "-" + two(d0.getMonth() + 1) + "-" + two(d0.getDate());
    }
  }

  function renderFriends() {
    var grid = document.getElementById("friends-grid");
    if (!grid) return;
    var friends = (window.SITE_CONFIG && window.SITE_CONFIG.friends) || [];
    if (!friends.length) {
      grid.innerHTML = '<p class="friends-tip">暂无友链，去 <code>posts/config.txt</code> 里加一条 <code>friend=</code> 吧～</p>';
      return;
    }
    grid.innerHTML = "";
    friends.forEach(function (f) {
      var card = document.createElement("a");
      card.className = "friend-card";
      card.href = f.url;
      card.target = "_blank";
      card.rel = "noopener";
      if (f.img) {
        var img = document.createElement("img");
        img.src = f.img;
        img.alt = f.name;
        img.loading = "lazy";
        card.appendChild(img);
      } else {
        var ab = document.createElement("span");
        ab.className = "friend-ab";
        ab.textContent = f.name.charAt(0);
        card.appendChild(ab);
      }
      var box = document.createElement("span");
      box.className = "friend-box";
      var b = document.createElement("b");
      b.textContent = f.name;
      var desc = document.createElement("p");
      desc.textContent = f.desc || "一起玩耍的小伙伴";
      box.appendChild(b);
      box.appendChild(desc);
      card.appendChild(box);
      grid.appendChild(card);
    });
  }

  function start() {
    render();
    renderFriends();
    setInterval(render, 1000);
  }

  if (window.SITE_CONFIG && window.SITE_CONFIG.ready) start();
  else document.addEventListener("config-loaded", start);
})();