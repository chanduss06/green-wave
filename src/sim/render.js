import { DIR, HB, LW, L0, bez, dbez, at } from './geo.js';

const rr = (c, x, y, w, h, r, f) => { c.beginPath(); c.roundRect(x, y, w, h, r); c.fillStyle = f; c.fill(); };
const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
const ASPH = '#3b4048', KERB = '#8b8d90', WALK = '#d8d6ce';

// City blocks (buildings, parks) are painted once into an offscreen canvas and refreshed when the map changes.
function buildBg(s, W, Hh) {
  const d = devicePixelRatio || 1, c = document.createElement('canvas');
  c.width = W * d; c.height = Hh * d;
  const x = c.getContext('2d'); x.scale(d, d);
  x.fillStyle = '#d4d6cc'; x.fillRect(0, 0, W, Hh);
  const P = [];
  for (const r of s.roads.values()) for (let i = 0; i < r.pts.length; i += 2) P.push(r.pts[i]);
  const near = (px, py) => {
    for (const n of s.nodes) if (Math.abs(px - n.x) < HB + 64 && Math.abs(py - n.y) < HB + 64) return true;
    for (const p of P) if ((p[0] - px) ** 2 + (p[1] - py) ** 2 < 5300) return true;
    return false;
  };
  const pal = ['#8f9aa8', '#b8a999', '#a3b3a2', '#c7b5a5', '#9ba8c4', '#c3a9a9', '#aab4b8', '#d0c7b3'];
  for (let gx = 0; gx < W; gx += 60) for (let gy = 0; gy < Hh; gy += 60) {
    const cx = gx + 30, cy = gy + 30; if (near(cx, cy)) continue;
    const h = hash(gx, gy);
    if (h < 0.16) {
      rr(x, gx + 4, gy + 4, 52, 52, 12, '#85b374');
      for (let k = 0; k < 4; k++) {
        const a = hash(gx + k, gy * 2) * 6.28, rd = hash(gy, gx + k) * 14;
        x.fillStyle = '#4c8644'; x.beginPath(); x.arc(cx + Math.cos(a) * rd, cy + Math.sin(a) * rd, 7 + k, 0, 6.3); x.fill();
      }
      continue;
    }
    const w = 34 + hash(gy, gx) * 18, hh = 34 + hash(gx * 3, gy) * 18, bx = cx - w / 2, by = cy - hh / 2;
    rr(x, bx + 7, by + 9, w, hh, 5, '#00000038');
    rr(x, bx, by, w, hh, 5, pal[h * pal.length | 0]);
    rr(x, bx + 3, by + 3, w - 6, hh - 6, 3, '#ffffff26');
    rr(x, bx + w / 2 - 6, by + hh / 2 - 5, 12, 10, 2, '#00000030');
  }
  s.bg = c; s.bgDirty = false; s.bgT = performance.now();
}

function vehicle(c, v, x, y, a, t) {
  const l = v.spec.l, w = v.spec.w, hl = l / 2, hw = w / 2;
  c.save(); c.translate(x, y); c.rotate(a);
  if (v.amb) {
    const f = Math.floor(t * 6) % 2, g = c.createRadialGradient(0, 0, 2, 0, 0, 38);
    g.addColorStop(0, f ? '#ff2d2d77' : '#2d6bff77'); g.addColorStop(1, '#0000');
    c.fillStyle = g; c.fillRect(-40, -40, 80, 80);
  }
  c.fillStyle = '#0000003a'; c.beginPath(); c.roundRect(-hl + 2, -hw + 3, l, w, 4); c.fill();
  if (v.t === 'bike') {
    c.fillStyle = '#1b1b1b'; c.fillRect(-hl, -1, l, 2);
    c.fillStyle = v.c; c.beginPath(); c.arc(0, 0, 3.6, 0, 6.3); c.fill();
    c.fillStyle = '#f1c27d'; c.beginPath(); c.arc(1, 0, 2, 0, 6.3); c.fill();
    c.restore(); return;
  }
  c.fillStyle = v.amb ? '#f8f8f8' : v.t === 'bus' ? '#e8a317' : v.t === 'truck' ? '#5f6f86' : v.c;
  c.beginPath(); c.roundRect(-hl, -hw, l, w, v.t === 'car' ? 5 : 3); c.fill();
  c.fillStyle = '#ffffff3a'; c.beginPath(); c.roundRect(-hl + 2, -hw + 1, l - 4, hw - 1, 3); c.fill();
  if (v.t === 'truck') { c.fillStyle = '#d7dde5'; c.fillRect(-hl + 1, -hw + 1, l * .62, w - 2); }
  c.fillStyle = '#1d2b3d';
  if (v.t === 'bus') { for (let i = -hl + 5; i < hl - 9; i += 7) c.fillRect(i, -hw + 1.5, 5, w - 3); c.fillRect(hl - 8, -hw + 1.5, 5, w - 3); }
  else c.fillRect(hl - l * .36, -hw + 1.5, l * .2, w - 3);
  if (v.t === 'car') c.fillRect(-hl + 3, -hw + 1.8, l * .13, w - 3.6);
  c.fillStyle = '#fff4a8'; c.fillRect(hl - 1.5, -hw + 1, 1.5, 2.4); c.fillRect(hl - 1.5, hw - 3.4, 1.5, 2.4);
  c.fillStyle = '#e23'; c.fillRect(-hl, -hw + 1, 1.5, 2.4); c.fillRect(-hl, hw - 3.4, 1.5, 2.4);
  if (v.amb) {
    const f = Math.floor(t * 6) % 2;
    c.fillStyle = '#e11d2e'; c.fillRect(-hl + 1, -1.3, l - 2, 2.6); c.fillRect(-3, -5, 6, 10); c.fillRect(-5.5, -2.2, 11, 4.4);
    c.fillStyle = f ? '#ff2d2d' : '#2d6bff'; c.fillRect(1, -hw, 3.5, 4);
    c.fillStyle = f ? '#2d6bff' : '#ff2d2d'; c.fillRect(1, hw - 4, 3.5, 4);
  }
  c.restore();
}

function signal(c, s, n, a) {
  const d = DIR[a], lx = -d[1], ly = d[0], x = n.x + d[0] * (HB + 8) + lx * 52, y = n.y + d[1] * (HB + 8) + ly * 52, g = s.sig(n, a);
  const col = { r: '#ff4d4d', y: '#ffd23f', g: '#37e26a' };
  rr(c, x - 7, y - 19, 14, 38, 5, '#10141b');
  ['r', 'y', 'g'].forEach((k, i) => {
    const on = g.c === k; c.fillStyle = on ? col[k] : '#262c36';
    if (on) { c.shadowColor = col[k]; c.shadowBlur = 14; }
    c.beginPath(); c.arc(x, y - 11 + i * 11, 4, 0, 6.3); c.fill(); c.shadowBlur = 0;
  });
  const tx = x + lx * 24, ty = y + ly * 24;
  rr(c, tx - 13, ty - 9, 26, 18, 9, '#0b0f16dd');
  c.fillStyle = col[g.c]; c.font = '700 13px Rajdhani, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(g.num, tx, ty + 1);
}

export function draw(s, c, W, Hh) {
  const t = s.time;
  if (s.bgDirty && s.roads.size && performance.now() - s.bgT > 120) buildBg(s, W, Hh);
  if (s.bg) c.drawImage(s.bg, 0, 0, W, Hh); else { c.fillStyle = '#d4d6cc'; c.fillRect(0, 0, W, Hh); }
  if (!s.roads.size || !s.roads.values().next().value.pts) return;

  // road corridors (one stroke per two-way road)
  const corr = [];
  for (const r of s.roads.values()) { if (r.stub) continue; if (r.to && r.n0.id > r.to.id) continue; corr.push(r); }
  const pass = (col, w) => {
    c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'butt'; c.beginPath();
    for (const r of corr) { const k = r.C; c.moveTo(k[0][0], k[0][1]); c.bezierCurveTo(k[1][0], k[1][1], k[2][0], k[2][1], k[3][0], k[3][1]); }
    c.stroke();
  };
  pass(WALK, 88); pass(KERB, 76); pass(ASPH, 68); pass('#e3b81c', 6); pass(ASPH, 2);
  c.strokeStyle = '#ffffffa0'; c.lineWidth = 1.6; c.setLineDash([12, 14]); c.beginPath();
  for (const r of s.roads.values()) for (let i = 0; i <= 24; i++) { const p = at(r, r.len * i / 24, L0 + LW / 2); i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y); }
  c.stroke(); c.setLineDash([]);

  // junction boxes, zebra crossings, stop lines
  for (const n of s.nodes) {
    rr(c, n.x - HB - 9, n.y - HB - 9, 2 * (HB + 9), 2 * (HB + 9), 16, WALK);
    rr(c, n.x - HB - 4, n.y - HB - 4, 2 * (HB + 4), 2 * (HB + 4), 12, KERB);
    rr(c, n.x - HB, n.y - HB, 2 * HB, 2 * HB, 8, ASPH);
    for (let a = 0; a < 4; a++) {
      const d = DIR[a]; c.fillStyle = '#ffffffcc';
      for (let i = -28; i <= 28; i += 8) {
        const px = n.x + d[0] * (HB - 8) - d[1] * i, py = n.y + d[1] * (HB - 8) + d[0] * i;
        a % 2 ? c.fillRect(px - 5, py - 2.5, 10, 5) : c.fillRect(px - 2.5, py - 5, 5, 10);
      }
      const r = s.inRoad(n, a);
      if (r) { const p = at(r, r.len - 1, 3), q = at(r, r.len - 1, L0 + LW + 6); c.strokeStyle = '#fff'; c.lineWidth = 3; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(q.x, q.y); c.stroke(); }
    }
    c.fillStyle = '#ffffff22'; c.font = '700 22px Rajdhani, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(n.name, n.x, n.y);
  }

  // vehicles (ambulances last so they are never hidden)
  for (const pass2 of [0, 1]) {
    for (const r of s.roads.values()) for (const L of r.lanes) for (const v of L) {
      if (v.amb !== !!pass2) continue;
      const p = at(r, v.s - v.l / 2, L0 + v.lat * LW); vehicle(c, v, p.x, p.y, Math.atan2(p.ty, p.tx), t);
    }
    for (const n of s.nodes) for (const v of n.in) {
      if (v.amb !== !!pass2) continue;
      const p = bez(v.jb, v.u), d = dbez(v.jb, v.u); vehicle(c, v, p[0], p[1], Math.atan2(d[1], d[0]), t);
    }
  }

  // signals with timers, priority rings, selection
  for (const n of s.nodes) {
    for (let a = 0; a < 4; a++) signal(c, s, n, a);
    if (n.pre) { c.strokeStyle = Math.floor(t * 5) % 2 ? '#ff3b3b' : '#3b82ff'; c.lineWidth = 4; c.beginPath(); c.roundRect(n.x - HB - 13, n.y - HB - 13, 2 * (HB + 13), 2 * (HB + 13), 18); c.stroke(); }
    if (n === s.sel || n === s.linkFrom) { c.strokeStyle = '#38e1ff'; c.lineWidth = 2; c.setLineDash([8, 6]); c.beginPath(); c.roundRect(n.x - HB - 18, n.y - HB - 18, 2 * (HB + 18), 2 * (HB + 18), 20); c.stroke(); c.setLineDash([]); }
  }
  if (s.linkFrom && s.mouse) { c.strokeStyle = '#38e1ff'; c.lineWidth = 2; c.setLineDash([6, 6]); c.beginPath(); c.moveTo(s.linkFrom.x, s.linkFrom.y); c.lineTo(s.mouse[0], s.mouse[1]); c.stroke(); c.setLineDash([]); }
}
