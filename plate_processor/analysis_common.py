from __future__ import annotations

import shutil
from pathlib import Path
from typing import BinaryIO

from .logging_utils import append_run_index, save_config_snapshot, save_metadata, write_log
from .utils import sha256_file, sorted_wells, warning_if_negative


def copy_or_write_upload(file_obj: str | Path | BinaryIO, filename: str, run_dir: Path) -> tuple[Path, str]:
    input_dir = run_dir / "inputs"
    input_dir.mkdir(exist_ok=True)
    path = input_dir / Path(filename).name
    if isinstance(file_obj, (str, Path)):
        shutil.copyfile(file_obj, path)
    else:
        data = file_obj.getvalue() if hasattr(file_obj, "getvalue") else file_obj.read()
        path.write_bytes(data)
    return path, sha256_file(path)


def finish_run(config: dict, run: dict, metadata: dict, log_lines: list[str]) -> dict:
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


def common_wells_or_raise(left_wells: list[str], right_wells: list[str], left_name: str, right_name: str) -> tuple[list[str], list[str]]:
    wells = sorted_wells(set(left_wells).intersection(right_wells))
    if not wells:
        raise ValueError(f"No common well IDs were found between {left_name} and {right_name} files.")
    warnings: list[str] = []
    missing = sorted_wells(set(left_wells).symmetric_difference(right_wells))
    if missing:
        warnings.append(f"Well IDs differ between files; only common wells were processed. Different wells: {', '.join(missing)}")
    return wells, warnings
