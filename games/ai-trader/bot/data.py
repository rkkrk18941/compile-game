"""Daily price data for Tokyo-listed stocks.

Yahoo Finance (through yfinance) is the main source; Stooq is the fallback.
Prices are split-adjusted but not dividend-adjusted, i.e. the prices you
would actually have traded at (apart from later stock splits).
"""
from __future__ import annotations

import io
import time
import urllib.request
from datetime import datetime, time as dtime
from zoneinfo import ZoneInfo

import pandas as pd

JST = ZoneInfo("Asia/Tokyo")
COLS = ["Open", "High", "Low", "Close", "Volume"]
PRICE_COLS = ["Open", "High", "Low", "Close"]
# The TSE closes at 15:30. A day's bar is only treated as final after 16:00 JST,
# so a run during trading hours never acts on a half-finished day.
FINAL_AFTER = dtime(16, 0)


def yahoo_symbol(code: str) -> str:
    return code if code.startswith("^") or "." in code else f"{code}.T"


def now_jst() -> datetime:
    return datetime.now(JST)


def clean(df: pd.DataFrame) -> pd.DataFrame:
    if df is None or len(df) == 0:
        raise ValueError("no rows")
    df = df.rename(columns=lambda c: str(c).strip().title())
    missing = [c for c in COLS if c not in df.columns]
    if "Volume" in missing:
        df["Volume"] = float("nan")
        missing.remove("Volume")
    if missing:
        raise ValueError(f"missing columns {missing}")
    split = df["Stock Splits"] if "Stock Splits" in df.columns else df.get("Split")
    out = df[COLS].astype(float)
    out["Split"] = split.astype(float).fillna(0.0) if split is not None else 0.0
    df = out
    idx = pd.DatetimeIndex(df.index)
    if idx.tz is not None:
        idx = idx.tz_convert(JST).tz_localize(None)
    df.index = idx.normalize()
    df = df[~df.index.duplicated(keep="last")].sort_index()
    df = df.dropna(subset=PRICE_COLS)
    df = df[(df[PRICE_COLS] > 0).all(axis=1)].copy()
    # Repair the occasional inconsistent row (e.g. High below Close).
    df["High"] = df[PRICE_COLS].max(axis=1)
    df["Low"] = df[PRICE_COLS].min(axis=1)
    if len(df) == 0:
        raise ValueError("no valid rows")
    return df


def fetch_yahoo(symbol: str, start: str) -> pd.DataFrame:
    import yfinance as yf

    df = yf.Ticker(symbol).history(
        start=start, interval="1d", auto_adjust=False, actions=True, raise_errors=True
    )
    return clean(df)


def fetch_stooq(symbol: str, start: str) -> pd.DataFrame:
    code = "^nkx" if symbol == "^N225" else symbol.replace(".T", ".jp").lower()
    url = f"https://stooq.com/q/d/l/?s={code}&i=d&d1={start.replace('-', '')}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=20) as r:
        text = r.read().decode("utf-8", "replace")
    df = pd.read_csv(io.StringIO(text))
    if "Date" not in df.columns:
        raise ValueError("unexpected response from Stooq")
    df = df.set_index(pd.to_datetime(df["Date"]))
    return clean(df)


def fetch_all(symbols, start: str, log=print, pause: float = 0.4):
    """Return ({symbol: DataFrame}, [failed symbols])."""
    out, failed = {}, []
    for sym in symbols:
        df, err = None, None
        for attempt in range(3):
            try:
                df = fetch_yahoo(sym, start)
                break
            except Exception as e:  # network hiccups, rate limits, odd responses
                err = e
                time.sleep(2.0 * (attempt + 1))
        if df is None:
            try:
                df = fetch_stooq(sym, start)
                log(f"  {sym}: Yahoo failed ({err}); used Stooq")
            except Exception as e2:
                log(f"  {sym}: FAILED ({err} / {e2})")
                failed.append(sym)
                continue
        out[sym] = df
        time.sleep(pause)
    return out, failed


def apply_splits(acct: dict, prices: dict, log=print) -> list:
    """Bring held positions onto the split-adjusted price scale.

    After a stock split, Yahoo rewrites all earlier prices on the new scale.
    A position bought before the split still carries old-scale prices, so its
    share count and prices are converted once per split (recorded in "splits").
    """
    done_any = []
    for sym, pos in list(acct["positions"].items()):
        df = prices.get(sym)
        if df is None or "Split" not in df.columns:
            continue
        ev = df.loc[(df.index > pd.Timestamp(pos["entry_date"])) & (df["Split"] > 0) & (df["Split"] != 1.0), "Split"]
        for d, r in ev.items():
            key = d.strftime("%Y-%m-%d")
            if key in pos.get("splits", []):
                continue
            pos["shares"] = max(1, int(round(pos["shares"] * r)))
            for k in ("entry_price", "stop", "high_close", "last_price"):
                pos[k] = pos[k] / r
            pos.setdefault("splits", []).append(key)
            done_any.append((sym, key, r))
            log(f"  split {sym} on {key}: x{r:g} -> {pos['shares']} shares")
    return done_any


def drop_unfinished(df: pd.DataFrame, now: datetime) -> pd.DataFrame:
    """Drop today's bar while the market day is not over yet (and anything later)."""
    today = pd.Timestamp(now.astimezone(JST).date())
    if now.astimezone(JST).time() < FINAL_AFTER:
        return df[df.index < today]
    return df[df.index <= today]
