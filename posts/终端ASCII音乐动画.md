---
title: "把一首歌编译成终端动画：world.execute (me); ASCII MV"
date: 2026-09-28
tags: ["C", "ASCII", "音乐可视化"]
summary: "一个可执行程序，运行就在终端里放 Mili《world.execute (me);》的 ASCII 动画 MV：49 个场景、13 种转场、逐词卡拉OK，每一帧都是实时算出来的。"
---

# 把一首歌编译成终端动画

我很喜欢那种「把东西压成一个文件」的做法。这个项目就是：一首歌，变成一个可执行程序。

`make && ./start`，终端里就开始播 Mili《world.execute (me);》的 ASCII 动画 MV。没有浏览器，没有播放器，没有视频文件——每一帧都是程序根据播放时间当场算出来的，mp3 只是顺带播放。

![开场 20 秒](https://raw.githubusercontent.com/ITyaolin/world-execute-me-mv/main/preview/opening.gif)

## 跑起来

```sh
git clone https://github.com/ITyaolin/world-execute-me-mv.git
cd world-execute-me-mv
make && ./start
```

仓库不附带音频，也不附带歌词源文件（时间轴已经烘焙进头文件），所以 clone 下来直接 `make` 就能跑。想听声音，就把一首同名 mp3 放到 `start` 旁边——程序会先找可执行文件所在的目录，整个文件夹拷走就能用。

## 画面长什么样

程序自带离线导出，可以把任意一帧打印成纯文本。这是第 68 秒那一帧（`./start --dump 68000 --size 60x18 --color mono`）：

```text
 world.execute (me);  beat  . . . @                    1:08 
                                                            
                             ===                            
                        ^^^^^  ^^^^^                        
                       ^==   ^^    =^=                      
                       =             =                      
                       =             =                      
                       =    ~~v~~    =                      
                       =~~~~     ~~~~=                      
                         ====   ====                        
                             ===                            
                                                            
                                                            
                                                            
   happiness 100%     --[ RUN ]-------                      
                        SATISFACTION                        
                  If I can make you happy                   
 1:08   [==============================----------]     3:32 
```

顶栏是进度，底栏是逐词卡拉OK，画面主体全是字符——连角色和表情都是字符拼的。同一时刻永远画出同一帧，所以导出的静帧和实际播放长得一模一样。

整首歌的分镜摊开是这样：

![分镜拼图](https://raw.githubusercontent.com/ITyaolin/world-execute-me-mv/main/preview/storyboard.png)

## 49 个场景

场景表可以直接问程序：

```text
world.execute (me); -- 49 scenes, 129 lyric lines, 422 words, 212.0s

  #  start     end   dur  effect        transition   line  caption
  0    0.00s   1.60s  1.60s  powerline     dissolve        0  
  1    1.60s   3.72s  2.12s  shield        iris-out        1  
  2    3.72s   7.30s  3.58s  blocks        wipe-left       3  
  3    7.30s  11.06s  3.76s  datastream    glitch          6  
  4   11.06s  13.64s  2.58s  globe         iris-in         8  
  5   13.64s  16.01s  2.37s  gridworld     wipe-up        10  
  6   16.01s  29.48s 13.47s  code          flash-white    11  
  7   29.48s  33.20s  3.72s  points        dissolve       12  
  8   33.20s  36.98s  3.78s  circle        iris-in        15  
  9   36.98s  40.70s  3.72s  sine          wipe-right     18  

  ...   （共 49 个场景，./start --list 查看全部）
```

每个场景都锚定到歌词时间轴上的某一行，所以画面和歌词天生对齐，几十秒的长场景也不会漂移。

## 没有终端也能用

在 CI 里、日志里，或者只是想快速看一眼的时候：

```sh
./start --list          # 打印 49 个场景的时间表
./start --dump 68000    # 把第 68 秒那一帧按纯文本打印出来
./start --selftest      # 自检：时间轴 + 每一个特效
```

自检输出：

```text
scenes: 49, lyric lines: 129, words: 422
selftest: OK (0 failures)
```

## 它由什么组成

- **49 个场景**，锚定到歌词时间轴
- **13 种转场**：溶解、四向擦除、径向开合、故障、闪白、闪黑、滑动、百叶窗、燃烧
- **逐词卡拉OK**：129 行歌词、422 个词，42 个关键词会放大成巨型字体
- **18 个手工 ASCII 精灵**：茄子、番茄、猫、神、心、锁链、警告……
- 终端自适应、多色域降级、胶片颗粒与 HUD

## 几个我觉得聪明的做法

**一切是时间的纯函数。** 特效不保存状态，只接收「现在是第几毫秒」。这样既不会累积误差，跳转和导出也天然一致。

**转场不是硬切。** 进入转场窗口后，前后两个场景都会渲染，再按权重图混合，并在转场中点压一下亮度——看起来像真的在溶解，而不是两张图叠在一起。

**逐单元 diff 输出。** 只把发生变化的终端单元格写出去，30fps 也不至于刷屏。

**大字要修正宽高比。** 终端单元格是 8x16 像素（宽高比 1:2），所以所有圆都按 `ry = rx * 0.5` 修正，点阵字体则采样到正方形单元格块里，保证字母不被拉长。

**优雅降级。** 颜色按 `COLORTERM` / `TERM` 自动在 truecolor / 256 / 16 / 单色之间降级；退出时恢复光标、备用屏幕和颜色，原 shell 内容还在。

## 已知取舍

音频同步是「同时启动」级别的：程序用单调时钟推进画面，先把播放器拉起来（默认等 180 ms）再开始计时。想更准就用 `--offset` 微调。

- [源码](https://github.com/ITyaolin/world-execute-me-mv)
- [作者](https://github.com/ITyaolin)