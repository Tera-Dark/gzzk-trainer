#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""题库全量审计：只读，不改任何数据。

覆盖：文件/结构、题目字段与 id、答案泄露、选项、多选标记、上下文、
考点口径、索引一致性、questions.json 一致性、version.json、
图片引用存在性、跨卷重复题干、异常字符、分值合计。

用法：
    python pipeline/audit.py            # 报告写到 pipeline/audit-report.txt
"""
from __future__ import annotations

import copy
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "app" / "public" / "data"
ASSETS = ROOT / "app" / "public" / "assets"
REPORT = Path(__file__).resolve().parent / "audit-report.txt"
META_FILES = {"index.json", "questions.json", "tags.json", "version.json"}
SUBJECTS = {"chinese", "math", "english", "physics", "chemistry", "history", "politics"}
TYPES = {"choice", "blank", "long"}

sys.path.insert(0, str(Path(__file__).resolve().parent))
try:
    from finalize import CANON, GENERIC, MULTI_PAT, mark_incomplete
except Exception as exc:  # pragma: no cover - 审计不应因导入失败而停
    print("WARN cannot import finalize:", exc)
    CANON, GENERIC, MULTI_PAT = {}, set(), re.compile(r"正确的两项")

ERRORS: list[str] = []
WARNS: list[tuple[str, str]] = []
INFO: list[tuple[str, str]] = []


def err(code: str, msg: str) -> None:
    ERRORS.append(f"[{code}] {msg}")


def warn(code: str, msg: str) -> None:
    WARNS.append((code, msg))


def info(code: str, msg: str) -> None:
    INFO.append((code, msg))


def group(rows: list[tuple[str, str]], limit: int = 8) -> list[str]:
    """同代码聚合，避免同类铺设几千行把真问题淹了"""
    buckets: dict[str, list[str]] = defaultdict(list)
    for code, msg in rows:
        buckets[code].append(msg)
    out: list[str] = []
    for code in sorted(buckets):
        msgs = buckets[code]
        out.append(f"- {code} × {len(msgs)}")
        for m in msgs[:limit]:
            out.append(f"  - {m}")
        if len(msgs) > limit:
            out.append(f"  - …另有 {len(msgs) - limit} 条")
    return out or ["- 无"]


def norm(s: str) -> str:
    return re.sub(r"[\s　，,。．.；;：:、（）()【】\[\]<>《》“”‘’\"'·•]", "", s or "")


IMG_SRC = re.compile(r"""src=["']papers/([^"']+)["']""", re.I)
ANALYSIS_HEAD = re.compile(r"^\s*(?:【解析】|【分析】|【解答】|【详解】|分析[:：]|解答[:：])")
STEM_ANSWER = re.compile(r"【(?:答案|解析|分析|解答|详解)】|故(?:本)?(?:题)?选\s*[A-D]|故答案为|答案是")
U_TAG = re.compile(r"<u>(.*?)</u>", re.S)
OPTION_ANSWER_MAP = re.compile(r"A\s*[.．]\s*A\s+B\s*[.．]\s*B", re.I)
TONE = re.compile(r"[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]")
# 只抓真正的注音：带声调，或全小写的短串；LED / EHT 这类大写缩写不算
PINYIN_LEAK = re.compile(r"(?<=[\u4e00-\u9fff])(?:[a-zA-Z]*[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜêü][a-zA-Zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜêü]*|[a-z]{2,8})(?=[\u4e00-\u9fff，。、；：）])")


def main() -> int:
    if not DATA.exists():
        print("FATAL data dir missing:", DATA)
        return 2

    paper_files = sorted(p for p in DATA.glob("*.json") if p.name not in META_FILES)
    papers: dict[str, dict] = {}
    for path in paper_files:
        try:
            paper = json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:
            err("F01", f"{path.name} 无法解析：{exc}")
            continue
        papers[path.stem] = paper

    # ---------- 卷级结构 ----------
    REQUIRED_PAPER = ["id", "subject", "subjectCn", "subjectName", "color", "year", "title", "fullScore", "durationMin", "contexts", "questions"]
    for name, p in papers.items():
        miss = [k for k in REQUIRED_PAPER if k not in p]
        if miss:
            err("P01", f"{name} 缺字段 {miss}")
        if p.get("id") != name:
            err("P02", f"{name} 的 id 是 {p.get('id')!r}，与文件名不一致")
        if p.get("subject") not in SUBJECTS:
            err("P03", f"{name} subject={p.get('subject')!r} 不在七科内")
        if not isinstance(p.get("year"), int) or not (2015 <= p["year"] <= 2026):
            err("P04", f"{name} year={p.get('year')!r} 异常")
        if not isinstance(p.get("fullScore"), (int, float)) or p.get("fullScore", 0) <= 0:
            warn("P05", f"{name} fullScore={p.get('fullScore')!r}")
        if not isinstance(p.get("durationMin"), (int, float)) or p.get("durationMin", 0) <= 0:
            warn("P06", f"{name} durationMin={p.get('durationMin')!r}")
        if not p.get("questions"):
            err("P07", f"{name} 没有题目")
        if not isinstance(p.get("contexts"), list):
            err("P08", f"{name} contexts 不是数组")
        title = p.get("title") or ""
        if str(p.get("year")) not in title:
            warn("P09", f"{name} title 里没有年份：{title}")

    # ---------- 题目级 ----------
    all_ids: dict[str, str] = {}
    per_paper_meta: dict[str, dict] = {}
    total_questions = 0
    type_counter: Counter = Counter()
    tag_actual: dict[str, Counter] = defaultdict(Counter)
    tag_unknown: list[str] = []
    tagless: list[str] = []
    leak_bits: dict[str, list[str]] = defaultdict(list)
    img_refs = 0
    img_missing: list[str] = []
    img_papers_missing: set[str] = set()
    char_issues: list[str] = []
    long_stems: list[str] = []
    score_mismatch: list[str] = []
    missing_answer: defaultdict[str, list[str]] = defaultdict(list)
    ctx_unused = 0
    multi_count = 0
    broken_flag = 0

    for name, p in papers.items():
        subject = p.get("subject") or ""
        canon = CANON.get(subject, set())
        qs = p.get("questions") or []
        total_questions += len(qs)
        contexts = p.get("contexts") or []
        ctx_ids = [c.get("id") for c in contexts]
        ctx_set = set(ctx_ids)
        if len(ctx_ids) != len(ctx_set):
            err("C01", f"{name} 上下文 id 有重复")
        used_ctx = set()
        stems: dict[str, str] = {}
        paper_score = p.get("fullScore") or 0
        score_sum = 0.0
        answered = 0
        choice_n = 0

        for q in qs:
            qid = q.get("id") or "<?>"
            no = q.get("no")
            if not isinstance(no, int):
                err("Q01", f"{name} 题号异常 {qid} no={no!r}")
            if qid in all_ids:
                err("Q02", f"题目 id 重复：{qid}（也出现在 {all_ids[qid]}）")
            all_ids[qid] = name
            expect = f"{name}-q{no:02d}" if isinstance(no, int) else None
            if expect and qid != expect:
                warn("Q03", f"{name} id={qid} 与题号不匹配，应为 {expect}")
            qtype = q.get("type")
            type_counter[qtype] += 1
            if qtype not in TYPES:
                err("Q04", f"{qid} type={qtype!r} 不在 {sorted(TYPES)}")
            score = q.get("score")
            if not isinstance(score, (int, float)) or score < 0:
                info("Q05", f"{qid} score={score!r}")
            else:
                score_sum += score
            if q.get("analysis") or q.get("answer"):
                answered += 1

            stem = q.get("stem") or ""
            html = q.get("stemHtml") or ""
            ans = q.get("answer") or ""
            ans_html = q.get("answerHtml") or ""
            analysis = q.get("analysis") or ""
            context_id = q.get("contextId")

            # 题干为空 / 上下文
            if not stem.strip() and not context_id:
                err("Q06", f"{qid} 题干为空且没有上下文")
            if context_id:
                used_ctx.add(context_id)
                if context_id not in ctx_set:
                    err("Q07", f"{qid} contextId={context_id!r} 在本卷 contexts 里不存在")
            if not (q.get("section") or "").strip():
                info("Q08", f"{qid} section 为空")

            # 选项
            opts = q.get("options") or []
            if qtype == "choice":
                choice_n += 1
                if len(opts) < 2:
                    err("Q09", f"{qid} 选择题只有 {len(opts)} 个选项")
                keys = [o.get("k") for o in opts]
                if len(keys) != len(set(keys)):
                    err("Q10", f"{qid} 选项字母重复 {keys}")
                for o in opts:
                    if not (o.get("md") or "").strip():
                        warn("Q11", f"{qid} 选项 {o.get('k')} 内容为空")
                    body = o.get("md") or ""
                    if OPTION_ANSWER_MAP.search(body):
                        leak_bits["选项含 A. A B. B 对照行"].append(qid)
                    if body.rstrip().endswith("|"):
                        leak_bits["选项尾部残留表格竖线"].append(qid)
                key = q.get("answerKey")
                if key:
                    if key not in keys:
                        err("Q12", f"{qid} answerKey={key!r} 不在选项 {keys} 内")
                elif not q.get("multi"):
                    if len(ans.strip()) > 30 or len(ans_html.strip()) > 30:
                        warn("Q24", f"{qid} 选项题但答案是长文本，疑题型错判：{ans.strip()[:30]!r}")
                    else:
                        warn("Q13", f"{qid} 选择题没有 answerKey（也不是多选自评）")
            elif opts:
                warn("Q14", f"{qid} {qtype} 题却带 {len(opts)} 个选项")

            # 多选标记
            if q.get("multi"):
                multi_count += 1
                if qtype != "choice":
                    err("Q15", f"{qid} multi=true 但 type={qtype}")
                if q.get("answerKey"):
                    err("Q16", f"{qid} 标了 multi 却仍有 answerKey={q.get('answerKey')!r}")
            elif qtype == "choice":
                head = re.sub(r"<[^>]+>", "", stem)[:200]
                if MULTI_PAT.search(head) and q.get("answerKey"):
                    warn("Q17", f"{qid} 题干像多选但仍按单选判分：{head[:40]!r}")

            # 非选择题是否缺答案
            if qtype in ("blank", "long") and not (ans or ans_html or analysis):
                missing_answer[subject].append(qid)

            # 答案泄露
            for fld, text in (("stem", stem), ("stemHtml", html)):
                if not text:
                    continue
                if STEM_ANSWER.search(text):
                    leak_bits[f"题干出现答案/解析标记({fld})"].append(qid)
                if ANALYSIS_HEAD.match(text):
                    leak_bits[f"题干是解析原文开头({fld})"].append(qid)
                for m in U_TAG.finditer(text):
                    inner = norm(m.group(1))
                    if len(inner) >= 2 and (inner in norm(ans) or inner in norm(ans_html)):
                        leak_bits[f"下划线里填着答案({fld})"].append(qid)
                if subject == "chinese":
                    if PINYIN_LEAK.search(text):
                        leak_bits["语文题干残留注音"].append(qid)
                    for m in U_TAG.finditer(text):
                        if TONE.search(m.group(1)):
                            leak_bits["语文下划线残留带调拼音"].append(qid)
            if ANALYSIS_HEAD.match(analysis):
                info("Q18", f"{qid} analysis 仍以【解析】类抬头开头")
            if analysis and len(analysis) > 40 and norm(analysis)[:40] in norm(stem):
                leak_bits["解析原文混进题干"].append(qid)

            # 异常字符
            for fld, text in (("stem", stem), ("analysis", analysis), ("answer", ans)):
                if text and ("\ufffd" in text or re.search(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", text)):
                    char_issues.append(f"{qid}.{fld}")
            if re.search(r"[\ue000-\uf8ff]", stem):
                char_issues.append(f"{qid}.stem(私用区)")

            # 超长题干
            if len(stem) > 1200:
                long_stems.append(f"{qid}({len(stem)})")

            # 同卷重复题干
            key_stem = norm(stem)
            if len(key_stem) >= 40:
                if key_stem in stems:
                    err("Q19", f"{name} 题干重复：{qid} 与 {stems[key_stem]}")
                else:
                    stems[key_stem] = qid

            # 考点
            tags = q.get("tags")
            if not isinstance(tags, list):
                err("Q20", f"{qid} tags 不是数组")
                tags = []
            if not tags:
                tagless.append(qid)
            for t in tags:
                if t in GENERIC:
                    err("Q21", f"{qid} 考点是题型名：{t}")
                if canon and t not in canon:
                    tag_unknown.append(f"{qid}:{subject}:{t}")
                else:
                    tag_actual[subject][t] += 1

            # 图片引用
            for fld in ("stem", "stemHtml", "analysis", "analysisHtml", "answer", "answerHtml"):
                text = q.get(fld) or ""
                for rel in IMG_SRC.findall(text):
                    img_refs += 1
                    fp = ASSETS / "papers" / rel
                    if not fp.exists():
                        img_missing.append(f"{qid}:{rel}")
            for o in opts:
                for fld in ("md", "html"):
                    for rel in IMG_SRC.findall(o.get(fld) or ""):
                        img_refs += 1
                        if not (ASSETS / "papers" / rel).exists():
                            img_missing.append(f"{qid}:opt:{rel}")
            if q.get("broken"):
                broken_flag += 1
            for im in q.get("images") or []:
                img_refs += 1
                fname = im.get("file") if isinstance(im, dict) else im
                if not fname:
                    warn("Q23", f"{qid} images 里有空条目")
                    continue
                if not (ASSETS / "papers" / name / fname).exists():
                    img_missing.append(f"{qid}:images:{fname}")

        # 上下文图片
        for c in contexts:
            for fld in ("md", "html"):
                for rel in IMG_SRC.findall(c.get(fld) or ""):
                    img_refs += 1
                    if not (ASSETS / "papers" / rel).exists():
                        img_missing.append(f"{name}:ctx:{rel}")

        ctx_unused += len(ctx_set - used_ctx)
        if abs(score_sum - paper_score) > 1:
            score_mismatch.append(f"{name}({score_sum:g}/{paper_score:g})")

        per_paper_meta[name] = {
            "count": len(qs),
            "choiceCount": choice_n,
            "withAnswer": answered,
            "contexts": len(contexts),
            "sections": sorted({q.get("section") for q in qs if q.get("section")}),
        }

    # ---------- 跨卷重复题干 ----------
    global_stems: dict[str, list[str]] = defaultdict(list)
    for name, p in papers.items():
        for q in p.get("questions") or []:
            k = norm(q.get("stem") or "")
            if len(k) >= 60:
                global_stems[k].append(q.get("id") or "?")
    dup_cross = [(ids, k) for k, ids in global_stems.items() if len(ids) > 1]
    for ids, k in dup_cross[:20]:
        warn("Q22", f"跨卷重复题干 {ids}：{k[:30]}")

    # ---------- 索引 ----------
    try:
        index = json.loads((DATA / "index.json").read_text(encoding="utf-8"))
        metas = index.get("papers") or []
    except Exception as exc:
        err("I00", f"index.json 无法解析：{exc}")
        metas = []
    index_by_id = {m.get("id"): m for m in metas}
    if len(index_by_id) != len(metas):
        err("I01", "index.json 里有重复 id")
    # finalize 的收录口径：少于 8 题，或既无答案也无答案页 → 跳过
    expected_meta: dict[str, dict] = {}
    for name, p in papers.items():
        qs = p.get("questions") or []
        answered = sum(1 for q in qs if q.get("answer") or q.get("analysis"))
        if len(qs) < 8 or (answered == 0 and not p.get("answerPages")):
            info("I02", f"{name} 未进 index（{len(qs)} 题/{answered} 有答案）")
            continue
        expected_meta[name] = p
    missing_idx = set(expected_meta) - set(index_by_id)
    extra_idx = set(index_by_id) - set(expected_meta)
    for m in sorted(missing_idx):
        err("I03", f"{m} 应该进 index 却没有")
    for m in sorted(extra_idx):
        err("I04", f"index 里的 {m} 没有对应卷或应被跳过")
    for name, p in expected_meta.items():
        meta = index_by_id.get(name)
        if not meta:
            continue
        pm = per_paper_meta[name]
        for fld in ("count", "choiceCount", "withAnswer", "contexts"):
            if meta.get(fld) != pm[fld]:
                err("I05", f"{name} index.{fld}={meta.get(fld)!r}，实际 {pm[fld]!r}")
        if sorted(meta.get("sections") or []) != pm["sections"]:
            warn("I06", f"{name} index.sections 与实际大题名不一致")
        for fld, actual in (("subject", p.get("subject")), ("year", p.get("year")), ("title", p.get("title")),
                            ("fullScore", p.get("fullScore")), ("durationMin", p.get("durationMin")),
                            ("subjectName", p.get("subjectName")), ("color", p.get("color"))):
            if meta.get(fld) != actual:
                err("I07", f"{name} index.{fld}={meta.get(fld)!r}，卷内 {actual!r}")

    # 残缺卷口径（用 finalize 同一算法在副本上重算）
    copies = [copy.deepcopy(p) for p in papers.values()]
    try:
        mark_incomplete(copies)
        expect_inc = {c["id"]: bool(c.get("incomplete")) for c in copies}
        expect_cnt = {c["id"]: c.get("expectedCount") for c in copies}
        for pid, meta in index_by_id.items():
            if pid in expect_inc and bool(meta.get("incomplete")) != expect_inc[pid]:
                err("I08", f"{pid} index.incomplete={meta.get('incomplete')}，重算应为 {expect_inc[pid]}")
            if pid in expect_cnt and meta.get("expectedCount") != expect_cnt[pid]:
                warn("I09", f"{pid} index.expectedCount={meta.get('expectedCount')}，重算应为 {expect_cnt[pid]}")
    except Exception as exc:
        warn("I10", f"残缺卷重算失败：{exc}")

    # ---------- questions.json ----------
    flat_ids: set[str] = set()
    try:
        flat = json.loads((DATA / "questions.json").read_text(encoding="utf-8")).get("questions") or []
    except Exception as exc:
        err("T00", f"questions.json 无法解析：{exc}")
        flat = []
    if len(flat) != total_questions:
        err("T01", f"questions.json 有 {len(flat)} 条，实际题目 {total_questions} 条")
    flat_map = {f.get("id"): f for f in flat}
    for f in flat:
        fid = f.get("id")
        if fid in flat_ids:
            err("T02", f"questions.json id 重复：{fid}")
        flat_ids.add(fid)
        if fid not in all_ids:
            err("T03", f"questions.json 里的 {fid} 在卷子里不存在")
            continue
        pname = all_ids[fid]
        p = papers[pname]
        q = next((x for x in p["questions"] if x.get("id") == fid), None)
        if not q:
            continue
        want = {"s": p.get("subject"), "p": p.get("id"), "y": p.get("year"), "n": q.get("no"),
                "t": q.get("type"), "k": q.get("answerKey"), "sc": q.get("score"), "g": q.get("tags")}
        for fld, val in want.items():
            if f.get(fld) != val:
                err("T04", f"{fid} questions.{fld}={f.get(fld)!r}，卷内 {val!r}")
        a = 1 if (q.get("answer") or q.get("answerHtml") or q.get("answerKey")) else 0
        if f.get("a") != a:
            warn("T05", f"{fid} questions.a={f.get('a')}，实际 {a}")
    for qid in all_ids:
        if qid not in flat_map:
            err("T06", f"{qid} 不在 questions.json 里")

    # ---------- tags.json ----------
    try:
        tags_json = json.loads((DATA / "tags.json").read_text(encoding="utf-8"))
    except Exception as exc:
        err("G00", f"tags.json 无法解析：{exc}")
        tags_json = {}
    for subject, rows in tags_json.items():
        canon = CANON.get(subject, set())
        for row in rows:
            t = row.get("name")
            c = row.get("count")
            if canon and t not in canon:
                err("G01", f"tags.json 出现未定义考点 {subject}:{t}")
            actual = tag_actual.get(subject, {}).get(t, 0)
            if c != actual:
                err("G02", f"tags.json {subject}:{t} count={c}，实际 {actual}")
        for t, c in tag_actual.get(subject, {}).items():
            if t not in {r.get("name") for r in rows}:
                err("G03", f"tags.json 缺考点 {subject}:{t}({c})")
    for subject, c in tag_actual.items():
        if subject not in tags_json:
            err("G04", f"tags.json 缺整个科目 {subject}")

    # ---------- version.json ----------
    try:
        ver = json.loads((DATA / "version.json").read_text(encoding="utf-8"))
        if ver.get("papers") != len(index_by_id):
            err("V01", f"version.papers={ver.get('papers')}，index 实际 {len(index_by_id)}")
        if ver.get("questions") != total_questions:
            err("V02", f"version.questions={ver.get('questions')}，实际 {total_questions}")
        if not re.fullmatch(r"\d{8}-\d+", str(ver.get("version"))):
            warn("V03", f"version.version={ver.get('version')!r} 不是 20261120-1 形式")
        try:
            datetime.fromisoformat(str(ver.get("builtAt")))
        except Exception:
            warn("V04", f"version.builtAt={ver.get('builtAt')!r} 不是 ISO 时间")
    except Exception as exc:
        err("V00", f"version.json 无法解析：{exc}")

    # ---------- 发布清单 ----------
    for fname in ("bundle.json", "app-update.json"):
        fp = ROOT / "app" / "public" / fname
        try:
            doc = json.loads(fp.read_text(encoding="utf-8"))
            if not re.fullmatch(r"\d+\.\d+\.\d+", str(doc.get("version"))):
                warn("R01", f"{fname} version={doc.get('version')!r} 不是 x.y.z")
            if fname == "bundle.json" and "urls" not in doc:
                info("R02", "app/public/bundle.json 还没有 urls 数组（make-bundle 发版时才写）")
        except Exception as exc:
            err("R00", f"{fname} 无法解析：{exc}")

    # ---------- 报告 ----------
    lines: list[str] = []
    lines.append("# 题库全量审计报告")
    lines.append("")
    lines.append(f"生成时间：{datetime.now().isoformat(timespec='seconds')}")
    lines.append(f"卷子文件：{len(papers)}；题目总数：{total_questions}；进入 index：{len(index_by_id)}")
    lines.append(f"题型分布：{dict(type_counter)}；多选自评：{multi_count}；broken 标记：{broken_flag}")
    lines.append(f"错误 {len(ERRORS)} 条，警告 {len(WARNS)} 条，信息 {len(INFO)} 条")
    lines.append("")
    lines.append("## 按科目/年份覆盖")
    matrix: dict[str, dict[int, int]] = defaultdict(dict)
    for p in papers.values():
        matrix[p.get("subject") or "?"][p.get("year") or 0] = len(p.get("questions") or [])
    for s in sorted(matrix):
        years = matrix[s]
        lines.append(f"- {s}: " + " ".join(f"{y}({years[y]})" for y in sorted(years)))
    lines.append("")
    lines.append("## 错误")
    lines.extend(ERRORS or ["- 无"])
    lines.append("")
    lines.append("## 警告（按类型聚合）")
    lines.extend(group(WARNS))
    lines.append("")
    lines.append("## 信息（按类型聚合）")
    lines.extend(group(INFO, limit=5))
    lines.append("")
    lines.append("## 明细统计")
    lines.append(f"- 无考点题目：{len(tagless)} 条" + (f"，前 20：{tagless[:20]}" if tagless else ""))
    lines.append(f"- 未定义考点命中：{len(tag_unknown)} 条" + (f"，前 20：{tag_unknown[:20]}" if tag_unknown else ""))
    lines.append(f"- 缺答案的非选择题：{sum(len(v) for v in missing_answer.values())} 条")
    for s, v in sorted(missing_answer.items()):
        lines.append(f"  - {s}: {len(v)} 条，前 10：{v[:10]}")
    lines.append(f"- 图片引用：{img_refs} 处；缺失 {len(img_missing)} 处")
    for x in img_missing[:30]:
        lines.append(f"  - {x}")
    lines.append(f"- 异常字符：{len(char_issues)} 处" + (f"，前 20：{char_issues[:20]}" if char_issues else ""))
    lines.append(f"- 超长题干(>1200)：{len(long_stems)} 条" + (f"，前 20：{long_stems[:20]}" if long_stems else ""))
    lines.append(f"- 分值合计与卷面不符：{len(score_mismatch)} 卷" + (f"，{score_mismatch[:20]}" if score_mismatch else ""))
    lines.append(f"- 未被引用的上下文：{ctx_unused} 个")
    lines.append(f"- 跨卷重复题干：{len(dup_cross)} 组")
    lines.append("")
    lines.append("## 疑似答案泄露")
    if leak_bits:
        for kind, ids in leak_bits.items():
            uniq = list(dict.fromkeys(ids))
            lines.append(f"- {kind}：{len(uniq)} 条，{uniq[:15]}")
    else:
        lines.append("- 无")
    lines.append("")

    REPORT.write_text("\n".join(lines), encoding="utf-8")
    print(f"papers={len(papers)} questions={total_questions} index={len(index_by_id)}")
    print(f"errors={len(ERRORS)} warnings={len(WARNS)} info={len(INFO)}")
    print("report:", REPORT)
    return 1 if ERRORS else 0


if __name__ == "__main__":
    sys.exit(main())
