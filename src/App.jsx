import { useEffect, useRef, useState } from 'react';
import { Sim } from './sim/engine.js';
import { api } from './api.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, Number(v) || a));

export default function App() {
  const cv = useRef(null), sim = useRef(null);
  const [s, setS] = useState(null);
  const [mode, setMode] = useState('rl');
  const [tool, setTool] = useState('drag');
  const [speed, setSpeed] = useState(1);
  const [dens, setDens] = useState(1);
  const [rush, setRush] = useState(false);
  const [lay, setLay] = useState('1x3');
  const [rc, setRc] = useState([2, 4]);
  const [db, setDb] = useState(false);
  const [saved, setSaved] = useState([]);
  const [runs, setRuns] = useState([]);

  useEffect(() => {
    const S = new Sim(); sim.current = S; S.attach(cv.current);
    S.onAmb = e => api.addEvent(e).catch(() => {});
    const refresh = () => { api.layouts().then(setSaved).catch(() => {}); api.runs().then(setRuns).catch(() => {}); };
    api.health().then(() => { setDb(true); api.getBrain().then(b => b.q && S.loadBrain(b.q)).catch(() => {}); refresh(); }).catch(() => setDb(false));
    const kd = e => {
      if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.key === 'a' || e.key === 'A') S.dispatch();
    };
    addEventListener('keydown', kd);
    const i1 = setInterval(() => setS(S.snap()), 250);
    const i2 = setInterval(() => {
      try { localStorage.setItem('gw_q', JSON.stringify(S.exportBrain())); } catch (e) { /* ignore */ }
      api.putBrain(S.exportBrain()).catch(() => {});
    }, 20000);
    const i3 = setInterval(() => {
      const st = S.stats[S.mode];
      if (st.n > 0) api.addRun({ mode: S.mode, vehicles: st.n, avg_stop: st.w / st.n, amb_count: st.a, amb_stop: st.a ? st.aw / st.a : 0, junctions: S.nodes.length }).then(refresh).catch(() => {});
    }, 30000);
    return () => { removeEventListener('keydown', kd); clearInterval(i1); clearInterval(i2); clearInterval(i3); S.stop(); };
  }, []);

  const pickMode = m => { setMode(m); sim.current.mode = m; };
  const pickTool = t => { const nt = tool === t ? '' : t; setTool(nt); const S = sim.current; S.tool = nt; S.linkFrom = null; S.drag = null; };
  const pickLayout = v => {
    setLay(v);
    if (v !== 'custom') { const [r, c] = v.split('x').map(Number); sim.current.preset(r, c); }
  };
  const build = () => sim.current.preset(clamp(rc[0], 1, 4), clamp(rc[1], 1, 5));
  const save = () => {
    const name = window.prompt('Name this layout');
    if (!name) return;
    api.saveLayout(name, sim.current.exportLayout()).then(() => api.layouts().then(setSaved)).catch(() => sim.current.say('Start the backend to save layouts'));
  };
  const load = name => { const f = saved.find(x => x.name === name); if (f) sim.current.importLayout(f.data); };
  const hint = { drag: 'Drag junctions to move them. Roads bend to follow.', link: 'Click two junctions to add or remove a road.', add: 'Click empty ground to place a junction. It connects to nearby ones.', del: 'Click a junction to remove it.', '': 'No tool selected. Click a junction to inspect it.' }[tool];

  return (
    <div className="app">
      <header className="bar">
        <div className="brand"><b>GreenWave</b><small>React · Vite · FastAPI · SQLite</small></div>
        <div className="seg" role="group" aria-label="Controller">
          {[['fixed', 'Fixed'], ['adaptive', 'Adaptive'], ['rl', 'Graph RL']].map(([k, n]) => <button key={k} className={mode === k ? 'on' : ''} onClick={() => pickMode(k)}>{n}</button>)}
        </div>
        <div className="seg" role="group" aria-label="Tool">
          {[['drag', 'Drag'], ['link', 'Link'], ['add', 'Add'], ['del', 'Remove']].map(([k, n]) => <button key={k} className={tool === k ? 'on' : ''} onClick={() => pickTool(k)}>{n}</button>)}
        </div>
        <label className="fld">Traffic<input type="range" min="0.3" max="2.5" step="0.1" value={dens} onChange={e => { setDens(+e.target.value); sim.current.dens = +e.target.value; }} /></label>
        <label className="fld"><input type="checkbox" checked={rush} onChange={e => { setRush(e.target.checked); sim.current.rush = e.target.checked; }} />Rush hour</label>
        <select value={speed} aria-label="Speed" onChange={e => { setSpeed(+e.target.value); sim.current.speed = +e.target.value; }}>
          <option value="1">1x</option><option value="3">3x</option><option value="10">10x</option><option value="40">40x train</option>
        </select>
        <select value={lay} aria-label="Layout" onChange={e => pickLayout(e.target.value)}>
          <option value="1x1">Single</option><option value="1x3">Row of 3</option><option value="2x2">Grid 2x2</option><option value="2x3">Grid 2x3</option><option value="custom">Custom grid</option>
        </select>
        {lay === 'custom' && <span className="fld">
          <input type="number" min="1" max="4" value={rc[0]} onChange={e => setRc([e.target.value, rc[1]])} aria-label="Rows" />x
          <input type="number" min="1" max="5" value={rc[1]} onChange={e => setRc([rc[0], e.target.value])} aria-label="Columns" />
          <button onClick={build}>Build</button></span>}
        <button onClick={save}>Save layout</button>
        {saved.length > 0 && <select value="" aria-label="Load layout" onChange={e => load(e.target.value)}><option value="">Load layout</option>{saved.map(x => <option key={x.name} value={x.name}>{x.name}</option>)}</select>}
        <span className={'db ' + (db ? 'ok' : '')}>{db ? 'Database connected' : 'Database offline'}</span>
        <span className="keyhint"><kbd>A</kbd> ambulance</span>
      </header>
      <main className="main">
        <div className="stage">
          <canvas ref={cv} />
          <div className="tip">{hint}</div>
          {s && s.msg && <div className="toast">{s.msg}</div>}
        </div>
        <aside className="side">
          {s && s.sel && <section>
            <h3>{s.sel.name}: {s.sel.dir} green {s.sel.t}s {s.sel.pre && <b className="sos">Ambulance priority</b>}</h3>
            <table><thead><tr><th>Side</th><th>Queue</th><th>Wait</th><th>Coming</th><th>Ahead</th><th>Score</th></tr></thead>
              <tbody>{s.sel.rows.map(r => <tr key={r.side} className={r.sc === 'AMB' ? 'am' : r.green ? 'go' : ''}><td>{r.side}</td><td>{r.q}</td><td>{r.wt}s</td><td>{r.arr}</td><td>{r.down}%</td><td>{r.sc}</td></tr>)}</tbody></table>
            <p className="dim">Score adds queue, longest wait, cars arriving soon, a starvation bonus and ambulance priority, and subtracts how full the road ahead is.</p>
            {s.sel.links.map(l => <p key={l.to}>Road to {l.to}: {l.load}% full</p>)}
          </section>}
          {s && <section>
            <h3>Results by controller</h3>
            <table><thead><tr><th>Mode</th><th>Cars</th><th>Avg stop</th><th>Amb stop</th></tr></thead>
              <tbody>{['fixed', 'adaptive', 'rl'].map(m => { const t = s.stats[m]; return <tr key={m} className={m === mode ? 'go' : ''}><td>{m === 'rl' ? 'Graph RL' : m}</td><td>{t.n}</td><td>{t.n ? (t.w / t.n).toFixed(1) + 's' : '-'}</td><td>{t.a ? (t.aw / t.a).toFixed(1) + 's' : '-'}</td></tr>; })}</tbody></table>
            <p>On map {s.veh}, stopped {s.stop}. RL states learned: {s.q}</p>
          </section>}
          {s && <section>
            <h3>Junction messages</h3>
            {s.logs.length ? s.logs.map((l, i) => <p key={i}>{l}</p>) : <p className="dim">Press A to send an ambulance and watch junctions pass it along.</p>}
          </section>}
          {runs.length > 0 && <section>
            <h3>Saved runs (database)</h3>
            <table><thead><tr><th>Mode</th><th>Cars</th><th>Avg stop</th><th>Amb</th></tr></thead>
              <tbody>{runs.slice(0, 6).map(r => <tr key={r.id}><td>{r.mode}</td><td>{r.vehicles}</td><td>{r.avg_stop.toFixed(1)}s</td><td>{r.amb_count ? r.amb_stop.toFixed(1) + 's' : '-'}</td></tr>)}</tbody></table>
          </section>}
        </aside>
      </main>
    </div>
  );
}
