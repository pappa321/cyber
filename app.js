/* ══════════════════════════════════════════════════════════════
   CSDP4VO Quest — a Duolingo-style trainer for the course deck
   Content: course.js (extracted from the 548-slide PDF)
   ══════════════════════════════════════════════════════════════ */

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const shuffle = (a) => {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
};
const todayKey = () => new Date().toISOString().slice(0, 10);
const dayDiff = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

/* ─────────────── state ─────────────── */
const SAVE_KEY = "csdp4vo-quest-v1";
const defaultState = () => ({
  xp: 0,
  gems: 0,
  hearts: 5,
  heartsAt: 0,
  streak: 0,
  lastDay: null,
  lessons: {}, // lessonId -> {crowns, best, done}
  mistakes: {}, // questionKey -> true
  sessions: 0,
  correct: 0,
  answered: 0
});

let state = load();
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    return { ...defaultState(), ...(s || {}) };
  } catch {
    return defaultState();
  }
}
function save() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}
function refreshHearts() {
  const max = 5;
  const REGEN_MS = 4 * 60 * 1000; // one heart every 4 minutes
  if (state.hearts >= max) {
    state.heartsAt = 0;
    return;
  }
  if (!state.heartsAt) {
    state.heartsAt = Date.now();
    return;
  }
  const gained = Math.floor((Date.now() - state.heartsAt) / REGEN_MS);
  if (gained > 0) {
    state.hearts = Math.min(max, state.hearts + gained);
    state.heartsAt = state.hearts >= max ? 0 : state.heartsAt + gained * REGEN_MS;
    save();
  }
}
function nextHeartIn() {
  if (state.hearts >= 5 || !state.heartsAt) return null;
  const ms = 4 * 60 * 1000 - ((Date.now() - state.heartsAt) % (4 * 60 * 1000));
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${String(s).padStart(2, "0")}`;
}
function touchStreak() {
  const t = todayKey();
  if (state.lastDay === t) return;
  if (state.lastDay && dayDiff(state.lastDay, t) === 1) state.streak += 1;
  else state.streak = 1;
  state.lastDay = t;
}

/* ─────────────── course helpers ─────────────── */
const COURSE = window.COURSE;
const allLessons = [];
COURSE.units.forEach((u, ui) =>
  u.lessons.forEach((l) => allLessons.push({ ...l, unit: u, unitIndex: ui }))
);
const lessonById = (id) => allLessons.find((l) => l.id === id);
const totalLessons = allLessons.length;

const crownCount = (id) => (state.lessons[id]?.crowns || 0);
const doneCount = () => allLessons.filter((l) => crownCount(l.id) > 0).length;
const unitDone = (u) => u.lessons.every((l) => crownCount(l.id) > 0);
const unitCrowns = (u) => u.lessons.reduce((n, l) => n + crownCount(l.id), 0);

function unitUnlocked(ui) {
  if (ui === 0) return true;
  return unitDone(COURSE.units[ui - 1]);
}
function lessonUnlocked(ui, li) {
  if (!unitUnlocked(ui)) return false;
  if (li === 0) return true;
  return crownCount(COURSE.units[ui].lessons[li - 1].id) > 0;
}

/* ─────────────── question utilities ─────────────── */
function questionKey(q, lessonId, idx) {
  return `${lessonId}:${idx}`;
}
function shuffleQuestion(q) {
  // returns a copy with shuffled option order and a remapped answer
  if (q.type === "mc" || q.type === "multi") {
    const order = shuffle(q.options.map((_, i) => i));
    const options = order.map((i) => q.options[i]);
    const remap = (oldI) => order.indexOf(oldI);
    if (q.type === "mc") return { ...q, options, answer: remap(q.answer) };
    return { ...q, options, answers: q.answers.map(remap) };
  }
  if (q.type === "match") return { ...q, pairs: shuffle(q.pairs) };
  if (q.type === "order") return { ...q, items: shuffle(q.items) };
  return { ...q };
}

/* ─────────────── views ─────────────── */
let tab = "learn";
function render() {
  refreshHearts();
  renderStats();
  $$("#tabbar button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  const view = $("#view");
  view.className = "view " + tab;
  if (tab === "learn") view.innerHTML = viewLearn();
  if (tab === "practice") view.innerHTML = viewPractice();
  if (tab === "ranks") view.innerHTML = viewRanks();
  if (tab === "profile") view.innerHTML = viewProfile();
  bindView();
  window.scrollTo({ top: 0 });
}

function renderStats() {
  $("#streakVal").textContent = state.streak;
  $("#gemsVal").textContent = state.gems;
  $("#heartsVal").textContent = state.hearts;
  $("#xpVal").textContent = state.xp;
}

function viewLearn() {
  const done = doneCount();
  const pct = Math.round((done / totalLessons) * 100);
  let html = `
  <div class="hero">
    <div class="hero-text">
      <h1>CSDP4VO Quest</h1>
      <p>Test your knowledge of Cybersecurity &amp; Data Protection — ${totalLessons} lessons built from the 548-slide lecture deck.</p>
    </div>
    <div class="hero-progress">
      <div class="ring" style="--p:${pct}">
        <span>${pct}<small>%</small></span>
      </div>
      <small>${done}/${totalLessons} lessons</small>
    </div>
  </div>`;

  if (state.hearts <= 0) {
    const t = nextHeartIn();
    html += `<div class="banner banner-warn">💔 Out of hearts — practice to earn them back${t ? `, next heart in ${t}` : ""}.</div>`;
  }

  COURSE.units.forEach((u, ui) => {
    const locked = !unitUnlocked(ui);
    const crowns = unitCrowns(u);
    const maxCrowns = u.lessons.length;
    html += `
    <section class="unit ${locked ? "locked" : ""}" style="--c:${u.color}">
      <header class="unit-head">
        <div class="unit-badge">${u.icon}</div>
        <div class="unit-titles">
          <div class="unit-kicker">Unit ${u.no} · ${u.slides}</div>
          <h2>${u.title}</h2>
          <div class="unit-sub">${u.subtitle}</div>
        </div>
        <div class="unit-crowns" title="Crowns">👑 ${crowns}/${maxCrowns}</div>
      </header>
      ${locked ? `<div class="unit-lock">🔒 Finish Unit ${COURSE.units[ui - 1].no} to unlock</div>` : ""}
      <div class="path">`;
    u.lessons.forEach((l, li) => {
      const c = crownCount(l.id);
      const open = lessonUnlocked(ui, li);
      const offset = [0, 46, 0, -46][li % 4];
      html += `
        <div class="node-row" style="--off:${offset}px">
          <button class="node ${c > 0 ? "crown" : ""} ${!open ? "locked" : ""} ${c >= 2 ? "max" : ""}"
                  data-lesson="${l.id}" ${!open ? "disabled" : ""}
                  title="${open ? l.title : "Locked"}">
            <span class="node-ico">${c > 0 ? "👑" : u.icon}</span>
            ${c > 1 ? `<span class="node-mult">×${c}</span>` : ""}
          </button>
          <div class="node-label">
            <strong>${l.title}</strong>
            <span>${l.questions.length} questions · ${l.slides}</span>
          </div>
        </div>`;
    });
    html += `</div></section>`;
  });
  return html;
}

function viewPractice() {
  const mistakes = Object.keys(state.mistakes);
  const mq = [];
  allLessons.forEach((l) =>
    l.questions.forEach((q, i) => {
      if (state.mistakes[questionKey(q, l.id, i)]) mq.push({ ...q, _lesson: l, _idx: i });
    })
  );
  return `
  <div class="panel">
    <h1>⚔️ Practice</h1>
    <p class="muted">Mixed drills that do not touch your crowns — the fastest way to refill hearts and repair weak spots.</p>
    <div class="cards">
      <button class="card" data-practice="review" ${mq.length ? "" : "disabled"}>
        <div class="card-ico">🩹</div>
        <h3>Mistake review</h3>
        <p>${mq.length ? `${mq.length} question${mq.length > 1 ? "s" : ""} you got wrong` : "No mistakes — you're clean!"}</p>
      </button>
      <button class="card" data-practice="mixed">
        <div class="card-ico">🎲</div>
        <h3>Mixed 20</h3>
        <p>Random questions from all ${totalLessons} lessons</p>
      </button>
      <button class="card" data-practice="weak">
        <div class="card-ico">📉</div>
        <h3>Weakest unit</h3>
        <p>Drill the unit you have mastered least</p>
      </button>
      <button class="card" data-practice="hard">
        <div class="card-ico">🔥</div>
        <h3>Hard mode</h3>
        <p>Match &amp; multi-select only · 2× XP · no hearts lost on typos</p>
      </button>
      <button class="card" data-practice="boss">
        <div class="card-ico">👑</div>
        <h3>Exam boss</h3>
        <p>40 random questions, all units — the real test</p>
      </button>
      <button class="card" data-practice="refill">
        <div class="card-ico">❤️</div>
        <h3>Refill hearts</h3>
        <p>${state.hearts >= 5 ? "Hearts are full" : "Spend 50 💎 for a full refill"}</p>
      </button>
    </div>
  </div>`;
}

function leagueName() {
  const xp = state.xp;
  const tiers = [
    [0, "Bronze", "🥉"], [200, "Silver", "🥈"], [600, "Gold", "🥇"],
    [1200, "Sapphire", "🔷"], [2200, "Ruby", "🔺"], [3500, "Emerald", "🟢"],
    [5000, "Diamond", "💎"]
  ];
  let cur = tiers[0], next = null;
  for (let i = 0; i < tiers.length; i++) {
    if (xp >= tiers[i][0]) { cur = tiers[i]; next = tiers[i + 1] || null; }
  }
  return { cur, next };
}

function viewRanks() {
  const { cur, next } = leagueName();
  const target = next ? next[0] : cur[0];
  const base = cur[0];
  const pct = next ? Math.min(100, Math.round(((state.xp - base) / (target - base)) * 100)) : 100;
  // deterministic "rivals" so the board feels alive but stable
  const seed = state.xp;
  const rivals = [
    ["Ada", "🦉", seed + 120], ["Björn", "🐻", seed + 60], ["Cleo", "🦊", seed - 30],
    ["Davor", "🐼", seed - 90], ["Elin", "🐧", seed - 180], ["Fynn", "🐢", seed - 260]
  ].sort((a, b) => b[2] - a[2]);
  const me = ["You", "🧑‍💻", state.xp];
  const board = [...rivals, me].sort((a, b) => b[2] - a[2]);
  const acc = state.answered ? Math.round((state.correct / state.answered) * 100) : 0;
  return `
  <div class="panel">
    <h1>🏆 ${cur[2]} ${cur[1]} League</h1>
    <div class="league-bar"><div style="width:${pct}%"></div></div>
    <p class="muted">${next ? `${target - state.xp} XP to ${next[2]} ${next[1]}` : "Top league reached — legend!"}</p>
    <div class="board">
      ${board.map((r, i) => `
        <div class="board-row ${r[0] === "You" ? "me" : ""}">
          <span class="rank">${i + 1}</span>
          <span class="avatar">${r[1]}</span>
          <span class="name">${r[0]}</span>
          <span class="xp">${r[2]} XP</span>
        </div>`).join("")}
    </div>
    <div class="stat-grid">
      <div class="mini"><strong>${state.xp}</strong><small>Total XP</small></div>
      <div class="mini"><strong>${acc}%</strong><small>Accuracy</small></div>
      <div class="mini"><strong>${state.sessions}</strong><small>Sessions</small></div>
      <div class="mini"><strong>${state.streak}</strong><small>Day streak</small></div>
    </div>
  </div>`;
}

function viewProfile() {
  const crowns = allLessons.reduce((n, l) => n + crownCount(l.id), 0);
  const acc = state.answered ? Math.round((state.correct / state.answered) * 100) : 0;
  const badges = [
    ["🔑", "First Steps", "Finish your first lesson", state.sessions > 0],
    ["🔥", "On Fire", "3-day streak", state.streak >= 3],
    ["👑", "Crown Collector", "10 crowns", crowns >= 10],
    ["⚡", "500 XP", "Earn 500 XP", state.xp >= 500],
    ["🧠", "Sharpshooter", "80%+ accuracy over 100 answers", state.answered >= 100 && acc >= 80],
    ["🏁", "Course Complete", "All lessons at 1+ crown", doneCount() === totalLessons],
    ["💎", "Gem Hoarder", "Hold 300 gems", state.gems >= 300],
    ["🛡️", "Zero Hearts Lost", "Finish a session with all hearts", false]
  ];
  return `
  <div class="panel">
    <h1>👤 Profile</h1>
    <div class="profile-card">
      <div class="profile-ava">🧑‍💻</div>
      <div>
        <h2>Security Learner</h2>
        <p class="muted">CSDP4VO · ${doneCount()}/${totalLessons} lessons · ${crowns} crowns</p>
      </div>
    </div>
    <div class="stat-grid">
      <div class="mini"><strong>${state.xp}</strong><small>XP</small></div>
      <div class="mini"><strong>${state.streak}</strong><small>Streak</small></div>
      <div class="mini"><strong>${acc}%</strong><small>Accuracy</small></div>
      <div class="mini"><strong>${Object.keys(state.mistakes).length}</strong><small>To review</small></div>
    </div>
    <h3 class="sec-title">Badges</h3>
    <div class="badges">
      ${badges.map(([ico, name, desc, on]) => `
        <div class="badge ${on ? "on" : ""}">
          <span>${ico}</span><strong>${name}</strong><small>${desc}</small>
        </div>`).join("")}
    </div>
    <h3 class="sec-title">Unit mastery</h3>
    <div class="mastery">
      ${COURSE.units.map((u) => {
        const c = unitCrowns(u), m = u.lessons.length;
        return `<div class="mrow"><span>${u.icon} ${u.title}</span>
          <div class="mbar"><div style="width:${(c / m) * 100}%;background:${u.color}"></div></div>
          <span class="mnum">${c}/${m}</span></div>`;
      }).join("")}
    </div>
    <div class="source">📄 Source: ${COURSE.source}<br>Every question shows the slide it came from.</div>
    <button class="btn btn-ghost" id="resetBtn">Reset progress</button>
  </div>`;
}

function bindView() {
  $$("[data-lesson]").forEach((b) =>
    b.addEventListener("click", () => startLesson(b.dataset.lesson))
  );
  $$("[data-practice]").forEach((b) =>
    b.addEventListener("click", () => startPractice(b.dataset.practice))
  );
  const reset = $("#resetBtn");
  if (reset)
    reset.addEventListener("click", () => {
      if (confirm("Reset all progress, XP, crowns and streaks?")) {
        state = defaultState();
        save();
        render();
      }
    });
}

/* ─────────────── session engine ─────────────── */
let session = null;

function startLesson(lessonId) {
  const l = lessonById(lessonId);
  if (!l) return;
  if (state.hearts <= 0) {
    alert("You're out of hearts! Practice to earn them back (or refill with gems).");
    return;
  }
  const qs = shuffle(l.questions.map((q, i) => ({ ...shuffleQuestion(q), _idx: i })));
  session = {
    mode: "lesson",
    lesson: l,
    queue: qs,
    i: 0,
    correct: 0,
    wrong: [],
    xp: 0,
    heartsStart: state.hearts
  };
  renderQuestion();
}

function startPractice(kind) {
  if (kind === "refill") {
    if (state.hearts >= 5) return;
    if (state.gems < 50) { alert("Not enough gems — you need 50 💎. Earn gems by finishing lessons."); return; }
    state.gems -= 50;
    state.hearts = 5;
    state.heartsAt = 0;
    save();
    render();
    return;
  }
  if (state.hearts <= 0 && kind !== "review") {
    alert("Practice needs at least one heart. Mistake review is free — but you're out of hearts; refill with gems.");
    return;
  }
  let pool = [];
  if (kind === "review") {
    allLessons.forEach((l) =>
      l.questions.forEach((q, i) => {
        if (state.mistakes[questionKey(q, l.id, i)]) pool.push({ ...q, _lesson: l, _idx: i });
      })
    );
    pool = shuffle(pool).slice(0, 20);
  } else if (kind === "mixed" || kind === "boss") {
    allLessons.forEach((l) => l.questions.forEach((q, i) => pool.push({ ...q, _lesson: l, _idx: i })));
    pool = shuffle(pool).slice(0, kind === "boss" ? 40 : 20);
  } else if (kind === "hard") {
    allLessons.forEach((l) =>
      l.questions.forEach((q, i) => {
        if (q.type === "match" || q.type === "multi" || q.type === "order") pool.push({ ...q, _lesson: l, _idx: i });
      })
    );
    pool = shuffle(pool).slice(0, 15);
  } else if (kind === "weak") {
    const scored = COURSE.units.map((u, ui) => ({ u, ui, ratio: unitCrowns(u) / u.lessons.length }));
    scored.sort((a, b) => a.ratio - b.ratio);
    const u = scored[0].u;
    u.lessons.forEach((l) => l.questions.forEach((q, i) => pool.push({ ...q, _lesson: l, _idx: i })));
    pool = shuffle(pool).slice(0, 20);
  }
  if (!pool.length) { alert("Nothing to practise here yet."); return; }
  session = {
    mode: kind === "review" ? "review" : "practice",
    kind,
    queue: pool.map((q) => shuffleQuestion(q)),
    i: 0,
    correct: 0,
    wrong: [],
    xp: 0,
    heartsStart: state.hearts,
    title: { review: "Mistake review", mixed: "Mixed 20", weak: "Weakest unit", hard: "Hard mode", boss: "Exam boss" }[kind] || "Practice"
  };
  renderQuestion();
}

function renderQuestion() {
  const q = session.queue[session.i];
  const l = q._lesson || session.lesson;
  const total = session.queue.length;
  const pct = Math.round((session.i / total) * 100);
  $("#view").className = "view quiz";
  document.body.classList.add("in-quiz");
  $("#view").innerHTML = `
    <div class="quiz-head">
      <button class="x" id="quitBtn" title="Quit">✕</button>
      <div class="qbar"><div style="width:${pct}%"></div></div>
      <div class="hearts">${"❤️".repeat(state.hearts)}${"🤍".repeat(Math.max(0, 5 - state.hearts))}</div>
    </div>
    <div class="quiz-body">
      <div class="q-meta">${l.unit ? l.unit.icon + " " + l.unit.title : ""} · ${l.title} · <span class="ref">${q.ref || ""}</span></div>
      <h2 class="q-text">${q.q}</h2>
      <div id="answerArea" class="answer-area"></div>
      <div id="feedback" class="feedback" hidden></div>
    </div>
    <div class="quiz-foot">
      <button class="btn btn-ghost" id="skipBtn">Skip</button>
      <button class="btn btn-green" id="checkBtn" disabled>Check</button>
    </div>`;
  $("#quitBtn").onclick = () => {
    if (confirm("Leave this session? Progress in it will be lost.")) { leaveQuizUI(); session = null; render(); }
  };
  $("#skipBtn").onclick = () => { session.queue.push(session.queue.splice(session.i, 1)[0]); session.i = 0; renderQuestion(); };
  buildAnswerArea(q);
}

/* ── answer widgets ── */
let picked = { single: null, multi: new Set(), match: {}, order: [] };

function buildAnswerArea(q) {
  const area = $("#answerArea");
  const $$ = (sel, root) => [...(root || document).querySelectorAll(sel)];
  const check = $("#checkBtn");
  picked = { single: null, multi: new Set(), match: {}, order: q.type === "order" ? q.items.slice() : [] };

  if (q.type === "mc") {
    area.className = "answer-area options";
    area.innerHTML = q.options
      .map((o, i) => `<button class="opt" data-i="${i}"><span class="key">${i + 1}</span><span>${o}</span></button>`)
      .join("");
    $$(".opt", area).forEach((b) =>
      b.onclick = () => {
        picked.single = +b.dataset.i;
        $$(".opt", area).forEach((x) => x.classList.toggle("sel", x === b));
        check.disabled = false;
      }
    );
  }

  if (q.type === "multi") {
    area.className = "answer-area options";
    area.innerHTML =
      `<p class="hint">Select all that apply</p>` +
      q.options.map((o, i) => `<button class="opt multi" data-i="${i}"><span class="box"></span><span>${o}</span></button>`).join("");
    $$(".opt", area).forEach((b) =>
      b.onclick = () => {
        const i = +b.dataset.i;
        if (picked.multi.has(i)) picked.multi.delete(i);
        else picked.multi.add(i);
        b.classList.toggle("sel", picked.multi.has(i));
        check.disabled = picked.multi.size === 0;
      }
    );
  }

  if (q.type === "tf") {
    area.className = "answer-area tf";
    area.innerHTML = `
      <button class="tfbtn" data-v="true"><span>✅</span>True</button>
      <button class="tfbtn" data-v="false"><span>❌</span>False</button>`;
    $$(".tfbtn", area).forEach((b) =>
      b.onclick = () => {
        picked.single = b.dataset.v === "true";
        $$(".tfbtn", area).forEach((x) => x.classList.toggle("sel", x === b));
        check.disabled = false;
      }
    );
  }

  if (q.type === "match") {
    area.className = "answer-area match";
    const rights = shuffle(q.pairs.map((p) => p[1]));
    area.innerHTML = `
      <p class="hint">Tap a term, then tap its match</p>
      <div class="match-grid">
        <div class="col left">${q.pairs.map((p, i) => `<button class="mchip left" data-l="${i}">${p[0]}</button>`).join("")}</div>
        <div class="col right">${rights.map((r) => `<button class="mchip right" data-r="${r.replace(/"/g, "&quot;")}">${r}</button>`).join("")}</div>
      </div>`;
    let activeL = null;
    area._mchips = $$(".mchip.left", area);
    $$(".mchip.left", area).forEach((b) =>
      b.onclick = () => {
        activeL = +b.dataset.l;
        $$(".mchip.left", area).forEach((x) => x.classList.toggle("sel", x === b));
      }
    );
    $$(".mchip.right", area).forEach((b) =>
      b.onclick = () => {
        if (activeL === null) return;
        picked.match[activeL] = b.dataset.r;
        const leftBtn = (area._mchips || $$(".mchip.left", area)).find((x) => +x.dataset.l === activeL);
        leftBtn.textContent = `${q.pairs[activeL][0]} → ${b.dataset.r}`;
        leftBtn.classList.add("paired");
        leftBtn.classList.remove("sel");
        b.classList.add("used");
        b.disabled = true;
        activeL = null;
        check.disabled = Object.keys(picked.match).length < q.pairs.length;
      }
    );
  }

  if (q.type === "order") {
    area.className = "answer-area order";
    area.innerHTML = `<p class="hint">Tap the items in the correct order</p>
      <div class="order-picked" id="orderPicked"></div>
      <div class="order-pool" id="orderPool"></div>`;
    const draw = () => {
      $("#orderPicked").innerHTML = picked.order.map((it, i) => `<button class="ochip" data-p="${i}">${i + 1}. ${it}</button>`).join("");
      $("#orderPool").innerHTML = shuffle(q.items.filter((it) => !picked.order.includes(it)))
        .map((it) => `<button class="ochip pool" data-o="${it.replace(/"/g, "&quot;")}">${it}</button>`).join("");
      $$("#orderPicked .ochip").forEach((b) => (b.onclick = () => { picked.order.splice(+b.dataset.p, 1); draw(); }));
      $$("#orderPool .ochip").forEach((b) => (b.onclick = () => { picked.order.push(b.dataset.o); draw(); }));
      check.disabled = picked.order.length !== q.items.length;
    };
    draw();
  }
}

function isCorrect(q) {
  if (q.type === "mc") return picked.single === q.answer;
  if (q.type === "tf") return picked.single === q.answer;
  if (q.type === "multi") {
    const a = new Set(q.answers);
    return picked.multi.size === a.size && [...picked.multi].every((i) => a.has(i));
  }
  if (q.type === "match") return q.pairs.every((p, i) => picked.match[i] === p[1]);
  if (q.type === "order") return q.items.every((it, i) => picked.order[i] === it);
  return false;
}

function correctAnswerText(q) {
  if (q.type === "mc") return q.options[q.answer];
  if (q.type === "tf") return q.answer ? "True" : "False";
  if (q.type === "multi") return q.answers.map((i) => q.options[i]).join(" · ");
  if (q.type === "match") return q.pairs.map((p) => `${p[0]} → ${p[1]}`).join("  ·  ");
  if (q.type === "order") return q.items.map((it, i) => `${i + 1}. ${it}`).join("  ·  ");
  return "";
}

/* ── check button ── */
document.addEventListener("click", (e) => {
  const btn = e.target.closest("#checkBtn");
  if (!btn) return;
  const q = session.queue[session.i];
  const ok = isCorrect(q);
  const l = q._lesson || session.lesson;
  const key = questionKey(q, l.id, q._idx);

  state.answered++;
  if (ok) {
    state.correct++;
    session.correct++;
    if (state.mistakes[key]) delete state.mistakes[key];
  } else {
    session.wrong.push(q);
    state.mistakes[key] = true;
    if (session.mode === "lesson") {
      state.hearts = Math.max(0, state.hearts - 1);
      if (!state.heartsAt) state.heartsAt = Date.now();
    }
  }
  save();
  renderStats();

  // colour the answers
  const area = $("#answerArea");
  if (q.type === "mc" || q.type === "tf") {
    $$(".opt, .tfbtn", area).forEach((b) => {
      const i = b.dataset.i !== undefined ? +b.dataset.i : b.dataset.v === "true";
      if (i === q.answer) b.classList.add("ok");
      else if (b.classList.contains("sel")) b.classList.add("bad");
    });
  }
  if (q.type === "multi") {
    $$(".opt", area).forEach((b) => {
      const i = +b.dataset.i;
      if (q.answers.includes(i)) b.classList.add("ok");
      else if (picked.multi.has(i)) b.classList.add("bad");
    });
  }
  if (q.type === "match") {
    $$(".mchip.left", area).forEach((b) => {
      const i = +b.dataset.l;
      b.classList.add(picked.match[i] === q.pairs[i][1] ? "ok" : "bad");
    });
  }
  if (q.type === "order") {
    $$("#orderPicked .ochip", area).forEach((b, i) => b.classList.add(picked.order[i] === q.items[i] ? "ok" : "bad"));
  }

  const fb = $("#feedback");
  fb.hidden = false;
  fb.className = "feedback " + (ok ? "good" : "bad");
  fb.innerHTML = `
    <div class="fb-head">${ok ? "✅ Correct!" : "❌ Not quite"}</div>
    ${ok ? "" : `<div class="fb-answer"><strong>Answer:</strong> ${correctAnswerText(q)}</div>`}
    <div class="fb-why">${q.why || ""}</div>
    <div class="fb-ref">📄 ${q.ref || ""}</div>`;

  // swap the check button for continue
  const foot = $(".quiz-foot");
  foot.innerHTML = `<button class="btn ${ok ? "btn-green" : "btn-red"}" id="nextBtn">Continue</button>`;
  $("#nextBtn").onclick = nextQuestion;
  $("#nextBtn").focus();

  if (!ok && session.mode === "lesson" && state.hearts <= 0) {
    $("#nextBtn").textContent = "See results";
  }
  // disable the widgets
  $$("#answerArea button").forEach((b) => (b.disabled = true));
  $$(".quiz-foot").forEach((f) => f.scrollIntoView({ behavior: "smooth", block: "end" }));
});

function leaveQuizUI() {
  document.body.classList.remove("in-quiz");
}

function nextQuestion() {
  session.i++;
  if (session.i >= session.queue.length) finishSession();
  else renderQuestion();
}

/* ── finishing ── */
function finishSession() {
  const total = session.queue.length;
  const acc = Math.round((session.correct / total) * 100);
  const base = session.mode === "lesson" ? 12 : session.kind === "hard" ? 16 : 10;
  const bonus = Math.round((acc / 100) * 8);
  const xp = base + bonus + (session.kind === "boss" ? 20 : 0);
  state.xp += xp;
  state.gems += Math.round(xp / 4);
  state.sessions++;

  if (session.mode === "lesson") {
    const id = session.lesson.id;
    const rec = state.lessons[id] || { crowns: 0, best: 0, done: 0 };
    rec.done += 1;
    rec.best = Math.max(rec.best, acc);
    if (acc >= 80 && rec.crowns < 2) rec.crowns += 1;
    if (acc >= 95 && rec.best === 100 && rec.crowns < 3) rec.crowns += 1;
    state.lessons[id] = rec;
    if (acc >= 80) touchStreak();
    // heart bonus for a flawless run
    if (acc === 100 && session.wrong.length === 0) state.hearts = Math.min(5, state.hearts + 1);
  } else {
    touchStreak();
    if (acc >= 80) state.hearts = Math.min(5, state.hearts + 1); // practice refills a heart
  }
  save();

  const cel = $("#celebrate");
  $("#celEmoji").textContent = acc >= 90 ? "🏆" : acc >= 60 ? "🎉" : "💪";
  $("#celTitle").textContent =
    session.mode === "lesson"
      ? acc >= 90 ? "Flawless! New crown earned" : acc >= 80 ? "Lesson complete — crown earned!" : "Lesson complete"
      : session.title + " complete";
  $("#celXp").textContent = "+" + xp;
  $("#celAcc").textContent = acc + "%";
  $("#celStreak").textContent = state.streak;
  showCelebrate(cel, acc);
  burstConfetti(acc >= 80 ? 90 : 40);
  const close = () => {
    cel.hidden = true;
    cel.style.display = "";
    leaveQuizUI();
    session = null;
    render();
  };
  $("#celContinue").onclick = close;
  cel.onclick = (e) => { if (e.target === cel) close(); };
  const onKey = (e) => {
    if (cel.hidden) { document.removeEventListener("keydown", onKey); return; }
    if (e.key === "Enter" || e.key === "Escape") close();
  };
  document.addEventListener("keydown", onKey);
}

function showCelebrate(cel, acc) {
  cel.hidden = false;
  cel.style.display = "grid";
}

function burstConfetti(n) {
  const box = $("#confetti");
  box.innerHTML = "";
  const colors = ["#58cc02", "#1cb0f6", "#ff9600", "#ce82ff", "#ff4b4b", "#ffc800"];
  for (let i = 0; i < n; i++) {
    const d = document.createElement("i");
    d.style.left = Math.random() * 100 + "%";
    d.style.background = colors[i % colors.length];
    d.style.animationDelay = Math.random() * 0.6 + "s";
    d.style.animationDuration = 1.6 + Math.random() * 1.4 + "s";
    d.style.transform = `rotate(${Math.random() * 360}deg)`;
    box.appendChild(d);
  }
}

/* ─────────────── nav ─────────────── */
$$("#tabbar button").forEach((b) =>
  b.addEventListener("click", () => {
    if (session && !confirm("Leave this session?")) return;
    leaveQuizUI();
    session = null;
    tab = b.dataset.tab;
    render();
  })
);

/* heart regen ticker — only repaints when not mid-question and not on the celebration card */
setInterval(() => {
  const before = state.hearts;
  refreshHearts();
  const cel = $("#celebrate");
  const busy = session || (cel && !cel.hidden);
  if (state.hearts !== before && !busy) render();
  else if (state.hearts !== before) renderStats();
}, 5000);

render();
