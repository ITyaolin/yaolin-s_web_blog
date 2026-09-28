# yaolin 博客 · 兽耳娘主题静态博客

纯静态、无框架、无数据库的本地博客。文章就是你本机文件夹里的 `.md` / `.txt` 文件：**放进 `posts/` 文件夹，首页自动检测并展示**——不需要任何写作后台，文件即内容。

## 快速开始

```bash
# 推荐：本地服务器（启用 posts/ 自动检测）
python3 -m http.server 8017
# 浏览器打开 http://localhost:8017

# 也可以直接双击 index.html（页面可用，但 posts/ 自动检测依赖服务器目录列表）
```

> 新增文章：把 `.md` / `.txt` 文件丢进站点的 `posts/` 文件夹，刷新首页即自动出现。
> 支持 `front matter`（title/date/tags/summary），没有也自动解析（首行 `#` 标题 + 当天日期 + 自动摘要）。

## 写文章 → 渲染 → 推送

站点有两种浏览方式，都支持：

| 方式 | 文章从哪来 | 说明 |
| --- | --- | --- |
| 本地服务器 | 首页实时扫描 `posts/` 目录（目录列表） | 写完刷新就能看，不渲染也行 |
| 静态托管（GitHub Pages 等） | `make render` 生成的 `p-<id>.html` + `posts.json` | 静态托管没有目录列表，必须先把文章渲染成网页 |

**所以每次写完文章，先渲染再推送：**

```bash
make            # 编译渲染器（tools/render.c → tools/render，只需一次）
make render     # 把 posts/ 里的文章渲染成 p-<id>.html 与 posts.json
make check      # 只检查是否已渲染（没渲染则退出码 1，可挂在推送前 / CI）
make prune      # 删除源文章已不存在的旧静态页
```

`tools/render.c` 是零依赖的 C 程序，解析规则与前端**完全一致**——等价于 `js/store.js` 的 `parseMdFile` 和 `js/markdown.js` 的 `renderMarkdown`：同样的 front matter、同样的 Markdown 子集、同样的自动摘要 / 阅读时长 / 封面轮换。几个细节：

- 文章页 `p-<id>.html` 放在站点根目录（与 `index.html` 同级），因为看板娘和播放器用的是 `l2d/…`、`music/…` 这类相对路径，只有同层才能正常工作
- 页面外壳（导航 / 看板娘 / 播放器 / 页脚）在渲染时直接从 `post.html` 里截取，改了 `post.html` 重新渲染即可，不用动 C 代码
- 封面壁纸列表也是运行时从 `js/store.js` 的 `COVERS` 里读的，不会和前端漂移
- 首页在静态托管下靠 `posts.json` 列出文章，卡片直接链到预渲染的静态页；本地服务器仍走 `post.html?id=`
- 渲染是幂等的：内容没变就不改写文件，`make check` 可以放心挂在推送前

推送流程：

```bash
make render && make check     # 渲染并确认已是最新
git add -A && git commit -m "新文章：xxx" && git push
```

## 页面

| 页面 | 说明 |
| --- | --- |
| `index.html` | 首页：精选轮播 + 站点数据卡 + 全文搜索 + 标签筛选 + 文章网格（三栏） |
| `home.html` | 「家」：站点存活时间（自 2025-07-08 起，每秒跳动）+ 春节倒计时（按真实农历日期自动滚到下一个） |
| `friends.html` | 「友链」：从 `posts/config.txt` 的 `friend=` 行渲染友链卡片（无头像自动显示首字徽章） |
| `post.html?id=xxx` | 文章详情：Markdown 渲染、目录、封面大图、上/下一篇 |
| `about.html` | 关于页 |

## 特性

- **本地文章仓库**：`posts/` 文件夹自动检测（服务器目录列表 / File System Access 直读），内置示例文章两篇
- **真·Live2D 看板娘**：右侧浮动 Live2D 官方样例模型「Haru」（MOC3/Cubism4）：待机动作轮播、眨眼呼吸，点击随机动作+表情+卖萌气泡；不支持 WebGL 时自动隐藏（不显示静态纸片）
- **背景音乐**：左下角音乐播放器，自选曲库三首（A Rusty Dream / Die on the Dancefloor / LIFE），**默认关闭不自动播放**，点击播放/暂停/切歌，曲目与静音偏好记忆；**支持 .lrc 歌词同步显示**（播放自动弹出，点击 📜 可开关）
- **配色与图标**：粉红 + 蓝 + 紫三色系（浅色淡紫白底 / 深色深靛夜，浅/深双主题），全部图标改用 lucide / simple-icons 内联 SVG（无 emoji，音符图标已还原为小尺寸）
- **头像 + 一言**：导航栏 logo 前是 `img/neko.jpg` 圆形头像；每个页面 hero 下方都有「一言」打字机（v1.hitokoto.cn，8 秒超时/断网自动用本地句子兜底），居中显示
- **站点配置 `posts/config.txt`**：一站管所有新页面配置（创建时间 / 春节日期 / 友链），不会被当作文章展示；新增 `friend=名字|网址|一句话|头像图` 即可加友链
- **动态效果**：背景光斑漂移、卡片入场、hero 闪烁、纯 CSS 樱花花瓣飘落、点击 SVG 星火、Live2D 呼吸动画
- 深/浅双主题一键切换并记忆、全文搜索、标签统计
- 兽耳娘壁纸主视觉（14 张，来源见 `img/credits.txt`）

## 联系方式

- 📧 邮箱：foxfox233@qq.com
- 🐙 GitHub：github.com/ITyaolin

## 目录结构

```
├── index.html / post.html / about.html
├── p-<id>.html              # ★ `make render` 生成的文章静态页（每篇文章一个）
├── posts.json               # ★ `make render` 生成的文章清单（静态托管时首页靠它列文章）
├── Makefile                 # 渲染器的编译 / 渲染 / 检查入口
├── tools/render.c           # ★ 静态渲染器：posts/ 的 Markdown → 网页
├── css/style.css            # 兽耳娘主题（玻璃拟态 + 渐变 + 动画）
├── js/
│   ├── markdown.js          # Markdown 渲染器与摘要
│   ├── store.js             # 文章仓库：posts/ 检测 + 本地索引 + 主题切换
│   ├── posts.js             # 内置文章
│   ├── config.js            # 站点配置加载（posts/config.txt）
│   ├── app.js               # 首页 / 详情页渲染
│   ├── kanban.js            # Live2D 看板娘（右侧单角色）
│   ├── music.js             # 背景音乐播放器
│   ├── effects.js           # 全局动态效果（reveal/花瓣/火花/一言）
│   ├── siteclock.js         # 「家」存活时间与春节倒计时 + 友链渲染
│   └── vendor/              # 本地化第三方库（PIXI / Live2D Cubism 运行时）
├── l2d/haru/                # Live2D 模型 Haru（moc3 + 贴图 + 动作 + 表情）
├── posts/                   # ★ 你的文章文件夹（放 .md/.txt 自动上首页）
├── music/                   # 二次元 lofi 曲目（Sailor Vibes）
├── img/                     # 兽耳娘壁纸（Wallhaven，见 credits.txt）
└── hexo/hexo-theme-sakura/  # 参考素材：hexo-theme-sakura 主题源码克隆（站点本身不依赖）
```

## 文章格式示例（posts/）

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

标题 `#`~`######`、`**加粗**`、`*斜体*`、`~~删除~~`、`` `行内代码` ``、代码块（``` 或 ~~~）、有序/无序列表、`> 引用`、`---` 分隔线、`[链接](url)`、`![图片](url)`。

> 这套子集前后端一致：`js/markdown.js` 负责浏览器里实时渲染，`tools/render.c` 负责离线渲染成静态页（不支持表格）。

## 版权与致谢

- 壁纸：Wallhaven（SFW・动漫分类），逐张链接见 `img/credits.txt`
- Live2D：模型「Haru」为 Live2D Inc. 官方免费样例模型（SDK 示例，仅供学习/个人使用）
- 音乐：「Sailor Vibes」by マドロスMERCURY（via archive.org，CC/免费收听；若商用请自行确认授权）
- 如需替换：壁纸换 `img/`、模型换 `l2d/`（配套改 `js/kanban.js` 路径）、音乐换 `music/`（改 `js/music.js` 曲目列表）