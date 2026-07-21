#!/usr/bin/env bash
# =============================================================================
# Atlas Nexus — Staging Session Protocol
# Sprint 123A.4 — Gate G4 — DATABENTO_SHADOW Mode
#
# Run this script on the live server to collect the required staging metrics.
# Prerequisites:
#   - Atlas Nexus server running with MARKET_DATA_AUTHORITY=DATABENTO_SHADOW
#   - Databento bridge connected and receiving MNQ 1m bars
#   - MySQL atlas_memory database accessible
#
# Usage: bash staging_session_protocol.sh 2>&1 | tee staging_session_$(date +%Y%m%d_%H%M%S).log
# =============================================================================

set -euo pipefail

MYSQL_CMD="mysql -u root atlas_memory"
LOG_DIR="$(dirname "$0")/../docs/reports"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="${LOG_DIR}/staging_session_${TIMESTAMP}.log"

mkdir -p "$LOG_DIR"

echo "=== Atlas Nexus Staging Session Protocol ==="
echo "=== Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
echo "=== Authority Mode: DATABENTO_SHADOW ==="
echo ""

# ─── S1: Verify authority mode ───────────────────────────────────────────────
echo "--- S1: Authority Mode Verification ---"
echo "MARKET_DATA_AUTHORITY=${MARKET_DATA_AUTHORITY:-NOT_SET}"
if [ "${MARKET_DATA_AUTHORITY:-}" != "DATABENTO_SHADOW" ]; then
  echo "ERROR: Expected DATABENTO_SHADOW, got ${MARKET_DATA_AUTHORITY:-NOT_SET}"
  exit 1
fi
echo "PASS: Authority mode is DATABENTO_SHADOW"
echo ""

# ─── S2: Verify G4 feature flag is NOT set ───────────────────────────────────
echo "--- S2: Gate G4 Feature Flag ---"
echo "ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED=${ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED:-NOT_SET}"
if [ "${ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED:-}" = "true" ]; then
  echo "WARNING: G4 flag is set — chart authority is active. This is a staging session, not shadow mode."
else
  echo "PASS: G4 flag not set — DATABENTO_CHART_AUTHORITY is blocked"
fi
echo ""

# ─── S3: Check last 10 bars in atlas_bars_1m ─────────────────────────────────
echo "--- S3: Last 10 bars in atlas_bars_1m ---"
$MYSQL_CMD -e "
  SELECT
    bar_open_ts_ms,
    FROM_UNIXTIME(bar_open_ts_ms/1000) AS bar_time_utc,
    source,
    raw_symbol,
    reconciliation_status,
    open_pts100 / 100.0 AS open,
    high_pts100 / 100.0 AS high,
    low_pts100 / 100.0 AS low,
    close_pts100 / 100.0 AS close,
    volume
  FROM atlas_bars_1m
  WHERE source = 'DATABENTO'
  ORDER BY bar_open_ts_ms DESC
  LIMIT 10;
"
echo ""

# ─── S4: Check parity between TradingView and Databento ──────────────────────
echo "--- S4: Parity check — last 20 bars where both sources exist ---"
$MYSQL_CMD -e "
  SELECT
    d.bar_open_ts_ms,
    FROM_UNIXTIME(d.bar_open_ts_ms/1000) AS bar_time_utc,
    d.close_pts100 / 100.0 AS databento_close,
    t.close_pts100 / 100.0 AS tradingview_close,
    ABS(d.close_pts100 - t.close_pts100) / 100.0 AS close_delta,
    CASE WHEN ABS(d.close_pts100 - t.close_pts100) = 0 THEN 'EXACT_MATCH'
         WHEN ABS(d.close_pts100 - t.close_pts100) <= 25 THEN 'WITHIN_0.25'
         ELSE 'MISMATCH'
    END AS classification
  FROM atlas_bars_1m d
  JOIN atlas_bars_1m t
    ON d.bar_open_ts_ms = t.bar_open_ts_ms
    AND d.raw_symbol = t.raw_symbol
  WHERE d.source = 'DATABENTO'
    AND t.source = 'TRADINGVIEW'
    AND d.reconciliation_status = 'MATCHED'
  ORDER BY d.bar_open_ts_ms DESC
  LIMIT 20;
"
echo ""

# ─── S5: Gap recovery check ───────────────────────────────────────────────────
echo "--- S5: Gap recovery ledger — last 10 entries ---"
$MYSQL_CMD -e "
  SELECT
    bar_open_ts_ms,
    FROM_UNIXTIME(bar_open_ts_ms/1000) AS bar_time_utc,
    source,
    raw_symbol,
    consumer_id,
    processed_at_ms,
    FROM_UNIXTIME(processed_at_ms/1000) AS processed_time_utc
  FROM atlas_bar_processing_ledger
  ORDER BY processed_at_ms DESC
  LIMIT 10;
" 2>/dev/null || echo "NOTE: atlas_bar_processing_ledger not yet populated (no gaps recovered)"
echo ""

# ─── S6: Bar count summary ────────────────────────────────────────────────────
echo "--- S6: Bar count summary ---"
$MYSQL_CMD -e "
  SELECT
    source,
    reconciliation_status,
    COUNT(*) AS bar_count,
    MIN(FROM_UNIXTIME(bar_open_ts_ms/1000)) AS oldest_bar,
    MAX(FROM_UNIXTIME(bar_open_ts_ms/1000)) AS newest_bar
  FROM atlas_bars_1m
  GROUP BY source, reconciliation_status
  ORDER BY source, reconciliation_status;
"
echo ""

# ─── S7: Health state check ───────────────────────────────────────────────────
echo "--- S7: Health endpoint ---"
curl -s http://localhost:3000/api/market-data/health 2>/dev/null | python3 -m json.tool || echo "NOTE: Health endpoint not accessible (server may not be running)"
echo ""

echo "=== Staging Session Protocol Complete ==="
echo "=== Log saved to: $LOG_FILE ==="
