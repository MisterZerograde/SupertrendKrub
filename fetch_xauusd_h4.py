"""
Fetch XAUUSD H4 OHLCV data directly from TradingView WebSocket feed.
Paginates back to a target start date using `request_more_data`.

Install: pip install websocket-client pandas
"""

import json
import random
import re
import string
import threading
from pathlib import Path

import pandas as pd
import websocket

# ── TradingView WebSocket constants ─────────────────────────────────────────
TV_WS_URL  = "wss://data.tradingview.com/socket.io/websocket"
TV_HEADERS = {
    "Origin":     "https://www.tradingview.com",
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
}

# Symbols ranked by depth of available history on TradingView.
# Note: anonymous access caps H4 at ~Jan 2023, but Daily reaches back to 2006-2007.
SYMBOL_CANDIDATES = ["VANTAGE:XAUUSD", "OANDA:XAUUSD", "FX_IDC:XAUUSD"]
TARGET_START = "2020-08-01"   # match the EA backtest start
BATCH_SIZE   = 5000           # bars per request
MAX_BATCHES  = 8              # safety stop

# Two outputs:
#   XAUUSD_D_TradingView.csv  — Daily, covers full 2020 → today (used by dashboard)
#   XAUUSD_H4_TradingView.csv — H4,    covers ~2023 → today  (kept for hi-res views)
_DATA_DIR = Path(__file__).parent / "data"
JOBS = [
    ("D",    _DATA_DIR / "XAUUSD_D_TradingView.csv"),
    ("240",  _DATA_DIR / "XAUUSD_H4_TradingView.csv"),
]


# ── Protocol helpers ─────────────────────────────────────────────────────────
def _wrap(msg: str) -> str:
    return f"~m~{len(msg)}~m~{msg}"

def _pkt(method: str, params: list) -> str:
    return _wrap(json.dumps({"m": method, "p": params}))

def _rand_session(prefix: str = "cs") -> str:
    return prefix + "_" + "".join(random.choices(string.ascii_lowercase + string.digits, k=12))


# ── Fetcher ──────────────────────────────────────────────────────────────────
class TVFetcher:
    def __init__(self, symbol: str, resolution: str,
                 target_start: str, batch_size: int = 5000, max_batches: int = 8):
        self.symbol       = symbol
        self.resolution   = resolution
        self.target_start = pd.Timestamp(target_start, tz="UTC")
        self.batch_size   = batch_size
        self.max_batches  = max_batches

        self.chart_sess = _rand_session("cs")
        self.bars: list[dict] = []
        self._prev_count = 0
        self._batches    = 0
        self._done       = threading.Event()
        self._error      = None

    # -- callbacks -----------------------------------------------------------
    def _on_open(self, ws):
        ws.send(_pkt("set_auth_token", ["unauthorized_user_token"]))
        ws.send(_pkt("chart_create_session", [self.chart_sess, ""]))
        sym_json = json.dumps({"symbol": self.symbol, "adjustment": "splits"})
        ws.send(_pkt("resolve_symbol", [self.chart_sess, "sym_1", f"={sym_json}"]))
        ws.send(_pkt("create_series",
                     [self.chart_sess, "s1", "s1", "sym_1",
                      self.resolution, self.batch_size]))

    def _on_message(self, ws, raw):
        if "~h~" in raw:
            ws.send(_wrap(re.search(r"~h~\d+", raw).group()))
            return

        for chunk in re.findall(r"~m~\d+~m~(\{.*?\})(?=~m~|$)", raw, re.DOTALL):
            try:
                msg = json.loads(chunk)
            except json.JSONDecodeError:
                continue

            m = msg.get("m", "")

            if m == "timescale_update":
                series = msg["p"][1].get("s1", {})
                for bar in series.get("s", []):
                    v = bar["v"]   # [time, open, high, low, close, volume]
                    self.bars.append({
                        "datetime": pd.to_datetime(v[0], unit="s", utc=True),
                        "Open":     v[1],
                        "High":     v[2],
                        "Low":      v[3],
                        "Close":    v[4],
                        "Volume":   v[5] if len(v) > 5 else 0,
                    })

            elif m == "series_completed":
                self._batches += 1
                if not self.bars:
                    print(f"    [{self.symbol}] empty series — likely no permission")
                    self._error = "no data"
                    self._done.set(); ws.close(); return

                oldest = min(b["datetime"] for b in self.bars)
                progress = len(self.bars) - self._prev_count
                print(f"    [{self.symbol}] batch {self._batches}: {len(self.bars):>5} bars  oldest={oldest.date()}  (+{progress})")

                if oldest <= self.target_start:
                    print(f"    [{self.symbol}] reached target {self.target_start.date()}")
                    self._done.set(); ws.close(); return
                if progress == 0:
                    print(f"    [{self.symbol}] no more history available (stopped at {oldest.date()})")
                    self._done.set(); ws.close(); return
                if self._batches >= self.max_batches:
                    print(f"    [{self.symbol}] hit MAX_BATCHES={self.max_batches}")
                    self._done.set(); ws.close(); return

                # Ask for another window of older bars.
                self._prev_count = len(self.bars)
                ws.send(_pkt("request_more_data",
                             [self.chart_sess, "s1", self.batch_size]))

            elif m == "series_error" or m == "critical_error":
                self._error = msg.get("p")
                self._done.set(); ws.close()

    def _on_error(self, ws, err):
        self._error = str(err); self._done.set()

    def _on_close(self, ws, code, msg):
        self._done.set()

    # -- public --------------------------------------------------------------
    def fetch(self, timeout: int = 90) -> pd.DataFrame:
        ws = websocket.WebSocketApp(
            TV_WS_URL,
            header=[f"{k}: {v}" for k, v in TV_HEADERS.items()],
            on_open=self._on_open,
            on_message=self._on_message,
            on_error=self._on_error,
            on_close=self._on_close,
        )
        t = threading.Thread(target=ws.run_forever, kwargs={"ping_interval": 20})
        t.daemon = True
        t.start()
        self._done.wait(timeout=timeout)

        if not self.bars:
            raise RuntimeError(f"No bars received for {self.symbol}: {self._error}")

        df = (pd.DataFrame(self.bars)
                .set_index("datetime")
                .sort_index())
        df = df[~df.index.duplicated(keep="first")]
        return df


# ── Main ─────────────────────────────────────────────────────────────────────
def fetch_with_fallback(resolution: str, must_reach_target: bool):
    """Try each candidate symbol; return the first one whose history is long enough."""
    target = pd.Timestamp(TARGET_START, tz="UTC")
    best   = None  # (sym, df) — fallback if no candidate reaches target

    for sym in SYMBOL_CANDIDATES:
        print(f"\n--- {sym}  [{resolution}] ---")
        try:
            f = TVFetcher(sym, resolution, TARGET_START, BATCH_SIZE, MAX_BATCHES)
            df = f.fetch(timeout=120)
        except Exception as e:
            print(f"  failed: {e}")
            continue

        reached = df.index[0] <= target + pd.Timedelta(days=14)
        print(f"  oldest={df.index[0].date()}  bars={len(df)}  reached={reached}")

        if reached:
            return sym, df
        if best is None or df.index[0] < best[1].index[0]:
            best = (sym, df)

    if must_reach_target or best is None:
        raise RuntimeError(f"No source has {resolution} history reaching {TARGET_START}.")
    print(f"  -> using deepest available: {best[0]} from {best[1].index[0].date()}")
    return best


if __name__ == "__main__":
    print(f"Target start: {TARGET_START}  batch={BATCH_SIZE}")
    for resolution, out in JOBS:
        print(f"\n############  RESOLUTION = {resolution}  ############")
        # Daily must reach the target; H4 falls back to whatever depth we can get
        must_reach = (resolution == "D")
        sym, df = fetch_with_fallback(resolution, must_reach_target=must_reach)
        df.to_csv(out)
        print(f"\nOK Saved {len(df)} bars from {sym}  ({df.index[0].date()} to {df.index[-1].date()})  to  {out}")
