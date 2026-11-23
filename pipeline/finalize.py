#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""抽取后处理：考点标签、全局题目索引、题库汇总。

标签来源（全部来自解析原文，不靠猜）：
  * 解析里的「本题考查……」/「本题主要考查……」/「本题考查了……」
  * 没有的话退回所在大题名 / 题型
"""
from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "app" / "public" / "data"
if not DATA.exists():
    DATA = ROOT / "data"

TAG_PAT = re.compile(
    r"本题(?:主要|重点)?考查(?:了|的是)?([^。，；\n]{2,36})|"
    r"此题(?:主要)?考查(?:了)?([^。，；\n]{2,36})|"
    r"本(?:题|小题)(?:主要)?考查了?([^。，；\n]{2,36})"
)
CLEAN = [
    "的基础知识", "的相关知识", "的基础知识、基本技能", "知识", "内容", "方法", "能力",
    "学生的", "学生对", "对", "了", "，", "等", "、",
]
STOP = {"物理", "化学", "数学", "语文", "英语", "历史", "道德与法治", "理解", "掌握", "运用"}


def split_tags(phrase: str) -> list[str]:
    phrase = phrase.strip()
    phrase = re.sub(r"^[了的地得\s]+", "", phrase)
    phrase = re.sub(r"[（(][^）)]*[）)]", "", phrase)
    for w in ("的基础知识", "的相关知识", "的基本", "的知识", "的考查"):
        phrase = phrase.replace(w, "")
    parts = re.split(r"[、，,；;/]|和|及|与", phrase)
    out = []
    for p in parts:
        p = p.strip(" 。；，、:：")
        p = re.sub(r"^(了|的)+", "", p)
        if not (2 <= len(p) <= 14):
            continue
        if p in STOP:
            continue
        out.append(p)
    return out


# 解析原文没写"本题考查……"时，用考点关键词兜底（中考常见考点，覆盖核心内容）
RULES: dict[str, list[tuple[str, str]]] = {
    "chemistry": [
        (r"化学变化|物理变化|性质|用途", "物质的变化与性质"),
        (r"材料|合金|合成纤维|陶瓷|金属材料|有机合成", "材料与资源"),
        (r"蛋白质|淀粉|糖类|油脂|维生素|营养素|膳食", "化学与生活"),
        (r"化肥|农药|尿素|复合肥", "化肥与农业"),
        (r"溶解度|饱和溶液|溶质质量分数|结晶|蒸发结晶", "溶液与溶解度"),
        (r"pH|酸碱|中和|盐酸|硫酸|氢氧化钠|碳酸钠|盐", "酸碱盐"),
        (r"金属活动性|置换反应|金属的化学性质", "金属与金属材料"),
        (r"质量守恒|化学方程式|配平", "化学方程式"),
        (r"相对分子质量|化合价|元素质量比|化学式", "化学式与化合价"),
        (r"燃烧|灭火|着火点|爆炸", "燃烧与灭火"),
        (r"空气|氧气|催化剂|制取氧气", "空气与氧气"),
        (r"净化水|电解水|硬水|水资源", "水与溶液"),
        (r"分子|原子|离子|元素|微观", "微观粒子"),
        (r"实验操作|过滤|蒸发|称量|量取|装置", "实验基本操作"),
        (r"鉴别|除杂|提纯|分离", "物质鉴别与提纯"),
        (r"推断", "物质推断"),
        (r"探究|设计实验|验证|假设", "科学探究"),
        (r"CO2|二氧化碳|一氧化碳|碳单质|低碳", "碳和碳的氧化物"),
        (r"计算|克|质量分数", "化学计算"),
    ],
    "physics": [
        (r"折射|反射|透镜|成像|平面镜|光的", "光现象"),
        (r"声音|音调|响度|音色|噪声", "声现象"),
        (r"重力|摩擦|弹力|力的作用|二力平衡|惯性", "力与运动"),
        (r"压强|液体压强|大气压|流体", "压强"),
        (r"浮力|阿基米德|漂浮|排开", "浮力"),
        (r"杠杆|滑轮|机械效率|斜面|功|功率", "简单机械与功"),
        (r"电流|电压|电阻|欧姆|串并联|电路", "电路与欧姆定律"),
        (r"电功率|电能|电热|焦耳|额定", "电功率与电热"),
        (r"磁|电磁|安培|感应|电动机|发电机", "电与磁"),
        (r"物态变化|熔化|凝固|汽化|液化|升华|凝华", "物态变化"),
        (r"内能|比热容|热值|热量|分子热运动", "内能与热量"),
        (r"速度|参照物|机械运动|路程", "机械运动"),
        (r"密度|天平|量筒|质量", "质量与密度"),
        (r"能量|能源|效率|转化", "能量与能源"),
        (r"实验|测量|探究|读数", "实验探究"),
    ],
    "history": [
        (r"秦|汉|唐|宋|元|明|清|商|周|春秋|战国|科举|丝绸之路|郡县", "中国古代史"),
        (r"鸦片战争|太平天国|洋务|甲午|戊戌|辛亥|五四|北伐|长征|抗日|解放战争|民国|辛亥", "中国近代史"),
        (r"新中国|一五计划|三大改造|改革开放|特区|港澳|新时代|脱贫攻坚", "中国现代史"),
        (r"世界|欧洲|美国|英国|法国|苏联|希腊|罗马|文艺复兴|工业革命|一战|二战|冷战|全球化", "世界史"),
        (r"史料|材料|概括|分析|说明|评价", "史料实证与历史解释"),
    ],
    "politics": [
        (r"宪法|法律|法治|违法|犯罪|权利|义务|诉讼|未成年人保护", "法律与宪法"),
        (r"诚信|责任|尊重|道德|礼貌|集体|友谊|情绪|挫折", "道德与心理"),
        (r"创新|科技|国情|发展|绿色|生态|环保|碳|人口|资源", "国情与国策"),
        (r"文化|传统|民族|精神|价值|理想|信念", "文化与价值观"),
        (r"安全|生命|毒品|网络|沉迷|自我保护", "生命健康与安全"),
        (r"国家|制度|人民|民主|党|政府|国际", "国家制度与国际"),
    ],
    "chinese": [
        (r"读音|加点字", "字音"),
        (r"错别字|字形", "字形"),
        (r"词语|成语|加点词语", "词语运用"),
        (r"语病|病句", "病句辨析"),
        (r"默写|补写|古诗文填空", "古诗文默写"),
        (r"断句", "文言断句"),
        (r"翻译|句子翻译", "文言翻译"),
        (r"加点词|一词多义|文言实词", "文言实词"),
        (r"名著|原著|《", "名著阅读"),
        (r"标题|赏析|表达效果|修辞|描写", "现代文阅读·赏析"),
        (r"说明方法|说明文|材料", "非连续性文本"),
        (r"议论文|论点|论证", "议论文阅读"),
        (r"作文|题目|写一篇文章|书信", "写作"),
        (r"综合性学习|活动|倡议", "综合性学习"),
    ],
    "english": [
        (r"定语从句|宾语从句|状语从句|从句", "从句"),
        (r"时态|现在完成时|一般过去时|进行时", "时态"),
        (r"被动语态", "被动语态"),
        (r"非谓语|动名词|不定式|分词", "非谓语动词"),
        (r"介词|连词|冠词|代词", "介词连词冠词"),
        (r"词义辨析|词义|短语", "词汇辨析"),
        (r"阅读|passage|主旨|infer", "阅读理解"),
        (r"完形", "完形填空"),
        (r"语法填空", "语法填空"),
        (r"单词拼写|根据首字母", "单词拼写"),
        (r"完成句子|句型", "句型转换"),
        (r"书面表达|作文|write", "书面表达"),
        (r"语法选择", "语法选择"),
    ],
    "math": [
        (r"相反数|绝对值|倒数|数轴", "有理数"),
        (r"科学记数法|近似数", "科学记数法"),
        (r"整式|因式分解|幂的运算|乘法公式", "整式与因式分解"),
        (r"分式|二次根式|化简求值", "分式与根式"),
        (r"方程|解不等式|不等式组|根的判别", "方程与不等式"),
        (r"一次函数|反比例函数|二次函数|抛物线|函数图象", "函数"),
        (r"三角形|全等|相似|勾股|等腰|角平分", "三角形与全等相似"),
        (r"四边形|平行四边形|矩形|菱形|正方形", "四边形"),
        (r"圆|切线|圆周角|扇形|弧长", "圆"),
        (r"锐角三角|三角比|方向角|仰角", "锐角三角函数"),
        (r"平移|旋转|对称|图形变换", "图形变换"),
        (r"统计|平均数|中位数|众数|方差|频数", "统计"),
        (r"概率|随机|摸球|树状图", "概率"),
        (r"尺规作图|作图", "尺规作图"),
        (r"动点|最值|存在", "综合与压轴"),
    ],
}


def rule_tags(subject: str, q: dict) -> list[str]:
    text = (q.get("stem") or "") + " " + (q.get("analysis") or "")
    hits: list[str] = []
    for pat, tag in RULES.get(subject, []):
        if re.search(pat, text, re.I) and tag not in hits:
            hits.append(tag)
        if len(hits) >= 2:
            break
    return hits


def clean_section(sec: str) -> str:
    s = re.sub(r"\*+", "", sec)
    s = re.sub(r"^[一二三四五六七八九十]+\s*[、.．]\s*", "", s)
    s = re.sub(r"[（(][^）)]*[）)]", "", s)
    s = re.sub(r"^(第[一二三四]部分)?", "", s)
    for name in (
        "语法选择", "完形填空", "阅读理解", "阅读填空", "语法填空", "单词拼写",
        "完成句子", "书面表达", "古诗文默写", "名著阅读", "综合性学习", "实验题", "计算题",
    ):
        if name in s:
            return name
    if re.search(r"选择", s):
        return "选择题"
    if re.search(r"填空", s):
        return "填空题"
    if re.search(r"解答|非选|实验|探究|计算", s):
        return "解答题"
    s = re.sub(r"[\d\s分题共，,。、]+", "", s)
    return s[:10] or "综合题"


def repair_answer_key(q: dict, letters: str = "ABCDE") -> None:
    """选择题答案字母兜底：分组答案 / 故选X / 故答案为X"""
    if q["type"] != "choice" or q.get("answerKey"):
        return
    bare = (q.get("answer") or "").strip().upper()
    if re.fullmatch(rf"[{letters}]", bare):
        q["answerKey"] = bare
        return
    pools = [q.get("answer") or "", q.get("analysis") or ""]
    for text in pools:
        flat = re.sub(r"[\*$]", "", text)
        m = re.search(rf"(?<![\d.]){q['no']}\s*[.．、]\s*([{letters}])(?![A-Za-z])", flat)
        if m:
            q["answerKey"] = m.group(1)
            return
        m = re.search(rf"(?:答案|选|为)\s*[:：]?\s*([{letters}])(?![A-Za-z一-鿿])", flat)
        if m:
            q["answerKey"] = m.group(1)
            return


# 只有这些考点会进 tags.json / 学习路径：RULES 里人工定过的口径，稳定、能凑成一关
CANON = {s: {t for _, t in rules} for s, rules in RULES.items()}
# 题型名不是考点，别让它混进路径
GENERIC = {"选择题", "填空题", "解答题", "综合题", "单选", "多选", "判断"}
# 大题名 → 考点（解析里没写“本题考查……”时兜底）
SECTION_CANON: dict[str, dict[str, str]] = {
    "english": {
        "阅读": "阅读理解",
        "阅读理解": "阅读理解",
        "阅读填空": "阅读理解",
        "完形填空": "完形填空",
        "语法选择": "语法选择",
        "语法填空": "语法填空",
        "单词拼写": "单词拼写",
        "完成句子": "句型转换",
        "书面表达": "书面表达",
        "写作": "书面表达",
    },
    "chinese": {
        "阅读与鉴赏": "现代文阅读·赏析",
        "现代文阅读": "现代文阅读·赏析",
    },
}

BLANK = "＿"


def blank_fill(n: int) -> str:
    """留空用原卷的下划线写法，Markdown 里不会变成下划线字符，视觉上就是一条空线"""
    return "<u>" + "　" * max(2, min(6, n)) + "</u>"
U_TAG = re.compile(r"<u>(.*?)</u>", re.S)
TONE = set("āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüê")
PINYIN = re.compile(r"(?<=[\u4e00-\u9fff])([A-Za-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜêü]{2,8})(?=[\u4e00-\u9fff，。、；：）])")
EMPTY_TABLE_LINE = re.compile(r"^\s*\|[\s|]*$")
MULTI_PAT = re.compile(r"正确的两项|正确的三项|两个或两个以上|不止一项|不定项")
# 抽取时混进来的考场须知/答题卡说明，行首命中就整条丢掉
JUNK_STEM = re.compile(
    r"^\s*(?:答题前|答卷前|考生务必|考生必须保持|考试结束|选择题每小题|非选择题(?:答案)?必须|答案必填涂)"
)
# 解析原文被抽成题干的（“考查……”“由后一句话……”）
ANALYSIS_STEM = re.compile(r"^\s*(?:考查|【分析】|【解答】|【详解】|分析[:：]|解答[:：]|由[前后]文|由[前后]一句)")
# 只剩选项壳、题干本体没抽出来的题
OPT_LETTER = re.compile(r"(?<![A-Za-z])[A-D]\s*[.．、]?\s")
CJK = re.compile(r"[\u4e00-\u9fff]")


def _norm(s: str) -> str:
    return re.sub(r"[\s　，,。．.；;：:、（）()【】\[\]<>《》“”‘’\"'·•]", "", s or "")


def strip_empty_tables(s: str) -> str:
    """去掉只剩竖线的空表格行（原卷表格被解析丢内容，留着只会渲染成空框）"""
    if not s or "|" not in s:
        return s
    return "\n".join(ln for ln in s.split("\n") if not EMPTY_TABLE_LINE.match(ln))


def scrub_pinyin(s: str) -> str:
    """语文材料里残留的注音（流lián / 糟tà）会直接把答案递到用户眼前，换成空格占位"""
    if not s:
        return s

    def repl(m: re.Match) -> str:
        tok = m.group(1)
        return blank_fill(1) if any(ch in TONE for ch in tok) else tok

    return PINYIN.sub(repl, s)


def scrub_question(q: dict) -> int:
    """题干里被填好的答案（<u>百草丰茂</u>、正确的一项是 <u>C</u>）擦成空格"""
    stem = q.get("stem") or ""
    if "<u>" not in stem and "<u>" not in (q.get("stemHtml") or ""):
        return 0
    key = (q.get("answerKey") or "").strip().upper()
    ans = _norm(q.get("answer") or "") + _norm(q.get("answerHtml") or "")
    # 答案字段空着或只剩一个字母时，题干里的下划线内容肯定是答案本身（化学 2024 实验题就是整份答案被填回题干）
    weak = len(ans) <= 2
    hits = 0

    def repl(m: re.Match) -> str:
        nonlocal hits
        inner = _norm(m.group(1))
        if not inner:
            return m.group(0)
        if len(inner) >= 2 and inner in ans:
            hits += 1
            return blank_fill(len(inner))
        if len(inner) == 1 and inner.upper() in "ABCDE" and key and inner.upper() == key:
            hits += 1
            return "（　）"
        if weak and re.search(r"[\w\u4e00-\u9fff]", inner):
            hits += 1
            return blank_fill(len(inner))
        return m.group(0)

    for fld in ("stem", "stemHtml"):
        src = q.get(fld)
        if src and "<u>" in src:
            q[fld] = U_TAG.sub(repl, src)
    return hits


ANSWER_MAP = re.compile(r"\s*(?:A\s*[.．]\s*A\s+B\s*[.．]\s*B\s+C\s*[.．]\s*C\s+D\s*[.．]\s*D)\s*$")


def scrub_option_noise(q: dict) -> None:
    """选项尾部的表格竖线和“A. A B. B C. C D. D”答案对照行"""
    for o in q.get("options") or []:
        for fld in ("md", "html"):
            v = o.get(fld)
            if not v:
                continue
            o[fld] = re.sub(r"[\s|]+$", "", ANSWER_MAP.sub("", v))


def mark_multi(q: dict) -> None:
    """“正确的两项”这类多选题：全库的 answerKey 都是单字母，硬判就是判错，改成自评"""
    if q.get("type") != "choice":
        return
    head = re.sub(r"<[^>]+>", "", q.get("stem") or "")[:200]
    if MULTI_PAT.search(head):
        q["answerKey"] = None
        q["multi"] = True
    else:
        q.pop("multi", None)


def drop_junk(paper: dict) -> list[str]:
    """丢掉抽取时混进来的“假题”：考场须知、没有题干的空壳、只剩选项字母的残题"""
    keep: list[dict] = []
    dropped: list[str] = []
    for q in paper["questions"]:
        stem = (q.get("stem") or "").strip()
        opts = [o for o in (q.get("options") or []) if (o.get("md") or "").strip()]
        shell = (
            not q.get("contextId")
            and len(stem) < 200
            and not CJK.search(stem)
            and not re.search(r"[?？]", stem)
            and len(OPT_LETTER.findall(stem)) >= 3
        )
        junk = (
            (bool(stem) and bool(JUNK_STEM.match(stem)))
            or (bool(stem) and bool(ANALYSIS_STEM.match(stem)))
            or (not stem and not q.get("contextId"))
            or shell
            or (q.get("type") == "choice" and len(opts) < 2)
        )
        if junk:
            dropped.append(q["id"])
        else:
            keep.append(q)
    paper["questions"] = keep
    return dropped


def tags_for(q: dict, subject: str = "math") -> list[str]:
    text = (q.get("analysis") or "") + "\n" + (q.get("answer") or "")
    canon = CANON.get(subject, set())
    found: list[str] = []
    for m in TAG_PAT.finditer(text):
        phrase = m.group(1) or m.group(2) or m.group(3) or ""
        for t in split_tags(phrase):
            if t in canon and t not in found:
                found.append(t)
        if len(found) >= 3:
            break
    if not found:
        found = rule_tags(subject, q)
    if not found:
        sec = clean_section(q.get("section") or "")
        mapped = SECTION_CANON.get(subject, {}).get(sec)
        if mapped:
            found = [mapped]
        elif sec and "阅读" in sec:
            found = ["现代文阅读·赏析"] if subject == "chinese" else ["阅读理解"]
    out = [t for t in dict.fromkeys(found) if t and t not in GENERIC]
    return out[:3]


def mark_incomplete(papers: list[dict]) -> list[str]:
    """题量明显少于同科正常年份的卷子标成残缺：可以做练习，但不该拿去估分"""
    # 以最近三年的题量口径为基准：中考改革后各科题量变过（化学 29→20）
    recent: dict[str, list[tuple[int, int]]] = defaultdict(list)
    for p in papers:
        recent[p["subject"]].append((p["year"], len(p["questions"])))
    ref: dict[str, int] = {}
    for s, rows in recent.items():
        rows.sort(reverse=True)
        top = [c for _, c in rows[:3]]
        ref[s] = sorted(top)[len(top) // 2]
    flagged: list[str] = []
    for p in papers:
        p.pop("incomplete", None)
        p.pop("expectedCount", None)
        c = len(p["questions"])
        r = ref.get(p["subject"], 0)
        if r and c < 0.65 * r:
            p["incomplete"] = True
            p["expectedCount"] = r
            flagged.append(f'{p["id"]}({c}/{r})')
    return flagged


# ---------- 抽取残渣修复（只做确定性变换，不猜内容） ----------

# 解析卷的「答案：/解析：」整块被粘进选项（英语阅读最常）
LEAK_CUT = re.compile(r"\n[ \t]*(?:【?\s*(?:答案|解析|解答)\s*】?)\s*[:：]")
# 选项里被吞掉的其它选项：「\nE. …」或原卷把 D 写成「4.  …」
OPT_MARK = re.compile(r"\n[ \t]*(?:([A-F])\s*[.．、]|([1-6])[.．][ \t]+)")
# 选项尾部吞进去的后续小问（「（2）…」）、下一大题标题、下一语段
TAIL_PAT = re.compile(
    r"\n{2,}\s*(?=[（(]\d{1,2}[）)]|[一二三四五六七八九十]+\s*、|第[一二三]部分|\\\([A-Da-d]\\\)|\|)"
)
# 只有「（2）…」这种同题小问才还给题干，大题标题/下一语段直接丢掉
SUBQ_START = re.compile(r"^[（(]\d{1,2}[）)]")
# 整卷答案表：「26-30 BBCCA」
ANSWER_TABLE = re.compile(r"(?<!\d)(\d{1,2})\s*[-－—~～]\s*(\d{1,2})\s*[：:]?\s*([A-F]{2,})(?![A-Za-z])")
# 逐题答案块：「41. C 42. C …」
ANSWER_PAIR = re.compile(r"(?<!\d)(\d{1,2})\s*[.．、:：]\s*([A-F])(?![A-Za-z\u4e00-\u9fff])")
# Word 表格/段落标签残渣（英语阅读的选项是从表格格里抽出来的）
TAG_RESIDUE = re.compile(
    r"</?(?:tbody|thead|tfoot|caption|colgroup|col|td|th|tr|table|blockquote|p|span|div|o:p)\b[^>]*>",
    re.I,
)
JIEDA = re.compile(r"【(?:解答|详解)】")
JIEDA_TAIL = re.compile(r"【(?:点评|点睛|考点)】")
PAYLOAD = re.compile(r"故(?:答案|填)\s*(?:为|是)?\s*[:：]\s*")
MARKS = "①②③④⑤⑥⑦⑧⑨⑩"


def clean_option_text(v: str) -> str:
    """去掉选项里的表格/段落标签残渣，只留下题目本身要显示的词句"""
    if not v:
        return v
    v = TAG_RESIDUE.sub("\n", v)
    lines = []
    for ln in v.split("\n"):
        ln = ln.strip().strip("|").strip()
        if ln and not re.fullmatch(r"[-—:：\s]+", ln):
            lines.append(ln)
    v = "\n".join(lines)
    v = strip_empty_tables(v)
    return re.sub(r"\n{2,}", "\n", v).strip()


def fix_options(q: dict, other_stems: list[str]) -> tuple[int, str]:
    """选项修复：切掉粘进来的答案块、拆回被吞的其它选项、把后续小问还给题干。

    返回（是否改动，切出来的答案块原文）。
    """
    if q.get("type") != "choice":
        return 0, ""
    opts = q.get("options") or []
    if len(opts) < 2:
        return 0, ""
    original = [
        {"k": o.get("k"), "md": o.get("md") or "", "html": o.get("html") or ""} for o in opts
    ]

    # ① 先切掉粘在选项尾部的整块答案，记下最早出现的位置：
    #    排在它后面的选项都是别的语段的，属于漏抽，一并丢掉
    leak_from = len(opts)
    leak_text = ""
    for i, o in enumerate(opts):
        v = o.get("md") or ""
        m = LEAK_CUT.search(v)
        if not m:
            continue
        leak_text += "\n\n" + v[m.end():]
        o["md"] = v[: m.start()].rstrip()
        o["html"] = o["md"]
        leak_from = min(leak_from, i)

    # ② 拆回被吞掉的其它选项
    chunks: list[tuple[str, str, int]] = []
    for i, o in enumerate(opts):
        md = (o.get("md") or "").strip()
        if not md:
            continue
        own = (o.get("k") or "").strip().upper()
        marks = [
            (m.start(), m.end(), m.group(1) or "ABCDEFGH"[int(m.group(2)) - 1])
            for m in OPT_MARK.finditer(md)
        ]
        cursor = 0
        bounds = marks + [(len(md), len(md), "")]
        for k, (start, end, letter) in enumerate(bounds):
            text = md[cursor:start].strip()
            tag = own if k == 0 else bounds[k - 1][2]
            if text:
                chunks.append((tag, text, i))
            cursor = end

    # ③ 尾部的后续小问先摘出来，稍后还给题干
    keep: list[tuple[str, str, int]] = []
    tails: list[str] = []
    for tag, text, src in chunks:
        m = TAIL_PAT.search(text)
        if m:
            rest = text[m.start() :].strip()
            text = text[: m.start()].strip()
            # 只有同一题、长度正常的「（2）…」才还给题干；
            # 大题标题、下一语段、表格残渣、网站水印一律不要
            if (
                SUBQ_START.match(rest)
                and len(rest) <= 320
                and not re.search(
                    r"</?t(?:able|body|head|r|d|h)|zxxk|教育资源|中考[化数语英物历政]试卷|第[一二三]卷",
                    rest,
                    re.I,
                )
            ):
                tails.append(clean_option_text(rest))
        text = clean_option_text(text)
        if text:
            keep.append((tag, text, src))

    keep = [c for c in keep if c[2] <= leak_from]
    if len(keep) < 2:
        q["options"] = original
        return 0, leak_text

    q["options"] = [{"k": "ABCDEF"[i], "md": t, "html": t} for i, (_, t, _) in enumerate(keep[:6])]

    # ④ 后续小问补回题干：别的地方已经有同一段就不再重复
    for t in tails:
        probe = re.sub(r"\s+", "", t)[:24]
        if not probe or any(probe in s for s in other_stems):
            continue
        q["stem"] = ((q.get("stem") or "").rstrip() + "\n\n" + t).strip()
        if q.get("stemHtml"):
            q["stemHtml"] = ((q.get("stemHtml") or "").rstrip() + "\n\n" + t).strip()

    changed = q["options"] != original
    return (1 if changed else 0), leak_text


def paper_answer_map(paper: dict) -> tuple[dict[int, str], set[int]]:
    """从整卷文字里找答案表，得到「题号 → 答案字母」。

    「26-30 BBCCA」这种区间表可靠，直接采信；「41. C 42. C …」这种逐题编号
    要求连续三题以上才认，免得把题内的小问序号当成题号。
    """
    texts: list[str] = []
    for q in paper["questions"]:
        texts.append(q.get("answer") or "")
        texts.append(q.get("analysis") or "")
        for o in q.get("options") or []:
            texts.append(o.get("md") or "")
    blob = "\n".join(texts)

    found: dict[int, str] = {}
    strong: set[int] = set()
    for m in ANSWER_TABLE.finditer(blob):
        a, b, letters = int(m.group(1)), int(m.group(2)), m.group(3)
        if b >= a and b - a + 1 == len(letters):
            for i, ch in enumerate(letters):
                found[a + i] = ch
                strong.add(a + i)

    pairs: dict[int, str] = {}
    for m in ANSWER_PAIR.finditer(blob):
        pairs.setdefault(int(m.group(1)), m.group(2))
    nums = sorted(pairs)
    i = 0
    while i < len(nums):
        j = i
        while j + 1 < len(nums) and nums[j + 1] == nums[j] + 1:
            j += 1
        if j - i + 1 >= 3:
            for n in nums[i : j + 1]:
                found.setdefault(n, pairs[n])
        i = j + 1
    return found, strong


def apply_answer_map(q: dict, amap: dict[int, str], strong: set[int]) -> int:
    """用整卷答案表校正选择题答案键；答案字段是整卷答案块时收敛成本题答案"""
    if q.get("type") != "choice" or not amap:
        return 0
    no = q.get("no")
    if no not in amap:
        return 0
    head = re.sub(r"<[^>]+>", "", q.get("stem") or "")[:200]
    if MULTI_PAT.search(head):
        return 0
    new = amap[no]
    cur = (q.get("answerKey") or "").strip().upper()
    if cur and cur != new and no not in strong:
        return 0
    q["answerKey"] = new
    a = q.get("answer") or ""
    if len(ANSWER_PAIR.findall(a)) >= 2 or len(a) > 40:
        q["answer"] = new
        q["answerHtml"] = new
    return 1


def recover_answer(q: dict) -> int:
    """解析里有【解答】但答案是空的：把解答拆成参考答案，解析只留分析部分"""
    if q.get("type") == "choice":
        return 0
    if q.get("answer") or q.get("answerHtml") or q.get("answerKey"):
        return 0
    text = q.get("analysis") or ""
    m = JIEDA.search(text)
    if not m:
        return 0
    body = text[m.end() :]
    tail = ""
    t = JIEDA_TAIL.search(body)
    if t:
        tail = body[t.start() :].strip()
        body = body[: t.start()]
    body = re.sub(r"^\s*解\s*[:：]\s*", "", body.strip()).strip()
    if not body:
        return 0

    payloads = []
    for seg in re.split(r"(?<=[；;。])", body):
        pm = PAYLOAD.search(seg)
        if not pm:
            continue
        # 只取到本句结束：再往后就是下一小问的讲解，混进来会误导对照
        v = re.split(r"[；;。．]|\n{2,}", seg[pm.end() :], maxsplit=1)[0].strip()
        if v:
            payloads.append(v)
    if 2 <= len(payloads) <= 10 and len("".join(payloads)) <= 400:
        # 多空答案用 ①②③ 串起来：前端按标记逐空对照
        q["answer"] = " ".join(MARKS[i] + v for i, v in enumerate(payloads))
    else:
        q["answer"] = body if len(body) <= 800 else body[:800].rstrip() + "…"

    head = text[: m.start()].strip()
    q["analysis"] = "\n\n".join(x for x in (head, tail) if x)
    if q.get("analysisHtml"):
        q["analysisHtml"] = q["analysis"]
    return 1


def main() -> None:
    files = sorted(p for p in DATA.glob("*.json") if p.name not in ("index.json", "questions.json", "tags.json", "version.json"))
    papers = [json.loads(f.read_text(encoding="utf-8")) for f in files]
    dropped: list[str] = []
    for paper in papers:
        dropped += drop_junk(paper)
    flagged = mark_incomplete(papers)

    # 抽取残渣修复：选项拆分 / 答案块回收 / 答案键校正（要在写 index 之前）
    fixed_opts = 0
    tuned_keys = 0
    for paper in papers:
        amap, strong = paper_answer_map(paper)
        stems = [re.sub(r"\s+", "", q.get("stem") or "") for q in paper["questions"]]
        for k, q in enumerate(paper["questions"]):
            others = stems[:k] + stems[k + 1 :]
            changed, leak = fix_options(q, others)
            fixed_opts += changed
            if leak and not q.get("analysis"):
                q["analysis"] = leak.strip()
                q["analysisHtml"] = q["analysis"]
            tuned_keys += apply_answer_map(q, amap, strong)

    flat = []
    tag_counter: dict[str, Counter] = defaultdict(Counter)
    leaks = 0
    recovered = 0
    for f, paper in zip(files, papers):
        subject = paper["subject"]
        canon = CANON.get(subject, set())
        if subject == "chinese":
            # 材料里的注音（流lián）等于把答案写在文段里
            for c in paper.get("contexts") or []:
                for fld in ("md", "html"):
                    if c.get(fld):
                        c[fld] = strip_empty_tables(scrub_pinyin(c[fld]))
        for q in paper["questions"]:
            for fld in ("stem", "stemHtml"):
                if q.get(fld):
                    q[fld] = strip_empty_tables(scrub_pinyin(q[fld]) if subject == "chinese" else q[fld])
            leaks += scrub_question(q)
            scrub_option_noise(q)
            repair_answer_key(q)
            mark_multi(q)
            q["tags"] = tags_for(q, subject)
            # 标签已按原解析算好，之后再拆答案不会影响考点
            recovered += recover_answer(q)
            for fld in ("analysis", "analysisHtml"):
                if q.get(fld):
                    q[fld] = re.sub(r"^\s*【解析】\s*", "", q[fld])
            for t in q["tags"]:
                if t in canon:
                    tag_counter[subject][t] += 1
            flat.append(
                {
                    "id": q["id"],
                    "s": paper["subject"],
                    "p": paper["id"],
                    "y": paper["year"],
                    "n": q["no"],
                    "t": q["type"],
                    "k": q["answerKey"],
                    "sc": q["score"],
                    "g": q["tags"],
                    "a": 1 if (q.get("answer") or q.get("answerHtml") or q.get("answerKey")) else 0,
                    "x": re.sub(r"\s+", " ", re.sub(r"!\[[^\]]*\]\([^)]*\)", "", re.sub(r"<[^>]+>", "", q["stem"])))[:60],
                }
            )
        f.write_text(json.dumps(paper, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    # 试卷索引重算（以实际文件为准）
    index = {"papers": []}
    skipped = []
    skipped_ids: set[str] = set()
    for p in sorted(papers, key=lambda x: (x["subject"], -x["year"])):
        answered = sum(1 for q in p["questions"] if q["answer"] or q["analysis"])
        if len(p["questions"]) < 8 or (answered == 0 and not p.get("answerPages")):
            skipped.append(f'{p["id"]}({len(p["questions"])}题/{answered}答案)')
            skipped_ids.add(p["id"])
            continue
        kinds = Counter(q["type"] for q in p["questions"])
        index["papers"].append(
            {
                "id": p["id"],
                "subject": p["subject"],
                "subjectCn": p["subjectCn"],
                "subjectName": p["subjectName"],
                "color": p["color"],
                "year": p["year"],
                "title": p["title"],
                "fullScore": p["fullScore"],
                "durationMin": p["durationMin"],
                "count": len(p["questions"]),
                "incomplete": bool(p.get("incomplete")),
                "expectedCount": p.get("expectedCount"),
                "choiceCount": kinds.get("choice", 0),
                "withAnswer": sum(1 for q in p["questions"] if q["answer"] or q["analysis"]),
                "contexts": len(p["contexts"]),
                "pages": len(p["pages"]),
                "sections": sorted({q["section"] for q in p["questions"] if q["section"]}),
            }
        )
    (DATA / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")

    # 被跳过的残卷连文件一起清掉：题目太少或整卷没答案，留着只会变成索引里的孤儿题
    for pid in skipped_ids:
        f = DATA / f"{pid}.json"
        if f.exists():
            f.unlink()

    # questions.json / tags.json 只放能练的卷子：被跳过的残卷不放进去，
    # 否则「随机练」和考点页会抽到索引里根本没有的孤儿题
    if skipped_ids:
        flat = [x for x in flat if x["p"] not in skipped_ids]
        tag_counter = defaultdict(Counter)
        for x in flat:
            for t in x["g"]:
                if t in CANON.get(x["s"], set()):
                    tag_counter[x["s"]][t] += 1
    tags = {s: [{"name": n, "count": c} for n, c in c.most_common()] for s, c in tag_counter.items()}
    (DATA / "questions.json").write_text(json.dumps({"questions": flat}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (DATA / "tags.json").write_text(json.dumps(tags, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"papers={len(index['papers'])}/{len(papers)} questions={len(flat)}")
    print(f"  擦掉题干/材料里的答案泄露 {leaks} 处")
    print(f"  选项拆分修复 {fixed_opts} 题，答案键校正 {tuned_keys} 题，从解析里补回答案 {recovered} 题")
    if dropped:
        print(f"  丢掉抽取残渣 {len(dropped)} 条:", "，".join(dropped))
    if flagged:
        print("  残缺卷（可练不可估分）:", "，".join(flagged))
    if skipped:
        print("  跳过（题目/答案严重缺失）:", "，".join(skipped))
    for s, c in tag_counter.items():
        print(f"  {s}: {sum(c.values())} tagged / top: {', '.join(f'{n}({v})' for n, v in c.most_common(6))}")


if __name__ == "__main__":
    main()
