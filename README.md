# 广州中考真题训练台

给要考广州中考的人用的本地刷题 App。把 `广州/` 里的七科历年真题（2017–2026）整理成能直接在手机 / 电脑上做的题库：逐题练习、整卷模考、错题循环复习、按考点补短板。

不需要注册、不联网也能用，所有做题记录都存在自己的设备上。

## 怎么打开

**Windows 电脑**

双击 `启动训练台.bat`，浏览器会自动打开 `http://localhost:8080`。

**手机（同一个 WiFi）**

1. 先在电脑上双击 `启动训练台.bat`；
2. 看窗口里打印的「手机打开」地址（形如 `http://192.168.x.x:8080`），在手机浏览器里输入；
3. 手机浏览器菜单里选「添加到主屏幕」，之后像 App 一样从桌面打开。

## 装成 App（PWA）

这个项目已经带 PWA 支持，可以像原生 App 一样装到桌面上，断网也能做题：

- **安卓 / 手机浏览器**：打开网址 → 菜单里选「安装应用」或「添加到主屏幕」；
- **Windows / macOS / Chrome**：地址栏右侧出现「安装」图标，点一下就有独立窗口，任务栏里和普通软件一样；
- **iPhone / Safari**：分享 → 「添加到主屏幕」。

装好之后有图标、全屏无地址栏、离线可用；打开时如果题库有新版本，页面顶部会出现「有新内容」的提示条，点「立即更新」就能拉到最新一卷。

## 内容更新推送

题库和 App 是分开的：

1. 改完题库后运行 `python pipeline/publish.py`，会在根目录生成 `content/` 内容包（含 `version.json` 与文件哈希清单）；
2. 把 `content/` 整个目录丢到任意静态托管（GitHub Pages、对象存储、自己的服务器）；
3. 用户端在「我的 → 内容更新」里填这个地址，之后每次打开会自动比对版本号，有新版本就在顶部弹提示。

留空则跟随 App 自身发布：重新构建部署后，用户端同样会自动收到「有新内容」的提醒。

## 里面有什么

- **66 套真题 / 1707 道题**：语文、数学、英语、物理、化学、历史、道德与法治；每年一套，解析卷里面的答案与详解都已结构化。
- **逐题练习**：选择题点一下就判对错，填空/解答题看完答案后自己打分（对 / 半对 / 错）。
- **整卷模考**：按真实时长倒计时，交卷后选择题自动判分，主观题自评，最后给出估分和答题卡。
- **错题本**：做错、半对的题自动进来；重做对了才移出。
- **间隔复习**：每题按 1 / 2 / 4 / 7 / 15 / 30 / 60 天的节奏回到「今日复习」。
- **考点诊断**：每道题都打了考点标签（由解析原文里的「本题考查……」+ 各科考点关键词得出），可以按考点专项刷，也能看到自己哪些考点错得多。
- **原卷图片**：扫描件版本的卷子（如 2018 物理、2020 化学部分）可以整页看原卷和答案解析图。

## 已知情况

- 数据是机器从 Word 真题里抽取的，少数卷子有个别题图片/选项缺失（App 里会显示「请到答案解析图查看」）；需要原卷时以 `广州/` 里的原始 docx 为准。
- 2017 英语、2019 英语两套卷的源文件本身没有答案，已从题库里排除。
- 题型里的「解答题」是机器按有无选项、有无填空线判断的，个别题目的"选择/填空"标注可能与原卷不一致，不影响做题和看解析。

## 发版 / 推送更新

用户手里的 App 会自动检查两种更新，看到提示点一下就行：

**① 题库更新（不用重新装 App）**

```bash
python pipeline/extract.py 数学 2024   # 只重抽某一套")  # 或全量
python pipeline/finalize.py
python pipeline/publish.py --notes "新增 2026 二模"
cd app && npm run build && npx cap sync android   # 重新打包时才需要
```

把 `content/` 传到静态托管，或在 App「我的 → 内容更新」里填地址；用户下次打开就会看到「有新内容」。

**② App 版本更新（改了界面/功能）**

1. 改 `app/src/lib/content.ts` 里的 `APP_VERSION`（如 `1.0.1`）；
2. 改 `app/public/app-update.json` 的 `version` 与 `notes`；
3. 构建安装包：

```bash
cd app
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
```

4. 把 `app/android/app/build/outputs/apk/debug/app-debug.apk` 传到 GitHub Release，
   并把 `app-update.json` 里的 `url` 指向那个 Release；
5. 推送 `main`，Pages 会同步更新；用户端顶部会出现「App 有新版本 → 去更新」。

## 目录结构

```
广州/                     原始真题 docx（不动）
pipeline/                 数据管线
  extract.py              docx -> markdown -> 结构化 JSON + 图片资源
  wmf2png.ps1             Word 公式图（WMF/EMF）转 PNG（用系统 GDI+，无需装软件）
  finalize.py             考点标签、全局题目索引、题库汇总
app/                      前端（Vite + React + TypeScript + KaTeX）
  public/data/            生成的题库 JSON
  public/assets/          生成的题目图片（webp）
  dist/                   构建产物（由 serve.mjs 提供）
serve.mjs                 零依赖静态服务器
启动训练台.bat            一键启动
```

## 重新生成题库（改了管线或加了新卷子时）

```bash
pip install python-docx pillow lxml      # 依赖
python pipeline/extract.py --force       # 重新抽取（全量约 15 分钟）
python pipeline/finalize.py              # 打考点标签 + 重建索引
cd app && npm install && npm run build   # 重新构建前端
```

也可以只跑某一科某一年做调试：`python pipeline/extract.py 数学 2024`。
