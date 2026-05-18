"""
Supertrend EA Performance Dashboard.
Compares the EA equity curve against XAUUSD buy-and-hold,
both normalized for like-for-like visualisation.

Run:  python app.py
Open: http://127.0.0.1:5000
"""

from __future__ import annotations

import math
import re
from pathlib import Path

import pandas as pd
import numpy as np
from flask import Flask, render_template, jsonify

ROOT          = Path(__file__).parent
EQUITY_CSV    = ROOT / "reports" / "testergraph.report.2026.05.17.csv"
GOLD_CSV_D    = ROOT / "data" / "XAUUSD_D_TradingView.csv"     # Daily, full strategy period
GOLD_CSV_H4   = ROOT / "data" / "XAUUSD_H4_TradingView.csv"    # H4, recent window only
GOLD_CSV      = GOLD_CSV_D if GOLD_CSV_D.exists() else GOLD_CSV_H4
REPORT_HTML   = ROOT / "reports" / "ReportTester-12139132.html"

app = Flask(__name__)
# Forbid invalid-JSON NaN/Infinity literals on the wire (browser JSON.parse rejects them).
app.json.allow_nan = False
# Pick up template + static edits without restarting the server.
app.config["TEMPLATES_AUTO_RELOAD"] = True
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0


def clean_json(obj):
    """Recursively replace NaN/Inf with None so the response is valid JSON."""
    if isinstance(obj, float):
        return None if (math.isnan(obj) or math.isinf(obj)) else obj
    if isinstance(obj, dict):
        return {k: clean_json(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [clean_json(v) for v in obj]
    return obj


# ── Data loaders ─────────────────────────────────────────────────────────────
def load_equity() -> pd.DataFrame:
    df = pd.read_csv(EQUITY_CSV, sep="\t", encoding="utf-16")
    df.columns = [c.strip("<>").lower() for c in df.columns]
    df["date"]    = pd.to_datetime(df["date"], format="%Y.%m.%d %H:%M", utc=True)
    df            = df.set_index("date").sort_index()
    df["balance"] = pd.to_numeric(df["balance"])
    df["equity"]  = pd.to_numeric(df["equity"])
    return df


def load_gold() -> pd.DataFrame:
    df = pd.read_csv(GOLD_CSV)
    df["datetime"] = pd.to_datetime(df["datetime"], utc=True)
    df = df.set_index("datetime").sort_index()
    return df


def load_report_stats() -> dict:
    """Parse selected stats out of the MT5 HTML report."""
    raw = REPORT_HTML.read_bytes().decode("utf-16-le", errors="ignore")
    text = re.sub(r"<[^>]+>", " ", raw)
    text = re.sub(r"\s+", " ", text)

    def grab_num(label: str) -> float:
        # MT5 numbers can be "420 019.74", "-27 754.67", "1.94"
        m = re.search(rf"{re.escape(label)}:\s*(-?[\d\s]+\.?\d*)", text)
        if not m:
            return float("nan")
        s = m.group(1).replace(" ", "")
        try:    return float(s)
        except: return float("nan")

    stats = {
        "initial_deposit":   grab_num("Initial Deposit"),
        "net_profit":        grab_num("Total Net Profit"),
        "gross_profit":      grab_num("Gross Profit"),
        "gross_loss":        grab_num("Gross Loss"),
        "profit_factor":     grab_num("Profit Factor"),
        "expected_payoff":   grab_num("Expected Payoff"),
        "recovery_factor":   grab_num("Recovery Factor"),
        "sharpe_ratio":      grab_num("Sharpe Ratio"),
        "total_trades":      int(grab_num("Total Trades") or 0),
        "balance_dd_max":    grab_num("Balance Drawdown Maximal"),
        "equity_dd_max":     grab_num("Equity Drawdown Maximal"),
        "largest_win":       grab_num("Largest profit trade"),
        "largest_loss":      grab_num("Largest loss trade"),
        "avg_win":           grab_num("Average profit trade"),
        "avg_loss":          grab_num("Average loss trade"),
    }

    # win-rate (parse e.g. "196 (56.48%)")
    m = re.search(r"Profit Trades \(% of total\):\s*(\d+)\s*\(([\d\.]+)%\)", text)
    if m:
        stats["profit_trades"] = int(m.group(1))
        stats["win_rate"]      = float(m.group(2))
    m = re.search(r"Loss Trades \(% of total\):\s*(\d+)", text)
    if m:
        stats["loss_trades"] = int(m.group(1))

    # Maximal drawdowns: "Balance Drawdown Maximal: 66 651.96 (11.85%)"  (value, then pct)
    m = re.search(r"Balance Drawdown Maximal:\s*[\d\s\.,]+\(([\d\.]+)%\)", text)
    if m: stats["balance_dd_max_pct"] = float(m.group(1))
    m = re.search(r"Equity Drawdown Maximal:\s*[\d\s\.,]+\(([\d\.]+)%\)", text)
    if m: stats["equity_dd_max_pct"]  = float(m.group(1))

    # Relative drawdowns: "Equity Drawdown Relative: 43.71% (48 650.03)"  (pct, then value)
    m = re.search(r"Balance Drawdown Relative:\s*([\d\.]+)%\s*\(([\d\s\.,]+)\)", text)
    if m:
        stats["balance_dd_rel_pct"] = float(m.group(1))
        stats["balance_dd_rel_val"] = float(m.group(2).replace(" ", "").replace(",", ""))
    m = re.search(r"Equity Drawdown Relative:\s*([\d\.]+)%\s*\(([\d\s\.,]+)\)", text)
    if m:
        stats["equity_dd_rel_pct"] = float(m.group(1))
        stats["equity_dd_rel_val"] = float(m.group(2).replace(" ", "").replace(",", ""))

    # Derived: average risk/reward (avg_win / |avg_loss|)
    aw, al = stats.get("avg_win", 0), stats.get("avg_loss", 0)
    stats["avg_rr"] = (aw / abs(al)) if al not in (0, None) and not math.isnan(al) else float("nan")

    # Derived: expectancy per trade ($)
    wr = stats.get("win_rate", 0) / 100 if stats.get("win_rate") else 0
    stats["expectancy"] = wr * aw + (1 - wr) * al if aw and al else float("nan")

    return stats


# ── Metric helpers ───────────────────────────────────────────────────────────
def cagr(first: float, last: float, years: float) -> float:
    if years <= 0 or first <= 0: return 0.0
    return (last / first) ** (1 / years) - 1


def max_drawdown(series: pd.Series) -> tuple[float, pd.Series]:
    rolling_max = series.cummax()
    dd          = (series - rolling_max) / rolling_max
    return float(dd.min()), dd


def _regress(s_ret: pd.Series, g_ret: pd.Series, periods_per_year: int) -> dict:
    """OLS of strategy returns on gold returns. Returns R², r, beta, annualised alpha."""
    common = s_ret.index.intersection(g_ret.index)
    s, g   = s_ret.loc[common], g_ret.loc[common]
    n = len(s)
    if n < 3:
        return {"r_squared": 0.0, "correlation": 0.0, "beta": 0.0, "alpha_annual": 0.0, "n": n}
    sv, gv = s.values, g.values
    r = float(np.corrcoef(sv, gv)[0, 1]) if np.std(gv) > 0 and np.std(sv) > 0 else 0.0
    var_g = float(np.var(gv, ddof=0))
    beta  = float(np.cov(sv, gv, ddof=0)[0, 1] / var_g) if var_g > 0 else 0.0
    alpha_period = float(sv.mean() - beta * gv.mean())
    alpha_ann    = ((1 + alpha_period) ** periods_per_year - 1) * 100
    return {
        "r_squared":    r * r if np.isfinite(r) else 0.0,
        "correlation":  r    if np.isfinite(r) else 0.0,
        "beta":         beta if np.isfinite(beta) else 0.0,
        "alpha_annual": alpha_ann if np.isfinite(alpha_ann) else 0.0,
        "n":            n,
    }


def extract_trade_returns(eq: pd.DataFrame) -> dict:
    """Pull each closed-trade's fractional return from the balance series.

    A trade close shows up as a non-zero `balance.diff()`. Dividing that change
    by the balance *before* the change gives the trade's % return — which is what
    the Monte Carlo bootstrap should resample (so paths compound naturally and are
    invariant to starting capital).
    """
    bal = eq["balance"].sort_index()
    diff = bal.diff()
    mask = diff != 0
    pnl  = diff[mask]
    prev = bal.shift(1)[mask]
    returns = (pnl / prev).dropna().tolist()

    # Annualised trade frequency (trades per month) from the actual run
    months = (bal.index[-1] - bal.index[0]).total_seconds() / (365.25 * 24 * 3600) * 12
    tpm    = (len(returns) / months) if months > 0 else 0

    wins   = sum(1 for r in returns if r > 0)
    losses = sum(1 for r in returns if r < 0)
    avg_win  = sum(r for r in returns if r > 0) / wins   if wins   else 0
    avg_loss = sum(r for r in returns if r < 0) / losses if losses else 0

    return {
        "returns":          [round(float(r), 8) for r in returns],
        "n_trades":         len(returns),
        "trades_per_month": float(tpm),
        "wins":             int(wins),
        "losses":           int(losses),
        "win_rate":         (wins / len(returns) * 100) if returns else 0,
        "avg_win_pct":      avg_win * 100,
        "avg_loss_pct":     avg_loss * 100,
        "avg_rr":           (avg_win / abs(avg_loss)) if avg_loss != 0 else 0,
        "best_trade_pct":   max(returns) * 100 if returns else 0,
        "worst_trade_pct":  min(returns) * 100 if returns else 0,
        "period_months":    float(months),
    }


def monte_carlo(eq: pd.DataFrame, n_sims: int = 1000, seed: int = 42) -> dict:
    """Bootstrap simulation of the strategy.

    Extracts each closed-trade P&L from balance.diff(), then resamples them
    with replacement N times to build percentile bands of equity & drawdown.

    Returns:
      x:        trade indices 0..N
      bands:    {p5, p25, p50, p75, p95} equity envelopes  (length N+1)
      actual:   realized equity path                       (length N+1)
      stats:    summary numbers (probability of profit, percentile finals, etc.)
    """
    bal = eq["balance"].copy().sort_index()
    pnl = bal.diff().dropna()
    pnl = pnl[pnl != 0].values.astype(float)
    n   = len(pnl)
    initial = float(bal.iloc[0])
    realized = bal.values.astype(float)

    if n < 5:
        return {"n_sims": 0, "n_trades": n, "stats": {}, "bands": {}, "actual": [], "x": []}

    rng = np.random.default_rng(seed)
    # Each row = one simulated path of n trades, starting from `initial`.
    draws = rng.choice(pnl, size=(n_sims, n), replace=True)
    paths = np.zeros((n_sims, n + 1), dtype=float)
    paths[:, 0]  = initial
    paths[:, 1:] = initial + np.cumsum(draws, axis=1)

    pcts = {f"p{p}": np.percentile(paths, p, axis=0) for p in (5, 25, 50, 75, 95)}

    # Per-path max drawdown
    peak  = np.maximum.accumulate(paths, axis=1)
    dd    = (paths - peak) / peak
    max_dd = dd.min(axis=1)
    finals = paths[:, -1]

    # Actual realized path on the same x-axis
    realized_path = np.zeros(n + 1)
    realized_path[0]  = initial
    realized_path[1:] = initial + np.cumsum(bal.diff().dropna().loc[bal.diff().dropna() != 0].values)

    # Pre-compute realized max DD for stats
    rp_peak = np.maximum.accumulate(realized_path)
    rp_dd   = (realized_path - rp_peak) / rp_peak

    stats = {
        "n_sims":            int(n_sims),
        "n_trades":          int(n),
        "initial":           initial,
        "actual_final":      float(realized_path[-1]),
        "actual_max_dd":     float(rp_dd.min() * 100),
        "median_final":      float(np.median(finals)),
        "p5_final":          float(np.percentile(finals, 5)),
        "p25_final":         float(np.percentile(finals, 25)),
        "p75_final":         float(np.percentile(finals, 75)),
        "p95_final":         float(np.percentile(finals, 95)),
        "median_max_dd":     float(np.median(max_dd) * 100),
        "worst5_max_dd":     float(np.percentile(max_dd, 5) * 100),   # 5th pct = worst 5%
        "prob_profit":       float((finals > initial).mean() * 100),
        "prob_2x":           float((finals >= 2 * initial).mean() * 100),
        "prob_dd_gt_20":     float((max_dd <= -0.20).mean() * 100),
        "prob_dd_gt_30":     float((max_dd <= -0.30).mean() * 100),
    }

    return {
        "x":      list(range(n + 1)),
        "bands":  {k: [round(float(v), 2) for v in arr] for k, arr in pcts.items()},
        "actual": [round(float(v), 2) for v in realized_path],
        "stats":  stats,
    }


def gold_dependence(strat: pd.Series, gold: pd.Series) -> dict:
    """Measure how much of the strategy's return is explained by gold's return.
    Compute at three horizons: daily / weekly / monthly. The longer horizons
    are more meaningful here because the strategy's balance only changes on
    trade-close (sparse daily). Primary number = monthly."""
    horizons = {
        "daily":   ("1D", 252),
        "weekly":  ("1W", 52),
        "monthly": ("1ME", 12),
    }
    out = {}
    for name, (rule, ppy) in horizons.items():
        s = strat.resample(rule).last().pct_change().dropna()
        g = gold.resample(rule).last().pct_change().dropna()
        out[name] = _regress(s, g, ppy)
    # Backwards-compat fields default to MONTHLY (best signal)
    m = out["monthly"]
    out.update({
        "r_squared":    m["r_squared"],
        "correlation":  m["correlation"],
        "beta":         m["beta"],
        "alpha_annual": m["alpha_annual"],
        "n":            m["n"],
    })
    return out


def metrics(curve: pd.Series) -> dict:
    """Compute summary stats for a normalised equity curve indexed by datetime."""
    first, last = curve.iloc[0], curve.iloc[-1]
    years = (curve.index[-1] - curve.index[0]).total_seconds() / (365.25 * 24 * 3600)
    c     = cagr(first, last, years)
    dd, _ = max_drawdown(curve)
    total_ret = (last - first) / first
    calmar    = c / abs(dd) if dd < 0 else 0.0

    # annualised volatility (use daily resample for stability)
    daily = curve.resample("1D").last().dropna()
    ret   = daily.pct_change().dropna()
    vol   = ret.std() * math.sqrt(252) if len(ret) > 5 else 0.0
    sharpe = (ret.mean() * 252) / (ret.std() * math.sqrt(252)) if ret.std() > 0 else 0.0

    return {
        "total_return": total_ret * 100,
        "cagr":         c * 100,
        "max_drawdown": dd * 100,
        "calmar":       calmar,
        "volatility":   vol * 100,
        "sharpe":       sharpe,
        "years":        years,
    }


def monthly_returns(curve: pd.Series) -> dict:
    """Return YoY monthly % returns as nested dict {year: {month: pct}}."""
    monthly = curve.resample("ME").last().pct_change().dropna() * 100
    out: dict[int, dict[int, float]] = {}
    for ts, val in monthly.items():
        out.setdefault(ts.year, {})[ts.month] = float(val)
    return out


# ── Build the unified payload ────────────────────────────────────────────────
def build_payload() -> dict:
    eq    = load_equity()
    gold  = load_gold()
    stats = load_report_stats()

    # Strategy: use balance for clean closed-trade curve
    strat = eq["balance"].copy()
    strat.index = strat.index.tz_convert("UTC")

    # Resample to daily for chart sanity (1036 → ~2100 days)
    strat_d = strat.resample("1D").last().ffill()
    gold_d  = gold["Close"].resample("1D").last().ffill()

    # Full-period strategy view
    strat_norm_full = strat_d / strat_d.iloc[0] * 100

    # Aligned period (where both datasets overlap)
    overlap_start = max(strat_d.index[0], gold_d.index[0])
    overlap_end   = min(strat_d.index[-1], gold_d.index[-1])

    strat_aligned = strat_d.loc[overlap_start:overlap_end]
    gold_aligned  = gold_d.loc[overlap_start:overlap_end]

    strat_norm = strat_aligned / strat_aligned.iloc[0] * 100
    gold_norm  = gold_aligned  / gold_aligned.iloc[0]  * 100

    # Metrics
    m_strat_full    = metrics(strat_d)
    m_strat_aligned = metrics(strat_aligned)
    m_gold_aligned  = metrics(gold_aligned)

    # Use the MT5-reported "Equity Drawdown Relative" as the canonical max DD
    # for the strategy (the report records tick-level equity peaks; our
    # daily-resampled balance series under-counts intra-day drawdown).
    mt5_dd = stats.get("equity_dd_rel_pct")
    if mt5_dd:
        m_strat_full["max_drawdown"]    = -mt5_dd
        m_strat_aligned["max_drawdown"] = -mt5_dd
        # Recompute Calmar with the MT5 DD so the ratio stays consistent
        if m_strat_full["cagr"] != 0:
            m_strat_full["calmar"]    = m_strat_full["cagr"] / mt5_dd
        if m_strat_aligned["cagr"] != 0:
            m_strat_aligned["calmar"] = m_strat_aligned["cagr"] / mt5_dd
    dependence      = gold_dependence(strat_aligned, gold_aligned)
    trade_returns   = extract_trade_returns(eq)

    # Drawdown series for chart (aligned + full)
    _, dd_strat      = max_drawdown(strat_aligned)
    _, dd_gold       = max_drawdown(gold_aligned)
    _, dd_strat_full = max_drawdown(strat_d)

    # Equity vs Balance for the EA report (the inner consistency view)
    eq_balance = eq["balance"].resample("1D").last().ffill()
    eq_equity  = eq["equity"].resample("1D").last().ffill()

    def to_series(s: pd.Series) -> list:
        return [{"x": d.strftime("%Y-%m-%d"), "y": round(float(v), 4)}
                for d, v in s.items() if not pd.isna(v)]

    payload = {
        "report":        stats,
        "period": {
            "start": strat_d.index[0].strftime("%Y-%m-%d"),
            "end":   strat_d.index[-1].strftime("%Y-%m-%d"),
            "aligned_start": overlap_start.strftime("%Y-%m-%d"),
            "aligned_end":   overlap_end.strftime("%Y-%m-%d"),
            "years_full":    round(m_strat_full["years"], 2),
            "years_aligned": round(m_strat_aligned["years"], 2),
        },
        "strategy_full": {
            "curve":   to_series(strat_norm_full),
            "balance": to_series(eq_balance),
            "equity":  to_series(eq_equity),
            "metrics": m_strat_full,
            "dd":      to_series(dd_strat_full * 100),
        },
        "aligned": {
            "strategy_norm":  to_series(strat_norm),
            "gold_norm":      to_series(gold_norm),
            "strategy_raw":   to_series(strat_aligned),    # equity in $
            "gold_price":     to_series(gold_aligned),     # XAUUSD close
            "dd_strategy":    to_series(dd_strat * 100),
            "dd_gold":        to_series(dd_gold * 100),
            "metrics_strategy": m_strat_aligned,
            "metrics_gold":     m_gold_aligned,
            "gold_dependence":  dependence,
        },
        "monthly_returns": monthly_returns(strat_d),
        "trade_returns":   trade_returns,
    }
    return payload


# ── Routes ───────────────────────────────────────────────────────────────────
_cache: dict | None = None

def get_payload() -> dict:
    global _cache
    if _cache is None:
        _cache = clean_json(build_payload())
    return _cache


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/data")
def api_data():
    return jsonify(get_payload())


@app.route("/api/refresh")
def api_refresh():
    global _cache
    _cache = None
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    # warm cache on startup so first request is fast
    get_payload()
    print("Dashboard ready at http://127.0.0.1:5000")
    app.run(debug=False, host="127.0.0.1", port=5000)
