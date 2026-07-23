"""
Roll-Window Policy — Version 1.0
Policy ID: RWP-001
Sprint: 123A.7

Canonical MNQ roll dates and flagging functions.
All strategy research must use roll-excluded results as the primary result.
"""

from datetime import date, timedelta
from typing import Optional
import pandas as pd

# ============================================================
# CANONICAL MNQ ROLL DATES
# Third Friday of March, June, September, December
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

ROLL_WINDOW_DAYS: int = 3  # ±3 trading days around roll date
ROLL_JUMP_THRESHOLD: float = 0.02  # 2% price jump = roll boundary


def is_roll_window(check_date: date, window_days: int = ROLL_WINDOW_DAYS) -> bool:
    """Return True if check_date falls within ±window_days of any MNQ roll date."""
    for roll_date in MNQ_ROLL_DATES:
        delta = abs((check_date - roll_date).days)
        if delta <= window_days:
            return True
    return False


def nearest_roll_date(check_date: date) -> Optional[date]:
    """Return the nearest roll date to check_date, or None if outside all windows."""
    for roll_date in MNQ_ROLL_DATES:
        delta = abs((check_date - roll_date).days)
        if delta <= ROLL_WINDOW_DAYS:
            return roll_date
    return None


def apply_roll_flags(df: pd.DataFrame, date_col: str = "date") -> pd.DataFrame:
    """
    Add roll-window flags to a DataFrame.

    Adds columns:
    - is_roll_window: bool — bar falls within ±3 trading days of a roll
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
    # Quick self-test
    print("=== Roll-Window Policy RWP-001 Self-Test ===")
    print(f"Roll dates: {len(MNQ_ROLL_DATES)}")

    # Test a known roll date
    assert is_roll_window(date(2024, 3, 15)), "Roll date itself should be in window"
    assert is_roll_window(date(2024, 3, 12)), "3 days before roll should be in window"
    assert is_roll_window(date(2024, 3, 18)), "3 days after roll should be in window"
    assert not is_roll_window(date(2024, 3, 11)), "4 days before roll should NOT be in window"
    assert not is_roll_window(date(2024, 3, 19)), "4 days after roll should NOT be in window"

    # Test quarantine
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

    print("All self-tests PASSED")
    print(f"Quarantined datasets: {get_quarantined_datasets()}")
    print(f"Approved datasets: 1m, 5m, 15m, 30m")
