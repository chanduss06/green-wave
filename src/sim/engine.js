import { DIR, HB, STUB, LW, L0, bez, dbez, sample, at } from './geo.js';
import { draw } from './render.js';

const SPEC = {
  car:   { v: 70,  l: 26, w: 13 },
  bike:  { v: 88,  l: 14, w: 6 },
  bus:   { v: 52,  l: 42, w: 15 },
  truck: { v: 50,  l: 36, w: 15 },
  amb:   { v: 135, l: 30, w: 14 },
};
const COL = ['#d94343', '#3b7ddd', '#e0b02f', '#3fae49', '#8e5bd0', '#e67e22', '#e9edf0', '#334155'];
const MING = 6, MAXG = 25, FIXG = 15, YEL = 2, PRE = 14, GAP = 5, EPS = 0.08, GRID = 20;
const mk = () => ({ n: 0, w: 0, a: 0, aw: 0 });
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const armOf = (dx, dy) => Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0);
const bk = (x, t) => t.filter(y => x >= y).length;

export class Sim {
  constructor() {
    this.nodes = []; this.roads = new Map(); this.nid = 0; this.time = 0;
    this.mode = 'rl'; this.dens = 1; this.rush = false; this.speed = 1; this.tool = 'drag';
    this.sel = null; this.linkFrom = null; this.drag = null; this.mouse = null;
    this.logs = []; this.msg = ''; this.msgT = 0; this.stats = { fixed: mk(), adaptive: mk(), rl: mk() };
    this.Q = new Map(); this.dirty = true; this.bgDirty = true; this.bgT = 0; this.W = 900; this.H = 600;
    this.onAmb = null; this.acc = 0; this.lt = performance.now();
    try { for (const [k, v] of JSON.parse(localStorage.getItem('gw_q') || '[]')) this.Q.set(k, v); } catch (e) { /* offline */ }
  }

  // ---------- canvas wiring ----------
  attach(cv) {
    this.cv = cv; this.cx = cv.getContext('2d');
    this.ro = new ResizeObserver(() => this.fit()); this.ro.observe(cv.parentElement);
    const pt = e => { const b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
    cv.onpointerdown = e => this.down(pt(e), e);
    cv.onpointermove = e => this.move(pt(e));
    cv.onpointerup = () => { this.drag = null; this.dirty = true; };
    cv.oncontextmenu = e => { e.preventDefault(); const n = this.hit(pt(e)); if (n) this.delNode(n); };
    this.fit(); this.raf = requestAnimationFrame(this.loop);
  }
  stop() { cancelAnimationFrame(this.raf); this.ro && this.ro.disconnect(); }
  fit() {
    const r = this.cv.parentElement.getBoundingClientRect(), d = devicePixelRatio || 1;
    this.W = r.width; this.H = r.height; this.cv.width = r.width * d; this.cv.height = r.height * d;
    this.cx.setTransform(d, 0, 0, d, 0, 0); this.bgDirty = true;
    if (!this.nodes.length) this.preset(1, 3);
  }
  loop = t => {
    const d = Math.min(0.1, (t - this.lt) / 1000); this.lt = t; this.acc += d * this.speed;
    let k = 0; while (this.acc >= 1 / 30 && k < 150) { this.step(1 / 30); this.acc -= 1 / 30; k++; }
    if (k >= 150) this.acc = 0;
    draw(this, this.cx, this.W, this.H);
    this.raf = requestAnimationFrame(this.loop);
  };
  say(m) { this.msg = m; this.msgT = performance.now(); }
  log(m) { this.logs.unshift(m); this.logs.length = Math.min(this.logs.length, 6); }

  // ---------- input ----------
  hit(p) { return this.nodes.find(n => Math.abs(p[0] - n.x) < HB + 8 && Math.abs(p[1] - n.y) < HB + 8); }
  down(p, e) {
    this.mouse = p; const n = this.hit(p), t = this.tool;
    if (t === 'add' && !n) { const m = this.addNode(Math.round(p[0] / GRID) * GRID, Math.round(p[1] / GRID) * GRID); this.autoLink(m); this.sel = m; return; }
    if (!n) return;
    this.sel = n;
    if (t === 'del') { this.delNode(n); return; }
    if (t === 'link') { if (!this.linkFrom) { this.linkFrom = n; this.say('Now click the junction to connect'); } else { this.link(this.linkFrom, n); this.linkFrom = null; } return; }
    if (t === 'drag') { this.drag = { n, dx: p[0] - n.x, dy: p[1] - n.y }; this.cv.setPointerCapture(e.pointerId); }
  }
  move(p) {
    this.mouse = p; if (!this.drag) return;
    const n = this.drag.n;
    n.x = Math.min(this.W - HB, Math.max(HB, Math.round((p[0] - this.drag.dx) / GRID) * GRID));
    n.y = Math.min(this.H - HB, Math.max(HB, Math.round((p[1] - this.drag.dy) / GRID) * GRID));
    this.dirty = true;
  }

  // ---------- graph editing ----------
  addNode(x, y, quiet) {
    const n = { id: ++this.nid, name: 'J' + this.nid, x, y, arms: [null, null, null, null], phase: 0, pend: null, yel: 0, t: 0, pre: null, wp: false, cost: 0, last: 0, prev: null, in: [] };
    this.nodes.push(n); if (!quiet) this.sync(); return n;
  }
  sync() {
    const keep = new Set();
    for (const n of this.nodes) for (let a = 0; a < 4; a++) {
      const l = n.arms[a], ko = n.id + ':' + a; keep.add(ko);
      let o = this.roads.get(ko); if (!o) { o = { k: ko, lanes: [[], []] }; this.roads.set(ko, o); }
      Object.assign(o, { n0: n, to: l ? l.n : null, toArm: l ? l.arm : -1, out: a, stub: 0 });
      if (!l) {
        const ki = 'in:' + ko; keep.add(ki);
        let i = this.roads.get(ki); if (!i) { i = { k: ki, lanes: [[], []] }; this.roads.set(ki, i); }
        Object.assign(i, { n0: null, to: n, toArm: a, out: -1, stub: 1 });
      }
    }
    for (const k of [...this.roads.keys()]) if (!keep.has(k)) this.roads.delete(k);
    for (const n of this.nodes) n.in = n.in.filter(v => this.roads.get(v.D.k) === v.D);
    this.dirty = true;
  }
  link(a, b, quiet) {
    if (a === b) return;
    const d = Math.hypot(b.x - a.x, b.y - a.y), ao = armOf(b.x - a.x, b.y - a.y), bo = armOf(a.x - b.x, a.y - b.y);
    if (a.arms[ao] && a.arms[ao].n === b) { this.unlink(a, ao); if (!quiet) this.say('Road removed'); return; }
    if (d < 150 || d > 520) { if (!quiet) this.say('Keep junctions 150-520 px apart'); return; }
    if (a.arms[ao] || b.arms[bo]) { if (!quiet) this.say('That side already has a road'); return; }
    a.arms[ao] = { n: b, arm: bo }; b.arms[bo] = { n: a, arm: ao }; this.sync();
    if (!quiet) this.say(a.name + ' connected to ' + b.name);
  }
  unlink(a, ao) { const l = a.arms[ao]; if (!l) return; l.n.arms[l.arm] = null; a.arms[ao] = null; this.sync(); }
  autoLink(n) {
    const c = this.nodes.filter(m => m !== n).sort((p, q) => Math.hypot(p.x - n.x, p.y - n.y) - Math.hypot(q.x - n.x, q.y - n.y));
    for (const m of c) this.link(n, m, true);
  }
  delNode(n) { for (let a = 0; a < 4; a++) this.unlink(n, a); this.nodes = this.nodes.filter(x => x !== n); if (this.sel === n) this.sel = null; this.sync(); }
  preset(r, c) {
    this.nodes = []; this.roads.clear(); this.nid = 0; this.sel = null;
    const sx = Math.max(220, Math.min(320, (this.W - 320) / Math.max(1, c - 1))), sy = Math.max(220, Math.min(320, (this.H - 260) / Math.max(1, r - 1)));
    const ox = this.W / 2 - (c - 1) * sx / 2, oy = this.H / 2 - (r - 1) * sy / 2, g = [];
    for (let i = 0; i < r; i++) { g[i] = []; for (let j = 0; j < c; j++) g[i][j] = this.addNode(Math.round((ox + j * sx) / GRID) * GRID, Math.round((oy + i * sy) / GRID) * GRID, true); }
    this.sync();
    for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) { if (j + 1 < c) this.link(g[i][j], g[i][j + 1], true); if (i + 1 < r) this.link(g[i][j], g[i + 1][j], true); }
    this.sel = this.nodes[0] || null;
  }
  exportLayout() {
    return { nodes: this.nodes.map(n => ({ id: n.id, x: n.x, y: n.y })),
      links: this.nodes.flatMap(n => n.arms.map((l, a) => (l && n.id < l.n.id) ? [n.id, a, l.n.id, l.arm] : null).filter(Boolean)) };
  }
  importLayout(d) {
    this.nodes = []; this.roads.clear(); this.nid = 0; const m = new Map();
    for (const p of d.nodes) m.set(p.id, this.addNode(p.x, p.y, true));
    for (const [a, ai, b, bi] of d.links) { const A = m.get(a), B = m.get(b); if (A && B) { A.arms[ai] = { n: B, arm: bi }; B.arms[bi] = { n: A, arm: ai }; } }
    this.sync(); this.sel = this.nodes[0] || null;
  }
  exportBrain() { return [...this.Q]; }
  loadBrain(a) { for (const [k, v] of a) this.Q.set(k, v); }

  // ---------- geometry ----------
  geomAll() {
    for (const r of this.roads.values()) {
      let C;
      if (r.stub) {
        const d = DIR[r.toArm], n = r.to, p0 = [n.x + d[0] * (HB + STUB), n.y + d[1] * (HB + STUB)], p3 = [n.x + d[0] * HB, n.y + d[1] * HB];
        C = [p0, lerp(p0, p3, 1 / 3), lerp(p0, p3, 2 / 3), p3];
      } else if (r.to) {
        const a = r.n0, b = r.to, da = DIR[r.out], db = DIR[r.toArm];
        const p0 = [a.x + da[0] * HB, a.y + da[1] * HB], p3 = [b.x + db[0] * HB, b.y + db[1] * HB], k = Math.min(160, dist(p0, p3) / 2.2);
        C = [p0, [p0[0] + da[0] * k, p0[1] + da[1] * k], [p3[0] + db[0] * k, p3[1] + db[1] * k], p3];
      } else {
        const d = DIR[r.out], a = r.n0, p0 = [a.x + d[0] * HB, a.y + d[1] * HB], p3 = [a.x + d[0] * (HB + STUB), a.y + d[1] * (HB + STUB)];
        C = [p0, lerp(p0, p3, 1 / 3), lerp(p0, p3, 2 / 3), p3];
      }
      r.C = C; sample(r);
    }
    this.dirty = false; this.bgDirty = true;
  }
  inRoad(n, a) { const l = n.arms[a]; return l ? this.roads.get(l.n.id + ':' + l.arm) : this.roads.get('in:' + n.id + ':' + a); }
  green(r) { return !r.to || (r.to.pend === null && r.to.phase === (r.toArm & 1)); }

  // ---------- vehicles ----------
  pickOut(v, r) {
    if (v.amb && v.route.length) return v.route.shift();
    const x = Math.random(), a = r.toArm;
    return x < 0.58 ? (a + 2) & 3 : x < 0.76 ? (a + 1) & 3 : x < 0.94 ? (a + 3) & 3 : a; // straight / left / right / U-turn
  }
  setOut(v, r) { v.out = this.pickOut(v, r); v.turn = (v.out - r.toArm) & 3; }
  spawn(r, type, route) {
    const sp = SPEC[type];
    const gapOf = L => { const q = L[L.length - 1]; return q ? q.s - q.l : 999; };
    let lane = Math.random() < 0.5 ? 0 : 1;
    if (type === 'amb') lane = gapOf(r.lanes[0]) >= gapOf(r.lanes[1]) ? 0 : 1;
    else { if (gapOf(r.lanes[lane]) < 12) lane = 1 - lane; if (gapOf(r.lanes[lane]) < 12) return false; }
    const v = { t: type, spec: sp, l: sp.l, s: 0, sp: sp.v * 0.5, w: 0, rw: 0, lane, lat: lane, cool: 0, amb: type === 'amb', route: route || [], out: 0, turn: 2, c: COL[Math.random() * COL.length | 0], nj: 0 };
    this.setOut(v, r); r.lanes[lane].push(v); return true;
  }
  dispatch() {
    const ins = [...this.roads.values()].filter(r => r.stub);
    if (!ins.length) return this.say('Add a junction first');
    const r = ins[Math.random() * ins.length | 0], N = r.to, prev = new Map([[N, null]]), q = [N];
    let T = this.nodes[Math.random() * this.nodes.length | 0];
    while (q.length) { const c = q.shift(); for (let a = 0; a < 4; a++) { const l = c.arms[a]; if (l && !prev.has(l.n)) { prev.set(l.n, [c, a]); q.push(l.n); } } }
    if (!prev.has(T)) T = N;
    const route = []; let c = T, arrive = r.toArm;
    while (prev.get(c)) { const [p, a] = prev.get(c); if (c === T) arrive = p.arms[a].arm; route.unshift(a); c = p; }
    let ex = [0, 1, 2, 3].filter(a => !T.arms[a] && a !== arrive); if (!ex.length) ex = [0, 1, 2, 3].filter(a => a !== arrive);
    route.push(ex[Math.random() * ex.length | 0]);
    this.spawn(r, 'amb', route);
    this.say('Ambulance entering at ' + N.name + (T !== N ? ', heading to ' + T.name : ''));
    this.log('Ambulance enters at ' + N.name);
  }
  finish(v) {
    const s = this.stats[this.mode]; s.n++; s.w += v.w;
    if (v.amb) { s.a++; s.aw += v.w; this.log('Ambulance cleared: ' + v.w.toFixed(1) + 's stopped, ' + v.nj + ' junctions'); if (this.onAmb) this.onAmb({ mode: this.mode, stop_s: v.w, junctions: v.nj }); }
  }

  // ---------- signals and control ----------
  score(n) {
    const ph = [0, 0], ap = [];
    for (let a = 0; a < 4; a++) {
      const r = this.inRoad(n, a); if (!r) continue;
      let q = 0, wt = 0, arr = 0;
      for (const L of r.lanes) for (const v of L) { if (v.sp < 8) { q++; wt = Math.max(wt, v.rw); } else if (r.len - v.s < 150) arr++; }
      const o = this.roads.get(n.id + ':' + ((a + 2) & 3));
      const down = o && o.to ? Math.min(1, (o.lanes[0].length + o.lanes[1].length) / Math.max(1, o.len / 30 * 2)) : 0;
      const amb = n.pre && n.pre.arm === a ? 1 : 0;
      const sc = 2 * q + 2.5 * wt + 1.2 * arr - 8 * down + (wt >= 30 ? 100 : 0) + amb * 1000;
      ap.push({ a, q, wt, arr, down, amb, sc }); ph[a & 1] += Math.max(0, sc);
    }
    return { ph, ap };
  }
  sig(n, a) {
    const x = n._I && n._I.ap.find(p => p.a === a), wt = x ? x.wt : 0, fx = this.mode === 'fixed', mine = (a & 1) === n.phase;
    if (n.pend !== null) return mine ? { c: 'y', num: Math.ceil(n.yel) } : { c: 'r', num: Math.ceil(wt) };
    if (mine) return { c: 'g', num: Math.max(0, Math.ceil((fx ? FIXG : MAXG) - n.t)) };
    return { c: 'r', num: fx ? Math.ceil(FIXG - n.t + YEL) : Math.ceil(wt) };
  }
  preempt(r, v) {
    let t = (r.len - v.s) / SPEC.amb.v, cr = r, k = 0, from = r.n0 ? r.n0.name : 'sensor';
    const outs = [v.out, ...v.route];
    while (cr.to && t < PRE && k < 3) {
      const n = cr.to; if (!n.pre || t < n.pre.t) n.pre = { t, arm: cr.toArm, from };
      const nr = this.roads.get(n.id + ':' + outs[k]); if (!nr) break;
      t += nr.len / (SPEC.amb.v * 0.8) + 1; from = n.name; cr = nr; k++;
    }
  }
  rlDecide(n, I) {
    const c = n.phase, o = 1 - c, A = I.ap;
    const f = (p, k) => A.filter(x => (x.a & 1) === p).reduce((s, x) => s + x[k], 0);
    const mx = (p, k) => Math.max(0, ...A.filter(x => (x.a & 1) === p).map(x => x[k]));
    // state: own queues, longest wait, load on the road ahead (message from neighbour), arriving cars, green time
    const st = [bk(f(c, 'q'), [2, 5, 9]), bk(f(o, 'q'), [1, 4, 8]), bk(mx(o, 'wt'), [8, 16, 28]), bk(mx(c, 'down'), [.35, .7]), bk(f(c, 'arr'), [1, 4]), bk(n.t, [10, 18])], s = st.join('');
    if (!this.Q.has(s)) this.Q.set(s, (st[1] > st[0] || st[2] >= 3) ? [-.1, .25] : [.2, -.1]);
    if (n.prev) { const [ps, pa] = n.prev, q = this.Q.get(ps), r = -(n.cost / Math.max(1, this.time - n.last)) / 6 - (pa ? .4 : 0); q[pa] += .2 * (r + .9 * Math.max(...this.Q.get(s)) - q[pa]); }
    const q = this.Q.get(s); let a = Math.random() < EPS ? (Math.random() < .5 ? 1 : 0) : (q[1] > q[0] ? 1 : 0);
    if (n.t >= 32 || A.some(x => (x.a & 1) === o && x.wt > 45)) a = 1; // fairness guard
    n.prev = [s, a]; n.cost = 0; n.last = this.time; return a ? o : c;
  }
  control(n, dt) {
    const I = this.score(n); n._I = I; n.t += dt;
    n.cost += dt * (I.ap.reduce((s, x) => s + x.q, 0) + (I.ap.some(x => x.wt > 30) ? 5 : 0));
    if (n.pend !== null) { n.yel -= dt; if (n.yel <= 0) { n.phase = n.pend; n.pend = null; n.t = 0; } return; }
    let want = n.phase;
    if (n.pre) {
      want = n.pre.arm & 1; n.prev = null; n.cost = 0; n.last = this.time;
      if (!n.wp && n.pre.from !== 'inside') this.log(n.name + ': green wave for ambulance, ETA ' + n.pre.t.toFixed(0) + 's (from ' + n.pre.from + ')');
    } else if (this.mode === 'fixed') { if (n.t >= FIXG) want = 1 - n.phase; }
    else if (this.mode === 'adaptive') { if (n.t >= MING && (n.t >= MAXG || I.ph[1 - n.phase] > I.ph[n.phase] * 1.15 + 3)) want = 1 - n.phase; }
    else if (n.t >= MING && this.time - n.last >= 3) want = this.rlDecide(n, I);
    n.wp = !!n.pre;
    if (want !== n.phase) { n.pend = want; n.yel = n.pre ? 1.2 : YEL; }
  }

  // ---------- movement ----------
  step(dt) {
    this.time += dt; if (this.dirty) this.geomAll();
    for (const n of this.nodes) { n.pre = null; for (const v of n.in) if (v.amb) n.pre = { t: 0, arm: v.ia, from: 'inside' }; }
    for (const r of this.roads.values()) {
      if (r.stub) {
        let rate = 0.05 * this.dens; if (this.rush && (r.toArm & 1)) rate *= 3;
        if (Math.random() < rate * dt) { const x = Math.random(); this.spawn(r, x < .58 ? 'car' : x < .74 ? 'bike' : x < .87 ? 'truck' : 'bus'); }
      }
      for (const L of r.lanes) for (const v of L) if (v.amb) this.preempt(r, v);
    }
    for (const n of this.nodes) this.control(n, dt);
    for (const r of this.roads.values()) this.moveRoad(r, dt);
    for (const n of this.nodes) this.moveJ(n, dt);
  }
  gap(L, v) {
    let best = [999, null];
    for (const u of L) { if (u === v) continue; if (u.s >= v.s) best = [u.s - u.l - v.s, u]; else break; }
    return best;
  }
  tryLane(r, v) {
    const li = v.lane, o = 1 - li, O = r.lanes[o]; let lead = null, back = null;
    for (const u of O) { if (u.s >= v.s) lead = u; else { back = u; break; } }
    if (lead && lead.s - lead.l < v.s + 4) return;
    if (back && v.s - v.l - back.s < 6) return;
    const me = r.lanes[li]; me.splice(me.indexOf(v), 1);
    const k = O.findIndex(u => u.s < v.s); if (k < 0) O.push(v); else O.splice(k, 0, v);
    v.lane = o; v.cool = v.amb ? 0.8 : 2.5;
  }
  lanePlan(r, v) {
    const li = v.lane, [g, lead] = this.gap(r.lanes[li], v), [g2] = this.gap(r.lanes[1 - li], v), dist2 = r.len - v.s;
    let go = false;
    if (v.amb) go = g2 > g + 25 && g2 > 35; // ambulance weaves into the emptier lane
    else {
      const w = v.turn === 1 ? 1 : (v.turn === 3 || v.turn === 0) ? 0 : li; // left turns from kerb lane, right/U from inner lane
      go = (w !== li && dist2 < 280) || (w === li && g < 45 && lead && lead.spec.v < v.spec.v * .85 && g2 > 100 && dist2 > 120);
    }
    if (go) this.tryLane(r, v);
  }
  canEnter(v, r) {
    const n = r.to, D = this.roads.get(n.id + ':' + v.out); if (!D) return false;
    const xl = this.exitLane(v), L = D.lanes[xl], last = L[L.length - 1];
    if (last && last.s - last.l < 4) return false;
    if (!v.amb && (v.turn === 3 || v.turn === 0) && n.in.some(o => o.ia === ((r.toArm + 2) & 3) && (o.turn === 2 || o.turn === 1))) return false; // yield to oncoming
    return n.in.length < 8;
  }
  exitLane(v) { return v.turn === 1 ? 1 : (v.turn === 3 || v.turn === 0) ? 0 : v.lane; }
  enter(v, r) {
    const n = r.to, D = this.roads.get(n.id + ':' + v.out), t = v.turn, xl = this.exitLane(v);
    const A = at(r, r.len, L0 + v.lat * LW), B = at(D, 0, L0 + xl * LW), k = HB * (t === 2 ? .55 : t === 0 ? 1.25 : .95);
    v.jb = [[A.x, A.y], [A.x + A.tx * k, A.y + A.ty * k], [B.x - B.tx * k, B.y - B.ty * k], [B.x, B.y]];
    v.jl = (dist(v.jb[0], v.jb[1]) + dist(v.jb[1], v.jb[2]) + dist(v.jb[2], v.jb[3]) + dist(v.jb[0], v.jb[3])) / 2;
    v.u = 0; v.D = D; v.xl = xl; v.ia = r.toArm; v.node = n; if (v.amb) v.nj++; n.in.push(v);
  }
  moveRoad(r, dt) {
    const go = this.green(r);
    for (const L of r.lanes) for (const v of [...L]) {
      v.cool -= dt; v.lat += (v.lane - v.lat) * Math.min(1, dt * 5);
      if (v.cool <= 0 && r.to) this.lanePlan(r, v);
    }
    for (const L of r.lanes) {
      for (let i = 0; i < L.length; i++) {
        const v = L[i]; let lim = 1e9;
        if (i > 0) lim = L[i - 1].s - L[i - 1].l - GAP;
        else if (r.to && !(go && this.canEnter(v, r))) lim = r.len;
        v.sp = Math.min(v.sp + (v.amb ? 170 : 120) * dt, v.spec.v, Math.sqrt(2 * 150 * Math.max(0, lim - v.s)));
        v.s = Math.min(v.s + v.sp * dt, lim);
        if (v.sp < 4) { v.w += dt; v.rw += dt; }
      }
      if (r.to) { while (L.length && L[0].s >= r.len - 0.01 && go && this.canEnter(L[0], r)) this.enter(L.shift(), r); }
      else { while (L.length && L[0].s >= r.len + L[0].l) this.finish(L.shift()); }
    }
  }
  moveJ(n, dt) {
    for (let i = n.in.length - 1; i >= 0; i--) {
      const v = n.in[i], tgt = v.spec.v * (v.amb ? .75 : v.turn === 2 ? .8 : .55);
      v.sp += (tgt - v.sp) * Math.min(1, dt * 4);
      const ahead = n.in.find(o => o !== v && o.ia === v.ia && o.out === v.out && o.u > v.u && (o.u - v.u) * v.jl < v.l + 5);
      if (ahead) v.sp = 0; else v.u = Math.min(1, v.u + v.sp * dt / v.jl);
      if (v.u >= 1) {
        const D = v.D, L = D.lanes[v.xl], last = L[L.length - 1];
        if (!last || last.s - last.l >= 3) { n.in.splice(i, 1); v.s = 0; v.lane = v.xl; v.lat = v.xl; v.rw = 0; v.node = null; L.push(v); if (D.to) this.setOut(v, D); }
        else v.sp = 0;
      }
    }
  }

  // ---------- data for the React panel ----------
  snap() {
    const n = this.sel || this.nodes[0]; let sel = null;
    if (n) {
      const I = this.score(n);
      sel = { name: n.name, dir: n.phase ? 'East-West' : 'North-South', t: n.t | 0, pre: !!n.pre,
        rows: I.ap.map(x => ({ side: 'NESW'[x.a], q: x.q, wt: x.wt | 0, arr: x.arr, down: Math.round(x.down * 100), sc: x.amb ? 'AMB' : Math.round(x.sc), green: (x.a & 1) === n.phase })),
        links: n.arms.map((l, a) => { if (!l) return null; const o = this.roads.get(n.id + ':' + a); return { to: l.n.name, load: Math.min(100, Math.round((o.lanes[0].length + o.lanes[1].length) / Math.max(1, o.len / 30 * 2) * 100)) }; }).filter(Boolean) };
    }
    let veh = 0, stop = 0;
    for (const r of this.roads.values()) for (const L of r.lanes) for (const v of L) { veh++; if (v.sp < 4) stop++; }
    return { sel, stats: JSON.parse(JSON.stringify(this.stats)), veh, stop, q: this.Q.size, logs: [...this.logs], nodes: this.nodes.length,
      msg: performance.now() - this.msgT < 2600 ? this.msg : '' };
  }
}
export { bez, dbez };
