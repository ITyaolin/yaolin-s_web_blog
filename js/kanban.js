"use strict";

/* ============================================================
 * 看板娘（右侧单角色）—— 鲸鱼娘 Sprite2D 版
 * 基于精灵表（spritesheet）动画，Canvas 2D 渲染
 * 功能：
 *   - 待机动画循环播放
 *   - 点击随机播放其他动画（挥手、跳跃、跑动等）
 *   - 拖拽移动（智能吸附边缘）
 *   - 加载动画（淡入）
 *   - 丰富台词（带时间问候）
 *   - 小工具栏（拖拽手柄、刷新按钮）
 *   - 加载失败友好降级（显示静态图标）
 * ============================================================ */

(function () {
  /* ---------- 时间问候 ---------- */
  function greetByTime() {
    var h = new Date().getHours();
    if (h < 6) return "这么晚了还不睡… 呜～";
    if (h < 9) return "早安呀～ 今天也要元气满满哦！";
    if (h < 12) return "上午好～ 摸鱼时间到！";
    if (h < 14) return "中午啦～ 记得好好吃饭！";
    if (h < 18) return "下午好～ 来杯茶歇一会儿吧～";
    if (h < 21) return "傍晚啦～ 今天的努力辛苦啦！";
    return "晚上好～ 要不要一起看星星？";
  }

  var LINES = [
    "欢迎回来～ 今天也要开心呀！",
    "把新的 .md 文章放进 posts/ 文件夹，刷新就能看到哦！",
    "戳戳我，我会跳舞给你看～",
    "首页的壁纸都是猫娘小姐姐，喜欢吗？",
    "夜猫子也要早点休息呀～",
    "主人主人，摸摸头好不好～",
    "今天天气真好，适合睡个午觉呢～",
    "代码写累了就看看我，有益身心健康！",
    "鲸鱼娘是最可爱的！哼！",
    "这个博客的主人一定是个温柔的人呢～",
    "今天写了多少行代码了呢？",
    "要不要听一首歌放松一下？",
    "窗外的风好舒服呀～",
    "你知道吗？这个博客只有纯 HTML CSS JS 哦！",
    "双击 index.html 也能打开网站呢！",
    "你喜欢深色模式还是浅色模式？",
    "点击页面任意位置会有小火花哦！",
    "樱花花瓣在飘落呢，看到了吗？",
    "右下角的音乐播放器可以放 lofi 音乐～",
    "友链页面有很多一起玩耍的小伙伴！",
    "关于页面有站点的详细介绍哦！",
    "你来了呀，真开心！",
    "这篇文章写了好长时间呢...",
    "标签筛选功能很好用吧？",
    "搜索框可以搜全文哦！",
    "卡片悬停会有放大效果呢！",
    "导航栏滚动后会变成毛玻璃样式～",
    "文章详情页有目录导航哦！",
    "上一页下一页可以快速跳转文章～",
    "背景音乐默认是关闭的，需要的话自己点开～",
    "歌词面板是全透明的，不会挡住内容哦！",
    "看板娘是可以拖拽移动的呢！",
    "工具栏有刷新和说话两个按钮哦！",
    "摸鱼指数测起来很有趣的～",
    "小鱼缸里的小鱼会游来游去哦！",
    "戳戳乐能变出好多爱心！",
    "站点存活时间一直在跳动呢！",
    "春节倒计时一天比一天近啦！",
    "文章封面图是随机分配的哦！",
    "一共有两百多张封面图可以选择呢！",
    "文章数量会随着 posts 文件夹变化哦！",
    "本站没有后端，所有数据都在本地！",
    "Markdown 文件客户端实时渲染！",
    "主题偏好会自动保存到浏览器里！",
    "响应式布局手机也能舒适阅读！",
    "SVG 图标全是内联的，不用加载外部资源！",
    "樱花飘落动画是用 CSS 做的哦！",
    "点击火花也是纯前端实现的！",
    "一言功能接入了 hitokoto API！",
    "如果 API 超时会显示本地预设语录～",
    "打字机效果让文字一行一行出现！",
    "气泡台词每 26 秒自动切换一次！",
    "鲸鱼娘待机动画会循环播放！",
    "点击鲸鱼娘会随机切到另一个动作！",
    "非 idle 动画播完会自动回到待机！",
    "鲸鱼娘的皮肤颜色是粉色调的！",
    "衣服是蓝色的，很清爽对不对？",
    "鲸鱼娘的动画有 9 种不同的状态！",
    "idle 是待机，running 是跑动～",
    "waving 是挥手，jumping 是跳跃！",
    "failed 是失败表情，waiting 是等待！",
    "review 是点评动作，running-left 向左跑！",
    "running-right 向右跑，都在这张精灵表里！",
    "精灵表有 1536x1872 像素那么大！",
    "每张帧是 192x208 像素！",
    "鲸鱼娘用的是 sprite2d 渲染方式！",
    "不是传统的 Live2D Cubism 模型哦！",
    "从 DSH Market 下载的内置宠物！",
    "精致版比基础版细节更多！",
    "基于 AI 辅助二次创作和精修！",
    "MIT 协议开源的宠物模型！",
    "站长最喜欢写 Rust 代码了！",
    "前端工程化也是站长关注的方向！",
    "关注效率和工具链提升！",
    "兽耳娘什么都好！",
    "兔耳狐耳也都很可爱！",
    "一切毛茸茸的东西都好！",
    "这个博客是站长一点点搭起来的！",
    "没有框架没有数据库！",
    "所有资源全部本地加载！",
    "离线也能正常访问！",
    "CSS 动画做了很多细节优化！",
    "深色模式的配色是精心调过的！",
    "渐变色的搭配用了粉红和紫色！",
    "阴影效果让卡片更有层次感！",
    "hover 时的微动效让交互更生动！",
    "滚动进入视口时元素会显现！",
    "卡片入场有交错延迟动画！",
    "导航链接 hover 会微微上浮！",
    "按钮点击有缩放反馈效果！",
    "进度条是渐变色填充的！",
    "音乐均衡器动画跟着节奏跳动！",
    "歌词高亮有发光效果！",
    "页脚的爱心有心跳动画！",
    "星星装饰在 Hero 区闪烁！",
    "背景光斑会缓慢漂移！",
    "整个页面充满了小心思！",
    "感谢你来看我的博客！",
    "希望你喜欢这个小窝～",
    "常来看看呀，我会一直在这里的！",
    "今天的你也辛苦了！",
    "加油加油，明天会更好！",
    "无论遇到什么困难都不要放弃！",
    "代码写不出来就去喝杯水休息一下！",
    "BUG 不可怕，耐心调试就好！",
    "编程是一件很有成就感的事！",
    "分享知识也是一种快乐！",
    "你的留言我看到了，谢谢！",
    "期待和你一起交流技术！",
    "有问题随时来找我聊！",
    "站长是个温柔的人呢！",
    "虽然偶尔也会犯懒...",
    "但是写起代码来还是很认真的！",
    "偶尔也会摸鱼啦～",
    "不过工作还是要完成的！",
    "劳逸结合才是王道！",
    "吃饱饭才有力气写代码！",
    "记得按时吃饭哦！",
    "多喝水对身体好！",
    "不要熬夜太晚啦！",
    "保持好心情最重要！",
    "笑一笑十年少！",
    "开心每一天！",
    "今天也要元气满满地度过哦！",
    "你知道吗，星星在晚上才会出来呢～",
    "月亮也很可爱呀，要不要一起看？",
    "清晨的露水亮晶晶的好漂亮～",
    "下雨天的声音让人好安心呀～",
    "春天的花开了好多，真好看！",
    "夏天的蝉鸣声好热闹哦！",
    "秋天的叶子变红了，像火一样！",
    "冬天的雪白白的，踩上去咯吱咯吱响～",
    "四季轮转，每个季节都有它的美～",
    "今天的阳光好温暖呀～",
    "微风轻轻吹过脸颊的感觉真好～",
    "云朵像棉花糖一样软乎乎的～",
    "彩虹出现的时候记得许愿哦！",
    "流星划过夜空的时候闭上眼睛！",
    "萤火虫在夏夜的草丛里飞舞～",
    "蝴蝶在花丛中翩翩起舞～",
    "小鸟在枝头唱歌真好听～",
    "青蛙在池塘边呱呱叫～",
    "小鱼在水里游来游去真自在～",
    "小猫在窗台上晒太阳～",
    "小狗摇着尾巴跑过来～",
    "小兔子蹦蹦跳跳的真可爱～",
    "小松鼠抱着松果忙忙碌碌～",
    "海豚在海面上跳跃～",
    "企鹅摇摇摆摆走路的样子好好笑～",
    "长颈鹿伸长脖子吃树叶～",
    "大象用鼻子喷水好好玩～",
    "狮子大王威风凛凛的～",
    "老虎身上的条纹像画的一样～",
    "熊猫抱着竹子吃得可香了～",
    "考拉抱着树睡觉的样子好治愈～",
    "袋鼠跳来跳去真灵活～",
    "鲸鱼在大海里唱着歌～",
    "海豚跃出水面打招呼～",
    "海龟慢悠悠地游泳～",
    "章鱼八只触手忙个不停～",
    "水母在水中飘来飘去～",
    "珊瑚礁五颜六色的好美～",
    "贝壳躺在沙滩上晒太阳～",
    "海螺里的螺旋图案好神奇～",
    "螃蟹横着走路好好笑～",
    "寄居蟹换了新房子好开心～",
    "海马爸爸会照顾宝宝哦！",
    "海星五角星的形状好特别～",
    "鹦鹉学人说话真有趣～",
    "孔雀开屏的时候好壮观～",
    "天鹅在水面上优雅地滑行～",
    "猫头鹰白天睡觉晚上工作～",
    "狐狸聪明又狡猾的呢～",
    "狼群在月光下嚎叫～",
    "熊冬眠睡得好香啊～",
    "兔子耳朵长长的真萌～",
    "仓鼠腮帮子鼓鼓的好可爱～",
    "龙猫毛茸茸的想摸一下～",
    "柴犬笑起来超治愈的～",
    "柯基的小短腿好搞笑～",
    "萨摩耶的笑容最甜了～",
    "金毛温温柔柔的～",
    "哈士奇拆家能力一流～",
    "边境牧羊犬是最聪明的狗～",
    "拉布拉多喜欢捡球～",
    "阿拉斯加体型超大但是很乖～",
    "博美小小的超级活泼～",
    "吉娃娃胆子最小但叫声最大～",
    "贵宾犬卷卷毛像个小玩偶～",
    "雪纳瑞胡子翘翘的～",
    "斗牛犬脸皱皱的好特别～",
    "柴犬的三角耳竖起来～",
    "秋田犬忠诚又勇敢～",
    "田园犬虽然普通但是最贴心～",
    "流浪猫如果有主人一定会更幸福～",
    "领养代替购买哦！",
    "小动物们也需要一个温暖的家～",
    "你对小动物有什么喜欢的吗？",
    "我家以前也养过一只小猫～",
    "它的毛色是橘黄色的～",
    "最喜欢蜷在我腿上睡觉～",
    "呼噜呼噜的声音超治愈～",
    "每天早上都会叫我起床～",
    "我用逗猫棒陪它玩了好久～",
    "它抓到老鼠会叼给我炫耀～",
    "不过现在它已经长大了～",
    "变成了威武的大橘猫～",
    "体重也胖了不少呢～",
    "不过还是那么可爱～",
    "你也有养宠物吗？",
    "没有的话可以考虑养一只～",
    "它们会给生活带来很多快乐～",
    "看着它们就觉得很温暖～",
    "它们的陪伴是最好的礼物～",
    "希望每个小动物都被善待～",
    "世界因为生命而美丽～",
    "每一个生命都值得尊重～",
    "让我们一起爱护小动物吧～",
    "大自然中还有很多奇妙的事～",
    "比如蘑菇是怎么生长的～",
    "种子是怎么发芽的～",
    "大树是怎么长高的～",
    "花朵是怎么开放的～",
    "蜜蜂是怎么采蜜的～",
    "蜘蛛是怎么织网的～",
    "蚂蚁是怎么搬家的～",
    "蚯蚓是怎么松土的～",
    "蜗牛是怎么爬行的～",
    "毛毛虫是怎么变成蝴蝶的～",
    "蝌蚪是怎么变成青蛙的～",
    "蚕宝宝是怎么吐丝的～",
    "蚕茧是怎么结成的～",
    "桑叶是怎么被吃光的～",
    "春天来了万物复苏～",
    "冬天走了春暖花开～",
    "时间过得真快呀～",
    "转眼间又到了一年尽头～",
    "新的一年有新的期待～",
    "愿所有的美好都如期而至～",
    "愿你每天都有好心情～",
    "愿你所求皆如愿～",
    "愿你平安喜乐～",
    "愿你被这个世界温柔以待～",
    "你是独一无二的存在～",
    "你的笑容很温暖～",
    "你的善良很珍贵～",
    "你的努力都会被看到～",
    "你的付出都会有回报～",
    "不要怀疑自己～",
    "你比想象中更优秀～",
    "你已经做得很好了～",
    "继续加油就好～",
    "我会一直在这里陪着你的～",
    "不管发生什么～",
    "都要相信自己～",
    "你要相信美好的事情即将发生～",
    "好运正在路上～",
    "惊喜也在路上～",
    "新的故事即将开始～",
    "翻开新的一页吧～",
    "今天也是充满希望的一天～",
    "早上好呀～",
    "中午好呀～",
    "下午好呀～",
    "晚上好呀～",
    "晚安好梦～",
    "做个甜甜的梦吧～",
    "梦里会有好吃的～",
    "梦里会有好看的风景～",
    "梦里会有可爱的朋友～",
    "醒来又是新的一天～",
    "带着好心情出发吧～",
    "路上会遇到很多好事～",
    "陌生人也会对你微笑～",
    "路边的小花会为你绽放～",
    "天空会为你放晴～",
    "风会为你歌唱～",
    "阳光会拥抱你～",
    "整个世界都在欢迎你～",
    "欢迎来到我的小窝～",
    "这里永远是你的避风港～",
    "累了就来坐坐吧～",
    "渴了就来喝杯水吧～",
    "不开心了就戳戳看板娘吧～",
    "她会给你讲笑话的～",
    "虽然她的笑话可能不好笑～",
    "但是心意是真诚的～",
    "希望你能感受到这份温暖～",
    "这个小窝不大～",
    "但是装得下所有的梦想～",
    "装得下所有的回忆～",
    "装得下所有的喜怒哀乐～",
    "也装得下一个你～",
    "谢谢你来看我～",
    "谢谢你的停留～",
    "谢谢你的留言～",
    "谢谢你的关注～",
    "这些都是我前进的动力～",
    "让我更有勇气写下去～",
    "让我更有信心做下去～",
    "让我觉得一切都值得～",
    "好了不啰嗦了～",
    "该干嘛干嘛去吧～",
    "记得常回来看看哦～",
    "拜拜啦～",
  ];

  var BUBBLE = document.getElementById("kanban-right-bubble");
  var RIGHT = document.getElementById("kanban-right");
  if (!RIGHT) return;

  var isDragging = false;
  var dragStartX = 0, dragStartY = 0;
  var elStartX = 0, elStartY = 0;
  var dragOffsetX = 0, dragOffsetY = 0;

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
    if (e.target && e.target.closest(".kanban-tools")) return;
    isDragging = true;
    dragStartX = ev.clientX;
    dragStartY = ev.clientY;
    elStartX = RIGHT.offsetLeft;
    elStartY = RIGHT.offsetTop;
    RIGHT.style.transition = "none";
    RIGHT.style.cursor = "grabbing";
    clearTimeout(showBubble._t);
    if (BUBBLE) BUBBLE.hidden = true;
  }

  function onDragMove(e) {
    if (!isDragging) return;
    e.preventDefault();
    var ev = e.touches ? e.touches[0] : e;
    var dx = ev.clientX - dragStartX;
    var dy = ev.clientY - dragStartY;
    var nx = elStartX + dx;
    var ny = elStartY + dy;
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
    var el = RIGHT;
    var elRect = el.getBoundingClientRect();
    var vw = window.innerWidth;
    var distLeft = elRect.left;
    var distRight = vw - elRect.right;
    if (distLeft < distRight && distLeft < 120) {
      el.style.left = "10px";
      el.style.right = "auto";
    } else if (distRight < distLeft && distRight < 120) {
      el.style.right = "10px";
      el.style.left = "auto";
    }
    el.style.transition = "left 0.3s ease, right 0.3s ease, bottom 0.3s ease, top 0.3s ease";
  }

  RIGHT.addEventListener("mousedown", onDragStart);
  document.addEventListener("mousemove", onDragMove);
  document.addEventListener("mouseup", onDragEnd);
  RIGHT.addEventListener("touchstart", onDragStart, { passive: true });
  document.addEventListener("touchmove", onDragMove, { passive: false });
  document.addEventListener("touchend", onDragEnd);

  /* ---------- 点击：随机动画 + 气泡 ---------- */
  RIGHT.addEventListener("click", function (e) {
    if (isDragging) return;
    showBubble(randLine());
    /* 切到随机非 idle 动画，播放完自动回到 idle */
    if (spriteLoaded) {
      var trackIdx = Math.floor(Math.random() * (TRACK_NAMES.length - 1)) + 1;
      startTrack(trackIdx);
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
    '<button type="button" class="kt-btn kt-refresh" title="重新加载" aria-label="重新加载">⟳</button>' +
    '<button type="button" class="kt-btn kt-speak" title="说句话" aria-label="说话">💬</button>';
  RIGHT.appendChild(tools);

  tools.addEventListener("click", function (e) {
    var btn = e.target.closest(".kt-btn");
    if (!btn) return;
    if (btn.classList.contains("kt-refresh")) {
      location.reload();
    } else if (btn.classList.contains("kt-speak")) {
      showBubble(randLine());
    }
  });

  RIGHT.addEventListener("mouseenter", function () {
    tools.classList.add("kt-visible");
  });
  RIGHT.addEventListener("mouseleave", function () {
    tools.classList.remove("kt-visible");
  });

  /* ---------- 加载占位 ---------- */
  var placeholder = document.createElement("div");
  placeholder.className = "kanban-placeholder";
  placeholder.innerHTML = '<span class="kp-text">加载中…</span>';
  RIGHT.appendChild(placeholder);

  /* ============================================================
   * Sprite2D 渲染引擎
   * ============================================================ */
  var TRACK_NAMES = [
    "idle",           // 0
    "running-right",  // 1
    "running-left",   // 2
    "waving",         // 3
    "jumping",        // 4
    "failed",         // 5
    "waiting",        // 6
    "running",        // 7
    "review"          // 8
  ];
  var FRAMES_PER_TRACK = [6, 8, 8, 4, 5, 8, 6, 6, 6];
  var SPRITESHEET_WIDTH = 1536;
  var SPRITESHEET_HEIGHT = 1872;
  var COLS = 8;
  var ROWS = 9;
  var FRAME_W = SPRITESHEET_WIDTH / COLS;   // 192
  var FRAME_H = SPRITESHEET_HEIGHT / ROWS;  // 208

  var wrapper = document.createElement("div");
  wrapper.className = "kanban-r2d";
  wrapper.style.pointerEvents = "none";
  RIGHT.appendChild(wrapper);

  var canvas = document.createElement("canvas");
  canvas.width = 240;
  canvas.height = 320;
  wrapper.appendChild(canvas);
  var ctx = canvas.getContext("2d");

  var spriteImg = new Image();
  var petCfg = null;
  var currentTrack = 0;   // idle
  var currentFrame = 0;
  var frameTimer = null;
  var animRunning = false;
  var spriteLoaded = false;

  /* 计算缩放使精灵居中 */
  var scaleX = 1, scaleY = 1, offX = 0, offY = 0;

  function calcLayout() {
    var cw = canvas.width;
    var ch = canvas.height;
    var s = Math.min(cw / FRAME_W, ch / FRAME_H) * 0.88;
    scaleX = s;
    scaleY = s;
    offX = (cw - FRAME_W * s) / 2;
    offY = (ch - FRAME_H * s) / 2 + 6; /* 略偏下一点更自然 */
  }

  function renderFrame() {
    if (!spriteImg.complete || !spriteImg.naturalWidth) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var sx = currentFrame * FRAME_W;
    var sy = currentTrack * FRAME_H;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      spriteImg,
      sx, sy, FRAME_W, FRAME_H,
      offX, offY, FRAME_W * scaleX, FRAME_H * scaleY
    );
    ctx.restore();
  }

  function scheduleNextFrame() {
    if (!animRunning) return;
    var trackName = TRACK_NAMES[currentTrack];
    var durations = null;
    if (petCfg && petCfg.sprite2d && petCfg.sprite2d.tracks && petCfg.sprite2d.tracks[trackName]) {
      durations = petCfg.sprite2d.tracks[trackName].durations;
    }
    if (!durations) {
      /* 默认 500ms 每帧 */
      durations = [];
      for (var i = 0; i < FRAMES_PER_TRACK[currentTrack]; i++) durations.push(500);
    }
    var delay = durations[currentFrame] || 500;
    frameTimer = setTimeout(function () {
      currentFrame++;
      if (currentFrame >= FRAMES_PER_TRACK[currentTrack]) {
        if (currentTrack === 0) {
          /* idle 循环 */
          currentFrame = 0;
        } else {
          /* 非 idle 播放完回到 idle */
          currentTrack = 0;
          currentFrame = 0;
        }
      }
      renderFrame();
      scheduleNextFrame();
    }, delay);
  }

  function startTrack(trackIdx) {
    if (trackIdx < 0 || trackIdx >= TRACK_NAMES.length) trackIdx = 0;
    currentTrack = trackIdx;
    currentFrame = 0;
    if (frameTimer) {
      clearTimeout(frameTimer);
      frameTimer = null;
    }
    animRunning = true;
    renderFrame();
    scheduleNextFrame();
  }

  /* ---------- 加载资源 ---------- */
  /* 先绑定 onload/onerror，再设置 src，防止缓存导致事件丢失 */
  spriteImg.onload = function () {
    spriteLoaded = true;
    calcLayout();
    renderFrame();

    /* 淡入 */
    canvas.style.opacity = "0";
    (function fadeIn() {
      var o = parseFloat(canvas.style.opacity) || 0;
      o += 0.08;
      canvas.style.opacity = String(o);
      if (o < 1) requestAnimationFrame(fadeIn);
    })();

    /* 移除占位 */
    if (placeholder) {
      placeholder.style.opacity = "0";
      setTimeout(function () { if (placeholder) placeholder.remove(); }, 400);
    }

    /* 开始 idle 动画 */
    startTrack(0);

    /* 加载完成后的问候 */
    setTimeout(function () {
      showBubble("鲸鱼娘来啦～ " + greetByTime());
    }, 1500);

    /* 响应窗口大小变化 */
    function resizeCanvas() {
      var rect = RIGHT.getBoundingClientRect();
      var w = Math.round(rect.width);
      var h = Math.round(rect.height);
      if (w < 10 || h < 10) return;
      canvas.width = w;
      canvas.height = h;
      calcLayout();
      renderFrame();
    }
    window.addEventListener("resize", resizeCanvas);
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function () { resizeCanvas(); });
      ro.observe(RIGHT);
    }
  };

  spriteImg.onerror = function () {
    if (placeholder) {
      placeholder.innerHTML = '<span class="kp-text">图片加载失败</span>';
    }
  };

  /* 使用 fetch 获取配置，然后加载精灵表 */
  fetch("l2d/whale-girl-refined/pet.json")
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(function (cfg) {
      petCfg = cfg;
      /* 设置图片源 - onload 已绑定好 */
      spriteImg.src = "l2d/whale-girl-refined/spritesheet.webp";
    })
    .catch(function () {
      /* 降级显示 */
      if (placeholder) {
        placeholder.innerHTML = '<span class="kp-text">看板娘</span>';
      }
    });
})();