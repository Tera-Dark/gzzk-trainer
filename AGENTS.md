# 广州真题训练台 · Agent 说明

广州中考七科历年真题的离线刷题应用（Web + PWA + Android APK）。
题库由 pipeline 从 `广州/` 的 docx 生成，前端是纯静态站，所有人数据存本地。

## 运行

```bash
cd app && npm install && npm run dev        # 开发服务器 5180
cd app && npm run build && cd .. && node serve.mjs 8080   # 本地成品
```

Android 构建（**必须走 ASCII 路径**，仓库路径含中文会被 AGP 拒绝）：

```bash
cd app && npx cap sync android
cd C:/gzzk-build/app/android   # 目录联接，指向本仓库
./gradlew.bat --init-script init-mirrors.gradle assembleDebug
```

产物：`C:/gzzk-build/app/android/app/build/outputs/apk/debug/app-debug.apk`

## 技术栈

React 18 + TypeScript + Vite + KaTeX + marked；Capacitor 6 + Live Update 做原生壳与热更新。

## 目录

```
广州/                原始真题 docx（不改，git 忽略）
pipeline/            extract.py / finalize.py / publish.py / make-bundle.mjs / 图标脚本
app/src/             前端源码（唯一的代码入口）
app/src/lib/writing.ts   写作素材内容（语文/英语作文、道法/历史小论文）
app/src/screens/Writing.tsx  写作素材总览与详情页（路由 /writing）
app/public/          生成物：data/ 题库 JSON、assets/ 图片、sw.js、两个清单
app/android/         Capacitor 原生工程
content/             publish.py 打出的内容包（git 忽略）
release/             本地 APK / 热更新包（git 忽略）
```

## 约定与红线

- **别手改 `app/public/data`**：题库只能由 pipeline 生成，否则下次重建就丢。
- 三个版本号各管一件事：`APP_VERSION`（`content.ts`）是当前代码版本，每次发版都改；`bundle.json` 是热更新包版本，与 `APP_VERSION` 一致；`app/public/app-update.json` 是**最新 APK** 的版本，只在真的重新出了安装包时才改——热更新时把它改高会让用户去下不存在的 APK。
- 前端改动只进 `app/src/`；`dist/`、`app/android/app/src/main/assets/public/` 都是生成物。
- 不要删 `app/android/init-mirrors.gradle`：国内访问 Maven Central 会 403，靠它走阿里云镜像。
- 不要在仓库路径里直接跑 gradle，用 `C:/gzzk-build` 联接。
- 热更新清单有三个源（`liveUpdate.ts` 的 `BUNDLE_FEEDS`）：GitHub Pages（首选，600 秒缓存）→ jsDelivr（兜底）→ raw.githubusercontent（兜底）。`make-bundle.mjs` 会把清单同时写到根目录和 `app/public/bundle.json`，Pages 那份才让 App 读得到。别只依赖 jsDelivr：它把 `@main` 解析到的 commit 缓存十几个小时，发完版仍会读到旧清单。`content.ts` 的 `RELEASE_BASES`（APK 清单）同样 Pages 优先、jsDelivr 兜底。
- 作答页的键盘/吸顶行为靠 `body` 上的 `typing`、`stemDock`、`stemClip` 三个类，由 `AnswerInput` 挂载和清理；改样式前先读懂 `styles.css` 的「竖屏作答」一节。
- 写作素材是手写内容，只改 `app/src/lib/writing.ts`（不要放进 `app/public/data`，会被 pipeline 覆盖）；每份材料是一个 `WritingDoc`，章节即页面上的卡片，`id` 要唯一且稳定。

## 更新机制（三层）

| 层 | 清单 | 用户看到什么 |
|---|---|---|
| 题库 | `data/version.json` | 顶部「有新内容 → 立即更新」，不重装 |
| App 版本 | `app-update.json` | 顶部「App 有新版本 → 去更新」，跳发布页 |
| 热更新 | 根 `bundle.json` | 后台下包，顶部「立即重启」生效，不重装 |

## 当前状态（2026-11-21）

- v1.0.0 已发布：APK 在 GitHub Release，Pages 站点在线，热更新通道已接通。
- 网页版已包含竖屏作答改造（`953a2cc`）与写作素材板块（`38ccbec`）；APK 仍是 v1.0.0，需发 v1.0.1 热更新才能同步给已安装用户。
- 未在真机验证过安装与更新全链路；APK 目前是 debug 签名。
- 下一步候选：发 v1.0.1 热更新、正式签名（keystore + assembleRelease）、真机回归、错题本/模考页视觉走查。
