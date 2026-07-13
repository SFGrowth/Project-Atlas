# Sprint 095A — AES-001 Context Recovery

## Critical Prior Findings

### Sprint 032 — Overnight Inventory (RC-003 PRIOR VALIDATION — FAILED)
- **File:** `research/atlas-sprint-032-overnight-inventory-validation.md`
- **Result: REJECTED** — Directional agreement rate 49.6% (essentially coin flip)
- Pearson r = 0.1408 (extremely weak)
- Year-over-year: 2024 r=-0.2005 (INVERSE), 2025 r=0.2039, 2026 r=0.1826
- Only works in Q4 (highest volatility): 58% agreement
- Net edge: $8.56/trade but Cohen's d = 0.0903 (negligible)
- **CONCLUSION: RC-003 Overnight Inventory was already tested in Sprint 032 and REJECTED**

### Regime Engine v1.0 FROZEN Parameters (Pine Script)
- `fastAtrLen = 5`, `slowAtrLen = 20`
- `compressThresh = 0.7` (ATR ratio ≤ 0.7 = COMPRESSED/RANGE)
- `expandThresh = 1.1` (ATR ratio ≥ 1.1 = EXPANDED/TREND)
- `vwapThresh = 1.5` (VWAP deviation ≤ 1.5 ATR = good location)
- Tradeability: +50 for Compression, +25 for Expansion, +25 for Good Location
- Labels: "Compression" / "Expansion" / "Neutral"

### Sprint 094B Regime Classifier (Python)
- Uses rolling 20-bar window
- VOLATILE: ATR ratio > 1.5
- TREND: ATR ratio > 1.1 AND directional movement
- RANGE: everything else
- Result: 88.2% RANGE, 10.1% TREND, 1.8% VOLATILE
- ORB-1 eligible (TREND+VOLATILE): only 7 days

### Key Repository Files
- `atlas-observer/Atlas_Regime_Engine_v1_0_FROZEN.pine` — frozen regime engine
- `research/atlas-sprint-032-overnight-inventory-validation.md` — RC-003 prior REJECTION
- `research/atlas-model-a1-specification.md` — A1 model spec
- `research/sprint-061-model-b1-report.md` — B1 model report
- `research/orb-reclaim/rc-001/RC-001-v3-CERTIFIED-Report.md` — ORB-1 certified
- `research/darwin/sprint-094b/` — Sprint 094B outputs

### Critical Issue: RC-003 Already Validated and REJECTED
Sprint 032 already ran a full overnight inventory validation on real MNQ data.
The 93.3% "win rate" from Sprint 094B was a directional alignment count, not a trading win rate.
The actual trading win rate is ~50% (coin flip) with negligible effect size.
This must be clearly communicated in the Sprint 095A report.

### RC-002 Note
Sprint 094B estimated 45.5% win rate for Mean Reversion — this is below the Atlas minimum threshold.
Need to test whether a proper entry trigger (not just gap detection) improves this.

### Regime Classifier Issue
The Python classifier in sprint094b_replay.py uses different thresholds than the Pine Script engine.
The Pine Script uses ATR ratio (fast/slow ATR), not ADX.
The Python script needs to match the Pine Script logic exactly for valid comparison.
