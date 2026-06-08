from __future__ import annotations

import hashlib
import math
import re
from pathlib import Path
from typing import Iterable

import numpy as np
import pandas as pd
import yaml


PLATE_FORMATS = {
    96: {"rows": list("ABCDEFGH"), "cols": list(range(1, 13))},
    384: {"rows": list("ABCDEFGHIJKLMNOP"), "cols": list(range(1, 25))},
}
ROWS = PLATE_FORMATS[384]["rows"]
COLS = PLATE_FORMATS[384]["cols"]


def load_config(path: str | Path = "config.yaml") -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def save_yaml(data: dict, path: str | Path) -> None:
    with open(path, "w", encoding="utf-8") as f:
        yaml.safe_dump(data, f, allow_unicode=True, sort_keys=False)


def plate_format_from_config(config: dict | None = None) -> int | str:
    value = (config or {}).get("plate", {}).get("format", "auto")
    if isinstance(value, int):
        return value if value in PLATE_FORMATS else "auto"
    text = str(value).strip().lower()
    if text in {"96", "96-well", "96_well"}:
        return 96
    if text in {"384", "384-well", "384_well"}:
        return 384
    return "auto"


def normalize_well_id(value: object, plate_format: int | str = "auto") -> str | None:
    text = str(value).strip().upper()
    match = re.fullmatch(r"([A-P])\s*0?([1-9]|1[0-9]|2[0-4])", text)
    if not match:
        return None
    row = match.group(1)
    col = int(match.group(2))
    fmt = plate_format_from_config({"plate": {"format": plate_format}})
    if fmt == 96 and (row not in PLATE_FORMATS[96]["rows"] or col not in PLATE_FORMATS[96]["cols"]):
        return None
    if fmt == 384 and (row not in PLATE_FORMATS[384]["rows"] or col not in PLATE_FORMATS[384]["cols"]):
        return None
    return f"{row}{col:02d}"


def detect_plate_format(wells: Iterable[str]) -> int:
    normalized = [w for w in (normalize_well_id(x) for x in wells) if w]
    for well in normalized:
        if well[0] not in PLATE_FORMATS[96]["rows"] or int(well[1:]) > 12:
            return 384
    return 96


def plate_layout(config: dict | None = None, wells: Iterable[str] | None = None) -> tuple[int, list[str], list[int]]:
    fmt = plate_format_from_config(config)
    if fmt == "auto":
        fmt = detect_plate_format(wells or [])
    layout = PLATE_FORMATS[int(fmt)]
    return int(fmt), list(layout["rows"]), list(layout["cols"])


def sorted_wells(wells: Iterable[str], config: dict | None = None) -> list[str]:
    fmt = plate_format_from_config(config)
    normalized = [w for w in (normalize_well_id(x, fmt) for x in wells) if w]
    return sorted(set(normalized), key=lambda w: (ROWS.index(w[0]), int(w[1:])))


def well_grid_values(values: dict[str, float], config: dict | None = None) -> pd.DataFrame:
    _, rows, cols = plate_layout(config, values.keys())
    grid = pd.DataFrame(index=rows, columns=[str(c) for c in cols], dtype=float)
    for well, value in values.items():
        well_id = normalize_well_id(well)
        if well_id and well_id[0] in rows and int(well_id[1:]) in cols:
            grid.loc[well_id[0], str(int(well_id[1:]))] = value
    return grid


def sha256_file(path: str | Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def safe_numeric(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series, errors="coerce")


def nice_upper_limit(value: float) -> float:
    if not np.isfinite(value) or value <= 0:
        return 1.0
    exponent = math.floor(math.log10(value))
    fraction = value / (10**exponent)
    if fraction <= 1:
        nice = 1
    elif fraction <= 2:
        nice = 2
    elif fraction <= 2.5:
        nice = 2.5
    elif fraction <= 5:
        nice = 5
    else:
        nice = 10
    return nice * (10**exponent)


def warning_if_negative(df: pd.DataFrame, wells: list[str]) -> list[str]:
    warnings: list[str] = []
    numeric = df[wells].apply(pd.to_numeric, errors="coerce")
    if (numeric < 0).any().any():
        warnings.append("Detected negative signal values; values were kept and processed as provided.")
    if numeric.isna().any().any():
        warnings.append("Detected missing or non-numeric signal values; affected points were ignored in calculations/plots.")
    return warnings


def ensure_unique_columns(columns: Iterable[object]) -> list[str]:
    seen: dict[str, int] = {}
    result: list[str] = []
    for col in columns:
        name = str(col).strip()
        if name in seen:
            seen[name] += 1
            name = f"{name}.{seen[name]}"
        else:
            seen[name] = 0
        result.append(name)
    return result


def relative_to(path: str | Path, base: str | Path) -> str:
    try:
        return str(Path(path).resolve().relative_to(Path(base).resolve()))
    except ValueError:
        return str(path)
