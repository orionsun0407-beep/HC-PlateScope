from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.signal import savgol_filter


def normalize_max_per_well(df: pd.DataFrame, wells: list[str]) -> pd.DataFrame:
    out = df.copy()
    for well in wells:
        values = pd.to_numeric(out[well], errors="coerce")
        max_value = values.max(skipna=True)
        if pd.isna(max_value) or max_value == 0:
            out[well] = np.nan
        else:
            out[well] = values / max_value
    return out


def normalize_max_per_well_with_summary(df: pd.DataFrame, wells: list[str], dataset_name: str) -> tuple[pd.DataFrame, pd.DataFrame, list[str]]:
    """Normalize each well by its positive column maximum and report bad columns.

    Max values that are missing, zero, or negative are treated as invalid for
    anti-style normalization. The output column is set to NaN so plotting and
    summaries can continue without crashing.
    """
    out = df.copy()
    rows = []
    warnings: list[str] = []
    for well in wells:
        values = pd.to_numeric(out[well], errors="coerce")
        max_value = values.max(skipna=True)
        valid = pd.notna(max_value) and max_value > 0
        if valid:
            out[well] = values / max_value
            status = "normalized"
        else:
            out[well] = np.nan
            status = "invalid_max"
            warnings.append(f"{dataset_name} {well}: column maximum is zero, negative, or invalid; normalized values set to NaN.")
        rows.append(
            {
                "dataset": dataset_name,
                "well_id": well,
                "raw_max": float(max_value) if pd.notna(max_value) else np.nan,
                "normalized": bool(valid),
                "status": status,
            }
        )
    return out, pd.DataFrame(rows), warnings


def smooth_series(y: pd.Series | np.ndarray, window_length: int, polyorder: int) -> np.ndarray:
    arr = np.asarray(y, dtype=float)
    valid = np.isfinite(arr)
    if valid.sum() < 3:
        return arr
    filled = pd.Series(arr).interpolate(limit_direction="both").to_numpy()
    n = len(filled)
    window = int(window_length)
    if window % 2 == 0:
        window += 1
    window = min(window, n if n % 2 == 1 else n - 1)
    if window <= polyorder or window < 3:
        return filled
    try:
        return savgol_filter(filled, window_length=window, polyorder=min(polyorder, window - 1))
    except Exception:
        return filled
