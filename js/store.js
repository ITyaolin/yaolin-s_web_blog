"use strict";

/* ============================================================
 * 本地发布与文章仓库
 * - localStorage：浏览器本机索引（写作台发布 / 兼容层）
 * - posts/ 文件夹：真正的文章仓库（.md 自动检测 + 自动保存）
 *   博客首页会自动检测 posts/ 里的 .md/.txt 并展示；
 *   写作台发布时自动把文章写进该文件夹。
 * ============================================================ */

var PUBLISHED_KEY = "yaolin-published-posts";
var DIR_HANDLE_DB = "yaolin-blog";
var DIR_HANDLE_STORE = "handles";
var DIR_HANDLE_KEY = "post-dir";

/* ---------- localStorage 索引 ---------- */
function getPublishedPosts() {
  try {
    var raw = localStorage.getItem(PUBLISHED_KEY);
    var list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}
function savePublishedPosts(list) {
  localStorage.setItem(PUBLISHED_KEY, JSON.stringify(list));
}
function upsertPublishedPost(post) {
  var list = getPublishedPosts();
  var i = list.findIndex(function (p) { return p.id === post.id; });
  if (i >= 0) list[i] = post;
  else list.unshift(post);
  savePublishedPosts(list);
  return list;
}
function deletePublishedPost(id) {
  var list = getPublishedPosts().filter(function (p) { return p.id !== id; });
  savePublishedPosts(list);
  return list;
}

/* ---------- 文章文件夹句柄（IndexedDB 持久化） ---------- */
function openDirHandleDB() {
  return new Promise(function (resolve, reject) {
    var req = indexedDB.open(DIR_HANDLE_DB, 1);
    req.onupgradeneeded = function () {
      if (!req.result.objectStoreNames.contains(DIR_HANDLE_STORE)) {
        req.result.createObjectStore(DIR_HANDLE_STORE);
      }
    };
    req.onsuccess = function () { resolve(req.result); };
    req.onerror = function () { reject(req.error); };
  });
}
async function getDirHandle() {
  try {
    var db = await openDirHandleDB();
    return await new Promise(function (resolve, reject) {
      var tx = db.transaction(DIR_HANDLE_STORE, "readonly");
      var g = tx.objectStore(DIR_HANDLE_STORE).get(DIR_HANDLE_KEY);
      g.onsuccess = function () { resolve(g.result || null); };
      g.onerror = function () { reject(g.error); };
    });
  } catch (e) {
    return null;
  }
}
async function saveDirHandle(handle) {
  try {
    var db = await openDirHandleDB();
    return await new Promise(function (resolve, reject) {
      var tx = db.transaction(DIR_HANDLE_STORE, "readwrite");
      tx.objectStore(DIR_HANDLE_STORE).put(handle, DIR_HANDLE_KEY);
      tx.oncomplete = function () { resolve(true); };
      tx.onerror = function () { reject(tx.error); };
    });
  } catch (e) {
    return false;
  }
}

/* ---------- Markdown 文件解析 ---------- */
function parseMdFile(name, text) {
  var id = name.replace(/\.(md|txt)$/i, "");
  var front = null;
  var body = text;
  var m = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/);
  if (m) {
    front = {};
    m[1].split(/\r?\n/).forEach(function (line) {
      var kv = line.match(/^([\w\u4e00-\u9fa5]+)\s*:\s*(.*)$/);
      if (kv) {
        var v = kv[2].trim();
        if (/^\[.*\]$/.test(v)) v = v.slice(1, -1).split(",").map(function (s) { return s.trim().replace(/^"|"$/g, ""); }).filter(Boolean);
        else v = v.replace(/^"|"$/g, "");
        front[kv[1]] = v;
      }
    });
    body = text.slice(m[0].length);
  }
  var title = (front && front.title) || (body.match(/^#\s+(.+)$/m) || [])[1] || name.replace(/\.(md|txt)$/i, "");
  var date = (front && front.date) || todayISO();
  var tags = (front && front.tags) || [];
  if (typeof tags === "string") tags = [tags];
  return {
    id: id,
    title: title.trim(),
    date: date,
    tags: tags,
    summary: (front && front.summary) || autoSummary(body, 96),
    content: body.trim(),
    source: "folder",
  };
}

/* 生成带 front matter 的 .md 文本 */
function buildMdFile(post) {
  var tags = (post.tags || []).map(function (t) { return '"' + t + '"'; }).join(", ");
  return (
    "---\n" +
    "title: \"" + post.title + "\"\n" +
    "date: " + post.date + "\n" +
    "tags: [" + tags + "]\n" +
    "summary: \"" + post.summary + "\"\n" +
    "---\n\n" +
    (post.content || "") + "\n"
  );
}

/* 配置文件（友链/站点配置等）不当作文章展示 */
function isConfigFile(name) {
  return name === "config.txt" || name === "config.md";
}

/* ---------- 自动检测 posts/ 文件夹里的文章 ---------- */
async function detectFolderPosts() {
  var out = [];
  var seen = {};

  /* 通道 1：服务器目录列表（python http.server 等支持 autoindex 的服务） */
  try {
    var res = await fetch("posts/", { cache: "no-store" });
    if (res.ok) {
      var html = await res.text();
      var re = /href="([^"#?]+\.(?:md|txt))"/gi;
      var mm;
      var files = [];
      while ((mm = re.exec(html)) !== null) {
        var name = decodeURIComponent(mm[1]).split("/").pop();
        if (isConfigFile(name)) continue;
        if (!seen[name]) { seen[name] = 1; files.push(name); }
      }
      for (var i = 0; i < files.length; i++) {
        var r = await fetch("posts/" + encodeURIComponent(files[i]), { cache: "no-store" });
        if (!r.ok) continue;
        var p = parseMdFile(files[i], await r.text());
        if (p && p.content) out.push(p);
      }
    }
  } catch (e) { /* 文件夹不存在或不可访问 */ }

  /* 通道 2：File System Access 授权的文件夹（可直接读写） */
  var dir = await getDirHandle();
  if (dir) {
    for await (var entry of dir.values()) {
      if (entry.kind !== "file") continue;
      var n = entry.name;
      if (!/\.(md|txt)$/i.test(n)) continue;
      if (isConfigFile(n)) continue;
      if (seen[n]) continue;
      var f = await entry.getFile();
      var p2 = parseMdFile(n, await f.text());
      if (p2 && p2.content) out.push(p2);
    }
  }

  return out;
}

/* 全量文章：内置 + 文件夹 + 本机发布，按日期倒序 */
async function getAllPostsAsync() {
  var map = new Map();
  POSTS.forEach(function (p) { map.set(p.id, p); });
  (await detectFolderPosts()).forEach(function (p) { p.source = "folder"; map.set(p.id, p); });
  getPublishedPosts().forEach(function (p) { p.source = "local"; map.set(p.id, p); });
  return Array.from(map.values()).sort(function (a, b) {
    return new Date(b.date) - new Date(a.date);
  });
}

/* ---------- 封面轮换 ---------- */
var COVERS = [
  "img/hero.jpg",
  "img/hero2.jpg",
  "img/banner-slime.jpg",
  "img/banner-muse.jpg",
  "img/banner-okayu.jpg",
  "img/banner-blue.jpg",
  "img/banner-dark.jpg",
  "img/banner-pink.jpg",
  "img/banner-catpink.jpg",
  "img/banner-white.jpg",
  "img/banner-wide.jpg",
  "img/banner-dress.jpg",
  "img/portrait-lamy.jpg",
  "img/portrait-nao.jpg",
  "img/105126065_p0.jpg",
  "img/106330900_p0.png",
  "img/106330900_p1.png",
  "img/109358771_p0.jpg",
  "img/109680262_p0.png",
  "img/109996357_p0.jpg",
  "img/111032213_p0.png",
  "img/112021041_p0.jpg",
  "img/112023645_p0.png",
  "img/112124459_p0.jpg",
  "img/112390438_p0.jpg",
  "img/113534777_p0.jpg",
  "img/113612055_p0.jpg",
  "img/114566909_p1.jpg",
  "img/114742561_p0.png",
  "img/115540123_p0.jpg",
  "img/115709793_p0.png",
  "img/116135803_p0.jpg",
  "img/116590666_p0.png",
  "img/116808607_p0.jpg",
  "img/118122283_p0.jpg",
  "img/118362740_p0.jpg",
  "img/119185212_p0.png",
  "img/119896322_p0.png",
  "img/120024712_p0.png",
  "img/120051214_p0.jpg",
  "img/120465455_p0.jpg",
  "img/120465627_p1.jpg",
  "img/120498462_p0.jpg",
  "img/120709189_p0.png",
  "img/121369907_p0.png",
  "img/121801937_p0.jpg",
  "img/123557086_p0.jpg",
  "img/123787817_p0.png",
  "img/123895702_p0.jpg",
  "img/125126536_p0.jpg",
  "img/125134980_p0.jpg",
  "img/125185919_p0.jpg",
  "img/125275185_p0.jpg",
  "img/125475371_p0.jpg",
  "img/125585398_p0.png",
  "img/125975786_p0.jpg",
  "img/126335918_p0.png",
  "img/126375185_p0.jpg",
  "img/126460102_p0.png",
  "img/126460214_p0.png",
  "img/126680468_p0.png",
  "img/126690382_p2.png",
  "img/126753481_p0.jpg",
  "img/1396456.png",
  "img/1767868104042.jpeg",
  "img/20250506081829174649070940211.jpg",
  "img/20250626070451175089269182323.jpg",
  "img/2bffc5f8f6bc454458efa79055484eccaa2c95f8.jpg",
  "img/69ba4616e7aa87d469c6ccfb97f46130.png",
  "img/88386138_p0.png",
  "img/89970255_p0.jpg",
  "img/90527548_p0.png",
  "img/90537724_p0.png",
  "img/97385469_p0.jpg",
  "img/98210678_p0.png",
  "img/98210678_p3.png",
  "img/99764972_p0.jpg",
  "img/bi.jpg",
  "img/biqi.jpg",
  "img/boqi.jpg",
  "img/oqi.jpg",
  "img/miku.jpg",
  "img/miku.jpeg",
  "img/hatsune-miku-vocaloid-wallpaper-3554x1999_53.jpg",
  "img/wallhaven-9mjoy1.png",
  "img/wallhaven-k8x2zd.jpg",
  "img/wallhaven-l3x1ky.jpg",
  "img/wallhaven-m9q6e9.jpg",
  "img/wallhaven-qr2wd5.png",
  "img/wallhaven-vpq7m8.png",
  "img/wallhaven-y8622k.jpg",
  "img/wallhaven-yq8w67.jpg",
  "img/Wallpaper Alchemy - 初音未来 4K 数字动漫壁纸.jpg",
  "img/Wallpaper Alchemy - 初音未来变体动漫4K壁纸.jpg",
  "img/Wallpaper Alchemy - 初音未来彩带庆典4K壁纸.jpg",
  "img/Wallpaper Alchemy - 初音未来车站音乐工作室壁纸.jpg",
  "img/Wallpaper Alchemy - 初音未来灯笼节动漫壁纸 4K.jpg",
  "img/Wallpaper Alchemy - 初音未来动漫 4K 高清壁纸.jpg",
  "img/Wallpaper Alchemy - 初音未来动漫暗水壁纸 4K.jpg",
  "img/Wallpaper Alchemy - 初音未来动漫校服少女4K壁纸.jpg",
  "img/Wallpaper Alchemy - 初音未来动漫战士4K壁纸.jpg",
  "img/Wallpaper Alchemy - 初音未来 风与鸟 动漫壁纸 4K.jpg",
  "img/Wallpaper Alchemy - 初音未来服务器机房赛博朋克壁纸.jpg",
  "img/Wallpaper Alchemy - 初音未来复古电视房间动漫壁纸.jpg",
  "img/Wallpaper Alchemy - 初音未来故障效果动漫4K壁纸.jpg",
  "img/Wallpaper Alchemy - 初音未来故障艺术数字壁纸(1).jpg",
  "img/Wallpaper Alchemy - 初音未来故障艺术数字壁纸.jpg",
  "img/Wallpaper Alchemy - 初音未来花卉幻想动漫壁纸.jpg",
  "img/Wallpaper Alchemy - 初音未来录音室动漫壁纸 4K(1).jpg",
  "img/Wallpaper Alchemy - 初音未来录音室动漫壁纸 4K.jpg",
  "img/Wallpaper Alchemy - 初音未来旅行冒险动漫壁纸.jpg",
  "img/Wallpaper Alchemy - 初音未来猫耳雪夜壁纸.jpg",
  "img/Wallpaper Alchemy - 初音未来千年孤寂动漫壁纸.jpg",
  "img/Wallpaper Alchemy - 初音未来秋季和服动漫4K壁纸.jpg",
  "img/Wallpaper Alchemy - 初音未来赛博朋克动漫4K壁纸.jpg",
  "img/Wallpaper Alchemy - 初音未来赛博朋克故障艺术壁纸.jpg",
  "img/Wallpaper Alchemy - 初音未来声音进化动漫壁纸 4K.jpg",
  "img/Wallpaper Alchemy - 初音未来水晶幻想4K壁纸.jpg",
  "img/Wallpaper Alchemy - 初音未来水晶魔法4K动漫壁纸.jpg",
  "img/Wallpaper Alchemy - 初音未来雨天动漫4K壁纸.jpg",
  "img/Wallpaper Alchemy - 初音未来雨夜动漫壁纸.jpg",
  "img/Wallpaper Alchemy - 初音未来 Windows XP 动漫壁纸 4K.jpg",
  "img/【哲风壁纸】二次元-初音未来.png",
  "img/【哲风壁纸】二次元-初音.png",
  "img/【哲风壁纸】少女-校园背景.png",
  "img/【哲风壁纸】Hololive-二次元.png"
];
function coverFor(p) {
  if (p && p.cover) return p.cover;
  var h = 0;
  var s = (p && p.id) || "x";
  for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return COVERS[h % COVERS.length];
}

/* ---------- 主题切换 ---------- */
function setupTheme() {
  var btn = document.getElementById("theme-toggle");
  if (!btn) return;
  var saved =
    localStorage.getItem("yaolin-theme") ||
    (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  document.documentElement.dataset.theme = saved;
  btn.addEventListener("click", function () {
    var next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("yaolin-theme", next);
  });
}

/* 所有页面自启动（家/友链等不依赖 app.js 的页面也能用主题） */
if (!window.__yaolinThemeInit) {
  window.__yaolinThemeInit = true;
  setupTheme();
}