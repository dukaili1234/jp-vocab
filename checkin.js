// ===== 打卡图：背完一组，生成一张手账风的图，发朋友圈 / 微信群 / 小红书 =====
// 图上只有 App 名字，没有链接和二维码。尺寸 1080×1440（小红书 3:4），颜色和 xhs日语/make_note_jp.py 一致。
// 依赖 app.js 里的 status、daily、today、dayKey、streak、allWords、MASTERED、loadTechouFonts、openPanel、$
const APP_NAME = "日语词汇卡";

const CK = {
  W: 1080, H: 1440,
  paper: "#FBF8F1", grid: "#ECE6D8", margin: "#F2B8B0", ink: "#2B2B2B",
  blue: "#1F3A5F", red: "#D9481C", grey: "#8A8478", dash: "#D9D1BF",
  hl: ["rgba(255,226,92,.6)", "rgba(247,168,190,.55)", "rgba(176,222,150,.6)", "rgba(150,200,240,.55)"],
  jp:   '"UD Digi Kyokasho N-R", "UD デジタル 教科書体 N-R", "Klee One", "Hiragino Mincho ProN", serif',
  jpb:  '"UD Digi Kyokasho N-B", "UD デジタル 教科書体 N-B", "Klee One", "Hiragino Mincho ProN", serif',
  kai:  '"KaiTi", "STKaiti", "LXGW WenKai Screen", "Kaiti SC", serif',
  hand: '"Ink Free", "Klee One", cursive',
};

// 今天的数据：背过的词（按 status.day 记录）、新词/复习/正确率、连续天数、累计
function checkinData() {
  const t = today(), seen = new Set();
  // 按今天第一次作答的先后排（没记时间的旧记录排最后）
  const words = allWords().filter(w => status[w.word]?.day === t && !seen.has(w.word) && seen.add(w.word))
    .sort((a, b) => (status[a.word].at ?? Infinity) - (status[b.word].at ?? Infinity));
  const d = daily[dayKey()] || { n: 0, r: 0, a: 0, ok: 0 };
  const learned = Object.values(status);
  const levels = [...new Set(words.map(w => w.level))];
  return {
    words, d, streak: streak(),
    level: levels.length === 1 ? levels[0] : "",
    learned: learned.length, mastered: learned.filter(s => s.stage >= MASTERED).length,
    date: new Date(),
  };
}

// 随机数固定下来，同一张图每次画出来一样
const seeded = seed => () => (seed = (seed * 9301 + 49297) % 233280) / 233280;

function washi(ctx, x, y, w, h, angle, base, stripe) {
  ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.rotate(angle * Math.PI / 180); ctx.globalAlpha = .85;
  ctx.beginPath(); ctx.rect(-w / 2, -h / 2, w, h); ctx.clip();
  ctx.fillStyle = base; ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.strokeStyle = stripe; ctx.lineWidth = 9;
  for (let i = -w; i < w + h; i += 24) { ctx.beginPath(); ctx.moveTo(-w / 2 + i, h / 2); ctx.lineTo(-w / 2 + i + h, -h / 2); ctx.stroke(); }
  ctx.restore();
}

// 荧光笔：略倾斜、两端不齐的半透明色带
function highlighter(ctx, x0, y0, x1, y1, color, rnd) {
  const j = v => v + (rnd() - .5) * 8;
  ctx.fillStyle = color; ctx.beginPath();
  ctx.moveTo(j(x0), j(y0) + 3); ctx.lineTo(j(x1), j(y0)); ctx.lineTo(j(x1) + 2, j(y1)); ctx.lineTo(j(x0) - 2, j(y1) + 2);
  ctx.closePath(); ctx.fill();
}

// 手画圈
function handCircle(ctx, cx, cy, r, color, rnd, width = 3) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = ctx.lineCap = "round"; ctx.beginPath();
  for (let a = 0; a <= 380; a += 12) {
    const rad = r + (rnd() - .5) * 3, t = a * Math.PI / 180;
    a ? ctx.lineTo(cx + rad * Math.cos(t), cy + rad * Math.sin(t)) : ctx.moveTo(cx + rad, cy);
  }
  ctx.stroke();
}

function dashed(ctx, x0, x1, y) {
  ctx.strokeStyle = CK.dash; ctx.lineWidth = 2; ctx.setLineDash([10, 8]);
  ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); ctx.setLineDash([]);
}

function text(ctx, s, x, y, size, family, color, weight = "") {
  ctx.font = `${weight} ${size}px ${family}`; ctx.fillStyle = color; ctx.textBaseline = "alphabetic";
  ctx.fillText(s, x, y);
  return x + ctx.measureText(s).width;
}

// 太长就截断加省略号
function fit(ctx, s, maxW) {
  if (ctx.measureText(s).width <= maxW) return s;
  while (s.length > 1 && ctx.measureText(s + "…").width > maxW) s = s.slice(0, -1);
  return s + "…";
}

async function drawCheckin(data) {
  const { W, H } = CK, rnd = seeded(data.date.getDate() * 31 + data.words.length);
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d");

  // 纸、方格、页边线、胶带
  ctx.fillStyle = CK.paper; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = CK.grid; ctx.lineWidth = 1;
  for (let x = .5; x < W; x += 36) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = .5; y < H; y += 36) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  ctx.strokeStyle = CK.margin; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(96, 0); ctx.lineTo(96, H); ctx.stroke();
  washi(ctx, 44, 30, 256, 56, -4, "#F6C4CC", "#FBE0E4");
  washi(ctx, 784, 34, 236, 56, 3, "#BFDDAA", "#E2F0D6");

  const dt = data.date, md = `${dt.getMonth() + 1}.${String(dt.getDate()).padStart(2, "0")}`;
  const kx = text(ctx, "日本語ノート", 130, 112, 30, CK.jp, CK.grey);
  text(ctx, `打卡 · ${dt.getFullYear()}.${md}`, kx + 20, 112, 30, CK.kai, CK.grey);

  // 标题：今天背了 N 个单词（第二行加荧光笔）
  const n = data.words.length;
  ctx.font = `700 70px ${CK.kai}`;
  const t2 = `${n} 个${data.level ? " " + data.level + " " : ""}单词`;
  const w2 = ctx.measureText(t2).width;
  text(ctx, "今天背了", 130, 208, 70, CK.kai, CK.ink, 700);
  highlighter(ctx, 124, 262, 140 + w2, 300, CK.hl[0], rnd);
  text(ctx, t2, 130, 292, 70, CK.kai, CK.ink, 700);

  // 连续打卡 第 ⑦ 天：数字画红圈
  let x = text(ctx, "连续打卡 第", 130, 376, 40, CK.kai, CK.ink, 700);
  ctx.font = `600 44px ${CK.hand}`;
  const sw = ctx.measureText(String(data.streak)).width, r = Math.max(30, sw / 2 + 16);
  handCircle(ctx, x + 14 + r, 362, r, CK.red, rnd);
  text(ctx, String(data.streak), x + 14 + r - sw / 2, 377, 44, CK.hand, CK.red, 600);
  text(ctx, "天", x + 28 + r * 2, 376, 40, CK.kai, CK.ink, 700);

  const acc = data.d.a ? Math.round(data.d.ok / data.d.a * 100) + "%" : "–";
  text(ctx, `新词 ${data.d.n}　复习 ${data.d.r}　正确率 ${acc}`, 130, 440, 32, CK.kai, CK.grey);

  // 今天背的词：最多 10 个，一行一个（和小红书词表同一个排版）
  // 词少时行距 96；词多就把行距和字号一起压小，超过 10 个在列表下写「还有 N 个」，都要留在便利贴上方
  const MAX = 10, top = 476, list = data.words.slice(0, MAX), more = n - list.length;
  const rowh = Math.min(96, Math.floor(((more ? 1150 : 1196) - top) / list.length));
  const f = Math.min(1, rowh / 90), px = v => Math.round(v * f);
  list.forEach((w, i) => {
    const cy = top + i * rowh + Math.round(rowh * .38), color = i % 2 ? CK.blue : CK.red;
    handCircle(ctx, 140, cy, px(23), color, rnd);
    ctx.font = `${px(28)}px ${CK.hand}`; const ns = String(i + 1);
    text(ctx, ns, 140 - ctx.measureText(ns).width / 2, cy + px(10), px(28), CK.hand, color);
    ctx.font = `600 ${px(46)}px ${CK.jpb}`;
    const word = fit(ctx, w.word, 300);
    const wx = text(ctx, word, 186, cy + px(16), px(46), CK.jpb, CK.blue, 600);
    if (w.reading && w.reading !== w.word) {
      ctx.font = `${px(24)}px ${CK.jp}`;
      text(ctx, fit(ctx, w.reading, Math.max(60, 560 - wx)), wx + 12, cy + px(14), px(24), CK.jp, CK.red);
    }
    ctx.font = `700 ${px(34)}px ${CK.kai}`;
    const m = fit(ctx, w.meaning.split("；")[0], 400), mw = ctx.measureText(m).width, mx = 590;
    highlighter(ctx, mx - 6, cy - px(4), mx + mw + 8, cy + px(20), CK.hl[(i + 1) % 4], rnd);
    text(ctx, m, mx, cy + px(14), px(34), CK.kai, CK.ink, 700);
    dashed(ctx, 120, W - 60, top + (i + 1) * rowh - 4);
  });
  if (more) text(ctx, `……还有 ${more} 个`, 186, 1182, 28, CK.kai, CK.grey);

  // 便利贴：累计进度
  const sy = 1222, sh = 116;
  ctx.save(); ctx.translate(130, sy); ctx.rotate(-1.2 * Math.PI / 180);
  ctx.fillStyle = "rgba(120,100,40,.14)"; ctx.fillRect(8, 8, 860, sh);
  ctx.fillStyle = "#FFF0AA"; ctx.fillRect(0, 0, 860, sh);
  text(ctx, "★ 我的进度", 28, 46, 30, CK.kai, CK.red, 700);
  text(ctx, `一共学过 ${data.learned} 个词${data.mastered ? `，已经掌握 ${data.mastered} 个` : ""}。`, 28, 94, 31, CK.kai, CK.ink);
  ctx.restore();
  washi(ctx, 494, sy - 22, 136, 40, 0, "#9CC8EE", "#CFE4F6");

  // 底部：App 名字（没有链接、没有二维码）
  ctx.font = `30px ${CK.kai}`;
  const foot = `— ${APP_NAME} —`;
  text(ctx, foot, (W - ctx.measureText(foot).width) / 2, H - 40, 30, CK.kai, CK.grey);
  return c;
}

// 先把要用的字体（含手机上的网络字体）加载好再画，最多等 4 秒，加载不到就用系统字体
async function ensureFonts(data) {
  loadTechouFonts();
  const sample = "今天背了个单词连续打卡第天新词复习正确率我的进度一共学过已经掌握还有" + APP_NAME +
    data.words.slice(0, 10).map(w => w.word + w.reading + w.meaning).join("") + "日本語ノート0123456789";
  const specs = [`70px ${CK.kai}`, `700 70px ${CK.kai}`, `46px ${CK.jpb}`, `600 46px ${CK.jpb}`, `24px ${CK.jp}`, `28px ${CK.hand}`];
  await Promise.race([
    Promise.all(specs.map(f => document.fonts.load(f, sample).catch(() => {}))),
    new Promise(r => setTimeout(r, 4000)),
  ]);
}

async function showCheckin() {
  const data = checkinData();
  if (!data.words.length) {
    openPanel(`<h3>打卡图</h3><p style="color:#8a96a8">今天还没背单词，背完一组再来生成吧。</p>`);
    return;
  }
  openPanel(`<h3>打卡图</h3><p class="more">正在生成…</p>`);
  await ensureFonts(data);
  const canvas = await drawCheckin(data);
  const url = canvas.toDataURL("image/png");
  const blob = await new Promise(r => canvas.toBlob(r, "image/png"));
  const file = new File([blob], `打卡-${dayKey()}.png`, { type: "image/png" });
  const canShare = navigator.canShare?.({ files: [file] });
  openPanel(`<h3>打卡图</h3>
    <img src="${url}" alt="今日打卡图" style="width:100%;border-radius:6px;box-shadow:0 2px 10px rgba(0,0,0,.12)">
    <p class="more">手机上长按图片可以保存或发给朋友${data.words.length > 10 ? `<br>图上只列前 10 个，<a href="#" id="ckAll">查看今天全部 ${data.words.length} 个词</a>` : ""}</p>
    <div class="backup">
      ${canShare ? `<button class="btn yes" id="ckShare">分享</button>` : ""}
      <button class="btn mid" id="ckSave">保存图片</button>
    </div>`);
  $("ckAll")?.addEventListener("click", e => { e.preventDefault(); showToday(); });
  if (canShare) $("ckShare").onclick = () => navigator.share({ files: [file] }).catch(() => {});
  $("ckSave").onclick = () => {
    const a = document.createElement("a");
    a.href = url; a.download = file.name;
    document.body.appendChild(a); a.click(); a.remove();
  };
}

// ===== 今天学的词：按背的先后列出今天作答过的所有单词，点一行听发音 =====
function showToday() {
  const { words } = checkinData();
  const tag = { ok: ["ok", "认识"], mid: ["learn", "模糊"], ng: ["ng", "不认识"] };
  const counts = words.reduce((c, w) => (c[status[w.word].last] = (c[status[w.word].last] || 0) + 1, c), {});
  openPanel(`<h3 style="display:flex;justify-content:space-between;align-items:center">今天学的词（${words.length}）
      ${words.length ? `<button class="btn mid" style="padding:6px 10px;font-size:13px" onclick="showCheckin()">📷 打卡图</button>` : ""}</h3>
    ${words.length ? `<p class="more" style="text-align:left;padding:0 0 6px">认识 ${counts.ok || 0} · 模糊 ${counts.mid || 0} · 不认识 ${counts.ng || 0}　点一行可以听发音</p>` +
      words.map((w, i) => {
        const [cls, label] = tag[status[w.word].last] || tag.ok;
        return `<div class="list-item" data-i="${i}" style="cursor:pointer"><div>
          <span style="color:#8a96a8;font-size:12px;margin-right:6px">${i + 1}</span><span class="w">${esc(w.word)}</span><span class="r">${esc(w.reading !== w.word ? w.reading : "")}</span>
          <div style="color:#6b7a90;font-size:13px">${esc(w.meaning)}</div></div><span class="st ${cls}">${label}</span></div>`;
      }).join("")
    : `<p style="color:#8a96a8">今天还没背单词。</p>`}`);
  $("panel").onclick = e => {
    const row = e.target.closest("[data-i]");
    if (row) playWord(words[+row.dataset.i]);
  };
}
