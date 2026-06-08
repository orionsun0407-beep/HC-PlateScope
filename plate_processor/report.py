from __future__ import annotations

from pathlib import Path

import pandas as pd

from .analysis_common import copy_or_write_upload, finish_run
from .io import read_table, standardize_by_well, validate_standard_table
from .logging_utils import create_run
from .peak_analysis import geco_peak_ratio, luci_peak_summary
from .plotting import combined_report_with_heatmap, plot_grid_single_series, plot_grid_two_series, plot_heatmap
from .preprocessing import normalize_max_per_well
from .utils import plate_layout, sha256_file, sorted_wells, warning_if_negative


def _metadata(run: dict, module: str, inputs: list[str], warnings: list[str], outputs: list[str], config: dict, wells: list[str]) -> dict:
    return {
        "run_id": run["run_id"],
        "timestamp": run["timestamp"],
        "run_name": run.get("run_name", ""),
        "module_type": module,
        "plate_format": plate_layout(config, wells)[0],
        "input_files": inputs,
        "output_files": outputs,
        "output_dir": str(run["run_dir"]),
        "warnings": warnings,
    }


def run_wellid(input_obj, input_name: str, config: dict) -> dict:
    run = create_run("wellid", config)
    run_dir = Path(run["run_dir"])
    path, digest = copy_or_write_upload(input_obj, input_name, run_dir)
    df, info = standardize_by_well(path, config, filename=input_name)
    out_path = run_dir / "tables" / "wellid_standardized.xlsx"
    df.to_excel(out_path, index=False)
    meta = _metadata(run, "wellid", [input_name], [], [str(out_path)], config, [c for c in df.columns if c != "Wavelength"])
    meta["input_sha256"] = {input_name: digest}
    meta["standardization"] = info
    result = finish_run(config, run, meta, [f"Standardized {input_name}"])
    result.update({"standardized": df, "output_files": result["metadata"]["output_files"]})
    return result


def run_geco(with_obj, without_obj, with_name: str, without_name: str, config: dict) -> dict:
    run = create_run("geco", config)
    run_dir = Path(run["run_dir"])
    with_path, with_hash = copy_or_write_upload(with_obj, with_name, run_dir)
    without_path, without_hash = copy_or_write_upload(without_obj, without_name, run_dir)
    with_df, with_wells = validate_standard_table(read_table(with_path, with_name, config), "with CA", config)
    without_df, without_wells = validate_standard_table(read_table(without_path, without_name, config), "without CA", config)
    wells = sorted_wells(set(with_wells).intersection(without_wells), config)
    if not wells:
        raise ValueError("No common well IDs were found between with CA and without CA files.")
    warnings = warning_if_negative(with_df, wells) + warning_if_negative(without_df, wells)
    summary = geco_peak_ratio(with_df, without_df, wells)
    ratio_values = dict(zip(summary["well_id"], summary["ratio"]))
    outputs = []
    summary_path = run_dir / "tables" / "geco_peak_ratio.csv"
    summary.to_csv(summary_path, index=False)
    outputs.append(str(summary_path))
    grid_path = run_dir / "figures" / "geco_raw_spectra.pdf"
    plot_grid_two_series(with_df, without_df, wells, ("with CA", "without CA"), grid_path, config, "GECO raw spectra", False, "geco")
    outputs.append(str(grid_path))
    heatmap_path = run_dir / "figures" / "geco_ratio_heatmap.pdf"
    plot_heatmap(ratio_values, heatmap_path, config, "GECO peak ratio", "with CA / without CA")
    outputs.append(str(heatmap_path))
    report_path = run_dir / "report" / "geco_combined_report.pdf"
    combined_report_with_heatmap("two", report_path, config, "GECO report", ratio_values, "with CA / without CA", with_df, without_df, wells=wells, labels=("with CA", "without CA"), module_key="geco")
    outputs.append(str(report_path))
    meta = _metadata(run, "geco", [with_name, without_name], warnings, outputs, config, wells)
    meta["input_sha256"] = {with_name: with_hash, without_name: without_hash}
    result = finish_run(config, run, meta, [f"Processed {len(wells)} common wells."] + warnings)
    result.update({"summary": summary, "output_files": result["metadata"]["output_files"]})
    return result


def run_geco_384_paired(input_obj, input_name: str, config: dict) -> dict:
    path_config = {**config, "plate": {**config.get("plate", {}), "format": 384}}
    df, _ = validate_standard_table(read_table(input_obj, input_name, path_config), "384 GECO", path_config)
    with_cols = []
    without_cols = []
    for well in [c for c in df.columns if c != "Wavelength"]:
        if int(well[1:]) % 2 == 0:
            with_cols.append(well)
        else:
            without_cols.append(well)
    with_df = df[["Wavelength"] + with_cols].rename(columns={w: f"{w[0]}{int(w[1:])-1:02d}" for w in with_cols})
    without_df = df[["Wavelength"] + without_cols]
    return run_geco(Path(input_obj), Path(input_obj), input_name, input_name, path_config) if False else _run_geco_from_tables(with_df, without_df, input_name, path_config)


def _run_geco_from_tables(with_df: pd.DataFrame, without_df: pd.DataFrame, input_name: str, config: dict) -> dict:
    run = create_run("geco384", config)
    run_dir = Path(run["run_dir"])
    wells = sorted_wells(set(with_df.columns[1:]).intersection(without_df.columns[1:]), config)
    warnings = warning_if_negative(with_df, wells) + warning_if_negative(without_df, wells)
    summary = geco_peak_ratio(with_df, without_df, wells)
    ratio_values = dict(zip(summary["well_id"], summary["ratio"]))
    outputs = []
    summary_path = run_dir / "tables" / "geco_384_peak_ratio.csv"
    summary.to_csv(summary_path, index=False)
    outputs.append(str(summary_path))
    grid_path = run_dir / "figures" / "geco_384_raw_spectra.pdf"
    plot_grid_two_series(with_df, without_df, wells, ("with CA", "without CA"), grid_path, config, "GECO 384 raw spectra", False, "geco")
    outputs.append(str(grid_path))
    heatmap_path = run_dir / "figures" / "geco_384_ratio_heatmap.pdf"
    plot_heatmap(ratio_values, heatmap_path, config, "GECO 384 peak ratio", "with CA / without CA")
    outputs.append(str(heatmap_path))
    meta = _metadata(run, "geco384", [input_name], warnings, outputs, config, wells)
    result = finish_run(config, run, meta, [f"Processed {len(wells)} paired wells."] + warnings)
    result.update({"summary": summary, "output_files": result["metadata"]["output_files"]})
    return result


def run_luci(input_obj, input_name: str, config: dict) -> dict:
    run = create_run("luci", config)
    run_dir = Path(run["run_dir"])
    path, digest = copy_or_write_upload(input_obj, input_name, run_dir)
    df, wells = validate_standard_table(read_table(path, input_name, config), "LUCI", config)
    norm = normalize_max_per_well(df, wells)
    peak450 = tuple(config.get("peaks", {}).get("luci_450_window", [430, 470]))
    peak520 = tuple(config.get("peaks", {}).get("luci_520_window", [500, 540]))
    summary = luci_peak_summary(norm, wells, peak450, peak520)
    ratio_values = dict(zip(summary["well_id"], summary["ratio_520_450"]))
    outputs = []
    norm_path = run_dir / "tables" / "luci_normalized.xlsx"
    norm.to_excel(norm_path, index=False)
    outputs.append(str(norm_path))
    summary_path = run_dir / "tables" / "luci_peak_summary.csv"
    summary.to_csv(summary_path, index=False)
    outputs.append(str(summary_path))
    grid_path = run_dir / "figures" / "luci_normalized_spectra.pdf"
    plot_grid_single_series(norm, wells, grid_path, config, "LUCI normalized spectra", True, "luci")
    outputs.append(str(grid_path))
    heatmap_path = run_dir / "figures" / "luci_ratio_heatmap.pdf"
    plot_heatmap(ratio_values, heatmap_path, config, "LUCI 520/450 ratio", "520 / 450")
    outputs.append(str(heatmap_path))
    warnings = warning_if_negative(df, wells)
    meta = _metadata(run, "luci", [input_name], warnings, outputs, config, wells)
    meta["input_sha256"] = {input_name: digest}
    result = finish_run(config, run, meta, [f"Processed {len(wells)} wells."] + warnings)
    result.update({"normalized": norm, "summary": summary, "output_files": result["metadata"]["output_files"]})
    return result


def run_lss(emission_obj, excitation_obj, emission_name: str, excitation_name: str, config: dict) -> dict:
    run = create_run("lss", config)
    run_dir = Path(run["run_dir"])
    emission_path, eh = copy_or_write_upload(emission_obj, emission_name, run_dir)
    excitation_path, xh = copy_or_write_upload(excitation_obj, excitation_name, run_dir)
    emission_df, emission_wells = validate_standard_table(read_table(emission_path, emission_name, config), "Emission", config)
    excitation_df, excitation_wells = validate_standard_table(read_table(excitation_path, excitation_name, config), "Excitation", config)
    wells = sorted_wells(set(emission_wells).intersection(excitation_wells), config)
    warnings = warning_if_negative(emission_df, wells) + warning_if_negative(excitation_df, wells)
    outputs = []
    grid_path = run_dir / "figures" / "lss_raw_spectra.pdf"
    plot_grid_two_series(emission_df, excitation_df, wells, ("Emission", "Excitation"), grid_path, config, "LSS raw spectra", False, "lss")
    outputs.append(str(grid_path))
    summary = pd.DataFrame({"well_id": wells})
    summary_path = run_dir / "tables" / "lss_summary.csv"
    summary.to_csv(summary_path, index=False)
    outputs.append(str(summary_path))
    meta = _metadata(run, "lss", [emission_name, excitation_name], warnings, outputs, config, wells)
    meta["input_sha256"] = {emission_name: eh, excitation_name: xh}
    result = finish_run(config, run, meta, [f"Processed {len(wells)} common wells."] + warnings)
    result.update({"summary": summary, "output_files": result["metadata"]["output_files"]})
    return result
