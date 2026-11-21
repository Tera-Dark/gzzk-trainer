# 广州中考真题训练台

给要考广州中考的人用的本地刷题 App。把 `广州/` 里的七科历年真题（2017–2026）整理成能直接在手机 / 电脑上做的题库：逐题练习、整卷模考、错题循环复习、按考点补短板。

不需要注册、不联网也能用，所有做题记录都存在自己的设备上。

- 在线版：https://tera-dark.github.io/gzzk-trainer/
- 安卓安装包：https://github.com/Tera-Dark/gzzk-trainer/releases/latest
- 源码仓库：https://github.com/Tera-Dark/gzzk-trainer

## 快速开始

**电脑**：双击 `启动训练台.bat`（首次会自动安装依赖并构建），浏览器打开 `http://localhost:8080`。

**手机（同一 WiFi）**：先双击上面的 bat，再在手机浏览器输入窗口里打印的 `http://192.168.x.x:8080`，菜单里选「添加到主屏幕」。

**装成 App**：

- 安卓：装 Release 里的 APK；或浏览器里选「安装应用」；
- Windows / macOS：Chrome 地址栏右侧「安装」；
- iPhone：Safari 分享 →「添加到主屏幕」。

PWA 与 APK 都带离线缓存，装好后断网也能做题。

## 里面有什么

- **66 套真题 / 1707 道题**：语文、数学、英语、物理、化学、历史、道德与法治，每年一套，答案与详解已结构化。
- **逐题练习**：选择题点一下即判；填空/解答题支持打字对照、屏幕手写、纸笔计时，看完答案自评对 / 半对 / 错。
- **整卷模考**：按真实时长倒计时，交卷自动判选择题、主观题自评，给出估分与答题卡。
- **错题本 + 收藏**：做错、半对自动进入，重做对才移出。
- **间隔复习**：1 / 2 / 4 / 7 / 15 / 30 / 60 天。
- **学习路径**：按考点一关 8 题，正确率 80% 加一颗掌握星。
- **考点诊断**：标签来自解析原文的「本题考查……」，可按考点专项刷。
- **写作素材**：语文、英语作文的审题结构、素材库与范文；道法、历史小论文的论点论据与范文。
- **原卷图片**：扫描件卷子可整页看原卷与答案解析图。

## 更新机制

用户端会自动检查三层更新，看到顶部提示点一下即可：

| 层 | 判断依据 | 用户操作 |
|---|---|---|
| 题库内容 | `data/version.json` | 「有新内容 → 立即更新」，不重装 |
| App 版本 | `app-update.json` | 「App 有新版本 → 去更新」，跳发布页下载 |
| 热更新 | 根目录 `bundle.json` | 后台下包，「立即重启」生效，不重装 |

只有新增原生插件时才需要重新出 APK；改界面、加功能、换题库都走热更新。

## 目录结构

```
广州/                     原始真题 docx（不进 git）
pipeline/                 数据管线
  extract.py              docx -> markdown -> 结构化 JSON + 图片
  finalize.py             考点标签、全局索引、题库汇总
  wmf2png.ps1             Word 公式图（WMF/EMF）转 PNG（系统 GDI+）
  publish.py              打出 content/ 内容包（题库热更新用）
  make-bundle.mjs         打出热更新 zip 并更新 bundle.json
  make-icons.ps1          PWA 图标
  make-android-icons.ps1  Android 图标与启动图
app/                      前端
  src/                    React 源码（screens / components / lib）
  public/                 生成物：data/、assets/、sw.js、清单 JSON
  android/                Capacitor 原生工程
  dist/                   构建产物（serve.mjs 提供）
content/                  publish.py 生成的内容包
release/                  本地 APK / 热更新包
bundle.json               热更新清单（线上读这份）
serve.mjs                 零依赖静态服务器
启动训练台.bat            一键启动
```

## 开发

```bash
cd app && npm install
npm run dev          # 开发服务器 http://localhost:5180
npm run build        # 产出 app/dist
```

重新生成题库：

```bash
pip install python-docx pillow lxml
python pipeline/extract.py --force     # 全量约 15 分钟；也可 python pipeline/extract.py 数学 2024
python pipeline/finalize.py
cd app && npm run build
```

打包安卓（仓库路径含中文，gradle 必须在 ASCII 路径下跑，`C:\gzzk-build` 是指向本目录的联接）：

```bash
cd app && npx cap sync android
cd C:/gzzk-build/app/android
./gradlew.bat --init-script init-mirrors.gradle assembleDebug
```

`init-mirrors.gradle` 把 Maven 仓库换成阿里云镜像，国内网络访问 Maven Central 会返回 403。

发版：

```bash
# 只改题库/前端 → 热更新
cd app && npm run build
node pipeline/make-bundle.mjs 1.0.1 "修了错题本分页"
gh release create v1.0.1 release/gzzk-bundle-1.0.1.zip --title v1.0.1 --notes "…"
git add bundle.json && git commit -m "发布 v1.0.1" && git push

# 改了原生插件 → 重新出 APK（gradle 走 ASCII 联接）
cd app && npx cap sync android
cd C:/gzzk-build/app/android
./gradlew.bat --init-script init-mirrors.gradle assembleDebug
```

## 已知情况

- 题库是机器从 Word 抽取的，少数卷子个别题图片/选项缺失（App 会提示「请到答案解析图查看」），以 `广州/` 原始 docx 为准。
- 2017 英语、2019 英语源文件本身没有答案，已排除。
- 题型「解答题」按有无选项/填空线判断，个别标注可能与原卷不一致，不影响做题。
- APK 目前用 debug 签名，安装时会提示「未知来源」。

## 当前状态（2026-11-21）

- v1.0.0 已发布：GitHub Release 有 APK，Pages 站点在线，热更新通道打通。
- 网页版已上线竖屏作答改造和「写作素材」板块；APK 里还是 v1.0.0 的版本，需要发一次热更新才能同步。
- 尚未在真机上跑通「安装 → 收更新 → 重启生效」全链路。
