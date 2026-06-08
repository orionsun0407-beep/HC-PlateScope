from __future__ import annotations

import csv
import tempfile
from io import StringIO
from pathlib import Path
from typing import BinaryIO

import numpy as np
import pandas as pd

from .utils import ensure_unique_columns, normalize_well_id, plate_format_from_config, safe_numeric, sorted_wells


class PlateFormatError(ValueError):
    """Raised when an input file cannot be interpreted as plate data."""


def _csv_text(path_or_file: str | Path | BinaryIO) -> str:
    if isinstance(path_or_file, (str, Path)):
        return Path(path_or_file).read_text(encoding="utf-8-sig", errors="replace")
    if hasattr(path_or_file, "seek"):
        path_or_file.seek(0)
    data = path_or_file.read()
    if hasattr(path_or_file, "seek"):
        path_or_file.seek(0)
    if isinstance(data, bytes):
        return data.decode("utf-8-sig", errors="replace")
    return str(data)


def _score_csv_header(fields: list[str], config: dict | None = None) -> int:
    cleaned = [str(field).strip() for field in fields]
    if len([field for field in cleaned if field]) < 2:
        return 0
    keywords = [k.lower() for k in (config or {}).get("input", {}).get("wavelength_keywords", [])]
    if not keywords:
        keywords = ["wavelength", "wave", "lambda", "nm"]
    has_wavelength = any(_has_wavelength_keyword(field, keywords) for field in cleaned)
    well_count = sum(1 for field in cleaned if normalize_well_id(field))
    generic_cols = {"well", "well id", "well_id", "signal", "value", "intensity"}
    generic_score = sum(1 for field in cleaned if field.lower() in generic_cols)
    if not has_wavelength and not well_count and not generic_score:
        return 0
    return well_count * 10 + int(has_wavelength) * 25 + generic_score * 5 + min(len(cleaned), 30)


def _has_wavelength_keyword(field: object, keywords: list[str]) -> bool:
    name = str(field).strip().lower()
    for keyword in keywords:
        keyword = keyword.strip().lower()
        if not keyword:
            continue
        if keyword == "nm":
            if name == "nm" or "[nm]" in name or "(nm)" in name or name.endswith(" nm"):
                return True
            continue
        if keyword in name:
            return True
    return False


def _detect_csv_table_start(text: str, config: dict | None = None) -> tuple[int, str] | None:
    lines = text.splitlines()
    best: tuple[int, int, str] | None = None
    for delimiter in [",", "\t", ";"]:
        for idx, line in enumerate(lines[:250]):
            try:
                fields = next(csv.reader([line], delimiter=delimiter))
            except csv.Error:
                continue
            score = _score_csv_header(fields, config)
            if score and (best is None or score > best[0]):
                best = (score, idx, delimiter)
    if best is None:
        return None
    return best[1], best[2]


def _read_detected_csv_table(text: str, skiprows: int, delimiter: str) -> pd.DataFrame:
    """Read one CSV table from an instrument export that may contain footer blocks.

    Some plate-reader CSV files place a regular data table after metadata rows and
    then append a plate-layout table with a different column count. Pandas treats
    that as a malformed CSV. Here we keep the detected table width, trim empty
    trailing cells, and skip rows that clearly belong to another appended block.
    """
    lines = text.splitlines()
    reader = csv.reader(lines[skiprows:], delimiter=delimiter)
    try:
        header = next(reader)
    except StopIteration as exc:
        raise PlateFormatError("Could not parse CSV table: detected header row is empty.") from exc

    expected_fields = len(header)
    rows: list[list[str]] = []
    skipped_malformed = 0
    for row in reader:
        if not any(str(cell).strip() for cell in row):
            continue
        if len(row) > expected_fields:
            extra = row[expected_fields:]
            if all(not str(cell).strip() for cell in extra):
                row = row[:expected_fields]
            else:
                skipped_malformed += 1
                continue
        elif len(row) < expected_fields:
            row = row + [""] * (expected_fields - len(row))
        rows.append(row)

    if not rows:
        raise PlateFormatError("Could not parse CSV table: no data rows found after the detected header.")

    df = pd.DataFrame(rows, columns=header)
    df.attrs["skipped_malformed_csv_rows"] = skipped_malformed
    return df


def _read_csv_robust(path_or_file: str | Path | BinaryIO, config: dict | None = None) -> pd.DataFrame:
    text = _csv_text(path_or_file)
    start = _detect_csv_table_start(text, config)
    if start is not None:
        skiprows, delimiter = start
        try:
            return _read_detected_csv_table(text, skiprows, delimiter)
        except Exception as exc:
            if skiprows:
                raise PlateFormatError(f"Could not parse CSV table after skipping metadata rows: {exc}") from exc
    try:
        return pd.read_csv(StringIO(text))
    except pd.errors.ParserError:
        if start is None:
            raise PlateFormatError(
                "Could not parse CSV. The file may contain metadata rows or an unusual delimiter; "
                "please export a table whose header row contains Wavelength and well IDs."
            )
        skiprows, delimiter = start
        try:
            return _read_detected_csv_table(text, skiprows, delimiter)
        except Exception as exc:
            raise PlateFormatError(f"Could not parse CSV table after skipping metadata rows: {exc}") from exc


def _read_excel_or_csv(path_or_file: str | Path | BinaryIO, filename: str | None = None, config: dict | None = None) -> pd.DataFrame:
    name = filename or getattr(path_or_file, "name", "") or str(path_or_file)
    suffix = Path(name).suffix.lower()
    if suffix in {".xlsx", ".xls"}:
        df = _read_excel_robust(path_or_file, config)
    elif suffix == ".csv":
        df = _read_csv_robust(path_or_file, config)
    else:
        raise PlateFormatError(f"Unsupported file type '{suffix}'. Please upload .xlsx, .xls, or .csv.")
    if df.empty:
        raise PlateFormatError("Input file is empty.")
    df.columns = ensure_unique_columns(df.columns)
    return df


def _score_excel_header(fields: list[object], config: dict | None = None) -> int:
    cleaned = [str(field).strip() if pd.notna(field) else "" for field in fields]
    if len([field for field in cleaned if field]) < 2:
        return 0
    keywords = [k.lower() for k in (config or {}).get("input", {}).get("wavelength_keywords", [])]
    if not keywords:
        keywords = ["wavelength", "wave", "lambda", "nm"]
    has_wavelength = any(_has_wavelength_keyword(field, keywords) for field in cleaned)
    well_count = sum(1 for field in cleaned if normalize_well_id(field))
    generic_cols = {"well", "well id", "well_id", "signal", "value", "intensity"}
    generic_score = sum(1 for field in cleaned if field.lower() in generic_cols)
    if not has_wavelength and not well_count and not generic_score:
        return 0
    return well_count * 10 + int(has_wavelength) * 25 + generic_score * 5 + min(len(cleaned), 30)


def _table_from_excel_region(raw: pd.DataFrame, header_idx: int) -> pd.DataFrame:
    header_values = raw.iloc[header_idx].tolist()
    keep_positions = [
        idx
        for idx, value in enumerate(header_values)
        if pd.notna(value) and str(value).strip()
    ]
    if not keep_positions:
        raise PlateFormatError("Detected an Excel table header, but it did not contain usable columns.")
    columns = [str(header_values[idx]).strip() for idx in keep_positions]
    data = raw.iloc[header_idx + 1 :, keep_positions].copy()
    data.columns = ensure_unique_columns(columns)
    data = data.dropna(how="all")
    data = data.dropna(axis=1, how="all")
    if data.empty:
        raise PlateFormatError("Detected an Excel table header, but no data rows were found below it.")
    return data.reset_index(drop=True)


def _detect_excel_table(raw: pd.DataFrame, config: dict | None = None) -> int | None:
    best: tuple[int, int] | None = None
    for idx in range(min(len(raw), 250)):
        fields = raw.iloc[idx].tolist()
        score = _score_excel_header(fields, config)
        if score and (best is None or score > best[0]):
            best = (score, idx)
    return None if best is None else best[1]


def _read_excel_robust(path_or_file: str | Path | BinaryIO, config: dict | None = None) -> pd.DataFrame:
    if hasattr(path_or_file, "seek"):
        path_or_file.seek(0)
    default = pd.read_excel(path_or_file)
    if hasattr(path_or_file, "seek"):
        path_or_file.seek(0)
    default.columns = ensure_unique_columns(default.columns)
    default_score = _score_excel_header(list(default.columns), config)
    if default_score >= 25:
        return default

    raw = pd.read_excel(path_or_file, header=None)
    header_idx = _detect_excel_table(raw, config)
    if header_idx is None:
        return default
    detected = _table_from_excel_region(raw, header_idx)
    detected.attrs["excel_table_header_row"] = header_idx + 1
    return detected


def read_table(path_or_file: str | Path | BinaryIO, filename: str | None = None, config: dict | None = None) -> pd.DataFrame:
    return _read_excel_or_csv(path_or_file, filename, config)


def _find_wavelength_column(df: pd.DataFrame, config: dict) -> str:
    keywords = [k.lower() for k in config.get("input", {}).get("wavelength_keywords", [])]
    for col in df.columns:
        name = str(col).strip().lower()
        if any(keyword in name for keyword in keywords):
            numeric = safe_numeric(df[col])
            if numeric.notna().sum() >= max(3, len(df) * 0.4):
                return col

    best_col = None
    best_score = -1
    for col in df.columns:
        numeric = safe_numeric(df[col]).dropna()
        if len(numeric) < 3:
            continue
        monotonic_score = int(numeric.is_monotonic_increasing or numeric.is_monotonic_decreasing)
        range_score = int(100 <= numeric.median() <= 1000)
        unique_score = numeric.nunique()
        score = monotonic_score * 1000 + range_score * 200 + unique_score
        if score > best_score:
            best_score = score
            best_col = col
    if best_col is None:
        raise PlateFormatError("Could not identify a wavelength column. Please ensure one column contains wavelength/nm values.")
    return best_col


def _find_well_columns(df: pd.DataFrame, wavelength_col: str, config: dict) -> dict[str, str]:
    well_cols: dict[str, str] = {}
    plate_format = plate_format_from_config(config)
    for col in df.columns:
        if col == wavelength_col:
            continue
        well = normalize_well_id(col, plate_format)
        if well:
            if well in well_cols:
                raise PlateFormatError(f"Duplicate well column detected after normalization: {well}.")
            well_cols[well] = col
    return well_cols


def standardize_by_well(path_or_file: str | Path | BinaryIO, config: dict, filename: str | None = None) -> tuple[pd.DataFrame, dict]:
    """Convert a raw plate export into Wavelength + well ID columns.

    The primary supported format is a wide table where one column contains wavelength
    and well IDs appear as column names. A second common format, with rows containing
    a well ID plus wavelength and signal columns, is also supported.
    """
    raw = read_table(path_or_file, filename, config)
    plate_format = plate_format_from_config(config)
    wavelength_col = _find_wavelength_column(raw, config)
    well_cols = _find_well_columns(raw, wavelength_col, config)

    if well_cols:
        out = pd.DataFrame({"Wavelength": safe_numeric(raw[wavelength_col])})
        for well in sorted_wells(well_cols, config):
            out[well] = safe_numeric(raw[well_cols[well]])
        out = out.dropna(subset=["Wavelength"]).sort_values("Wavelength").reset_index(drop=True)
        metadata = {"format": "wide", "wavelength_column": str(wavelength_col), "well_count": len(well_cols)}
        return out, metadata

    well_row_col = None
    for col in raw.columns:
        normalized = raw[col].map(lambda value: normalize_well_id(value, plate_format))
        if normalized.notna().sum() >= 2:
            well_row_col = col
            break

    if well_row_col is None:
        raise PlateFormatError("Could not identify well IDs in columns or rows. Expected IDs like A01-H12 or A01-P24.")

    signal_candidates = []
    for col in raw.columns:
        if col in {wavelength_col, well_row_col}:
            continue
        numeric = safe_numeric(raw[col])
        if numeric.notna().sum() >= max(3, len(raw) * 0.25):
            name = str(col).strip().lower()
            score = numeric.notna().sum() + numeric.nunique()
            if name == "signal":
                score += 20000
            elif "signal" in name and "ref" not in name:
                score += 12000
            elif any(keyword in name for keyword in ["intensity", "value", "result"]):
                score += 6000
            if name in {"repeat", "row", "column", "step", "loop"}:
                score -= 12000
            if any(keyword in name for keyword in ["time", "position", "barcode", "channel", "window", "wavelength"]):
                score -= 12000
            signal_candidates.append((score, col))
    if not signal_candidates:
        raise PlateFormatError("Could not identify a numeric signal column for long-format data.")
    signal_col = max(signal_candidates, key=lambda item: item[0])[1]

    temp = pd.DataFrame(
        {
            "Wavelength": safe_numeric(raw[wavelength_col]),
            "Well": raw[well_row_col].map(lambda value: normalize_well_id(value, plate_format)),
            "Signal": safe_numeric(raw[signal_col]),
        }
    ).dropna(subset=["Wavelength", "Well"])
    out = temp.pivot_table(index="Wavelength", columns="Well", values="Signal", aggfunc="mean").reset_index()
    ordered = ["Wavelength"] + sorted_wells([c for c in out.columns if c != "Wavelength"], config)
    out = out[ordered]
    metadata = {
        "format": "long",
        "wavelength_column": str(wavelength_col),
        "well_column": str(well_row_col),
        "signal_column": str(signal_col),
        "well_count": len(ordered) - 1,
    }
    return out, metadata


def validate_standard_table(df: pd.DataFrame, name: str = "input", config: dict | None = None) -> tuple[pd.DataFrame, list[str]]:
    if df.empty or len(df.columns) < 2:
        raise PlateFormatError(f"{name}: expected a wavelength column plus at least one well column.")
    df = df.copy()
    df.columns = ensure_unique_columns(df.columns)
    first = df.columns[0]
    df = df.rename(columns={first: "Wavelength"})
    df["Wavelength"] = safe_numeric(df["Wavelength"])
    df = df.dropna(subset=["Wavelength"]).sort_values("Wavelength").reset_index(drop=True)

    rename_map = {}
    wells = []
    plate_format = plate_format_from_config(config)
    for col in df.columns[1:]:
        well = normalize_well_id(col, plate_format)
        if well:
            rename_map[col] = well
            wells.append(well)
    if not wells:
        raise PlateFormatError(f"{name}: no well columns were found. Expected column names like A01-H12 or A01-P24.")
    if len(wells) != len(set(wells)):
        raise PlateFormatError(f"{name}: duplicate well IDs detected after normalization.")
    df = df.rename(columns=rename_map)
    for well in wells:
        df[well] = safe_numeric(df[well])
    ordered_wells = sorted_wells(wells, config)
    return df[["Wavelength"] + ordered_wells], ordered_wells


def dataframe_to_excel_bytes(df: pd.DataFrame, sheet_name: str = "Sheet1") -> bytes:
    with tempfile.NamedTemporaryFile(suffix=".xlsx") as tmp:
        with pd.ExcelWriter(tmp.name, engine="openpyxl") as writer:
            df.to_excel(writer, index=False, sheet_name=sheet_name)
        return Path(tmp.name).read_bytes()
