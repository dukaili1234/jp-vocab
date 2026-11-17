"""把「蛋卷」JLPT 卡组的 notes.csv 转成 App 用的 words.js（N2 + N1）。

数据来源: https://github.com/firavoyage/_anki-jlpt-decks  (CC BY-NC 4.0)
用法: python build_words.py <notes.csv> <输出 words.js>
"""
import csv, json, re, sys

src, out = sys.argv[1], sys.argv[2]

CAT = {"必考": "必考", "核心": "核心", "真题词汇补充": "真题", "补充": "范围外"}
KANA = re.compile(r"[ぁ-ゟ゠-ヿ]")


def clean(s):
    s = re.sub(r"<br\s*/?>", "；", s or "")
    s = re.sub(r"<(?!/?b>)[^>]+>", "", s)          # 只保留 <b>
    return s.replace("&nbsp;", " ").strip()


def furi(s):
    """Anki 振假名格式 → 紧凑格式：<b>…</b> 变成 {…}，去掉分隔空格"""
    s = clean(s).replace("<b>", "{").replace("</b>", "}")
    return re.sub(r" (?=\{|[^ \[\]{}]+\[)", "", s).strip()


def pos(p):
    p = re.sub(r"[①-⑳⓪]", "", p)
    return p.replace("動1", "五").replace("動2", "一").replace("動3", "サ")


words, seen = [], set()
lines = (l for l in open(src, encoding="utf-8") if not l.startswith("#"))
for r in csv.reader(lines):
    m = re.match(r"NEW-JLPT::NEW-(N[12])::NEW-N[12]-(.+)", r[0])
    if not m:
        continue
    level, cat = m.group(1), CAT[m.group(2)]
    word = re.sub(r"\[.*?\]", "", clean(r[2]))
    if (word, level) in seen:
        continue
    seen.add((word, level))

    reading, origin = clean(r[5]), ""
    if not KANA.search(reading):                    # 外来语：这一栏是词源
        reading, origin = word, reading

    exs, ant, rel = [], [], []
    if r[11]:
        exs.append([furi(r[12] or r[11]), clean(r[13])])
    for i in (16, 22, 28):                          # 后面三组：例句 / 対 / 関
        kind, plain, fu, zh = r[i], r[i + 1], r[i + 2], clean(r[i + 3])
        if not plain:
            continue
        if kind == "対":
            ant.append(clean(plain))
        elif kind == "関":
            rel.append(f"{clean(plain)}（{zh}）" if zh else clean(plain))
        else:
            exs.append([furi(fu or plain), zh])

    words.append([word, reading, pos(clean(r[4])), clean(r[6]), level, cat,
                  exs, "、".join(ant), "、".join(rel), origin])

with open(out, "w", encoding="utf-8") as f:
    f.write("// 自动生成，勿手改。来源：firavoyage/_anki-jlpt-decks（CC BY-NC 4.0）\n")
    f.write("// 字段：[单词, 读音, 词性, 释义, 级别, 分类, [[例句, 译文]...], 反义, 关联, 词源]\n")
    f.write("window.WORDS=")
    json.dump(words, f, ensure_ascii=False, separators=(",", ":"))
    f.write(";\n")

from collections import Counter
print(len(words), Counter((w[4], w[5]) for w in words))
