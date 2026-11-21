"""把题库打成可推送的内容包。

用法：
  python pipeline/publish.py                 # 打一个新版本（写在项目根 content/）
  python pipeline/publish.py --notes "新增 2026 二模" --bump-minor
  python pipeline/publish.py --no-assets     # 只发 JSON（图片没变时更快）

产物：
  content/data/*.json        题库数据
  content/data/version.json  版本号（App 靠它判断有没有新版）
  content/manifest.json      文件清单 + 哈希

本地更新：重新 build 后刷新页面即可。
远程推送：把 content/ 整个目录传到任意静态托管，然后在 App「我的 → 内容更新」里填地址。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "app" / "public" / "data"
ASSETS = ROOT / "app" / "public" / "assets"
OUT = ROOT / "content"


def sha1(path: Path) -> str:
    h = hashlib.sha1()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()[:12]


def next_version(bump_assets: bool, bump_minor: bool) -> str:
    today = datetime.now().strftime("%Y%m%d")
    old = {}
    vf = DATA / "version.json"
    if vf.exists():
        try:
            old = json.loads(vf.read_text(encoding="utf-8"))
        except Exception:
            old = {}
    prev = str(old.get("version") or "")
    if bump_minor and prev.startswith(today + "-"):
        n = int(prev.split("-")[1]) + 1
    elif prev.startswith(today + "-"):
        n = int(prev.split("-")[1]) + 1
    else:
        n = 1
    return f"{today}-{n}"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--notes", default="", help="更新说明，显示在 App 的更新提示里")
    ap.add_argument("--no-assets", action="store_true", help="不复制图片，只更新题库 JSON")
    ap.add_argument("--out", default=str(OUT), help="输出目录")
    args = ap.parse_args()

    if not (DATA / "index.json").exists():
        raise SystemExit("找不到 app/public/data/index.json，请先跑 extract.py + finalize.py")

    index = json.loads((DATA / "index.json").read_text(encoding="utf-8"))
    questions = json.loads((DATA / "questions.json").read_text(encoding="utf-8"))
    version = next_version(True, True)

    meta = {
        "version": version,
        "builtAt": datetime.now().isoformat(timespec="seconds"),
        "notes": args.notes,
        "papers": len(index.get("papers", [])),
        "questions": len(questions.get("questions", [])),
    }
    (DATA / "version.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")

    out = Path(args.out)
    out_data = out / "data"
    out_data.mkdir(parents=True, exist_ok=True)

    files: dict[str, dict] = {}
    for f in sorted(DATA.glob("*.json")):
        shutil.copy2(f, out_data / f.name)
        files[f"data/{f.name}"] = {"rev": sha1(f), "size": f.stat().st_size}

    if not args.no_assets and ASSETS.exists():
        out_assets = out / "assets"
        for f in ASSETS.rglob("*"):
            if not f.is_file():
                continue
            rel = f.relative_to(ASSETS)
            dst = out_assets / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            if not dst.exists() or dst.stat().st_size != f.stat().st_size:
                shutil.copy2(f, dst)
            files[f"assets/{rel.as_posix()}"] = {"rev": sha1(f), "size": f.stat().st_size}

    manifest = {**meta, "schema": 1, "files": files}
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")

    total = sum(v["size"] for v in files.values())
    print(f"版本 {version} · {meta['papers']} 套卷 / {meta['questions']} 题")
    print(f"输出目录 {out}  ({total / 1e6:.1f} MB, {len(files)} 个文件)")
    print("\n本地：npm run build 后刷新页面，App 会自动提示新版本")
    print("远程：把 content/ 上传到静态托管（GitHub Pages / OSS / 自建服务器都行），")
    print("      启动 serve.mjs 时也可直接用 http://<本机IP>:8080/content/")
    if (out_data / "version.json").exists():
        print(f"      内容源地址示例：http://192.168.0.102:8080/content/")


if __name__ == "__main__":
    main()
