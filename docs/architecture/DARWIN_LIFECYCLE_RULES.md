# DARWIN Strategy Lifecycle Rules

**Document type:** Architecture Rules  
**Version:** 1.0  
**Effective from:** Sprint 123A.6 / Gate G6A  
**Parent doctrine:** `ATLAS_AUTONOMOUS_QUANTITATIVE_RESEARCH_MISSION.md`  
**Status:** ACTIVE

---

## 1. Purpose

This document defines explicit, versioned rules for every strategy status transition. All transitions are evidence-based, reproducible, auditable, and resistant to overfitting. No transition may occur automatically without Phil's written approval.

---

## 2. Promotion Rules

### 2.1 OBSERVED → HYPOTHESIS

**Trigger:** DARWIN identifies a recurring market behaviour with at least 10 preliminary occurrences.

**Required evidence:**
- Behaviour description without strategy proposal
- Frequency, direction, magnitude, duration
- Regime dependence assessment
- At least three competing explanations

**Authority:** DARWIN (autonomous)

---

### 2.2 HYPOTHESIS → BACKTEST

**Trigger:** Behaviour survives preliminary quantification.

**Required evidence:**
- Minimum 30 occurrences in preliminary dataset
- At least one competing explanation cannot be immediately disproved
- No duplicate of an existing failed research path

**Authority:** DARWIN (autonomous)

---

### 2.3 BACKTEST → OUT_OF_SAMPLE

**Trigger:** Backtest passes statistical gates on training data.

**Required evidence:**
- n ≥ 30 occurrences in training period
- Bonferroni-corrected p-value < 0.05/N (where N = number of simultaneous experiments)
- Cohen's d ≥ 0.20
- Profit factor ≥ 1.3 after costs
- No evidence of overfitting (train/val Sharpe ratio < 2× OOS Sharpe)

**Authority:** DARWIN (autonomous)

---

### 2.4 OUT_OF_SAMPLE → SHADOW

**Trigger:** OOS validation passes all gates.

**Required evidence:**
- OOS period passes same statistical gates as training
- Walk-forward validation: ≥ 3/4 windows positive
- Strategy adds unique portfolio value (correlation < 0.7 with existing strategies)
- Strategy-definition fidelity report confirms implementation matches approved logic

**Authority:** **Phil approval required**

---

### 2.5 SHADOW → ELIGIBLE_FOR_REVIEW

**Trigger:** Shadow period produces sufficient live evidence.

**Required evidence:**
- Minimum 30 live shadow trades
- Live shadow results consistent with historical OOS (within 2 standard deviations)
- No regime failure detected
- No execution assumption violations

**Authority:** **Phil approval required**

---

### 2.6 ELIGIBLE_FOR_REVIEW → LIMITED_LIVE

**Trigger:** Phil reviews and approves limited live deployment.

**Required evidence:**
- All SHADOW → ELIGIBLE_FOR_REVIEW evidence
- Phil's written approval
- Risk parameters set and approved
- Apex account allocation confirmed

**Authority:** **Phil approval required — explicit written approval**

---

### 2.7 LIMITED_LIVE → ACTIVE

**Trigger:** Limited live period produces sufficient evidence.

**Required evidence:**
- Minimum 50 live trades
- Live results consistent with shadow and historical
- No drawdown limit breaches
- Phil's written approval

**Authority:** **Phil approval required — explicit written approval**

---

## 3. Caution and Demotion Rules

### 3.1 ACTIVE → CAUTION

**Trigger:** One or more caution flags triggered (see monitoring contract).

**Examples:**
- Rolling expectancy below historical confidence range
- Profit factor below approved minimum
- Drawdown exceeding expected historical percentile
- Loss streak exceeding approved tolerance
- Regime-specific breakdown
- Slippage materially above model assumptions
- Rising correlation removing portfolio benefit

**Action:** DARWIN classifies strategy as `CAUTION_CANDIDATE` and generates a caution report. **No automatic demotion.** Phil reviews and decides.

**Authority:** DARWIN classifies; **Phil decides**

---

### 3.2 CAUTION → REDUCED

**Trigger:** Repeated CAUTION state across multiple evaluation windows.

**Examples:**
- Sustained negative expectancy across 3+ consecutive evaluation windows
- Materially increased drawdown
- Failed shadow revalidation
- Portfolio redundancy confirmed

**Action:** DARWIN recommends `REDUCED` allocation. **No automatic reduction.** Phil approves.

**Authority:** **Phil approval required**

---

### 3.3 REDUCED / CAUTION → SHADOW_REVIEW

**Trigger:** Performance does not recover after REDUCED allocation.

**Examples:**
- Out-of-sample and live evidence no longer support positive expectancy
- Structural edge disappearance
- Unacceptable risk-adjusted performance

**Action:** DARWIN recommends return to `SHADOW_REVIEW`. **No automatic demotion.** Phil approves.

**Authority:** **Phil approval required**

---

### 3.4 SHADOW_REVIEW → RETIRED

**Trigger:** Shadow revalidation fails.

**Examples:**
- Critical data leakage discovered
- Execution assumptions proven unrealistic
- A superior replacement strategy with lower portfolio risk
- Edge confirmed absent after full revalidation

**Action:** DARWIN recommends `RETIRED`. **No automatic retirement.** Phil approves.

**Authority:** **Phil approval required — explicit written approval**

---

## 4. Rejection and Inconclusive Rules

### 4.1 Any Stage → REJECTED

**Trigger:** Candidate fails statistical gates at any stage.

**Required evidence:**
- Documented gate failure (p-value, effect size, walk-forward, or OOS)
- Competing explanation that cannot be disproved
- Manifest hash recorded (prevents re-running same failed path)

**Authority:** DARWIN (autonomous)

---

### 4.2 Any Stage → INCONCLUSIVE

**Trigger:** Insufficient data to reach a conclusion.

**Required evidence:**
- Sample size below minimum threshold
- No fabricated conclusion

**Authority:** DARWIN (autonomous)

---

## 5. Constraints (Sprint 123A.6 and Until Further Notice)

No strategy may be automatically retired or have capital reallocated in Sprint 123A.6.

This sprint may only:
- calculate;
- classify;
- recommend;
- produce evidence.

Decision and execution authority remain inactive.

---

## 6. Audit Requirements

Every status transition must record:

- Previous status
- New status
- Timestamp
- Evidence document reference
- Git SHA of evidence commit
- Phil approval reference (if required)
- DARWIN evaluation ID

---

## 7. Amendment History

| Version | Date | Author | Change |
|---------|------|--------|--------|
| 1.0 | 2026-07-22 | Atlas Nexus (Phil approval) | Initial lifecycle rules — Sprint 123A.6 Gate G6A |
