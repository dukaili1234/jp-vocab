// ===== 词库 =====
// words.js 由 tools/build_words.py 生成：
// [单词, 读音, 词性, 释义, 级别, 分类, [[例句, 译文, 例句音频]...], 反义, 关联, 词源, 声调, 单词音频]
const BUILTIN = (window.WORDS || []).map(([word, reading, pos, meaning, level, cat, exs, ant, rel, origin, accent, audio]) =>
  ({ word, reading, pos, meaning, level, cat, exs, ant, rel, origin, accent, audio }));
const DB = window.VOCAB_DB || "vocab";
const CATS = ["全部", ...["必考", "核心", "真题", "范围外"].filter(c => BUILTIN.some(w => w.cat === c)), "我的"];
const LEVELS = ["N2", "N1"].filter(l => BUILTIN.some(w => w.level === l));
const CREDITS = {
  vocab: `词库：<a href="https://github.com/firavoyage/_anki-jlpt-decks" target="_blank">蛋卷 JLPT 词库</a>（CC BY-NC 4.0）`,
  open: `词库：<a href="https://github.com/evanclan/OpenJLPT" target="_blank">OpenJLPT</a>（含 Waller JLPT 词表、JMdict/EDRDG、Tatoeba）+ 原创中文释义 ·
         <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.zh-hans" target="_blank">CC BY-SA 4.0</a><br>
         发音：<a href="https://voicevox.hiroshiba.jp/" target="_blank">VOICEVOX</a>:冥鳴ひまり`,
};
const SIZES = [10, 20, 50, 100];
const NEW_LIMITS = [10, 20, 30, 50, 100];
// 记忆曲线：到达第 n 阶段后，隔 INTERVALS[n] 天再复习
const INTERVALS = [1, 1, 2, 4, 7, 15, 30, 60, 120];
const MASTERED = 5;   // 复习间隔 ≥ 15 天算已掌握
const DAY = 864e5;
const today = () => new Date().setHours(0, 0, 0, 0);
const dayKey = (t = Date.now()) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// ===== 存储 =====
const LS = {
  key: k => k.replace(/^vocab\./, DB + "."),     // 不同词库的学习记录分开存
  get(k, d) { try { return JSON.parse(localStorage.getItem(LS.key(k))) ?? d; } catch { return d; } },
  set(k, v) { localStorage.setItem(LS.key(k), JSON.stringify(v)); },
  del(k) { localStorage.removeItem(LS.key(k)); },
};
// 旧版自定义单词是 ex/exZh 字段，统一成 exs
let custom = LS.get("vocab.custom", []).map(w => ({ cat: "我的", exs: w.ex ? [[w.ex, w.exZh]] : [], ...w }));
let status = LS.get("vocab.status", {});   // word -> { ok, ng, last: 'ok'|'mid'|'ng', stage, due, day }
// 旧版学习记录没有排期：都安排在今天复习
for (const s of Object.values(status)) if (s.stage == null) { s.stage = s.last === "ok" ? 1 : 0; s.due = today(); }
let newLog = LS.get("vocab.newLog", { date: 0, n: 0 }); // 今天学了几个新词
let daily  = LS.get("vocab.daily", {});    // "2026-11-17" -> { n: 新词, r: 复习, a: 作答次数, ok: 答对次数 }
let level  = LS.get("vocab.level", LEVELS[0] || "全部");
if (level !== "全部" && !LEVELS.includes(level)) level = LEVELS[0] || "全部";
let cat    = LS.get("vocab.cat", "全部");
let mode   = LS.get("vocab.mode", "cover"); // cover: 先看单词再翻开; open: 直接全显示（只对 日→中 生效）
let dir    = LS.get("vocab.dir", "jp");     // jp: 日→中 / zh: 中→日 / listen: 听音
let size   = LS.get("vocab.size", 20);
let newLimit = LS.get("vocab.newLimit", 20);
let autoplay = LS.get("vocab.autoplay", false);

// ===== 外观：卡片风格（深蓝 / 手账）× 夜间模式（关 / 开 / 跟随系统）=====
// 存在 ui.* 下，两个词库共用；网址 ?theme=techou 可以临时预览手账风
let theme = new URLSearchParams(location.search).get("theme") || LS.get("ui.theme", "default");
let night = LS.get("ui.night", "off");
const darkQuery = matchMedia("(prefers-color-scheme: dark)");
let techouFonts = false;

function applyLook() {
  document.body.classList.toggle("techou", theme === "techou");
  document.body.classList.toggle("night", night === "on" || (night === "auto" && darkQuery.matches));
  // 手机状态栏跟着背景色走
  document.querySelector('meta[name="theme-color"]').content = getComputedStyle(document.body).backgroundColor;
  if (theme === "techou" && !techouFonts) {      // 手账风的字体用到时才加载
    techouFonts = true;
    for (const href of ["https://cdn.jsdelivr.net/npm/@fontsource/klee-one@5.3.1/400.css",
                        "https://cdn.jsdelivr.net/npm/@fontsource/klee-one@5.3.1/600.css",
                        "https://cdn.jsdelivr.net/npm/lxgw-wenkai-screen-webfont@1.7.0/lxgwwenkaigbscreen.css"])
      document.head.insertAdjacentHTML("beforeend", `<link rel="stylesheet" href="${href}">`);
  }
}
darkQuery.addEventListener("change", applyLook);
applyLook();

const allWords = () => [...BUILTIN, ...custom];
const pool = () => allWords().filter(w => (level === "全部" || w.level === level) && (cat === "全部" || w.cat === cat));
let queue = [], idx = 0, groupLen = 0, revealed = false;

const newToday = () => newLog.date === today() ? newLog.n : 0;
const isDue = w => status[w.word] && status[w.word].due <= Date.now();

// 每组：先复习到期的词（越早到期越先），再补今天额度内的新词；extra = 超出每日额度再学一组
function buildQueue(extra = false) {
  const list = pool();
  const due = list.filter(isDue).sort((a, b) => status[a.word].due - status[b.word].due).slice(0, size);
  const room = Math.min(size - due.length, extra ? size : Math.max(0, newLimit - newToday()));
  const fresh = list.filter(w => !status[w.word]).slice(0, room);
  queue = [...due, ...fresh];
  idx = 0; groupLen = queue.length;
  render();
}

// 不认识：回到第 0 阶段，明天再看；模糊：退一阶；认识：进一阶（新词第一次就认识，进两阶）
function schedule(s, grade) {
  const step = s.due == null ? 2 : 1;
  const stage = grade === 0 ? 0 : grade === 1 ? Math.max(1, s.stage - 1) : Math.min(INTERVALS.length - 1, s.stage + step);
  return { stage, days: INTERVALS[stage] };
}
const fmtDays = d => d <= 1 ? "明天" : d < 30 ? `${d} 天后` : `${Math.round(d / 30)} 个月后`;

// ===== 发音：读不到音频文件就用浏览器朗读 =====
// 蛋卷词库：真人录音，不复制到本仓库，直接引用原作者仓库
// 可商用词库：本仓库 audio/ 下用 VOICEVOX 合成的音频
// 播放过的存进 Cache，离线也能听
const AUDIO_BASES = DB === "open" ? ["audio/n2/"] : [
  "https://raw.githubusercontent.com/firavoyage/_anki-jlpt-decks/main/NEW-JLPT/medias/",
  "https://cdn.jsdelivr.net/gh/firavoyage/_anki-jlpt-decks@main/NEW-JLPT/medias/",
];
const AUDIO_CACHE = "audio-cache";
const player = new Audio();
let playToken = 0, lastBlob = null;

async function fetchAudio(file) {
  const cache = window.caches && await caches.open(AUDIO_CACHE).catch(() => null);
  for (const base of AUDIO_BASES) {
    const url = base + file.split("/").map(encodeURIComponent).join("/");
    const hit = cache && await cache.match(url);
    if (hit) return hit;
    try {
      const res = await fetch(url, AbortSignal.timeout ? { signal: AbortSignal.timeout(6000) } : {});
      if (!res.ok) continue;
      if (cache) await cache.put(url, res.clone());
      return res;
    } catch { /* 换下一个地址 */ }
  }
  return null;
}

async function play(file, text) {
  const token = ++playToken;
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  player.pause();
  const res = file && await fetchAudio(file).catch(() => null);
  if (token !== playToken) return;               // 期间又点了别的
  if (!res) return speak(text);
  if (lastBlob) URL.revokeObjectURL(lastBlob);
  player.src = lastBlob = URL.createObjectURL(await res.blob());
  player.play().catch(e => { if (token === playToken && e.name !== "AbortError") speak(text); });
}

function speak(text) {
  if (!("speechSynthesis" in window) || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ja-JP"; u.rate = 0.9;
  const v = speechSynthesis.getVoices().find(v => v.lang.startsWith("ja"));
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}

// iOS 要求音频元素先在一次点击里播放过，之后才允许程序自动播放：首次点击时播一段静音
function silentWav() {
  const b = new Uint8Array(46), v = new DataView(b.buffer);
  const str = (o, t) => [...t].forEach((c, i) => b[o + i] = c.charCodeAt(0));
  str(0, "RIFF"); v.setUint32(4, 38, true); str(8, "WAVE"); str(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, 2, true);
  return URL.createObjectURL(new Blob([b], { type: "audio/wav" }));
}
document.addEventListener("pointerdown", () => { player.src = silentWav(); player.play().catch(() => {}); }, { once: true });

const playWord = w => play(w.audio, w.reading || w.word);

// ===== 渲染 =====
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// 例句：{高亮} 和 漢字[かな] 振假名
const sentence = s => esc(s)
  .replace(/([0-9０-９一-龯々〆ヵヶ]+)\[([^\]]+)\]/g, "<ruby>$1<rt>$2</rt></ruby>")
  .replace(/\{(.+?)\}/g, "<b>$1</b>");

function renderFilters() {
  const lvs = LEVELS.length > 1 ? [...LEVELS, "全部"] : LEVELS;
  $("levels").innerHTML = lvs.map(l => `<button class="chip ${l === level ? "active" : ""}" data-lv="${l}">${l}</button>`).join("");
  $("cats").innerHTML = CATS.map(c => `<button class="chip ${c === cat ? "active" : ""}" data-cat="${c}">${c}</button>`).join("");
  document.querySelectorAll("#dirs button").forEach(b => b.classList.toggle("active", b.dataset.dir === dir));
}

function render() {
  renderFilters();
  const list = pool();
  const learned  = list.filter(w => status[w.word]);
  const mastered = learned.filter(w => status[w.word].stage >= MASTERED).length;
  const dueNow   = learned.filter(isDue).length;
  const fresh    = list.length - learned.length;
  $("stats").textContent = `今日待复习 ${dueNow} · 今日新词 ${newToday()}/${newLimit} · 学习中 ${learned.length - mastered} · 已掌握 ${mastered} / ${list.length}`;
  $("progText").textContent = `${Math.min(idx, groupLen)} / ${groupLen}`;
  $("bar").style.width = groupLen ? (Math.min(idx, groupLen) / groupLen * 100) + "%" : 0;

  if (idx >= queue.length) {
    const more = dueNow > 0 || (fresh > 0 && newToday() < newLimit);
    const tomorrow = learned.filter(w => status[w.word].due < today() + 2 * DAY).length;
    const btn = (text, extra) => `<button class="btn yes" style="padding:12px 28px;margin-top:10px" onclick="buildQueue(${extra})">${text}</button>`;
    $("stage").innerHTML = !list.length ? `<div class="done"><p>这个分类下还没有单词</p></div>`
      : more ? `<div class="done"><h2>🎉 这一组完成啦</h2>
         <p>还有 <b style="color:var(--red)">${dueNow}</b> 个待复习，今日新词还剩 ${Math.max(0, newLimit - newToday())} 个</p>${btn("下一组", false)}</div>`
      : `<div class="done"><h2>✅ 今天的任务完成了</h2>
         <p>明天有 <b style="color:var(--red)">${tomorrow}</b> 个词要复习</p>
         ${fresh ? btn("再学一组新词", true) : ""}</div>`;
    $("actions").style.visibility = "hidden";
    return;
  }
  $("actions").style.visibility = "visible";
  const w = queue[idx];
  revealed = dir === "jp" && mode === "open";

  const reading = [w.reading !== w.word ? w.reading : "", w.accent].filter(Boolean).join(" ");
  const meta = [esc(reading), esc(w.pos), esc(w.origin)].filter(Boolean).join(`<span class="sep">|</span>`);
  const wordRow = `<div class="word-row">
      <div class="word ${w.word.length > 6 ? "long" : ""}">${esc(w.word)}</div>
      <span class="badge">${esc(w.level)}</span>
      <button class="speak" data-play="word" title="发音">🔊</button>
    </div>`;
  const exs = (w.exs || []).slice(0, 2).map(([jp, zh, audio], i) =>
    `<div class="example">${audio ? `<button class="ex-play" data-play="ex${i}" title="例句发音">🔊</button>` : ""}
      <div class="jp">${sentence(jp)}</div>${zh ? `<div class="zh">${esc(zh)}</div>` : ""}</div>`).join("");
  const rel = [w.ant && `<div>反义：${esc(w.ant)}</div>`, w.rel && `<div>关联：${esc(w.rel)}</div>`, w.syn && `<div>近义：${esc(w.syn)}</div>`].filter(Boolean).join("");
  const tail = `${exs}${rel ? `<div class="rel"><div class="rel-title">★ 顺便记</div>${rel}</div>` : ""}`;
  // 手账主题：释义用荧光笔，按单词固定一种颜色（黄 / 粉 / 绿 / 蓝）
  const hl = [...w.word].reduce((a, c) => a + c.charCodeAt(0), 0) % 4;
  const meaning = `<span class="hl hl${hl}">${esc(w.meaning)}</span>`;
  const metaHtml = meta ? `<div class="meta">${meta}</div>` : "";

  // 三种方向：正面露出什么，翻开后补上什么
  const [front, back, hint] = {
    jp:     [wordRow, `${metaHtml}<div class="meaning">${meaning}</div>${tail}`, "点击卡片查看释义"],
    zh:     [`<div class="prompt-zh">${meaning}</div><div class="prompt-pos">${esc(w.pos)}</div>`,
             `${wordRow}${metaHtml}${tail}`, "想一想日语怎么说，再点击卡片"],
    listen: [`<button class="listen-btn" data-play="word" title="再听一遍">🔊</button>`,
             `${wordRow}${metaHtml}<div class="meaning">${meaning}</div>${tail}`, "听发音想意思，再点击卡片"],
  }[dir];

  $("stage").innerHTML = `
    <div class="card in ${revealed ? "" : "covered"}" id="card">
      <i class="tape tape-l"></i><i class="tape tape-r"></i>
      <span class="tag"><span class="kicker">日本語ノート </span>${esc(w.level)}<span class="tag-suffix"> 词汇卡</span></span><span class="cat">${esc(w.cat)}</span>
      ${front}
      <div class="hidden-area">${back}</div>
      <div class="tap-hint">${hint}</div>
    </div>`;
  // 按钮上提示「下次什么时候复习」
  const s = status[w.word] || { stage: 0 };
  document.querySelectorAll("#actions .btn").forEach(b => {
    const g = +b.dataset.grade;
    b.querySelector("small").textContent = g === 0 ? "稍后再来" : fmtDays(schedule(s, g).days);
  });
  bindCard();

  if (dir === "listen" || (autoplay && revealed)) playWord(w);
  // 顺手把下一张的单词音频拉进缓存，点的时候不用等
  const next = queue[idx + 1];
  if (next?.audio) fetchAudio(next.audio).catch(() => {});
}

function bindCard() {
  const card = $("card");
  card.onclick = e => {
    const btn = e.target.closest("[data-play]");
    const w = queue[idx];
    if (btn) {
      const k = btn.dataset.play;
      if (k === "word") playWord(w);
      else { const ex = w.exs[+k.slice(2)]; play(ex[2], ex[0].replace(/\[[^\]]*\]|[{}]/g, "")); }
      return;
    }
    if (!card.classList.contains("covered")) return;
    revealed = true; card.classList.remove("covered");
    if (autoplay && dir !== "listen") playWord(w);
  };

  // 左右滑动：左 = 不认识，右 = 认识
  let sx = null;
  card.addEventListener("touchstart", e => sx = e.touches[0].clientX, { passive: true });
  card.addEventListener("touchend", e => {
    if (sx == null) return;
    const dx = e.changedTouches[0].clientX - sx; sx = null;
    if (Math.abs(dx) > 70) answer(dx > 0 ? 2 : 0);
  });
}

// grade：0 不认识 / 1 模糊 / 2 认识
function answer(grade) {
  const w = queue[idx]; if (!w) return;
  let s = status[w.word];
  const d = daily[dayKey()] ||= { n: 0, r: 0, a: 0, ok: 0 };
  if (!s) {
    s = { ok: 0, ng: 0, stage: 0 };
    newLog = { date: today(), n: newToday() + 1 }; LS.set("vocab.newLog", newLog);
    d.n++;
  } else if (s.day !== today()) d.r++;           // 同一个词一天只算一次复习
  d.a++; if (grade > 0) d.ok++;
  LS.set("vocab.daily", daily);

  const { stage, days } = schedule(s, grade);
  grade === 0 ? s.ng++ : s.ok++;
  Object.assign(s, { stage, due: today() + days * DAY, last: ["ng", "mid", "ok"][grade], day: today() });
  status[w.word] = s; LS.set("vocab.status", status);
  // 不认识的词，过几张后再出现一次
  if (grade === 0) queue.splice(Math.min(idx + 4, queue.length), 0, w);
  $("card").classList.add(grade === 0 ? "out-left" : "out-right");
  setTimeout(() => { idx++; render(); }, 220);
}

// ===== 面板 =====
function openPanel(html) { $("panel").onclick = null; $("panel").innerHTML = html; $("panel").classList.add("show"); $("mask").classList.add("show"); }
function closePanel() { $("panel").classList.remove("show"); $("mask").classList.remove("show"); }

function showList() {
  const words = pool();
  const tag = w => {
    const s = status[w.word];
    if (!s) return `<span class="st new">未学</span>`;
    const next = s.due <= Date.now() ? "今天复习" : fmtDays(Math.round((s.due - today()) / DAY)) + "复习";
    if (s.stage >= MASTERED) return `<span class="st ok">已掌握 · ${next}</span>`;
    return `<span class="st ${s.last === "ng" ? "ng" : "learn"}">${next}</span>`;
  };
  const LIMIT = 200;
  openPanel(`<h3>单词本（${level} · ${cat} · ${words.length}）</h3>
    <input class="search" id="q" placeholder="搜索单词 / 读音 / 中文">
    <div id="listBody"></div>
    <div class="backup">
      <button class="btn mid" id="btnExport">导出学习记录</button>
      <button class="btn mid" id="btnImport">导入学习记录</button>
    </div>
    <button class="link" style="margin-top:12px" id="btnReset">清空学习记录</button>`);
  const draw = () => {
    const q = $("q").value.trim();
    const hit = q ? words.filter(w => w.word.includes(q) || w.reading.includes(q) || w.meaning.includes(q)) : words;
    $("listBody").innerHTML = hit.slice(0, LIMIT).map(w => `
      <div class="list-item"><div><span class="w">${esc(w.word)}</span><span class="r">${esc(w.reading)}</span>
      <div style="color:#6b7a90;font-size:13px">${esc(w.meaning)}</div></div>${tag(w)}</div>`).join("") +
      (hit.length > LIMIT ? `<div class="more">还有 ${hit.length - LIMIT} 个，输入关键词搜索</div>` : "");
  };
  $("q").oninput = draw; draw();
  $("btnExport").onclick = exportData;
  $("btnImport").onclick = importData;
  $("btnReset").onclick = () => {
    if (!confirm("确定清空全部学习记录？")) return;
    status = {}; daily = {}; newLog = { date: 0, n: 0 };
    ["vocab.status", "vocab.daily", "vocab.newLog"].forEach(LS.del);
    closePanel(); buildQueue();
  };
}

function showSettings() {
  const chips = (key, opts, cur, fmt = v => v) =>
    `<div class="chips small">${opts.map(v => `<button class="chip ${v === cur ? "active" : ""}" data-set="${key}" data-val='${JSON.stringify(v)}'>${fmt(v)}</button>`).join("")}</div>`;
  openPanel(`<h3>设置</h3>
    <div class="set-row"><div class="label">卡片风格</div>${chips("theme", ["default", "techou"], theme, v => v === "techou" ? "手账" : "深蓝")}</div>
    <div class="set-row"><div class="label">夜间模式</div>${chips("night", ["off", "on", "auto"], night, v => ({ off: "关", on: "开", auto: "跟随系统" })[v])}</div>
    <div class="set-row"><div class="label">每组数量</div>${chips("size", SIZES, size)}</div>
    <div class="set-row"><div class="label">每日新词上限</div>${chips("newLimit", NEW_LIMITS, newLimit)}</div>
    <div class="set-row"><div class="label">日 → 中 时的显示方式</div>
      ${chips("mode", ["cover", "open"], mode, v => v === "cover" ? "先看单词，点开看释义" : "全部直接显示")}</div>
    <div class="set-row"><div class="label">翻开卡片时自动发音</div>${chips("autoplay", [true, false], autoplay, v => v ? "开" : "关")}
      <div class="hint">${DB === "open" ? "单词和例句都是 VOICEVOX 合成语音。" : "单词是真人录音（大部分来自 NHK），例句是 VOICEPEAK 合成语音，都从原词库仓库读取。"}听过的会存在本机，之后断网也能听。读取失败时改用浏览器自带朗读。</div></div>
    <div class="set-row"><button class="link" id="btnClearAudio" style="padding:0">清除已缓存的发音</button></div>`);
  $("panel").onclick = async e => {
    const b = e.target.closest("[data-set]");
    if (b) {
      const k = b.dataset.set, v = JSON.parse(b.dataset.val);
      if (k === "theme" || k === "night") {        // 外观：只重画，不打乱这一组
        k === "theme" ? theme = v : night = v;
        LS.set("ui." + k, v);
        applyLook(); showSettings(); render();
        return;
      }
      ({ size: () => size = v, newLimit: () => newLimit = v, mode: () => mode = v, autoplay: () => autoplay = v })[k]();
      LS.set("vocab." + k, v);
      showSettings(); buildQueue();
    } else if (e.target.id === "btnClearAudio" && window.caches) {
      await caches.delete(AUDIO_CACHE); e.target.textContent = "已清除";
    }
  };
}

// ===== 学习统计 =====
// 配色已用 dataviz 校验脚本验证：新词/复习两色通过色盲区分与对比度检查，掌握进度用单色有序色阶
// 白天按浅色底 #fffdf8 验证；夜间单独一套，按夜间底色 #1b2330（深蓝）和 #26262a（手账）验证，未学最暗、已掌握最亮
const C_LIGHT = { fresh: "#d9603f", review: "#2f5f9e", ramp: ["#9cb4d6", "#5a82ba", "#22457a"] };
const C_DARK  = { fresh: "#d96f4c", review: "#5b93dc", ramp: ["#45689c", "#6a98d6", "#a9c8f0"] };

function streak() {
  let n = 0, t = today();
  const prev = t => new Date(t - DAY / 2).setHours(0, 0, 0, 0);
  if (!daily[dayKey(t)]) t = prev(t);              // 今天还没背，从昨天往前数
  while (daily[dayKey(t)]) { n++; t = prev(t); }
  return n;
}

// 竖向柱状图：cols = [{ label, values: [..], tip }]，series = [{ name, color }]；只给最高的和最后一根标数值
function columnChart(cols, series) {
  const totals = cols.map(c => c.values.reduce((a, b) => a + b, 0));
  const max = Math.max(1, ...totals), peak = totals.indexOf(Math.max(...totals));
  return `<div class="plot">${cols.map((c, i) => {
      const segs = c.values.map((v, j) => ({ v, j })).filter(x => x.v > 0);
      return `<button class="col" data-tip="${esc(c.tip)}" aria-label="${esc(c.tip)}">
        ${(i === peak || i === cols.length - 1) && totals[i] ? `<div class="val">${totals[i]}</div>` : ""}
        ${segs.slice().reverse().map((x, k) => `<div class="seg-fill ${k === 0 ? "top" : ""}"
          style="height:${x.v / max * 86}%;background:${series[x.j].color}"></div>`).join("")}
      </button>`;
    }).join("")}</div>
    <div class="xaxis">${cols.map(c => `<span>${c.label}</span>`).join("")}</div>`;
}

const table = (head, rows) => `<details class="table"><summary>查看数据表</summary><table>
  <tr>${head.map(h => `<th>${h}</th>`).join("")}</tr>${rows.map(r => `<tr>${r.map(v => `<td>${v}</td>`).join("")}</tr>`).join("")}</table></details>`;

function showStats() {
  const C = document.body.classList.contains("night") ? C_DARK : C_LIGHT;
  const t0 = today(), d = daily[dayKey()] || { n: 0, r: 0, a: 0, ok: 0 };
  const learned = Object.values(status);
  const mastered = learned.filter(s => s.stage >= MASTERED).length;

  // 最近 14 天
  const days = Array.from({ length: 14 }, (_, i) => {
    const t = new Date(t0 - (13 - i) * DAY + DAY / 2).setHours(0, 0, 0, 0), x = daily[dayKey(t)] || { n: 0, r: 0 };
    const dt = new Date(t);
    return { label: i === 13 ? "今" : dt.getDate(), date: `${dt.getMonth() + 1}/${dt.getDate()}`, n: x.n, r: x.r };
  });
  // 未来 7 天（今天包含已经过期的）
  const ahead = Array.from({ length: 7 }, (_, i) => {
    const end = t0 + (i + 1) * DAY;
    const n = learned.filter(s => s.due < end && (i === 0 || s.due >= end - DAY)).length;
    const dt = new Date(end - DAY);
    return { label: ["今", "明"][i] ?? `${dt.getMonth() + 1}/${dt.getDate()}`, date: `${dt.getMonth() + 1}/${dt.getDate()}`, n };
  });
  // 各级别掌握进度
  const levels = LEVELS.map(lv => {
    const ws = BUILTIN.filter(w => w.level === lv);
    const m = ws.filter(w => status[w.word]?.stage >= MASTERED).length;
    const l = ws.filter(w => status[w.word]).length - m;
    return { lv, total: ws.length, m, l, u: ws.length - m - l };
  });
  const pct = (a, b) => b ? Math.round(a / b * 100) : 0;

  openPanel(`<h3>学习统计</h3>
    <div class="tiles">
      <div class="tile"><div class="v">🔥 ${streak()} 天</div><div class="k">连续打卡</div></div>
      <div class="tile"><div class="v">${d.n + d.r}</div><div class="k">今天学习（新词 ${d.n} · 复习 ${d.r}）</div></div>
      <div class="tile"><div class="v">${d.a ? pct(d.ok, d.a) + "%" : "–"}</div><div class="k">今天正确率（认识 + 模糊）</div></div>
      <div class="tile"><div class="v">${mastered}</div><div class="k">已掌握 · 学过 ${learned.length} 个</div></div>
    </div>

    <div class="chart-card">
      <h4>最近 14 天</h4><div class="sub">每天学习的单词数</div>
      <div class="legend"><span><i style="background:${C.fresh}"></i>新词</span><span><i style="background:${C.review}"></i>复习</span></div>
      ${columnChart(days.map(x => ({ label: x.label, values: [x.r, x.n], tip: `${x.date}　新词 ${x.n} · 复习 ${x.r}` })),
                    [{ color: C.review }, { color: C.fresh }])}
      ${table(["日期", "新词", "复习"], days.map(x => [x.date, x.n, x.r]))}
    </div>

    <div class="chart-card">
      <h4>未来 7 天要复习</h4><div class="sub">按记忆曲线排好的复习量（今天含已过期的）</div>
      ${columnChart(ahead.map(x => ({ label: x.label, values: [x.n], tip: `${x.date}　${x.n} 个` })), [{ color: C.review }])}
      ${table(["日期", "待复习"], ahead.map(x => [x.date, x.n]))}
    </div>

    <div class="chart-card">
      <h4>掌握进度</h4><div class="sub">复习间隔达到 15 天算已掌握</div>
      <div class="legend"><span><i style="background:${C.ramp[2]}"></i>已掌握</span><span><i style="background:${C.ramp[1]}"></i>学习中</span><span><i style="background:${C.ramp[0]}"></i>未学</span></div>
      ${levels.map(x => `<div class="hrow">
        <div class="meta2"><b style="color:#1d2b3f">${x.lv}</b><span>已掌握 ${pct(x.m, x.total)}% · ${x.m + x.l} / ${x.total} 已学</span></div>
        <div class="hbar">${[[x.m, 2, "已掌握"], [x.l, 1, "学习中"], [x.u, 0, "未学"]].filter(([v]) => v > 0).map(([v, k, name]) =>
          `<div tabindex="0" data-tip="${x.lv} ${name} ${v} 个" style="flex:${v};background:${C.ramp[k]}"></div>`).join("")}</div>
      </div>`).join("")}
      ${table(["级别", "已掌握", "学习中", "未学"], levels.map(x => [x.lv, x.m, x.l, x.u]))}
    </div>`);
  bindTips($("panel"));
}

// 悬停 / 点按 / 键盘聚焦都显示同一个提示框
function bindTips(root) {
  root.querySelectorAll(".chart-card").forEach(card => {
    const tip = document.createElement("div"); tip.className = "tip"; card.appendChild(tip);
    const show = el => {
      const r = el.getBoundingClientRect(), c = card.getBoundingClientRect();
      tip.textContent = el.dataset.tip; tip.style.display = "block";
      const x = Math.min(Math.max(r.left + r.width / 2 - c.left, tip.offsetWidth / 2), c.width - tip.offsetWidth / 2);
      tip.style.left = x + "px"; tip.style.top = (r.top - c.top - 4) + "px";
    };
    const hide = () => tip.style.display = "none";
    card.querySelectorAll("[data-tip]").forEach(el => {
      el.addEventListener("pointerenter", () => show(el));
      el.addEventListener("pointerleave", hide);
      el.addEventListener("focus", () => show(el));
      el.addEventListener("blur", hide);
      el.addEventListener("click", () => show(el));
    });
  });
}

// ===== 备份：学习记录 + 自己加的词 + 设置，存成一个 JSON 文件 =====
const BACKUP_KEYS = ["vocab.status", "vocab.custom", "vocab.newLog", "vocab.daily", "vocab.level", "vocab.cat",
                     "vocab.mode", "vocab.dir", "vocab.size", "vocab.newLimit", "vocab.autoplay"];

function exportData() {
  const data = { app: "jp-vocab", db: DB, version: 1, time: new Date().toISOString(),
                 data: Object.fromEntries(BACKUP_KEYS.map(k => [k, LS.get(k, null)])) };
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `词汇卡备份-${dayKey()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function importData() {
  const input = document.createElement("input");
  input.type = "file"; input.accept = ".json,application/json";
  input.onchange = async () => {
    try {
      const backup = JSON.parse(await input.files[0].text());
      if (backup.app !== "jp-vocab" || !backup.data) throw new Error("不是词汇卡的备份文件");
      if ((backup.db || "vocab") !== DB) throw new Error("这份备份属于另一个词库");
      const n = Object.keys(backup.data["vocab.status"] || {}).length;
      if (!confirm(`备份里有 ${n} 个词的学习记录（${backup.time?.slice(0, 10) || "日期未知"}）。\n导入会覆盖当前的记录，确定吗？`)) return;
      for (const [k, v] of Object.entries(backup.data)) if (BACKUP_KEYS.includes(k) && v != null) LS.set(k, v);
      location.reload();
    } catch (err) { alert("导入失败：" + err.message); }
  };
  input.click();
}

function showAdd() {
  openPanel(`<h3>添加单词</h3><div class="form">
    <div class="row"><div><label>单词 *</label><input id="f_word" placeholder="値上がり"></div>
    <div><label>读音 *</label><input id="f_reading" placeholder="ねあがり"></div></div>
    <div class="row"><div><label>词性</label><input id="f_pos" placeholder="名・自サ"></div>
    <div><label>级别</label><select id="f_level"><option>N1</option><option selected>N2</option><option>N3</option><option>N4</option><option>N5</option></select></div></div>
    <label>中文释义 *</label><input id="f_meaning" placeholder="涨价">
    <label>例句（用 {} 标出要高亮的词）</label><input id="f_ex" placeholder="お米が{値上がり}している。">
    <label>例句翻译</label><input id="f_exZh" placeholder="大米在涨价。">
    <div class="row"><div><label>反义</label><input id="f_ant"></div><div><label>近义</label><input id="f_syn"></div></div>
    <button class="btn yes" id="f_save">保存</button></div>`);
  $("f_save").onclick = () => {
    const g = k => $("f_" + k).value.trim();
    if (!g("word") || !g("reading") || !g("meaning")) return alert("单词、读音、释义必填");
    custom.push({ word: g("word"), reading: g("reading"), pos: g("pos"), meaning: g("meaning"), level: $("f_level").value,
                  cat: "我的", exs: g("ex") ? [[g("ex"), g("exZh")]] : [], ant: g("ant"), syn: g("syn") });
    LS.set("vocab.custom", custom);
    closePanel(); buildQueue();
  };
}

// ===== 事件 =====
$("levels").onclick = e => { const l = e.target.dataset.lv; if (!l) return; level = l; LS.set("vocab.level", l); buildQueue(); };
$("cats").onclick = e => { const c = e.target.dataset.cat; if (!c) return; cat = c; LS.set("vocab.cat", c); buildQueue(); };
$("dirs").onclick = e => { const d = e.target.closest("[data-dir]")?.dataset.dir; if (!d) return; dir = d; LS.set("vocab.dir", d); render(); };
$("actions").onclick = e => { const b = e.target.closest("[data-grade]"); if (b) answer(+b.dataset.grade); };
$("btnStats").onclick = showStats;
$("btnList").onclick = showList;
$("btnAdd").onclick = showAdd;
$("btnSettings").onclick = showSettings;
$("mask").onclick = closePanel;
document.addEventListener("keydown", e => {
  if ($("panel").classList.contains("show") || e.target.tagName === "INPUT") return;
  const grade = { ArrowLeft: 0, ArrowDown: 1, ArrowRight: 2, 1: 0, 2: 1, 3: 2 }[e.key];
  if (grade != null) answer(grade);
  else if (e.key === " ") { e.preventDefault(); $("card")?.click(); }
  else if (e.key === "p" && queue[idx]) playWord(queue[idx]);
});
$("credit").innerHTML = CREDITS[DB];
if ("speechSynthesis" in window) speechSynthesis.getVoices();
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  // 新版缓存接管后刷新一次，免得这次打开还是旧词库（第一次安装时不刷新）
  if (navigator.serviceWorker.controller)
    navigator.serviceWorker.addEventListener("controllerchange", () => location.reload(), { once: true });
  navigator.serviceWorker.register("sw.js");
}
buildQueue();
