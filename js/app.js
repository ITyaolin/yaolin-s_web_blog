"use strict";

/* 文章链接：有预渲染静态页（tools/render.c 生成的 posts.json 里带 url）就直接链过去，
   否则回到客户端渲染的详情页 */
function postHref(p) {
  return p && p.url ? p.url : "post.html?id=" + encodeURIComponent(p.id);
}

/* ================= 首页：数据卡 + 轮播 + 列表/搜索/标签 ================= */

function renderStats(posts) {
  const setText = function (id, v) {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
  };
  const total = posts.length;
  const tags = new Set(posts.flatMap(function (p) { return p.tags; })).size;
  const minutes = posts.reduce(function (a, p) { return a + readingMinutes(p.content); }, 0);
  const local = posts.filter(function (p) { return p.source === "folder" || p.source === "local"; }).length;
  setText("count-posts", total);
  setText("count-tags", tags);
  setText("count-minutes", minutes);
  setText("count-local", local);
}

function renderCarousel(posts) {
  const box = document.getElementById("carousel");
  if (!box) return;
  const featured = posts.slice(0, 6);
  if (!featured.length) return;

  box.innerHTML =
    '<div class="carousel-track">' +
    featured
      .map(function (p, i) {
        return (
          '<div class="carousel-slide' + (i === 0 ? " active" : "") + '">' +
          '<img src="' + coverFor(p) + '" alt="' + escapeHtml(p.title) + '">' +
          '<div class="carousel-cap"><h3><a href="' + postHref(p) + '">' + escapeHtml(p.title) + "</a></h3>" +
          "<p>" + escapeHtml(p.summary) + "</p></div></div>"
        );
      })
      .join("") +
    "</div>" +
    '<div class="carousel-dots">' +
    featured
      .map(function (p, i) {
        return '<button type="button" class="carousel-dot' + (i === 0 ? " active" : "") + '" data-i="' + i + '" aria-label="第' + (i + 1) + '张"></button>';
      })
      .join("") +
    "</div>";

  const slides = box.querySelectorAll(".carousel-slide");
  const dots = box.querySelectorAll(".carousel-dot");
  let idx = 0;
  let timer = null;

  function go(n) {
    idx = (n + slides.length) % slides.length;
    slides.forEach(function (s, i) { s.classList.toggle("active", i === idx); });
    dots.forEach(function (d, i) { d.classList.toggle("active", i === idx); });
  }
  function auto() {
    clearInterval(timer);
    timer = setInterval(function () { go(idx + 1); }, 4500);
  }
  box.addEventListener("mouseenter", function () { clearInterval(timer); });
  box.addEventListener("mouseleave", auto);
  box.addEventListener("click", function (e) {
    const d = e.target.closest(".carousel-dot");
    if (d) { go(Number(d.dataset.i)); auto(); }
  });
  auto();
}

async function initHome() {
  const posts = await getAllPostsAsync();
  const grid = document.getElementById("post-grid");
  const empty = document.getElementById("empty-tip");
  const search = document.getElementById("search-input");
  const tagWrap = document.getElementById("tag-filter");
  const countEl = document.getElementById("post-count");
  const tagCountEl = document.getElementById("tag-count");

  const allTags = Array.from(new Set(posts.flatMap(function (p) { return p.tags; }))).sort();
  const tagCounts = {};
  posts.forEach(function (p) {
    (p.tags || []).forEach(function (t) { tagCounts[t] = (tagCounts[t] || 0) + 1; });
  });

  if (countEl) countEl.textContent = posts.length;
  if (tagCountEl) tagCountEl.textContent = allTags.length;

  tagWrap.innerHTML =
    '<button type="button" class="tag-chip active" data-tag="">全部</button>' +
    allTags
      .map(function (t) {
        return '<button type="button" class="tag-chip" data-tag="' + escapeHtml(t) + '">' + escapeHtml(t) + ' <b class="count">' + tagCounts[t] + "</b></button>";
      })
      .join("");

  renderStats(posts);
  renderCarousel(posts);

  /* 侧边栏：标签云 + 最新文章（Sakura 排版） */
  const sideTags = document.getElementById("side-tags");
  const sideRecent = document.getElementById("side-recent");

  if (sideTags) {
    sideTags.innerHTML =
      '<button type="button" class="side-tag active" data-tag="">全部</button>' +
      allTags
        .map(function (t) {
          return '<button type="button" class="side-tag" data-tag="' + escapeHtml(t) + '">' + escapeHtml(t) + ' <b>' + tagCounts[t] + "</b></button>";
        })
        .join("");
  }
  if (sideRecent) {
    sideRecent.innerHTML = posts
      .slice(0, 5)
      .map(function (p) {
        return (
          '<li><a href="' + postHref(p) + '">' + escapeHtml(p.title) + "</a>" +
          '<time datetime="' + p.date + '">' + formatDate(p.date) + "</time></li>"
        );
      })
      .join("");
  }

  const state = { tag: "", keyword: "" };

  function visible() {
    const kw = state.keyword.trim().toLowerCase();
    return posts.filter(function (p) {
      if (state.tag && p.tags.indexOf(state.tag) === -1) return false;
      if (!kw) return true;
      const hay = (p.title + " " + p.summary + " " + p.content + " " + p.tags.join(" ")).toLowerCase();
      return hay.indexOf(kw) !== -1;
    });
  }

  function render() {
    const list = visible();
    grid.innerHTML = list
      .map(function (p) {
        const badge =
          p.source === "local"
            ? '<span class="pub-badge">本地发布</span>'
            : "";
        return (
          '<article class="post-card">' +
          '<a class="card-cover" href="' + postHref(p) + '">' +
          '<img src="' + coverFor(p) + '" alt="' + escapeHtml(p.title) + '" loading="lazy"></a>' +
          '<div class="card-meta"><time datetime="' + p.date + '">' + formatDate(p.date) + "</time>" +
          '<span class="dot">·</span><span>' + readingMinutes(p.content) + " 分钟</span>" +
          badge +
          "</div>" +
          '<h3 class="card-title"><a href="' + postHref(p) + '">' + escapeHtml(p.title) + "</a></h3>" +
          '<p class="card-summary">' + escapeHtml(p.summary) + "</p>" +
          '<div class="card-tags">' +
          p.tags.map(function (t) { return '<span class="chip">' + escapeHtml(t) + "</span>"; }).join("") +
          "</div></article>"
        );
      })
      .join("");
    empty.hidden = list.length !== 0;
  }

  search.addEventListener("input", function (e) {
    state.keyword = e.target.value;
    render();
  });
  function activateTag(tag) {
    state.tag = tag;
    document.querySelectorAll(".tag-chip, .side-tag").forEach(function (c) {
      c.classList.toggle("active", c.dataset.tag === tag);
    });
    render();
  }

  tagWrap.addEventListener("click", function (e) {
    const chip = e.target.closest(".tag-chip");
    if (chip) activateTag(chip.dataset.tag);
  });
  if (sideTags) {
    sideTags.addEventListener("click", function (e) {
      const chip = e.target.closest(".side-tag");
      if (chip) activateTag(chip.dataset.tag);
    });
  }

  render();
}

/* ================= 详情页 ================= */

function renderPostNav(posts, idx) {
  const prevEl = document.getElementById("prev-post");
  const nextEl = document.getElementById("next-post");
  const prev = posts[idx + 1];
  const next = posts[idx - 1];

  if (prev) {
    prevEl.innerHTML = '<span class="nav-label">上一篇</span>' + escapeHtml(prev.title);
    prevEl.href = postHref(prev);
  } else {
    prevEl.textContent = "没有了";
    prevEl.classList.add("disabled");
  }
  if (next) {
    nextEl.innerHTML = '<span class="nav-label">下一篇</span>' + escapeHtml(next.title);
    nextEl.href = postHref(next);
  } else {
    nextEl.textContent = "没有了";
    nextEl.classList.add("disabled");
  }
}

async function initPost() {
  const id = new URLSearchParams(location.search).get("id");
  const article = document.getElementById("post-article");
  const toc = document.getElementById("post-toc");

  if (!id) {
    article.innerHTML = '<p class="empty-tip">没有指定文章 ID，请从<a href="index.html">首页</a>进入。</p>';
    if (toc) toc.remove();
    return;
  }

  const posts = await getAllPostsAsync();
  const idx = posts.findIndex(function (p) { return p.id === id; });

  if (idx === -1) {
    article.innerHTML = '<p class="empty-tip">文章不存在或已被移除，返回<a href="index.html">首页</a>看看吧。</p>';
    if (toc) toc.remove();
    return;
  }

  const p = posts[idx];
  document.title = p.title + " · yaolin 博客";

  const badge =
    p.source === "local"
      ? '<span class="pub-badge">本地发布</span>'
      : "";

  article.innerHTML =
    '<div class="post-cover"><img src="' + coverFor(p) + '" alt="' + escapeHtml(p.title) + '"></div>' +
    '<header class="post-head">' +
    "<h1>" + escapeHtml(p.title) + "</h1>" +
    '<div class="post-meta">' +
    '<time datetime="' + p.date + '">' + formatDate(p.date) + "</time>" +
    '<span class="dot">·</span><span>' + readingMinutes(p.content) + " 分钟读完</span>" +
    badge +
    "</div>" +
    '<div class="card-tags">' +
    p.tags.map(function (t) { return '<span class="chip">' + escapeHtml(t) + "</span>"; }).join("") +
    "</div></header>" +
    '<div class="post-content">' + renderMarkdown(p.content) + "</div>";

  if (toc) {
    const headings = article.querySelectorAll(".post-content h2, .post-content h3");
    if (headings.length >= 2) {
      let h = '<h4 class="toc-title">目录</h4><ul class="toc-list">';
      headings.forEach(function (hd, i) {
        hd.id = "sec-" + i;
        h +=
          '<li class="toc-' + hd.tagName.toLowerCase() + '"><a href="#sec-' + i + '">' +
          hd.textContent + "</a></li>";
      });
      toc.innerHTML = h + "</ul>";
    } else {
      toc.remove();
    }
  }

  renderPostNav(posts, idx);
}

/* ================= 启动 ================= */

const page = document.body.dataset.page;
if (page === "home") initHome();
else if (page === "post") initPost();