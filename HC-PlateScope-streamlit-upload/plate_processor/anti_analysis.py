from __future__ import annotations

from pathlib import Path

import pandas as pd

from .analysis_common import common_wells_or_raise, copy_or_write_upload, finish_run
from .io import read_table, validate_standard_table
from .logging_utils import create_run
from .plotting import plot_grid_two_series
from .preprocessing import normalize_max_per_well_with_summary
from .utils import plate_layout, warning_if_negative


def run_anti_analysis(excitation_obj, emission_obj, excitation_name: str, emission_name: str, config: dict) -> dict:
    run = create_run("anti", config)
    run_dir = Path(run["run_dir"])
    warnings: list[str] = []
    log = [f"Created run {run['run_id']}", "anti normalize=true; normalization_method=column_max."]

    excitation_path, excitation_hash = copy_or_write_upload(excitation_obj, excitation_name, run_dir)
    emission_path, emission_hash = copy_or_write_upload(emission_obj, emission_name, run_dir)
    excitation_df, excitation_wells = validate_standard_table(read_table(excitation_path, excitation_name, config), "Excitation", config)
    emission_df, emission_wells = validate_standard_table(read_table(emission_path, emission_name, config), "Emission", config)
    wells, common_warnings = common_wells_or_raise(excitation_wells, emission_wells, "excitation", "emission")
    warnings.extend(common_warnings)
    warnings.extend(warning_if_negative(excitation_df, wells))
    warnings.extend(warning_if_negative(emission_df, wells))

    excitation_norm, excitation_summary, excitation_warnings = normalize_max_per_well_with_summary(
        excitation_df[["Wavelength"] + wells], wells, "Excitation"
    )
    emission_norm, emission_summary, emission_warnings = normalize_max_per_well_with_summary(
        emission_df[["Wavelength"] + wells], wells, "Emission"
    )
    warnings.extend(excitation_warnings)
    warnings.extend(emission_warnings)
    summary = pd.concat([excitation_summary, emission_summary], ignore_index=True)

    output_cfg = config.get("anti", {}).get("output", {})
    outputs: list[str] = []
    if output_cfg.get("save_normalized_excitation", True):
        excitation_out = run_dir / "tables" / "anti_excitation_normalized.xlsx"
        excitation_norm.to_excel(excitation_out, index=False)
        outputs.append(str(excitation_out))
    if output_cfg.get("save_normalized_emission", True):
        emission_out = run_dir / "tables" / "anti_emission_normalized.xlsx"
        emission_norm.to_excel(emission_out, index=False)
        outputs.append(str(emission_out))

    summary_path = run_dir / "tables" / "anti_summary.csv"
    summary.to_csv(summary_path, index=False)
    outputs.append(str(summary_path))

    if output_cfg.get("save_grid_pdf", True):
        grid_path = run_dir / "figures" / "anti_grid_plots.pdf"
        plot_grid_two_series(
            excitation_norm,
            emission_norm,
            wells,
            ("Excitation", "Emission"),
            grid_path,
            config,
            "anti normalized spectra",
            normalized=True,
            module_key="anti",
        )
        outputs.append(str(grid_path))
    if output_cfg.get("save_combined_report", True):
        report_path = run_dir / "report" / "anti_combined_report.pdf"
        plot_grid_two_series(
            excitation_norm,
            emission_norm,
            wells,
            ("Excitation", "Emission"),
            report_path,
            config,
            "anti normalized spectra report",
            normalized=True,
            module_key="anti",
        )
        outputs.append(str(report_path))

    metadata = {
        "run_id": run["run_id"],
        "timestamp": run["timestamp"],
        "module_type": "anti",
        "plate_format": plate_layout(config, wells)[0],
        "normalize": True,
        "normalization_method": "column_max",
        "input_files": [excitation_name, emission_name],
        "input_excitation_file": excitation_name,
        "input_emission_file": emission_name,
        "input_sha256": {excitation_name: excitation_hash, emission_name: emission_hash},
        "common_well_count": len(wells),
        "parameters": {"anti": config.get("anti", {}), "plot": config.get("plot", {}), "plotting": config.get("plotting", {})},
        "output_files": outputs,
        "output_dir": str(run_dir),
        "warnings": warnings,
    }
    result = finish_run(config, run, metadata, log + [f"Processed {len(wells)} common wells."] + warnings)
    result.update(
        {
            "excitation_normalized": excitation_norm,
            "emission_normalized": emission_norm,
            "summary": summary,
            "output_files": result["metadata"]["output_files"],
        }
    )
    return result
