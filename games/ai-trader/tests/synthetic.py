"""Synthetic price data for offline tests (never used for the real demo)."""
from __future__ import annotations

import json
import pickle
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent


def make(start="2015-01-05", end="2026-11-20", seed=7, holidays=("2026-11-03",)):
    cfg = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
    syms = [u["code"] + ".T" for u in cfg["universe"]]
    days = pd.bdate_range(start, end)
    days = days[~((days.month == 1) & (days.day <= 3))]
    days = days[~days.isin(pd.to_datetime(list(holidays)))]
    rng = np.random.default_rng(seed)
    n = len(days)
    # market factor with slowly switching regimes, so trends exist to be found
    regime = np.cumsum(rng.normal(0, 1, n)) / 40
    mkt_drift = 0.0004 * np.sin(np.arange(n) / 180) + 0.0002 * np.tanh(regime)
    mkt = mkt_drift + rng.normal(0, 0.011, n)
    out = {}
    for i, s in enumerate(syms):
        beta = rng.uniform(0.6, 1.4)
        vol = rng.uniform(0.010, 0.022)
        level = rng.choice([300, 800, 1500, 2500, 4000, 6000, 9000])
        idio = rng.normal(0, vol, n) + 0.0003 * np.sin(np.arange(n) / rng.uniform(60, 250) + i)
        r = beta * mkt + idio
        close = level * np.exp(np.cumsum(r))
        gap = rng.normal(0, vol * 0.5, n)
        open_ = np.r_[close[0], close[:-1]] * np.exp(gap)
        hi = np.maximum(open_, close) * np.exp(np.abs(rng.normal(0, vol * 0.5, n)))
        lo = np.minimum(open_, close) * np.exp(-np.abs(rng.normal(0, vol * 0.5, n)))
        df = pd.DataFrame({"Open": open_, "High": hi, "Low": lo, "Close": close,
                           "Volume": rng.integers(1e5, 1e7, n).astype(float)}, index=days)
        out[s] = df
    nk = 30000 * np.exp(np.cumsum(mkt))
    out["^N225"] = pd.DataFrame({"Open": nk, "High": nk, "Low": nk, "Close": nk, "Volume": 0.0}, index=days)
    return out


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "/tmp/synth.pkl"
    with open(path, "wb") as f:
        pickle.dump(make(), f)
    print("wrote", path)
