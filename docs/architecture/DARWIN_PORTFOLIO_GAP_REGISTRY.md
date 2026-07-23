# DARWIN Portfolio Gap Registry

**Document type:** Persistent Registry  
**Version:** 1.0  
**Effective from:** Sprint 123A.6 / Gate G6A  
**Parent doctrine:** `ATLAS_AUTONOMOUS_QUANTITATIVE_RESEARCH_MISSION.md`  
**Status:** ACTIVE — seeded with 7 gaps from Sprint 123A.6 historical analysis

---

## 1. Purpose

This registry records every identified gap in the current strategy portfolio. DARWIN must use this registry to guide future research priorities. DARWIN must not search randomly without recording the portfolio problem being addressed.

Each gap entry documents what the portfolio cannot currently capture, why it matters, and what experiments are planned to address it.

---

## 2. Gap Registry

### GAP-001 — London Session Coverage

| Field | Value |
|-------|-------|
| **Gap ID** | GAP-001 |
| **Market** | MNQ |
| **Timeframe** | 5m |
| **Session** | London (07:00–12:00 UTC) |
| **Regime** | All |
| **Event type** | Session open, European economic data |
| **Structural behaviour** | Unknown — no strategy currently targets London session |
| **Existing coverage** | None |
| **Confidence gap is real** | HIGH — confirmed by regime coverage analysis in Sprint 123A.6 |
| **Evidence source** | `SPRINT_123A6_GATE_G6A_DARWIN_LEARNING_SHADOW_EVIDENCE.md` Field 31 |
| **Priority** | HIGH |
| **Candidate experiments** | Session-open momentum (London), European data fade, London-NY overlap breakout |
| **Status** | OPEN |
| **Last reviewed** | 2026-07-22 |

---

### GAP-002 — Asia Session Coverage

| Field | Value |
|-------|-------|
| **Gap ID** | GAP-002 |
| **Market** | MNQ |
| **Timeframe** | 5m |
| **Session** | Asia (22:00–07:00 UTC) |
| **Regime** | All |
| **Event type** | Asia session open, overnight range formation |
| **Structural behaviour** | Unknown — no strategy currently targets Asia session |
| **Existing coverage** | None |
| **Confidence gap is real** | HIGH — confirmed by regime coverage analysis in Sprint 123A.6 |
| **Evidence source** | `SPRINT_123A6_GATE_G6A_DARWIN_LEARNING_SHADOW_EVIDENCE.md` Field 31 |
| **Priority** | MEDIUM |
| **Candidate experiments** | Overnight range breakout, Asia session fade, overnight gap fill |
| **Status** | OPEN |
| **Last reviewed** | 2026-07-22 |

---

### GAP-003 — High-Chop Regime Coverage

| Field | Value |
|-------|-------|
| **Gap ID** | GAP-003 |
| **Market** | MNQ |
| **Timeframe** | 5m |
| **Session** | All |
| **Regime** | CHOP (ADX < 20) |
| **Event type** | Low-volatility consolidation |
| **Structural behaviour** | CHOP_IS_NOISE confirmed — EMA15 crosses in ADX<20 have no edge (n=6,624, p=0.818, d=-0.003) |
| **Existing coverage** | None — and DARWIN has confirmed no simple edge exists |
| **Confidence gap is real** | HIGH — but CHOP_IS_NOISE means this gap may be structurally unfillable |
| **Evidence source** | DARWIN Experiment D, Sprint 123A.6 |
| **Priority** | LOW (pending further investigation) |
| **Candidate experiments** | Mean-reversion in tight chop, volatility-breakout from chop, chop-end detection |
| **Status** | OPEN — under investigation |
| **Last reviewed** | 2026-07-22 |

---

### GAP-004 — News Event Strategy Coverage

| Field | Value |
|-------|-------|
| **Gap ID** | GAP-004 |
| **Market** | MNQ |
| **Timeframe** | 1m, 5m |
| **Session** | NY (primarily) |
| **Regime** | All |
| **Event type** | FOMC, CPI, NFP, GDP, Fed speakers |
| **Structural behaviour** | Unknown — no strategy currently handles news event volatility |
| **Existing coverage** | None — existing strategies may be harmed by news events |
| **Confidence gap is real** | HIGH — news events produce large, rapid moves not captured by any current strategy |
| **Evidence source** | General market knowledge; no specific Sprint 123A.6 experiment |
| **Priority** | MEDIUM |
| **Candidate experiments** | Pre-news fade, post-news momentum, news-event avoidance filter for existing strategies |
| **Status** | OPEN |
| **Last reviewed** | 2026-07-22 |

---

### GAP-005 — One-Minute Intrabar Behaviour

| Field | Value |
|-------|-------|
| **Gap ID** | GAP-005 |
| **Market** | MNQ |
| **Timeframe** | 1m |
| **Session** | All |
| **Regime** | All |
| **Event type** | Intrabar price action |
| **Structural behaviour** | Unknown — all current strategies operate on 5m bars; 1m behaviour is unanalysed |
| **Existing coverage** | None |
| **Confidence gap is real** | MEDIUM — 1m data is available (874,405 bars) but unexplored |
| **Evidence source** | Sprint 123A.6 canonical dataset |
| **Priority** | MEDIUM |
| **Candidate experiments** | 1m ORB, 1m VWAP reclaim, 1m opening spike fade |
| **Status** | OPEN |
| **Last reviewed** | 2026-07-22 |

---

### GAP-006 — Contract Roll Regime Behaviour

| Field | Value |
|-------|-------|
| **Gap ID** | GAP-006 |
| **Market** | MNQ |
| **Timeframe** | 5m |
| **Session** | All |
| **Regime** | Roll transition |
| **Event type** | Quarterly contract roll (March, June, September, December) |
| **Structural behaviour** | Unknown — roll transitions produce price gaps and volume shifts; current strategies are not roll-aware |
| **Existing coverage** | None — roll windows are currently excluded from backtests |
| **Confidence gap is real** | MEDIUM — 7 roll boundaries detected in 2.5 years of data |
| **Evidence source** | Sprint 123A.6 continuous series quality report |
| **Priority** | LOW |
| **Candidate experiments** | Roll-window behaviour analysis, roll-fade strategy, roll-aware strategy filters |
| **Status** | OPEN |
| **Last reviewed** | 2026-07-22 |

---

### GAP-007 — Volatility Regime Specific Opportunities

| Field | Value |
|-------|-------|
| **Gap ID** | GAP-007 |
| **Market** | MNQ |
| **Timeframe** | 5m |
| **Session** | All |
| **Regime** | High-volatility (ATR > 2× 20-day average) |
| **Event type** | Volatility expansion |
| **Structural behaviour** | Unknown — current strategies are not conditioned on absolute volatility level; ORB-1 may perform differently in high vs low volatility |
| **Existing coverage** | Partial — ORB-1 has positive OOS edge but is not regime-conditioned |
| **Confidence gap is real** | MEDIUM — ORB-1 OOS decay (Sharpe 3.754 train → 1.581 OOS) may be partially explained by volatility regime |
| **Evidence source** | Sprint 123A.6 ORB-1 backtest results |
| **Priority** | HIGH (linked to ORB-1 regime analysis agenda) |
| **Candidate experiments** | ORB-1 volatility regime filter, high-ATR momentum, low-ATR mean reversion |
| **Status** | OPEN |
| **Last reviewed** | 2026-07-22 |

---

## 3. Gap Summary

| Gap ID | Session | Regime | Priority | Status |
|--------|---------|--------|----------|--------|
| GAP-001 | London | All | HIGH | OPEN |
| GAP-002 | Asia | All | MEDIUM | OPEN |
| GAP-003 | All | CHOP | LOW | OPEN |
| GAP-004 | NY | All | MEDIUM | OPEN |
| GAP-005 | All | All | MEDIUM | OPEN |
| GAP-006 | All | Roll | LOW | OPEN |
| GAP-007 | All | High-vol | HIGH | OPEN |

---

## 4. Usage Rules

1. Every new DARWIN experiment must reference at least one gap ID.
2. Experiments not linked to a gap must document the research question being addressed.
3. DARWIN must not search randomly without recording the portfolio problem being addressed.
4. When a gap is addressed by a validated strategy, the gap status changes to `COVERED`.
5. When a gap is confirmed structurally unfillable (e.g., GAP-003 if chop is confirmed noise), the status changes to `CONFIRMED_UNFILLABLE` with evidence.

---

## 5. Amendment History

| Version | Date | Author | Change |
|---------|------|--------|--------|
| 1.0 | 2026-07-22 | Atlas Nexus (Phil approval) | Initial registry — 7 gaps seeded from Sprint 123A.6 |
