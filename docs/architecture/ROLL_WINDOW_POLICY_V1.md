# MNQ Roll-Window Policy — Version 1.0

**Effective:** Sprint 123A.7  
**Status:** ACTIVE  
**Policy ID:** RWP-001  
**Approved by:** Phil (Sprint 123A.7 authorisation)

---

## Background

Sprint 123A.6 Gate G6A evidence found materially negative performance within ±3 trading days of quarterly MNQ contract rolls. The roll-window analysis detected:

- Roll-inclusive ORB-1 expectancy: +5.91 pts/trade
- Roll-excluded ORB-1 expectancy: +12.89 pts/trade
- Roll-window-only ORB-1 expectancy: −13.74 pts/trade
- Roll windows represent approximately 4.8% of trading days

This policy formalises the treatment of roll windows across all Atlas research and monitoring.

---

## 1. MNQ Quarterly Roll Calendar

MNQ rolls occur on the third Friday of March, June, September, and December. The roll window is defined as ±3 trading days around each roll date.

| Quarter | Roll Month | Approximate Roll Date | Window Start | Window End |
|---------|-----------|----------------------|-------------|-----------|
| Q1 | March | 3rd Friday of March | −3 trading days | +3 trading days |
| Q2 | June | 3rd Friday of June | −3 trading days | +3 trading days |
| Q3 | September | 3rd Friday of September | −3 trading days | +3 trading days |
| Q4 | December | 3rd Friday of December | −3 trading days | +3 trading days |

**Known roll dates in the Databento dataset (2024-01-01 to 2026-07-21):**

| Roll | Date | Window |
|------|------|--------|
| Mar 2024 | 2024-03-15 | 2024-03-11 to 2024-03-19 |
| Jun 2024 | 2024-06-21 | 2024-06-17 to 2024-06-25 |
| Sep 2024 | 2024-09-20 | 2024-09-16 to 2024-09-24 |
| Dec 2024 | 2024-12-20 | 2024-12-16 to 2024-12-24 |
| Mar 2025 | 2025-03-21 | 2025-03-17 to 2025-03-25 |
| Jun 2025 | 2025-06-20 | 2025-06-16 to 2025-06-24 |
| Sep 2025 | 2025-09-19 | 2025-09-15 to 2025-09-23 |
| Dec 2025 | 2025-12-19 | 2025-12-15 to 2025-12-23 |
| Mar 2026 | 2026-03-20 | 2026-03-16 to 2026-03-24 |
| Jun 2026 | 2026-06-20 | 2026-06-16 to 2026-06-24 |

---

## 2. Roll-Window Flags

Every bar in the canonical datasets must carry a `is_roll_window` boolean flag.

**Flag definition:**
```python
def is_roll_window(date: date, roll_dates: list[date], window_days: int = 3) -> bool:
    for roll_date in roll_dates:
        delta = abs((date - roll_date).days)
        if delta <= window_days:
            return True
    return False
```

**Flag must be applied to:**
- All canonical datasets (1m, 5m, 15m, 30m)
- All backtest trade records
- All DARWIN observation records
- All strategy monitoring records

---

## 3. Contract Mixing Prevention

The Databento `MNQ.v.0` continuous contract uses front-month rollover. Within the roll window, the continuous series may contain bars from two different contracts (expiring and new front month).

**Required:**
- Every bar must carry the raw contract identifier (e.g., `MNQM4`, `MNQU4`)
- Bars from different contracts within the same session must not be combined in any single trade calculation
- Price jumps > 2% between consecutive bars must be flagged as potential roll boundaries
- Roll-boundary bars must be excluded from momentum and trend calculations that span the boundary

**Detected roll boundaries in the canonical dataset (from Sprint 123A.6):**
- 7 price jumps > 2% detected — all confirmed as roll boundaries
- 0 false positives

---

## 4. Primary vs Secondary Research Results

**Primary result (roll-excluded):** All strategy research results must default to roll-excluded statistics. Roll-excluded means all trades where the entry bar falls within a roll window are removed from the result set.

**Secondary result (roll-inclusive):** The full dataset result is retained as secondary evidence for reference only.

**Exception:** A strategy explicitly designed to trade roll behaviour (e.g., a roll-fade strategy) may use roll-inclusive results as its primary result, but must document this explicitly.

---

## 5. Quarantined Datasets

The following datasets are quarantined pending correction of roll-boundary quality issues:

| Dataset | Status | Issue | Resolution Required |
|---------|--------|-------|-------------------|
| 3-minute canonical | **QUARANTINED** | Roll-boundary quality: FAIL (detected in Sprint 123A.6) | Re-ingest with explicit contract-boundary exclusion |
| 60-minute canonical | **QUARANTINED** | Roll-boundary quality: FAIL (detected in Sprint 123A.6) | Re-ingest with explicit contract-boundary exclusion |

**Quarantine rules:**
- Quarantined datasets may not be used as research inputs
- Quarantined datasets may not be used in strategy backtests
- Quarantined datasets may not be used in DARWIN experiments
- The quarantine status must be displayed on the DARWIN dashboard
- Quarantine may only be lifted by a documented correction and re-validation

**Approved datasets for research:**
- 1-minute canonical: **APPROVED** (quality PASS)
- 5-minute canonical: **APPROVED** (quality PASS)
- 15-minute canonical: **APPROVED** (quality PASS, roll flags applied)
- 30-minute canonical: **APPROVED** (quality PASS, roll flags applied)

---

## 6. Roll-Jump Signal Prevention

Roll-boundary price jumps must not generate false strategy signals.

**Required filters:**
- Any bar where `abs(close - prev_close) / prev_close > 0.02` AND the bar falls within a roll window must be flagged as `is_roll_jump = True`
- Strategies must not enter on a `is_roll_jump` bar
- Momentum indicators (EMA slope, ADX, DMI) must be reset or excluded for bars within ±1 bar of a roll jump

---

## 7. Roll-Window Policy Implementation

The policy is implemented in:

- `services/databento-historical/roll_window_policy.py` — canonical roll date registry and flagging functions
- `services/darwin-research/roll_window_filter.py` — research-time filtering
- `server/market-data/roll-window-service.ts` — live bar flagging
- All backtest runners must import and apply `roll_window_policy.py`

---

## 8. Policy Version History

| Version | Date | Author | Change |
|---------|------|--------|--------|
| 1.0 | 2026-07-23 | Atlas Nexus / Sprint 123A.7 | Initial policy — quarantine 3m/60m, roll-excluded as primary |
