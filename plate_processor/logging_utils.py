from __future__ import annotations

import json
import re
import uuid
from datetime import datetime
from pathlib import Path

import pandas as pd

from .utils import save_yaml


def _run_name(config: dict) -> str:
    name = str(config.get("run_name", "") or config.get("project_name", "")).strip()
    return name


def _slug(value: str) -> str:
    text = re.sub(r"[^\w-]+", "_", value.strip(), flags=re.UNICODE)
    text = re.sub(r"_+", "_", text).strip("_")
    return text[:40]


def create_run(module_type: str, config: dict) -> dict:
    timestamp = datetime.now().isoformat(timespec="seconds")
    run_name = _run_name(config)
    slug = _slug(run_name)
    name_part = f"_{slug}" if slug else ""
    run_id = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{module_type.lower()}{name_part}_{uuid.uuid4().hex[:8]}"
    base_dir = Path(config.get("output", {}).get("base_dir", "outputs"))
    run_dir = base_dir / run_id
    for sub in ["figures", "tables", "report"]:
        (run_dir / sub).mkdir(parents=True, exist_ok=True)
    return {"run_id": run_id, "timestamp": timestamp, "run_dir": run_dir, "run_name": run_name}


def write_log(run_dir: str | Path, lines: list[str]) -> Path:
    path = Path(run_dir) / "processing_log.txt"
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


def save_metadata(run_dir: str | Path, metadata: dict) -> Path:
    path = Path(run_dir) / "run_metadata.json"
    path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def save_config_snapshot(run_dir: str | Path, config: dict) -> Path:
    path = Path(run_dir) / "config_snapshot.yaml"
    save_yaml(config, path)
    return path


def append_run_index(config: dict, metadata: dict) -> None:
    index_path = Path(config.get("output", {}).get("run_index", "outputs/run_index.csv"))
    index_path.parent.mkdir(parents=True, exist_ok=True)
    row = {
        "run_name": metadata.get("run_name", ""),
        "run_id": metadata.get("run_id"),
        "timestamp": metadata.get("timestamp"),
        "module_type": metadata.get("module_type"),
        "input_files": "; ".join(metadata.get("input_files", [])),
        "output_dir": metadata.get("output_dir"),
        "warnings": " | ".join(metadata.get("warnings", [])),
    }
    if index_path.exists():
        df = pd.read_csv(index_path)
        df = pd.concat([df, pd.DataFrame([row])], ignore_index=True)
    else:
        df = pd.DataFrame([row])
    df.to_csv(index_path, index=False)
