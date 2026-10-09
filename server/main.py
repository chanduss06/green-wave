"""GreenWave API: stores layouts, the learned RL brain, run results and ambulance events in SQLite."""
import json
import os
import sqlite3
import time

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "greenwave.db")


def db():
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    return c


with db() as c:
    c.executescript(
        """
        CREATE TABLE IF NOT EXISTS layouts(id INTEGER PRIMARY KEY, name TEXT UNIQUE, data TEXT, updated REAL);
        CREATE TABLE IF NOT EXISTS runs(id INTEGER PRIMARY KEY, ts REAL, mode TEXT, vehicles INT,
            avg_stop REAL, amb_count INT, amb_stop REAL, junctions INT);
        CREATE TABLE IF NOT EXISTS brain(id INTEGER PRIMARY KEY CHECK(id=1), q TEXT, updated REAL);
        CREATE TABLE IF NOT EXISTS amb_events(id INTEGER PRIMARY KEY, ts REAL, mode TEXT, stop_s REAL, junctions INT);
        """
    )

app = FastAPI(title="GreenWave API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class Layout(BaseModel):
    name: str
    data: dict


class Run(BaseModel):
    mode: str
    vehicles: int
    avg_stop: float
    amb_count: int
    amb_stop: float
    junctions: int


class Brain(BaseModel):
    q: list


class Event(BaseModel):
    mode: str
    stop_s: float
    junctions: int


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/layouts")
def layouts():
    with db() as c:
        rows = c.execute("SELECT name, data FROM layouts ORDER BY updated DESC").fetchall()
    return [{"name": r["name"], "data": json.loads(r["data"])} for r in rows]


@app.post("/api/layouts")
def save_layout(body: Layout):
    with db() as c:
        c.execute(
            "INSERT INTO layouts(name, data, updated) VALUES(?,?,?) "
            "ON CONFLICT(name) DO UPDATE SET data=excluded.data, updated=excluded.updated",
            (body.name, json.dumps(body.data), time.time()),
        )
    return {"ok": True}


@app.get("/api/brain")
def get_brain():
    with db() as c:
        r = c.execute("SELECT q FROM brain WHERE id=1").fetchone()
    return {"q": json.loads(r["q"]) if r else None}


@app.put("/api/brain")
def put_brain(body: Brain):
    with db() as c:
        c.execute(
            "INSERT INTO brain(id, q, updated) VALUES(1,?,?) "
            "ON CONFLICT(id) DO UPDATE SET q=excluded.q, updated=excluded.updated",
            (json.dumps(body.q), time.time()),
        )
    return {"ok": True}


@app.post("/api/runs")
def add_run(body: Run):
    with db() as c:
        c.execute(
            "INSERT INTO runs(ts, mode, vehicles, avg_stop, amb_count, amb_stop, junctions) VALUES(?,?,?,?,?,?,?)",
            (time.time(), body.mode, body.vehicles, body.avg_stop, body.amb_count, body.amb_stop, body.junctions),
        )
    return {"ok": True}


@app.get("/api/runs")
def runs():
    with db() as c:
        rows = c.execute("SELECT * FROM runs ORDER BY id DESC LIMIT 20").fetchall()
    return [dict(r) for r in rows]


@app.post("/api/events")
def add_event(body: Event):
    with db() as c:
        c.execute(
            "INSERT INTO amb_events(ts, mode, stop_s, junctions) VALUES(?,?,?,?)",
            (time.time(), body.mode, body.stop_s, body.junctions),
        )
    return {"ok": True}


@app.get("/api/events")
def events():
    with db() as c:
        rows = c.execute("SELECT * FROM amb_events ORDER BY id DESC LIMIT 50").fetchall()
    return [dict(r) for r in rows]
