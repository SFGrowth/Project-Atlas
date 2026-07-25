"""
Payout Vault Detector — v1.0.0
Sprint: 123A.9
Status: RESEARCH_PROTOTYPE — not for live or paper trading

This module implements all 11 primitives defined in payout_vault_research_spec.json.
Every design decision is traceable to the Concept Dictionary (CD-*), Rule Inventory (R-*),
and Ambiguity Register (AMB-*) documents.

AUTHORITY: DARWIN_DECISION_AUTHORITY=DISABLED, DARWIN_EXECUTION_AUTHORITY=DISABLED
This module produces research output only. No orders, no signals, no live integration.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from dataclasses import dataclass, field
from typing import Optional, Literal


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class SwingPoint:
    """A detected swing high or swing low on the LTF."""
    bar_index: int
    price: float
    direction: Literal["high", "low"]
    bar_time: Optional[pd.Timestamp] = None


@dataclass
class DOLResult:
    """Result of detect_dol(). CD-01, R-02, R-05, AMB-03."""
    dol_price: float
    dol_direction: Literal["bullish", "bearish"]
    source_bar_index: int
    source_bar_time: Optional[pd.Timestamp] = None


@dataclass
class MSUResult:
    """Result of detect_msu(). CD-03."""
    msu_direction: Literal["bullish", "bearish", "neutral"]
    last_swing_high: Optional[SwingPoint] = None
    last_swing_low: Optional[SwingPoint] = None
    swing_highs: list = field(default_factory=list)
    swing_lows: list = field(default_factory=list)


@dataclass
class SweepResult:
    """Result of detect_sweep(). CD-06, R-10, AMB-04."""
    swept: bool
    sweep_bar_index: Optional[int] = None
    sweep_bar_time: Optional[pd.Timestamp] = None
    sweep_price: Optional[float] = None
    variant: str = "sweep-wick"


@dataclass
class CSDResult:
    """Result of detect_csd(). CD-07, R-12–R-18, AMB-01, AMB-05."""
    confirmed: bool
    csd_bar_index: Optional[int] = None
    csd_bar_time: Optional[pd.Timestamp] = None
    rule_triggered: Optional[Literal["rule1", "rule2"]] = None
    bars_after_sweep: Optional[int] = None
    window_variant: str = "csd-window-3"


@dataclass
class FVGResult:
    """Result of detect_fvg(). CD-09d, AMB-10."""
    found: bool
    fvg_high: Optional[float] = None
    fvg_low: Optional[float] = None
    fvg_midpoint: Optional[float] = None
    fvg_bar_index: Optional[int] = None


@dataclass
class SMTResult:
    """Result of detect_smt(). CD-08, R-25–R-27, AMB-08."""
    checked: bool
    confirmed: bool
    primary_extreme: Optional[float] = None
    corr_extreme: Optional[float] = None
    window_bars: int = 3


@dataclass
class TradeManagement:
    """Result of compute_trade_management(). CD-10, R-21–R-24, AMB-07."""
    stop_price: float
    target_price: float
    risk_ticks: float
    reward_ticks: float
    stop_variant: str = "stop-4tick"


@dataclass
class SetupResult:
    """Full setup result from run_payout_vault_setup(). CD-14."""
    valid: bool
    rejection_reason: Optional[str] = None
    dol: Optional[DOLResult] = None
    msu: Optional[MSUResult] = None
    inducement_price: Optional[float] = None
    inducement_bar_index: Optional[int] = None
    sweep: Optional[SweepResult] = None
    csd: Optional[CSDResult] = None
    fvg: Optional[FVGResult] = None
    smt: Optional[SMTResult] = None
    entry_type1_price: Optional[float] = None
    entry_type1_bar_index: Optional[int] = None
    entry_type2_price: Optional[float] = None
    entry_type2_bar_index: Optional[int] = None
    entry_type2_triggered: bool = False
    trade_management: Optional[TradeManagement] = None
    config: dict = field(default_factory=dict)


# ---------------------------------------------------------------------------
# P-01: detect_dol
# ---------------------------------------------------------------------------

def detect_dol(htf_bars: pd.DataFrame, lookback: int = 20) -> Optional[DOLResult]:
    """
    P-01. Identify the nearest prior swing extreme on the HTF.
    CD-01, R-02, R-05, AMB-03.

    Design decisions:
    - DOL is implemented as a scalar price (AMB-03 resolved: scalar).
    - HTF structure direction is determined by comparing the most recent swing high
      and swing low: if the last swing high is more recent than the last swing low,
      the structure is bearish (price just made a lower high); vice versa for bullish.
    - DOL = the prior swing low (bullish) or prior swing high (bearish).

    Args:
        htf_bars: DataFrame with columns [open, high, low, close, bar_time].
                  Must be sorted ascending by bar_time.
        lookback: Number of bars to look back for swing detection.

    Returns:
        DOLResult or None if insufficient data.
    """
    if len(htf_bars) < lookback * 2:
        return None

    bars = htf_bars.tail(lookback * 3).reset_index(drop=True)
    n = len(bars)

    swing_highs = []
    swing_lows = []

    for i in range(2, n - 2):
        if bars.loc[i, "high"] > bars.loc[i-1, "high"] and bars.loc[i, "high"] > bars.loc[i-2, "high"] and \
           bars.loc[i, "high"] > bars.loc[i+1, "high"] and bars.loc[i, "high"] > bars.loc[i+2, "high"]:
            swing_highs.append(SwingPoint(
                bar_index=i,
                price=bars.loc[i, "high"],
                direction="high",
                bar_time=bars.loc[i, "bar_time"] if "bar_time" in bars.columns else None
            ))
        if bars.loc[i, "low"] < bars.loc[i-1, "low"] and bars.loc[i, "low"] < bars.loc[i-2, "low"] and \
           bars.loc[i, "low"] < bars.loc[i+1, "low"] and bars.loc[i, "low"] < bars.loc[i+2, "low"]:
            swing_lows.append(SwingPoint(
                bar_index=i,
                price=bars.loc[i, "low"],
                direction="low",
                bar_time=bars.loc[i, "bar_time"] if "bar_time" in bars.columns else None
            ))

    if not swing_highs or not swing_lows:
        return None

    last_high = swing_highs[-1]
    last_low = swing_lows[-1]

    # Determine HTF structure direction
    if last_high.bar_index > last_low.bar_index:
        # Most recent swing was a high — bearish structure (price made a lower high after a low)
        # DOL = prior swing low (below current price)
        dol_direction = "bearish"
        dol = last_low
    else:
        # Most recent swing was a low — bullish structure
        # DOL = prior swing high (above current price)
        dol_direction = "bullish"
        dol = last_high

    return DOLResult(
        dol_price=dol.price,
        dol_direction=dol_direction,
        source_bar_index=dol.bar_index,
        source_bar_time=dol.bar_time
    )


# ---------------------------------------------------------------------------
# P-02: detect_msu
# ---------------------------------------------------------------------------

def detect_msu(ltf_bars: pd.DataFrame, swing_lookback: int = 3) -> MSUResult:
    """
    P-02. Detect the current LTF market structure unit.
    CD-03, R-11.

    Uses a simple pivot-based swing detection with the given lookback.
    Returns the MSU direction and the most recent confirmed swing high and low.

    Args:
        ltf_bars: DataFrame with columns [open, high, low, close, bar_time].
        swing_lookback: Number of bars on each side required to confirm a swing.

    Returns:
        MSUResult.
    """
    n = len(ltf_bars)
    lb = swing_lookback

    swing_highs = []
    swing_lows = []

    for i in range(lb, n - lb):
        if all(ltf_bars.iloc[i]["high"] >= ltf_bars.iloc[i-j]["high"] for j in range(1, lb+1)) and \
           all(ltf_bars.iloc[i]["high"] >= ltf_bars.iloc[i+j]["high"] for j in range(1, lb+1)):
            swing_highs.append(SwingPoint(
                bar_index=i,
                price=ltf_bars.iloc[i]["high"],
                direction="high",
                bar_time=ltf_bars.iloc[i]["bar_time"] if "bar_time" in ltf_bars.columns else None
            ))
        if all(ltf_bars.iloc[i]["low"] <= ltf_bars.iloc[i-j]["low"] for j in range(1, lb+1)) and \
           all(ltf_bars.iloc[i]["low"] <= ltf_bars.iloc[i+j]["low"] for j in range(1, lb+1)):
            swing_lows.append(SwingPoint(
                bar_index=i,
                price=ltf_bars.iloc[i]["low"],
                direction="low",
                bar_time=ltf_bars.iloc[i]["bar_time"] if "bar_time" in ltf_bars.columns else None
            ))

    if not swing_highs or not swing_lows:
        return MSUResult(msu_direction="neutral")

    last_high = swing_highs[-1]
    last_low = swing_lows[-1]

    # Determine MSU direction by comparing last two swings
    if len(swing_highs) >= 2 and len(swing_lows) >= 2:
        prev_high = swing_highs[-2]
        prev_low = swing_lows[-2]

        making_higher_highs = last_high.price > prev_high.price
        making_higher_lows = last_low.price > prev_low.price
        making_lower_highs = last_high.price < prev_high.price
        making_lower_lows = last_low.price < prev_low.price

        if making_higher_highs and making_higher_lows:
            direction = "bullish"
        elif making_lower_highs and making_lower_lows:
            direction = "bearish"
        else:
            direction = "neutral"
    else:
        direction = "neutral"

    return MSUResult(
        msu_direction=direction,
        last_swing_high=last_high,
        last_swing_low=last_low,
        swing_highs=swing_highs,
        swing_lows=swing_lows
    )


# ---------------------------------------------------------------------------
# P-03: detect_inducement
# ---------------------------------------------------------------------------

def detect_inducement(
    msu: MSUResult,
    dol: DOLResult
) -> tuple[Optional[float], Optional[int]]:
    """
    P-03. Identify the current inducement level.
    CD-06, R-07–R-09.

    In a bearish MSU (DOL direction = bearish): inducement = most recent lower high.
    In a bullish MSU (DOL direction = bullish): inducement = most recent higher low.

    Returns:
        (inducement_price, inducement_bar_index) or (None, None) if not found.
    """
    if dol.dol_direction == "bearish":
        # Bearish: inducement = most recent swing high (R-08)
        if msu.last_swing_high:
            return msu.last_swing_high.price, msu.last_swing_high.bar_index
    elif dol.dol_direction == "bullish":
        # Bullish: inducement = most recent swing low (R-07)
        if msu.last_swing_low:
            return msu.last_swing_low.price, msu.last_swing_low.bar_index

    return None, None


# ---------------------------------------------------------------------------
# P-04: detect_sweep
# ---------------------------------------------------------------------------

def detect_sweep(
    ltf_bars: pd.DataFrame,
    inducement_price: float,
    dol_direction: Literal["bullish", "bearish"],
    search_from_bar: int,
    variant: Literal["sweep-wick", "sweep-close"] = "sweep-wick"
) -> SweepResult:
    """
    P-04. Detect when the inducement level has been swept.
    CD-06, R-10, AMB-04.

    Primary variant (sweep-wick): wick through the level.
    Secondary variant (sweep-close): close through the level.

    Args:
        ltf_bars: Full LTF bar DataFrame.
        inducement_price: The inducement level price.
        dol_direction: Direction of the DOL (determines sweep direction).
        search_from_bar: Bar index to start searching from.
        variant: "sweep-wick" (primary) or "sweep-close" (secondary).

    Returns:
        SweepResult.
    """
    for i in range(search_from_bar, len(ltf_bars)):
        bar = ltf_bars.iloc[i]

        if dol_direction == "bearish":
            # Bearish: sweep = price trades above the inducement high (sweeps stops above)
            check_price = bar["high"] if variant == "sweep-wick" else bar["close"]
            if check_price > inducement_price:
                return SweepResult(
                    swept=True,
                    sweep_bar_index=i,
                    sweep_bar_time=bar["bar_time"] if "bar_time" in ltf_bars.columns else None,
                    sweep_price=check_price,
                    variant=variant
                )
        else:
            # Bullish: sweep = price trades below the inducement low (sweeps stops below)
            check_price = bar["low"] if variant == "sweep-wick" else bar["close"]
            if check_price < inducement_price:
                return SweepResult(
                    swept=True,
                    sweep_bar_index=i,
                    sweep_bar_time=bar["bar_time"] if "bar_time" in ltf_bars.columns else None,
                    sweep_price=check_price,
                    variant=variant
                )

    return SweepResult(swept=False, variant=variant)


# ---------------------------------------------------------------------------
# P-05: detect_csd
# ---------------------------------------------------------------------------

def detect_csd(
    ltf_bars: pd.DataFrame,
    sweep_bar_index: int,
    sweep_candle_high: float,
    sweep_candle_low: float,
    dol_direction: Literal["bullish", "bearish"],
    max_wait_bars: int = 3
) -> CSDResult:
    """
    P-05. Detect CSD confirmation after inducement sweep.
    CD-07, R-12–R-18, AMB-01, AMB-05.

    Rule 1: close strictly > 50% of sweep candle range (bullish) or < 50% (bearish).
    Rule 2: close > entire prior candle body (bullish) or < entire prior candle body (bearish).
    Either rule is sufficient (R-15).
    Body close only — wick excluded (R-12).

    AMB-01: max_wait_bars controls the confirmation window.
    AMB-05: strict greater-than for 50% boundary.

    Args:
        ltf_bars: Full LTF bar DataFrame.
        sweep_bar_index: Index of the sweep candle.
        sweep_candle_high: High of the sweep candle.
        sweep_candle_low: Low of the sweep candle.
        dol_direction: Direction of the DOL.
        max_wait_bars: Maximum bars after sweep to wait for CSD.

    Returns:
        CSDResult.
    """
    sweep_range = sweep_candle_high - sweep_candle_low
    if sweep_range == 0:
        return CSDResult(confirmed=False, window_variant=f"csd-window-{max_wait_bars}")

    sweep_midpoint = sweep_candle_low + 0.5 * sweep_range

    start = sweep_bar_index + 1
    end = min(sweep_bar_index + 1 + max_wait_bars, len(ltf_bars))

    for i in range(start, end):
        bar = ltf_bars.iloc[i]
        close = bar["close"]

        # Get prior candle body bounds
        if i > 0:
            prior = ltf_bars.iloc[i - 1]
            prior_body_high = max(prior["open"], prior["close"])
            prior_body_low = min(prior["open"], prior["close"])
        else:
            prior_body_high = None
            prior_body_low = None

        if dol_direction == "bearish":
            # After a bearish sweep (price went above inducement), CSD = confirmation of downside delivery
            # Rule 1: close < 50% of sweep candle (bearish: close below midpoint)
            rule1 = close < sweep_midpoint
            # Rule 2: close < entire prior candle body
            rule2 = (prior_body_low is not None) and (close < prior_body_low)
        else:
            # After a bullish sweep (price went below inducement), CSD = confirmation of upside delivery
            # Rule 1: close > 50% of sweep candle
            rule1 = close > sweep_midpoint
            # Rule 2: close > entire prior candle body
            rule2 = (prior_body_high is not None) and (close > prior_body_high)

        if rule1 or rule2:
            rule_triggered = "rule2" if rule2 else "rule1"
            return CSDResult(
                confirmed=True,
                csd_bar_index=i,
                csd_bar_time=bar["bar_time"] if "bar_time" in ltf_bars.columns else None,
                rule_triggered=rule_triggered,
                bars_after_sweep=i - sweep_bar_index,
                window_variant=f"csd-window-{max_wait_bars}"
            )

    return CSDResult(confirmed=False, window_variant=f"csd-window-{max_wait_bars}")


# ---------------------------------------------------------------------------
# P-06: detect_fvg
# ---------------------------------------------------------------------------

def detect_fvg(
    ltf_bars: pd.DataFrame,
    csd_bar_index: int,
    dol_direction: Literal["bullish", "bearish"],
    lookback: int = 5
) -> FVGResult:
    """
    P-06. Detect the Fair Value Gap at or near the CSD confirmation.
    CD-09d, AMB-10.

    A bullish FVG: low of candle N > high of candle N-2 (gap between N-2 high and N low).
    A bearish FVG: high of candle N < low of candle N-2 (gap between N-2 low and N high).

    Searches within lookback bars of the CSD bar.

    Args:
        ltf_bars: Full LTF bar DataFrame.
        csd_bar_index: Index of the CSD confirmation bar.
        dol_direction: Direction of the DOL.
        lookback: Number of bars before and after CSD to search.

    Returns:
        FVGResult.
    """
    start = max(2, csd_bar_index - lookback)
    end = min(len(ltf_bars), csd_bar_index + lookback + 1)

    for i in range(start, end):
        if i < 2 or i >= len(ltf_bars):
            continue
        bar_n = ltf_bars.iloc[i]
        bar_n2 = ltf_bars.iloc[i - 2]

        if dol_direction == "bullish":
            # Bullish FVG: low of N > high of N-2
            if bar_n["low"] > bar_n2["high"]:
                fvg_low = bar_n2["high"]
                fvg_high = bar_n["low"]
                return FVGResult(
                    found=True,
                    fvg_high=fvg_high,
                    fvg_low=fvg_low,
                    fvg_midpoint=(fvg_high + fvg_low) / 2,
                    fvg_bar_index=i
                )
        else:
            # Bearish FVG: high of N < low of N-2
            if bar_n["high"] < bar_n2["low"]:
                fvg_high = bar_n2["low"]
                fvg_low = bar_n["high"]
                return FVGResult(
                    found=True,
                    fvg_high=fvg_high,
                    fvg_low=fvg_low,
                    fvg_midpoint=(fvg_high + fvg_low) / 2,
                    fvg_bar_index=i
                )

    return FVGResult(found=False)


# ---------------------------------------------------------------------------
# P-07: detect_smt
# ---------------------------------------------------------------------------

def detect_smt(
    ltf_bars_primary: pd.DataFrame,
    ltf_bars_smt: pd.DataFrame,
    inducement_bar_index: int,
    dol_direction: Literal["bullish", "bearish"],
    smt_window_bars: int = 3
) -> SMTResult:
    """
    P-07 (Optional). Check SMT divergence at the inducement sweep.
    CD-08, R-25–R-27, AMB-08.

    SMT confirmed if:
    - Primary instrument makes a new extreme at the inducement sweep bar.
    - Correlated instrument fails to make the same new extreme within ±smt_window_bars.

    Args:
        ltf_bars_primary: Primary instrument (MNQ) LTF bars.
        ltf_bars_smt: Correlated instrument (MES) LTF bars, aligned by time.
        inducement_bar_index: Index of the inducement bar in primary bars.
        dol_direction: Direction of the DOL.
        smt_window_bars: Window around inducement bar to check.

    Returns:
        SMTResult.
    """
    if ltf_bars_smt is None or len(ltf_bars_smt) == 0:
        return SMTResult(checked=False, confirmed=False, window_bars=smt_window_bars)

    start = max(0, inducement_bar_index - smt_window_bars)
    end = min(len(ltf_bars_primary), inducement_bar_index + smt_window_bars + 1)

    if end > len(ltf_bars_smt):
        return SMTResult(checked=False, confirmed=False, window_bars=smt_window_bars)

    primary_window = ltf_bars_primary.iloc[start:end]
    smt_window = ltf_bars_smt.iloc[start:end]

    if dol_direction == "bearish":
        # Bearish: primary makes new high, correlated fails to make new high
        primary_extreme = primary_window["high"].max()
        corr_extreme = smt_window["high"].max()
        # SMT confirmed if primary made a higher high but correlated did not
        prior_primary_high = ltf_bars_primary.iloc[:start]["high"].max() if start > 0 else primary_extreme
        prior_corr_high = ltf_bars_smt.iloc[:start]["high"].max() if start > 0 else corr_extreme
        primary_new_extreme = primary_extreme > prior_primary_high
        corr_failed = corr_extreme <= prior_corr_high
        confirmed = primary_new_extreme and corr_failed
    else:
        # Bullish: primary makes new low, correlated fails to make new low
        primary_extreme = primary_window["low"].min()
        corr_extreme = smt_window["low"].min()
        prior_primary_low = ltf_bars_primary.iloc[:start]["low"].min() if start > 0 else primary_extreme
        prior_corr_low = ltf_bars_smt.iloc[:start]["low"].min() if start > 0 else corr_extreme
        primary_new_extreme = primary_extreme < prior_primary_low
        corr_failed = corr_extreme >= prior_corr_low
        confirmed = primary_new_extreme and corr_failed

    return SMTResult(
        checked=True,
        confirmed=confirmed,
        primary_extreme=primary_extreme,
        corr_extreme=corr_extreme,
        window_bars=smt_window_bars
    )


# ---------------------------------------------------------------------------
# P-08: entry_type_1
# ---------------------------------------------------------------------------

def entry_type_1(ltf_bars: pd.DataFrame, csd_bar_index: int) -> tuple[Optional[float], Optional[int]]:
    """
    P-08. Entry Type 1: open of the candle immediately following CSD.
    CD-11, R-19.

    Returns:
        (entry_price, entry_bar_index) or (None, None) if no next bar.
    """
    next_bar_index = csd_bar_index + 1
    if next_bar_index >= len(ltf_bars):
        return None, None
    return ltf_bars.iloc[next_bar_index]["open"], next_bar_index


# ---------------------------------------------------------------------------
# P-09: entry_type_2
# ---------------------------------------------------------------------------

def entry_type_2(
    ltf_bars: pd.DataFrame,
    fvg: FVGResult,
    csd_bar_index: int,
    dol_direction: Literal["bullish", "bearish"],
    max_wait_bars: int = 20
) -> tuple[Optional[float], Optional[int], bool]:
    """
    P-09. Entry Type 2: limit order at FVG midpoint.
    CD-12, R-20, AMB-10.

    Triggers if price retraces into the FVG after CSD confirmation.
    Entry price = FVG midpoint (AMB-10 resolved: midpoint).

    Returns:
        (entry_price, entry_bar_index, triggered).
    """
    if not fvg.found or fvg.fvg_midpoint is None:
        return None, None, False

    start = csd_bar_index + 1
    end = min(len(ltf_bars), csd_bar_index + 1 + max_wait_bars)

    for i in range(start, end):
        bar = ltf_bars.iloc[i]
        if dol_direction == "bullish":
            # Price retraces down into FVG
            if bar["low"] <= fvg.fvg_midpoint:
                return fvg.fvg_midpoint, i, True
        else:
            # Price retraces up into FVG
            if bar["high"] >= fvg.fvg_midpoint:
                return fvg.fvg_midpoint, i, True

    return None, None, False


# ---------------------------------------------------------------------------
# P-10: compute_trade_management
# ---------------------------------------------------------------------------

def compute_trade_management(
    entry_price: float,
    inducement_price: float,
    dol_direction: Literal["bullish", "bearish"],
    tick_size: float = 0.25,
    stop_buffer_ticks: int = 4
) -> TradeManagement:
    """
    P-10. Compute stop loss and 3R target.
    CD-10, R-21–R-24, AMB-07.

    Stop = swept inducement level ± (stop_buffer_ticks × tick_size).
    Target = entry ± 3 × |entry - stop|.

    AMB-07 variants:
    - stop-1tick: stop_buffer_ticks=1
    - stop-4tick: stop_buffer_ticks=4 (default)

    Args:
        entry_price: Entry price.
        inducement_price: The swept inducement level.
        dol_direction: Direction of the DOL.
        tick_size: Tick size for the instrument (MNQ = 0.25).
        stop_buffer_ticks: Number of ticks beyond the sweep level for the stop.

    Returns:
        TradeManagement.
    """
    buffer = stop_buffer_ticks * tick_size
    variant = f"stop-{stop_buffer_ticks}tick"

    if dol_direction == "bearish":
        # Short trade: stop above inducement (which was swept above)
        stop_price = inducement_price + buffer
        risk = stop_price - entry_price
        target_price = entry_price - (3 * risk)
    else:
        # Long trade: stop below inducement (which was swept below)
        stop_price = inducement_price - buffer
        risk = entry_price - stop_price
        target_price = entry_price + (3 * risk)

    risk_ticks = abs(risk) / tick_size
    reward_ticks = risk_ticks * 3

    return TradeManagement(
        stop_price=stop_price,
        target_price=target_price,
        risk_ticks=risk_ticks,
        reward_ticks=reward_ticks,
        stop_variant=variant
    )


# ---------------------------------------------------------------------------
# P-11: run_payout_vault_setup
# ---------------------------------------------------------------------------

def run_payout_vault_setup(
    htf_bars: pd.DataFrame,
    ltf_bars: pd.DataFrame,
    ltf_bars_smt: Optional[pd.DataFrame] = None,
    config: Optional[dict] = None
) -> SetupResult:
    """
    P-11. Orchestrator. Runs all primitives in sequential gate order.
    CD-14, R-01–R-30.

    Default config:
        htf_lookback: 20
        ltf_swing_lookback: 3
        csd_window: 3 (csd-window-3)
        sweep_variant: "sweep-wick"
        stop_buffer_ticks: 4 (stop-4tick)
        entry_type: 1
        smt_enabled: False
        smt_window_bars: 3
        tick_size: 0.25

    Returns:
        SetupResult with valid=True if all gates pass, or valid=False with rejection_reason.
    """
    cfg = {
        "htf_lookback": 20,
        "ltf_swing_lookback": 3,
        "csd_window": 3,
        "sweep_variant": "sweep-wick",
        "stop_buffer_ticks": 4,
        "entry_type": 1,
        "smt_enabled": False,
        "smt_window_bars": 3,
        "tick_size": 0.25
    }
    if config:
        cfg.update(config)

    result = SetupResult(valid=False, config=cfg)

    # Gate 1: DOL (R-01)
    dol = detect_dol(htf_bars, lookback=cfg["htf_lookback"])
    if dol is None:
        result.rejection_reason = "GATE1_FAIL: insufficient HTF data for DOL detection"
        return result
    result.dol = dol

    # Gate 2: MSU (R-11)
    msu = detect_msu(ltf_bars, swing_lookback=cfg["ltf_swing_lookback"])
    if msu.msu_direction == "neutral":
        result.rejection_reason = "GATE2_FAIL: LTF MSU is neutral"
        return result
    result.msu = msu

    # Gate 3: MSU direction must align with DOL direction (R-03)
    if msu.msu_direction != dol.dol_direction:
        result.rejection_reason = f"GATE3_FAIL: MSU direction ({msu.msu_direction}) does not align with DOL direction ({dol.dol_direction})"
        return result

    # Gate 4: Inducement (R-07–R-09)
    inducement_price, inducement_bar_index = detect_inducement(msu, dol)
    if inducement_price is None:
        result.rejection_reason = "GATE4_FAIL: no inducement level found"
        return result
    result.inducement_price = inducement_price
    result.inducement_bar_index = inducement_bar_index

    # Gate 5: Sweep (R-10, AMB-04)
    sweep = detect_sweep(
        ltf_bars=ltf_bars,
        inducement_price=inducement_price,
        dol_direction=dol.dol_direction,
        search_from_bar=inducement_bar_index + 1,
        variant=cfg["sweep_variant"]
    )
    if not sweep.swept:
        result.rejection_reason = "GATE5_FAIL: inducement not swept"
        return result
    result.sweep = sweep

    # Gate 6: CSD confirmation (R-12–R-18, AMB-01)
    sweep_bar = ltf_bars.iloc[sweep.sweep_bar_index]
    csd = detect_csd(
        ltf_bars=ltf_bars,
        sweep_bar_index=sweep.sweep_bar_index,
        sweep_candle_high=sweep_bar["high"],
        sweep_candle_low=sweep_bar["low"],
        dol_direction=dol.dol_direction,
        max_wait_bars=cfg["csd_window"]
    )
    if not csd.confirmed:
        result.rejection_reason = f"GATE6_FAIL: CSD not confirmed within {cfg['csd_window']} bars"
        return result
    result.csd = csd

    # FVG detection (not a gate — used for Entry Type 2)
    fvg = detect_fvg(ltf_bars, csd.csd_bar_index, dol.dol_direction)
    result.fvg = fvg

    # SMT (optional filter, R-25–R-27)
    if cfg["smt_enabled"] and ltf_bars_smt is not None:
        smt = detect_smt(
            ltf_bars_primary=ltf_bars,
            ltf_bars_smt=ltf_bars_smt,
            inducement_bar_index=inducement_bar_index,
            dol_direction=dol.dol_direction,
            smt_window_bars=cfg["smt_window_bars"]
        )
        result.smt = smt
        # SMT is optional — does not block the setup if not confirmed

    # Entry
    if cfg["entry_type"] == 1:
        entry_price, entry_bar_index = entry_type_1(ltf_bars, csd.csd_bar_index)
        if entry_price is None:
            result.rejection_reason = "ENTRY_FAIL: no next bar for Entry Type 1"
            return result
        result.entry_type1_price = entry_price
        result.entry_type1_bar_index = entry_bar_index
    else:
        entry_price, entry_bar_index, triggered = entry_type_2(
            ltf_bars, fvg, csd.csd_bar_index, dol.dol_direction
        )
        result.entry_type2_price = entry_price
        result.entry_type2_bar_index = entry_bar_index
        result.entry_type2_triggered = triggered
        if not triggered:
            result.rejection_reason = "ENTRY_FAIL: Entry Type 2 FVG not triggered"
            return result

    # Trade management
    if entry_price is not None:
        tm = compute_trade_management(
            entry_price=entry_price,
            inducement_price=inducement_price,
            dol_direction=dol.dol_direction,
            tick_size=cfg["tick_size"],
            stop_buffer_ticks=cfg["stop_buffer_ticks"]
        )
        result.trade_management = tm

    result.valid = True
    return result
