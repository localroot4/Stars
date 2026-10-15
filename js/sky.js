// Canvas renderers: the live sky dome and the single-constellation figure used in lessons and quizzes.
import { BG, HIP } from './catalog.js';
import { altAz, lstDeg, projectDome, projectLocal, separation, galacticEquator } from './astro.js';

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const LATIN_FONT = "'Baloo 2', 'Vazirmatn', sans-serif";
const BODY_FONT = "'Nunito', sans-serif";

export function starColor(bv) {
  if (bv < 0) return '#b8d4ff';
  if (bv < 0.3) return '#e6f0ff';
  if (bv < 0.6) return '#fff8e8';
  if (bv < 1.0) return '#ffe2a8';
  return '#ffb47a';
}
const starRadius = (mag, k) => Math.max(0.55, 3.4 - 0.62 * mag) * k;

function setupCanvas(canvas) {
  const dpr = Math.min(2.5, window.devicePixelRatio || 1);
  const w = canvas.clientWidth || 300, h = canvas.clientHeight || 300;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

function drawStar(ctx, x, y, r, color, glow) {
  if (glow && r > 1.6) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
    g.addColorStop(0, color); g.addColorStop(0.25, color + 'aa'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}

function haloText(ctx, text, x, y, font, color, align = 'center', dir = 'ltr') {
  ctx.font = font; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.direction = dir;
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(5,8,22,.85)'; ctx.lineJoin = 'round';
  ctx.strokeText(text, x, y); ctx.fillStyle = color; ctx.fillText(text, x, y);
}

const easeOut = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3); // rAF timestamps can precede t0

/* ---------- live dome ---------- */
export class SkyDome {
  // cons: [{ id, lines: [[hip,...]], label }]
  constructor(canvas, opts) {
    this.canvas = canvas;
    this.o = Object.assign({ lat: 35.69, lon: 51.39, date: new Date(), facing: 180, cons: [], highlight: null, showLabels: true, cardinals: ['Kuzey', 'Doğu', 'Güney', 'Batı'] }, opts);
    this.static = document.createElement('canvas');
    this.phase = BG.map(() => Math.random() * Math.PI * 2);
    this.visible = [];
    this.picks = [];
    this.raf = 0; this.last = 0;
    this.resize();
  }
  set(o) { Object.assign(this.o, o); this.renderStatic(); }
  resize() {
    const { w, h } = setupCanvas(this.canvas);
    this.w = w; this.h = h;
    setupCanvas(this.static);
    this.static.width = this.canvas.width; this.static.height = this.canvas.height;
    this.R = Math.min(w, h) / 2 - 30; this.cx = w / 2; this.cy = h / 2;
    this.renderStatic();
  }
  proj(ra, dec) {
    const { alt, az } = altAz(ra, dec, this.o.lat, this.lst);
    const p = projectDome(alt, az, this.cx, this.cy, this.R, this.o.facing);
    return { ...p, alt, az };
  }
  renderStatic() {
    const c = this.static, dpr = c.width / this.w;
    const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { w, h, R, cx, cy } = this;
    this.lst = lstDeg(this.o.date, this.o.lon);
    ctx.clearRect(0, 0, w, h);
    // dome
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    g.addColorStop(0, '#0a1230'); g.addColorStop(0.75, '#0b1538'); g.addColorStop(1, '#17254f');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
    // Milky Way band
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [b, a, wdt] of [[0, .16, .11], [5, .09, .1], [-5, .09, .1], [10, .045, .09], [-10, .045, .09]]) {
      const pts = galacticEquator(4, b).map(p => this.proj(p.ra, p.dec));
      ctx.strokeStyle = `rgba(190,205,255,${a})`; ctx.lineWidth = R * wdt;
      ctx.shadowColor = 'rgba(190,205,255,.5)'; ctx.shadowBlur = R * .06;
      ctx.beginPath(); let pen = false;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[(i + 1) % pts.length];
        if (p.alt > -3 && q.alt > -3 && Math.hypot(p.x - q.x, p.y - q.y) < R * .5) {
          if (!pen) { ctx.moveTo(p.x, p.y); pen = true; }
          ctx.lineTo(q.x, q.y);
        } else pen = false;
      }
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    // background stars
    this.visible = [];
    const k = Math.min(1.5, R / 170);
    for (let i = 0; i < BG.length; i++) {
      const [ra, dec, mag, bv] = BG[i];
      const p = this.proj(ra, dec);
      if (p.alt <= 0) continue;
      const dim = Math.min(1, 0.3 + p.alt / 12);
      ctx.globalAlpha = dim;
      const r = starRadius(mag, k);
      drawStar(ctx, p.x, p.y, r, starColor(bv), mag < 1.6);
      if (mag < 2.6) this.visible.push({ x: p.x, y: p.y, r, i });
    }
    ctx.globalAlpha = 1;
    // constellation figures
    this.picks = [];
    for (const con of this.o.cons) {
      const hi = con.id === this.o.highlight;
      const pts = [];
      ctx.strokeStyle = hi ? 'rgba(255,209,102,.95)' : 'rgba(143,227,255,.5)';
      ctx.lineWidth = hi ? 2.2 : 1.1;
      if (hi) { ctx.shadowColor = 'rgba(255,209,102,.9)'; ctx.shadowBlur = 10; }
      ctx.beginPath();
      for (const seg of con.lines) {
        let prev = null;
        for (const hip of seg) {
          const s = HIP[hip]; if (!s) { prev = null; continue; }
          const p = this.proj(s[0], s[1]);
          pts.push({ ...p, hip, mag: s[2] });
          if (prev && prev.alt > -1 && p.alt > -1) { ctx.moveTo(prev.x, prev.y); ctx.lineTo(p.x, p.y); }
          prev = p;
        }
      }
      ctx.stroke(); ctx.shadowBlur = 0;
      const up = pts.filter(p => p.alt > 0);
      if (!up.length) continue;
      for (const p of up) {
        drawStar(ctx, p.x, p.y, starRadius(p.mag, k) + .4, hi ? '#fff3c4' : '#f4f7ff', true);
        this.picks.push({ x: p.x, y: p.y, id: con.id });
      }
      const mx = up.reduce((a, p) => a + p.x, 0) / up.length, my = up.reduce((a, p) => a + p.y, 0) / up.length;
      con._c = { x: mx, y: my };
      if (this.o.showLabels || hi) {
        haloText(ctx, con.label, mx, my + 14 * k, `${hi ? 800 : 600} ${Math.round(12 * Math.max(.9, k))}px ${LATIN_FONT}`, hi ? '#ffd166' : 'rgba(220,232,255,.85)');
      }
    }
    ctx.restore();
    // horizon ring + cardinal points
    ctx.strokeStyle = 'rgba(159,175,220,.55)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    const names = this.o.cardinals;
    for (let i = 0; i < 4; i++) {
      const az = i * 90;
      const p = projectDome(-9, az, cx, cy, R, this.o.facing);
      p.x = Math.max(22, Math.min(w - 22, p.x)); p.y = Math.max(10, Math.min(h - 10, p.y)); // keep labels inside the canvas
      const bottom = ((az - this.o.facing + 360) % 360) === 0;
      haloText(ctx, names[i], p.x, p.y, `${bottom ? 900 : 700} ${bottom ? 14 : 12}px ${BODY_FONT}`, bottom ? '#ffd166' : '#c9d4f3');
    }
    // zenith mark
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx - 5, cy); ctx.lineTo(cx + 5, cy); ctx.moveTo(cx, cy - 5); ctx.lineTo(cx, cy + 5); ctx.stroke();
    this.blit(0);
  }
  blit(t) {
    const ctx = this.canvas.getContext('2d');
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.static, 0, 0); ctx.restore();
    if (REDUCED) return;
    ctx.globalCompositeOperation = 'lighter';
    for (const v of this.visible) {
      const a = 0.18 + 0.18 * Math.sin(t / 420 + this.phase[v.i] * 3);
      ctx.globalAlpha = a; ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(v.x, v.y, v.r + 1.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  start() {
    if (REDUCED) return this.blit(0);
    const loop = (t) => { if (t - this.last > 45) { this.last = t; this.blit(t); } this.raf = requestAnimationFrame(loop); };
    this.stop(); this.raf = requestAnimationFrame(loop);
  }
  stop() { cancelAnimationFrame(this.raf); this.raf = 0; }
  pick(x, y) {
    let best = null, bd = 26;
    for (const p of this.picks) { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = p.id; } }
    return best;
  }
  // which constellations are up right now (centre altitude > minAlt)
  up(minAlt = 15) {
    const out = [];
    for (const con of this.o.cons) {
      const hips = con.lines.flat().filter(h => HIP[h]);
      if (!hips.length) continue;
      let alt = 0, az = 0, n = 0;
      for (const h of hips) { const p = altAz(HIP[h][0], HIP[h][1], this.o.lat, this.lst); alt += p.alt; n++; az = p.az; }
      alt /= n;
      if (alt > minAlt) out.push({ id: con.id, alt, az });
    }
    return out.sort((a, b) => b.alt - a.alt);
  }
}

/* ---------- single figure (lesson / quiz) ---------- */
export class Figure {
  // opts: { figures: [{ lines: [[hip..]], highlight?: bool }], extra: [hip], hop: { from, to, times, target }, labels: { hip: text }, pad, dimBg }
  constructor(canvas, opts) {
    this.canvas = canvas;
    this.o = Object.assign({ figures: [], extra: [], hop: null, labels: {}, pad: 0.16, dimBg: true, lineColor: '#8fe3ff', bgStars: true }, opts);
    this.progress = 1; this.raf = 0;
    this.layout();
  }
  layout() {
    const { w, h } = setupCanvas(this.canvas);
    this.w = w; this.h = h;
    const hips = [...new Set([...this.o.figures.flatMap(f => f.lines.flat()), ...this.o.extra, ...(this.o.hop ? [this.o.hop.from, this.o.hop.to, this.o.hop.target] : [])])].filter(h => HIP[h]);
    // centre via unit vectors (handles RA wrap)
    let X = 0, Y = 0, Z = 0;
    for (const h of hips) { const [ra, dec] = HIP[h]; const r = ra * Math.PI / 180, d = dec * Math.PI / 180; X += Math.cos(d) * Math.cos(r); Y += Math.cos(d) * Math.sin(r); Z += Math.sin(d); }
    this.ra0 = Math.atan2(Y, X) * 180 / Math.PI; this.dec0 = Math.atan2(Z, Math.hypot(X, Y)) * 180 / Math.PI;
    const pts = hips.map(h => ({ hip: h, ...projectLocal(HIP[h][0], HIP[h][1], this.ra0, this.dec0) }));
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    let minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    if (this.o.hop) { // make room for the extended pointer line
      const f = pts.find(p => p.hip === this.o.hop.from), t = pts.find(p => p.hip === this.o.hop.to);
      const ex = t.x + (t.x - f.x) * this.o.hop.times, ey = t.y + (t.y - f.y) * this.o.hop.times;
      minX = Math.min(minX, ex); maxX = Math.max(maxX, ex); minY = Math.min(minY, ey); maxY = Math.max(maxY, ey);
    }
    const spanX = Math.max(maxX - minX, 2), spanY = Math.max(maxY - minY, 2);
    const pad = this.o.pad;
    this.scale = Math.min(w * (1 - 2 * pad) / spanX, h * (1 - 2 * pad) / spanY);
    this.offX = w / 2 - ((minX + maxX) / 2) * this.scale;
    this.offY = h / 2 + ((minY + maxY) / 2) * this.scale;
    this.fieldDeg = Math.hypot(w, h) / 2 / this.scale + 2;
    this.pos = {};
    for (const p of pts) this.pos[p.hip] = this.toXY(p);
    this.bg = this.o.bgStars ? BG.filter(s => separation(s[0], s[1], this.ra0, this.dec0) < this.fieldDeg).map(s => ({ ...this.toXY(projectLocal(s[0], s[1], this.ra0, this.dec0)), mag: s[2], bv: s[3] })) : [];
    this.k = Math.max(0.8, Math.min(1.4, Math.min(w, h) / 320));
  }
  toXY(p) { return { x: this.offX + p.x * this.scale, y: this.offY - p.y * this.scale }; }
  centre() { // average of figure stars in canvas px
    const ps = this.o.figures.flatMap(f => f.lines.flat()).map(h => this.pos[h]).filter(Boolean);
    return { x: ps.reduce((a, p) => a + p.x, 0) / ps.length, y: ps.reduce((a, p) => a + p.y, 0) / ps.length };
  }
  draw(progress = this.progress, t = 0) {
    const ctx = this.canvas.getContext('2d');
    const { w, h, k } = this;
    ctx.clearRect(0, 0, w, h);
    // faint real background stars
    for (const s of this.bg) {
      if (s.x < -4 || s.x > w + 4 || s.y < -4 || s.y > h + 4) continue;
      ctx.globalAlpha = this.o.dimBg ? Math.max(.12, .55 - s.mag * .08) : 1;
      drawStar(ctx, s.x, s.y, starRadius(s.mag, k * .7), starColor(s.bv), false);
    }
    ctx.globalAlpha = 1;
    // lines with draw-on progress
    const segs = [];
    for (const f of this.o.figures) for (const seg of f.lines) for (let i = 0; i + 1 < seg.length; i++) {
      const a = this.pos[seg[i]], b = this.pos[seg[i + 1]]; if (a && b) segs.push({ a, b, len: Math.hypot(b.x - a.x, b.y - a.y), f });
    }
    const total = segs.reduce((s, x) => s + x.len, 0);
    let budget = easeOut(progress) * total;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const s of segs) {
      if (budget <= 0) break;
      const frac = Math.min(1, budget / s.len); budget -= s.len;
      const col = s.f.highlight === false ? 'rgba(143,227,255,.35)' : this.o.lineColor;
      ctx.strokeStyle = col; ctx.lineWidth = (s.f.highlight === false ? 1.2 : 2) * k;
      ctx.shadowColor = col; ctx.shadowBlur = s.f.highlight === false ? 0 : 8 * k;
      ctx.beginPath(); ctx.moveTo(s.a.x, s.a.y); ctx.lineTo(s.a.x + (s.b.x - s.a.x) * frac, s.a.y + (s.b.y - s.a.y) * frac); ctx.stroke();
    }
    ctx.shadowBlur = 0;
    // figure stars (appear before lines)
    const hips = [...new Set([...this.o.figures.flatMap(f => f.lines.flat()), ...this.o.extra])];
    const appear = Math.min(1, progress * 2.2);
    for (const hip of hips) {
      const p = this.pos[hip], s = HIP[hip]; if (!p || !s) continue;
      const r = (starRadius(s[2], k * 1.25) + 1.2) * easeOut(appear);
      drawStar(ctx, p.x, p.y, r, '#ffffff', true);
    }
    // pointer hop
    if (this.o.hop && progress > .55) {
      const hp = Math.min(1, (progress - .55) / .45);
      const f = this.pos[this.o.hop.from], tt = this.pos[this.o.hop.to];
      const ex = tt.x + (tt.x - f.x) * this.o.hop.times, ey = tt.y + (tt.y - f.y) * this.o.hop.times;
      ctx.setLineDash([6 * k, 7 * k]); ctx.lineDashOffset = -t / 40;
      ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2.2 * k; ctx.shadowColor = '#ffd166'; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x + (ex - f.x) * easeOut(hp), f.y + (ey - f.y) * easeOut(hp)); ctx.stroke();
      ctx.setLineDash([]); ctx.shadowBlur = 0;
      const tg = this.pos[this.o.hop.target];
      if (tg && hp > .95) {
        const pulse = 1 + 0.25 * Math.sin(t / 300);
        ctx.strokeStyle = 'rgba(255,209,102,.9)'; ctx.lineWidth = 2 * k;
        ctx.beginPath(); ctx.arc(tg.x, tg.y, 14 * k * pulse, 0, Math.PI * 2); ctx.stroke();
      }
    }
    // labels
    if (progress > .8) {
      ctx.globalAlpha = Math.min(1, (progress - .8) / .2);
      for (const [hip, text] of Object.entries(this.o.labels)) {
        const p = this.pos[hip]; if (!p) continue;
        haloText(ctx, text, p.x, p.y - 15 * k, `700 ${Math.round(12.5 * k)}px ${LATIN_FONT}`, '#ffe7a8');
      }
      ctx.globalAlpha = 1;
    }
  }
  animate(ms = 1800) {
    this.stop();
    if (REDUCED) { this.progress = 1; return this.draw(1, 0); }
    const t0 = performance.now();
    const loop = (t) => {
      this.progress = Math.min(1, (t - t0) / ms);
      this.draw(this.progress, t);
      this.raf = requestAnimationFrame(loop);
      if (this.progress >= 1 && !this.o.hop) this.stop();
    };
    this.raf = requestAnimationFrame(loop);
  }
  stop() { cancelAnimationFrame(this.raf); this.raf = 0; }
  // nearest figure star to a canvas point
  pick(x, y, maxD = 26) {
    let best = null, bd = maxD;
    for (const [hip, p] of Object.entries(this.pos)) { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = +hip; } }
    return best;
  }
}

/* ---------- ambient background (random twinkle + shooting stars) ---------- */
export function ambientSky(canvas) {
  let stars = [], meteors = [], raf = 0, w = 0, h = 0, ctx;
  const build = () => {
    ({ ctx, w, h } = setupCanvas(canvas));
    const n = Math.round((w * h) / 3800);
    stars = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.3 + .3, p: Math.random() * 6.28, f: 0.4 + Math.random() * 1.2, c: starColor(Math.random() * 1.6 - .3) }));
  };
  const draw = (t) => {
    ctx.clearRect(0, 0, w, h);
    for (const s of stars) {
      ctx.globalAlpha = REDUCED ? .7 : 0.45 + 0.4 * Math.sin(t / 1000 * s.f + s.p);
      ctx.fillStyle = s.c; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (!REDUCED) {
      if (Math.random() < 0.004 && meteors.length < 2) meteors.push({ x: Math.random() * w, y: Math.random() * h * .4, vx: -(4 + Math.random() * 4), vy: 2 + Math.random() * 2, life: 1 });
      for (const m of meteors) {
        ctx.strokeStyle = `rgba(255,255,255,${m.life * .9})`; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(m.x - m.vx * 9, m.y - m.vy * 9); ctx.stroke();
        m.x += m.vx; m.y += m.vy; m.life -= 0.02;
      }
      meteors = meteors.filter(m => m.life > 0);
    }
  };
  const loop = (t) => { draw(t); raf = requestAnimationFrame(loop); };
  build();
  if (REDUCED) draw(0); else raf = requestAnimationFrame(loop);
  let ro; const onResize = () => { build(); draw(0); };
  window.addEventListener('resize', onResize);
  return { stop() { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); void ro; } };
}

/* ---------- confetti ---------- */
export function confetti(canvas, { count = 120 } = {}) {
  if (REDUCED) return;
  const { ctx, w, h } = setupCanvas(canvas);
  const colors = ['#ffd166', '#8fe3ff', '#5be49b', '#ff7a8a', '#ffffff'];
  const ps = Array.from({ length: count }, () => ({ x: w / 2 + (Math.random() - .5) * w * .3, y: h * .45, vx: (Math.random() - .5) * 14, vy: -Math.random() * 14 - 4, g: .35, r: 4 + Math.random() * 5, c: colors[Math.random() * colors.length | 0], a: Math.random() * 6.28, s: (Math.random() - .5) * .3 }));
  let t0 = performance.now();
  const loop = (t) => {
    ctx.clearRect(0, 0, w, h);
    for (const p of ps) {
      p.vy += p.g; p.x += p.vx; p.y += p.vy; p.vx *= .99; p.a += p.s;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); ctx.restore();
    }
    if (t - t0 < 2200) requestAnimationFrame(loop); else ctx.clearRect(0, 0, w, h);
  };
  requestAnimationFrame(loop);
}
