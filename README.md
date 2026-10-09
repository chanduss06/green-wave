# GreenWave: cooperative traffic signals with ambulance priority

A city-map traffic simulator where every junction is an agent. Junctions share what they see
(queues, waiting time, load on the road ahead, ambulance arrival time) and a shared
reinforcement-learning policy decides when to switch.

## Run it

You need Node 18+ and Python 3.9+.

Terminal 1 (database + API):

    cd server
    pip install -r requirements.txt
    uvicorn main:app --port 8000 --reload

Terminal 2 (frontend):

    npm install
    npm run dev

Open http://localhost:5173. The app also runs without the backend (header shows "Database offline"):
layouts and learned policy then live only in the browser.

## Controls

- **A**: send an ambulance. It always gets priority; junctions ahead turn green before it arrives.
- **Fixed / Adaptive / Graph RL**: switch the controller for every junction and compare results in the side panel.
- **Drag / Link / Add / Remove**: edit the city. Click the active tool again to turn it off. Right-click a junction to remove it.
- **Layout**: presets or a custom rows x columns grid. Save layouts to the database and load them later.
- **40x train**: runs the simulation fast so the RL policy learns quickly.

## How it works

| Layer | Tech | What it does |
|---|---|---|
| UI | React 18 + Vite | toolbar, side panel, keyboard handling |
| Simulation | JavaScript, HTML canvas | curved roads, 2 lanes per direction, lane changes, left/right/U-turns through the junction, signals with timers |
| Control | Fixed timer, priority-based adaptive, tabular Q-learning with shared policy across junctions | RL state: own queues, longest wait, load on the road ahead (neighbour message), cars arriving soon, green time |
| Emergency | Route lookahead | each ambulance reports its ETA to the next 3 junctions, which switch early. Ambulance changes lane to pass queues |
| Backend | FastAPI + SQLite | tables: layouts, runs, brain (Q-table), amb_events |

Priority score per approach: 2 x queue + 2.5 x longest wait + 1.2 x cars arriving soon + starvation bonus (wait over 30s)
+ ambulance bonus, minus 8 x load on the road ahead. Fairness guard forces a switch if a side waits over 45s.

## Folder

    src/sim/engine.js   simulation, signals, RL, ambulance preemption
    src/sim/render.js   city drawing, vehicles, signal heads and timers
    src/sim/geo.js      Bezier road geometry and lane offsets
    src/App.jsx         React UI
    server/main.py      FastAPI + SQLite API
