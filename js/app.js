// Yıldızlar: state, routing, views (home / learn / sky / practice), lesson player, quizzes, settings.
import { HIP, LINES } from './catalog.js';
import { altAz, lstDeg } from './astro.js';
import { SkyDome, Figure, ambientSky, confetti } from './sky.js';
import { CITIES, VOCAB, STARS, LESSONS, GROUPS, SKY_CONS, SEASONS, lessonById, conLessons } from './data.js';

/* ---------- state ---------- */
const KEY = 'yildizlar.v1';
const DEFAULTS = { onboarded: false, theme: 'dark', city: 'tehran', geo: null, labels: true, done: {}, cards: {}, best: {} };
let S = load();
function load() { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* private mode: keep going in memory */ } }

const DIRS = ['kuzey', 'kuzeydoğu', 'doğu', 'güneydoğu', 'güney', 'güneybatı', 'batı', 'kuzeybatı'];
const dirWord = (az) => DIRS[Math.round(az / 45) % 8];
const altWord = (alt) => alt > 65 ? 'tam tepede' : alt > 40 ? 'yüksekte' : alt > 20 ? 'orta yükseklikte' : 'ufka yakın';
const place = () => S.city === 'geo' && S.geo ? S.geo : (CITIES.find(c => c.id === S.city) || CITIES[0]);
const placeName = () => S.city === 'geo' ? 'Konumum' : (CITIES.find(c => c.id === S.city) || CITIES[0]).name;
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const buzz = (ms) => { try { navigator.vibrate && navigator.vibrate(ms); } catch { /* ignore */ } };
const $ = (sel, root = document) => root.querySelector(sel);
const html = (strings, ...vals) => strings.reduce((out, s, i) => out + s + (vals[i] ?? ''), '');
const ICON_X = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';

function applyTheme() {
  const t = S.theme === 'auto' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : S.theme;
  document.documentElement.dataset.theme = t;
  $('meta[name=theme-color]').content = t === 'light' ? '#f3f5ff' : '#070b1a';
}

function toast(msg, ms = 2200) {
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg; el.setAttribute('role', 'status');
  document.body.append(el); setTimeout(() => el.remove(), ms);
}

function speak(text) {
  if (!('speechSynthesis' in window)) return toast('Bu cihaz sesli okuma yapamıyor');
  const u = new SpeechSynthesisUtterance(text);
  const v = speechSynthesis.getVoices().find(v => v.lang.toLowerCase().startsWith('tr'));
  if (v) u.voice = v; u.lang = 'tr-TR'; u.rate = 0.85;
  speechSynthesis.cancel(); speechSynthesis.speak(u);
}

/* ---------- sky helpers ---------- */
const skyCons = () => SKY_CONS.map(id => ({ id, lines: LINES[id], label: lessonById(id).name }));
function conAltAz(id, lat, lon, date) {
  const lst = lstDeg(date, lon);
  const hips = LINES[id].flat().filter(h => HIP[h]);
  let x = 0, y = 0, z = 0;
  for (const h of hips) { const { alt, az } = altAz(HIP[h][0], HIP[h][1], lat, lst); const a = alt * Math.PI / 180, b = az * Math.PI / 180; x += Math.cos(a) * Math.sin(b); y += Math.cos(a) * Math.cos(b); z += Math.sin(a); }
  const n = hips.length;
  return { alt: Math.asin(z / n) * 180 / Math.PI, az: ((Math.atan2(x, y) * 180 / Math.PI) + 360) % 360 };
}
function upNow(date = new Date(), minAlt = 15) {
  const { lat, lon } = place();
  return SKY_CONS.map(id => ({ id, ...conAltAz(id, lat, lon, date) })).filter(c => c.alt > minAlt).sort((a, b) => b.alt - a.alt);
}
// an evening (21:30 local) in the current year when `id` is highest
function eveningFor(id) {
  const { lat, lon } = place(); const y = new Date().getFullYear();
  let best = null;
  for (let m = 0; m < 12; m++) { const d = new Date(y, m, 15, 21, 30); const p = conAltAz(id, lat, lon, d); if (!best || p.alt > best.alt) best = { d, alt: p.alt }; }
  return best.d;
}

/* ---------- figure helpers ---------- */
function labelsFor(scene) {
  const out = {};
  for (const key of scene.labels || []) out[STARS[key].hip] = STARS[key].name;
  return out;
}
function makeFigure(canvas, scene, extraOpts = {}) {
  return new Figure(canvas, { figures: scene.figures, extra: scene.extra || [], hop: scene.hop || null, labels: labelsFor(scene), ...extraOpts });
}

/* ---------- routing ---------- */
let current = { cleanup: null };
function route() {
  const h = location.hash.replace('#', '') || 'home';
  const [view, arg] = h.split('/');
  current.cleanup && current.cleanup(); current.cleanup = null;
  $('#overlay').innerHTML = '';
  for (const b of document.querySelectorAll('#tabbar button')) { if (b.dataset.route === view) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); }
  const main = $('#main');
  const go = () => {
    main.innerHTML = '';
    if (!S.onboarded) return renderOnboard();
    ({ home: renderHome, learn: renderLearn, sky: renderSky, practice: renderPractice, lesson: () => renderLesson(arg), quiz: () => renderQuiz(arg) }[view] || renderHome)(main);
    window.scrollTo(0, 0);
  };
  if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) document.startViewTransition(go); else go();
}
const nav = (h) => { location.hash = h; };

/* ---------- onboarding ---------- */
function renderOnboard() {
  $('#topbar').hidden = true; $('#tabbar').hidden = true;
  $('#main').innerHTML = html`<section class="onboard view">
    <div>
      <div class="hero-name">Yıldızlar</div>
      <h1 style="margin-top:10px">Gökyüzünü tanıyalım ✨</h1>
      <p class="muted" style="margin-top:8px">Yıldızların adlarını, şekillerini, gökyüzündeki yerlerini ve kuzeyi bulmanın yolunu öğren.</p>
    </div>
    <div class="stack">
      <div class="card row"><span style="font-size:30px" aria-hidden="true">🐻</span><span><b>Bak</b><br><span class="muted small">Her takımyıldızın şekli gözünün önünde çizilir.</span></span></div>
      <div class="card row"><span style="font-size:30px" aria-hidden="true">🧭</span><span><b>Bul</b><br><span class="muted small">Canlı gökyüzü haritası, bu gece nereye bakacağını gösterir.</span></span></div>
      <div class="card row"><span style="font-size:30px" aria-hidden="true">🎯</span><span><b>Dene</b><br><span class="muted small">Kısa alıştırmalarla adlar aklında kalır.</span></span></div>
    </div>
    <button class="btn lg block" id="start">Başlayalım 🚀</button>
  </section>`;
  $('#start').onclick = () => { S.onboarded = true; save(); $('#topbar').hidden = false; $('#tabbar').hidden = false; nav('home'); route(); };
}

/* ---------- home ---------- */
function renderHome(main) {
  const total = LESSONS.length, done = LESSONS.filter(l => S.done[l.id]).length;
  const pct = Math.round(done / total * 100);
  const next = LESSONS.find(l => !S.done[l.id]);
  const up = upNow().slice(0, 4);
  const hour = new Date().getHours();
  const greet = hour < 11 ? 'Günaydın' : hour < 18 ? 'İyi günler' : 'İyi akşamlar';
  main.innerHTML = html`<section class="view">
    <div class="card hero">
      <div>
        <h1>${greet} 👋</h1>
        <p class="muted" style="margin-top:4px">${done === 0 ? 'İlk yıldızını öğrenmeye hazır mısın?' : done === total ? 'Hepsini öğrendin! Şimdi dışarı çık, gökyüzüne bak 🌙' : `${total} dersin ${done} tanesini bitirdin.`}</p>
        <button class="btn" style="margin-top:14px" id="continue">${next ? (done ? 'Devam et' : 'Başla') + ' ' + next.emoji : 'Alıştırma yap 🎯'}</button>
      </div>
      <div class="ring" role="img" aria-label="İlerleme yüzde ${pct}">
        <svg viewBox="0 0 100 100"><circle class="track" cx="50" cy="50" r="42"/><circle class="bar" cx="50" cy="50" r="42" stroke-dasharray="264" stroke-dashoffset="${264 - 264 * pct / 100}"/></svg>
        <div class="label num">%${pct}</div>
      </div>
    </div>
    <div class="section-title"><h2>Bu gece gökyüzünde 🌙</h2><button class="chip" id="to-sky">Canlı harita</button></div>
    <div class="tonight">
      ${up.length ? up.map(c => { const l = lessonById(c.id); return html`<button class="sky-item" data-lesson="${l.id}"><span class="emoji" aria-hidden="true">${l.emoji}</span><span><span class="name">${l.name}</span><br><span class="dir">${l.latin} · ${dirWord(c.az)}, ${altWord(c.alt)}</span></span><span class="muted" aria-hidden="true">›</span></button>`; }).join('') : '<div class="empty card"><div class="ic">☁️</div>Şu anda öğrendiğimiz takımyıldızlardan hiçbiri gökyüzünde görünmüyor. Birkaç saat sonra yeniden bak.</div>'}
    </div>
    <div class="section-title"><h2>Kısayollar</h2></div>
    <div class="stack">
      <button class="sky-item" data-lesson="nav-polaris"><span class="emoji" aria-hidden="true">🧭</span><span><span class="name">Kuzeyi bul</span><br><span class="dir">Büyük Kepçe ve Kutup Yıldızı ile</span></span><span class="muted" aria-hidden="true">›</span></button>
      <button class="sky-item" id="to-practice"><span class="emoji" aria-hidden="true">🎯</span><span><span class="name">Hızlı alıştırma</span><br><span class="dir">On soru, takımyıldız adları</span></span><span class="muted" aria-hidden="true">›</span></button>
    </div>
  </section>`;
  $('#continue').onclick = () => nav(next ? `lesson/${next.id}` : 'practice');
  $('#to-sky').onclick = () => nav('sky');
  $('#to-practice').onclick = () => nav('quiz/name');
  main.querySelectorAll('[data-lesson]').forEach(b => b.onclick = () => nav(`lesson/${b.dataset.lesson}`));
}

/* ---------- learn ---------- */
function renderLearn(main) {
  main.innerHTML = html`<section class="view">
    <h1>Öğren 📚</h1>
    <p class="muted">Her ders üç dakika: bak, bul, dene.</p>
    <div class="path">
      ${Object.keys(GROUPS).map(g => html`<div class="group-title"><span>${GROUPS[g].emoji} ${GROUPS[g].name}</span></div>
        ${LESSONS.filter(l => l.group === g).map(l => html`<button class="lesson ${S.done[l.id] ? 'done' : ''}" data-lesson="${l.id}">
          <span class="emoji" aria-hidden="true">${l.emoji}</span>
          <span class="t"><span class="name">${l.name}</span><span class="sub">${l.latin}${l.nick ? ' · ' + l.nick : ''}</span></span>
          <span class="star" aria-hidden="true">⭐</span></button>`).join('')}`).join('')}
    </div>
  </section>`;
  main.querySelectorAll('[data-lesson]').forEach(b => b.onclick = () => nav(`lesson/${b.dataset.lesson}`));
}

/* ---------- lesson player ---------- */
function renderLesson(id) {
  const L = lessonById(id); if (!L) return nav('learn');
  const steps = L.kind === 'vocab' ? ['Kelimeler', 'Dene'] : (L.scene?.dome || L.kind === 'nav') ? ['Bak', 'Bul', 'Dene'] : ['Bak', 'Bul', 'Öğren', 'Dene'];
  const hasKnow = steps.length === 4;
  let step = 0, fig = null, dome = null, fullOn = false;
  const ov = $('#overlay');
  const questions = buildLessonQuiz(L);
  const draw = () => {
    fig && fig.stop(); dome && dome.stop(); fig = dome = null;
    ov.innerHTML = html`<div class="player" role="dialog" aria-label="${L.name}">
      <div class="phead">
        <button class="icon-btn" id="close" aria-label="Kapat">${ICON_X}</button>
        <div class="steps" aria-label="Adım ${step + 1} / ${steps.length}">${steps.map((s, i) => `<i class="${i <= step ? 'on' : ''}"><b></b></i>`).join('')}</div>
        <span class="small muted">${steps[step]}</span>
      </div>
      <div class="pbody ${L.kind !== 'vocab' && step < steps.length - 1 ? 'two' : ''}" id="pbody"></div>
      <div class="pfoot">
        ${step > 0 ? '<button class="btn ghost" id="prev">Geri</button>' : ''}
        <button class="btn block" id="next">İleri</button>
      </div>
    </div>`;
    const body = $('#pbody');
    const sceneBox = () => L.scene.dome
      ? '<div class="sky-wrap"><canvas id="dome" role="img" aria-label="Yaz gökyüzü"></canvas></div>'
      : html`<div class="figure-wrap"><canvas id="fig" aria-label="${L.name} şekli" role="img"></canvas>${L.kind !== 'nav' ? `<span class="mascot bob" aria-hidden="true">${L.emoji}</span>` : ''}</div>`;
    const nameBlock = () => html`<div class="name-block">
      <div class="big">${L.name}</div>
      <div class="pron">${L.latin}${L.nick ? ` · ${L.nick}` : ''}</div>
      <button class="chip speak" id="speak" aria-label="Adı dinle">🔊 Dinle</button>
    </div>`;
    if (L.kind === 'vocab') {
      if (step === 0) {
        body.innerHTML = html`<div class="name-block"><div class="big">${L.name}</div><div class="pron">${L.latin}</div></div>
          <div class="kid">${L.intro.map(s => `<p>${s}</p>`).join('')}</div>
          <div class="star-list">${VOCAB.map(v => html`<div class="star-row"><span style="font-size:20px">${v.emoji}</span><span><b class="latin" style="font-size:1.15em">${v.word}</b><br><span class="sub">${v.desc}</span></span><button class="chip" data-say="${v.word}" aria-label="${v.word} kelimesini dinle">🔊</button></div>`).join('')}</div>
          <div class="fact"><span class="ic">💡</span><span>${L.fact}</span></div>`;
      } else body.innerHTML = quizMarkup(questions);
    } else if (step === 0) {
      body.innerHTML = sceneBox() + nameBlock() + html`<div class="kid">${L.intro.map(s => `<p>${s}</p>`).join('')}</div>${L.scene.full ? '<button class="chip" id="full" style="margin-top:10px">Bütün ayıyı gör 🐻</button>' : ''}`;
    } else if (step === 1) {
      body.innerHTML = sceneBox() + html`
        <h2 style="margin-top:16px">Nasıl bulurum? 🔭</h2>
        <div class="kid">${L.find.map(s => `<p>${s}</p>`).join('')}</div>
        ${L.when ? html`<div class="chips" style="margin-top:14px"><span class="chip" aria-pressed="true">📅 ${L.when.season}</span><span class="chip" aria-pressed="true">🧭 ${L.when.dir}</span><span class="chip">⏰ ${L.when.best}</span></div>` : ''}
        ${!hasKnow && L.fact ? html`<div class="fact"><span class="ic">${L.kind === 'nav' ? '✋' : '💡'}</span><span>${L.fact}</span></div>` : ''}`;
    } else if (step === 2 && hasKnow) {
      body.innerHTML = sceneBox() + html`
        <div class="fact"><span class="ic">💡</span><span>${L.fact}</span></div>
        ${L.story ? html`<div class="fact gold"><span class="ic">📖</span><span>${L.story}</span></div>` : ''}
        ${L.stars.length ? html`<h2 style="margin-top:18px">Yıldızları ⭐</h2><div class="star-list">${L.stars.map(k => { const s = STARS[k]; return html`<button class="star-row" data-star="${k}" style="color:${s.color}"><span class="dot"></span><span style="color:var(--text)"><b class="latin" style="font-size:1.15em">${s.name}</b> <span class="sub">${s.latin}</span><br><span class="sub">${s.fact}</span></span><span aria-hidden="true">🔊</span></button>`; }).join('')}</div>` : ''}`;
    } else body.innerHTML = quizMarkup(questions);
    // canvases
    const c = $('#fig', body);
    if (c) {
      const scene = fullOn && L.scene.full ? { ...L.scene, figures: [{ id: L.scene.full, lines: LINES[L.scene.full] }] } : L.scene;
      const labels = step === 2 ? { ...labelsFor(scene), ...Object.fromEntries(L.stars.map(k => [STARS[k].hip, STARS[k].name])) } : labelsFor(scene);
      fig = makeFigure(c, scene, { labels });
      fig.animate(step === 0 ? 2200 : 1600);
      c.onclick = (e) => { const r = c.getBoundingClientRect(); const hip = fig.pick(e.clientX - r.left, e.clientY - r.top); const k = hip && Object.keys(STARS).find(k => STARS[k].hip === hip); if (k) { toast(`${STARS[k].name} · ${STARS[k].latin}`); speak(STARS[k].name); } };
    }
    const d = $('#dome', body);
    if (d) {
      const { lat, lon } = place(); const m = L.scene.dome;
      dome = new SkyDome(d, { lat, lon, date: new Date(new Date().getFullYear(), m.month - 1, m.day, m.hour), facing: m.facing, cons: skyCons(), showLabels: true });
      dome.start();
    }
    body.querySelectorAll('[data-say]').forEach(b => b.onclick = () => speak(b.dataset.say));
    body.querySelectorAll('[data-star]').forEach(b => b.onclick = () => speak(STARS[b.dataset.star].name));
    const sp = $('#speak', body); if (sp) sp.onclick = () => speak(L.name);
    const fb = $('#full', body); if (fb) fb.onclick = () => { fullOn = !fullOn; draw(); };
    bindQuiz(body, questions, finish);
    $('#close').onclick = close;
    const pv = $('#prev'); if (pv) pv.onclick = () => { step--; draw(); };
    $('#next').onclick = () => { step++; draw(); };
    if (step === steps.length - 1) $('#next').hidden = true; // the quiz itself ends the lesson
  };
  const finish = () => { S.done[L.id] = true; save(); close(); confetti($('#confetti')); toast(L.acc ? `Aferin! ${L.acc} öğrendin ⭐` : 'Aferin! Dersi bitirdin ⭐'); };
  const close = () => { fig && fig.stop(); dome && dome.stop(); ov.innerHTML = ''; nav('learn'); };
  current.cleanup = () => { fig && fig.stop(); dome && dome.stop(); };
  draw();
}

/* ---------- quiz building ---------- */
function pool() { const done = conLessons().filter(l => S.done[l.id]); return done.length >= 4 ? done : conLessons(); }
function nameOptions(target, all = conLessons()) { return shuffle([target, ...shuffle(all.filter(l => l.id !== target.id)).slice(0, 3)]); }
const optName = (l) => html`<span class="latin">${l.name}</span><br><small class="muted">${l.latin}</small>`;
function buildLessonQuiz(L) {
  const qs = [];
  if (L.kind === 'vocab') {
    for (const v of shuffle(VOCAB).slice(0, 3)) qs.push({ q: `Hangisi <span class="latin">${v.word}</span> demek?`, options: shuffle([v, ...shuffle(VOCAB.filter(x => x !== v)).slice(0, 3)]).map(x => ({ label: x.desc, ok: x === v })), say: v.word });
    return qs;
  }
  if (L.kind === 'nav') {
    if (L.id === 'nav-orion') qs.push({ q: 'Avcı\'nın Kemeri…', options: shuffle([{ label: 'neredeyse tam doğudan doğar, batıdan batar', ok: true }, { label: 'her zaman kuzeydedir', ok: false }, { label: 'hiç görünmez', ok: false }, { label: 'batıdan doğar', ok: false }]) });
    else {
      qs.push({ q: 'Kutup Yıldızı…', options: shuffle([{ label: 'her zaman kuzeydedir', ok: true }, { label: 'her gece yer değiştirir', ok: false }, { label: 'gökyüzünün en parlak yıldızıdır', ok: false }, { label: 'yalnızca yazın görünür', ok: false }]) });
      qs.push({ q: 'Yüzün Kutup Yıldızı\'na dönük. Sağ elin hangi yönde?', options: shuffle([{ label: 'Doğu', ok: true }, { label: 'Batı', ok: false }, { label: 'Güney', ok: false }, { label: 'Kuzey', ok: false }]) });
    }
    return qs;
  }
  const others = LESSONS.filter(l => l.id !== L.id && l.kind !== 'vocab' && l.kind !== 'nav');
  if (!L.scene.dome) qs.push({ q: 'Bu takımyıldızın adı ne?', figure: L.scene, options: shuffle([L, ...shuffle(others).slice(0, 3)]).map(l => ({ label: optName(l), ok: l === L })), say: L.name });
  if (L.when) qs.push({ q: `<span class="latin">${L.name}</span> hangi mevsimde en iyi görünür?`, options: shuffle([L.when.season, ...shuffle(SEASONS.filter(s => s !== L.when.season)).slice(0, 3)]).map(s => ({ label: s, ok: s === L.when.season })) });
  return qs;
}
function quizMarkup(questions) {
  return html`<div id="quiz"><div class="score"><span id="qn">Soru 1 / ${questions.length}</span><span id="qs">✅ 0</span></div><div id="qbox"></div></div>`;
}
// Runs a list of questions inside `root`; calls onDone(correctCount) after the last answer.
function bindQuiz(root, questions, onDone) {
  const box = $('#qbox', root); if (!box) return;
  let i = 0, correct = 0;
  const show = () => {
    const q = questions[i];
    $('#qn', root).textContent = `Soru ${i + 1} / ${questions.length}`;
    box.innerHTML = html`<div class="quiz-q">${q.q}</div>${q.figure ? '<div class="figure-wrap" style="max-height:38dvh;margin-bottom:12px"><canvas id="qfig" role="img" aria-label="Şekil"></canvas></div>' : ''}
      <div class="options ${q.figOptions ? 'figs' : ''}">${q.options.map((o, k) => `<button class="opt" data-k="${k}"${q.figOptions ? ` aria-label="${k + 1}. şekil"` : ''}>${q.figOptions ? '<canvas></canvas>' : o.label}</button>`).join('')}</div>`;
    if (q.figure) { const f = makeFigure($('#qfig', box), q.figure, { labels: {} }); f.animate(900); }
    if (q.figOptions) box.querySelectorAll('.opt canvas').forEach((c, k) => { new Figure(c, { figures: q.options[k].scene.figures, extra: q.options[k].scene.extra || [], labels: {}, pad: .14, bgStars: false }).draw(1); });
    box.querySelectorAll('.opt').forEach(b => b.onclick = () => {
      if (box.dataset.lock) return; box.dataset.lock = '1';
      const o = q.options[+b.dataset.k];
      box.querySelectorAll('.opt').forEach((x, k) => { if (q.options[k].ok) x.classList.add('ok'); else if (x === b) x.classList.add('bad'); else x.classList.add('dim'); });
      if (o.ok) { correct++; buzz(30); $('#qs', root).textContent = `✅ ${correct}`; if (q.say) speak(q.say); } else buzz([60, 40, 60]);
      setTimeout(() => { if (!root.isConnected) return; delete box.dataset.lock; i++; if (i < questions.length) show(); else onDone(correct); }, o.ok ? 900 : 1500);
    });
  };
  show();
}

/* ---------- sky view ---------- */
function renderSky(main) {
  let offset = 0, playing = 0, facing = 180;
  const { lat, lon } = place();
  main.innerHTML = html`<section class="view">
    <div class="row between" style="margin-bottom:10px"><h1>Şu anda gökyüzü 🌙</h1><button class="chip" id="loc">📍 ${placeName()}</button></div>
    <div class="sky-wrap"><canvas id="dome" role="img" aria-label="Canlı gökyüzü haritası"></canvas><div id="bubble" hidden></div></div>
    <div class="sky-controls">
      <p class="small muted">Telefonu başının üstünde tut. Haritanın altı, baktığın yöndür. Bir şekle dokun, adını gör.</p>
      <div>
        <div class="small muted" style="margin-bottom:6px">Hangi yöne bakıyorsun?</div>
        <div class="facing" role="group" aria-label="Baktığın yön">${[['Kuzey', 0], ['Doğu', 90], ['Güney', 180], ['Batı', 270]].map(([t, v]) => `<button class="chip" data-facing="${v}" aria-pressed="${v === 180}">${t}</button>`).join('')}</div>
      </div>
      <div>
        <div class="time-row"><button class="icon-btn" id="play" aria-label="Zamanı ilerlet"><svg viewBox="0 0 24 24"><path d="M7 4l12 8-12 8z"/></svg></button><input type="range" id="time" min="0" max="720" step="15" value="0" aria-label="Saat"><button class="chip" id="now">Şimdi</button></div>
        <div class="small muted num" id="tlabel" style="text-align:center"></div>
      </div>
      <div class="chips"><button class="chip" id="labels" aria-pressed="${S.labels}">🏷️ Adlar</button><button class="chip" id="geo">📡 Konumum</button></div>
    </div>
  </section>`;
  const canvas = $('#dome'), bubble = $('#bubble');
  const date = () => new Date(Date.now() + offset * 60000);
  const tlabel = () => { $('#tlabel').textContent = `${offset === 0 ? 'Şimdi' : `${Math.floor(offset / 60) ? `${Math.floor(offset / 60)} saat ` : ''}${offset % 60 ? `${offset % 60} dakika ` : ''}sonra`} · saat ${date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`; };
  const dome = new SkyDome(canvas, { lat, lon, date: date(), facing, cons: skyCons(), showLabels: S.labels });
  dome.start(); tlabel();
  const upd = () => { dome.set({ date: date(), facing }); tlabel(); };
  $('#time').oninput = (e) => { offset = +e.target.value; upd(); };
  $('#now').onclick = () => { offset = 0; $('#time').value = 0; upd(); };
  $('#play').onclick = () => { if (playing) { clearInterval(playing); playing = 0; return; } playing = setInterval(() => { offset += 10; if (offset > 720) offset = 0; $('#time').value = offset; upd(); }, 60); };
  main.querySelectorAll('[data-facing]').forEach(b => b.onclick = () => { facing = +b.dataset.facing; main.querySelectorAll('[data-facing]').forEach(x => x.setAttribute('aria-pressed', x === b)); upd(); });
  $('#labels').onclick = (e) => { S.labels = !S.labels; save(); e.currentTarget.setAttribute('aria-pressed', S.labels); dome.set({ showLabels: S.labels }); };
  $('#loc').onclick = openSettings;
  $('#geo').onclick = () => locate(route);
  canvas.onclick = (e) => {
    const r = canvas.getBoundingClientRect(); const id = dome.pick(e.clientX - r.left, e.clientY - r.top);
    dome.set({ highlight: id });
    if (!id) { bubble.hidden = true; return; }
    const l = lessonById(id);
    bubble.hidden = false; bubble.className = 'bubble'; bubble.innerHTML = html`${l.emoji} <span class="latin">${l.name}</span> · ${l.latin}`;
    bubble.onclick = () => nav(`lesson/${id}`);
    speak(l.name);
  };
  const onResize = () => dome.resize();
  window.addEventListener('resize', onResize);
  current.cleanup = () => { dome.stop(); clearInterval(playing); window.removeEventListener('resize', onResize); };
}
function locate(cb) {
  if (!navigator.geolocation) return toast('Bu cihazda konum özelliği yok');
  toast('Konum bulunuyor…');
  navigator.geolocation.getCurrentPosition(p => { S.geo = { lat: +p.coords.latitude.toFixed(3), lon: +p.coords.longitude.toFixed(3) }; S.city = 'geo'; save(); toast('Konum kaydedildi ✅'); cb && cb(); }, () => toast('Konum izni verilmedi. Ayarlardan şehir seç.'), { timeout: 10000 });
}

/* ---------- practice ---------- */
function renderPractice(main) {
  const modes = [
    { id: 'name', ic: '🏷️', t: 'Adı ne?', d: 'Şekle bak, adını seç' },
    { id: 'shape', ic: '✨', t: 'Hangisi?', d: 'Adı oku, doğru şekli bul' },
    { id: 'sky', ic: '🌌', t: 'Gökyüzünde bul', d: 'Haritada ona dokun' },
    { id: 'cards', ic: '🃏', t: 'Kartlar', d: 'Acele yok: her kartta bir takımyıldız' },
  ];
  const p = pool();
  main.innerHTML = html`<section class="view">
    <h1>Alıştırma 🎯</h1>
    <p class="muted">${p.length === conLessons().length ? 'Bütün takımyıldızlarla alıştırma.' : `Öğrendiğin ${p.length} takımyıldızla alıştırma.`}</p>
    <div class="modes" style="margin-top:14px">${modes.map(m => html`<button class="mode" data-mode="${m.id}"><span class="ic" aria-hidden="true">${m.ic}</span><span class="t"><b>${m.t}</b><span>${m.d}</span></span><span class="small muted num">${S.best[m.id] != null ? `En iyi: ${S.best[m.id]}` : ''}</span></button>`).join('')}</div>
  </section>`;
  main.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => nav(`quiz/${b.dataset.mode}`));
}

function renderQuiz(mode) {
  const ov = $('#overlay');
  if (mode === 'cards') return renderCards(ov);
  const p = pool(), all = conLessons();
  const N = 10;
  const qs = shuffle(Array.from({ length: N }, (_, i) => p[i % p.length])).map(t => {
    if (mode === 'name') return { q: 'Bu takımyıldızın adı ne?', figure: t.scene, options: nameOptions(t, all).map(l => ({ label: optName(l), ok: l === t })), say: t.name };
    if (mode === 'shape') return { q: `Hangisi <span class="latin">${t.name}</span>?`, figOptions: true, options: nameOptions(t, all).map(l => ({ scene: l.scene, ok: l === t })), say: t.name };
    return { sky: t };
  });
  let i = 0, correct = 0, dome = null;
  const head = (title) => html`<div class="player" role="dialog" aria-label="${title}"><div class="phead"><button class="icon-btn" id="close" aria-label="Kapat">${ICON_X}</button><div class="steps">${qs.map((_, k) => `<i class="${k < i ? 'on' : ''}"><b></b></i>`).join('')}</div><span class="small muted num">✅ ${correct}</span></div><div class="pbody" id="pbody"></div></div>`;
  const leave = () => { dome && dome.stop(); ov.innerHTML = ''; nav('practice'); };
  const done = () => {
    S.best[mode] = Math.max(S.best[mode] || 0, correct); save();
    const stars = correct >= 9 ? '⭐⭐⭐' : correct >= 7 ? '⭐⭐' : correct >= 5 ? '⭐' : '🌱';
    ov.innerHTML = head('Sonuç');
    $('#pbody').innerHTML = html`<div class="result card"><div class="big">${stars}</div><h1 style="margin-top:10px">${correct >= 9 ? 'Harika!' : correct >= 7 ? 'Aferin!' : correct >= 5 ? 'İyi, devam et' : 'Olsun, bir daha!'}</h1><p class="muted num" style="margin-top:6px">${N} sorudan ${correct} doğru</p>
      <div class="row" style="justify-content:center;margin-top:18px"><button class="btn" id="again">Tekrar 🔁</button><button class="btn ghost" id="back">Geri dön</button></div></div>`;
    if (correct >= 7) confetti($('#confetti'));
    $('#again').onclick = () => renderQuiz(mode); $('#back').onclick = leave; $('#close').onclick = leave;
  };
  const show = () => {
    dome && dome.stop(); dome = null;
    if (i >= N) return done();
    const q = qs[i];
    ov.innerHTML = head('Alıştırma');
    $('#close').onclick = leave;
    const body = $('#pbody');
    if (q.sky) {
      const t = q.sky;
      const { lat, lon } = place(); const d = eveningFor(t.id);
      const up = SKY_CONS.filter(id => conAltAz(id, lat, lon, d).alt > 12);
      const cons = shuffle(up.filter(id => id !== t.id)).slice(0, 5).concat(t.id).map(id => ({ id, lines: LINES[id], label: '' }));
      body.innerHTML = html`<div class="quiz-q">${t.emoji} ${t.acc} gökyüzünde bul ve ona dokun</div><div class="sky-wrap"><canvas id="qdome" role="img" aria-label="Gökyüzü haritası"></canvas></div><p class="small muted" style="margin-top:8px;text-align:center">${d.toLocaleDateString('tr-TR', { month: 'long' })} · saat 21.30 · ${placeName()}</p>`;
      const c = $('#qdome', body);
      dome = new SkyDome(c, { lat, lon, date: d, facing: 180, cons, showLabels: false }); dome.start();
      c.onclick = (e) => {
        if (c.dataset.lock) return; c.dataset.lock = '1';
        const r = c.getBoundingClientRect(); const id = dome.pick(e.clientX - r.left, e.clientY - r.top);
        const ok = id === t.id; dome.set({ highlight: t.id, cons: cons.map(x => ({ ...x, label: x.id === t.id ? t.name : '' })), showLabels: true });
        if (ok) { correct++; buzz(30); toast('Aferin! ✅'); speak(t.name); } else { buzz([60, 40, 60]); toast(id ? `Bu ${lessonById(id).name}. Doğrusu altın renkli olan.` : 'Yıldızlara dokun. Doğrusu altın renkli olan.'); }
        setTimeout(() => { i++; show(); }, ok ? 1100 : 2200);
      };
      return;
    }
    body.innerHTML = quizMarkup([q]);
    bindQuiz(body, [q], (c) => { correct += c; i++; show(); });
    $('#qn', body).textContent = `Soru ${i + 1} / ${N}`; $('#qs', body).textContent = `✅ ${correct}`;
  };
  current.cleanup = () => dome && dome.stop();
  show();
}

function renderCards(ov) {
  const all = conLessons().slice().sort((a, b) => (S.cards[a.id] || 0) - (S.cards[b.id] || 0));
  let i = 0, fig = null;
  const leave = () => { fig && fig.stop(); ov.innerHTML = ''; nav('practice'); };
  const show = () => {
    fig && fig.stop();
    const L = all[i];
    ov.innerHTML = html`<div class="player" role="dialog" aria-label="Kartlar"><div class="phead"><button class="icon-btn" id="close" aria-label="Kapat">${ICON_X}</button><div class="steps">${all.map((_, k) => `<i class="${k <= i ? 'on' : ''}"><b></b></i>`).join('')}</div><span class="small muted num">${i + 1}/${all.length}</span></div>
      <div class="pbody"><div class="flash" id="flash" role="button" tabindex="0" aria-label="Kartı çevir"><div class="face front"><div style="width:100%"><div class="figure-wrap" style="max-height:40dvh"><canvas id="fig" role="img" aria-label="Şekil"></canvas></div><p class="muted" style="text-align:center;margin-top:10px">${L.emoji} Karta dokun</p></div></div>
      <div class="face back"><div class="name-block"><div class="big">${L.name}</div><div class="pron">${L.latin}${L.nick ? ' · ' + L.nick : ''}</div><p class="muted small" style="margin-top:8px">${L.shape ? 'Şekli: ' + L.shape : ''}</p></div></div></div></div>
      <div class="pfoot"><button class="btn ghost block" id="no">Henüz değil 🔁</button><button class="btn block" id="yes">Biliyorum ✅</button></div></div>`;
    fig = makeFigure($('#fig'), L.scene, { labels: {} }); fig.animate(900);
    const fl = $('#flash'); let flipped = false;
    fl.onclick = () => { flipped = !flipped; fl.classList.toggle('flipped', flipped); if (flipped) speak(L.name); };
    fl.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fl.onclick(); } };
    const next = (know) => { S.cards[L.id] = Math.max(0, Math.min(3, (S.cards[L.id] || 0) + (know ? 1 : -1))); save(); i++; if (i < all.length) show(); else { leave(); confetti($('#confetti')); toast('Bütün kartları gördün 🎉'); } };
    $('#yes').onclick = () => next(true); $('#no').onclick = () => next(false);
    $('#close').onclick = leave;
  };
  current.cleanup = () => fig && fig.stop();
  show();
}

/* ---------- settings ---------- */
function openSettings() {
  const ov = $('#overlay');
  const chips = (name, opts, val) => opts.map(([v, t]) => `<button class="chip" data-set="${name}" data-v="${v}" aria-pressed="${val === v}">${t}</button>`).join('');
  ov.innerHTML = html`<div class="sheet-backdrop" id="bd"></div><div class="sheet" role="dialog" aria-label="Ayarlar"><div class="grab"></div>
    <h2>Ayarlar ⚙️</h2>
    <div class="setting"><label>Görünüm</label><div class="chips">${chips('theme', [['dark', '🌙 Gece'], ['light', '☀️ Gündüz'], ['auto', 'Otomatik']], S.theme)}</div></div>
    <div class="setting"><label for="city">Şehir (gökyüzü haritası için)</label><select id="city">${CITIES.map(c => `<option value="${c.id}" ${S.city === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}${S.geo ? `<option value="geo" ${S.city === 'geo' ? 'selected' : ''}>Konumum</option>` : ''}</select><button class="chip" id="geo2">📡 Telefonun konumunu kullan</button></div>
    <div class="setting"><label>İlerleme</label><div class="row"><span class="grow muted small">${Object.keys(S.done).length} ders tamamlandı</span><button class="chip" id="reset" style="color:var(--red)">Baştan başla</button></div></div>
    <div class="setting small muted">Yıldız konumları: HYG / d3-celestial. Her şey bu cihazda kalır; hiçbir veri gönderilmez.</div>
  </div>`;
  const close = () => { ov.innerHTML = ''; route(); };
  $('#bd').onclick = close;
  ov.querySelectorAll('[data-set]').forEach(b => b.onclick = () => { S[b.dataset.set] = b.dataset.v; save(); applyTheme(); ov.querySelectorAll(`[data-set=${b.dataset.set}]`).forEach(x => x.setAttribute('aria-pressed', x === b)); });
  $('#city').onchange = (e) => { S.city = e.target.value; save(); };
  $('#geo2').onclick = () => locate(openSettings);
  $('#reset').onclick = () => { if (confirm('Bütün ilerleme silinsin mi?')) { S.done = {}; S.cards = {}; S.best = {}; save(); close(); toast('Baştan başladın'); } };
}

/* ---------- boot ---------- */
applyTheme();
matchMedia('(prefers-color-scheme: light)').addEventListener('change', applyTheme);
ambientSky($('#bg'));
$('#settings-btn').onclick = openSettings;
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') ($('#overlay #close') || $('#overlay #bd'))?.click(); });
document.querySelectorAll('#tabbar button').forEach(b => b.onclick = () => nav(b.dataset.route));
window.addEventListener('hashchange', route);
if ('speechSynthesis' in window) speechSynthesis.getVoices();
document.fonts && document.fonts.ready.then(() => { if (location.hash === '#sky') route(); }); // redraw dome labels with the loaded font
route();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
