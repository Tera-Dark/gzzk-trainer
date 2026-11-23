# 广州真题训练台 · Agent 说明

广州中考七科历年真题的离线刷题应用（Web + PWA + Android APK）。
题库由 pipeline 从 `广州/` 的 docx 生成，前端是纯静态站，所有人数据存本地。

## 运行

```bash
cd app && npm install && npm run dev        # 开发服务器 5180
cd app && npm run build && cd .. && node serve.mjs 8080   # 本地成品
python pipeline/audit.py                    # 全量自检（只读，报告写 pipeline/audit-report.txt）
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
- `finalize.py` 会在写盘前做五件事，改抽取逻辑时要一起维持：①题干/材料里被填好的答案（`<u>百草丰茂</u>`、`流lián`）擦成下划线空位；②“正确的两项”这类多选题清掉 `answerKey` 并打 `multi`，前端改为看答案自评；③考点只保留 `RULES` 里定过的口径（`CANON`），解析里的口语化垃圾标签不进 `tags.json`；④题量明显少于同科最近三年中位数的卷子标 `incomplete`，前端只给练习、不给模考；⑤丢掉抽取残渣（行首是考场须知/答题卡说明、题干是解析原文、没有题干也没材料、选项不足两个），并在选项尾部清掉表格竖线和 `A. A B. B …` 答案对照行；⑥把粘进选项的整块「答案：/解析：」切出来还给解析，把被吞掉的其它选项（`\nE. …`、`\n4.  …`）拆成独立选项，同题后续小问还原到题干，选项里的表格/段落标签和空表格行清掉；⑦按整卷答案表（`26-30 BBCCA` 这类区间表、连续三题以上的 `41. C` 逐题块）校正选择题答案键，并从解析的【解答】里拆出参考答案（解析只留【分析】+【点评】）。被跳过的残卷连 JSON 文件一起删掉，避免留下索引查不到的孤儿题。多选题判定只用「正确的两项/三项、不定项」这类真题干措辞，不能再匹配「多选或涂改不清」这种考场说明。
- 三个版本号各管一件事：`APP_VERSION`（`content.ts`）是当前代码版本，每次发版都改；`bundle.json` 是热更新包版本，平时与 `APP_VERSION` 一致；`app/public/app-update.json` 是**最新 APK** 的版本，只在真的重新出了安装包时才改——热更新时把它改高会让用户去下不存在的 APK。顺序永远是：改代码 → 打 APK / 热更新包 → 传 release → 再 bump 这两个清单；先 bump 清单会让已装用户去下不存在的文件。
- 前端改动只进 `app/src/`；`dist/`、`app/android/app/src/main/assets/public/` 都是生成物。
- 不要删 `app/android/init-mirrors.gradle`：国内访问 Maven Central 会 403，靠它走阿里云镜像。
- 不要在仓库路径里直接跑 gradle，用 `C:/gzzk-build` 联接。
- 更新是给国内网络用的，别只留 GitHub。清单（`liveUpdate.ts` 的 `STATIC_FEEDS`、`content.ts` 的 `RELEASE_BASES`）并发读多条线路：GitHub Pages → jsDelivr 两个节点 → raw.githubusercontent → raw 套 GitHub 加速前缀；每条约 6 秒超时，取版本号最新的那份。热更新包本体在 `github.com/releases` → `objects.githubusercontent.com`，国内基本拿不到，所以 `downloadCandidates()` 会把清单里的 `urls`（`make-bundle.mjs` 写入直链 + `ghfast.top` + `gh-proxy.com`）逐条重试，成功的那条记进 `localStorage['gzzk.bundle.mirror']`，下次优先用。设置页的「更新源地址」(`settings.updateBase`) 填了就走国内对象存储，优先级最高——真要稳定，就把 `bundle.json` 和 zip 传一份到腾讯云 COS / 阿里云 OSS，再把这个地址填上，不用改代码。`make-bundle.mjs` 会把清单同时写到根目录和 `app/public/bundle.json`，Pages 那份才让 App 读得到。别只依赖 jsDelivr：它把 `@main` 解析到的 commit 缓存十几个小时，发完版仍会读到旧清单。
- 作答页的键盘/吸顶行为靠 `body` 上的 `typing`、`stemDock`、`stemClip` 三个类，由 `AnswerInput` 挂载和清理；改样式前先读懂 `styles.css` 的「竖屏作答」一节。
- 写作素材是手写内容，只改 `app/src/lib/writing.ts`（不要放进 `app/public/data`，会被 pipeline 覆盖）；每份材料是一个 `WritingDoc`，章节即页面上的卡片，`id` 要唯一且稳定。

## 更新机制（三层）

| 层 | 清单 | 用户看到什么 |
|---|---|---|
| 题库 | `data/version.json` | 顶部「有新内容 → 立即更新」，不重装 |
| App 版本 | `app-update.json` | 顶部「App 有新版本 → 去更新」，跳发布页 |
| 热更新 | 根 `bundle.json` | 后台下包，顶部「立即重启」生效，不重装 |

## 当前状态（2026-11-23）

- 2026-11-23 做过一轮体验评审 + 全流程回归，改动都在前端（`app/src/`）：多空题按题面顺序逐空对照、空数对不上转自评、无参考答案不再判「✗ 吻合度 0%」；缺答案键的选择题不再一律当多选（只有题干写明「正确的两项 / 不定项」才算）；「继续上次」存 `qid` 精确定位；模考加开始页 / 本地暂存 / 退出确认 / 继续上次；选择题点一下即判但给 6 秒撤销；重做错题走 `?qids=`；复习 / 考点 / 随机 / 整卷的「再来一轮」就地重开；首页 / 题库 / 路径 / 数据页题数统一按 `index.json` 汇总（1675），不再为计数拉 428KB `questions.json`；连续天数改按作答记录的天数算，与数据页同口径。
- Pages 站点在线，热更新通道已接通；题库 66 卷 1675 题可练（`index.json` 与 `questions.json` 口径一致，`version.json` 已同步到 `20261123-1`）。`english-2017` 只有 4 道题、2 条答案，`finalize.py` 已把整卷连同 JSON 文件一起清掉，不再剩孤儿题。
- `pipeline/audit.py` 是唯一的数据自检入口：结构、题目 id、答案泄露、选项、多选标记、上下文、考点口径、index/questions/tags 一致性、version.json、图片存在性、跨卷重复题干、异常字符、分值合计。报告按错误代码聚合，有 error 时退出码 1。最近一次结果：1 error（`version.json` 题数过期，已随 `20261122-1` 修掉）/ 45 warning / 1986 info。
- 更新链路已改成多线路：清单并发读 GitHub Pages、jsDelivr 双节点、raw.githubusercontent 及其加速前缀，包体在直链 / `ghfast.top` / `gh-proxy.com` 之间逐条重试，成功那条记进 `localStorage`；设置页可填国内对象存储地址。**已装的 v1.0.1 没有这套逻辑，改动只能靠重装新 APK 送达。**
- APK 代码版本已到 v1.0.2（`versionCode 3`），本轮只本地编译，还没传 release，所以 `bundle.json` 与 `app-update.json` 仍是 1.0.1。
- 未在真机验证过安装与更新全链路；APK 目前是 debug 签名。
- 2026-11-23 清过一轮内容层残渣（`finalize.py` 新增⑥⑦，未动 `app/public/data` 之外的东西）：157 道「没有任何答案」降到 81 道，73 道非选择题从解析的【解答】里补出了参考答案；选项里粘着的整块答案/解析、被吞掉的 E/F 选项、选项里的表格标签残渣都清掉了；整卷答案表校正了答案键（`english-2019` q30 的 key 与答案表吻合）；`english-2017` 孤儿卷删除。`pipeline/audit.py` 现在 0 error / 35 warning。
- 还剩这些问题（都要回到 `extract.py` 的表格/段落解析才能彻底解决，`finalize.py` 只能修形状）：`pipeline/audit.py` 报 18 道选择题没有 `answerKey`（前端降级为自评）、13 道 `blank` 带选项（按填空渲染）、4 道多小问题被判成选择题；81 道题源文件里确实没有答案、101 道没有解析；`english-2018` q40、`politics-2018-q13/q20`、`chemistry-2018-q11`/`chemistry-2023-q16` 的选项文本仍是错的（表格单元格被当成选项、`C、` 被当成选项字母吃掉）；6 道「选择两项」的题点一下就揭晓答案，没法先勾两项再判。
- 下一步候选：修上述数据问题（改 `finalize.py` 而非手改 JSON）、发 v1.0.2 release + 热更新、正式签名（keystore + assembleRelease）、真机回归。
