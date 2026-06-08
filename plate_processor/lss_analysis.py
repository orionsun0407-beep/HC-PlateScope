from __future__ import annotations

import math
from pathlib import Path

import pandas as pd

from .analysis_common import common_wells_or_raise, copy_or_write_upload, finish_run
from .io import read_table, validate_standard_table
from .logging_utils import create_run
from .plotting import combined_report_with_heatmap, plot_grid_two_series, plot_heatmap
from .utils import plate_layout, warning_if_negative


def _peak_for_well(df: pd.DataFrame, well: str) -> tuple[object, object]:
    signal = pd.to_numeric(df[well], errors="coerce")
    if signal.notna().sum() == 0:
        return pd.NA, pd.NA
    idx = signal.idxmax()
    wavelength = pd.to_numeric(df.loc[[idx], "Wavelength"], errors="coerce").iloc[0]
    value = signal.loc[idx]
    return (
        float(wavelength) if pd.notna(wavelength) else pd.NA,
        float(value) if pd.notna(value) else pd.NA,
    )


def _top10_count(total: int) -> int:
    return max(1, int(math.ceil(total * 0.10))) if total else 0


def _summary(emission_df: pd.DataFrame, excitation_df: pd.DataFrame, wells: list[str]) -> pd.DataFrame:
    rows = []
    for well in wells:
        emission_peak_wavelength, emission_max = _peak_for_well(emission_df, well)
        excitation_peak_wavelength, excitation_max = _peak_for_well(excitation_df, well)
        peak_distance = (
            abs(float(emission_peak_wavelength) - float(excitation_peak_wavelength))
            if pd.notna(emission_peak_wavelength) and pd.notna(excitation_peak_wavelength)
            else pd.NA
        )
        rows.append(
            {
                "well_id": well,
                "emission_peak_wavelength": emission_peak_wavelength,
                "emission_max": emission_max,
                "excitation_peak_wavelength": excitation_peak_wavelength,
                "excitation_max": excitation_max,
                "peak_wavelength_distance": peak_distance,
            }
        )
    summary = pd.DataFrame(rows)
    for metric, rank_col, flag_col in [
        ("emission_max", "emission_rank", "emission_top10"),
        ("excitation_max", "excitation_rank", "excitation_top10"),
        ("peak_wavelength_distance", "peak_distance_rank", "peak_distance_top10"),
    ]:
        numeric = pd.to_numeric(summary[metric], errors="coerce")
        count = int(numeric.notna().sum())
        top_n = _top10_count(count)
        summary[rank_col] = numeric.rank(method="min", ascending=False)
        summary[flag_col] = False
        if top_n:
            cutoff = numeric.nlargest(top_n).min()
            summary[flag_col] = numeric.ge(cutoff)
    return summary


def _badge_color(config: dict, key: str, default: str) -> str:
    return str(config.get("plotting", {}).get("badges", {}).get(key, default))


def _lss_highlights(summary: pd.DataFrame, config: dict) -> dict[str, list[dict]]:
    highlights: dict[str, list[dict]] = {}
    styles = [
        ("emission_top10", {"text": "E", "color": _badge_color(config, "lss_emission", "#B64342"), "label": "Emission top 10%"}),
        ("excitation_top10", {"text": "X", "color": _badge_color(config, "lss_excitation", "#0F4D92"), "label": "Excitation top 10%"}),
        ("peak_distance_top10", {"text": "LSS", "color": _badge_color(config, "lss_distance", "#E28E2C"), "label": "LSS distance top 10%", "fontsize": 3.5}),
    ]
    for _, row in summary.iterrows():
        well = row["well_id"]
        for flag_col, style in styles:
            if bool(row.get(flag_col, False)):
                highlights.setdefault(well, []).append(style)
    return highlights


def _write_lss_peak_excel(summary: pd.DataFrame, output_path: Path) -> None:
    with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
        summary.to_excel(writer, index=False, sheet_name="all_wells")
        summary[summary["emission_top10"]].to_excel(writer, index=False, sheet_name="emission_top10")
        summary[summary["excitation_top10"]].to_excel(writer, index=False, sheet_name="excitation_top10")
        summary[summary["peak_distance_top10"]].to_excel(writer, index=False, sheet_name="LSS_distance_top10")


def run_lss_analysis(emission_obj, excitation_obj, emission_name: str, excitation_name: str, config: dict) -> dict:
    run = create_run("LSS", config)
    run_dir = Path(run["run_dir"])
    warnings: list[str] = []
    log = [f"Created run {run['run_id']}", "LSS normalize=false; using raw emission/excitation data."]

    emission_path, emission_hash = copy_or_write_upload(emission_obj, emission_name, run_dir)
    excitation_path, excitation_hash = copy_or_write_upload(excitation_obj, excitation_name, run_dir)
    emission_df, emission_wells = validate_standard_table(read_table(emission_path, emission_name, config), "Emission", config)
    excitation_df, excitation_wells = validate_standard_table(read_table(excitation_path, excitation_name, config), "Excitation", config)
    wells, common_warnings = common_wells_or_raise(emission_wells, excitation_wells, "emission", "excitation")
    warnings.extend(common_warnings)
    warnings.extend(warning_if_negative(emission_df, wells))
    warnings.extend(warning_if_negative(excitation_df, wells))

    emission_plot = emission_df[["Wavelength"] + wells]
    excitation_plot = excitation_df[["Wavelength"] + wells]
    summary = _summary(emission_plot, excitation_plot, wells)
    summary_path = run_dir / "tables" / "LSS_summary.csv"
    summary.to_csv(summary_path, index=False)
    peak_excel_path = run_dir / "tables" / "LSS_peak_top10.xlsx"
    _write_lss_peak_excel(summary, peak_excel_path)
    highlights = _lss_highlights(summary, config)
    distance_values = dict(zip(summary["well_id"], summary["peak_wavelength_distance"]))

    grid_path = run_dir / "figures" / "LSS_grid_plots.pdf"
    heat_path = run_dir / "figures" / "LSS_peak_distance_heatmap.pdf"
    report_path = run_dir / "report" / "LSS_combined_report.pdf"
    plot_grid_two_series(
        emission_plot,
        excitation_plot,
        wells,
        ("Emission", "Excitation"),
        grid_path,
        config,
        "LSS raw spectra",
        normalized=False,
        module_key="lss",
        highlights=highlights,
    )
    plot_heatmap(distance_values, heat_path, config, "LSS Stokes shift", "Stokes shift (nm)")
    combined_report_with_heatmap(
        "two",
        report_path,
        config,
        "LSS raw spectra and Stokes shift heatmap",
        distance_values,
        "Stokes shift (nm)",
        df_a=emission_plot,
        df_b=excitation_plot,
        wells=wells,
        labels=("Emission", "Excitation"),
        normalized=False,
        module_key="lss",
        highlights=highlights,
    )

    outputs = [str(summary_path), str(peak_excel_path), str(grid_path), str(heat_path), str(report_path)]
    metadata = {
        "run_id": run["run_id"],
        "timestamp": run["timestamp"],
        "module_type": "LSS",
        "plate_format": plate_layout(config, wells)[0],
        "normalize": False,
        "use_raw_data": True,
        "normalization_method": None,
        "input_files": [emission_name, excitation_name],
        "input_emission_file": emission_name,
        "input_excitation_file": excitation_name,
        "input_sha256": {emission_name: emission_hash, excitation_name: excitation_hash},
        "common_well_count": len(wells),
        "parameters": {"lss": config.get("lss", {}), "plot": config.get("plot", {}), "plotting": config.get("plotting", {})},
        "output_files": outputs,
        "output_dir": str(run_dir),
        "warnings": warnings,
    }
    result = finish_run(config, run, metadata, log + [f"Processed {len(wells)} common wells."] + warnings)
    result.update(
        {
            "summary": summary,
            "emission_raw": emission_plot,
            "excitation_raw": excitation_plot,
            # Compatibility for the existing Streamlit page, which still expects these keys.
            "emission_normalized": emission_plot,
            "excitation_normalized": excitation_plot,
            "output_files": result["metadata"]["output_files"],
        }
    )
    return result
