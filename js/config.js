"use strict";

/* ============================================================
 * 站点配置加载（posts/config.txt）
 * 暴露 window.SITE_CONFIG = { created, spring, friends:[{name,url,desc,img}] }
 * 加载完成后派发 "config-loaded" 事件（siteclock.js 监听）
 * ============================================================ */

(function () {
  var DEF = {
    created: new Date("2023-07-30T15:06:26").getTime(),
    spring: new Date("2026-02-17T00:00:00").getTime(),
    friends: []
  };

  window.SITE_CONFIG = { ready: false, created: DEF.created, spring: DEF.spring, friends: [] };

  function parse(text) {
    var cfg = { created: DEF.created, spring: DEF.spring, friends: [] };
    var lines = text.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line || line.charAt(0) === "#") continue;
      var eq = line.indexOf("=");
      if (eq < 1) continue;
      var key = line.slice(0, eq).trim().toLowerCase();
      var val = line.slice(eq + 1).trim();
      if (!val) continue;
      if (key === "created" || key === "spring") {
        /* 统一成 "YYYY/MM/DD HH:mm:ss"：这种写法各浏览器都认；
           注意别把空格换成 T，那样会拼出 "YYYY/MM/DDTHH:mm:ss" 这种谁都解析不了的格式 */
        var t = Date.parse(val.replace(/-/g, "/"));
        if (!isNaN(t)) cfg[key] = t;
      } else if (key === "friend") {
        var parts = val.split("|");
        cfg.friends.push({
          name: (parts[0] || "").trim(),
          url: (parts[1] || "").trim(),
          desc: (parts[2] || "").trim(),
          img: (parts[3] || "").trim()
        });
      }
    }
    return cfg;
  }

  function apply(cfg) {
    window.SITE_CONFIG.created = cfg.created;
    window.SITE_CONFIG.spring = cfg.spring;
    window.SITE_CONFIG.friends = cfg.friends.filter(function (f) { return f.name && f.url; });
    window.SITE_CONFIG.ready = true;
    document.dispatchEvent(new Event("config-loaded"));
  }

  fetch("posts/config.txt")
    .then(function (r) { return r.text(); })
    .then(function (text) { apply(parse(text)); })
    .catch(function () { apply(DEF); });
})();