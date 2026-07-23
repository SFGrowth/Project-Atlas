"""
Roll-Window Policy — Version 1.1
Policy ID: RWP-001
Sprint: 123A.7 (corrected in Gate G7 withhold)

Canonical MNQ roll dates and flagging functions.
All strategy research must use roll-excluded results as the primary result.

CORRECTION (Gate G7 withhold):
  v1.0 used calendar days for the ±3 window, which incorrectly included
  weekends and missed CME trading days. v1.1 uses CME trading days only.
  CME MNQ trades Sunday 17:00 – Friday 16:00 CT. The roll window is
  ±3 CME trading days (Mon-Fri, excluding CME holidays).
"""

from datetime import date, timedelta
from typing import Optional
import pandas as pd

# ============================================================
# CANONICAL MNQ ROLL DATES
# Third Friday of March, June, September, December
# (CME Globex MNQ front-month expiry)
# ============================================================

MNQ_ROLL_DATES: list[date] = [
    date(2024, 3, 15),
    date(2024, 6, 21),
    date(2024, 9, 20),
    date(2024, 12, 20),
    date(2025, 3, 21),
    date(2025, 6, 20),
    date(2025, 9, 19),
    date(2025, 12, 19),
    date(2026, 3, 20),
    date(2026, 6, 20),
    date(2026, 9, 18),  # projected
    date(2026, 12, 18),  # projected
]

ROLL_WINDOW_TRADING_DAYS: int = 3  # ±3 CME trading days around roll date
ROLL_JUMP_THRESHOLD: float = 0.02  # 2% price jump = roll boundary

# CME holidays (dates when CME Globex is closed or early close)
# These are approximate — full holiday schedule should be sourced from CME Group
CME_HOLIDAYS: set[date] = {
    # 2024
    date(2024, 1, 1),   # New Year's Day
    date(2024, 1, 15),  # MLK Day
    date(2024, 2, 19),  # Presidents' Day
    date(2024, 3, 29),  # Good Friday
    date(2024, 5, 27),  # Memorial Day
    date(2024, 6, 19),  # Juneteenth
    date(2024, 7, 4),   # Independence Day
    date(2024, 9, 2),   # Labor Day
    date(2024, 11, 28), # Thanksgiving
    date(2024, 12, 25), # Christmas
    # 2025
    date(2025, 1, 1),   # New Year's Day
    date(2025, 1, 20),  # MLK Day
    date(2025, 2, 17),  # Presidents' Day
    date(2025, 4, 18),  # Good Friday
    date(2025, 5, 26),  # Memorial Day
    date(2025, 6, 19),  # Juneteenth
    date(2025, 7, 4),   # Independence Day
    date(2025, 9, 1),   # Labor Day
    date(2025, 11, 27), # Thanksgiving
    date(2025, 12, 25), # Christmas
    # 2026
    date(2026, 1, 1),   # New Year's Day
    date(2026, 1, 19),  # MLK Day
    date(2026, 2, 16),  # Presidents' Day
    date(2026, 4, 3),   # Good Friday
    date(2026, 5, 25),  # Memorial Day
    date(2026, 6, 19),  # Juneteenth
    date(2026, 7, 3),   # Independence Day (observed)
    date(2026, 9, 7),   # Labor Day
    date(2026, 11, 26), # Thanksgiving
    date(2026, 12, 25), # Christmas
}


def is_cme_trading_day(d: date) -> bool:
    """Return True if d is a CME trading day (Mon-Fri, not a CME holiday)."""
    return d.weekday() < 5 and d not in CME_HOLIDAYS


def cme_trading_days_between(d1: date, d2: date) -> int:
    """
    Return the number of CME trading days between d1 and d2 (inclusive of both).
    Works for d1 <= d2 or d1 >= d2 (returns absolute count).
    """
    if d1 > d2:
        d1, d2 = d2, d1
    count = 0
    current = d1
    while current <= d2:
        if is_cme_trading_day(current):
            count += 1
        current += timedelta(days=1)
    # Subtract 1 because we want the distance (0 = same day)
    return max(0, count - 1)


def is_roll_window(check_date: date, window_days: int = ROLL_WINDOW_TRADING_DAYS) -> bool:
    """
    Return True if check_date falls within ±window_days CME trading days of any MNQ roll date.

    CORRECTED in v1.1: uses CME trading days, not calendar days.
    Weekends and CME holidays are skipped when counting.
    """
    if not is_cme_trading_day(check_date):
        # Non-trading days (weekends/holidays) are never in the roll window
        return False
    for roll_date in MNQ_ROLL_DATES:
        trading_day_distance = cme_trading_days_between(check_date, roll_date)
        if trading_day_distance <= window_days:
            return True
    return False


def nearest_roll_date(check_date: date) -> Optional[date]:
    """Return the nearest roll date to check_date (by CME trading days), or None if outside all windows."""
    if not is_cme_trading_day(check_date):
        return None
    for roll_date in MNQ_ROLL_DATES:
        trading_day_distance = cme_trading_days_between(check_date, roll_date)
        if trading_day_distance <= ROLL_WINDOW_TRADING_DAYS:
            return roll_date
    return None


def apply_roll_flags(df: pd.DataFrame, date_col: str = "date") -> pd.DataFrame:
    """
    Add roll-window flags to a DataFrame.

    Adds columns:
    - is_roll_window: bool — bar falls within ±3 CME trading days of a roll
    - nearest_roll_date: date or None — the nearest roll date if in window
    - is_roll_jump: bool — price jump > 2% on this bar (potential roll boundary)

    Args:
        df: DataFrame with at least a date column and close/prev_close
        date_col: name of the date column

    Returns:
        DataFrame with roll flags added
    """
    df = df.copy()

    # Convert date column to date objects if needed
    if pd.api.types.is_datetime64_any_dtype(df[date_col]):
        dates = df[date_col].dt.date
    else:
        dates = pd.to_datetime(df[date_col]).dt.date

    df["is_roll_window"] = dates.apply(is_roll_window)
    df["nearest_roll_date"] = dates.apply(nearest_roll_date)

    # Roll jump detection (requires close column)
    if "close" in df.columns:
        prev_close = df["close"].shift(1)
        price_change_pct = (df["close"] - prev_close).abs() / prev_close
        df["is_roll_jump"] = (price_change_pct > ROLL_JUMP_THRESHOLD) & df["is_roll_window"]
    else:
        df["is_roll_jump"] = False

    return df


def split_roll_excluded(df: pd.DataFrame, entry_date_col: str = "entry_date") -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Split a trades DataFrame into roll-excluded and roll-only subsets.

    Args:
        df: trades DataFrame with an entry_date column
        entry_date_col: name of the entry date column

    Returns:
        (roll_excluded, roll_only) DataFrames
    """
    if pd.api.types.is_datetime64_any_dtype(df[entry_date_col]):
        entry_dates = df[entry_date_col].dt.date
    else:
        entry_dates = pd.to_datetime(df[entry_date_col]).dt.date

    roll_mask = entry_dates.apply(is_roll_window)
    return df[~roll_mask].copy(), df[roll_mask].copy()


def get_quarantined_datasets() -> list[str]:
    """Return list of quarantined dataset identifiers."""
    return ["3m", "60m"]


def is_dataset_approved(interval: str) -> bool:
    """Return True if the dataset interval is approved for research use."""
    quarantined = get_quarantined_datasets()
    return interval not in quarantined


def assert_dataset_approved(interval: str) -> None:
    """Raise ValueError if dataset is quarantined."""
    if not is_dataset_approved(interval):
        raise ValueError(
            f"Dataset '{interval}' is QUARANTINED under Roll-Window Policy RWP-001. "
            f"Quarantined datasets may not be used as research inputs. "
            f"Approved intervals: 1m, 5m, 15m, 30m."
        )


if __name__ == "__main__":
    # Self-test suite
    print("=== Roll-Window Policy RWP-001 v1.1 Self-Test ===")
    print(f"Roll dates: {len(MNQ_ROLL_DATES)}")

    # Test 1: Roll date itself (Friday) should be in window
    assert is_roll_window(date(2024, 3, 15)), "Roll date itself (Friday) should be in window"

    # Test 2: 3 CME trading days before roll (Tuesday, since roll is Friday)
    # 2024-03-15 is Friday. 3 trading days before = Tuesday 2024-03-12
    assert is_roll_window(date(2024, 3, 12)), "3 CME trading days before roll should be in window"

    # Test 3: 3 CME trading days after roll (Wednesday, since roll is Friday)
    # 2024-03-15 is Friday. 3 trading days after = Wednesday 2024-03-20
    assert is_roll_window(date(2024, 3, 20)), "3 CME trading days after roll should be in window"

    # Test 4: 4 CME trading days before roll (Monday 2024-03-11) should NOT be in window
    assert not is_roll_window(date(2024, 3, 11)), "4 CME trading days before roll should NOT be in window"

    # Test 5: 4 CME trading days after roll (Thursday 2024-03-21) should NOT be in window
    assert not is_roll_window(date(2024, 3, 21)), "4 CME trading days after roll should NOT be in window"

    # Test 6: Weekend days should never be in window
    assert not is_roll_window(date(2024, 3, 16)), "Saturday should NOT be in roll window (non-trading day)"
    assert not is_roll_window(date(2024, 3, 17)), "Sunday should NOT be in roll window (non-trading day)"

    # Test 7: v1.0 bug — calendar days would include weekend after roll
    # Under v1.0: date(2024, 3, 18) = 3 calendar days after 2024-03-15 → incorrectly in window
    # Under v1.1: date(2024, 3, 18) is a Monday = 1 CME trading day after roll → correctly in window
    assert is_roll_window(date(2024, 3, 18)), "Monday after roll (1 trading day) should be in window"

    # Test 8: Quarantine checks
    assert not is_dataset_approved("3m"), "3m should be quarantined"
    assert not is_dataset_approved("60m"), "60m should be quarantined"
    assert is_dataset_approved("1m"), "1m should be approved"
    assert is_dataset_approved("5m"), "5m should be approved"
    assert is_dataset_approved("15m"), "15m should be approved"
    assert is_dataset_approved("30m"), "30m should be approved"

    try:
        assert_dataset_approved("3m")
        assert False, "Should have raised ValueError"
    except ValueError as e:
        print(f"Quarantine check OK: {str(e)[:60]}...")

    # Test 9: CME holiday exclusion
    # Good Friday 2024-03-29 is a CME holiday — should NOT be in roll window even if near a roll
    assert not is_roll_window(date(2024, 3, 29)), "CME holiday should NOT be in roll window"

    print("All self-tests PASSED")
    print(f"Policy version: 1.1 (CME trading days)")
    print(f"Window: ±{ROLL_WINDOW_TRADING_DAYS} CME trading days")
    print(f"Quarantined datasets: {get_quarantined_datasets()}")
    print(f"Approved datasets: 1m, 5m, 15m, 30m")

    # Show the window for the 2024-03-15 roll date
    print(f"\n2024-03-15 roll window dates:")
    start = date(2024, 3, 1)
    for i in range(30):
        d = start + timedelta(days=i)
        if is_roll_window(d):
            print(f"  {d} ({d.strftime('%A')}) — in window")
