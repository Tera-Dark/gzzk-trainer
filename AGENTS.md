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
app/public/          生成物：data/ 题库 JSON、assets/ 图片、sw.js、两个清单
app/android/         Capacitor 原生工程
content/             publish.py 打出的内容包（git 忽略）
release/             本地 APK / 热更新包（git 忽略）
```

## 约定与红线

- **别手改 `app/public/data`**：题库只能由 pipeline 生成，否则下次重建就丢。
- 版本号三处要一致：`app/src/lib/content.ts` 的 `APP_VERSION`、`app/public/app-update.json`、根 `bundle.json`。
- 前端改动只进 `app/src/`；`dist/`、`app/android/app/src/main/assets/public/` 都是生成物。
- 不要删 `app/android/init-mirrors.gradle`：国内访问 Maven Central 会 403，靠它走阿里云镜像。
- 不要在仓库路径里直接跑 gradle，用 `C:/gzzk-build` 联接。
- 更新清单走 jsDelivr（`content.ts` 的 `RELEASE_BASE`、`liveUpdate.ts` 的 `BUNDLE_FEED`），因为 GitHub Pages 不返回 CORS 头。

## 更新机制（三层）

| 层 | 清单 | 用户看到什么 |
|---|---|---|
| 题库 | `data/version.json` | 顶部「有新内容 → 立即更新」，不重装 |
| App 版本 | `app-update.json` | 顶部「App 有新版本 → 去更新」，跳发布页 |
| 热更新 | 根 `bundle.json` | 后台下包，顶部「立即重启」生效，不重装 |

## 当前状态（2026-11-21）

- v1.0.0 已发布：APK 在 GitHub Release，Pages 站点在线，热更新通道已接通。
- 未在真机验证过安装与更新全链路；APK 目前是 debug 签名。
- 下一步候选：正式签名（keystore + assembleRelease）、真机回归、错题本/模考页视觉走查。
