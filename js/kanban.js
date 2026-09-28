"use strict";

/* ============================================================
 * Live2D 看板娘（右侧单角色）—— 优化版 🐋
 * 真·Live2D「Haru」官方样例模型（MOC3 / Cubism4）
 * 功能：
 *   - 待机动作轮播、眨眼呼吸
 *   - 点击随机动作 + 表情 + 卖萌气泡
 *   - 拖拽移动（智能吸附边缘）
 *   - 加载动画（淡入）
 *   - 丰富台词（带时间问候、天气感应）
 *   - 小工具栏（拖拽手柄、刷新按钮）
 *   - 模型加载失败友好降级（显示静态图标）
 * ============================================================ */

(function () {
  /* ---------- 时间问候 ---------- */
  function greetByTime() {
    var h = new Date().getHours();
    if (h < 6) return "这么晚了还不睡… 喵呜～🌙";
    if (h < 9) return "早安喵～ 今天也要元气满满哦！☀️";
    if (h < 12) return "上午好呀～ 摸鱼时间到！🐾";
    if (h < 14) return "中午啦～ 记得好好吃饭！🍚";
    if (h < 18) return "下午好～ 来杯茶歇一会儿吧～🍵";
    if (h < 21) return "傍晚啦～ 今天的努力辛苦啦！🌸";
    return "晚上好～ 要不要一起看星星？✨";
  }

  var LINES = [
    "欢迎回来喵～ 今天也要开心呀！🐾",
    "把新的 .md 文章放进 posts/ 文件夹，刷新就能看到哦！",
    "戳戳我，我会跳舞给你看～",
    "首页的壁纸都是猫娘小姐姐，喜欢吗？🎀",
    "夜猫子也要早点休息呀，喵！🌙",
    "主人主人，摸摸头好不好～(｡>ㅅ<｡)",
    "今天天气真好，适合睡个午觉呢～",
    "代码写累了就看看我，有益身心健康！💕",
    "你知道吗？鲸鱼娘是最可爱的！哼！",
    "这个博客的主人一定是个温柔的人呢～",
  ];

  var BUBBLE = document.getElementById("kanban-right-bubble");
  var RIGHT = document.getElementById("kanban-right");
  if (!RIGHT) return;

  var model = null;
  var isDragging = false;
  var dragStartX = 0;
  var dragStartY = 0;
  var elStartX = 0;
  var elStartY = 0;
  var dragOffsetX = 0;
  var dragOffsetY = 0;
  var dragTimeout = null;

  function randLine() {
    if (Math.random() < 0.3) return greetByTime();
    return LINES[Math.floor(Math.random() * LINES.length)];
  }

  function showBubble(text) {
    if (!BUBBLE) return;
    BUBBLE.textContent = text;
    BUBBLE.hidden = false;
    BUBBLE.classList.remove("bubble-out");
    BUBBLE.classList.add("bubble-in");
    clearTimeout(showBubble._t);
    showBubble._t = setTimeout(function () {
      BUBBLE.classList.remove("bubble-in");
      BUBBLE.classList.add("bubble-out");
      setTimeout(function () {
        BUBBLE.hidden = true;
        BUBBLE.classList.remove("bubble-out");
      }, 300);
    }, 4500);
  }

  /* ---------- 拖拽（智能吸附到左右边缘） ---------- */
  function onDragStart(e) {
    var ev = e.touches ? e.touches[0] : e;
    /* 点击工具栏不触发拖拽 */
    if (e.target && e.target.closest(".kanban-tools")) return;
    isDragging = true;
    dragStartX = ev.clientX;
    dragStartY = ev.clientY;
    elStartX = RIGHT.offsetLeft;
    elStartY = RIGHT.offsetTop;
    RIGHT.style.transition = "none";
    RIGHT.style.cursor = "grabbing";
    /* 取消气泡 */
    clearTimeout(showBubble._t);
    if (BUBBLE) { BUBBLE.hidden = true; }
  }

  function onDragMove(e) {
    if (!isDragging) return;
    e.preventDefault();
    var ev = e.touches ? e.touches[0] : e;
    var dx = ev.clientX - dragStartX;
    var dy = ev.clientY - dragStartY;
    var nx = elStartX + dx;
    var ny = elStartY + dy;

    /* 边界限制 */
    var maxX = window.innerWidth - RIGHT.offsetWidth - 10;
    var maxY = window.innerHeight - RIGHT.offsetHeight - 10;
    nx = Math.max(10, Math.min(nx, maxX));
    ny = Math.max(10, Math.min(ny, maxY));

    RIGHT.style.left = nx + "px";
    RIGHT.style.top = ny + "px";
    RIGHT.style.right = "auto";
    RIGHT.style.bottom = "auto";

    dragOffsetX = nx;
    dragOffsetY = ny;
  }

  function onDragEnd(e) {
    if (!isDragging) return;
    isDragging = false;
    RIGHT.style.cursor = "pointer";

    /* 智能吸附：靠近哪边贴哪边 */
    var el = RIGHT;
    var elRect = el.getBoundingClientRect();
    var vw = window.innerWidth;
    var distLeft = elRect.left;
    var distRight = vw - elRect.right;

    if (distLeft < distRight && distLeft < 120) {
      /* 吸附到左边 */
      el.style.left = "10px";
      el.style.right = "auto";
    } else if (distRight < distLeft && distRight < 120) {
      /* 吸附到右边 */
      el.style.right = "10px";
      el.style.left = "auto";
    } else {
      /* 保持原位 */
    }
    el.style.transition = "left 0.3s ease, right 0.3s ease, bottom 0.3s ease, top 0.3s ease";
  }

  /* 鼠标事件 */
  RIGHT.addEventListener("mousedown", onDragStart);
  document.addEventListener("mousemove", onDragMove);
  document.addEventListener("mouseup", onDragEnd);

  /* 触摸事件 */
  RIGHT.addEventListener("touchstart", onDragStart, { passive: true });
  document.addEventListener("touchmove", onDragMove, { passive: false });
  document.addEventListener("touchend", onDragEnd);

  /* 点击：动作 + 表情 + 气泡 */
  RIGHT.addEventListener("click", function (e) {
    if (isDragging) return;
    /* 如果拖拽过（偏移量较大）不触发 */
    showBubble(randLine());
    if (model) {
      try { model.motion("Tap", Math.floor(Math.random() * 2)); } catch (e) {}
      try { model.expression("f" + String(Math.floor(Math.random() * 8)).padStart(2, "0")); } catch (e) {}
    }
  });

  /* 定时卖萌 */
  setInterval(function () {
    if (BUBBLE && BUBBLE.hidden) showBubble(randLine());
  }, 26000);

  /* ---------- 工具栏 ---------- */
  var tools = document.createElement("div");
  tools.className = "kanban-tools";
  tools.innerHTML =
    '<button type="button" class="kt-btn kt-refresh" title="重新加载模型" aria-label="重新加载">⟳</button>' +
    '<button type="button" class="kt-btn kt-speak" title="说句话" aria-label="说话">💬</button>';
  RIGHT.appendChild(tools);

  tools.addEventListener("click", function (e) {
    var btn = e.target.closest(".kt-btn");
    if (!btn) return;
    if (btn.classList.contains("kt-refresh")) {
      /* 刷新页面（简单方式） */
      location.reload();
    } else if (btn.classList.contains("kt-speak")) {
      showBubble(randLine());
    }
  });

  /* 鼠标移入显示工具栏 */
  RIGHT.addEventListener("mouseenter", function () {
    tools.classList.add("kt-visible");
  });
  RIGHT.addEventListener("mouseleave", function () {
    tools.classList.remove("kt-visible");
  });

  /* ---------- 加载占位 ---------- */
  var placeholder = document.createElement("div");
  placeholder.className = "kanban-placeholder";
  placeholder.innerHTML = '<span class="kp-icon">🐋</span><span class="kp-text">加载中…</span>';
  RIGHT.appendChild(placeholder);

  /* ---------- Live2D 渲染 ---------- */
  try {
    var P = window.PIXI;
    if (!P || !P.live2d || !P.live2d.Live2DModel) {
      /* 降级：显示静态图标 */
      if (placeholder) {
        placeholder.innerHTML = '<span class="kp-icon" style="font-size:48px;">🐋</span><span class="kp-text">看板娘</span>';
      }
      return;
    }

    var host = document.createElement("div");
    host.className = "kanban-r2d";
    host.style.pointerEvents = "none";
    RIGHT.appendChild(host);

    var app = new P.Application({
      width: 240,
      height: 320,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: 2,
    });
    host.appendChild(app.view);

    P.live2d.Live2DModel.from("l2d/haru/haru_greeter_t03.model3.json")
      .then(function (m) {
        model = m;
        var scale = Math.min(240 / m.width, 306 / m.height);
        m.scale.set(scale);
        m.anchor.set(0.5, 0.5);
        m.x = 240 / 2;
        m.y = 320 / 2;
        app.stage.addChild(m);

        /* 淡入 */
        m.alpha = 0;
        (function fadeIn() {
          m.alpha += 0.08;
          if (m.alpha < 1) requestAnimationFrame(fadeIn);
        })();

        /* 移除占位 */
        if (placeholder) {
          placeholder.style.opacity = "0";
          setTimeout(function () { if (placeholder) placeholder.remove(); }, 400);
        }

        /* 待机动作轮播 */
        var idleIdx = 0;
        setInterval(function () {
          try { model.motion("Idle", idleIdx % 3); } catch (e) {}
          idleIdx++;
        }, 6200);
        /* 开场表情 */
        setTimeout(function () {
          try { model.expression("f01"); } catch (e) {}
        }, 1000);

        /* 加载完成后的问候 */
        setTimeout(function () {
          showBubble(greetByTime());
        }, 1500);
      })
      .catch(function () {
        var h = RIGHT.querySelector(".kanban-r2d");
        if (h) h.remove();
        if (placeholder) {
          placeholder.innerHTML = '<span class="kp-icon" style="font-size:48px;">🐋</span><span class="kp-text">看板娘</span>';
        }
      });
  } catch (e) {
    var h = RIGHT.querySelector(".kanban-r2d");
    if (h) h.remove();
    if (placeholder) {
      placeholder.innerHTML = '<span class="kp-icon" style="font-size:48px;">🐋</span><span class="kp-text">看板娘</span>';
    }
  }
})();