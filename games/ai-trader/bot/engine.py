"""Day-by-day trading engine with risk management.

The same `step()` drives both the historical backtests and the live demo
account, so the demo trades by exactly the rules that were tested.

Order of events for one trading day t:
  1. Orders decided at yesterday's close are filled at today's open
     (sells first, so their cash can fund the buys).
  2. Stop orders: if today's low reaches a position's stop, it is sold
     at the stop price (or at the open, if the price gapped below it).
  3. Positions are valued at today's close; the drawdown brake is checked.
  4. Trailing stops are raised, and exit signals become sell orders
     for tomorrow's open.
  5. Entry signals become buy orders for tomorrow's open, sized by the
     risk rules.
"""
from __future__ import annotations

import bisect
import math
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from . import strategies as S


@dataclass
class Market:
    dates: list            # ISO date strings, ascending
    syms: list
    O: np.ndarray          # [T, S] open
    H: np.ndarray
    L: np.ndarray
    C: np.ndarray
    ATR: np.ndarray
    sig: dict              # strategy id -> {"entry", "exit", "score", "max_hold", "label"}
    sidx: dict = field(default_factory=dict)

    def __post_init__(self):
        self.sidx = {s: i for i, s in enumerate(self.syms)}

    def t_of(self, date: str) -> int:
        """Index of the first trading day on or after `date`."""
        return bisect.bisect_left(self.dates, date)


def build_market(data: dict[str, pd.DataFrame], strategy_defs=None) -> Market:
    panel = S.Panel(data)
    defs = strategy_defs or S.STRATEGIES
    sig = {}
    for sd in defs:
        e, x, sc = S.signals(panel, sd)
        sig[sd["id"]] = {
            "entry": e.to_numpy(dtype=bool),
            "exit": x.to_numpy(dtype=bool),
            "score": sc.to_numpy(dtype=float),
            "max_hold": sd["params"].get("max_hold"),
            "label": sd["label"],
        }
    return Market(
        dates=[d.strftime("%Y-%m-%d") for d in panel.index],
        syms=panel.syms,
        O=panel.O.to_numpy(float), H=panel.H.to_numpy(float),
        L=panel.L.to_numpy(float), C=panel.C.to_numpy(float),
        ATR=panel.atr(14).to_numpy(float),
        sig=sig,
    )


def new_account(capital: float) -> dict:
    return {
        "initial": float(capital),
        "cash": float(capital),
        "positions": {},
        "pending": [],
        "trades": [],
        "equity": [],
        "peak": float(capital),
        "cooldown": 0,
        "events": [],
        "last_date": None,
    }


def _ok(x) -> bool:
    return x is not None and not (isinstance(x, float) and math.isnan(x)) and math.isfinite(x)


def _event(acct, record, date, kind, sym, text, **extra):
    if record:
        acct["events"].append({"date": date, "type": kind, "sym": sym, "text": text, **extra})


def _close(acct, pos, price, date, reason, fee, record):
    shares = pos["shares"]
    acct["cash"] += shares * price - fee
    pnl = (price - pos["entry_price"]) * shares - pos.get("entry_fee", 0.0) - fee
    acct["trades"].append({
        "sym": pos["sym"], "shares": shares, "strategy": pos["strategy"],
        "entry_date": pos["entry_date"], "entry_price": round(pos["entry_price"], 2),
        "exit_date": date, "exit_price": round(price, 2),
        "pnl": round(pnl), "pnl_pct": round(price / pos["entry_price"] - 1.0, 5),
        "reason": reason,
    })
    del acct["positions"][pos["sym"]]
    _event(acct, record, date, "sell", pos["sym"], reason, shares=shares, price=round(price, 2), pnl=round(pnl))


def step(acct: dict, m: Market, t: int, entry_sid: str | None, risk: dict, costs: dict, record: bool = False):
    """Advance the account by trading day t (see module docstring)."""
    d = m.dates[t]
    slip, fee = costs["slippage"], costs["commission"]
    lot = risk["lot"]
    O, H, L, C, A = m.O[t], m.H[t], m.L[t], m.C[t], m.ATR[t]

    # 1. fill yesterday's orders at today's open — sells first
    keep = []
    for o in sorted(acct["pending"], key=lambda o: 0 if o["side"] == "sell" else 1):
        s = m.sidx.get(o["sym"])
        op = O[s] if s is not None else float("nan")
        if not _ok(op):
            if o["side"] == "sell":
                if o["sym"] in acct["positions"]:
                    keep.append(o)  # no trade today: try again tomorrow
            else:
                _event(acct, record, d, "skip", o["sym"], "取引がなかったため買い注文を取り消し")
            continue
        if o["side"] == "sell":
            pos = acct["positions"].get(o["sym"])
            if pos:
                _close(acct, pos, op * (1 - slip), d, o["reason"], fee, record)
            continue
        if o["sym"] in acct["positions"]:
            continue
        px = op * (1 + slip)
        affordable = int(max(0.0, acct["cash"] - fee) // (px * lot)) * lot
        shares = min(o["shares"], affordable)
        if shares < lot:
            _event(acct, record, d, "skip", o["sym"], "寄付きの値上がりで資金が足りず見送り")
            continue
        acct["cash"] -= shares * px + fee
        acct["positions"][o["sym"]] = {
            "sym": o["sym"], "shares": shares, "entry_price": px, "entry_date": d,
            "entry_fee": fee, "stop": px - risk["stop_atr"] * o["atr"],
            "high_close": px, "last_price": px, "strategy": o["strategy"],
        }
        _event(acct, record, d, "buy", o["sym"], o.get("reason", "買い"), shares=shares, price=round(px, 2))
    acct["pending"] = keep

    # 2. stop orders, checked against today's range
    for sym, pos in list(acct["positions"].items()):
        s = m.sidx.get(sym)
        if s is None or not _ok(L[s]):
            continue
        if L[s] <= pos["stop"]:
            raw = O[s] if _ok(O[s]) and O[s] <= pos["stop"] else pos["stop"]
            reason = "利益確保の逆指値" if pos["stop"] > pos["entry_price"] else "損切りの逆指値"
            _close(acct, pos, raw * (1 - slip), d, reason, fee, record)
            acct["pending"] = [o for o in acct["pending"] if o["sym"] != sym]

    # 3. value at the close, drawdown brake
    value = 0.0
    for sym, pos in acct["positions"].items():
        s = m.sidx.get(sym)
        if s is not None and _ok(C[s]):
            pos["last_price"] = float(C[s])
        value += pos["shares"] * pos["last_price"]
    equity = acct["cash"] + value
    acct["equity"].append([d, round(equity)])
    if acct["cooldown"] > 0:
        acct["cooldown"] -= 1
        if acct["cooldown"] == 0:
            acct["peak"] = equity  # start measuring again from here
            _event(acct, record, d, "resume", None, "休止期間が終わり、新規の買いを再開")
    acct["peak"] = max(acct["peak"], equity)
    if acct["cooldown"] == 0 and equity <= acct["peak"] * (1 - risk["max_drawdown"]):
        acct["cooldown"] = risk["cooldown_days"]
        _event(acct, record, d, "halt", None,
               f"口座が最高値から{risk['max_drawdown']:.0%}以上減ったため、{risk['cooldown_days']}営業日は新規の買いを停止")

    # 4. trailing stops and exit signals
    selling = {o["sym"] for o in acct["pending"] if o["side"] == "sell"}
    for sym, pos in acct["positions"].items():
        s = m.sidx.get(sym)
        if s is None:
            continue
        if _ok(C[s]):
            pos["high_close"] = max(pos["high_close"], float(C[s]))
        if _ok(A[s]):
            pos["stop"] = max(pos["stop"], pos["high_close"] - risk["trail_atr"] * float(A[s]))
        if sym in selling:
            continue
        sg = m.sig.get(pos["strategy"]) or (m.sig.get(entry_sid) if entry_sid else None)
        if not sg:
            continue
        held = t - m.t_of(pos["entry_date"])
        reason = None
        if sg["exit"][t, s]:
            reason = f"{sg['label']}の売りサイン"
        elif sg["max_hold"] and held >= sg["max_hold"]:
            reason = f"保有期限（{sg['max_hold']}営業日）"
        if reason:
            acct["pending"].append({"side": "sell", "sym": sym, "shares": pos["shares"], "reason": reason,
                                    "signal_date": d, "est_price": round(float(C[s]), 2) if _ok(C[s]) else None})
            selling.add(sym)

    # 5. entry signals -> buy orders for tomorrow's open
    if acct["cooldown"] == 0 and entry_sid and entry_sid in m.sig:
        sg = m.sig[entry_sid]
        staying = [p for p in acct["positions"] if p not in selling]
        slots = risk["max_positions"] - len(staying)
        if slots > 0:
            busy = set(acct["positions"]) | {o["sym"] for o in acct["pending"]}
            ok = sg["entry"][t] & np.isfinite(C) & np.isfinite(A) & (A > 0)
            cands = [s for s in np.flatnonzero(ok) if m.syms[s] not in busy]
            cands.sort(key=lambda s: -(sg["score"][t, s] if _ok(sg["score"][t, s]) else -1e9))
            cash = acct["cash"] + sum(
                acct["positions"][o["sym"]]["shares"] * (o.get("est_price") or acct["positions"][o["sym"]]["last_price"]) * (1 - slip)
                for o in acct["pending"] if o["side"] == "sell" and o["sym"] in acct["positions"])
            for s in cands:
                if slots <= 0:
                    break
                c, a = float(C[s]), float(A[s])
                n = min(equity * risk["risk_per_trade"] / (risk["stop_atr"] * a),
                        equity * risk["max_position_pct"] / c,
                        max(0.0, cash - fee) / (c * (1 + slip) * 1.02))  # 2% room for a gap up
                n = int(n // lot) * lot
                if n < lot:
                    continue
                acct["pending"].append({"side": "buy", "sym": m.syms[s], "shares": n, "atr": a,
                                        "strategy": entry_sid, "signal_date": d, "est_price": round(c, 2),
                                        "reason": sg["label"] + "の買いサイン"})
                cash -= n * c * (1 + slip) + fee
                slots -= 1
    acct["last_date"] = d
    return equity


def backtest(m: Market, sid: str | None, risk: dict, costs: dict, capital: float, start_t: int = S.WARMUP) -> dict:
    acct = new_account(capital)
    for t in range(min(start_t, len(m.dates) - 1), len(m.dates)):
        step(acct, m, t, sid, risk, costs, record=False)
    return acct
