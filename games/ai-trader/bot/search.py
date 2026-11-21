"""Strategy search: backtest every candidate, pick one, and check the picking method.

Picking rule (used both for the live demo and inside the walk-forward test):
  the candidate with the best Sharpe ratio over the last `lookback_years`,
  among those with at least `min_trades` closed trades and a positive Sharpe.
  If none qualifies, the bot stays in cash.

Walk-forward test: for every calendar year, pick a strategy using only the
years before it, then trade that year with it. Chaining those years shows how
"search, then trade what the search found" would have done, without the
hindsight of picking the winner after the fact.
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

from . import engine as E
from . import strategies as S


def curve(acct: dict) -> pd.Series:
    if not acct["equity"]:
        return pd.Series(dtype=float)
    d, v = zip(*acct["equity"])
    return pd.Series(v, index=list(d), dtype=float)


def metrics(eq: pd.Series, trades: list, dates: list, start: str | None = None, end: str | None = None):
    e = eq
    if start:
        e = e[e.index >= start]
    if end:
        e = e[e.index <= end]
    if len(e) < 20:
        return None
    r = e.pct_change().dropna()
    years = len(r) / 252.0
    growth = e.iloc[-1] / e.iloc[0]
    sd = float(r.std(ddof=0))
    tr = [x for x in trades if (start is None or x["exit_date"] >= start) and (end is None or x["exit_date"] <= end)]
    wins = [x["pnl"] for x in tr if x["pnl"] > 0]
    losses = [-x["pnl"] for x in tr if x["pnl"] < 0]
    idx = {d: i for i, d in enumerate(dates)}
    holds = [idx[x["exit_date"]] - idx[x["entry_date"]] for x in tr if x["entry_date"] in idx and x["exit_date"] in idx]
    return {
        "total": round(float(growth - 1.0), 4),
        "cagr": round(float(growth ** (1.0 / years) - 1.0), 4) if years > 0.2 else None,
        "max_dd": round(float((e / e.cummax() - 1.0).min()), 4),
        "sharpe": round(float(r.mean()) / sd * math.sqrt(252), 2) if sd > 0 else 0.0,
        "trades": len(tr),
        "win_rate": round(len(wins) / len(tr), 3) if tr else None,
        "pf": round(sum(wins) / sum(losses), 2) if losses else None,
        "avg_hold": round(float(np.mean(holds)), 1) if holds else None,
    }


SWITCH_MARGIN = 0.1  # switch only if the new best is clearly better (Sharpe +0.1)


def pick(results: dict, dates: list, start: str, end: str, min_trades: int, current: str | None = None):
    """Best qualifying strategy; keeps `current` unless it is clearly beaten."""
    scores = {}
    for sid, res in results.items():
        mt = metrics(res["curve"], res["acct"]["trades"], dates, start, end)
        if mt and mt["trades"] >= min_trades and mt["sharpe"] > 0:
            scores[sid] = mt["sharpe"]
    if not scores:
        return None
    best = max(scores, key=scores.get)
    if current in scores and scores[best] < scores[current] + SWITCH_MARGIN:
        return current
    return best


def shift_years(date: str, years: int) -> str:
    y, m, d = date.split("-")
    if m == "02" and d == "29":
        d = "28"
    return f"{int(y) - years:04d}-{m}-{d}"


def sample(series: list, every: int = 5) -> list:
    """Thin a long daily series for the page; always keep the last point."""
    if len(series) <= 2 * every:
        return series
    out = series[::every]
    if out[-1] is not series[-1]:
        out.append(series[-1])
    return out


def run_search(m: E.Market, bench: pd.Series | None, cfg: dict, ran_at: str, current: str | None = None, log=print) -> dict:
    risk, costs = cfg["risk"], cfg["costs"]
    sc = cfg["search"]
    cap = cfg["account"]["initial_capital"]
    L, min_trades = sc["lookback_years"], sc["min_trades"]

    results = {}
    for sd in S.STRATEGIES:
        acct = E.backtest(m, sd["id"], risk, costs, cap)
        results[sd["id"]] = {"acct": acct, "curve": curve(acct)}
        log(f"  {sd['id']:<9} trades={len(acct['trades']):>4}  final={acct['equity'][-1][1]:>12,}")

    dates = m.dates
    end = dates[-1]
    start = shift_years(end, L)
    rows = []
    for sd in S.STRATEGIES:
        res = results[sd["id"]]
        rows.append({
            "id": sd["id"], "label": sd["label"], "family": sd["family"],
            "kind": S.FAMILIES[sd["family"]]["kind"],
            "m3": metrics(res["curve"], res["acct"]["trades"], dates, start, end),
            "mall": metrics(res["curve"], res["acct"]["trades"], dates),
        })
    best = pick(results, dates, start, end, min_trades)
    selected = pick(results, dates, start, end, min_trades, current=current)

    # Benchmark aligned to the trading calendar.
    b = None
    bench_m3 = None
    if bench is not None and len(bench):
        b = bench.copy()
        b.index = [d.strftime("%Y-%m-%d") for d in b.index]
        b = b.reindex(sorted(set(b.index) | set(dates))).ffill().reindex(dates)
        bench_m3 = metrics(b.dropna(), [], dates, start, end)

    # Walk-forward over whole calendar years.
    bt_start = dates[min(S.WARMUP, len(dates) - 1)]
    first_year = int(bt_start[:4]) + 1 + L
    last_year = int(end[:4])
    pieces, years = [], []
    sid = None
    for Y in range(first_year, last_year + 1):
        ws, we = f"{Y - L}-01-01", f"{Y - 1}-12-31"
        sid = pick(results, dates, ws, we, min_trades, current=sid)
        ys, ye = f"{Y}-01-01", f"{Y}-12-31"
        if sid:
            c = results[sid]["curve"]
            r = c.pct_change()
            r = r[(r.index >= ys) & (r.index <= ye)].fillna(0.0)
        else:
            r = pd.Series(0.0, index=[d for d in dates if ys <= d <= ye])
        if len(r) == 0:
            continue
        pieces.append(r)
        yr = {"year": Y, "id": sid, "ret": round(float((1 + r).prod() - 1), 4)}
        if b is not None:
            bb = b[(b.index >= ys) & (b.index <= ye)]
            prev = b[b.index < ys]
            base = prev.iloc[-1] if len(prev) else bb.iloc[0]
            yr["bench"] = round(float(bb.iloc[-1] / base - 1), 4) if len(bb) else None
        yr["partial"] = Y == last_year
        years.append(yr)

    wf = None
    if pieces:
        r = pd.concat(pieces)
        eq = cap * (1 + r).cumprod()
        base_date = dates[max(0, dates.index(r.index[0]) - 1)]
        eq = pd.concat([pd.Series([float(cap)], index=[base_date]), eq])
        pts = []
        for d, v in eq.items():
            row = [d, round(float(v))]
            if b is not None:
                row.append(round(float(cap * b[d] / b[base_date])) if pd.notna(b[d]) and pd.notna(b[base_date]) else None)
            pts.append(row)
        wf = {
            "start": base_date, "end": end,
            "curve": sample(pts),
            "metrics": metrics(eq, [], dates),
            "bench_metrics": metrics((b[eq.index] * 1.0).dropna(), [], dates) if b is not None else None,
            "years": years,
        }
        # trade count of the walk-forward = trades of the chosen strategy in its year
        n = 0
        for yr in years:
            if yr["id"]:
                n += sum(1 for x in results[yr["id"]]["acct"]["trades"] if x["exit_date"][:4] == str(yr["year"]))
        wf["metrics"]["trades"] = n

    sel_curve = None
    if selected:
        c = results[selected]["curve"]
        c = c[c.index >= start]
        if len(c):
            base = c.index[0]
            pts = []
            for d, v in c.items():
                row = [d, round(float(v))]
                if b is not None:
                    row.append(round(float(c.iloc[0] * b[d] / b[base])) if pd.notna(b[d]) and pd.notna(b[base]) else None)
                pts.append(row)
            sel_curve = sample(pts, 3)

    return {
        "ran_at": ran_at,
        "data_from": bt_start,
        "data_to": end,
        "window": [start, end],
        "lookback_years": L,
        "min_trades": min_trades,
        "rows": rows,
        "bench_m3": bench_m3,
        "best": best,
        "selected": selected,
        "selected_curve": sel_curve,
        "walk_forward": wf,
        "strategy_ids": [s["id"] for s in S.STRATEGIES],
    }
