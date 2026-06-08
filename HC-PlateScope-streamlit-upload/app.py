from __future__ import annotations

import copy
import os
import traceback
from io import BytesIO
from pathlib import Path
from typing import Callable

import pandas as pd
import streamlit as st
import yaml

from plate_processor.anti_analysis import run_anti_analysis
from plate_processor.io import PlateFormatError, dataframe_to_excel_bytes, standardize_by_well
from plate_processor.report import run_geco, run_geco_384_paired, run_lss, run_luci, run_wellid
from plate_processor.style import inject_css
from plate_processor.ui_components import (
    metadata_from_run_dir,
    render_download_card,
    render_error_card,
    render_feature_card,
    render_history_card,
    render_history_preview,
    render_info_card,
    render_landing_page,
    render_local_first_notice,
    render_module_page_header,
    render_pdf_preview,
    render_preview_table,
    render_results_section,
    render_run_button,
    render_run_folder,
    render_section,
    render_settings_section,
    render_step_card,
    render_success_card,
    render_summary_card,
    render_upload_section,
    render_warning_card,
)
from plate_processor.utils import load_config, save_yaml


ROOT = Path(__file__).resolve().parent
CONFIG_PATH = ROOT / "config.yaml"
os.chdir(ROOT)

MODULES = {
    "wellid": {
        "title": "Well ID Extractor",
        "description": "Convert raw plate-reader files into standardized well-by-column tables.",
        "tags": ["Standardization", "Well ID", "Excel export"],
        "accent": "teal",
        "data_mode": "Raw reader export, standardized output",
    },
    "geco": {
        "title": "GECO Analysis",
        "description": "Compare with-CA and without-CA spectra and generate peak-ratio heatmaps.",
        "tags": ["Raw spectra", "Peak ratio", "Heatmap"],
        "accent": "bluegreen",
        "data_mode": "Raw spectra, peak ratio heatmap",
    },
    "luci": {
        "title": "LUCI Analysis",
        "description": "Normalize spectra, detect 450/520 nm peaks, and calculate emission ratios.",
        "tags": ["Normalization", "Peak detection", "520:450"],
        "accent": "blueorange",
        "data_mode": "Normalized spectra, 450/520 peak detection",
    },
    "lss": {
        "title": "LSS Analysis",
        "description": "Overlay raw excitation and emission spectra for each well without normalization.",
        "tags": ["Raw overlay", "Excitation", "Emission"],
        "accent": "purpleteal",
        "data_mode": "Raw spectra, no normalization",
    },
    "anti": {
        "title": "ANTI Analysis",
        "description": "Normalize excitation and emission spectra, then overlay both signals for each well.",
        "tags": ["Normalized overlay", "Excitation", "Emission"],
        "accent": "greenblue",
        "data_mode": "Normalized excitation/emission overlay",
    },
}


@st.cache_data(show_spinner=False)
def load_default_config() -> dict:
    return load_config(CONFIG_PATH)


def default_config() -> dict:
    return copy.deepcopy(load_default_config())


def init_session_state() -> None:
    st.session_state.setdefault("active_config", default_config())
    st.session_state.setdefault("debug_mode", False)
    st.session_state.setdefault("page", "dashboard")
    st.session_state.setdefault("current_module", None)
    st.session_state.setdefault("recent_limit", int(st.session_state.active_config.get("ui", {}).get("recent_runs", 5)))


def config() -> dict:
    return copy.deepcopy(st.session_state.active_config)


def go_dashboard() -> None:
    st.session_state.page = "dashboard"
    st.session_state.current_module = None
    st.rerun()


def go_module(module_key: str) -> None:
    st.session_state.page = "module"
    st.session_state.current_module = module_key
    st.rerun()


def go_page(page: str) -> None:
    st.session_state.page = page
    st.session_state.current_module = None
    st.rerun()


def run_index_path(cfg: dict | None = None) -> Path:
    cfg = cfg or st.session_state.get("active_config", default_config())
    return ROOT / cfg.get("output", {}).get("run_index", "outputs/run_index.csv")


def output_root(cfg: dict | None = None) -> Path:
    cfg = cfg or st.session_state.get("active_config", default_config())
    return ROOT / cfg.get("output", {}).get("base_dir", "outputs")


def read_run_index(cfg: dict | None = None) -> pd.DataFrame:
    path = run_index_path(cfg)
    if not path.exists():
        return pd.DataFrame(columns=["run_name", "run_id", "timestamp", "module_type", "input_files", "output_dir", "warnings"])
    index = pd.read_csv(path).fillna("")
    if "run_name" not in index.columns:
        index.insert(0, "run_name", "")
    return index


def run_dir_from_row(row: pd.Series, cfg: dict | None = None) -> Path:
    row_dir = str(row.get("output_dir", "")).strip()
    if row_dir:
        path = Path(row_dir)
        return path if path.is_absolute() else ROOT / path
    return output_root(cfg) / str(row.get("run_id", ""))


def output_files_from_metadata(metadata: dict) -> list[str]:
    files = []
    for file in metadata.get("output_files", []):
        path = Path(file)
        files.append(str(path if path.is_absolute() else ROOT / path))
    return files


def sidebar_status() -> None:
    st.sidebar.markdown(
        """
        <div class="hc-side-title">HC PlateScope</div>
        <div class="hc-side-note">Local-first workspace<br>Records stored in <code>outputs/</code><br>Version 1.0.0</div>
        """,
        unsafe_allow_html=True,
    )
    st.sidebar.divider()
    st.session_state.debug_mode = st.sidebar.checkbox("Debug mode", value=bool(st.session_state.debug_mode))
    current = st.session_state.current_module
    label = MODULES[current]["title"] if current in MODULES else st.session_state.page.title()
    st.sidebar.caption(f"Current workspace: {label}")
    latest = read_run_index().tail(1)
    if not latest.empty:
        st.sidebar.caption(f"Latest run: {latest.iloc[0].get('run_id')}")


def prepare_uploaded_table(uploaded, cfg: dict, auto_standardize: bool) -> tuple[object, str]:
    if uploaded is None:
        raise ValueError("Missing uploaded file.")
    uploaded.seek(0)
    if not auto_standardize:
        return uploaded, uploaded.name
    df, _ = standardize_by_well(uploaded, cfg, filename=uploaded.name)
    data = dataframe_to_excel_bytes(df, sheet_name="standardized")
    prepared = BytesIO(data)
    prepared.seek(0)
    return prepared, f"{Path(uploaded.name).stem}_standardized.xlsx"


def render_standardization_option(key: str) -> bool:
    enabled = st.checkbox(
        "Auto-standardize uploaded files with Well ID Extractor",
        value=True,
        key=key,
        help="Use this when uploaded files are raw plate-reader exports. Standardized well-by-column files also work.",
    )
    render_info_card(
        "Built-in Well ID Extractor",
        [
            "Uploaded files are converted to Wavelength + well ID columns before analysis.",
            "Plate format can be auto-detected or manually set to 96-well / 384-well.",
            "This changes file preparation only; analysis formulas remain unchanged.",
        ],
    )
    return enabled


def apply_run_name(cfg: dict, key: str, default_prefix: str) -> dict:
    today = pd.Timestamp.now().strftime("%Y-%m-%d")
    if key not in st.session_state:
        st.session_state[key] = f"{default_prefix} {today}"
    run_name = st.text_input(
        "Project name for this run",
        key=key,
        help="This name will appear in History, metadata, run_index.csv, and the run folder name.",
    ).strip()
    cfg["run_name"] = run_name
    return cfg


def apply_plate_controls(
    cfg: dict,
    key_prefix: str,
    manual_only: bool = False,
    allow_spectra_layout: bool = False,
) -> dict:
    cfg.setdefault("plate", {})
    cfg.setdefault("plotting", {}).setdefault("spectra_grid", {})
    options = ["96-well", "384-well"] if manual_only else ["Auto-detect", "96-well", "384-well"]
    current = str(cfg.get("plate", {}).get("format", "auto")).lower()
    current_label = "384-well" if current in {"384", "384-well"} else "96-well" if current in {"96", "96-well"} else "Auto-detect"
    if manual_only and current_label == "Auto-detect":
        current_label = "96-well"
    label = st.selectbox(
        "Plate format",
        options,
        index=options.index(current_label) if current_label in options else 0,
        key=f"{key_prefix}_plate_format",
        help="Auto-detect treats A01-H12 as 96-well and A01-P24 as 384-well.",
    )
    cfg["plate"]["format"] = "auto" if label == "Auto-detect" else 384 if label == "384-well" else 96

    if allow_spectra_layout:
        layout = cfg["plotting"]["spectra_grid"]
        is_384 = cfg["plate"]["format"] == 384
        mode_options = ["Compact", "Plate layout"] if is_384 else ["Plate layout", "Compact"]
        current_mode = "Compact" if (is_384 and str(layout.get("mode", "plate")).lower() == "plate") or str(layout.get("mode", "plate")).lower() == "compact" else "Plate layout"
        mode_label = st.selectbox(
            "Scatter plot arrangement",
            mode_options,
            index=mode_options.index(current_mode) if current_mode in mode_options else 0,
            key=f"{key_prefix}_spectra_mode",
            help="Compact is recommended for partial 384-well measurements.",
        )
        layout["mode"] = "compact" if mode_label == "Compact" else "plate"
        if layout["mode"] == "compact":
            c1, c2 = st.columns(2)
            with c1:
                layout["columns"] = st.number_input(
                    "Plots per row",
                    min_value=4,
                    max_value=24,
                    value=int(layout.get("columns", 12)),
                    step=1,
                    key=f"{key_prefix}_spectra_columns",
                    help="For GECO 384, 12 plots per row keeps each subplot close to the 96-well grid size.",
                )
            with c2:
                layout["rows_per_page"] = st.number_input(
                    "Rows per PDF page",
                    min_value=2,
                    max_value=16,
                    value=int(layout.get("rows_per_page", 8)),
                    step=1,
                    key=f"{key_prefix}_spectra_rows_page",
                    help="Use 8 rows per page to match the 96-well 12 x 8 subplot size; extra plots continue on following PDF pages.",
                )
    return cfg


def apply_plot_controls(
    base_cfg: dict,
    key_prefix: str,
    include_heatmap: bool = False,
    include_y_padding: bool = True,
    color_labels: tuple[str, str] = ("Primary color", "Secondary color"),
) -> dict:
    cfg = copy.deepcopy(base_cfg)
    cfg.setdefault("plot", {})
    cfg.setdefault("plotting", {})
    cfg.setdefault("smoothing", {})
    cfg["plotting"].setdefault("heatmap", {})
    cfg["plotting"].setdefault("y_axis", {})
    cfg["plotting"].setdefault("badges", {})

    plot = cfg["plot"]
    plotting = cfg["plotting"]
    smoothing = plot.setdefault("smoothing", copy.deepcopy(cfg.get("smoothing", {})))

    c1, c2, c3 = st.columns(3)
    with c1:
        smoothing["enabled"] = st.checkbox("Smoothing enabled", value=bool(smoothing.get("enabled", True)), key=f"{key_prefix}_smooth")
    with c2:
        plot["marker_size"] = st.slider("Marker size", 0.5, 8.0, float(plot.get("marker_size", plotting.get("marker_size", 1.0))), 0.5, key=f"{key_prefix}_marker")
    with c3:
        plot["line_width"] = st.slider("Line width", 0.2, 3.0, float(plot.get("line_width", plotting.get("line_width", 1.0))), 0.1, key=f"{key_prefix}_line")

    c1, c2 = st.columns(2)
    with c1:
        plotting["y_axis"]["per_well"] = st.checkbox("Per-well y-axis", value=bool(plotting["y_axis"].get("per_well", True)), key=f"{key_prefix}_perwell")
    with c2:
        if include_y_padding:
            plotting["y_axis"]["upper_padding"] = st.slider(
                "Y-axis upper padding",
                1.0,
                1.5,
                float(plotting["y_axis"].get("upper_padding", 1.10)),
                0.01,
                key=f"{key_prefix}_ypad",
            )

    if include_heatmap:
        c1, c2 = st.columns(2)
        with c1:
            plotting["heatmap"]["show_values"] = st.checkbox(
                "Show heatmap values",
                value=bool(plotting["heatmap"].get("show_values", True)),
                key=f"{key_prefix}_heat_vals",
            )
        with c2:
            plotting["heatmap"]["robust_scaling"] = st.checkbox(
                "Robust heatmap scale",
                value=bool(plotting["heatmap"].get("robust_scaling", True)),
                key=f"{key_prefix}_robust_heatmap",
                help="Percentile clipping prevents a few outlier wells from flattening the rest of the heatmap.",
            )

    with st.expander("Advanced settings"):
        c1, c2, c3 = st.columns(3)
        with c1:
            smoothing["method"] = st.selectbox("Smoothing method", ["savgol"], index=0, key=f"{key_prefix}_smooth_method")
            smoothing["window_length"] = st.slider("Window length", 3, 51, int(smoothing.get("window_length", 9)), 2, key=f"{key_prefix}_window")
            smoothing["polyorder"] = st.slider("Polynomial order", 1, 5, int(smoothing.get("polyorder", 3)), key=f"{key_prefix}_poly")
        with c2:
            plot["marker_alpha"] = st.slider("Marker alpha", 0.1, 1.0, float(plot.get("marker_alpha", plotting.get("alpha", 0.55))), 0.05, key=f"{key_prefix}_malpha")
            plot["line_alpha"] = st.slider("Line alpha", 0.1, 1.0, float(plot.get("line_alpha", plotting.get("line_alpha", 0.95))), 0.05, key=f"{key_prefix}_lalpha")
            plotting["y_axis"]["rounding_mode"] = "nice_round" if st.checkbox("Nice rounding enabled", value=plotting["y_axis"].get("rounding_mode", "nice_round") == "nice_round", key=f"{key_prefix}_nice") else "raw"
        with c3:
            colors = plotting.setdefault("colors", {})
            badges = plotting.setdefault("badges", {})
            colors["primary"] = st.color_picker(color_labels[0], colors.get("primary", "#4C78A8"), key=f"{key_prefix}_primary")
            colors["secondary"] = st.color_picker(color_labels[1], colors.get("secondary", "#59A14F"), key=f"{key_prefix}_secondary")
            if key_prefix == "geco":
                badges["geco_ratio"] = st.color_picker("GECO ratio badge", badges.get("geco_ratio", "#42949E"), key=f"{key_prefix}_badge_ratio")
            elif key_prefix == "luci":
                badges["luci_ratio"] = st.color_picker("LUCI ratio badge", badges.get("luci_ratio", "#9A4D8E"), key=f"{key_prefix}_badge_ratio")
            elif key_prefix == "lss":
                badges["lss_emission"] = st.color_picker("LSS emission badge", badges.get("lss_emission", "#B64342"), key=f"{key_prefix}_badge_emission")
                badges["lss_excitation"] = st.color_picker("LSS excitation badge", badges.get("lss_excitation", "#0F4D92"), key=f"{key_prefix}_badge_excitation")
                badges["lss_distance"] = st.color_picker("LSS distance badge", badges.get("lss_distance", "#E28E2C"), key=f"{key_prefix}_badge_distance")
            if include_heatmap:
                colormaps = ["hc_nature", "hc_soft", "YlGnBu", "BuGn", "viridis", "cividis", "plasma"]
                colors["heatmap"] = st.selectbox(
                    "Heatmap colormap",
                    colormaps,
                    index=colormaps.index(colors.get("heatmap", "hc_soft")) if colors.get("heatmap", "hc_soft") in colormaps else 0,
                    key=f"{key_prefix}_cmap",
                    help="Color scale for the heatmap only. It changes visual coloring, not calculated ratios.",
                )
                heatmap_cfg = plotting["heatmap"]
                if heatmap_cfg.get("robust_scaling", True):
                    heatmap_cfg["robust_lower_percentile"] = st.number_input("Low percentile", 0.0, 20.0, float(heatmap_cfg.get("robust_lower_percentile", 5)), 1.0, key=f"{key_prefix}_robust_low")
                    heatmap_cfg["robust_upper_percentile"] = st.number_input("High percentile", 80.0, 100.0, float(heatmap_cfg.get("robust_upper_percentile", 95)), 1.0, key=f"{key_prefix}_robust_high")
                render_info_card(
                    "Heatmap colormap",
                    [
                        "hc_soft is the print-friendly default.",
                        "Robust scale clips only the color range, not the numeric results.",
                    ],
                )

    cfg["smoothing"].update(smoothing)
    plotting["marker_size"] = plot["marker_size"]
    plotting["line_width"] = plot["line_width"]
    plotting["alpha"] = plot["marker_alpha"]
    plotting["line_alpha"] = plot["line_alpha"]
    return cfg


def handle_analysis_run(call: Callable[[], dict], result_key: str) -> dict | None:
    try:
        with st.spinner("Running analysis..."):
            result = call()
        st.session_state[result_key] = result
        render_success_card(f"Analysis complete: {result.get('metadata', {}).get('run_id', 'run finished')}")
        return result
    except (PlateFormatError, ValueError) as exc:
        render_error_card(str(exc))
    except Exception as exc:
        render_error_card(str(exc), traceback.format_exc() if st.session_state.debug_mode else None)
    return None


def render_result_common(result: dict | None, summary_items: dict[str, object], preferred_files: list[str], preview_pdf: str | None = None) -> None:
    if not result:
        return
    metadata = result.get("metadata", {})
    render_summary_card(summary_items)
    render_warning_card(metadata.get("warnings", []))
    render_run_folder(result.get("run_dir"))
    render_download_card(result.get("output_files", []), preferred_files)
    if preview_pdf:
        render_pdf_preview(preview_pdf, "Report preview")


def dashboard_page() -> None:
    render_landing_page(int(st.session_state.get("recent_limit", 5)))

    first = st.columns(3)
    for col, module_key in zip(first, ["wellid", "geco", "luci"]):
        meta = MODULES[module_key]
        with col:
            if render_feature_card(meta["title"], meta["description"], meta["tags"], meta["accent"], key=f"open_{module_key}"):
                go_module(module_key)

    second = st.columns(3)
    for col, module_key in zip(second[:2], ["lss", "anti"]):
        meta = MODULES[module_key]
        with col:
            if render_feature_card(meta["title"], meta["description"], meta["tags"], meta["accent"], key=f"open_{module_key}"):
                go_module(module_key)
    with second[2]:
        if render_feature_card("Analysis History", "Browse local runs, metadata, reports, and restored settings.", ["outputs/", "metadata", "settings"], "teal", "Open history", key="open_history_card"):
            go_page("history")
        if st.button("Settings", key="open_settings_card", use_container_width=True):
            go_page("settings")

    bottom_left, bottom_right = st.columns([1.35, 0.65], gap="large")
    with bottom_left:
        render_section("Recent runs", "Latest local records from outputs/run_index.csv.")
        render_history_preview(read_run_index(), run_dir_from_row, metadata_from_run_dir, int(st.session_state.get("recent_limit", 4)))
    with bottom_right:
        render_local_first_notice()


def module_shell(module_key: str, render_body: Callable[[dict], None]) -> None:
    meta = MODULES[module_key]
    if st.button("Back to Dashboard", key=f"back_{module_key}"):
        go_dashboard()
    render_module_page_header(meta["title"], meta["description"], meta["tags"], meta["data_mode"])
    render_body(config())


def wellid_body(cfg: dict) -> None:
    render_step_card(1, "Upload raw file", "Supported formats: .xlsx, .xls, .csv.")
    uploaded = render_upload_section("Upload Excel or CSV file", "wellid_upload")

    render_settings_section("Detection settings", "The extractor recognizes common wavelength columns and 96/384-well IDs.")
    cfg = apply_plate_controls(cfg, "wellid", manual_only=False)
    c1, c2, c3, c4 = st.columns(4)
    with c1:
        st.text_input("Well ID pattern", value="A01-H12 or A01-P24", disabled=True)
    with c2:
        st.checkbox("Auto-detect wavelength column", value=True, disabled=True)
    with c3:
        st.text_input("Manual wavelength column name", value="", placeholder="Optional")
    with c4:
        st.selectbox("Output file format", ["xlsx"], disabled=True)
    cfg = apply_run_name(cfg, "wellid_run_name", "Well ID")

    render_step_card(3, "Run analysis")
    if render_run_button("Run Well ID Extraction", "run_wellid", uploaded is None, "Upload one raw Excel or CSV file before running."):
        result = handle_analysis_run(lambda: run_wellid(uploaded, uploaded.name, cfg), "wellid_result")
    else:
        result = st.session_state.get("wellid_result")

    render_results_section()
    if result:
        metadata = result.get("metadata", {})
        recognition = metadata.get("recognition", {})
        render_result_common(
            result,
            {
                "Project": metadata.get("run_name", ""),
                "Detected wells": recognition.get("well_count", len([c for c in result.get("standardized", pd.DataFrame()).columns if c != "Wavelength"])),
                "Wavelength column": recognition.get("wavelength_column", "detected"),
                "Run ID": metadata.get("run_id", ""),
                "Warnings": len(metadata.get("warnings", [])),
            },
            ["standardized_by_well.xlsx", "run_metadata.json"],
        )
        render_preview_table(result.get("standardized"), "Preview table")


def geco_body(cfg: dict) -> None:
    render_step_card(1, "Upload files", "Choose 96-well two-file GECO or 384-well single-file adjacent-pair GECO.")
    cfg = apply_plate_controls(cfg, "geco", manual_only=True, allow_spectra_layout=True)
    is_384 = cfg.get("plate", {}).get("format") == 384
    if is_384:
        paired_file = render_upload_section("Upload 384-well paired GECO table", "geco_384_single")
        with_ca = None
        without_ca = None
        render_info_card(
            "GECO 384 pairing rule",
            [
                "Upload one table with A01-P24 well columns.",
                "Odd columns are without CA; adjacent even columns are with CA.",
                "Example: A05 without CA and A06 with CA are plotted together.",
            ],
        )
    else:
        paired_file = None
        c1, c2 = st.columns(2)
        with c1:
            with_ca = render_upload_section("Upload with CA table", "geco_with")
        with c2:
            without_ca = render_upload_section("Upload without CA table", "geco_without")
    auto_standardize = render_standardization_option("geco_auto_standardize")

    render_settings_section("Analysis settings", "Common controls stay visible; detailed plotting controls live in Advanced settings.")
    cfg = apply_plot_controls(cfg, "geco", include_heatmap=True, color_labels=("Color with CA", "Color without CA"))
    cfg = apply_run_name(cfg, "geco_run_name", "GECO")

    render_step_card(3, "Run analysis")
    disabled = paired_file is None if is_384 else with_ca is None or without_ca is None
    missing_msg = "Upload one 384-well paired table before running." if is_384 else "Upload both with-CA and without-CA tables before running."
    if render_run_button("Run GECO Analysis", "run_geco", disabled, missing_msg):
        def call_geco() -> dict:
            if is_384:
                paired_obj, paired_name = prepare_uploaded_table(paired_file, cfg, auto_standardize)
                return run_geco_384_paired(paired_obj, paired_name, cfg)
            else:
                with_obj, with_name = prepare_uploaded_table(with_ca, cfg, auto_standardize)
                without_obj, without_name = prepare_uploaded_table(without_ca, cfg, auto_standardize)
                return run_geco(with_obj, without_obj, with_name, without_name, cfg)
        result = handle_analysis_run(call_geco, "geco_result")
    else:
        result = st.session_state.get("geco_result")

    render_results_section()
    if result:
        metadata = result.get("metadata", {})
        summary = result.get("summary", pd.DataFrame())
        output_files = output_files_from_metadata(metadata)
        report = next((p for p in output_files if Path(p).name == "GECO_combined_report.pdf"), None)
        render_result_common(
            result,
            {
                "Project": metadata.get("run_name", ""),
                "Module": "GECO",
                "Plate": metadata.get("plate_format", cfg.get("plate", {}).get("format", "")),
                "Common wells": len(summary),
                "Formula": "max(with CA) / max(without CA)",
                "Run ID": metadata.get("run_id", ""),
            },
            ["GECO_combined_report.pdf", "GECO_grid_plots.pdf", "GECO_heatmap.pdf", "GECO_peak_ratio.csv", "run_metadata.json"],
            report,
        )
        render_preview_table(summary, "Peak ratio preview")


def luci_body(cfg: dict) -> None:
    cfg.setdefault("peaks", {})
    render_step_card(1, "Upload file", "Upload a raw reader export or a standardized LUCI well-by-column table.")
    uploaded = render_upload_section("Upload LUCI table", "luci_upload")
    auto_standardize = render_standardization_option("luci_auto_standardize")

    render_settings_section("Analysis settings", "Peak windows are shown here because they affect the LUCI ratio.")
    cfg = apply_plate_controls(cfg, "luci", manual_only=False, allow_spectra_layout=True)
    st.checkbox("Normalize by column maximum", value=True, disabled=True)
    c1, c2 = st.columns(2)
    with c1:
        low450, high450 = st.slider("450 nm peak window", 350, 650, tuple(cfg.get("peaks", {}).get("luci_450_window", [430, 470])), key="luci_450")
    with c2:
        low520, high520 = st.slider("520 nm peak window", 350, 750, tuple(cfg.get("peaks", {}).get("luci_520_window", [500, 540])), key="luci_520")
    cfg["peaks"]["luci_450_window"] = [low450, high450]
    cfg["peaks"]["luci_520_window"] = [low520, high520]
    cfg = apply_plot_controls(cfg, "luci", include_heatmap=True, include_y_padding=False)
    cfg = apply_run_name(cfg, "luci_run_name", "LUCI")

    render_step_card(3, "Run analysis")
    if render_run_button("Run LUCI Analysis", "run_luci", uploaded is None, "Upload one LUCI table before running."):
        def call_luci() -> dict:
            obj, name = prepare_uploaded_table(uploaded, cfg, auto_standardize)
            return run_luci(obj, name, cfg)
        result = handle_analysis_run(call_luci, "luci_result")
    else:
        result = st.session_state.get("luci_result")

    render_results_section()
    if result:
        metadata = result.get("metadata", {})
        summary = result.get("summary", pd.DataFrame())
        output_files = output_files_from_metadata(metadata)
        report = next((p for p in output_files if Path(p).name == "LUCI_combined_report.pdf"), None)
        render_result_common(
            result,
            {
                "Project": metadata.get("run_name", ""),
                "Module": "LUCI",
                "Wells": len(summary),
                "Formula": "peak520 / peak450",
                "Run ID": metadata.get("run_id", ""),
            },
            ["LUCI_normalized.xlsx", "LUCI_peak_summary.csv", "LUCI_ratio_heatmap.pdf", "LUCI_combined_report.pdf", "run_metadata.json"],
            report,
        )
        render_preview_table(summary, "Peak summary preview")


def lss_body(cfg: dict) -> None:
    cfg.setdefault("lss", {})["normalize"] = False
    cfg["lss"]["use_raw_data"] = True
    render_step_card(1, "Upload files", "Upload Excitation and Emission tables. LSS always uses raw signal values.")
    c1, c2 = st.columns(2)
    with c1:
        excitation = render_upload_section("Upload Excitation table", "lss_excitation")
    with c2:
        emission = render_upload_section("Upload Emission table", "lss_emission")
    auto_standardize = render_standardization_option("lss_auto_standardize")

    render_settings_section("Analysis settings")
    cfg = apply_plate_controls(cfg, "lss", manual_only=False, allow_spectra_layout=True)
    st.checkbox("Normalize data", value=False, disabled=True)
    cfg = apply_plot_controls(cfg, "lss", include_heatmap=True, color_labels=("Emission color", "Excitation color"))
    cfg.setdefault("lss", {}).setdefault("y_axis", {})
    cfg["lss"]["y_axis"]["upper_padding"] = cfg.get("plotting", {}).get("y_axis", {}).get("upper_padding", 1.10)
    cfg["lss"]["y_axis"]["rounding_mode"] = cfg.get("plotting", {}).get("y_axis", {}).get("rounding_mode", "nice_round")
    cfg = apply_run_name(cfg, "lss_run_name", "LSS")

    render_step_card(3, "Run analysis")
    disabled = excitation is None or emission is None
    if render_run_button("Run LSS Analysis", "run_lss", disabled, "Upload both Excitation and Emission tables before running."):
        def call_lss() -> dict:
            emission_obj, emission_name = prepare_uploaded_table(emission, cfg, auto_standardize)
            excitation_obj, excitation_name = prepare_uploaded_table(excitation, cfg, auto_standardize)
            return run_lss(emission_obj, excitation_obj, emission_name, excitation_name, cfg)
        result = handle_analysis_run(call_lss, "lss_result")
    else:
        result = st.session_state.get("lss_result")

    render_results_section()
    if result:
        metadata = result.get("metadata", {})
        summary = result.get("summary", pd.DataFrame())
        output_files = output_files_from_metadata(metadata)
        report = next((p for p in output_files if Path(p).name == "LSS_combined_report.pdf"), None)
        render_result_common(
            result,
            {"Project": metadata.get("run_name", ""), "Module": "LSS", "Data mode": "raw", "Common wells": metadata.get("common_well_count", len(summary)), "Run ID": metadata.get("run_id", "")},
            ["LSS_grid_plots.pdf", "LSS_peak_distance_heatmap.pdf", "LSS_combined_report.pdf", "LSS_peak_top10.xlsx", "LSS_summary.csv", "run_metadata.json"],
            report,
        )
        render_preview_table(summary, "LSS summary preview")


def anti_body(cfg: dict) -> None:
    cfg.setdefault("anti", {})["normalize"] = True
    cfg["anti"]["normalization_method"] = "column_max"
    render_step_card(1, "Upload files", "Upload Excitation and Emission tables. Each signal is normalized separately.")
    c1, c2 = st.columns(2)
    with c1:
        excitation = render_upload_section("Upload Excitation table", "anti_excitation")
    with c2:
        emission = render_upload_section("Upload Emission table", "anti_emission")
    auto_standardize = render_standardization_option("anti_auto_standardize")

    render_settings_section("Analysis settings")
    cfg = apply_plate_controls(cfg, "anti", manual_only=False, allow_spectra_layout=True)
    st.checkbox("Normalize by column maximum", value=True, disabled=True)
    cfg = apply_plot_controls(cfg, "anti", include_heatmap=False, color_labels=("Excitation color", "Emission color"))
    cfg.setdefault("anti", {}).setdefault("y_axis", {})
    cfg["anti"]["y_axis"]["upper_padding"] = cfg.get("plotting", {}).get("y_axis", {}).get("upper_padding", 1.10)
    cfg = apply_run_name(cfg, "anti_run_name", "ANTI")

    render_step_card(3, "Run analysis")
    disabled = excitation is None or emission is None
    if render_run_button("Run ANTI Analysis", "run_anti", disabled, "Upload both Excitation and Emission tables before running."):
        def call_anti() -> dict:
            excitation_obj, excitation_name = prepare_uploaded_table(excitation, cfg, auto_standardize)
            emission_obj, emission_name = prepare_uploaded_table(emission, cfg, auto_standardize)
            return run_anti_analysis(excitation_obj, emission_obj, excitation_name, emission_name, cfg)
        result = handle_analysis_run(call_anti, "anti_result")
    else:
        result = st.session_state.get("anti_result")

    render_results_section()
    if result:
        metadata = result.get("metadata", {})
        summary = result.get("summary", pd.DataFrame())
        output_files = output_files_from_metadata(metadata)
        report = next((p for p in output_files if Path(p).name == "anti_combined_report.pdf"), None)
        render_result_common(
            result,
            {"Project": metadata.get("run_name", ""), "Module": "ANTI", "Normalization": "column max", "Common wells": metadata.get("common_well_count", ""), "Run ID": metadata.get("run_id", "")},
            ["anti_excitation_normalized.xlsx", "anti_emission_normalized.xlsx", "anti_grid_plots.pdf", "anti_combined_report.pdf", "anti_summary.csv", "run_metadata.json"],
            report,
        )
        render_preview_table(summary, "Normalization summary preview")


def remove_run_from_index(run_id: str) -> None:
    path = run_index_path()
    if not path.exists():
        return
    index = pd.read_csv(path)
    index = index[index["run_id"] != run_id]
    index.to_csv(path, index=False)


def restore_settings(run_dir: Path) -> None:
    snapshot = run_dir / "config_snapshot.yaml"
    if not snapshot.exists():
        render_info_card("Restore settings", ["No config_snapshot.yaml was found for this run."], tone="warning")
        return
    with open(snapshot, "r", encoding="utf-8") as f:
        st.session_state.active_config = yaml.safe_load(f)
    render_success_card("Settings restored from config_snapshot.yaml.")


def history_page() -> None:
    if st.button("Back to Dashboard", key="back_history"):
        go_dashboard()
    render_module_page_header("Analysis History", "Browse previous analysis runs stored in the local outputs folder.", ["Local records", "Metadata", "Reproducibility"], "outputs/run_index.csv")
    index = read_run_index()
    if index.empty:
        render_info_card("No history found", ["outputs/run_index.csv does not exist yet."])
        return

    render_section("Filters")
    c1, c2, c3 = st.columns([1, 1, 2])
    with c1:
        module_values = sorted([m for m in index["module_type"].dropna().unique().tolist() if m])
        module_labels = {"All": "All", **{m: ("ANTI" if str(m).lower() == "anti" else str(m)) for m in module_values}}
        module_filter_label = st.selectbox("Module type", ["All"] + [module_labels[m] for m in module_values])
        module_filter = "All" if module_filter_label == "All" else next(m for m in module_values if module_labels[m] == module_filter_label)
    with c2:
        sort_order = st.selectbox("Sort by time", ["Newest first", "Oldest first"])
    with c3:
        search = st.text_input("Search project name, run_id, or input file name")

    filtered = index.copy()
    if module_filter != "All":
        filtered = filtered[filtered["module_type"] == module_filter]
    if search:
        mask = (
            filtered["run_id"].astype(str).str.contains(search, case=False, na=False)
            | filtered["run_name"].astype(str).str.contains(search, case=False, na=False)
            | filtered["input_files"].astype(str).str.contains(search, case=False, na=False)
        )
        filtered = filtered[mask]
    filtered = filtered.sort_values("timestamp", ascending=(sort_order == "Oldest first"))

    render_section("Runs", f"{len(filtered)} record(s) shown.")
    for _, row in filtered.iterrows():
        run_id = str(row.get("run_id", ""))
        run_dir = run_dir_from_row(row)
        metadata = metadata_from_run_dir(run_dir)
        render_history_card(row, metadata)
        c1, c2, c3, c4 = st.columns(4)
        output_files = output_files_from_metadata(metadata)
        report_files = [Path(p) for p in output_files if Path(p).suffix.lower() == ".pdf" and "report" in Path(p).name.lower()]
        with c1:
            if report_files and report_files[0].exists():
                with open(report_files[0], "rb") as f:
                    st.download_button("Open report", f.read(), file_name=report_files[0].name, key=f"hist_report_{run_id}", use_container_width=True)
            else:
                st.button("Open report", disabled=True, key=f"hist_report_disabled_{run_id}", use_container_width=True)
        with c2:
            if st.button("Open folder", key=f"hist_folder_{run_id}", use_container_width=True):
                st.session_state[f"show_folder_{run_id}"] = not st.session_state.get(f"show_folder_{run_id}", False)
        with c3:
            if st.button("View metadata", key=f"hist_meta_{run_id}", use_container_width=True):
                st.session_state[f"show_meta_{run_id}"] = not st.session_state.get(f"show_meta_{run_id}", False)
        with c4:
            if st.button("Restore settings", key=f"hist_restore_{run_id}", use_container_width=True):
                restore_settings(run_dir)
        if st.session_state.get(f"show_folder_{run_id}"):
            render_run_folder(run_dir)
        if st.session_state.get(f"show_meta_{run_id}"):
            st.json(metadata or {"message": "No metadata found."})


def settings_page() -> None:
    if st.button("Back to Dashboard", key="back_settings"):
        go_dashboard()
    cfg = config()
    render_module_page_header("Settings", "Set global default plotting, smoothing, output, and history parameters.", ["Defaults", "config.yaml", "Local"], "Session settings")

    tabs = st.tabs(["Plot style", "Smoothing", "Y-axis", "Output", "History", "Import / Export"])
    with tabs[0]:
        plotting = cfg.setdefault("plotting", {})
        plot = cfg.setdefault("plot", {})
        c1, c2, c3 = st.columns(3)
        with c1:
            plot["marker_size"] = st.slider("Marker size", 0.5, 8.0, float(plot.get("marker_size", plotting.get("marker_size", 1.0))), 0.5)
            plot["line_width"] = st.slider("Line width", 0.2, 3.0, float(plot.get("line_width", plotting.get("line_width", 1.0))), 0.1)
        with c2:
            plot["marker_alpha"] = st.slider("Marker alpha", 0.1, 1.0, float(plot.get("marker_alpha", plotting.get("alpha", 0.55))), 0.05)
            plot["line_alpha"] = st.slider("Line alpha", 0.1, 1.0, float(plot.get("line_alpha", plotting.get("line_alpha", 0.95))), 0.05)
        with c3:
            plotting["font_family"] = st.text_input("Font family", plotting.get("font_family", "Arial"))
            plotting.setdefault("colors", {})["heatmap"] = st.selectbox("Default heatmap palette", ["hc_soft", "YlGnBu", "BuGn", "viridis", "cividis", "plasma"], index=0)
    with tabs[1]:
        smoothing = cfg.setdefault("smoothing", {})
        plot_smoothing = cfg.setdefault("plot", {}).setdefault("smoothing", {})
        enabled = st.checkbox("Enabled", value=bool(plot_smoothing.get("enabled", True)))
        window = st.slider("Window length", 3, 51, int(plot_smoothing.get("window_length", smoothing.get("window_length", 9))), 2)
        poly = st.slider("Polyorder", 1, 5, int(plot_smoothing.get("polyorder", smoothing.get("polyorder", 3))))
        smoothing.update({"method": "savgol", "window_length": window, "polyorder": poly})
        plot_smoothing.update({"enabled": enabled, "method": "savgol", "window_length": window, "polyorder": poly})
    with tabs[2]:
        y_axis = cfg.setdefault("plotting", {}).setdefault("y_axis", {})
        y_axis["per_well"] = st.checkbox("Per-well y-axis", value=bool(y_axis.get("per_well", True)))
        y_axis["upper_padding"] = st.slider("Upper padding", 1.0, 1.5, float(y_axis.get("upper_padding", 1.10)), 0.01)
        y_axis["rounding_mode"] = "nice_round" if st.checkbox("Nice rounding", value=y_axis.get("rounding_mode", "nice_round") == "nice_round") else "raw"
    with tabs[3]:
        output = cfg.setdefault("output", {})
        output["base_dir"] = st.text_input("Output root folder", output.get("base_dir", "outputs"))
        output["run_index"] = st.text_input("Run index path", output.get("run_index", "outputs/run_index.csv"))
        st.checkbox("Save metadata", value=True, disabled=True)
        st.checkbox("Save config snapshot", value=True, disabled=True)
        st.checkbox("Save processing log", value=True, disabled=True)
    with tabs[4]:
        ui = cfg.setdefault("ui", {})
        ui["show_recent_runs"] = st.checkbox("Show recent runs on dashboard", value=bool(ui.get("show_recent_runs", True)))
        recent = st.slider("Number of recent runs", 3, 10, int(st.session_state.get("recent_limit", ui.get("recent_runs", 5))))
        ui["recent_runs"] = recent
        st.session_state.recent_limit = recent
    with tabs[5]:
        st.download_button("Export config.yaml", yaml.safe_dump(cfg, allow_unicode=True, sort_keys=False).encode("utf-8"), file_name="config.yaml", mime="text/yaml", use_container_width=True)
        imported = st.file_uploader("Import config.yaml", type=["yaml", "yml"], key="import_config")
        if imported and st.button("Load imported config"):
            st.session_state.active_config = yaml.safe_load(imported.getvalue().decode("utf-8"))
            st.rerun()

    c1, c2 = st.columns(2)
    with c1:
        if st.button("Save settings", type="primary", use_container_width=True):
            st.session_state.active_config = cfg
            save_yaml(cfg, CONFIG_PATH)
            load_default_config.clear()
            render_success_card("Settings saved to config.yaml.")
    with c2:
        if st.button("Reset to config.yaml", use_container_width=True):
            st.session_state.active_config = default_config()
            st.rerun()


def module_page() -> None:
    module_key = st.session_state.get("current_module") or "geco"
    bodies = {"wellid": wellid_body, "geco": geco_body, "luci": luci_body, "lss": lss_body, "anti": anti_body}
    module_shell(module_key, bodies[module_key])


def main() -> None:
    st.set_page_config(page_title="HC PlateScope", layout="wide", initial_sidebar_state="collapsed")
    init_session_state()
    inject_css()
    sidebar_status()
    page = st.session_state.get("page", "dashboard")
    if page == "dashboard":
        dashboard_page()
    elif page == "module":
        module_page()
    elif page == "history":
        history_page()
    elif page == "settings":
        settings_page()
    else:
        go_dashboard()


if __name__ == "__main__":
    main()
