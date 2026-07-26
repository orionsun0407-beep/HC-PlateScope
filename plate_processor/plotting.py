from __future__ import annotations

from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from .utils import plate_layout, well_grid_values


def apply_nature_style(config: dict) -> None:
    font = config.get("plotting", {}).get("font_family", "Arial")
    plt.rcParams.update({"font.family": font, "axes.spines.top": False, "axes.spines.right": False})


def _colors(config: dict) -> dict:
    return config.get("plotting", {}).get("colors", {})


def _plot_options(config: dict) -> dict:
    plotting = config.get("plotting", {})
    plot = config.get("plot", {})
    marker_size = float(plot.get("marker_size", plotting.get("marker_size", 1.0)))
    line_width = float(plot.get("line_width", plotting.get("line_width", 1.0)))
    marker_alpha = float(plot.get("marker_alpha", plotting.get("alpha", 0.7)))
    line_alpha = float(plot.get("line_alpha", plotting.get("line_alpha", 0.9)))
    return {
        "marker_size": max(2.2, marker_size * 2.2),
        "line_width": max(0.6, line_width),
        "marker_alpha": max(0.15, min(marker_alpha, 1.0)),
        "line_alpha": max(0.15, min(line_alpha, 1.0)),
    }


def _grid(wells: list[str], config: dict) -> tuple[list[str], list[int]]:
    _, rows, cols = plate_layout(config, wells)
    return rows, cols


def _axis_for_well(axes, well: str, rows: list[str], cols: list[int]):
    r = rows.index(well[0])
    c = cols.index(int(well[1:]))
    return axes[r, c]


def _finish_empty_axes(axes, rows: list[str], cols: list[int], wells: set[str]) -> None:
    for r, row in enumerate(rows):
        for c, col in enumerate(cols):
            ax = axes[r, c]
            if f"{row}{col:02d}" not in wells:
                ax.axis("off")


def _finite_values(series_list: list[pd.Series | np.ndarray]) -> np.ndarray:
    values: list[np.ndarray] = []
    for series in series_list:
        arr = pd.to_numeric(series, errors="coerce").to_numpy(dtype=float)
        arr = arr[np.isfinite(arr)]
        if arr.size:
            values.append(arr)
    return np.concatenate(values) if values else np.array([], dtype=float)


def _nice_upper(value: float) -> float:
    if not np.isfinite(value) or value <= 0:
        return 1.0
    exponent = np.floor(np.log10(value))
    fraction = value / (10 ** exponent)
    if fraction <= 1:
        nice = 1
    elif fraction <= 2:
        nice = 2
    elif fraction <= 5:
        nice = 5
    else:
        nice = 10
    return float(nice * (10 ** exponent))


def _axis_limits(values: np.ndarray, normalized: bool, config: dict) -> tuple[float, float]:
    y_axis = config.get("plotting", {}).get("y_axis", {})
    upper_padding = float(y_axis.get("upper_padding", 1.1))
    nice_rounding = y_axis.get("rounding_mode", "nice_round") == "nice_round"
    if values.size == 0:
        return (0.0, 1.0 if normalized else 10.0)

    ymin = float(np.nanmin(values))
    ymax = float(np.nanmax(values))
    if np.isclose(ymin, ymax):
        span = max(abs(ymax) * 0.08, 0.05 if normalized else 1.0)
        ymin -= span
        ymax += span
    else:
        span = ymax - ymin
        ymin -= span * 0.05
        ymax += span * max(upper_padding - 1.0, 0.05)

    if normalized and ymin >= -0.03:
        ymin = 0.0
        ymax = max(ymax, 1.0)
    elif ymin >= 0:
        ymin = 0.0

    if nice_rounding and ymin == 0.0:
        ymax = _nice_upper(ymax)
    if ymax <= ymin:
        ymax = ymin + 1.0
    return ymin, ymax


def _global_limits(dataframes: list[pd.DataFrame], wells: list[str], normalized: bool, config: dict) -> tuple[float, float]:
    series = []
    for df in dataframes:
        for well in wells:
            if well in df:
                series.append(df[well])
    return _axis_limits(_finite_values(series), normalized, config)


def _draw_scatter_line(ax, x, y, color: str, label: str | None, opts: dict) -> None:
    x_values = pd.to_numeric(x, errors="coerce").to_numpy(dtype=float)
    y_values = pd.to_numeric(y, errors="coerce").to_numpy(dtype=float)
    mask = np.isfinite(x_values) & np.isfinite(y_values)
    x_values = x_values[mask]
    y_values = y_values[mask]
    if x_values.size == 0:
        return
    ax.plot(
        x_values,
        y_values,
        color=color,
        lw=opts["line_width"],
        alpha=opts["line_alpha"],
        marker="o",
        markersize=opts["marker_size"],
        markerfacecolor=color,
        markeredgecolor="white",
        markeredgewidth=0.25,
        label=label,
    )


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
    rows, cols = _grid(wells, config)
    fig, axes = plt.subplots(len(rows), len(cols), figsize=(max(12, len(cols) * 1.1), max(7, len(rows) * 0.9)), squeeze=False)
    colors = _colors(config)
    opts = _plot_options(config)
    per_well = config.get("plotting", {}).get("y_axis", {}).get("per_well", True)
    shared_ylim = None if per_well else _global_limits([df_a, df_b], wells, normalized, config)

    for well in wells:
        ax = _axis_for_well(axes, well, rows, cols)
        _draw_scatter_line(ax, df_a["Wavelength"], df_a[well], colors.get("primary", "#0F4D92"), labels[0], opts)
        _draw_scatter_line(ax, df_b["Wavelength"], df_b[well], colors.get("secondary", "#8BCF8B"), labels[1], opts)
        ylim = shared_ylim or _axis_limits(_finite_values([df_a[well], df_b[well]]), normalized, config)
        ax.set_ylim(*ylim)
        ax.set_title(well, fontsize=7)
        ax.tick_params(labelsize=5, length=2)
    _finish_empty_axes(axes, rows, cols, set(wells))
    handles, labels_out = axes[0, 0].get_legend_handles_labels()
    if handles:
        fig.legend(handles, labels_out, loc="upper right", fontsize=8)
    fig.suptitle(title, fontsize=12)
    fig.tight_layout(rect=(0, 0, 1, 0.96))
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path)
    plt.close(fig)
    return path


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
    rows, cols = _grid(wells, config)
    fig, axes = plt.subplots(len(rows), len(cols), figsize=(max(12, len(cols) * 1.1), max(7, len(rows) * 0.9)), squeeze=False)
    color = _colors(config).get("primary", "#0F4D92")
    opts = _plot_options(config)
    per_well = config.get("plotting", {}).get("y_axis", {}).get("per_well", True)
    shared_ylim = None if per_well else _global_limits([df], wells, normalized, config)

    for well in wells:
        ax = _axis_for_well(axes, well, rows, cols)
        _draw_scatter_line(ax, df["Wavelength"], df[well], color, None, opts)
        ylim = shared_ylim or _axis_limits(_finite_values([df[well]]), normalized, config)
        ax.set_ylim(*ylim)
        ax.set_title(well, fontsize=7)
        ax.tick_params(labelsize=5, length=2)
    _finish_empty_axes(axes, rows, cols, set(wells))
    fig.suptitle(title, fontsize=12)
    fig.tight_layout(rect=(0, 0, 1, 0.96))
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path)
    plt.close(fig)
    return path


def plot_heatmap(values: dict[str, float], output_path: str | Path, config: dict, title: str, cbar_label: str) -> Path:
    apply_nature_style(config)
    grid = well_grid_values(values, config)
    data = grid.astype(float).to_numpy()
    fig, ax = plt.subplots(figsize=(max(7, data.shape[1] * 0.45), max(4, data.shape[0] * 0.45)))
    im = ax.imshow(data, cmap=_colors(config).get("heatmap", "viridis"), aspect="auto")
    ax.set_xticks(np.arange(len(grid.columns)), labels=grid.columns, fontsize=7)
    ax.set_yticks(np.arange(len(grid.index)), labels=grid.index, fontsize=7)
    for r in range(data.shape[0]):
        for c in range(data.shape[1]):
            if np.isfinite(data[r, c]):
                ax.text(c, r, f"{data[r, c]:.2f}", ha="center", va="center", fontsize=5)
    ax.set_title(title)
    fig.colorbar(im, ax=ax, label=cbar_label)
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)
    return path


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
    # Browser edition keeps the combined report contract by writing the heatmap page.
    return plot_heatmap(heatmap_values, output_path, config, title, heatmap_label)
