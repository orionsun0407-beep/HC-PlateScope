from __future__ import annotations

import numpy as np
import pandas as pd


def max_in_window(df: pd.DataFrame, well: str, window: tuple[float, float]) -> tuple[float, float]:
    low, high = window
    sub = df[(df["Wavelength"] >= low) & (df["Wavelength"] <= high)][["Wavelength", well]].copy()
    sub[well] = pd.to_numeric(sub[well], errors="coerce")
    sub = sub.dropna()
    if sub.empty:
        return np.nan, np.nan
    idx = sub[well].idxmax()
    return float(sub.loc[idx, "Wavelength"]), float(sub.loc[idx, well])


def well_max(df: pd.DataFrame, well: str) -> float:
    value = pd.to_numeric(df[well], errors="coerce").max(skipna=True)
    return float(value) if pd.notna(value) else np.nan


def geco_peak_ratio(with_ca: pd.DataFrame, without_ca: pd.DataFrame, wells: list[str]) -> pd.DataFrame:
    rows = []
    for well in wells:
        with_max = well_max(with_ca, well)
        without_max = well_max(without_ca, well)
        ratio = with_max / without_max if np.isfinite(with_max) and np.isfinite(without_max) and without_max != 0 else np.nan
        rows.append(
            {
                "well_id": well,
                "with_ca_max": with_max,
                "without_ca_max": without_max,
                "ratio": ratio,
            }
        )
    return pd.DataFrame(rows)


def luci_peak_summary(df: pd.DataFrame, wells: list[str], peak450_window: tuple[float, float], peak520_window: tuple[float, float]) -> pd.DataFrame:
    rows = []
    for well in wells:
        wl450, p450 = max_in_window(df, well, peak450_window)
        wl520, p520 = max_in_window(df, well, peak520_window)
        ratio = p520 / p450 if np.isfinite(p450) and p450 != 0 and np.isfinite(p520) else np.nan
        rows.append(
            {
                "well_id": well,
                "peak450_wavelength": wl450,
                "peak450_value": p450,
                "peak520_wavelength": wl520,
                "peak520_value": p520,
                "ratio_520_450": ratio,
            }
        )
    return pd.DataFrame(rows)
