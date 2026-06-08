from __future__ import annotations

import os
import tempfile
from pathlib import Path

os.environ.setdefault("MPLCONFIGDIR", str(Path(tempfile.gettempdir()) / "plate_processor_mpl"))

import matplotlib as mpl
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap
from matplotlib.backends.backend_pdf import PdfPages
import numpy as np
import pandas as pd

from .preprocessing import smooth_series
from .utils import COLS, ROWS, nice_upper_limit, plate_layout, well_grid_values


A4_LANDSCAPE = (11.69, 8.27)
A4_PORTRAIT = (8.27, 11.69)

NATURE_PALETTE = {
    "blue_main": "#0F4D92",
    "blue_secondary": "#3775BA",
    "green": "#8BCF8B",
    "red_strong": "#B64342",
    "teal": "#42949E",
    "neutral_dark": "#4D4D4D",
}


def _plotting_config(config: dict) -> dict:
    plotting = dict(config.get("plotting", {}))
    plot = config.get("plot", {})
    if plot:
        plotting["marker_size"] = plot.get("marker_size", plotting.get("marker_size", 1.0))
        plotting["line_width"] = plot.get("line_width", plotting.get("line_width", 1.0))
        plotting["alpha"] = plot.get("marker_alpha", plotting.get("alpha", 0.55))
        plotting["line_alpha"] = plot.get("line_alpha", plotting.get("line_alpha", 0.95))
        if "smoothing" in plot:
            smoothing = dict(config.get("smoothing", {}))
            smoothing.update(plot.get("smoothing", {}))
            plotting["_smoothing"] = smoothing
    return plotting


def _smoothing_config(config: dict) -> dict:
    plotting = _plotting_config(config)
    return plotting.get("_smoothing", config.get("smoothing", {}))


def _y_axis_config(config: dict, module_key: str | None = None) -> dict:
    plotting_y = dict(_plotting_config(config).get("y_axis", {}))
    if module_key:
        plotting_y.update(config.get(module_key, {}).get("y_axis", {}))
    return plotting_y


def _smoothed_or_raw(y: pd.Series | np.ndarray, smoothing: dict) -> np.ndarray:
    values = np.asarray(y, dtype=float)
    if not smoothing.get("enabled", True):
        return values
    return smooth_series(values, smoothing.get("window_length", 11), smoothing.get("polyorder", 3))


def _finite_max(*series: pd.Series | np.ndarray) -> float:
    arrays = [pd.to_numeric(pd.Series(s), errors="coerce").to_numpy(dtype=float) for s in series]
    if not arrays:
        return np.nan
    values = np.concatenate(arrays)
    finite = values[np.isfinite(values)]
    if finite.size == 0:
        return np.nan
    return float(finite.max())


def _per_well_ymax(series: list[pd.Series | np.ndarray], normalized: bool, y_cfg: dict) -> float:
    if normalized:
        max_value = _finite_max(*series)
        if not np.isfinite(max_value) or max_value <= 0:
            return float(y_cfg.get("upper_padding", 1.10))
        return max(float(y_cfg.get("upper_padding", 1.10)), max_value * float(y_cfg.get("upper_padding", 1.10)))

    padded = _finite_max(*series) * float(y_cfg.get("upper_padding", 1.10))
    if y_cfg.get("rounding_mode", "nice_round") == "nice_round":
        return nice_upper_limit(padded)
    return float(padded) if np.isfinite(padded) and padded > 0 else 1.0


def _y_label(normalized: bool) -> str:
    return "Normalized signal" if normalized else "Signal (a.u.)"


def _heatmap_cmap(name: str):
    if name == "hc_soft":
        return LinearSegmentedColormap.from_list(
            "hc_soft",
            ["#F8FBF8", "#DDEFE8", "#9FD1C4", "#5F9FBE", "#E6A15C"],
        )
    if name == "hc_nature":
        return LinearSegmentedColormap.from_list(
            "hc_nature",
            ["#F7FBF8", "#DDF3DE", "#AADCA9", "#3775BA", "#B64342"],
        )
    return plt.get_cmap(name)


def _heatmap_limits(data: np.ndarray, heatmap_cfg: dict) -> tuple[float | None, float | None, str]:
    finite = data[np.isfinite(data)]
    if finite.size == 0:
        return None, None, ""
    if heatmap_cfg.get("robust_scaling", True):
        low_q = float(heatmap_cfg.get("robust_lower_percentile", 5))
        high_q = float(heatmap_cfg.get("robust_upper_percentile", 95))
        vmin, vmax = np.nanpercentile(finite, [low_q, high_q])
        if np.isfinite(vmin) and np.isfinite(vmax) and vmax > vmin:
            return float(vmin), float(vmax), f"color scale clipped to p{low_q:g}-p{high_q:g}"
    return float(np.nanmin(finite)), float(np.nanmax(finite)), "full data color scale"


def _is_384_paired_measurement(config: dict, wells: list[str]) -> bool:
    if not wells:
        return False
    plate_format, _, _ = _grid_shape(config, wells)
    return plate_format == 384 and all(int(well[1:]) % 2 == 1 for well in wells)


def _compact_measured_grid(values: dict[str, float], config: dict, columns: int | None = None) -> pd.DataFrame:
    wells = sorted(values.keys(), key=lambda well: (ROWS.index(well[0]), int(well[1:])))
    if not wells:
        return pd.DataFrame(dtype=float)
    spectra_cfg = dict(config.get("plotting", {}).get("spectra_grid", {}))
    ncols = max(1, int(columns or spectra_cfg.get("columns", 12)))
    ncols = min(ncols, len(wells))
    nrows = int(np.ceil(len(wells) / ncols))
    grid = pd.DataFrame(index=[str(i + 1) for i in range(nrows)], columns=[str(i + 1) for i in range(ncols)], dtype=float)
    for idx, well in enumerate(wells):
        row = idx // ncols
        col = idx % ncols
        grid.iloc[row, col] = values[well]
    return grid


def _should_compact_heatmap(values: dict[str, float], config: dict) -> bool:
    wells = list(values.keys())
    if _is_384_paired_measurement(config, wells):
        return True
    if not wells:
        return False
    spectra_cfg = dict(config.get("plotting", {}).get("spectra_grid", {}))
    if str(spectra_cfg.get("mode", "plate")).lower() != "compact":
        return False
    _, rows, cols = _grid_shape(config, wells)
    return len(wells) < len(rows) * len(cols)


def _use_horizontal_colorbar(nrows: int) -> bool:
    return 0 < nrows <= 3


def _heatmap_aspect(compact_heatmap: bool, nrows: int) -> str:
    return "equal" if compact_heatmap else "auto"


def _heatmap_figure_size(nrows: int, ncols: int, compact_heatmap: bool) -> tuple[float, float]:
    if _use_horizontal_colorbar(nrows):
        width = min(A4_LANDSCAPE[0], max(5.8, ncols * 0.38 + 2.1))
        height = max(3.0, min(4.4, nrows * 0.56 + 2.5))
        return width, height
    if compact_heatmap:
        width = min(A4_LANDSCAPE[0], max(6.6, ncols * 0.42 + 2.4))
        height = min(A4_LANDSCAPE[1], max(4.2, nrows * 0.38 + 2.2))
        return width, height
    return A4_LANDSCAPE


def _badge_color(config: dict, key: str, default: str) -> str:
    return str(config.get("plotting", {}).get("badges", {}).get(key, default))


def _draw_badges(ax, badges: list[dict], colors: dict) -> None:
    if not badges:
        return
    for idx, item in enumerate(badges[:3]):
        ax.text(
            float(item.get("x", 0.965)),
            float(item.get("y", 0.82)) - idx * float(item.get("dy", 0.115)),
            str(item.get("text", item.get("label", ""))),
            transform=ax.transAxes,
            ha="right",
            va="top",
            fontsize=float(item.get("fontsize", 3.9)),
            fontweight="bold",
            color=str(item.get("textcolor", "white")),
            bbox={
                "boxstyle": "round,pad=0.16,rounding_size=0.08",
                "facecolor": str(item.get("facecolor", item.get("color", colors.get("accent", "#F28E2B")))),
                "edgecolor": "white",
                "linewidth": 0.35,
                "alpha": 0.92,
            },
            zorder=7,
            clip_on=False,
        )


def apply_nature_style(config: dict) -> None:
    plotting = _plotting_config(config)
    mpl.rcParams.update(
        {
            "figure.facecolor": "white",
            "axes.facecolor": "white",
            "axes.edgecolor": "#333333",
            "axes.linewidth": 0.45,
            "axes.spines.top": False,
            "axes.spines.right": False,
            "font.family": plotting.get("font_family", "Arial"),
            "font.size": 5.8,
            "axes.labelsize": 5.5,
            "axes.titlesize": 5.5,
            "xtick.labelsize": 4.4,
            "ytick.labelsize": 4.4,
            "legend.fontsize": 5,
            "pdf.fonttype": 42,
            "ps.fonttype": 42,
        }
    )


def _subplot_for_well(axes: np.ndarray, well: str):
    row = ROWS.index(well[0])
    col = int(well[1:]) - 1
    return axes[row, col]


def _grid_shape(config: dict, wells: list[str] | None = None) -> tuple[int, list[str], list[int]]:
    return plate_layout(config, wells or [])


def _spectra_layout(config: dict, wells: list[str], module_key: str | None = None) -> tuple[str, int, int, dict[str, tuple[int, int]]]:
    plate_format, rows, cols = _grid_shape(config, wells)
    spectra_cfg = dict(config.get("plotting", {}).get("spectra_grid", {}))
    mode = str(spectra_cfg.get("mode", "plate")).lower()
    if module_key == "geco" and _is_384_paired_measurement(config, wells):
        ncols = max(1, int(spectra_cfg.get("columns", min(12, max(1, len(wells))))))
        nrows = max(1, int(np.ceil(len(wells) / ncols)))
        positions = {well: (idx // ncols, idx % ncols) for idx, well in enumerate(wells)}
        return "compact", nrows, ncols, positions
    if module_key in {"lss", "anti"} and mode == "plate":
        mode = "active_rows"
    if mode == "compact":
        ncols = max(1, int(spectra_cfg.get("columns", min(12, max(1, len(wells))))))
        nrows = max(1, int(np.ceil(len(wells) / ncols)))
        positions = {well: (idx // ncols, idx % ncols) for idx, well in enumerate(wells)}
        return mode, nrows, ncols, positions
    if mode == "active_rows":
        active_rows = [row for row in rows if any(well.startswith(row) for well in wells)] or rows
        ncols = len(cols)
        positions = {well: (active_rows.index(well[0]), int(well[1:]) - 1) for well in wells}
        return mode, len(active_rows), ncols, positions
    if module_key == "geco" and plate_format == 384 and all(int(well[1:]) % 2 == 1 for well in wells):
        # GECO 384 paired mode plots odd/even adjacent wells as one pair. Compress
        # odd source columns A01/A03/.../A23 into pair columns 1..12 instead of
        # leaving the even-column slots blank.
        ncols = 12
        positions = {well: (rows.index(well[0]), (int(well[1:]) - 1) // 2) for well in wells}
        return "paired_plate", len(rows), ncols, positions
    ncols = len(cols)
    positions = {well: (rows.index(well[0]), int(well[1:]) - 1) for well in wells}
    return "plate", len(rows), ncols, positions


def _active_plate_rows(wells: list[str]) -> list[str]:
    rows = [row for row in ROWS if any(well.startswith(row) for well in wells)]
    return rows or list(ROWS)


def _subplot_for_well_in_rows(axes: np.ndarray, well: str, active_rows: list[str]):
    row = active_rows.index(well[0])
    col = int(well[1:]) - 1
    return axes[row, col]


def _well_position(well: str) -> tuple[int, int]:
    return ROWS.index(well[0]), int(well[1:]) - 1


def _wavelength_ticks(x_values: pd.Series | np.ndarray, interval: int) -> np.ndarray:
    x = pd.to_numeric(pd.Series(x_values), errors="coerce").dropna()
    if x.empty:
        return np.array([])
    low = int(np.floor(x.min() / interval) * interval)
    high = int(np.ceil(x.max() / interval) * interval)
    return np.arange(low, high + interval, interval)


def _well_label_style(module_key: str | None) -> dict:
    if module_key == "geco":
        return {"x": 0.97, "ha": "right"}
    return {"x": 0.03, "ha": "left"}


def _format_small_axis(
    ax,
    well: str,
    x_values: pd.Series | np.ndarray,
    config: dict,
    y_max: float | None = None,
    module_key: str | None = None,
    grid_col: int | None = None,
    grid_row: int | None = None,
    grid_rows: int | None = None,
) -> None:
    row, col = _well_position(well)
    label_row = row if grid_row is None else grid_row
    label_col = col if grid_col is None else grid_col
    x_cfg = _plotting_config(config).get("x_axis", {})
    label_style = _well_label_style(module_key)
    interval = int(x_cfg.get("tick_interval_nm", 10))
    dense_x_labels = module_key in {"lss", "anti"}
    label_interval = interval if dense_x_labels else int(x_cfg.get("label_interval_nm", max(interval, 50)))
    ticks = _wavelength_ticks(x_values, interval)
    if len(ticks):
        labels = [str(int(tick)) if tick % label_interval == 0 else "" for tick in ticks]
        ax.set_xticks(ticks, labels=labels)
        ax.set_xlim(ticks[0], ticks[-1])
    show_bottom_only = bool(x_cfg.get("show_labels_on_bottom_row_only", True))
    show_x_labels = dense_x_labels or (grid_rows is not None and label_row == grid_rows - 1) or row == 7 or not show_bottom_only
    ax.tick_params(
        axis="x",
        length=1.2 if dense_x_labels else 1.6,
        width=0.35,
        pad=0.35 if dense_x_labels else 0.5,
        labelsize=2.4 if dense_x_labels else 3.0,
        labelbottom=show_x_labels,
        rotation=float(x_cfg.get("tick_label_rotation", 90)),
    )
    ax.tick_params(axis="y", length=1.5, width=0.35, pad=0.5, labelsize=3.7, labelleft=(label_col == 0))
    ax.grid(True, color="#EAEAEA", linewidth=0.28, alpha=0.8)
    ax.text(
        label_style["x"],
        0.94,
        well,
        transform=ax.transAxes,
        ha=label_style["ha"],
        va="top",
        fontsize=4.6,
        fontweight="bold",
        color="#222222",
        bbox={"facecolor": "white", "edgecolor": "none", "alpha": 0.72, "pad": 0.2},
    )
    if y_max is not None:
        ax.set_ylim(bottom=0, top=y_max)


def plot_grid_two_series(
    df_a: pd.DataFrame,
    df_b: pd.DataFrame,
    wells: list[str],
    labels: tuple[str, str],
    output_path: str | Path,
    config: dict,
    title: str,
    normalized: bool = False,
    module_key: str | None = None,
    highlights: dict[str, list[dict]] | None = None,
) -> Path:
    apply_nature_style(config)
    plotting = _plotting_config(config)
    colors = plotting.get("colors", {})
    marker_size = plotting.get("marker_size", 4)
    line_width = plotting.get("line_width", 0.8)
    line_alpha = plotting.get("line_alpha", 0.95)
    alpha = plotting.get("alpha", 0.75)
    smoothing = _smoothing_config(config)
    y_cfg = plotting.get("y_axis", {})
    layout_mode, nrows, ncols, positions = _spectra_layout(config, wells, module_key)
    output_path = Path(output_path)
    highlights = highlights or {}

    def draw_page(page_wells: list[str], page_positions: dict[str, tuple[int, int]], page_title: str):
        fig, axes = plt.subplots(nrows, ncols, figsize=A4_LANDSCAPE, sharex=False, sharey=False)
        axes = np.asarray(axes).reshape(nrows, ncols)
        fig.suptitle(page_title, fontsize=8, fontweight="bold", y=0.988)
        for ax in axes.ravel():
            ax.set_visible(False)

        first_visible_ax = None
        for well in page_wells:
            row_idx, col_idx = page_positions[well]
            ax = axes[row_idx, col_idx]
            ax.set_visible(True)
            if first_visible_ax is None:
                first_visible_ax = ax
            x_a = pd.to_numeric(df_a["Wavelength"], errors="coerce")
            y_a = pd.to_numeric(df_a[well], errors="coerce")
            x_b = pd.to_numeric(df_b["Wavelength"], errors="coerce")
            y_b = pd.to_numeric(df_b[well], errors="coerce")
            ax.scatter(x_a, y_a, s=marker_size, color=colors.get("primary", "#4C78A8"), alpha=alpha, linewidths=0, label=labels[0])
            ax.plot(x_a, _smoothed_or_raw(y_a, smoothing), color=colors.get("primary", "#4C78A8"), linewidth=line_width, alpha=line_alpha)
            ax.scatter(x_b, y_b, s=marker_size, color=colors.get("secondary", "#59A14F"), alpha=alpha, linewidths=0, label=labels[1])
            ax.plot(x_b, _smoothed_or_raw(y_b, smoothing), color=colors.get("secondary", "#59A14F"), linewidth=line_width, alpha=line_alpha)
            y_max = _per_well_ymax([y_a, y_b], normalized, y_cfg)
            x_union = pd.concat([x_a, x_b], ignore_index=True)
            _format_small_axis(ax, well, x_union, config, y_max, module_key=module_key, grid_col=col_idx, grid_row=row_idx, grid_rows=nrows)
            _draw_badges(ax, highlights.get(well, []), colors)

        handles, legend_labels = first_visible_ax.get_legend_handles_labels() if first_visible_ax is not None else ([], [])
        deduped: dict[str, object] = {}
        for handle, legend_label in zip(handles, legend_labels):
            if legend_label and not str(legend_label).startswith("_") and legend_label not in deduped:
                deduped[legend_label] = handle
        if handles:
            fig.legend(list(deduped.values()), list(deduped.keys()), loc="upper right", frameon=False, bbox_to_anchor=(0.992, 0.993))
        fig.text(0.5, 0.04, "Wavelength (nm)", ha="center", fontsize=6)
        fig.text(0.032, 0.52, _y_label(normalized), va="center", rotation="vertical", fontsize=6)
        h_pad = 0.42 if layout_mode == "compact" else 0.18
        fig.tight_layout(rect=(0.055, 0.085, 0.992, 0.965), w_pad=0.12, h_pad=h_pad)
        return fig

    if layout_mode == "compact":
        spectra_cfg = dict(config.get("plotting", {}).get("spectra_grid", {}))
        ncols = max(1, int(spectra_cfg.get("columns", ncols)))
        nrows = max(1, int(spectra_cfg.get("rows_per_page", 8)))
        page_size = nrows * ncols
        pages = [wells[idx : idx + page_size] for idx in range(0, len(wells), page_size)] or [[]]
        with PdfPages(output_path) as pdf:
            for page_idx, page_wells in enumerate(pages, start=1):
                page_positions = {well: (idx // ncols, idx % ncols) for idx, well in enumerate(page_wells)}
                page_title = title if len(pages) == 1 else f"{title} - page {page_idx}/{len(pages)}"
                fig = draw_page(page_wells, page_positions, page_title)
                pdf.savefig(fig)
                plt.close(fig)
    else:
        fig = draw_page(wells, positions, title)
        fig.savefig(output_path, bbox_inches="tight")
        plt.close(fig)
    return output_path


def plot_grid_single_series(
    df: pd.DataFrame,
    wells: list[str],
    output_path: str | Path,
    config: dict,
    title: str,
    normalized: bool = True,
    module_key: str | None = None,
    highlights: dict[str, list[dict]] | None = None,
) -> Path:
    apply_nature_style(config)
    plotting = _plotting_config(config)
    colors = plotting.get("colors", {})
    smoothing = _smoothing_config(config)
    marker_size = plotting.get("marker_size", 4)
    line_width = plotting.get("line_width", 0.8)
    line_alpha = plotting.get("line_alpha", 0.95)
    alpha = plotting.get("alpha", 0.75)
    y_cfg = _y_axis_config(config, module_key)

    layout_mode, nrows, ncols, positions = _spectra_layout(config, wells, module_key)
    output_path = Path(output_path)
    highlights = highlights or {}

    x = pd.to_numeric(df["Wavelength"], errors="coerce")

    def draw_page(page_wells: list[str], page_positions: dict[str, tuple[int, int]], page_rows: int, page_cols: int, page_title: str):
        fig, axes = plt.subplots(page_rows, page_cols, figsize=A4_LANDSCAPE, sharex=False, sharey=False)
        axes = np.asarray(axes).reshape(page_rows, page_cols)
        fig.suptitle(page_title, fontsize=8, fontweight="bold", y=0.988)
        for ax in axes.ravel():
            ax.set_visible(False)

        for well in page_wells:
            row_idx, col_idx = page_positions[well]
            ax = axes[row_idx, col_idx]
            ax.set_visible(True)
            y = pd.to_numeric(df[well], errors="coerce")
            ax.scatter(x, y, s=marker_size, color=colors.get("primary", "#4C78A8"), alpha=alpha, linewidths=0)
            ax.plot(x, _smoothed_or_raw(y, smoothing), color=colors.get("primary", "#4C78A8"), linewidth=line_width, alpha=line_alpha)
            _draw_badges(ax, highlights.get(well, []), colors)
            y_max = _per_well_ymax([y], normalized, y_cfg)
            _format_small_axis(ax, well, x, config, y_max, module_key=module_key, grid_col=col_idx, grid_row=row_idx, grid_rows=page_rows)

        fig.text(0.5, 0.04, "Wavelength (nm)", ha="center", fontsize=6)
        fig.text(0.032, 0.52, _y_label(normalized), va="center", rotation="vertical", fontsize=6)
        h_pad = 0.42 if layout_mode == "compact" else 0.18
        fig.tight_layout(rect=(0.055, 0.075, 0.992, 0.965), w_pad=0.16, h_pad=h_pad)
        return fig

    if layout_mode == "compact":
        spectra_cfg = dict(config.get("plotting", {}).get("spectra_grid", {}))
        page_cols = max(1, int(spectra_cfg.get("columns", ncols)))
        page_rows = max(1, int(spectra_cfg.get("rows_per_page", 8)))
        page_size = page_rows * page_cols
        pages = [wells[idx : idx + page_size] for idx in range(0, len(wells), page_size)] or [[]]
        with PdfPages(output_path) as pdf:
            for page_idx, page_wells in enumerate(pages, start=1):
                page_positions = {well: (idx // page_cols, idx % page_cols) for idx, well in enumerate(page_wells)}
                page_title = title if len(pages) == 1 else f"{title} - page {page_idx}/{len(pages)}"
                fig = draw_page(page_wells, page_positions, page_rows, page_cols, page_title)
                pdf.savefig(fig)
                plt.close(fig)
    else:
        fig = draw_page(wells, positions, nrows, ncols, title)
        fig.savefig(output_path, bbox_inches="tight")
        plt.close(fig)
    return output_path


def plot_heatmap(
    values: dict[str, float],
    output_path: str | Path,
    config: dict,
    title: str,
    cbar_label: str,
) -> Path:
    apply_nature_style(config)
    plotting = _plotting_config(config)
    heatmap_cfg = plotting.get("heatmap", {})
    value_wells = list(values.keys())
    compact_measured = _should_compact_heatmap(values, config)
    grid = _compact_measured_grid(values, config) if compact_measured else well_grid_values(values, config)
    data = grid.to_numpy(dtype=float)
    rows = list(grid.index)
    cols = [int(c) for c in grid.columns]
    horizontal_cbar = _use_horizontal_colorbar(len(rows))

    fig, ax = plt.subplots(figsize=_heatmap_figure_size(len(rows), len(cols), compact_measured))
    cmap = _heatmap_cmap(plotting.get("colors", {}).get("heatmap", "hc_soft")).copy()
    cmap.set_bad("#F2F2F2")
    vmin, vmax, scale_note = _heatmap_limits(data, heatmap_cfg)
    im = ax.imshow(data, cmap=cmap, aspect=_heatmap_aspect(compact_measured, len(rows)), vmin=vmin, vmax=vmax)
    if compact_measured and len(rows) and len(cols) and horizontal_cbar:
        ax.set_box_aspect(max(0.18, len(rows) / len(cols)))
    ax.set_title(title, fontsize=10, fontweight="bold", pad=8)
    ax.set_xticks(np.arange(len(cols)), labels=[str(i) for i in cols])
    ax.set_yticks(np.arange(len(rows)), labels=rows)
    ax.set_xlabel("Measured column" if compact_measured else "Column")
    ax.set_ylabel("Measured row" if compact_measured else "Row")
    ax.set_xticks(np.arange(-0.5, len(cols), 1), minor=True)
    ax.set_yticks(np.arange(-0.5, len(rows), 1), minor=True)
    ax.grid(which="minor", color="white", linewidth=1)
    ax.tick_params(which="minor", bottom=False, left=False)
    if heatmap_cfg.get("show_values", True):
        fmt = heatmap_cfg.get("value_format", ".2f")
        for i in range(len(rows)):
            for j in range(len(cols)):
                if np.isfinite(data[i, j]):
                    ax.text(j, i, format(data[i, j], fmt), ha="center", va="center", fontsize=5, color="#222222")
    if horizontal_cbar:
        cbar = fig.colorbar(im, ax=ax, orientation="horizontal", fraction=0.12, pad=0.24, aspect=38)
        cbar.set_label(cbar_label, labelpad=3)
    else:
        cbar = fig.colorbar(im, ax=ax, shrink=0.82, pad=0.02)
        cbar.set_label(cbar_label)
    if scale_note:
        y_note = -0.33 if horizontal_cbar else -0.13
        ax.text(0.0, y_note, scale_note, transform=ax.transAxes, ha="left", va="top", fontsize=5.8, color="#6B756D")
    fig.tight_layout()
    output_path = Path(output_path)
    fig.savefig(output_path, bbox_inches="tight")
    plt.close(fig)
    return output_path


def combined_report_with_heatmap(
    grid_kind: str,
    output_path: str | Path,
    config: dict,
    title: str,
    heatmap_values: dict[str, float],
    heatmap_label: str,
    df_a: pd.DataFrame | None = None,
    df_b: pd.DataFrame | None = None,
    df_single: pd.DataFrame | None = None,
    wells: list[str] | None = None,
    labels: tuple[str, str] = ("A", "B"),
    normalized: bool = False,
    module_key: str | None = None,
    highlights: dict[str, list[dict]] | None = None,
) -> Path:
    apply_nature_style(config)
    plotting = _plotting_config(config)
    colors = plotting.get("colors", {})
    smoothing = _smoothing_config(config)
    marker_size = plotting.get("marker_size", 4)
    line_width = plotting.get("line_width", 0.8)
    line_alpha = plotting.get("line_alpha", 0.95)
    alpha = plotting.get("alpha", 0.75)
    y_cfg = _y_axis_config(config, module_key)
    wells = wells or []
    output_path = Path(output_path)
    highlights = highlights or {}

    layout_mode, _, layout_cols, _ = _spectra_layout(config, wells, module_key)
    spectra_cfg = dict(config.get("plotting", {}).get("spectra_grid", {}))
    if layout_mode == "compact":
        page_cols = max(1, int(spectra_cfg.get("columns", layout_cols)))
        page_rows = max(1, int(spectra_cfg.get("rows_per_page", 8)))
        page_size = page_cols * page_rows
        pages = [wells[idx : idx + page_size] for idx in range(0, len(wells), page_size)] or [[]]
    else:
        pages = [wells]

    def draw_page(page_wells: list[str], page_title: str, page_heatmap_label: str):
        page_layout_mode, nrows, ncols, positions = _spectra_layout(config, page_wells, module_key)
        compact_geco = module_key == "geco" and page_layout_mode == "compact"
        if compact_geco:
            top_ratio = min(1.12, max(0.46, 0.24 * nrows + 0.22))
            height_ratios = [top_ratio, max(0.72, 2.0 - top_ratio)]
            subfigure_hspace = 0.018
        else:
            height_ratios = [1, 1]
            subfigure_hspace = 0.035

        fig = plt.figure(figsize=A4_PORTRAIT)
        subfigs = fig.subfigures(2, 1, height_ratios=height_ratios, hspace=subfigure_hspace)
        top, bottom = subfigs
        axes = top.subplots(nrows, ncols)
        axes = np.asarray(axes).reshape(nrows, ncols)
        top.suptitle(page_title, fontsize=8, fontweight="bold", y=0.995)
        for ax in axes.ravel():
            ax.set_visible(False)

        for well in page_wells:
            row_idx, col_idx = positions[well]
            ax = axes[row_idx, col_idx]
            ax.set_visible(True)
            if grid_kind == "single" and df_single is not None:
                x = pd.to_numeric(df_single["Wavelength"], errors="coerce")
                y = pd.to_numeric(df_single[well], errors="coerce")
                ax.scatter(x, y, s=marker_size, color=colors.get("primary", "#4C78A8"), alpha=alpha, linewidths=0)
                ax.plot(x, _smoothed_or_raw(y, smoothing), color=colors.get("primary", "#4C78A8"), linewidth=line_width, alpha=line_alpha)
                ymax = _per_well_ymax([y], normalized, y_cfg)
            elif df_a is not None and df_b is not None:
                x_a = pd.to_numeric(df_a["Wavelength"], errors="coerce")
                y_a = pd.to_numeric(df_a[well], errors="coerce")
                x_b = pd.to_numeric(df_b["Wavelength"], errors="coerce")
                y_b = pd.to_numeric(df_b[well], errors="coerce")
                ax.scatter(x_a, y_a, s=marker_size, color=colors.get("primary", "#4C78A8"), alpha=alpha, linewidths=0, label=labels[0])
                ax.plot(x_a, _smoothed_or_raw(y_a, smoothing), color=colors.get("primary", "#4C78A8"), linewidth=line_width, alpha=line_alpha)
                ax.scatter(x_b, y_b, s=marker_size, color=colors.get("secondary", "#59A14F"), alpha=alpha, linewidths=0, label=labels[1])
                ax.plot(x_b, _smoothed_or_raw(y_b, smoothing), color=colors.get("secondary", "#59A14F"), linewidth=line_width, alpha=line_alpha)
                ymax = _per_well_ymax([y_a, y_b], normalized, y_cfg)
            else:
                continue
            x_for_ticks = df_single["Wavelength"] if grid_kind == "single" and df_single is not None else df_a["Wavelength"]
            if grid_kind != "single" and df_b is not None:
                x_for_ticks = pd.concat([pd.to_numeric(df_a["Wavelength"], errors="coerce"), pd.to_numeric(df_b["Wavelength"], errors="coerce")], ignore_index=True)
            _format_small_axis(ax, well, x_for_ticks, config, ymax, module_key=module_key, grid_col=col_idx, grid_row=row_idx, grid_rows=nrows)
            _draw_badges(ax, highlights.get(well, []), colors)
            if page_layout_mode == "compact":
                ax.set_box_aspect(1.05 if module_key == "geco" else 1.35)
        top.subplots_adjust(
            left=0.085,
            right=0.974,
            bottom=0.285 if compact_geco else (0.145 if module_key == "geco" else 0.105),
            top=0.875 if compact_geco else 0.93,
            wspace=0.18 if compact_geco else 0.26,
            hspace=0.28 if compact_geco else (0.34 if page_layout_mode != "compact" else 0.42),
        )
        visible_axes = [ax for ax in axes.ravel() if ax.get_visible()]
        if visible_axes:
            bboxes = [ax.get_position() for ax in visible_axes]
            spectra_left = min(bbox.x0 for bbox in bboxes)
            spectra_right = max(bbox.x1 for bbox in bboxes)
            spectra_bottom = min(bbox.y0 for bbox in bboxes)
            spectra_top = max(bbox.y1 for bbox in bboxes)
            spectra_x = (spectra_left + spectra_right) / 2
            spectra_y = (spectra_bottom + spectra_top) / 2
            x_label_gap = 0.045 if compact_geco else 0.040
            y_label_gap = 0.034 if compact_geco else 0.040
            top.text(
                spectra_x,
                max(0.012, spectra_bottom - x_label_gap),
                "Wavelength (nm)",
                ha="center",
                va="top",
                fontsize=5.8,
            )
            top.text(
                max(0.012, spectra_left - y_label_gap),
                spectra_y,
                _y_label(normalized),
                ha="center",
                va="center",
                rotation="vertical",
                fontsize=5.8,
            )

        heat_ax = bottom.subplots(1, 1)
        page_heatmap_values = {well: heatmap_values[well] for well in page_wells if well in heatmap_values}
        compact_heatmap = _should_compact_heatmap(page_heatmap_values, config)
        grid = _compact_measured_grid(page_heatmap_values, config) if compact_heatmap else well_grid_values(page_heatmap_values, config)
        data = grid.to_numpy(dtype=float)
        rows = list(grid.index)
        cols = [int(c) for c in grid.columns]
        heatmap_cfg = plotting.get("heatmap", {})
        cmap = _heatmap_cmap(colors.get("heatmap", "hc_soft")).copy()
        cmap.set_bad("#F2F2F2")
        vmin, vmax, scale_note = _heatmap_limits(data, heatmap_cfg)
        horizontal_cbar = _use_horizontal_colorbar(len(rows))
        im = heat_ax.imshow(data, cmap=cmap, aspect=_heatmap_aspect(compact_heatmap, len(rows)), vmin=vmin, vmax=vmax)
        if compact_heatmap and len(rows) and len(cols):
            min_aspect = 0.18 if horizontal_cbar else 0.12
            heat_ax.set_box_aspect(max(min_aspect, len(rows) / len(cols)))
        heat_ax.set_title(page_heatmap_label, fontsize=8, fontweight="bold", pad=4)
        heat_ax.set_xticks(np.arange(len(cols)), labels=[str(i) for i in cols])
        heat_ax.set_yticks(np.arange(len(rows)), labels=rows)
        heat_ax.set_xlabel("Measured column" if compact_heatmap else "Column", fontsize=6)
        heat_ax.set_ylabel("Measured row" if compact_heatmap else "Row", fontsize=6)
        heat_ax.set_xticks(np.arange(-0.5, len(cols), 1), minor=True)
        heat_ax.set_yticks(np.arange(-0.5, len(rows), 1), minor=True)
        heat_ax.grid(which="minor", color="white", linewidth=1)
        heat_ax.tick_params(which="minor", bottom=False, left=False)
        if heatmap_cfg.get("show_values", True):
            fmt = heatmap_cfg.get("value_format", ".2f")
            for i in range(len(rows)):
                for j in range(len(cols)):
                    if np.isfinite(data[i, j]):
                        heat_ax.text(j, i, format(data[i, j], fmt), ha="center", va="center", fontsize=5, color="#222222")
        if horizontal_cbar:
            cbar = bottom.colorbar(im, ax=heat_ax, orientation="horizontal", fraction=0.10, pad=0.25, aspect=36)
            cbar.set_label(heatmap_label, fontsize=6, labelpad=3)
        else:
            cbar = bottom.colorbar(im, ax=heat_ax, shrink=0.82, pad=0.018)
            cbar.set_label(heatmap_label, fontsize=6)
        if scale_note:
            y_note = -0.34 if horizontal_cbar else -0.16
            heat_ax.text(0.0, y_note, scale_note, transform=heat_ax.transAxes, ha="left", va="top", fontsize=5.8, color="#6B756D")
        if horizontal_cbar:
            if compact_geco:
                bottom.subplots_adjust(left=0.09, right=0.94, bottom=0.76, top=0.97)
            else:
                bottom.subplots_adjust(left=0.09, right=0.94, bottom=0.22, top=0.86)
        else:
            bottom.subplots_adjust(left=0.09, right=0.90, bottom=0.13, top=0.88)
        return fig

    if len(pages) == 1:
        fig = draw_page(pages[0], title, heatmap_label)
        fig.savefig(output_path)
        plt.close(fig)
    else:
        with PdfPages(output_path) as pdf:
            for page_idx, page_wells in enumerate(pages, start=1):
                fig = draw_page(page_wells, f"{title} - page {page_idx}/{len(pages)}", f"{heatmap_label} - page {page_idx}/{len(pages)}")
                pdf.savefig(fig)
                plt.close(fig)
    return output_path
