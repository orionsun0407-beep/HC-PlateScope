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
    for well in wells:
        ax = _axis_for_well(axes, well, rows, cols)
        ax.plot(df_a["Wavelength"], df_a[well], color=colors.get("primary", "#0F4D92"), lw=0.8, label=labels[0])
        ax.plot(df_b["Wavelength"], df_b[well], color=colors.get("secondary", "#8BCF8B"), lw=0.8, label=labels[1])
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
    for well in wells:
        ax = _axis_for_well(axes, well, rows, cols)
        ax.plot(df["Wavelength"], df[well], color=color, lw=0.8)
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
