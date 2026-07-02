from __future__ import annotations

import os
import re
import tempfile
import zipfile
from io import BytesIO
from pathlib import Path

os.environ.setdefault("MPLCONFIGDIR", str(Path(tempfile.gettempdir()) / "hc_platescope_mplconfig"))
Path(os.environ["MPLCONFIGDIR"]).mkdir(parents=True, exist_ok=True)

import matplotlib

matplotlib.use("Agg", force=True)

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from scipy.signal import savgol_filter


QUALITY_METRIC_PRIORITY = {
    "geco": ["ratio", "with_ca_max", "without_ca_max"],
    "luci": ["ratio_520_450", "peak520_value", "peak450_value"],
    "lss": ["peak_wavelength_distance", "emission_max", "excitation_max"],
    "anti": ["raw_max"],
}

SERIES_COLORS = ["#2F7F7A", "#B64342", "#0F4D92", "#9A4D8E", "#E28E2C"]


def safe_filename(text: object) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_.-]+", "_", str(text or "").strip())
    cleaned = cleaned.strip("._")
    return cleaned or "selected_well_plot"


def build_plot_series(result: dict, module_key: str) -> list[tuple[str, pd.DataFrame]]:
    module = module_key.lower()
    if module == "geco":
        return _existing_series(
            [
                ("with CA", result.get("with_ca")),
                ("without CA", result.get("without_ca")),
            ]
        )
    if module == "luci":
        return _existing_series([("normalized signal", result.get("normalized"))])
    if module == "lss":
        return _existing_series(
            [
                ("Emission", _first_dataframe(result, "emission_raw", "emission_normalized")),
                ("Excitation", _first_dataframe(result, "excitation_raw", "excitation_normalized")),
            ]
        )
    if module == "anti":
        return _existing_series(
            [
                ("Excitation normalized", result.get("excitation_normalized")),
                ("Emission normalized", result.get("emission_normalized")),
            ]
        )
    return []


def _existing_series(items: list[tuple[str, object]]) -> list[tuple[str, pd.DataFrame]]:
    series: list[tuple[str, pd.DataFrame]] = []
    for label, df in items:
        if isinstance(df, pd.DataFrame) and "Wavelength" in df.columns:
            series.append((label, df))
    return series


def _first_dataframe(result: dict, *keys: str) -> pd.DataFrame | None:
    for key in keys:
        value = result.get(key)
        if isinstance(value, pd.DataFrame):
            return value
    return None


def available_plot_wells(plot_series: list[tuple[str, pd.DataFrame]]) -> list[str]:
    well_sets = []
    for _, df in plot_series:
        well_sets.append({str(c) for c in df.columns if str(c) != "Wavelength"})
    if not well_sets:
        return []
    common = set.intersection(*well_sets)
    return sorted(common, key=_well_sort_key)


def summary_metric_columns(summary: pd.DataFrame | None) -> list[str]:
    if summary is None or summary.empty:
        return []
    columns: list[str] = []
    for column in summary.columns:
        if column == "well_id" or pd.api.types.is_bool_dtype(summary[column]):
            continue
        numeric = pd.to_numeric(summary[column], errors="coerce")
        if numeric.notna().any():
            columns.append(str(column))
    return columns


def default_quality_metric(summary: pd.DataFrame | None, module_key: str) -> str | None:
    metrics = summary_metric_columns(summary)
    if not metrics:
        return None
    for metric in QUALITY_METRIC_PRIORITY.get(module_key.lower(), []):
        if metric in metrics:
            return metric
    return metrics[0]


def default_selected_wells(
    summary: pd.DataFrame | None,
    module_key: str,
    available_wells: list[str],
    metric: str | None = None,
    max_count: int = 8,
) -> list[str]:
    if not available_wells:
        return []
    if summary is None or summary.empty or "well_id" not in summary.columns:
        return available_wells[: min(max_count, len(available_wells))]

    chosen_metric = metric or default_quality_metric(summary, module_key)
    if not chosen_metric or chosen_metric not in summary.columns:
        return available_wells[: min(max_count, len(available_wells))]

    working = summary[["well_id", chosen_metric]].copy()
    working["well_id"] = working["well_id"].astype(str)
    working[chosen_metric] = pd.to_numeric(working[chosen_metric], errors="coerce")
    working = working[working["well_id"].isin(available_wells) & working[chosen_metric].notna()]
    if working.empty:
        return available_wells[: min(max_count, len(available_wells))]

    ranked = working.groupby("well_id", as_index=False)[chosen_metric].max()
    ranked = ranked.sort_values(chosen_metric, ascending=False).head(max_count)
    return ranked["well_id"].tolist()


def selected_summary(summary: pd.DataFrame | None, selected_wells: list[str]) -> pd.DataFrame:
    if summary is None or summary.empty or "well_id" not in summary.columns:
        return pd.DataFrame({"well_id": selected_wells})
    out = summary[summary["well_id"].astype(str).isin(selected_wells)].copy()
    out["_order"] = out["well_id"].astype(str).map({well: idx for idx, well in enumerate(selected_wells)})
    return out.sort_values("_order").drop(columns=["_order"], errors="ignore").reset_index(drop=True)


def zipped_plot_bytes(
    plot_series: list[tuple[str, pd.DataFrame]],
    wells: list[str],
    module_label: str,
    file_format: str,
    smooth: bool = True,
    window_length: int = 11,
    dpi: int = 600,
) -> bytes:
    buffer = BytesIO()
    suffix = "tif" if file_format.lower() in {"tif", "tiff"} else file_format.lower()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for well in wells:
            figure_bytes = plot_well_bytes(plot_series, well, f"{module_label} {well}", file_format, smooth, window_length, dpi)
            archive.writestr(f"{safe_filename(module_label)}_{safe_filename(well)}.{suffix}", figure_bytes)
    return buffer.getvalue()


def zipped_data_bytes(plot_series: list[tuple[str, pd.DataFrame]], wells: list[str], module_label: str) -> bytes:
    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for well in wells:
            rows = []
            for label, df in plot_series:
                if well not in df.columns:
                    continue
                series_df = pd.DataFrame(
                    {
                        "series": label,
                        "well_id": well,
                        "Wavelength": pd.to_numeric(df["Wavelength"], errors="coerce"),
                        "Signal": pd.to_numeric(df[well], errors="coerce"),
                    }
                ).dropna(subset=["Wavelength", "Signal"])
                rows.append(series_df)
            if rows:
                archive.writestr(
                    f"{safe_filename(module_label)}_{safe_filename(well)}_data.csv",
                    pd.concat(rows, ignore_index=True).to_csv(index=False).encode("utf-8-sig"),
                )
    return buffer.getvalue()


def preview_png_bytes(
    plot_series: list[tuple[str, pd.DataFrame]],
    well: str,
    module_label: str,
    smooth: bool = True,
    window_length: int = 11,
) -> bytes:
    return plot_well_bytes(plot_series, well, f"{module_label} {well}", "png", smooth, window_length, dpi=220)


def plot_well_bytes(
    plot_series: list[tuple[str, pd.DataFrame]],
    well: str,
    title: str,
    file_format: str,
    smooth: bool = True,
    window_length: int = 11,
    dpi: int = 600,
) -> bytes:
    fig, ax = plt.subplots(figsize=(4.8, 3.5))
    plotted = False

    for idx, (label, df) in enumerate(plot_series):
        if well not in df.columns:
            continue
        x = pd.to_numeric(df["Wavelength"], errors="coerce").to_numpy(dtype=float)
        y = pd.to_numeric(df[well], errors="coerce").to_numpy(dtype=float)
        mask = np.isfinite(x) & np.isfinite(y)
        if not mask.any():
            continue
        x = x[mask]
        y = y[mask]
        order = np.argsort(x)
        x = x[order]
        y = y[order]
        color = SERIES_COLORS[idx % len(SERIES_COLORS)]
        ax.scatter(x, y, s=14, alpha=0.56, color=color, edgecolors="none", label=f"{label} points")
        if smooth:
            smooth_x, smooth_y = _smooth_line(x, y, window_length)
            ax.plot(smooth_x, smooth_y, color=color, linewidth=1.9, label=f"{label} smooth")
        plotted = True

    ax.set_title(title)
    ax.set_xlabel("Wavelength (nm)")
    ax.set_ylabel("Signal")
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.grid(axis="y", color="#D8E2DE", linewidth=0.7)
    if plotted:
        ax.legend(frameon=False, fontsize=8)
    else:
        ax.text(0.5, 0.5, "No finite data", ha="center", va="center", transform=ax.transAxes)
    fig.tight_layout()

    buffer = BytesIO()
    save_format = "tiff" if file_format.lower() in {"tif", "tiff"} else file_format.lower()
    fig.savefig(buffer, format=save_format, dpi=dpi, bbox_inches="tight")
    plt.close(fig)
    return buffer.getvalue()


def _smooth_line(x: np.ndarray, y: np.ndarray, window_length: int) -> tuple[np.ndarray, np.ndarray]:
    if len(y) < 5:
        return x, y
    window = int(window_length)
    if window % 2 == 0:
        window += 1
    max_window = len(y) if len(y) % 2 == 1 else len(y) - 1
    window = min(window, max_window)
    if window < 5:
        return x, y
    polyorder = min(3, window - 2)
    try:
        return x, savgol_filter(y, window_length=window, polyorder=polyorder)
    except Exception:
        return x, y


def _well_sort_key(value: str) -> tuple[str, int, str]:
    match = re.match(r"^([A-Za-z]+)(\d+)$", value)
    if not match:
        return (value, 0, value)
    return (match.group(1).upper(), int(match.group(2)), value)
