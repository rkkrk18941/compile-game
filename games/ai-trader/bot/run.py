"""Entry point: fetch prices, re-run the strategy search when due, advance the demo account.

    python -m bot.run                 # normal run (GitHub Actions, weekdays after the close)
    python -m bot.run --force-search  # search again right now
    python -m bot.run --prices p.pkl --now 2026-11-24T17:30 --out /tmp/x   # offline test
"""
from __future__ import annotations

import argparse
import bisect
import json
import pickle
import sys
from datetime import datetime
from pathlib import Path

from . import data as D
from . import engine as E
from . import report as R
from . import strategies as S
from .search import run_search

ROOT = Path(__file__).resolve().parent.parent


def load_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None


def save_json(path: Path, obj, compact=False):
    tmp = path.with_suffix(".tmp")
    if compact:
        tmp.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    else:
        tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(path)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--prices", help="pickle of {symbol: DataFrame} instead of downloading (tests)")
    ap.add_argument("--now", help="pretend JST time, e.g. 2026-11-24T17:30 (tests)")
    ap.add_argument("--out", default=str(ROOT / "data"))
    ap.add_argument("--force-search", action="store_true")
    args = ap.parse_args(argv)

    cfg = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
    now = datetime.fromisoformat(args.now).replace(tzinfo=D.JST) if args.now else D.now_jst()
    stamp = now.isoformat(timespec="seconds")
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    universe = [D.yahoo_symbol(u["code"]) for u in cfg["universe"]]
    names = {D.yahoo_symbol(u["code"]): u["name"] for u in cfg["universe"]}
    names.update((load_json(out / "names.json") or {}))  # names of stocks dropped from the list but still held
    state = load_json(out / "state.json")
    held = []
    if state:
        a = state["account"]
        held = list(a["positions"]) + [o["sym"] for o in a["pending"]]
    want = list(dict.fromkeys(universe + held))
    bsym = cfg["benchmark"]["symbol"]

    print(f"[{stamp}] fetching {len(want)} stocks + {bsym}")
    if args.prices:
        with open(args.prices, "rb") as f:
            raw = pickle.load(f)
        raw = {k: v for k, v in raw.items() if k in want or k == bsym}
        failed = [s for s in want if s not in raw]
    else:
        raw, failed = D.fetch_all(want + [bsym], cfg["search"]["history_start"])
        failed = [s for s in failed if s != bsym]
    bench = raw.pop(bsym, None)
    prices = {}
    for s, df in raw.items():
        df = D.drop_unfinished(df, now)
        df = df[~(df["Volume"] == 0)]  # Yahoo sometimes adds a placeholder row with no trading
        if len(df) > S.WARMUP:
            prices[s] = df
        elif s not in failed:
            failed.append(s)
    if bench is not None:
        bench = D.drop_unfinished(bench, now)["Close"]
    got = sum(1 for s in universe if s in prices)
    if got < 0.6 * len(universe):
        print(f"ERROR: only {got}/{len(universe)} stocks have data; nothing was changed.")
        return 2
    if failed:
        print("  missing:", ", ".join(failed))

    m = E.build_market(prices)
    last = m.dates[-1]
    print(f"  prices through {last} ({len(m.dates)} trading days)")

    search = load_json(out / "search.json")
    every = cfg["search"]["research_every_days"]
    due = (
        args.force_search or search is None
        or search.get("strategy_ids") != [s["id"] for s in S.STRATEGIES]
        or (now.date() - datetime.fromisoformat(search["ran_at"]).date()).days >= every
    )
    if due:
        print("  strategy search:")
        search = run_search(m, bench, cfg, stamp, current=state.get("strategy") if state else None)
        save_json(out / "search.json", search, compact=True)
        wf = search["walk_forward"]
        print(f"  -> selected: {search['selected']}"
              + (f" | walk-forward total {wf['metrics']['total']:+.1%}" if wf else ""))
    selected = search["selected"]

    if state is None:
        acct = E.new_account(cfg["account"]["initial_capital"])
        state = {"account": acct, "started": last, "strategy": selected,
                 "strategy_history": [{"from": last, "id": selected}], "runs": []}
        t_from = len(m.dates) - 1  # start trading from the latest close: orders go to the next open
    else:
        acct = state["account"]
        t_from = bisect.bisect_right(m.dates, acct["last_date"]) if acct["last_date"] else len(m.dates) - 1
        if state.get("strategy") != selected:
            state["strategy"] = selected
            state["strategy_history"].append({"from": last, "id": selected})
            print(f"  strategy changed -> {selected}")

    new_days = list(range(t_from, len(m.dates)))
    splits = D.apply_splits(acct, prices)
    if not new_days and not due and not splits:
        print("  no new trading day since the last run; nothing to do.")
        return 0

    n_events = len(acct["events"])
    for sym, day, r in splits:
        acct["events"].append({"date": day, "type": "split", "sym": sym,
                               "text": f"株式分割（1株→{r:g}株）に合わせて株数と値段を調整"})
    for t in new_days:
        E.step(acct, m, t, selected, cfg["risk"], cfg["costs"], record=True)
    fresh = acct["events"][n_events:]
    acct["events"] = acct["events"][-400:]
    run = {
        "at": stamp, "through": last, "days": [m.dates[t] for t in new_days][-10:],
        "buys": sum(1 for e in fresh if e["type"] == "buy"),
        "sells": sum(1 for e in fresh if e["type"] == "sell"),
        "orders": len(acct["pending"]), "search": bool(due),
    }
    state["runs"] = (state.get("runs", []) + [run])[-30:]

    for s in list(acct["positions"]) + [o["sym"] for o in acct["pending"]]:
        if s in names:
            continue
        names[s] = s.replace(".T", "")
    held_names = {s: names[s] for s in list(acct["positions"]) + [o["sym"] for o in acct["pending"]]}

    save_json(out / "state.json", state)
    save_json(out / "names.json", held_names)
    dash = R.build(state, search, names, bench, cfg, stamp, failed, len(universe))
    save_json(out / "dashboard.json", dash, compact=True)

    eq = acct["equity"][-1][1]
    print(f"  processed {len(new_days)} day(s): buys {run['buys']}, sells {run['sells']}, "
          f"open orders {run['orders']}, positions {len(acct['positions'])}, equity {eq:,} JPY")
    for e in fresh[-20:]:
        print(f"    {e['date']} {e['type']:<6} {e.get('sym') or '':<8} {e['text']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
