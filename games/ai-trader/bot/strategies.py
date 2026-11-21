"""Candidate strategies and the indicators they use.

Every strategy is long-only and works on daily bars:
  - the signal is read at the close of day t,
  - the order is executed at the open of day t+1.
The risk rules in engine.py (position size, stop-loss, trailing stop, drawdown
brake) apply to all of them in the same way.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

# Plain-language descriptions, shown on the dashboard.
FAMILIES = {
    "ma_cross": {
        "name": "ゴールデンクロス",
        "kind": "順張り",
        "desc": "短い期間の平均株価が、長い期間の平均株価を上に抜けたら買い。下に抜けたら売り。上昇の流れに乗る作戦です。",
    },
    "breakout": {
        "name": "高値ブレイク",
        "kind": "順張り",
        "desc": "終値が過去の最高値を超えたら買い。過去の安値を割ったら売り。勢いがついた銘柄に乗る作戦です。",
    },
    "rsi_dip": {
        "name": "押し目買い（RSI）",
        "kind": "逆張り",
        "desc": "長い目で見て上昇中（200日平均より上）の銘柄が、ここ数日で売られすぎたら買い。5日平均まで戻したら売り。",
    },
    "bb_dip": {
        "name": "ボリンジャー逆張り",
        "kind": "逆張り",
        "desc": "上昇中の銘柄が、ふだんの値動きの幅（ボリンジャーバンド）の下限を割ったら買い。20日平均まで戻したら売り。",
    },
    "momentum": {
        "name": "強い銘柄に乗る",
        "kind": "順張り",
        "desc": "数か月の上昇率が全体の上位20%に入った銘柄を買い。上位50%から外れるか、50日平均を割ったら売り。",
    },
}

STRATEGIES = [
    {"id": "ma_5_25", "family": "ma_cross", "label": "ゴールデンクロス（5日・25日）", "params": {"fast": 5, "slow": 25}},
    {"id": "ma_10_50", "family": "ma_cross", "label": "ゴールデンクロス（10日・50日）", "params": {"fast": 10, "slow": 50}},
    {"id": "ma_25_75", "family": "ma_cross", "label": "ゴールデンクロス（25日・75日）", "params": {"fast": 25, "slow": 75}},
    {"id": "bo_20_10", "family": "breakout", "label": "高値ブレイク（20日高値・10日安値）", "params": {"entry": 20, "exit": 10}},
    {"id": "bo_55_20", "family": "breakout", "label": "高値ブレイク（55日高値・20日安値）", "params": {"entry": 55, "exit": 20}},
    {"id": "rsi2_10", "family": "rsi_dip", "label": "押し目買い（RSI2が10未満）", "params": {"th": 10, "max_hold": 10}},
    {"id": "rsi2_5", "family": "rsi_dip", "label": "押し目買い（RSI2が5未満）", "params": {"th": 5, "max_hold": 10}},
    {"id": "bb_20", "family": "bb_dip", "label": "ボリンジャー逆張り（−2σ）", "params": {"k": 2.0, "max_hold": 15}},
    {"id": "bb_25", "family": "bb_dip", "label": "ボリンジャー逆張り（−2.5σ）", "params": {"k": 2.5, "max_hold": 15}},
    {"id": "mom_60", "family": "momentum", "label": "強い銘柄に乗る（3か月の上昇率）", "params": {"lookback": 60}},
    {"id": "mom_120", "family": "momentum", "label": "強い銘柄に乗る（6か月の上昇率）", "params": {"lookback": 120}},
]
BY_ID = {s["id"]: s for s in STRATEGIES}

WARMUP = 200  # bars needed before every strategy can trade (200-day average)


class Panel:
    """Prices of many stocks on one shared calendar, with cached indicators.

    Indicators are computed on each stock's own trading days and only then
    aligned, so a missing day for one stock does not disturb its averages.
    """

    def __init__(self, data: dict[str, pd.DataFrame]):
        self.raw = data
        self.syms = list(data)
        idx = pd.DatetimeIndex([])
        for df in data.values():
            idx = idx.union(df.index)
        self.index = idx.sort_values()
        self._cache: dict = {}
        self.O = self._align(lambda d: d["Open"])
        self.H = self._align(lambda d: d["High"])
        self.L = self._align(lambda d: d["Low"])
        self.C = self._align(lambda d: d["Close"])

    def _align(self, fn) -> pd.DataFrame:
        cols = {s: fn(self.raw[s]) for s in self.syms}
        return pd.concat(cols, axis=1).reindex(self.index)[self.syms]

    def _get(self, key, fn) -> pd.DataFrame:
        if key not in self._cache:
            self._cache[key] = self._align(fn)
        return self._cache[key]

    def sma(self, n):
        return self._get(("sma", n), lambda d: d["Close"].rolling(n, min_periods=n).mean())

    def sd(self, n):
        return self._get(("sd", n), lambda d: d["Close"].rolling(n, min_periods=n).std(ddof=0))

    def ret(self, n):
        return self._get(("ret", n), lambda d: d["Close"] / d["Close"].shift(n) - 1.0)

    def hh(self, n):  # highest high of the previous n days (today excluded)
        return self._get(("hh", n), lambda d: d["High"].shift(1).rolling(n, min_periods=n).max())

    def ll(self, n):  # lowest low of the previous n days (today excluded)
        return self._get(("ll", n), lambda d: d["Low"].shift(1).rolling(n, min_periods=n).min())

    def rsi(self, n):
        def f(d):
            delta = d["Close"].diff()
            gain = delta.clip(lower=0.0).ewm(alpha=1.0 / n, adjust=False, min_periods=n).mean()
            loss = (-delta.clip(upper=0.0)).ewm(alpha=1.0 / n, adjust=False, min_periods=n).mean()
            rs = gain / loss.replace(0.0, np.nan)
            out = 100.0 - 100.0 / (1.0 + rs)
            return out.where(loss > 0, 100.0).where(gain.notna())
        return self._get(("rsi", n), f)

    def atr(self, n=14):
        def f(d):
            prev = d["Close"].shift(1)
            tr = pd.concat([d["High"] - d["Low"], (d["High"] - prev).abs(), (d["Low"] - prev).abs()], axis=1).max(axis=1)
            tr.iloc[0] = d["High"].iloc[0] - d["Low"].iloc[0]
            return tr.ewm(alpha=1.0 / n, adjust=False, min_periods=n).mean()
        return self._get(("atr", n), f)


def signals(panel: Panel, strat: dict):
    """Return (entry, exit, score) DataFrames for one strategy."""
    fam, p = strat["family"], strat["params"]
    C = panel.C
    if fam == "ma_cross":
        f, s = panel.sma(p["fast"]), panel.sma(p["slow"])
        entry = (f > s) & (f.shift(1) <= s.shift(1))
        exit_ = f < s
        score = panel.ret(60)
    elif fam == "breakout":
        entry = C > panel.hh(p["entry"])
        exit_ = C < panel.ll(p["exit"])
        score = panel.ret(60)
    elif fam == "rsi_dip":
        r = panel.rsi(2)
        entry = (r < p["th"]) & (C > panel.sma(200))
        exit_ = C > panel.sma(5)
        score = p["th"] - r
    elif fam == "bb_dip":
        mid, sd = panel.sma(20), panel.sd(20)
        lower = mid - p["k"] * sd
        entry = (C < lower) & (C > panel.sma(200))
        exit_ = C > mid
        score = (lower - C) / C
    elif fam == "momentum":
        r = panel.ret(p["lookback"])
        rank = r.rank(axis=1, pct=True)
        sma50 = panel.sma(50)
        entry = (rank >= 0.8) & (C > sma50) & (r > 0)
        exit_ = (rank < 0.5) | (C < sma50)
        score = r
    else:
        raise ValueError(f"unknown strategy family {fam}")
    return entry.fillna(False).astype(bool), exit_.fillna(False).astype(bool), score
