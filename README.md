# yaolin 博客 · 兽耳娘主题静态博客

纯静态、无框架、无数据库、无构建工具的本地博客。文章就是你本机文件夹里的 `.md` / `.txt` 文件：
**丢进 `posts/` 就上首页**，文件即内容。

线上：<https://yaolin.fun/>（GitHub Pages + 自定义域名，见 `CNAME`）

---

## 快速开始

```bash
# 本地预览（推荐：能启用 posts/ 目录自动检测）
python3 -m http.server 8017
# 浏览器打开 http://localhost:8017

# 也可以直接双击 index.html：页面能用，但 posts/ 自动检测依赖服务器目录列表
```

> 新增文章：把一个 `.md` / `.txt` 放进 `posts/`，刷新首页即出现。
> 支持 front matter（title / date / tags / summary），不写也能自动解析：首个 `#` 标题 + 文件日期 + 自动摘要。

---

## 写文章 → 渲染 → 推送

站点有两种列文章的方式，是为了适配两种运行环境：

| 运行环境 | 文章从哪来 | 说明 |
| --- | --- | --- |
| 本地服务器 / `post.html?id=` | 首页实时读 `posts/` 目录列表 | 写完刷新就能看，不渲染也行 |
| 静态托管（GitHub Pages 等） | `make render` 生成的 `posts/p-<id>.html` + `posts.json` | 静态托管没有目录列表，必须先渲染成网页 |

**所以每写完文章，先渲染再推送：**

```bash
make            # 编译渲染器（tools/render.c → tools/render，只需一次）
make render     # 把 posts/ 里的文章渲染成 posts/p-<id>.html 与 posts.json
make check      # 只检查有没有忘记渲染（过期则退出码 1，可挂在推送前 / CI）
make prune      # 删除源文章已不存在的旧静态页
```

完整流程：

```bash
# 1. 写文章
vim posts/我的新文章.md
# 2. 渲染
make render && make check
# 3. 推送
git add -A && git commit -m "新文章：我的新文章" && git push
```

`tools/render.c` 是零依赖的 C 程序，解析规则与前端**完全一致**——等价于 `js/store.js` 的
`parseMdFile()` 和 `js/markdown.js` 的 `renderMarkdown()`：同样的 front matter、同样的 Markdown
子集、同样的自动摘要 / 阅读时长 / 封面选取。几个关键设计：

- **文章页放在 `posts/` 里**（和文章源文件同目录）：`posts/p-<id>.html`。页面里有一行
  `<base href="../">`，把 `css/…`、`js/…`、`img/…`、`l2d/…`、`music/…` 这些相对路径统一锚回站点根目录。
  也正因为这个 `<base>`，目录锚点写成完整路径 `posts/p-<id>.html#sec-N`。
- **页面外壳**（导航 / 看板娘 / 音乐播放器 / 页脚）在渲染时直接从 `post.html` 里截取，
  所以改了 `post.html` 重新渲染即可，不用动 C 代码。
- **封面壁纸列表**运行时从 `js/store.js` 的 `COVERS` 里读，不复制一份，避免和前端漂移。
- **静态托管下首页靠 `posts.json`** 列文章，卡片直接链到预渲染页；本地服务器仍走 `post.html?id=`。
- **幂等**：内容没变就不改写文件，`make check` 可以放心挂在推送前。
- 旧版本曾把静态页生成在站点根目录，现在渲染器会顺手把根目录里的旧页面删掉（只认带生成标记的 `p-*.html`）。

---

## 页面

| 页面 | 说明 |
| --- | --- |
| `index.html` | 首页：精选轮播 + 站点数据卡 + 全文搜索 + 标签筛选 + 文章网格（三栏） |
| `home.html` | 「家」：站点存活时间（自 `posts/config.txt` 的 `created` 起算，每秒跳动）+ 春节倒计时（按真实农历滚到下一个）+ 摸鱼指数、戳戳乐 |
| `friends.html` | 「友链」：读 `posts/config.txt` 的 `friend=` 行渲染卡片（无头像自动显示首字徽章） |
| `about.html` | 关于页 |
| `post.html?id=xxx` | 文章详情：客户端 Markdown 渲染、目录、封面大图、上/下一篇 |
| `posts/p-<id>.html` | ★ `make render` 预渲染的文章页（静态托管走这里） |

---

## 特性

- **本地文章仓库**：`posts/` 文件夹自动检测（服务器目录列表 / File System Access 直读），
  外加 `posts.json` 清单兜底，三条路任一条走通就能列文章。
- **看板娘**：右下角「鲸鱼娘（精致版）」——Sprite2D 精灵表动画（Canvas 2D 绘制，
  `l2d/whale-girl-refined/spritesheet.webp` + `pet.json`），9 条动作（待机 / 左右跑 / 挥手 /
  跳跃 / 失落 / 等待 / 跑动 / 端详）、点一下随机换个动作、可拖动、带台词气泡；
  素材加载失败时退化成一行「看板娘」文字，不留空白。
- **背景音乐**：左下角播放器，三首曲目（A Rusty Dream · DOUDOU / Die on the Dancefloor ·
  Chelle Mok / LIFE · Neuro-sama），**默认关闭、不自动播放**，播放/暂停/切歌，
  曲目与静音偏好记忆；**支持 `.lrc` 歌词同步**（播放时自动展开，可手动开关）。
  播放器本体只有等化器条 + 播放键 + 曲名 + 切歌 + 歌词按钮，没有多余的 emoji 与提示文字。
- **深浅双主题**：一键切换并记忆偏好；手机窄屏下主题开关始终留在导航药丸内（不会溢出）。
- **配色与图标**：粉红 + 蓝 + 紫三色系（浅色淡紫白底 / 深色深靛夜），界面图标全部是内联 SVG，不用 emoji。
- **头像 + 一言**：导航 logo 前是 `img/neko.jpg` 圆形头像；每页 hero 下方有「一言」打字机
  （v1.hitokoto.cn，8 秒超时 / 断网自动用本地句子兜底）。
- **站点配置 `posts/config.txt`**：一处管所有页面配置（创建时间 / 春节日期 / 友链），
  不会被当成文章展示。
- **动态效果**：背景光斑漂移、卡片入场、hero 闪烁、纯 CSS 樱花飘落、点击 SVG 星火。
- **兽耳娘壁纸主视觉**：13 张（来源逐张列在 `img/credits.txt`）。

---

## 目录结构

```
├── index.html / home.html / friends.html / about.html / post.html
├── posts.json               # ★ make render 生成的文章清单（静态托管时首页靠它列文章）
├── CNAME                    # 自定义域名（yaolin.fun）
├── Makefile                 # 渲染器的编译 / 渲染 / 检查入口
├── tools/render.c           # ★ 静态渲染器：posts/ 的 Markdown → 网页（C11，零依赖）
├── css/style.css            # 兽耳娘主题（玻璃拟态 + 渐变 + 响应式 + 动画）
├── js/
│   ├── markdown.js          # Markdown 渲染、摘要、阅读时长
│   ├── store.js             # 文章仓库：posts/ 检测 + posts.json 清单 + 本地索引 + 主题切换
│   ├── posts.js             # 内置示例文章
│   ├── config.js            # 站点配置加载（posts/config.txt）
│   ├── app.js               # 首页 / 详情页渲染
│   ├── kanban.js            # 看板娘（Sprite2D 精灵表动画）
│   ├── music.js             # 背景音乐播放器 + .lrc 歌词
│   ├── effects.js           # 全局动效（滚动显现 / 樱花 / 星火 / 一言）
│   ├── siteclock.js         # 「家」存活时间与春节倒计时 + 友链渲染
│   ├── homefun.js           # 「家」的小玩法（摸鱼指数 / 戳戳乐）
│   └── vendor/              # 早期 Live2D 版的第三方运行时（PIXI / Cubism，当前未使用，留着备用）
├── l2d/
│   ├── whale-girl-refined/  # ★ 现用看板娘素材（精灵表 + pet.json，MIT）
│   └── haru/                # 早期 Live2D 样例模型（当前未使用，留着备用）
├── posts/                   # ★ 文章文件夹：放 .md/.txt；渲染出的 p-<id>.html 也在这里
├── music/                   # 三首曲目 + 同名 .lrc 歌词
└── img/                     # 壁纸与头像（Wallhaven，见 credits.txt）
```

---

## 文章格式示例（`posts/`）

```markdown
---
title: "我的新文章"
date: 2025-09-01
tags: ["前端", "教程"]
summary: "一句话摘要。"
---

# 我的新文章

正文用 Markdown 写……
```

## 支持的 Markdown

标题 `#`~`######`、`**加粗**`、`*斜体*`、`~~删除~~`、`` `行内代码` ``、代码块（``` 或 ~~~）、
有序 / 无序列表（单层，空行结束列表）、`> 引用`、`---` 分隔线、`[链接](url)`、`![图片](url)`。

> 这套子集前后端一致：`js/markdown.js` 在浏览器里实时渲染，`tools/render.c` 离线渲染成静态页。
> **不支持表格。**

---

## 联系方式

- 邮箱：foxfox233@qq.com
- GitHub：<https://github.com/ITyaolin>

## 版权与致谢

- **壁纸**：Wallhaven（SFW・动漫分类），逐张链接见 `img/credits.txt`。
- **看板娘**：「鲸鱼娘（精致版）」为基于鲸鱼娘形象的二次创作 / 精修变体，`pet.json` 标注 MIT。
- **音乐**：三首曲目见 `js/music.js`，版权归各自原作者，此处仅作个人聆听；商用请自行确认授权。
- **Live2D / PIXI**：`l2d/haru/` 与 `js/vendor/` 是早期 Live2D 看板娘方案的素材与运行时
  （模型为 Live2D Inc. 官方免费样例，SDK 示例仅供学习 / 个人使用），当前页面不加载它们，留作备用。
- **替换指南**：壁纸换 `img/`；看板娘换 `l2d/` 并同步改 `js/kanban.js`；音乐换 `music/` 并同步改
  `js/music.js` 的曲目列表。