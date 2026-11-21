#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""广州中考真题 -> 结构化题库

管线：docx --(pandoc/gfm)--> markdown(+媒体) --(GDI+ 转 WMF)--> webp 资源
      -> 题目/选项/答案/解析/阅读材料 结构化 -> data/*.json

设计要点
  * 同一年的「空白卷（原卷）」提供题干，「解析卷」提供答案与解析，双卷合并；
    解析卷本身题干完整时就用解析卷。
  * 图片以内容哈希命名，题干图和解析图重复时自动去重。
  * 公式：OMML 由 pandoc 转成 LaTeX（$...$），WMF 图片公式转为 PNG 并保留原始显示尺寸。

用法:
    python pipeline/extract.py                 # 全量
    python pipeline/extract.py 数学             # 单科
    python pipeline/extract.py 数学 2024        # 单科单年
    python pipeline/extract.py --force         # 忽略缓存重新转换
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "广州"
OUT_DATA = ROOT / "app" / "public" / "data"
OUT_ASSETS = ROOT / "app" / "public" / "assets"
WORK = Path(tempfile.gettempdir()) / "gzzk_work"
FORCE = False

SUBJECTS = {
    "数学": ("math", "数学", "#3b82f6"),
    "物理": ("physics", "物理", "#8b5cf6"),
    "化学": ("chemistry", "化学", "#10b981"),
    "语文": ("chinese", "语文", "#ef4444"),
    "英语": ("english", "英语", "#f59e0b"),
    "历史": ("history", "历史", "#a16207"),
    "政治": ("politics", "道德与法治", "#ec4899"),
}

# 现行卷制：满分, 考试用时(分钟)
DEFAULTS = {
    "math": (120, 120),
    "physics": (90, 60),
    "chemistry": (90, 60),
    "chinese": (120, 120),
    "english": (90, 100),
    "history": (90, 60),
    "politics": (90, 60),
}

ANSWER_HEAD = re.compile(
    r"^\**[^【】]{0,12}?(参考答案|答案和解析|答案及解析|答案解析|试题解析|答案)(\s*部分)?\**$"
)
QNUM = re.compile(r"^(\d{1,2})\s*\\?[.．、]\s*(.*)$")
SECTION = re.compile(r"^\**[^【】]{0,6}?(第[一二三四]部分|[一二三四五六七八九十]+\s*[、.．])")
SUBQ = re.compile(r"[（(]\s*[1-9]\s*[)）]|[①②③④⑤⑥⑦⑧⑨]")
MARK_RE = re.compile(
    r"【(答案|解答|解析|分析|详解|点评|导语|点睛|考点|小问\d详解|\d+题详解|小题\d详解)】"
)
MATERIAL_START = re.compile(
    r"^(阅读下面|阅读以下|阅读材料|阅读语段|阅读下面文字|阅读下面的|材料[一二三四五][:：]?\s*$|【材料|阅读《|阅读短文)"
)
BLOCK_TAG = re.compile(r"(</?(?:td|th|tr|p|blockquote|li|div|table|tbody|thead|colgroup|col)(?=[\s>/])[^>]*>)", re.I)


def run(cmd: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")


# ------------------------------------------------------------------ discovery
@dataclass
class PaperSet:
    subject_cn: str
    subject: str
    subject_name: str
    color: str
    year: int
    blank: Path | None = None
    answer: Path | None = None

    @property
    def pid(self) -> str:
        return f"{self.subject}-{self.year}"

    @property
    def score_duration(self) -> tuple[float, int]:
        return DEFAULTS[self.subject]


def discover(fs: str | None = None, fy: int | None = None) -> list[PaperSet]:
    sets: dict[tuple[str, int], PaperSet] = {}
    for d in sorted(SRC.iterdir()):
        if not d.is_dir():
            continue
        name = d.name.replace("广州市中考", "")
        if name not in SUBJECTS:
            continue
        code, cn, color = SUBJECTS[name]
        if fs and fs not in (name, code):
            continue
        for f in sorted(d.glob("*.docx")):
            if f.name.startswith("~$"):
                continue
            m = re.search(r"(20\d\d)", f.name)
            if not m:
                continue
            year = int(m.group(1))
            if fy and year != fy:
                continue
            ps = sets.setdefault((code, year), PaperSet(name, code, cn, color, year))
            is_answer = "解析" in f.name or "答案" in f.name
            if is_answer:
                if ps.answer is None or "解析" in f.name:
                    ps.answer = f
            else:
                if ps.blank is None or "原卷" in f.name:
                    ps.blank = f
    return sorted(sets.values(), key=lambda p: (p.subject, p.year))


# ------------------------------------------------------------------ docx internals
NS = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "v": "urn:schemas-microsoft-com:vml",
    "wp": "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
}


def image_extents(docx_path: Path) -> dict[str, tuple[float, float]]:
    """docx 中每张图片的显示尺寸（英寸），key = 媒体文件名"""
    import zipfile

    from lxml import etree

    sizes: dict[str, tuple[float, float]] = {}
    try:
        with zipfile.ZipFile(docx_path) as z:
            xml = z.read("word/document.xml")
            rels = etree.fromstring(z.read("word/_rels/document.xml.rels"))
    except Exception:
        return sizes
    rmap = {}
    for rel in rels:
        rmap[rel.get("Id")] = os.path.basename(rel.get("Target", "") or "")
    root = etree.fromstring(xml)
    body = root.find("w:body", NS)
    if body is None:
        return sizes
    for el in body.iter():
        tag = etree.QName(el).localname
        if tag in ("inline", "anchor"):
            ext = el.find("wp:extent", NS)
            blip = el.find(".//a:blip", NS)
            if ext is None or blip is None:
                continue
            rid = blip.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed")
            fn = rmap.get(rid)
            if not fn or fn in sizes:
                continue
            try:
                sizes[fn] = (int(ext.get("cx")) / 914400, int(ext.get("cy")) / 914400)
            except Exception:
                pass
        elif tag == "shape":
            imagedata = el.find("v:imagedata", NS)
            if imagedata is None:
                continue
            rid = imagedata.get("{urn:schemas-microsoft-com:office:office}relid") or imagedata.get(
                "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
            )
            fn = rmap.get(rid)
            if not fn or fn in sizes:
                continue
            style = el.get("style", "")
            mw = re.search(r"width:([\d.]+)(pt|in|cm)", style)
            mh = re.search(r"height:([\d.]+)(pt|in|cm)", style)
            if not mw or not mh:
                continue

            def to_in(v: str, unit: str) -> float:
                v = float(v)
                return v / 72 if unit == "pt" else v / 2.54 if unit == "cm" else v

            sizes[fn] = (to_in(mw.group(1), mw.group(2)), to_in(mh.group(1), mh.group(2)))
    return sizes


# ------------------------------------------------------------------ images
def convert_metafiles(dirpath: Path) -> None:
    ps = ROOT / "pipeline" / "wmf2png.ps1"
    run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(ps), "-Dir", str(dirpath), "-Scale", "2"])


def optimize_image(src: Path, dst: Path, is_meta: bool, max_w: int = 1200) -> tuple[int, int]:
    from PIL import Image

    im = Image.open(src)
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, (255, 255, 255))
        bg.paste(im, mask=im.split()[-1])
        im = bg
    else:
        im = im.convert("RGB")
    if is_meta:
        box = im.convert("L").point(lambda p: 0 if p > 246 else 255).getbbox()
        if box:
            pad = 2
            box = (
                max(0, box[0] - pad),
                max(0, box[1] - pad),
                min(im.width, box[2] + pad),
                min(im.height, box[3] + pad),
            )
            if box[2] > box[0] and box[3] > box[1]:
                im = im.crop(box)
    if im.width > max_w:
        im = im.resize((max_w, max(1, round(im.height * max_w / im.width))), Image.LANCZOS)
    dst.parent.mkdir(parents=True, exist_ok=True)
    im.save(dst, "WEBP", quality=88, method=4)
    return im.size


def handle_images(media_dir: Path, asset_dir: Path, extents: dict[str, tuple[float, float]]) -> dict[str, dict]:
    convert_metafiles(media_dir)
    info: dict[str, dict] = {}
    hashes: dict[str, str] = {}
    for f in sorted(media_dir.iterdir()):
        if not f.is_file() or f.suffix.lower() not in (".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp"):
            continue
        stem = f.stem
        try:
            digest = hashlib.sha1(f.read_bytes()[:400000]).hexdigest()[:12]
        except Exception:
            digest = hashlib.sha1(stem.encode()).hexdigest()[:12]
        name = hashes.setdefault(digest, f"{digest}.webp")
        dst = asset_dir / name
        try:
            if FORCE or not dst.exists():
                w, h = optimize_image(f, dst, is_meta=FALSE_META)
            else:
                from PIL import Image

                with Image.open(dst) as im:
                    w, h = im.size
        except Exception as e:
            print(f"    ! image fail {f.name}: {e}")
            continue
        origin = None
        for cand in (f"{stem}.wmf", f"{stem}.emf", f"{stem}.png", f"{stem}.jpg", f"{stem}.jpeg"):
            if cand in extents:
                origin = extents[cand]
                break
        info[stem] = {"file": name, "w": w, "h": h, "disp": origin, "meta": False}
    return info


FALSE_META = True  # 统一裁白边（对公式图有效，对插图影响也不大）


# ------------------------------------------------------------------ markdown prep
def normalize_md(md: str, work: Path) -> str:
    md = re.sub(r"\$`([^`]*)`\$", lambda m: f"${m.group(1)}$", md)
    md = md.replace("\\$", "$")
    md = re.sub(r'[^"\s()]*[/\\]media/', "media/", md)
    md = md.replace("media/media/", "media/")
    return md


# ------------------------------------------------------------------ parsing helpers
def clean_lines(md: str) -> list[str]:
    """按行整理：去掉引用前缀，块级标签单独成行，表格内部不留空行（保证表格整体渲染）"""
    raw_lines: list[str] = []
    for raw in md.split("\n"):
        line = re.sub(r"^\s*(>\s?)+", "", raw.rstrip())
        if re.search(r"<(td|th|tr|p|blockquote|li|div|table|tbody|thead|col)\b", line, re.I):
            for piece in BLOCK_TAG.split(line):
                for sub in piece.split("\n"):
                    raw_lines.append(sub)
        else:
            raw_lines.append(line)

    out: list[str] = []
    in_table = False
    for piece in raw_lines:
        s2 = piece.strip()
        if "<table" in s2.lower():
            in_table = True
        if not s2:
            if in_table:
                continue
            out.append("")
            continue
        out.append(piece)
        if "</table>" in s2.lower():
            in_table = False
    return out


def strip_emphasis(s: str) -> str:
    return re.sub(r"[\\*]", "", s).strip()


def is_section_header(s: str) -> bool:
    s2 = s.strip().strip("*").strip()
    if not s2 or len(s2) > 90:
        return False
    if QNUM.match(s2):
        return False
    if re.match(r"^第[一二三四]部分", s2):
        return True
    if re.match(r"^[一二三四五六七八九十]+\s*[、.．]", s2):
        return True
    if re.match(r"^[（(][一二三四五六七八九十]+[)）]", s2) and re.search(r"分", s2):
        return True
    if re.match(r"^附加题", s2):
        return True
    return False


def parse_numbers(lines: list[str], start_at: int = 0, any_start: bool = False) -> list[tuple[int, int]]:
    found: list[tuple[int, int]] = []
    expect = 1
    if any_start:
        for i in range(start_at, len(lines)):
            m = QNUM.match(lines[i].strip())
            if m:
                expect = int(m.group(1))
                break
    for i in range(start_at, len(lines)):
        m = QNUM.match(lines[i].strip())
        if not m:
            continue
        no = int(m.group(1))
        if no < expect or no > expect + 3:
            continue
        found.append((i, no))
        expect = no + 1
    return found


@dataclass
class Block:
    no: int
    section: str
    lines: list[str] = field(default_factory=list)

    @property
    def text(self) -> str:
        return "\n".join(self.lines).strip()


def split_blocks(lines: list[str], any_start: bool = False) -> tuple[list[Block], list[str]]:
    blocks: list[Block] = []
    nums = parse_numbers(lines, any_start=any_start)
    if not nums:
        return blocks, lines
    section = ""
    for line in lines[: nums[0][0]]:
        if is_section_header(line):
            section = line.strip().strip("*").strip()
    preamble = lines[: nums[0][0]]
    for idx, (i, no) in enumerate(nums):
        end = nums[idx + 1][0] if idx + 1 < len(nums) else len(lines)
        body = lines[i:end]
        m = QNUM.match(body[0].strip())
        body = [m.group(2) if m else body[0]] + body[1:]
        blocks.append(Block(no, section, body))
        for line in body:
            if is_section_header(line):
                section = line.strip().strip("*").strip()
                blocks[-1].section = section if blocks[-1].section == "" else blocks[-1].section
    return blocks, preamble


def split_answer(body: str) -> tuple[str, str, str]:
    """(题干, 答案, 解析)"""
    ms = list(MARK_RE.finditer(body))
    if not ms:
        return body.strip(), "", ""
    stem = body[: ms[0].start()].strip()
    segs = []
    for k, m in enumerate(ms):
        end = ms[k + 1].start() if k + 1 < len(ms) else len(body)
        segs.append((m.group(1), body[m.end() : end].strip()))
    ans_parts = [t for k, t in segs if k == "答案" and t]
    answer = "\n".join(ans_parts).strip()
    analysis = "\n\n".join(f"【{k}】{t}" for k, t in segs if k != "答案" and t).strip()
    if not answer:
        flat = strip_emphasis(body).replace("$", "")
        m = re.search(r"选\s*[:：]?\s*([A-D])(?![A-Za-z一-鿿])", flat) or re.search(
            r"故答案为\s*[:：]?\s*([A-D])(?![A-Za-z一-鿿])", flat
        )
        if m:
            answer = m.group(1)
    return stem, answer, analysis


def split_material(text: str) -> tuple[str, str | None]:
    if not text:
        return text, None
    lines = text.split("\n")
    cut = None
    for i, line in enumerate(lines):
        s2 = line.strip().strip("*").strip()
        if not s2:
            continue
        if is_section_header(s2) or MATERIAL_START.match(s2):
            cut = i
    if cut is None:
        return text.strip(), None
    tail = "\n".join(lines[cut:]).strip()
    if len(strip_emphasis(tail)) < 50:
        return text.strip(), None
    return "\n".join(lines[:cut]).strip(), tail


def split_options(stem: str, letters: str = "ABCD") -> tuple[str, list[dict]]:
    opt_re = re.compile(r"(?<![A-Za-z0-9])([" + letters + r"])\s*[.．、]\s?")
    marks: list[tuple[int, int, str]] = []
    expect = letters[0]
    for m in opt_re.finditer(stem):
        if m.group(1) != expect:
            continue
        marks.append((m.start(), m.end(), m.group(1)))
        idx = letters.index(expect) + 1
        if idx >= len(letters):
            break
        expect = letters[idx]
    if len(marks) < 4:
        return stem.strip(), []
    head = stem[: marks[0][0]].strip()
    options = []
    for k, (start, cstart, lab) in enumerate(marks):
        end = marks[k + 1][0] if k + 1 < len(marks) else len(stem)
        txt = re.sub(r"[\s\\]+$", "", stem[cstart:end].strip())
        options.append({"k": lab, "md": txt})
    return head, options


def answer_letter(ans: str, letters: str = "ABCD") -> str | None:
    t = strip_emphasis(ans).replace("$", "").strip()
    m = re.match(r"^[（(]?([" + letters + r"])[)）]?\s*[。.]?$", t)
    if m:
        return m.group(1)
    m = re.search(r"(?:答案|正确答案)\s*[:：]?\s*([" + letters + r"])(?![A-Za-z])", t)
    if m:
        return m.group(1)
    m = re.match(r"^([" + letters + r"])(?![A-Za-z\u4e00-\u9fff])", t)
    if m:
        return m.group(1)
    return None


def classify(stem: str, options: list[dict], answer: str, analysis: str) -> str:
    if options:
        return "choice"
    if re.search(r"_{3,}|＿{2,}|<u>[\s\u3000]*</u>", stem):
        return "blank"
    if SUBQ.search(stem) or len(strip_emphasis(answer)) > 30 or len(strip_emphasis(analysis)) > 260:
        return "long"
    return "blank"


def parse_score(section: str) -> float | None:
    s2 = section.replace("*", "")
    m = re.search(r"共\s*(\d+(?:\.\d+)?)\s*分", s2)
    n = re.search(r"共\s*(\d+)\s*(?:小)?题", s2)
    if m and n and int(n.group(1)) > 0:
        return round(float(m.group(1)) / int(n.group(1)), 1)
    return None


ANS_PAIR = re.compile(r"(?<![\d.])(\d{1,2})\s*[.．、]\s*([A-E])(?![A-Za-z\u4e00-\u9fff])")


def segments(text: str) -> list[tuple[str, str]]:
    ms = list(MARK_RE.finditer(text))
    out = []
    for k, m in enumerate(ms):
        end = ms[k + 1].start() if k + 1 < len(ms) else len(text)
        out.append((m.group(1), text[m.end() : end].strip()))
    return out


def harvest(lines: list[str]) -> dict[int, dict]:
    """按题号分发答案与逐题详解（英语等"分组答案"版式）"""
    full = "\n".join(lines)
    out: dict[int, dict] = {}
    cur_q = None
    for kind, txt in segments(full):
        if re.fullmatch(r"\d+题详解", kind):
            cur_q = int(re.match(r"(\d+)", kind).group(1))
            out.setdefault(cur_q, {}).setdefault("analysis", txt)
            continue
        if re.fullmatch(r"(小问|小题)\d+详解", kind):
            if cur_q is not None:
                prev = out.get(cur_q, {}).get("analysis", "")
                out.setdefault(cur_q, {})["analysis"] = (prev + "\n\n【" + kind + "】" + txt).strip()
            continue
        cur_q = None
        if kind == "答案":
            for m in ANS_PAIR.finditer(txt):
                out.setdefault(int(m.group(1)), {}).setdefault("answer", m.group(2))
    for m in re.finditer(r"(\d{1,2})\s*[-–—~至]\s*(\d{1,2})\s*[，,、:：；;\s]\s*([A-E]{2,})", full):
        a, b, keys = int(m.group(1)), int(m.group(2)), m.group(3)
        if b - a + 1 != len(keys):
            continue
        for k, ch in enumerate(keys):
            out.setdefault(a + k, {}).setdefault("answer", ch)
    return out


# ------------------------------------------------------------------ image rewriting
def rewrite_images(md: str, imgmap: dict[str, dict], prefix: str) -> tuple[str, list[dict]]:
    used: list[dict] = []

    def repl(m: re.Match) -> str:
        info = imgmap.get(Path(m.group(1)).stem)
        if not info:
            return ""
        used.append(info)
        return f"{prefix}{info['file']}"

    md = re.sub(
        r"(?:\./)?media/([A-Za-z0-9_\-.]+\.(?:png|wmf|emf|jpg|jpeg|gif|bmp))",
        repl,
        md,
    )
    uniq, seen = [], set()
    for u in used:
        if u["file"] in seen:
            continue
        seen.add(u["file"])
        uniq.append(u)
    return md, uniq


def img_html(md: str, info_by_file: dict[str, dict]) -> str:
    def repl(m: re.Match) -> str:
        alt, path = m.group(1) or "", m.group(2)
        if len(alt) > 20:
            alt = ""
        info = info_by_file.get(Path(path).name)
        if not info:
            return ""
        disp = info.get("disp")
        style = ""
        if disp:
            w_in, h_in = disp
            h_pt = h_in * 72
            if h_pt <= 46 and w_in <= 3.4:
                style = f' class="eq" style="height:{h_pt / 10.5:.2f}em"'
            else:
                style = f' style="max-width:{min(100, max(20, w_in * 34)):.0f}%"'
        return f'<img src="{path}" alt="{alt}"{style} loading="lazy" />'

    return re.sub(r"!\[([^\]]*)\]\(([^)\s]+)\)", repl, md)


# ------------------------------------------------------------------ document prep
@dataclass
class Doc:
    path: Path
    lines: list[str]
    imgmap: dict[str, dict]
    by_file: dict[str, dict]
    prefix: str


def prepare(path: Path, pid: str, tag: str, asset_dir: Path) -> Doc:
    work = WORK / f"{pid}-{tag}"
    md_path = work / "paper.md"
    if FORCE and work.exists():
        shutil.rmtree(work)
    work.mkdir(parents=True, exist_ok=True)
    if not md_path.exists() or md_path.stat().st_mtime < path.stat().st_mtime:
        (work / "m").mkdir(exist_ok=True)
        r = run(
            [
                "pandoc",
                str(path),
                "-t",
                "gfm",
                "--wrap=none",
                "--extract-media=" + str(work / "m"),
                "-o",
                str(md_path),
            ]
        )
        if r.returncode != 0 or not md_path.exists():
            raise RuntimeError(f"pandoc failed: {r.stderr[:300]}")
    md = normalize_md(md_path.read_text(encoding="utf-8", errors="replace"), work)
    media_dir = work / "m" / "media"
    imgmap = handle_images(media_dir, asset_dir, image_extents(path)) if media_dir.exists() else {}
    by_file = {v["file"]: v for v in imgmap.values()}
    return Doc(path, clean_lines(md), imgmap, by_file, f"papers/{pid}/")


# ------------------------------------------------------------------ paper building
def parse_questions(doc: Doc, subject: str) -> tuple[list[dict], list[dict], list[str], bool]:
    """返回 (questions, contexts, preamble, 解析卷是否缺题干)"""
    lines = doc.lines
    ans_idx = None
    for i, line in enumerate(lines):
        s2 = line.strip().strip("*")
        if ANSWER_HEAD.match(s2) and len(s2) < 40 and i > 3:
            ans_idx = i
            break
    qpart = lines[:ans_idx] if ans_idx else lines
    blocks, preamble = split_blocks(qpart)
    letters = "ABCDE" if subject == "english" else "ABCD"
    prefix = doc.prefix
    contexts: list[dict] = []
    questions: list[dict] = []
    cur_ctx: str | None = None
    bare = 0

    def add_context(text: str, section: str) -> None:
        nonlocal cur_ctx
        if len(strip_emphasis(text)) < 80:
            return
        cmd, imgs = rewrite_images(text, doc.imgmap, prefix)
        cid = f"{doc.pid_tag}-ctx{len(contexts) + 1}"
        contexts.append(
            {
                "id": cid,
                "md": cmd,
                "html": img_html(cmd, doc.by_file),
                "images": [{"file": i["file"], "w": i["w"], "h": i["h"], "disp": i.get("disp")} for i in imgs],
            }
        )
        cur_ctx = cid

    doc.pid_tag = re.sub(r"[^a-z0-9\-]", "", Path(doc.prefix).name)
    _, head_tail = split_material("\n".join(preamble)) if preamble else ("", None)
    if head_tail:
        add_context(head_tail, "")

    prev_tail = None
    for b in blocks:
        if prev_tail:
            add_context(prev_tail, b.section)
            prev_tail = None
        raw = b.text
        if raw.lstrip().startswith(("【答案】", "【解析】", "【解答】", "【分析】", "【详解】")):
            bare += 1
        stem, ans, ana = split_answer(raw)
        ana, tail = split_material(ana) if ana else ("", None)
        if tail:
            prev_tail = tail
        stem = stem.strip()
        mscore = re.match(r"^[（(]\s*(\d+(?:\.\d+)?)\s*分\s*[)）]\s*", stem)
        q_score = None
        if mscore:
            q_score = float(mscore.group(1))
            stem = stem[mscore.end() :].lstrip()
        head, options = split_options(stem, letters)
        qtype = classify(head, options, ans, ana or "")
        stem_md, imgs = rewrite_images(head, doc.imgmap, prefix)
        opt_list = []
        for o in options:
            omd, oimgs = rewrite_images(o["md"], doc.imgmap, prefix)
            opt_list.append({"k": o["k"], "md": omd, "html": img_html(omd, doc.by_file)})
            have = {x["file"] for x in imgs}
            imgs += [i for i in oimgs if i["file"] not in have]
        ans_md, aimgs = rewrite_images(ans, doc.imgmap, prefix)
        ana_md, nimgs = rewrite_images(ana, doc.imgmap, prefix)
        key = answer_letter(ans, letters) if qtype == "choice" else None
        if qtype == "choice" and key is None and opt_list:
            m = re.search(r"(?:^|[\s（(])([" + "".join(o["k"] for o in opt_list) + r"])[\s）)。.]", strip_emphasis(ans))
            if m:
                key = m.group(1)
        questions.append(
            {
                "id": f"{doc.pid_tag}-q{b.no:02d}",
                "no": b.no,
                "type": qtype,
                "score": q_score if q_score is not None else parse_score(b.section),
                "section": b.section,
                "stem": stem_md,
                "stemHtml": img_html(stem_md, doc.by_file),
                "options": opt_list,
                "answer": ans_md,
                "answerHtml": img_html(ans_md, doc.by_file),
                "analysis": ana_md,
                "analysisHtml": img_html(ana_md, doc.by_file),
                "answerKey": key,
                "images": [{"file": i["file"], "w": i["w"], "h": i["h"], "disp": i.get("disp")} for i in imgs + aimgs + nimgs],
                "contextId": cur_ctx,
            }
        )
    return questions, contexts, preamble, bare > max(1, len(blocks) // 2)


def answer_bank(lines: list[str]) -> dict[int, tuple[str, str]]:
    """解析卷答案：优先用卷末"答案和解析"区，否则全卷内联答案"""
    region = lines
    for i, line in enumerate(lines):
        s2 = line.strip().strip("*")
        if ANSWER_HEAD.match(s2) and len(s2) < 40 and i > 3:
            region = lines[i:]
            break
    out: dict[int, tuple[str, str]] = {}
    # 有的解析卷没有"参考答案"标题，答案直接接在试卷后面重新从 1 开始编号：
    # 找到所有"1." 开头的位置，从末尾那几处再解析一次
    restarts = [i for i, l in enumerate(lines) if (lambda m: m and int(m.group(1)) == 1)(QNUM.match(l.strip()))]
    sources = [region, lines] + [lines[i:] for i in restarts[-2:]]
    for src in sources:
        blocks, _ = split_blocks(src, any_start=True)
        for b in blocks:
            _, a, n = split_answer(b.text)
            if not a and not n:
                continue
            prev = out.get(b.no, ("", ""))
            out[b.no] = (a or prev[0], n or prev[1])
    return out


def build_paper(ps: PaperSet) -> dict:
    asset_dir = OUT_ASSETS / "papers" / ps.pid
    pool = OUT_ASSETS / "papers" / ps.pid
    if FORCE and pool.exists():
        shutil.rmtree(pool)

    ans_doc = prepare(ps.answer, ps.pid, "a", asset_dir) if ps.answer else None
    blank_doc = prepare(ps.blank, ps.pid, "b", asset_dir) if ps.blank else None
    if ans_doc is None and blank_doc is None:
        raise RuntimeError("no source docx")

    parsed: dict[str, tuple] = {}
    for tag, doc in (("a", ans_doc), ("b", blank_doc)):
        if doc is None:
            continue
        doc.pid_tag = ps.pid
        parsed[tag] = parse_questions(doc, ps.subject)

    ans_q, ans_ctx, _, ans_bare = parsed.get("a", ([], [], None, False))
    blank_q, blank_ctx, _, _ = parsed.get("b", ([], [], None, False))
    if ans_q and not ans_bare:
        primary, questions, contexts = ans_doc, ans_q, ans_ctx
    elif blank_q:
        primary, questions, contexts = blank_doc, blank_q, blank_ctx
    else:
        primary, questions, contexts = ans_doc or blank_doc, ans_q, ans_ctx
    answer_doc_bare = ans_bare

    letters = "ABCDE" if ps.subject == "english" else "ABCD"

    # 另一份卷子的解析结果（题干来自空白卷时用它补答案；选项缺失时也用它补）
    other, other_doc = None, None
    if primary is ans_doc and blank_q:
        other, other_doc = blank_q, blank_doc
    elif primary is blank_doc and ans_q:
        other, other_doc = ans_q, ans_doc

    other_by_no = {q["no"]: q for q in (other or [])}

    if ans_doc is not None:
        bank = answer_bank(ans_doc.lines)
        hv = harvest(ans_doc.lines)
        for q in questions:
            a, n = bank.get(q["no"], ("", ""))
            h = hv.get(q["no"], {})
            if not q["answer"] and (a or h.get("answer")):
                q["answer"] = a or h.get("answer", "")
                q["answerHtml"] = img_html(q["answer"], ans_doc.by_file)
            if not q["analysis"] and (n or h.get("analysis")):
                q["analysis"] = n or h.get("analysis", "")
                q["analysisHtml"] = img_html(q["analysis"], ans_doc.by_file)

    # 缺选项 / 缺题干：从另一份卷子补
    for q in questions:
        o = other_by_no.get(q["no"])
        if o:
            if len(q.get("options") or []) < 2 and len(o.get("options") or []) >= 2:
                q["options"] = o["options"]
            qi, oi = q.get("stem", "").count("<img"), o.get("stem", "").count("<img")
            ql = len(strip_emphasis(q.get("stem", "")))
            ol = len(strip_emphasis(o.get("stem", "")))
            if ql < 8 and ol > 8:
                q["stem"], q["stemHtml"], q["images"] = o["stem"], o["stemHtml"], o["images"]
            elif oi > qi and ol > ql * 0.55:
                q["stem"], q["stemHtml"] = o["stem"], o["stemHtml"]
                q["images"] = o.get("images", [])
            if not q.get("answer") and o.get("answer"):
                q["answer"], q["answerHtml"] = o["answer"], o["answerHtml"]
            if not q.get("analysis") and o.get("analysis"):
                q["analysis"], q["analysisHtml"] = o["analysis"], o["analysisHtml"]
        opts = q.get("options") or []
        if q["type"] == "choice" and len(opts) < 2:
            q["type"] = "long"
        if q["type"] == "choice" and not q.get("answerKey"):
            q["answerKey"] = answer_letter(q.get("answer", ""), letters)
        q["broken"] = bool(q["type"] == "long" and len(strip_emphasis(q.get("stem", ""))) < 8)

    # 元信息
    head = "\n".join(primary.lines[:40]).replace("*", "")
    full_score, duration = ps.score_duration
    m = re.search(r"满分\s*(\d+(?:\.\d+)?)\s*分", head)
    if m and float(m.group(1)) >= 60:
        full_score = float(m.group(1))
    m = re.search(r"(?:考试)?用时\s*(\d+)\s*分钟|考试时间\s*(\d+)\s*分钟", head)
    if m:
        duration = int(m.group(1) or m.group(2))

    # 解析卷是扫描件：把答题解析整页图附上
    answer_pages: list[dict] = []
    if ans_doc is not None and ans_doc is not primary:
        atext = re.sub(r"<[^>]+>|!\[[^\]]*\]\([^)]*\)", "", "\n".join(ans_doc.lines))
        if len(re.sub(r"\s", "", atext)) < 260:
            def _ai(fn: str) -> int:
                m = re.search(r"(\d+)", fn)
                return int(m.group(1)) if m else 0

            for fn in sorted(ans_doc.imgmap, key=_ai):
                info = ans_doc.imgmap[fn]
                if info["w"] * info["h"] < 120 * 120:
                    continue
                answer_pages.append({"url": ans_doc.prefix + info["file"], "w": info["w"], "h": info["h"]})

    # 扫描件兜底：整页图片浏览
    pages = []
    if not questions and primary.imgmap:
        def _idx(fn: str) -> int:
            m = re.search(r"(\d+)", fn)
            return int(m.group(1)) if m else 0

        for fn in sorted(primary.imgmap, key=_idx):
            info = primary.imgmap[fn]
            if info["w"] * info["h"] < 120 * 120:
                continue
            pages.append({"url": primary.prefix + info["file"], "w": info["w"], "h": info["h"]})

    paper = {
        "id": ps.pid,
        "subject": ps.subject,
        "subjectCn": ps.subject_cn,
        "subjectName": ps.subject_name,
        "color": ps.color,
        "year": ps.year,
        "title": f"{ps.year}年广州中考{ps.subject_name}",
        "source": {
            "blank": ps.blank.name if ps.blank else None,
            "answer": ps.answer.name if ps.answer else None,
        },
        "fullScore": full_score,
        "durationMin": duration,
        "contexts": contexts,
        "questions": questions,
        "pages": pages,
        "answerPages": answer_pages,
    }
    return paper


# ------------------------------------------------------------------ main
def main() -> None:
    global FORCE
    argv = [a for a in sys.argv[1:] if a != "--force"]
    FORCE = "--force" in sys.argv
    fs = argv[0] if argv else None
    fy = int(argv[1]) if len(argv) > 1 else None
    sets = discover(fs, fy)
    if not sets:
        print("no papers found")
        return
    OUT_DATA.mkdir(parents=True, exist_ok=True)
    OUT_ASSETS.mkdir(parents=True, exist_ok=True)
    index_path = OUT_DATA / "index.json"
    index = {}
    if index_path.exists() and not FORCE:
        try:
            index = {p["id"]: p for p in json.loads(index_path.read_text(encoding="utf-8"))["papers"]}
        except Exception:
            index = {}
    for ps in sets:
        print(f"[{ps.pid}] blank={ps.blank.name if ps.blank else '-'} answer={ps.answer.name if ps.answer else '-'}")
        try:
            data = build_paper(ps)
        except Exception as e:
            print(f"  !! FAILED: {e}")
            continue
        (OUT_DATA / f"{ps.pid}.json").write_text(
            json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
        )
        kinds: dict[str, int] = {}
        for q in data["questions"]:
            kinds[q["type"]] = kinds.get(q["type"], 0) + 1
        withans = sum(1 for q in data["questions"] if q["answer"] or q["analysis"])
        keys = sum(1 for q in data["questions"] if q["answerKey"])
        print(f"  q={len(data['questions'])} ans={withans} key={keys} {kinds} ctx={len(data['contexts'])} pages={len(data['pages'])}")
        index[data["id"]] = {
            "id": data["id"],
            "subject": data["subject"],
            "subjectCn": data["subjectCn"],
            "subjectName": data["subjectName"],
            "color": data["color"],
            "year": data["year"],
            "title": data["title"],
            "fullScore": data["fullScore"],
            "durationMin": data["durationMin"],
            "count": len(data["questions"]),
            "choiceCount": kinds.get("choice", 0),
            "withAnswer": withans,
            "contexts": len(data["contexts"]),
            "pages": len(data["pages"]),
            "sections": sorted({q["section"] for q in data["questions"] if q["section"]}),
        }
    index_path.write_text(
        json.dumps({"papers": sorted(index.values(), key=lambda p: (p["subject"], -p["year"]))}, ensure_ascii=False, indent=1),
        encoding="utf-8",
    )
    print(f"\ndone: {len(index)} papers")


if __name__ == "__main__":
    main()
