// Yıldızlar: state, routing, views (home / learn / sky / practice), lesson player, quizzes, settings.
import { HIP, LINES } from './catalog.js';
import { altAz, lstDeg } from './astro.js';
import { SkyDome, Figure, ambientSky, confetti } from './sky.js';
import { CITIES, VOCAB, STARS, LESSONS, GROUPS, SKY_CONS, SEASONS, lessonById, conLessons } from './data.js';

/* ---------- state ---------- */
const KEY = 'yildizlar.v1';
// city: 'auto' = the phone's location, otherwise a CITIES id picked in Settings
const DEFAULTS = { onboarded: false, theme: 'dark', city: 'auto', cityPicked: false, geo: null, geoAsked: false, labels: true, done: {}, cards: {}, best: {} };
let S = load();
function load() {
  try {
    const s = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
    // older builds stored Tehran as a silent default and 'geo' for the phone: both now mean "use the phone"
    if (s.city === 'geo' || (s.city === 'tehran' && !s.cityPicked)) s.city = 'auto';
    return s;
  } catch { return { ...DEFAULTS }; }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* private mode: keep going in memory */ } }

const DIRS = ['kuzey', 'kuzeydoğu', 'doğu', 'güneydoğu', 'güney', 'güneybatı', 'batı', 'kuzeybatı'];
const dirWord = (az) => DIRS[Math.round(az / 45) % 8];
const altWord = (alt) => alt > 65 ? 'tam tepede' : alt > 40 ? 'yüksekte' : alt > 20 ? 'orta yükseklikte' : 'ufka yakın';
// Before the first GPS fix, guess the place from the phone's time zone.
const TZ_CITY = { 'Asia/Tehran': 'tehran', 'Asia/Baku': 'baku', 'Europe/Istanbul': 'istanbul' };
function tzGuess() {
  let tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { /* very old browser */ }
  return CITIES.find(c => c.id === TZ_CITY[tz]) || { name: 'Tahmini konum', lat: 40, lon: -new Date().getTimezoneOffset() / 4 };
}
const place = () => S.city !== 'auto' ? (CITIES.find(c => c.id === S.city) || CITIES[0]) : (S.geo || tzGuess());
const placeName = () => S.city !== 'auto' ? place().name : S.geo ? 'Konumum' : tzGuess().id ? `${tzGuess().name} (tahmini)` : 'Tahmini konum';
const deg = (x) => Math.abs(x).toLocaleString('tr-TR', { maximumFractionDigits: 2 });
const coordText = (p) => `${deg(p.lat)}° ${p.lat >= 0 ? 'K' : 'G'} · ${deg(p.lon)}° ${p.lon >= 0 ? 'D' : 'B'}`;
// Lesson text can say {lat} and {fist}: the Polaris altitude where the reader stands.
function fill(t) {
  if (!t || !t.includes('{lat}')) return t;
  const lat = Math.round(place().lat);
  if (lat < 1) return t.split('. ')[0] + '. Bulunduğun yerden Kutup Yıldızı görünmez.';
  return t.replace('{lat}', lat).replace('{fist}', (Math.round(lat / 5) / 2).toLocaleString('tr-TR'));
}
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
      <h1>Gökyüzünü tanıyalım ✨</h1>
      <p class="muted">Yıldızların adlarını, şekillerini, gökyüzündeki yerlerini ve kuzeyi bulmanın yolunu öğren.</p>
    </div>
    <div class="feature-list">
      <div class="feature"><span aria-hidden="true">🐻</span><span><b>Bak</b><span class="sub">Her takımyıldızın şekli gözünün önünde çizilir.</span></span></div>
      <div class="feature"><span aria-hidden="true">🧭</span><span><b>Bul</b><span class="sub">Canlı harita, bu gece nereye bakacağını gösterir.</span></span></div>
      <div class="feature"><span aria-hidden="true">🎯</span><span><b>Dene</b><span class="sub">Kısa alıştırmalarla adlar aklında kalır.</span></span></div>
    </div>
    <div>
      <button class="btn lg block" id="start">Başlayalım 🚀</button>
      <p class="small muted center" style="margin-top:10px">📍 Gökyüzünü bulunduğun yere göre çizmek için konumunu soracağız. Konumun yalnızca bu telefonda kalır.</p>
    </div>
  </section>`;
  $('#start').onclick = () => { S.onboarded = true; save(); $('#topbar').hidden = false; $('#tabbar').hidden = false; nav('home'); route(); locate('ask'); };
}

/* ---------- home ---------- */
function renderHome(main) {
  const total = LESSONS.length, done = LESSONS.filter(l => S.done[l.id]).length;
  const pct = Math.round(done / total * 100);
  const next = LESSONS.find(l => !S.done[l.id]);
  const up = upNow().slice(0, 4);
  const hour = new Date().getHours();
  const greet = hour < 11 ? 'Günaydın' : hour < 18 ? 'İyi günler' : 'İyi akşamlar';
  const tile = (attrs, emoji, name, sub) => html`<button class="tile" ${attrs}><span class="tile-emoji" aria-hidden="true">${emoji}</span><span class="tile-name">${name}</span><span class="tile-sub">${sub}</span></button>`;
  main.innerHTML = html`<section class="view home">
    <div class="card hero">
      <div class="hero-text">
        <h1>${greet} 👋</h1>
        <p class="muted">${done === 0 ? 'İlk yıldızını öğrenmeye hazır mısın?' : done === total ? 'Hepsini öğrendin! Şimdi dışarı çık, gökyüzüne bak 🌙' : `${total} dersin ${done} tanesini bitirdin.`}</p>
        <button class="btn" id="continue">${next ? (done ? 'Devam et' : 'Başla') + ' ' + next.emoji : 'Alıştırma yap 🎯'}</button>
      </div>
      <div class="ring" role="img" aria-label="İlerleme yüzde ${pct}">
        <svg viewBox="0 0 100 100"><circle class="track" cx="50" cy="50" r="42"/><circle class="bar" cx="50" cy="50" r="42" stroke-dasharray="264" stroke-dashoffset="${264 - 264 * pct / 100}"/></svg>
        <div class="label num">%${pct}</div>
      </div>
    </div>
    ${S.city === 'auto' && !S.geo ? html`<div class="card notice"><span aria-hidden="true">📍</span><span class="grow"><b>Konumun henüz alınmadı</b><span class="sub">Şimdilik tahmini yer: ${tzGuess().name}</span></span><button class="btn sm" id="geo-home">Konumu kullan</button></div>` : ''}
    <div class="section-title"><h2>Bu gece gökyüzünde 🌙</h2><button class="chip" id="to-sky">Canlı harita</button></div>
    ${up.length ? html`<div class="tiles">${up.map(c => { const l = lessonById(c.id); return tile(`data-lesson="${l.id}"`, l.emoji, l.name, `${dirWord(c.az)} · ${altWord(c.alt)}`); }).join('')}</div>`
      : '<div class="empty card"><div class="ic">☁️</div>Şu anda öğrendiğimiz takımyıldızlardan hiçbiri gökyüzünde görünmüyor. Birkaç saat sonra yeniden bak.</div>'}
    <div class="tiles shortcuts">
      ${tile('data-lesson="nav-polaris"', '🧭', 'Kuzeyi bul', 'Kutup Yıldızı ile')}
      ${tile('id="to-practice"', '🎯', 'Hızlı alıştırma', 'On soru')}
    </div>
  </section>`;
  $('#continue').onclick = () => nav(next ? `lesson/${next.id}` : 'practice');
  $('#to-sky').onclick = () => nav('sky');
  const gh = $('#geo-home'); if (gh) gh.onclick = () => locate('user', route);
  $('#to-practice').onclick = () => nav('quiz/name');
  main.querySelectorAll('[data-lesson]').forEach(b => b.onclick = () => nav(`lesson/${b.dataset.lesson}`));
}

/* ---------- learn ---------- */
let learnGroup = null; // the season tab stays selected while the app is open
function renderLearn(main) {
  const groups = Object.keys(GROUPS);
  const done = LESSONS.filter(l => S.done[l.id]).length;
  if (!learnGroup) learnGroup = (LESSONS.find(l => !S.done[l.id]) || LESSONS[0]).group;
  main.innerHTML = html`<section class="view learn">
    <div class="row between"><h1>Öğren 📚</h1><span class="pill num" aria-label="${LESSONS.length} dersten ${done} tanesi bitti">⭐ ${done}/${LESSONS.length}</span></div>
    <div class="seg" role="tablist" aria-label="Mevsimler">${groups.map(g => html`<button role="tab" data-group="${g}" aria-selected="${g === learnGroup}"><span aria-hidden="true">${GROUPS[g].emoji}</span>${GROUPS[g].short}</button>`).join('')}</div>
    <div class="tiles lessons" role="tabpanel" id="lesson-tiles"></div>
  </section>`;
  const paint = () => {
    const box = $('#lesson-tiles');
    box.innerHTML = LESSONS.filter(l => l.group === learnGroup).map(l => html`<button class="tile lesson-tile ${S.done[l.id] ? 'done' : ''}" data-lesson="${l.id}">
      <span class="tile-emoji" aria-hidden="true">${l.emoji}</span><span class="tile-name">${l.name}</span><span class="tile-sub">${l.latin}</span>
      ${S.done[l.id] ? '<span class="badge" aria-label="bitti">⭐</span>' : ''}</button>`).join('');
    box.querySelectorAll('[data-lesson]').forEach(b => b.onclick = () => nav(`lesson/${b.dataset.lesson}`));
    box.classList.remove('swap'); void box.offsetWidth; box.classList.add('swap');
  };
  main.querySelectorAll('[data-group]').forEach(b => b.onclick = () => { learnGroup = b.dataset.group; main.querySelectorAll('[data-group]').forEach(x => x.setAttribute('aria-selected', x === b)); paint(); });
  paint();
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
    const isQuiz = step === steps.length - 1;
    ov.innerHTML = html`<div class="player" role="dialog" aria-label="${L.name}">
      <div class="phead">
        <button class="icon-btn" id="close" aria-label="Kapat">${ICON_X}</button>
        <div class="steps" aria-label="Adım ${step + 1} / ${steps.length}">${steps.map((s, i) => `<i class="${i <= step ? 'on' : ''}"><b></b></i>`).join('')}</div>
        <span class="small muted">${steps[step]}</span>
      </div>
      <div class="pbody ${L.kind !== 'vocab' && !isQuiz ? 'two' : ''}" id="pbody"></div>
      ${isQuiz ? '' : html`<div class="pfoot">${step > 0 ? '<button class="btn ghost" id="prev">Geri</button>' : ''}<button class="btn block" id="next">İleri</button></div>`}
    </div>`;
    const body = $('#pbody');
    const sceneBox = () => L.scene.dome
      ? '<div class="dome-box"><div class="sky-wrap"><canvas id="dome" role="img" aria-label="Yaz gökyüzü"></canvas></div></div>'
      : html`<div class="figure-wrap"><canvas id="fig" aria-label="${L.name} şekli" role="img"></canvas>${L.kind !== 'nav' ? `<span class="mascot bob" aria-hidden="true">${L.emoji}</span>` : ''}${step === 0 && L.scene.full ? `<button class="chip on-figure" id="full">${fullOn ? 'Kepçeyi gör' : 'Bütün ayıyı gör'} 🐻</button>` : ''}</div>`;
    const nameBlock = () => html`<div class="name-block"><div><div class="big">${L.name}</div><div class="pron">${L.latin}${L.nick ? ` · ${L.nick}` : ''}</div></div><button class="icon-btn speak" id="speak" aria-label="Adı dinle">🔊</button></div>`;
    const info = (ic, text) => html`<div class="fact" id="info" aria-live="polite"><span class="ic">${ic}</span><span>${text}</span></div>`;
    if (isQuiz) body.innerHTML = quizMarkup(questions);
    else if (L.kind === 'vocab') {
      body.innerHTML = html`<div class="name-block"><div><div class="big">${L.name}</div><div class="pron">${L.intro.join(' ')}</div></div></div>
        <div class="word-grid">${VOCAB.map((v, i) => html`<button class="word" data-word="${i}"><span aria-hidden="true">${v.emoji}</span><span class="latin">${v.word}</span></button>`).join('')}</div>
        ${info('💡', `${fill(L.fact)} Bir kelimeye dokun; anlamını gör, sesini dinle.`)}`;
      body.querySelectorAll('[data-word]').forEach(b => b.onclick = () => {
        const v = VOCAB[+b.dataset.word];
        body.querySelectorAll('[data-word]').forEach(x => x.setAttribute('aria-pressed', x === b));
        $('#info', body).innerHTML = html`<span class="ic">${v.emoji}</span><span><b class="latin">${v.word}</b>: ${v.desc}</span>`;
        speak(v.word);
      });
    } else if (step === 0) {
      body.innerHTML = sceneBox() + nameBlock() + html`<div class="kid">${L.intro.map(s => `<p>${s}</p>`).join('')}</div>`;
    } else if (step === 1) {
      body.innerHTML = sceneBox() + html`<div class="kid steps-list">${L.find.map(s => `<p>${s}</p>`).join('')}</div>
        ${L.when ? html`<dl class="when"><div><dt>📅 Mevsim</dt><dd>${L.when.season}</dd></div><div><dt>🧭 Yön</dt><dd>${L.when.dir}</dd></div><div><dt>⏰ En iyi</dt><dd>${L.when.best}</dd></div></dl>` : ''}
        ${!hasKnow && L.fact ? info(L.kind === 'nav' ? '✋' : '💡', fill(L.fact)) : ''}`;
    } else {
      body.innerHTML = sceneBox() + info('💡', fill(L.fact)) + (L.story ? html`<div class="fact gold"><span class="ic">📖</span><span>${L.story}</span></div>` : '')
        + (L.stars.length ? html`<div class="star-chips" aria-label="Yıldızları">${L.stars.map(k => html`<button class="star-chip" data-star="${k}" style="--c:${STARS[k].color}"><span class="dot"></span><span class="latin">${STARS[k].name}</span></button>`).join('')}</div>` : '');
    }
    const showStar = (k) => {
      const s = STARS[k], box = $('#info', body); if (!box) return;
      body.querySelectorAll('[data-star]').forEach(x => x.setAttribute('aria-pressed', x.dataset.star === k));
      box.innerHTML = html`<span class="ic">⭐</span><span><b class="latin">${s.name}</b> <span class="sub">${s.latin}</span><br>${s.fact}</span>`;
      speak(s.name);
    };
    // canvases
    const c = $('#fig', body);
    if (c) {
      const scene = fullOn && L.scene.full ? { ...L.scene, figures: [{ id: L.scene.full, lines: LINES[L.scene.full] }] } : L.scene;
      const labels = step === 2 ? { ...labelsFor(scene), ...Object.fromEntries(L.stars.map(k => [STARS[k].hip, STARS[k].name])) } : labelsFor(scene);
      fig = makeFigure(c, scene, { labels });
      fig.animate(step === 0 ? 2200 : 1600);
      c.onclick = (e) => {
        const r = c.getBoundingClientRect(); const hip = fig.pick(e.clientX - r.left, e.clientY - r.top);
        const k = hip && Object.keys(STARS).find(k => STARS[k].hip === hip); if (!k) return;
        if ($('#info', body)) showStar(k); else { toast(`${STARS[k].name} · ${STARS[k].latin}`); speak(STARS[k].name); }
      };
    }
    const d = $('#dome', body);
    if (d) {
      const { lat, lon } = place(); const m = L.scene.dome;
      dome = new SkyDome(d, { lat, lon, date: new Date(new Date().getFullYear(), m.month - 1, m.day, m.hour), facing: m.facing, cons: skyCons(), showLabels: true });
      dome.start();
    }
    body.querySelectorAll('[data-star]').forEach(b => b.onclick = () => showStar(b.dataset.star));
    const sp = $('#speak', body); if (sp) sp.onclick = () => speak(L.name);
    const fb = $('#full', body); if (fb) fb.onclick = () => { fullOn = !fullOn; draw(); };
    if (isQuiz) bindQuiz(body, questions, finish);
    $('#close').onclick = close;
    const pv = $('#prev'); if (pv) pv.onclick = () => { step--; draw(); };
    const nx = $('#next'); if (nx) nx.onclick = () => { step++; draw(); };
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
    for (const v of shuffle(VOCAB).slice(0, 3)) qs.push({ q: `${v.emoji} ${v.desc}<br><small class="muted">Bu hangi kelime?</small>`, options: shuffle([v, ...shuffle(VOCAB.filter(x => x !== v)).slice(0, 3)]).map(x => ({ label: `<span class="latin">${x.word}</span>`, ok: x === v })), say: v.word });
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
    const wide = !q.figOptions && q.options.some(o => o.label.replace(/<[^>]+>/g, '').length > 26);
    box.innerHTML = html`<div class="quiz-q">${q.q}</div>${q.figure ? '<div class="figure-wrap"><canvas id="qfig" role="img" aria-label="Şekil"></canvas></div>' : q.figOptions ? '' : '<div class="grow"></div>'}
      <div class="options ${q.figOptions ? 'figs' : ''} ${wide ? 'wide' : ''}">${q.options.map((o, k) => `<button class="opt" data-k="${k}"${q.figOptions ? ` aria-label="${k + 1}. şekil"` : ''}>${q.figOptions ? '<canvas></canvas>' : o.label}</button>`).join('')}</div>`;
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
  main.innerHTML = html`<section class="view sky">
    <div class="row between"><h1>Gökyüzü 🌙</h1><button class="chip" id="loc">📍 ${placeName()}</button></div>
    <div class="dome-box"><div class="sky-wrap"><canvas id="dome" role="img" aria-label="Canlı gökyüzü haritası"></canvas><div id="bubble" hidden></div>${S.skyHint ? '' : '<div class="dome-hint" id="hint">Telefonu başının üstünde tut.<br>Haritanın altı, baktığın yön.</div>'}</div></div>
    <div class="facing" role="group" aria-label="Baktığın yön">${[['Kuzey', 0], ['Doğu', 90], ['Güney', 180], ['Batı', 270]].map(([t, v]) => `<button class="chip" data-facing="${v}" aria-pressed="${v === 180}">${t}</button>`).join('')}</div>
    <div class="time-row">
      <button class="icon-btn" id="play" aria-label="Zamanı ilerlet"><svg viewBox="0 0 24 24"><path d="M7 4l12 8-12 8z"/></svg></button>
      <div class="time-col"><input type="range" id="time" min="0" max="720" step="15" value="0" aria-label="Saat"><span class="small muted num" id="tlabel"></span></div>
      <button class="chip" id="now">Şimdi</button>
      <button class="icon-btn" id="labels" aria-pressed="${S.labels}" aria-label="Adları göster">🏷️</button>
    </div>
  </section>`;
  const canvas = $('#dome'), bubble = $('#bubble');
  const date = () => new Date(Date.now() + offset * 60000);
  const tlabel = () => { $('#tlabel').textContent = `${offset === 0 ? 'Şimdi' : `${Math.floor(offset / 60) ? `${Math.floor(offset / 60)} saat ` : ''}${offset % 60 ? `${offset % 60} dakika ` : ''}sonra`} · saat ${date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`; };
  const dome = new SkyDome(canvas, { lat, lon, date: date(), facing, cons: skyCons(), showLabels: S.labels });
  dome.start(); tlabel();
  // first visit: an in-map hint that never covers other screens
  if (!S.skyHint) { S.skyHint = true; save(); setTimeout(() => $('#hint')?.remove(), 8000); }
  const upd = () => { dome.set({ date: date(), facing }); tlabel(); };
  $('#time').oninput = (e) => { offset = +e.target.value; upd(); };
  $('#now').onclick = () => { offset = 0; $('#time').value = 0; upd(); };
  $('#play').onclick = () => { if (playing) { clearInterval(playing); playing = 0; return; } playing = setInterval(() => { offset += 10; if (offset > 720) offset = 0; $('#time').value = offset; upd(); }, 60); };
  main.querySelectorAll('[data-facing]').forEach(b => b.onclick = () => { facing = +b.dataset.facing; main.querySelectorAll('[data-facing]').forEach(x => x.setAttribute('aria-pressed', x === b)); upd(); });
  $('#labels').onclick = (e) => { S.labels = !S.labels; save(); e.currentTarget.setAttribute('aria-pressed', S.labels); dome.set({ showLabels: S.labels }); };
  // without a GPS fix, the location chip asks for it directly
  $('#loc').onclick = () => S.city === 'auto' && !S.geo ? locate('user', route) : openSettings();
  canvas.onclick = (e) => {
    $('#hint')?.remove();
    const r = canvas.getBoundingClientRect(); const id = dome.pick(e.clientX - r.left, e.clientY - r.top);
    dome.set({ highlight: id });
    if (!id) { bubble.hidden = true; return; }
    const l = lessonById(id);
    bubble.hidden = false; bubble.className = 'bubble'; bubble.innerHTML = html`${l.emoji} <span class="latin">${l.name}</span> · ${l.latin} ›`;
    bubble.onclick = () => nav(`lesson/${id}`);
    speak(l.name);
  };
  const onResize = () => dome.resize();
  window.addEventListener('resize', onResize);
  current.cleanup = () => { dome.stop(); clearInterval(playing); window.removeEventListener('resize', onResize); };
}
const GEO_ERR = {
  1: 'Konum izni kapalı. Tarayıcı ayarlarından bu siteye konum izni ver ya da Ayarlar\'dan şehir seç.',
  2: 'Konum bulunamadı. Telefonda konum (GPS) açık mı?',
  3: 'Konum bulunamadı. Açık bir yerde yeniden dene.',
};
// mode: 'silent' = refresh only if permission is already granted; 'ask' = may show the browser prompt; 'user' = button press, report the result and call `after`
function locate(mode, after) {
  if (!navigator.geolocation) { if (mode !== 'silent') toast('Bu cihaz konum bulamıyor. Ayarlar\'dan şehir seç.', 5000); return; }
  const run = () => {
    if (mode !== 'silent') { S.geoAsked = true; save(); }
    if (mode === 'user') toast('Konum bulunuyor…');
    navigator.geolocation.getCurrentPosition((p) => {
      const g = { lat: +p.coords.latitude.toFixed(3), lon: +p.coords.longitude.toFixed(3) };
      const moved = S.city !== 'auto' || !S.geo || Math.abs(g.lat - S.geo.lat) + Math.abs(g.lon - S.geo.lon) > 0.1;
      S.geo = g; S.city = 'auto'; save();
      if (mode === 'user') { toast(`Konum bulundu ✅ ${coordText(g)}`, 3000); return after && after(); }
      // redraw only views that show the sky, and never under an open lesson or sheet
      if (moved && !$('#overlay').children.length && ['home', 'sky'].includes(location.hash.slice(1) || 'home')) route();
    }, (e) => { if (mode !== 'silent') toast(GEO_ERR[e.code] || GEO_ERR[2], 6000); }, { timeout: 20000, maximumAge: 600000 });
  };
  if (mode !== 'silent') return run();
  navigator.permissions?.query({ name: 'geolocation' }).then(r => { if (r.state === 'granted') run(); }).catch(() => { /* no Permissions API: keep the saved fix */ });
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
  main.innerHTML = html`<section class="view practice">
    <h1>Alıştırma 🎯</h1>
    <p class="muted">${p.length === conLessons().length ? 'Bütün takımyıldızlarla alıştırma.' : `Öğrendiğin ${p.length} takımyıldızla alıştırma.`}</p>
    <div class="tiles modes">${modes.map(m => html`<button class="tile mode-tile" data-mode="${m.id}"><span class="tile-emoji" aria-hidden="true">${m.ic}</span><span class="tile-name">${m.t}</span><span class="tile-sub">${m.d}</span>${S.best[m.id] != null ? `<span class="badge num">🏆 ${S.best[m.id]}</span>` : ''}</button>`).join('')}</div>
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
      body.innerHTML = html`<div class="quiz-q">${t.emoji} ${t.acc} gökyüzünde bul ve ona dokun</div><div class="dome-box"><div class="sky-wrap"><canvas id="qdome" role="img" aria-label="Gökyüzü haritası"></canvas></div></div><p class="small muted center">${d.toLocaleDateString('tr-TR', { month: 'long' })} · saat 21.30 · ${placeName()}</p>`;
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
    <div class="setting"><label for="city">Konum (gökyüzü haritası için)</label><select id="city"><option value="auto" ${S.city === 'auto' ? 'selected' : ''}>📍 Telefonun konumu</option>${CITIES.map(c => `<option value="${c.id}" ${S.city === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}</select>
      <p class="small muted" id="geo-status">${S.city !== 'auto' ? `${place().name}: ${coordText(place())}` : S.geo ? `Konumun: ${coordText(S.geo)}` : `Konum henüz alınmadı. Şimdilik ${tzGuess().name} kullanılıyor.`}</p>
      <button class="chip" id="geo2">📡 Konumumu şimdi bul</button></div>
    <div class="setting"><label>İlerleme</label><div class="row"><span class="grow muted small">${Object.keys(S.done).length} ders tamamlandı</span><button class="chip" id="reset" style="color:var(--red)">Baştan başla</button></div></div>
    <div class="setting small muted">Yıldız konumları: HYG / d3-celestial. Her şey bu cihazda kalır; hiçbir veri gönderilmez.</div>
  </div>`;
  const close = () => { ov.innerHTML = ''; route(); };
  $('#bd').onclick = close;
  ov.querySelectorAll('[data-set]').forEach(b => b.onclick = () => { S[b.dataset.set] = b.dataset.v; save(); applyTheme(); ov.querySelectorAll(`[data-set=${b.dataset.set}]`).forEach(x => x.setAttribute('aria-pressed', x === b)); });
  $('#city').onchange = (e) => { S.city = e.target.value; S.cityPicked = S.city !== 'auto'; save(); if (S.city === 'auto') locate('user', openSettings); else openSettings(); };
  $('#geo2').onclick = () => locate('user', openSettings);
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
if (S.onboarded && S.city === 'auto') locate(S.geo || S.geoAsked ? 'silent' : 'ask');
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
