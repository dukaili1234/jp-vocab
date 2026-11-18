"""可商用词库：OpenJLPT（单词、读音、词性、Tatoeba 例句） + 自己编写的中文释义/例句翻译 → words-open.js

来源与许可：
  OpenJLPT  https://github.com/evanclan/OpenJLPT  CC BY-SA 4.0
            （含 Jonathan Waller JLPT 词表 CC BY、JMdict CC BY-SA 4.0、Tatoeba CC BY 2.0 FR）
  中文释义/例句翻译  data/open/zh-n2.jsonl，本项目原创
  合并后的词库按 CC BY-SA 4.0 发布。

用法: python build_open.py <OpenJLPT 的 n2.json> <中文 jsonl> <输出 words-open.js> [音频目录 audio/n2]
      给了音频目录时，存在的 w/<id>.mp3、e/<id>_<序号>.mp3 会写进词条
"""
import json, re, sys
from pathlib import Path

src, zh_path, out = sys.argv[1:4]
audio_dir = Path(sys.argv[4]) if len(sys.argv) > 4 else None
has_audio = lambda rel: bool(audio_dir) and (audio_dir / rel).exists()

items = json.load(open(src, encoding="utf-8"))
zh = {}
for line in open(zh_path, encoding="utf-8"):
    if line.strip():
        x = json.loads(line)
        zh[x["id"]] = x


def pos_label(codes):
    """JMdict 词性代码 → 卡片上的简写，如 ["n","vs","vt"] → 名・他サ"""
    c = set(codes)
    parts = []
    if "n" in c or c == {"adj-no"}:            # 只有 adj-no（～の）的也按名词显示
        parts.append("名")
    kind = ("五" if any(x.startswith("v5") for x in c) else "一" if "v1" in c else
            "サ" if any(x.startswith("vs") for x in c) else "ザ" if "vz" in c else "カ" if "vk" in c else "")
    if kind:
        tr = "自他" if {"vt", "vi"} <= c else "他" if "vt" in c else "自" if "vi" in c else ""
        parts.append(tr + kind)
    for code, label in [("adj-na", "ナ形"), ("adj-i", "イ形"), ("adj-pn", "連体"), ("adj-f", "連体"), ("adv", "副"), ("adv-to", "副"),
                        ("conj", "接"), ("int", "感"), ("pn", "代"), ("ctr", "助数"),
                        ("pref", "接頭"), ("suf", "接尾"), ("n-suf", "接尾"), ("exp", "連語")]:
        if code in c and label not in parts:
            parts.append(label)
    return "・".join(parts)


def segments(ex):
    """OpenJLPT 振假名 {漢字|かな} → [(文字, 读音或 None)]，没有振假名就整句一段"""
    f = ex.get("furigana")
    if not f:
        return [(ex["ja"], None)]
    segs, pos = [], 0
    for m in re.finditer(r"\{([^|}]+)\|([^}]+)\}", f):
        if m.start() > pos:
            segs.append((f[pos:m.start()], None))
        ruby = m.group(2) if re.fullmatch(r"[ぁ-ゟ゠-ヿー]+", m.group(2)) else None   # 原数据偶有 #1392580 这种残留
        segs.append((m.group(1), ruby))
        pos = m.end()
    if pos < len(f):
        segs.append((f[pos:], None))
    return segs


def find_span(ja, x):
    """在例句里找目标词的位置（动词、形容词变形时退回词干）"""
    forms = [x["word"], *x.get("other_forms", []), x["reading"]]
    for w in forms:
        i = ja.find(w)
        if i >= 0:
            return i, i + len(w)
    if any(p.startswith(("v", "adj-i")) for p in x.get("pos", [])):
        for w in forms:
            stem = w[:-1]
            if len(stem) >= 2 or re.search(r"[一-龯々]", stem):
                i = ja.find(stem)
                if i >= 0:
                    return i, i + len(stem)
    return None


def find_span_by_reading(units, x):
    """例句用了同词的别的汉字（明き/空き、暖める/温める）时，用注音拼出的读音串来找"""
    kana = [r or t for t, r in units]
    starts, pos = [], 0
    for k in kana:
        starts.append(pos); pos += len(k)
    text = "".join(kana)
    r = x["reading"]
    for key in (r, r[:-1] if len(r) > 2 else r):
        i = text.find(key)
        if i < 0:
            continue
        # 换算回原文位置：取覆盖 [i, i+len) 的单位
        plain_at, s0, s1 = 0, None, None
        for (t, _), st, k in zip(units, starts, kana):
            if st < i + len(key) and st + len(k) > i:
                s0 = plain_at if s0 is None else s0
                s1 = plain_at + len(t)
            plain_at += len(t)
        return (s0, s1) if s0 is not None else None
    return None


def sentence(ex, x):
    """拼成 App 的格式：漢字[かな]，目标词用 {} 包起来"""
    units = []                                     # 注音的汉字整段算一个单位，其余逐字
    for text, ruby in segments(ex):
        units += [(text, ruby)] if ruby else [(ch, None) for ch in text]
    span = find_span("".join(t for t, _ in units), x) or find_span_by_reading(units, x)
    out, at, opened = [], 0, False
    for text, ruby in units:
        inside = bool(span) and at < span[1] and at + len(text) > span[0]
        if inside != opened:
            out.append("{" if inside else "}")
            opened = inside
        # App 把 [读音] 前面连续的汉字都当成注音对象，前面紧挨着别的汉字时插一个零宽空格隔开
        if ruby and out and re.search(r"[一-龯々〆ヵヶ0-9０-９]$", out[-1]):
            out.append("​")
        out.append(f"{text}[{ruby}]" if ruby else text)
        at += len(text)
    if opened:
        out.append("}")
    return "".join(out)


words, missing = [], []
for x in items:
    z = zh.get(x["id"])
    if not z:
        missing.append(x["word"])
        continue
    exs = [[sentence(e, x), z["ex"][i] if i < len(z["ex"]) else "",
            f"e/{x['id']}_{i}.mp3" if has_audio(f"e/{x['id']}_{i}.mp3") else ""]
           for i, e in enumerate(x.get("examples", []))]
    reading = x["reading"] if x["reading"] != x["word"] else x["word"]
    words.append([x["word"], reading, pos_label(x.get("pos", [])), z["meaning"], x["level"], "",
                  exs, "", "", "", "", f"w/{x['id']}.mp3" if has_audio(f"w/{x['id']}.mp3") else ""])

with open(out, "w", encoding="utf-8") as f:
    f.write("// 自动生成，勿手改。CC BY-SA 4.0：OpenJLPT（Waller JLPT 词表、JMdict、Tatoeba）+ 本项目原创中文释义\n")
    f.write("// 字段同 words.js：[单词, 读音, 词性, 释义, 级别, 分类, [[例句, 译文, 例句音频]...], 反义, 关联, 词源, 声调, 单词音频]\n")
    f.write("window.WORDS=")
    json.dump(words, f, ensure_ascii=False, separators=(",", ":"))
    f.write(";\n")
print(f"{len(words)} words, {sum(len(w[6]) for w in words)} examples, missing zh: {len(missing)} {missing[:5]}")
