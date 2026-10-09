// Shared geometry: compass arms, cubic Bezier roads, lane offsets.
export const DIR = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // arm 0=N 1=E 2=S 3=W
export const HB = 44;     // half size of a junction box
export const STUB = 110;  // length of roads that leave the map
export const LW = 14;     // lane width
export const L0 = 12;     // offset of lane 0 centre from the road centre line

export const bez = (c, t) => {
  const u = 1 - t, a = u * u * u, b = 3 * u * u * t, d = 3 * u * t * t, e = t * t * t;
  return [a * c[0][0] + b * c[1][0] + d * c[2][0] + e * c[3][0], a * c[0][1] + b * c[1][1] + d * c[2][1] + e * c[3][1]];
};
export const dbez = (c, t) => {
  const u = 1 - t;
  return [3 * u * u * (c[1][0] - c[0][0]) + 6 * u * t * (c[2][0] - c[1][0]) + 3 * t * t * (c[3][0] - c[2][0]),
          3 * u * u * (c[1][1] - c[0][1]) + 6 * u * t * (c[2][1] - c[1][1]) + 3 * t * t * (c[3][1] - c[2][1])];
};

// Turn a road's control points into a polyline with tangents and cumulative length.
export function sample(r) {
  const P = []; let cum = 0, px = 0, py = 0;
  for (let i = 0; i <= 24; i++) {
    const t = i / 24, p = bez(r.C, t), d = dbez(r.C, t), m = Math.hypot(d[0], d[1]) || 1;
    if (i) cum += Math.hypot(p[0] - px, p[1] - py);
    px = p[0]; py = p[1];
    P.push([p[0], p[1], d[0] / m, d[1] / m, cum]);
  }
  r.pts = P; r.len = cum;
}

// Point on a road at distance s, shifted `off` px to the left of travel direction.
export function at(r, s, off = 0) {
  const P = r.pts, n = P.length - 1, sc = Math.max(0, Math.min(r.len, s));
  let i = 0;
  while (i < n - 1 && P[i + 1][4] < sc) i++;
  const a = P[i], b = P[i + 1], f = (sc - a[4]) / ((b[4] - a[4]) || 1);
  let tx = a[2] + (b[2] - a[2]) * f, ty = a[3] + (b[3] - a[3]) * f;
  const m = Math.hypot(tx, ty) || 1; tx /= m; ty /= m;
  const ex = s - sc;
  return { x: a[0] + (b[0] - a[0]) * f + ty * off + tx * ex, y: a[1] + (b[1] - a[1]) * f - tx * off + ty * ex, tx, ty };
}
