"""Offline checks for the trading engine and the daily runner.

    python3 tests/test_bot.py
"""
from __future__ import annotations

import json
import pickle
import shutil
import sys
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from bot import engine as E  # noqa: E402
from bot import run as RUN  # noqa: E402
from tests import synthetic  # noqa: E402

RISK = {"risk_per_trade": 0.01, "max_positions": 5, "max_position_pct": 0.25, "stop_atr": 2.5,
        "trail_atr": 3.0, "max_drawdown": 0.15, "cooldown_days": 10, "lot": 100}
COSTS = {"slippage": 0.001, "commission": 0}


def one_stock_market(opens, highs, lows, closes, atr, entry_t, exit_t, max_hold=None):
    T = len(closes)
    entry = np.zeros((T, 1), bool)
    exit_ = np.zeros((T, 1), bool)
    for t in entry_t:
        entry[t, 0] = True
    for t in exit_t:
        exit_[t, 0] = True
    col = lambda a: np.array(a, float).reshape(T, 1)  # noqa: E731
    dates = [d.strftime("%Y-%m-%d") for d in pd.bdate_range("2026-01-05", periods=T)]
    return E.Market(dates=dates, syms=["1111.T"], O=col(opens), H=col(highs), L=col(lows), C=col(closes),
                    ATR=col([atr] * T), sig={"x": {"entry": entry, "exit": exit_, "score": np.ones((T, 1)),
                                                   "max_hold": max_hold, "label": "テスト"}})


def approx(a, b, tol=1e-6):
    assert abs(a - b) <= tol * max(1.0, abs(b)), (a, b)


def test_fill_size_and_exit():
    # flat 1000 yen stock, ATR 20: stop distance 50 -> risk 30,000 / 50 = 600 shares;
    # cap 25% of 3,000,000 / 1000 = 750; cash fine -> 600 shares
    p = [1000.0] * 10
    m = one_stock_market(p, [1005] * 10, [995] * 10, p, 20.0, entry_t=[2], exit_t=[6])
    a = E.new_account(3_000_000)
    for t in range(10):
        E.step(a, m, t, "x", RISK, COSTS, record=True)
        if t == 2:
            assert len(a["pending"]) == 1 and a["pending"][0]["shares"] == 600, a["pending"]
        if t == 3:
            pos = a["positions"]["1111.T"]
            approx(pos["entry_price"], 1000 * 1.001)
            approx(pos["stop"], 1000 * 1.001 - 2.5 * 20)
            assert pos["shares"] == 600
    # exit signal at t=6 close -> sold at t=7 open
    assert not a["positions"]
    tr = a["trades"][0]
    assert tr["exit_date"] == m.dates[7] and tr["reason"] == "テストの売りサイン", tr
    approx(tr["exit_price"], round(1000 * 0.999, 2))
    approx(a["cash"], 3_000_000 + 600 * (1000 * 0.999 - 1000 * 1.001))
    approx(a["equity"][-1][1], round(a["cash"]), 1e-9)


def test_stop_gap_and_touch():
    # bought at t=3 open (1000*1.001); stop = 1001 - 50 = 951
    o = [1000, 1000, 1000, 1000, 1000, 900, 1000, 1000]
    h = [1005] * 8
    l = [995, 995, 995, 995, 995, 890, 995, 995]
    c = [1000, 1000, 1000, 1000, 1000, 900, 1000, 1000]
    m = one_stock_market(o, h, l, c, 20.0, entry_t=[2], exit_t=[])
    a = E.new_account(3_000_000)
    for t in range(8):
        E.step(a, m, t, None if t > 2 else "x", RISK, COSTS)
    tr = a["trades"][0]
    assert tr["exit_date"] == m.dates[5], tr
    approx(tr["exit_price"], round(900 * 0.999, 2))  # gapped below the stop: filled at the open
    # touch: low reaches the stop, open above it
    l2 = [995, 995, 995, 995, 940, 995, 995, 995]
    m2 = one_stock_market([1000] * 8, h, l2, [1000] * 8, 20.0, entry_t=[2], exit_t=[])
    a2 = E.new_account(3_000_000)
    for t in range(8):
        E.step(a2, m2, t, None if t > 2 else "x", RISK, COSTS)
    tr2 = a2["trades"][0]
    assert tr2["exit_date"] == m2.dates[4]
    approx(tr2["exit_price"], round((1000 * 1.001 - 50) * 0.999, 2))
    assert tr2["reason"] == "損切りの逆指値"


def test_trailing_stop_and_time_exit():
    c = [1000, 1000, 1000, 1000, 1100, 1200, 1300, 1300, 1300, 1300, 1300, 1300]
    m = one_stock_market(c, [x + 5 for x in c], [x - 5 for x in c], c, 20.0, entry_t=[2], exit_t=[], max_hold=5)
    a = E.new_account(3_000_000)
    for t in range(6):
        E.step(a, m, t, "x" if t == 2 else None, RISK, COSTS)
    pos = a["positions"]["1111.T"]
    approx(pos["stop"], 1200 - 3.0 * 20)  # trailed up under the highest close
    for t in range(6, 12):
        E.step(a, m, t, None, RISK, COSTS)
    tr = a["trades"][0]
    assert tr["reason"].startswith("保有期限"), tr
    assert tr["exit_date"] == m.dates[9], tr  # bought t=3, held 5 days at t=8 close, sold t=9 open


def test_drawdown_brake():
    # buy at t=3, the stock collapses 40% so the account drops > 15%; no new buys for 10 days
    T = 30
    c = [1000.0] * 4 + [600.0] * (T - 4)
    m = one_stock_market(c, [x + 1 for x in c], [x - 1 for x in c], c, 2.0, entry_t=list(range(2, T)), exit_t=[])
    risk = dict(RISK, risk_per_trade=0.5, max_position_pct=1.0)  # oversized on purpose
    a = E.new_account(1_000_000)
    for t in range(T):
        E.step(a, m, t, "x", risk, COSTS, record=True)
    kinds = [e["type"] for e in a["events"]]
    assert "halt" in kinds and "resume" in kinds, kinds
    halt_t = m.dates.index(next(e["date"] for e in a["events"] if e["type"] == "halt"))
    resume_t = m.dates.index(next(e["date"] for e in a["events"] if e["type"] == "resume"))
    buys = [m.dates.index(e["date"]) for e in a["events"] if e["type"] == "buy"]
    assert resume_t - halt_t == 10
    assert not [b for b in buys if halt_t < b <= resume_t], (buys, halt_t, resume_t)


def check_state(out: Path, cfg: dict, expect_last: str):
    st = json.loads((out / "state.json").read_text())
    a = st["account"]
    assert a["last_date"] == expect_last, (a["last_date"], expect_last)
    assert a["cash"] >= -1, a["cash"]
    assert len(a["positions"]) <= cfg["risk"]["max_positions"]
    for p in a["positions"].values():
        assert p["shares"] > 0 and p["shares"] % 100 == 0
        assert p["stop"] < p["last_price"] * 1.5
    held = set(a["positions"])
    syms = [o["sym"] for o in a["pending"]]
    assert len(syms) == len(set(syms)), syms
    assert not [o for o in a["pending"] if o["side"] == "buy" and o["sym"] in held]
    assert not [o for o in a["pending"] if o["side"] == "sell" and o["sym"] not in held]
    value = sum(p["shares"] * p["last_price"] for p in a["positions"].values())
    assert abs(a["equity"][-1][1] - (a["cash"] + value)) <= 1
    unreal = sum((p["last_price"] - p["entry_price"]) * p["shares"] - p["entry_fee"] for p in a["positions"].values())
    realized = sum(x["pnl"] for x in a["trades"])
    assert abs(a["initial"] + realized + unreal - a["equity"][-1][1]) <= len(a["trades"]) + 2
    dates = [d for d, _ in a["equity"]]
    assert dates == sorted(set(dates)), "equity dates must be unique and ascending"
    dash = json.loads((out / "dashboard.json").read_text())
    assert len(dash["positions"]) == len(a["positions"])
    assert dash["account"]["equity"] == a["equity"][-1][1]
    return st


def test_daily_runs():
    cfg = json.loads((ROOT / "config.json").read_text())
    tmp = Path(tempfile.mkdtemp())
    pk = tmp / "p.pkl"
    data = synthetic.make()
    with open(pk, "wb") as f:
        pickle.dump(data, f)
    out = tmp / "out"
    days = [d.strftime("%Y-%m-%d") for d in data["7203.T"].index if d >= pd.Timestamp("2026-08-03")]
    # first run on a Saturday morning: starts from Friday's close
    assert RUN.main(["--prices", str(pk), "--out", str(out), "--now", "2026-08-01T09:00"]) == 0
    check_state(out, cfg, "2026-07-31")
    account = lambda: json.loads((out / "state.json").read_text())["account"]  # noqa: E731
    trades_seen = 0
    for i, d in enumerate(days):
        if i % 6 == 0:
            # during market hours today's bar is not final: the account must not move
            before = account()
            assert RUN.main(["--prices", str(pk), "--out", str(out), "--now", f"{d}T11:00"]) == 0
            assert account() == before, f"acted on an unfinished day {d}"
        assert RUN.main(["--prices", str(pk), "--out", str(out), "--now", f"{d}T17:30"]) == 0
        st = check_state(out, cfg, d)
        if i % 6 == 3:
            # running again the same evening changes nothing at all
            snap = (out / "state.json").read_text()
            assert RUN.main(["--prices", str(pk), "--out", str(out), "--now", f"{d}T18:30"]) == 0
            assert (out / "state.json").read_text() == snap
        trades_seen = len(st["account"]["trades"])
    # a weekday holiday (2026-11-03 is missing from the data): the run that evening is a no-op
    before = (out / "state.json").read_text()
    assert RUN.main(["--prices", str(pk), "--out", str(out), "--now", "2026-11-20T19:00"]) == 0
    assert (out / "state.json").read_text() == before
    st = json.loads((out / "state.json").read_text())
    eq = [d for d, _ in st["account"]["equity"]]
    assert "2026-11-03" not in eq and "2026-11-04" in eq
    print(f"  daily runs: {len(days)} days, {trades_seen} closed trades, "
          f"equity {st['account']['equity'][-1][1]:,}, strategies used {[h['id'] for h in st['strategy_history']]}")
    shutil.rmtree(tmp)


def test_clean_yahoo_frame():
    from bot import data as D
    idx = pd.DatetimeIndex(["2026-11-19", "2026-11-20", "2026-11-20"]).tz_localize("Asia/Tokyo")
    raw = pd.DataFrame({"Open": [100, 101, 102], "High": [99, 103, 104], "Low": [98, 100, 101], "Close": [100, 102, 103],
                        "Volume": [1, 2, 3], "Dividends": [0, 0, 0], "Stock Splits": [0, 5, 5]}, index=idx)
    df = D.clean(raw)
    assert list(df.index.strftime("%Y-%m-%d")) == ["2026-11-19", "2026-11-20"]  # tz dropped, duplicate kept last
    assert df.loc["2026-11-19", "High"] == 100  # repaired: high >= open/close
    assert df.loc["2026-11-20", "Split"] == 5.0
    now = pd.Timestamp("2026-11-20 15:00", tz="Asia/Tokyo").to_pydatetime()
    assert len(D.drop_unfinished(df, now)) == 1  # 15:00 on the 20th: that day's bar is not final


def test_split_while_holding():
    tmp = Path(tempfile.mkdtemp())
    data = synthetic.make()
    pk = tmp / "pre.pkl"
    with open(pk, "wb") as f:
        pickle.dump(data, f)
    out = tmp / "out"
    days = [d.strftime("%Y-%m-%d") for d in data["7203.T"].index if d >= pd.Timestamp("2026-08-03")]
    RUN.main(["--prices", str(pk), "--out", str(out), "--now", "2026-08-01T09:00"])
    held = None
    for i, d in enumerate(days[:-1]):
        RUN.main(["--prices", str(pk), "--out", str(out), "--now", f"{d}T17:30"])
        st = json.loads((out / "state.json").read_text())
        if st["account"]["positions"]:
            held, D0, X = next(iter(st["account"]["positions"])), d, days[i + 1]
            break
    assert held, "no position was opened in the test window"
    before = st["account"]["positions"][held]
    eq0 = st["account"]["equity"][-1][1]
    # the stock splits 1:5 on day X; Yahoo then shows all of its history on the new scale
    post = {k: v.copy() for k, v in data.items()}
    df = post[held]
    df[["Open", "High", "Low", "Close"]] = df[["Open", "High", "Low", "Close"]] / 5
    df["Volume"] = df["Volume"] * 5
    df["Split"] = 0.0
    df.loc[pd.Timestamp(X), "Split"] = 5.0
    pk2 = tmp / "post.pkl"
    with open(pk2, "wb") as f:
        pickle.dump(post, f)
    assert RUN.main(["--prices", str(pk2), "--out", str(out), "--now", f"{X}T17:30"]) == 0
    st = json.loads((out / "state.json").read_text())
    eq1 = st["account"]["equity"][-1][1]
    assert abs(eq1 / eq0 - 1) < 0.15, (eq0, eq1)  # no fake 80% crash
    assert any(e["type"] == "split" for e in st["account"]["events"])
    pos = st["account"]["positions"].get(held)
    if pos:
        assert pos["shares"] == before["shares"] * 5 and abs(pos["entry_price"] - before["entry_price"] / 5) < 1e-6
    snap = (out / "state.json").read_text()
    assert RUN.main(["--prices", str(pk2), "--out", str(out), "--now", f"{X}T19:00"]) == 0
    assert (out / "state.json").read_text() == snap, "split applied twice"
    print(f"  split: {held} held since before {X}; equity {eq0:,} -> {eq1:,}")
    shutil.rmtree(tmp)


def test_backtest_matches_live():
    """Live day-by-day processing must give the same result as one backtest over the same days."""
    data = synthetic.make()
    m = E.build_market({k: v for k, v in data.items() if k != "^N225"})
    sid = "bo_20_10"
    full = E.backtest(m, sid, RISK, COSTS, 3_000_000, start_t=2500)
    a = E.new_account(3_000_000)
    for t in range(2500, len(m.dates)):
        E.step(a, m, t, sid, RISK, COSTS, record=True)
    assert full["equity"] == a["equity"] and full["trades"] == a["trades"]


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
