"""
Sprint 041 — Multi-Market Data Acquisition (Direct Ticker Method)
Constructs known quarterly contract tickers directly, bypassing contract list pagination.
Downloads 5-minute OHLCV for NQ, ES, MES, YM, RTY (2024-07-07 to 2026-07-07).
"""
import requests, time, os, pandas as pd

API_KEY  = "rc10e4dZn180fg6frleRWMt25yibEFl5"
BASE_URL = "https://api.massive.com/futures/v1"
OUT_DIR  = "/home/ubuntu/Project-Atlas/data/raw/massive"
HEADERS  = {"Authorization": f"Bearer {API_KEY}"}

START_DATE = "2024-07-07"
END_DATE   = "2026-07-07"

# Quarterly futures expiry codes: H=Mar, M=Jun, U=Sep, Z=Dec
# For 2024-2026 window we need: U4, Z4, H5, M5, U5, Z5, H6, M6, U6
QUARTERLY_CODES = ["U4", "Z4", "H5", "M5", "U5", "Z5", "H6", "M6", "U6"]

# Products: (product_code, point_value, ticker_format)
# ticker_format: 'standard' = NQU4, 'spread' = NQU4-NQZ4 (skip spreads)
PRODUCTS = [
    ("NQ",  20.0),
    ("ES",  50.0),
    ("MES",  5.0),
    ("YM",   5.0),
    ("RTY",  50.0),
    ("MYM",  0.5),   # Micro YM
]

def api_get(url, params=None, retries=6):
    for attempt in range(retries):
        try:
            r = requests.get(url, headers=HEADERS, params=params, timeout=60)
            if r.status_code == 429:
                wait = 20 * (attempt + 1)
                print(f"    Rate limited. Waiting {wait}s...")
                time.sleep(wait)
                continue
            if r.status_code in (404, 400):
                return None
            r.raise_for_status()
            return r.json()
        except Exception as e:
            print(f"    Error: {e}. Retry {attempt+1}/{retries}")
            time.sleep(8)
    return None

def fetch_bars(ticker):
    bars = []
    url = f"{BASE_URL}/aggs/{ticker}"
    params = {
        "resolution": "5min",
        "window_start.gte": f"{START_DATE}T00:00:00Z",
        "window_start.lte": f"{END_DATE}T23:59:59Z",
        "limit": 50000,
        "sort": "window_start.asc"
    }
    page = 0
    while url:
        d = api_get(url, params)
        if d is None:
            break
        results = d.get("results", [])
        bars.extend(results)
        page += 1
        url = d.get("next_url")
        params = {}
        time.sleep(0.5)
    return bars

def bars_to_df(bars, ticker, product_code):
    if not bars:
        return pd.DataFrame()
    rows = []
    for b in bars:
        ts_ns = b.get("window_start")
        if ts_ns is None:
            continue
        ts_utc = pd.Timestamp(ts_ns, unit='ns', tz='UTC')
        ts_et  = ts_utc.tz_convert('America/New_York')
        rows.append({
            "timestamp":     ts_ns,
            "timestamp_utc": str(ts_utc),
            "timestamp_et":  str(ts_et),
            "open":          b.get("open"),
            "high":          b.get("high"),
            "low":           b.get("low"),
            "close":         b.get("close"),
            "volume":        b.get("volume", 0),
            "dollar_volume": b.get("dollar_volume", 0),
            "transactions":  b.get("transactions", 0),
            "symbol":        product_code,
            "contract":      ticker,
            "source":        "Massive/Polygon"
        })
    return pd.DataFrame(rows).sort_values("timestamp").reset_index(drop=True)

def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    summary = []

    for product_code, point_val in PRODUCTS:
        print(f"\n{'='*60}")
        print(f"Downloading {product_code} (point value: ${point_val})")
        out_path = os.path.join(OUT_DIR, f"{product_code}_5min_full.csv")

        if os.path.exists(out_path):
            existing = pd.read_csv(out_path)
            print(f"  Already exists: {len(existing)} rows. Skipping.")
            summary.append({"product": product_code, "rows": len(existing), "status": "existing"})
            continue

        all_dfs = []
        for code in QUARTERLY_CODES:
            ticker = f"{product_code}{code}"
            print(f"  Fetching {ticker}...", end=" ", flush=True)
            bars = fetch_bars(ticker)
            if bars:
                df = bars_to_df(bars, ticker, product_code)
                if not df.empty:
                    all_dfs.append(df)
                    print(f"{len(df)} bars")
                else:
                    print("0 bars (empty)")
            else:
                print("not found")
            time.sleep(1.0)

        if not all_dfs:
            print(f"  WARNING: No data found for {product_code}")
            summary.append({"product": product_code, "rows": 0, "status": "no_data"})
            continue

        combined = pd.concat(all_dfs, ignore_index=True)
        combined = combined.sort_values(["timestamp", "volume"], ascending=[True, False])
        combined = combined.drop_duplicates(subset=["timestamp"], keep="first")
        combined = combined.sort_values("timestamp").reset_index(drop=True)
        combined.to_csv(out_path, index=False)
        print(f"  Saved: {len(combined)} rows -> {out_path}")
        summary.append({"product": product_code, "rows": len(combined), "status": "downloaded"})

    print(f"\n{'='*60}")
    print("ACQUISITION SUMMARY")
    for s in summary:
        print(f"  {s['product']:<6} {s['rows']:>8} rows  [{s['status']}]")

if __name__ == "__main__":
    main()
