from __future__ import annotations

import shutil
import tempfile
from pathlib import Path
from typing import BinaryIO

import pandas as pd

from .io import read_table, standardize_by_well, validate_standard_table
from .lss_analysis import run_lss_analysis
from .logging_utils import append_run_index, create_run, save_config_snapshot, save_metadata, write_log
from .peak_analysis import geco_peak_ratio, luci_peak_summary
from .plotting import combined_report_with_heatmap, plot_grid_single_series, plot_grid_two_series, plot_heatmap
from .preprocessing import normalize_max_per_well
from .utils import plate_layout, relative_to, sha256_file, sorted_wells, warning_if_negative


def _copy_or_write_upload(file_obj: str | Path | BinaryIO, filename: str, run_dir: Path) -> tuple[Path, str]:
    input_dir = run_dir / "inputs"
    input_dir.mkdir(exist_ok=True)
    path = input_dir / Path(filename).name
    if isinstance(file_obj, (str, Path)):
        shutil.copyfile(file_obj, path)
    else:
        data = file_obj.getvalue() if hasattr(file_obj, "getvalue") else file_obj.read()
        path.write_bytes(data)
    return path, sha256_file(path)


def _finish_run(config: dict, run: dict, metadata: dict, log_lines: list[str]) -> dict:
    run_dir = Path(run["run_dir"])
    config_path = save_config_snapshot(run_dir, config)
    log_path = write_log(run_dir, log_lines)
    metadata_path = run_dir / "run_metadata.json"
    output_files = list(metadata.get("output_files", []))
    for path in [config_path, log_path, metadata_path]:
        path_str = str(path)
        if path_str not in output_files:
            output_files.append(path_str)
    metadata.setdefault("run_name", run.get("run_name", ""))
    metadata["output_files"] = output_files
    save_metadata(run_dir, metadata)
    append_run_index(config, metadata)
    return {"run_dir": run_dir, "metadata": metadata, "output_files": output_files}


def _badge_color(config: dict, key: str, default: str) -> str:
    return str(config.get("plotting", {}).get("badges", {}).get(key, default))


def _ratio_highlights(
    ratios: dict[str, float],
    config: dict,
    badge_key: str,
    default_color: str,
    prefix: str = "",
) -> dict[str, list[dict]]:
    color = _badge_color(config, badge_key, default_color)
    highlights: dict[str, list[dict]] = {}
    for well, ratio in ratios.items():
        if pd.notna(ratio):
            text = f"{prefix}{float(ratio):.2f}" if prefix else f"{float(ratio):.2f}"
            highlights[str(well)] = [{"text": text, "color": color, "label": badge_key, "fontsize": 3.5, "y": 0.80}]
    return highlights


def run_wellid(file_obj: str | Path | BinaryIO, filename: str, config: dict) -> dict:
    run = create_run("WellID", config)
    run_dir = Path(run["run_dir"])
    warnings: list[str] = []
    log = [f"Created run {run['run_id']}"]
    input_path, digest = _copy_or_write_upload(file_obj, filename, run_dir)
    df, info = standardize_by_well(input_path, config, filename=filename)
    wells = [c for c in df.columns if c != "Wavelength"]
    warnings.extend(warning_if_negative(df, wells))
    out_path = run_dir / "tables" / "standardized_by_well.xlsx"
    df.to_excel(out_path, index=False)
    log.append(f"Standardized {len(wells)} wells using {info.get('format')} format.")
    outputs = [str(out_path)]
    metadata = {
        "run_id": run["run_id"],
        "timestamp": run["timestamp"],
        "module_type": "WellID",
        "plate_format": plate_layout(config, wells)[0],
        "input_files": [filename],
        "input_sha256": {filename: digest},
        "parameters": {},
        "recognition": info,
        "output_files": outputs,
        "output_dir": str(run_dir),
        "warnings": warnings,
    }
    result = _finish_run(config, run, metadata, log + warnings)
    result.update({"standardized": df, "output_files": result["metadata"]["output_files"]})
    return result


def run_geco(with_ca_obj, without_ca_obj, with_ca_name: str, without_ca_name: str, config: dict) -> dict:
    run = create_run("GECO", config)
    run_dir = Path(run["run_dir"])
    warnings: list[str] = []
    log = [f"Created run {run['run_id']}"]
    with_path, with_hash = _copy_or_write_upload(with_ca_obj, with_ca_name, run_dir)
    without_path, without_hash = _copy_or_write_upload(without_ca_obj, without_ca_name, run_dir)
    with_df, with_wells = validate_standard_table(read_table(with_path, with_ca_name, config), "with ca", config)
    without_df, without_wells = validate_standard_table(read_table(without_path, without_ca_name, config), "without ca", config)
    wells = sorted_wells(set(with_wells).intersection(without_wells), config)
    if not wells:
        raise ValueError("No common well IDs were found between with ca and without ca files.")
    missing = sorted_wells(set(with_wells).symmetric_difference(without_wells), config)
    if missing:
        warnings.append(f"Well IDs differ between files; only common wells were processed. Different wells: {', '.join(missing)}")
    warnings.extend(warning_if_negative(with_df, wells))
    warnings.extend(warning_if_negative(without_df, wells))

    ratio_df = geco_peak_ratio(with_df, without_df, wells)
    table_path = run_dir / "tables" / "GECO_peak_ratio.csv"
    ratio_df.to_csv(table_path, index=False)
    heat_values = dict(zip(ratio_df["well_id"], ratio_df["ratio"]))

    grid_path = run_dir / "figures" / "GECO_grid_plots.pdf"
    heat_path = run_dir / "figures" / "GECO_heatmap.pdf"
    report_path = run_dir / "report" / "GECO_combined_report.pdf"
    highlights = _ratio_highlights(heat_values, config, "geco_ratio", "#42949E")
    plot_grid_two_series(with_df, without_df, wells, ("with ca", "without ca"), grid_path, config, "GECO spectra by well", module_key="geco", highlights=highlights)
    plot_heatmap(heat_values, heat_path, config, "GECO max(with ca) / max(without ca)", "ratio")
    combined_report_with_heatmap(
        "two",
        report_path,
        config,
        "GECO spectra and peak ratio heatmap",
        heat_values,
        "ratio",
        df_a=with_df,
        df_b=without_df,
        wells=wells,
        labels=("with ca", "without ca"),
        normalized=False,
        module_key="geco",
        highlights=highlights,
    )
    outputs = [str(table_path), str(grid_path), str(heat_path), str(report_path)]
    metadata = {
        "run_id": run["run_id"],
        "timestamp": run["timestamp"],
        "module_type": "GECO",
        "plate_format": plate_layout(config, wells)[0],
        "input_files": [with_ca_name, without_ca_name],
        "input_sha256": {with_ca_name: with_hash, without_ca_name: without_hash},
        "common_well_count": len(wells),
        "parameters": config,
        "output_files": outputs,
        "output_dir": str(run_dir),
        "warnings": warnings,
    }
    result = _finish_run(config, run, metadata, log + [f"Processed {len(wells)} common wells."] + warnings)
    result.update(
        {
            "summary": ratio_df,
            "with_ca": with_df[["Wavelength"] + wells],
            "without_ca": without_df[["Wavelength"] + wells],
            "output_files": result["metadata"]["output_files"],
        }
    )
    return result


def _geco_384_pairs(wells: list[str]) -> tuple[list[tuple[str, str]], list[str]]:
    well_set = set(wells)
    pairs: list[tuple[str, str]] = []
    warnings: list[str] = []
    for well in wells:
        col = int(well[1:])
        if col % 2 != 1:
            continue
        partner = f"{well[0]}{col + 1:02d}"
        if partner in well_set:
            pairs.append((well, partner))
        else:
            warnings.append(f"GECO 384 pairing: {well} has no adjacent even-column with-CA partner {partner}; skipped.")
    for well in wells:
        col = int(well[1:])
        if col % 2 == 0 and f"{well[0]}{col - 1:02d}" not in well_set:
            warnings.append(f"GECO 384 pairing: {well} has no adjacent odd-column without-CA partner; skipped.")
    return pairs, warnings


def run_geco_384_paired(file_obj, filename: str, config: dict) -> dict:
    run = create_run("GECO", config)
    run_dir = Path(run["run_dir"])
    warnings: list[str] = []
    log = [f"Created run {run['run_id']}", "GECO 384 single-file paired mode: odd columns=without CA, even columns=with CA."]
    input_path, digest = _copy_or_write_upload(file_obj, filename, run_dir)
    df, wells = validate_standard_table(read_table(input_path, filename, config), "GECO 384 paired input", config)
    pairing, pair_warnings = _geco_384_pairs(wells)
    warnings.extend(pair_warnings)
    if not pairing:
        raise ValueError("No odd/even adjacent GECO pairs were found. Expected pairs like A05 without CA and A06 with CA.")

    pair_wells = [without_well for without_well, _ in pairing]
    with_data = {"Wavelength": df["Wavelength"]}
    without_data = {"Wavelength": df["Wavelength"]}
    pair_lookup = {}
    for without_well, with_well in pairing:
        without_data[without_well] = df[without_well]
        with_data[without_well] = df[with_well]
        pair_lookup[without_well] = with_well
    with_df = pd.DataFrame(with_data)
    without_df = pd.DataFrame(without_data)

    warnings.extend(warning_if_negative(df, [well for pair in pairing for well in pair]))
    ratio_df = geco_peak_ratio(with_df, without_df, pair_wells)
    ratio_df.insert(1, "without_ca_well", ratio_df["well_id"])
    ratio_df.insert(2, "with_ca_well", ratio_df["well_id"].map(pair_lookup))
    ratio_df.insert(3, "pair_id", ratio_df["without_ca_well"] + "/" + ratio_df["with_ca_well"])
    table_path = run_dir / "tables" / "GECO_peak_ratio.csv"
    ratio_df.to_csv(table_path, index=False)
    heat_values = dict(zip(ratio_df["without_ca_well"], ratio_df["ratio"]))

    grid_path = run_dir / "figures" / "GECO_grid_plots.pdf"
    heat_path = run_dir / "figures" / "GECO_heatmap.pdf"
    report_path = run_dir / "report" / "GECO_combined_report.pdf"
    highlights = _ratio_highlights(heat_values, config, "geco_ratio", "#42949E")
    plot_grid_two_series(with_df, without_df, pair_wells, ("with CA (even well)", "without CA (odd well)"), grid_path, config, "GECO 384 paired spectra by well", module_key="geco", highlights=highlights)
    plot_heatmap(heat_values, heat_path, config, "GECO 384 paired max(with CA) / max(without CA)", "ratio")
    combined_report_with_heatmap(
        "two",
        report_path,
        config,
        "GECO 384 paired spectra and peak ratio heatmap",
        heat_values,
        "ratio",
        df_a=with_df,
        df_b=without_df,
        wells=pair_wells,
        labels=("with CA (even well)", "without CA (odd well)"),
        normalized=False,
        module_key="geco",
        highlights=highlights,
    )
    outputs = [str(table_path), str(grid_path), str(heat_path), str(report_path)]
    metadata = {
        "run_id": run["run_id"],
        "timestamp": run["timestamp"],
        "module_type": "GECO",
        "plate_format": 384,
        "geco_input_mode": "single_file_adjacent_pairs",
        "pairing_rule": "odd column without CA; adjacent even column with CA",
        "input_files": [filename],
        "input_sha256": {filename: digest},
        "common_well_count": len(pair_wells),
        "parameters": config,
        "output_files": outputs,
        "output_dir": str(run_dir),
        "warnings": warnings,
    }
    result = _finish_run(config, run, metadata, log + [f"Processed {len(pair_wells)} adjacent odd/even pairs."] + warnings)
    result.update(
        {
            "summary": ratio_df,
            "with_ca": with_df[["Wavelength"] + pair_wells],
            "without_ca": without_df[["Wavelength"] + pair_wells],
            "output_files": result["metadata"]["output_files"],
        }
    )
    return result


def run_luci(file_obj, filename: str, config: dict) -> dict:
    run = create_run("LUCI", config)
    run_dir = Path(run["run_dir"])
    warnings: list[str] = []
    log = [f"Created run {run['run_id']}"]
    input_path, digest = _copy_or_write_upload(file_obj, filename, run_dir)
    df, wells = validate_standard_table(read_table(input_path, filename, config), "LUCI input", config)
    warnings.extend(warning_if_negative(df, wells))
    norm = normalize_max_per_well(df, wells)

    normalized_path = run_dir / "tables" / "LUCI_normalized.xlsx"
    norm.to_excel(normalized_path, index=False)
    peaks_cfg = config.get("peaks", {})
    peak_df = luci_peak_summary(
        norm,
        wells,
        tuple(peaks_cfg.get("luci_450_window", [430, 470])),
        tuple(peaks_cfg.get("luci_520_window", [500, 540])),
    )
    peak_path = run_dir / "tables" / "LUCI_peak_summary.csv"
    peak_df.to_csv(peak_path, index=False)
    heat_values = dict(zip(peak_df["well_id"], peak_df["ratio_520_450"]))

    grid_path = run_dir / "figures" / "LUCI_grid_plots.pdf"
    heat_path = run_dir / "figures" / "LUCI_ratio_heatmap.pdf"
    report_path = run_dir / "report" / "LUCI_combined_report.pdf"
    luci_highlights = _ratio_highlights(heat_values, config, "luci_ratio", "#9A4D8E")
    plot_grid_single_series(norm, wells, grid_path, config, "LUCI normalized spectra", normalized=True, module_key="luci", highlights=luci_highlights)
    plot_heatmap(heat_values, heat_path, config, "LUCI 520/450 ratio", "ratio_520_450")
    combined_report_with_heatmap(
        "single",
        report_path,
        config,
        "LUCI spectra and 520/450 ratio heatmap",
        heat_values,
        "ratio_520_450",
        df_single=norm,
        wells=wells,
        normalized=True,
        module_key="luci",
        highlights=luci_highlights,
    )
    outputs = [str(normalized_path), str(peak_path), str(grid_path), str(heat_path), str(report_path)]
    metadata = {
        "run_id": run["run_id"],
        "timestamp": run["timestamp"],
        "module_type": "LUCI",
        "plate_format": plate_layout(config, wells)[0],
        "input_files": [filename],
        "input_sha256": {filename: digest},
        "common_well_count": len(wells),
        "parameters": config,
        "output_files": outputs,
        "output_dir": str(run_dir),
        "warnings": warnings,
    }
    result = _finish_run(config, run, metadata, log + [f"Processed {len(wells)} wells."] + warnings)
    result.update({"normalized": norm, "summary": peak_df, "output_files": result["metadata"]["output_files"]})
    return result


def run_lss(emission_obj, excitation_obj, emission_name: str, excitation_name: str, config: dict) -> dict:
    return run_lss_analysis(emission_obj, excitation_obj, emission_name, excitation_name, config)
