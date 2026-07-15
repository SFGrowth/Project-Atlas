# Changelog — Atlas Unified Portfolio Pine Script

All notable changes to `atlas_portfolio_v1.pine` will be documented here.

Format: `[version] YYYY-MM-DD — Description`

---

## [1.0.0] 2026-07-15 — Sprint 117 Initial Release

### Added
- Unified portfolio strategy replacing all per-strategy Pine scripts
- ADE-parity scoring for all 6 strategies: A1, A3, SB1, ORB-1, S109-001, B1
- Single-active-strategy rule enforced in Pine (mirrors server-side invariant)
- Confirmed-bar logic (bar[1] values) to prevent repainting
- Full chart visualisation: entry labels, exit labels, trade lines, R/R boxes, blocked markers
- Debug table (top-right) showing all 6 models, eligibility, scores, winner, position state
- Regime background colouring (optional)
- VWAP and EMA9 plots
- Deterministic event IDs for webhook deduplication
- Full JSON webhook payload with strategy_id, score, regime, session, risk details
- Alert conditions for LONG and SHORT entry events
- Session flatten at 15:55 ET
- Strategy manifest embedded in Section 10 comment for drift detection
- Rule hash: `ATLAS-PORT-117-A1-A3-SB1-ORB1-S109-B1-2026-07-15`

### Strategies included
- A1: TRENDING + RTH, score = ADX
- A3: TRENDING + RTH, score = ADX × 0.95
- SB1: TRENDING + AM_MID + RAS proxy, score = 50.0
- ORB-1: VOLATILE + AM_OPEN + RTH, score = 45.0
- S109-001: RTH + VWAP deviation + OV inventory + RSI, score = |VWAP_dev|/ATR×100
- B1: RTH baseline fallback, score = 1.0

### Known limitations
- SB1 RAS uses ADX > 30 proxy (not full 9-component RAS from M-16)
- OV inventory uses EMA9 slope proxy (not direct overnight inventory feed)
- Parity status: PENDING_VALIDATION

---

## Future versions

When any of the following change, create a new version entry:
- Strategy rule change
- ADE scoring threshold change
- New strategy added to portfolio
- Strategy suspended or retired
- Stop/target parameter change
- Session restriction change
- Parity gap resolved

Version format: `[MAJOR.MINOR.PATCH]`
- MAJOR: breaking change to strategy selection logic
- MINOR: new strategy added or removed
- PATCH: bug fix, visualisation change, documentation update
