"""用本机 VOICEVOX 引擎给可商用词库批量合成发音（单词 + 例句），输出 MP3。

先启动引擎（默认 http://127.0.0.1:50021），再运行：
  python tts_voicevox.py <OpenJLPT 的 n2.json> <输出目录 audio/n2> <speaker id> [--limit N]
已经生成过的文件会跳过，中断后重跑即可续上。
需要 lameenc（pip install --user lameenc）。
"""
import io, json, re, sys, time, wave, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import lameenc

ENGINE = "http://127.0.0.1:50021"
src, out_dir, speaker = sys.argv[1], Path(sys.argv[2]), int(sys.argv[3])
limit = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else None


def post(path, params, body=None):
    url = f"{ENGINE}{path}?{urllib.parse.urlencode(params)}"
    data = json.dumps(body).encode() if body is not None else b""
    req = urllib.request.Request(url, data=data, method="POST", headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def query(text):
    return json.loads(post("/audio_query", {"text": text, "speaker": speaker}))


def to_kata(s):
    return "".join(chr(ord(c) + 0x60) if "ぁ" <= c <= "ゖ" else c for c in s)


def word_query(word, reading):
    """汉字原文读出来的假名和词库读音一致就用原文（声调更准），否则改用读音合成"""
    q = query(word)
    said = re.sub(r"[^ァ-ヴー]", "", q.get("kana", ""))
    want = re.sub(r"[^ァ-ヴー]", "", to_kata(reading))
    return (q, True) if said == want else (query(reading), False)


def mp3(wav_bytes):
    with wave.open(io.BytesIO(wav_bytes)) as w:
        rate, ch, pcm = w.getframerate(), w.getnchannels(), w.readframes(w.getnframes())
    enc = lameenc.Encoder()
    enc.set_bit_rate(48); enc.set_in_sample_rate(rate); enc.set_channels(ch); enc.set_quality(2)
    return enc.encode(pcm) + enc.flush()


def synth(q, path, pad=0.1):
    q.update(outputSamplingRate=24000, outputStereo=False, prePhonemeLength=pad, postPhonemeLength=pad)
    path.write_bytes(mp3(post("/synthesis", {"speaker": speaker}, q)))


items = json.load(open(src, encoding="utf-8"))[:limit]
(out_dir / "w").mkdir(parents=True, exist_ok=True)
(out_dir / "e").mkdir(parents=True, exist_ok=True)

jobs = []
for x in items:
    jobs.append(("w", x["id"], x["word"], x["reading"], out_dir / "w" / f"{x['id']}.mp3"))
    for i, e in enumerate(x.get("examples", [])):
        jobs.append(("e", x["id"], e["ja"], None, out_dir / "e" / f"{x['id']}_{i}.mp3"))
todo = [j for j in jobs if not j[4].exists()]
print(f"{len(jobs)} clips, {len(jobs) - len(todo)} already done, {len(todo)} to go", flush=True)

fallback = []


def run(job):
    kind, wid, text, reading, path = job
    for attempt in range(3):
        try:
            if kind == "w":
                q, ok = word_query(text, reading)
                if not ok:
                    fallback.append(text)
            else:
                q = query(text)
            synth(q, path)
            return
        except Exception as err:          # 引擎偶尔超时，重试
            if attempt == 2:
                print("FAIL", text, err, flush=True)
            time.sleep(2)


t0 = time.time()
with ThreadPoolExecutor(max_workers=2) as pool:
    for n, _ in enumerate(pool.map(run, todo), 1):
        if n % 100 == 0 or n == len(todo):
            el = time.time() - t0
            print(f"{n}/{len(todo)}  {el/60:.1f} min  eta {el/n*(len(todo)-n)/60:.1f} min", flush=True)

print(f"done. words read via kana fallback: {len(fallback)} e.g. {fallback[:10]}")
