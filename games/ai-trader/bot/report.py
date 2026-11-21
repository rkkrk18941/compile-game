"""Builds data/dashboard.json, the single file the page reads."""
from __future__ import annotations

import pandas as pd

from . import strategies as S


def _code(sym: str) -> str:
    return sym.replace(".T", "")


def _label(sid):
    return S.BY_ID[sid]["label"] if sid in S.BY_ID else None


def rules(cfg: dict) -> list:
    r, c = cfg["risk"], cfg["costs"]
    return [
        {"title": "1回の損失の上限", "text": f"損切りに引っかかったときの損失が、資金の{r['risk_per_trade']:.0%}以内になる株数だけ買う。"},
        {"title": "損切り（逆指値）", "text": f"買った直後に、買値からふだんの値動き（ATR）の{r['stop_atr']}倍下に売り注文を置く。"},
        {"title": "利益を守る", "text": f"値上がりしたら、売る位置を「買ってからの最高値−ATRの{r['trail_atr']}倍」まで引き上げる（下げはしない）。"},
        {"title": "分散", "text": f"同時に持つのは最大{r['max_positions']}銘柄。1銘柄に使うのは資金の{r['max_position_pct']:.0%}まで。"},
        {"title": "全体のブレーキ", "text": f"口座が最高値から{r['max_drawdown']:.0%}減ったら、{r['cooldown_days']}営業日は新しく買わない。"},
        {"title": "成績が悪い戦略は使わない", "text": "直近の成績（シャープレシオ）がマイナスの戦略しかないときは、何も買わずに待つ。"},
        {"title": "取引コスト", "text": f"買うときも売るときも、価格が{c['slippage']:.1%}不利になる前提で計算（手数料{c['commission']:,}円）。株数は{r['lot']}株単位。"},
    ]


def build(state: dict, search: dict | None, names: dict, bench: pd.Series | None, cfg: dict,
          updated_at: str, failed: list, universe_count: int) -> dict:
    acct = state["account"]
    nm = lambda s: names.get(s, _code(s))  # noqa: E731

    # live equity curve, with "same money in the Nikkei 225" alongside
    b = None
    if bench is not None and len(bench):
        b = bench.copy()
        b.index = [d.strftime("%Y-%m-%d") for d in b.index]
    curve = []
    base = None
    for d, v in acct["equity"]:
        bv = None
        if b is not None:
            prior = b[b.index <= d]
            if len(prior):
                if base is None:
                    base = float(prior.iloc[-1])
                bv = round(acct["initial"] * float(prior.iloc[-1]) / base)
        curve.append([d, v, bv])

    equity = acct["equity"][-1][1] if acct["equity"] else acct["initial"]
    invested = sum(p["shares"] * p["last_price"] for p in acct["positions"].values())
    last_date = acct.get("last_date")

    positions = []
    for p in sorted(acct["positions"].values(), key=lambda p: p["entry_date"]):
        pnl = (p["last_price"] - p["entry_price"]) * p["shares"] - p.get("entry_fee", 0)
        positions.append({
            "code": _code(p["sym"]), "name": nm(p["sym"]), "shares": p["shares"],
            "entry_date": p["entry_date"], "entry_price": round(p["entry_price"], 1),
            "last_price": round(p["last_price"], 1), "value": round(p["shares"] * p["last_price"]),
            "pnl": round(pnl), "pnl_pct": round(p["last_price"] / p["entry_price"] - 1, 4),
            "stop": round(p["stop"], 1), "stop_gap": round(p["stop"] / p["last_price"] - 1, 4),
            "strategy": _label(p["strategy"]),
        })

    pending = []
    for o in sorted(acct["pending"], key=lambda o: (o["side"] != "sell", o["sym"])):
        pending.append({
            "side": o["side"], "code": _code(o["sym"]), "name": nm(o["sym"]), "shares": o["shares"],
            "est_price": o.get("est_price"),
            "est_value": round(o["shares"] * o["est_price"]) if o.get("est_price") else None,
            "reason": o.get("reason"), "signal_date": o.get("signal_date"),
        })

    trades = []
    for x in reversed(acct["trades"][-150:]):
        trades.append({**{k: x[k] for k in ("entry_date", "entry_price", "exit_date", "exit_price", "shares", "pnl", "pnl_pct", "reason")},
                       "code": _code(x["sym"]), "name": nm(x["sym"]), "strategy": _label(x["strategy"])})

    events = []
    for e in reversed(acct["events"][-80:]):
        events.append({**e, "code": _code(e["sym"]) if e.get("sym") else None, "name": nm(e["sym"]) if e.get("sym") else None})

    closed = acct["trades"]
    wins = sum(1 for x in closed if x["pnl"] > 0)
    peak = max([v for _, v in acct["equity"]] + [acct["initial"]])
    bench_pct = None
    if curve and curve[-1][2] is not None:
        bench_pct = round(curve[-1][2] / acct["initial"] - 1, 4)

    sid = state.get("strategy")
    strat = None
    if search:
        row = next((r for r in search["rows"] if r["id"] == sid), None)
        strat = {
            "id": sid, "label": _label(sid),
            "family": S.BY_ID[sid]["family"] if sid in S.BY_ID else None,
            "m3": row["m3"] if row else None,
            "history": [{"from": h["from"], "id": h["id"], "label": _label(h["id"])} for h in state.get("strategy_history", [])][-12:],
        }

    out_search = None
    if search:
        out_search = {k: search.get(k) for k in ("ran_at", "data_from", "data_to", "window", "lookback_years", "min_trades",
                                                "rows", "bench_m3", "best", "selected", "selected_curve", "walk_forward")}
        if out_search["walk_forward"]:
            for y in out_search["walk_forward"]["years"]:
                y["label"] = _label(y["id"]) if y["id"] else "見送り（現金のまま）"

    return {
        "version": 1,
        "updated_at": updated_at,
        "data_through": last_date,
        "started": state.get("started"),
        "account": {
            "initial": round(acct["initial"]), "equity": round(equity), "cash": round(acct["cash"]),
            "invested": round(invested), "pnl": round(equity - acct["initial"]),
            "pnl_pct": round(equity / acct["initial"] - 1, 4),
            "drawdown": round(equity / peak - 1, 4) if peak else 0,
            "bench_pct": bench_pct,
            "cooldown": acct["cooldown"],
            "trades": len(closed), "wins": wins,
            "realized": round(sum(x["pnl"] for x in closed)),
        },
        "curve": curve,
        "positions": positions,
        "pending": pending,
        "trades": trades,
        "events": events,
        "strategy": strat,
        "families": S.FAMILIES,
        "search": out_search,
        "rules": rules(cfg),
        "universe": {"count": universe_count, "failed": [_code(s) for s in failed]},
        "runs": list(reversed(state.get("runs", [])[-20:])),
    }
