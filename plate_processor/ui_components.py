from __future__ import annotations

import base64
import html
import json
from pathlib import Path
from typing import Iterable

import pandas as pd
import streamlit as st


def _esc(value: object) -> str:
    return html.escape("" if value is None else str(value))


H_PLATE_MARKS = {
    (1, 1), (2, 1), (3, 1), (4, 1), (5, 1), (6, 1),
    (1, 4), (2, 4), (3, 4), (4, 4), (5, 4), (6, 4),
    (3, 2), (3, 3), (4, 2), (4, 3),
}


C_PLATE_MARKS = {
    (1, 7), (1, 8), (1, 9), (1, 10),
    (2, 6), (3, 6), (4, 6), (5, 6),
    (6, 7), (6, 8), (6, 9), (6, 10),
}


def _plate_well_class(row: int, col: int) -> str:
    if (row, col) in H_PLATE_MARKS:
        return "hc-well-blue"
    if (row, col) in C_PLATE_MARKS:
        return "hc-well-blue"
    return "hc-well-warm" if (row + col) % 5 == 0 else "hc-well-green"


def render_plate_decoration() -> None:
    dots = "".join(
        f"<span class='{_plate_well_class(row, col)}'></span>"
        for row in range(8)
        for col in range(12)
    )
    st.markdown(
        f"""
        <div class="hc-plate-wrap" aria-hidden="true">
          <div class="hc-plate-title">96-well layout</div>
          <div class="hc-plate-grid">{dots}</div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_hero_section() -> None:
    left, right = st.columns([1.28, 0.72], gap="large")
    with left:
        st.markdown(
            """
            <div class="hc-hero">
              <div class="hc-eyebrow">Local-first scientific workspace</div>
              <h1>HC PlateScope</h1>
              <p class="hc-hero-subtitle">A cozy workspace for 96-well plate spectra analysis.</p>
              <p class="hc-hero-copy">Local-first analysis workspace for well ID extraction, spectra processing, peak detection, ratio heatmaps, and reproducible reports.</p>
              <div class="hc-tags">
                <span class="hc-tag">Clean</span>
                <span class="hc-tag">Reproducible</span>
                <span class="hc-tag">Nature-style figures</span>
                <span class="hc-tag">outputs/ history</span>
              </div>
            </div>
            """,
            unsafe_allow_html=True,
        )
    with right:
        render_plate_decoration()


def render_section(title: str, subtitle: str | None = None) -> None:
    subtitle_html = f"<p>{_esc(subtitle)}</p>" if subtitle else ""
    st.markdown(
        f"""
        <div class="hc-section-heading">
          <h2>{_esc(title)}</h2>
          {subtitle_html}
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_feature_card(
    title: str,
    description: str,
    tags: Iterable[str],
    accent: str,
    button_label: str = "Start analysis",
    key: str | None = None,
) -> bool:
    tag_html = "".join(f"<span class='hc-tag'>{_esc(tag)}</span>" for tag in tags)
    st.markdown(
        f"""
        <div class="hc-feature-card hc-accent-{_esc(accent)}">
          <div class="hc-accent-line"></div>
          <h3>{_esc(title)}</h3>
          <p>{_esc(description)}</p>
          <div class="hc-tags">{tag_html}</div>
        </div>
        """,
        unsafe_allow_html=True,
    )
    return st.button(button_label, key=key or f"open_{title}", use_container_width=True)


def render_landing_page(recent_count: int = 0) -> None:
    render_hero_section()
    render_section("Choose a workspace", "Start with a focused module. Each run saves inputs, figures, tables, metadata, logs, and config snapshots locally.")


def render_module_page_header(
    title: str,
    description: str,
    tags: Iterable[str],
    data_mode: str,
) -> None:
    tag_html = "".join(f"<span class='hc-tag'>{_esc(tag)}</span>" for tag in tags)
    st.markdown(
        f"""
        <div class="hc-breadcrumb">Dashboard / {_esc(title)}</div>
        <div class="hc-module-header">
          <div>
            <h1>{_esc(title)}</h1>
            <p>{_esc(description)}</p>
            <div class="hc-tags">{tag_html}</div>
          </div>
          <div class="hc-mode-pill">
            <span>Data mode</span>
            <strong>{_esc(data_mode)}</strong>
          </div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_step_card(number: int, title: str, subtitle: str | None = None) -> None:
    subtitle_html = f"<p>{_esc(subtitle)}</p>" if subtitle else ""
    st.markdown(
        f"""
        <div class="hc-step-card">
          <div class="hc-step-kicker">Step {number}</div>
          <h2>{_esc(title)}</h2>
          {subtitle_html}
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_upload_section(label: str, key: str, help_text: str | None = None):
    uploaded = st.file_uploader(label, type=["xlsx", "xls", "csv"], key=key, help=help_text)
    render_file_info(uploaded)
    return uploaded


def render_settings_section(title: str, subtitle: str | None = None) -> None:
    render_step_card(2, title, subtitle)


def render_results_section() -> None:
    render_step_card(4, "Results & downloads", "Inspect summary, warnings, previews, and local output files.")


def render_info_card(title: str, lines: Iterable[str], tone: str = "default") -> None:
    body = "".join(f"<div>{_esc(line)}</div>" for line in lines)
    st.markdown(
        f"""
        <div class="hc-info-card hc-{_esc(tone)}">
          <strong>{_esc(title)}</strong>
          {body}
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_local_first_notice() -> None:
    render_info_card(
        "Local-first analysis",
        [
            "All analyses are executed locally.",
            "Outputs are stored in outputs/ with metadata, logs, reports, and config snapshots.",
        ],
        tone="success",
    )


def render_file_info(uploaded_file) -> None:
    if uploaded_file is None:
        return
    size_kb = getattr(uploaded_file, "size", 0) / 1024
    suffix = Path(uploaded_file.name).suffix.lower().lstrip(".") or "file"
    st.markdown(
        f"""
        <div class="hc-file-pill">
          <strong>{_esc(uploaded_file.name)}</strong>
          <span>{size_kb:.1f} KB</span>
          <span>{_esc(suffix.upper())}</span>
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_run_button(label: str, key: str, disabled: bool = False, help_text: str | None = None) -> bool:
    clicked = st.button(label, type="primary", key=key, disabled=disabled, use_container_width=True)
    if disabled and help_text:
        render_info_card("Ready check", [help_text], tone="warning")
    return clicked


def render_warning_card(warnings: list[str] | None) -> None:
    if not warnings:
        return
    render_info_card("Warnings", [str(w) for w in warnings], tone="warning")


def render_error_card(message: str, debug: str | None = None) -> None:
    render_info_card("Analysis error", [message, "Please check the input format and required files."], tone="error")
    if debug:
        with st.expander("Debug details"):
            st.code(debug)


def render_success_card(message: str) -> None:
    render_info_card("Done", [message], tone="success")


def render_summary_card(items: dict[str, object]) -> None:
    if not items:
        return
    cols = st.columns(min(4, max(1, len(items))))
    for idx, (label, value) in enumerate(items.items()):
        with cols[idx % len(cols)]:
            st.markdown(
                f"""
                <div class="hc-kpi">
                  <div class="label">{_esc(label)}</div>
                  <div class="value">{_esc(value)}</div>
                </div>
                """,
                unsafe_allow_html=True,
            )


def render_preview_table(df: pd.DataFrame | None, title: str, rows: int = 20) -> None:
    if df is None:
        return
    render_section(title)
    st.dataframe(df.head(rows), use_container_width=True, hide_index=True)


def render_download_card(output_files: list[str], preferred_names: Iterable[str] | None = None) -> None:
    render_section("Output files", "Download files from this local run.")
    files = [Path(p) for p in output_files]
    if preferred_names:
        preferred = list(preferred_names)
        files = sorted(files, key=lambda p: (preferred.index(p.name) if p.name in preferred else len(preferred), p.name))
    existing = [p for p in files if p.exists()]
    if not existing:
        st.info("No downloadable files were found for this run.")
        return
    cols = st.columns(2)
    for idx, path in enumerate(existing):
        with cols[idx % 2]:
            with open(path, "rb") as f:
                st.download_button(
                    label=f"Download {path.name}",
                    data=f.read(),
                    file_name=path.name,
                    mime="application/octet-stream",
                    key=f"download-{path}",
                    use_container_width=True,
                )


def render_run_folder(run_dir: str | Path | None) -> None:
    if not run_dir:
        return
    st.markdown(f"<div class='hc-file-pill'>Run folder <code>{_esc(run_dir)}</code></div>", unsafe_allow_html=True)


def render_pdf_preview(path: str | Path | None, title: str = "PDF preview") -> None:
    if not path:
        return
    pdf_path = Path(path)
    if not pdf_path.exists() or pdf_path.suffix.lower() != ".pdf":
        return
    render_section(title)
    pdf_bytes = pdf_path.read_bytes()
    st.download_button(
        "Download report PDF",
        data=pdf_bytes,
        file_name=pdf_path.name,
        mime="application/pdf",
        use_container_width=True,
        key=f"download_report_{pdf_path.name}_{pdf_path.stat().st_mtime_ns}",
    )
    data = base64.b64encode(pdf_bytes).decode("utf-8")
    st.markdown(
        f"""
        <iframe class="hc-pdf-preview" src="data:application/pdf;base64,{data}#toolbar=0&navpanes=0&scrollbar=1"></iframe>
        """,
        unsafe_allow_html=True,
    )


def metadata_from_run_dir(run_dir: Path) -> dict:
    meta_path = run_dir / "run_metadata.json"
    if not meta_path.exists():
        return {}
    try:
        return json.loads(meta_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def warning_count_from_metadata(metadata: dict | None, index_warning: object = "") -> int:
    if metadata and isinstance(metadata.get("warnings"), list):
        return len(metadata["warnings"])
    text = "" if pd.isna(index_warning) else str(index_warning)
    return 0 if not text else len([x for x in text.split("|") if x.strip()])


def display_module_name(value: object) -> str:
    text = "" if value is None else str(value)
    return "ANTI" if text.lower() == "anti" else text


def render_history_card(row: pd.Series, metadata: dict | None = None) -> None:
    metadata = metadata or {}
    warning_count = warning_count_from_metadata(metadata, row.get("warnings", ""))
    well_count = metadata.get("common_well_count") or metadata.get("recognition", {}).get("well_count") or "n/a"
    run_name = metadata.get("run_name") or row.get("run_name", "") or "Untitled run"
    module_name = display_module_name(row.get("module_type", "Run"))
    st.markdown(
        f"""
        <div class="hc-history-card">
          <div>
            <span class="hc-tag">{_esc(module_name)}</span>
            <h3>{_esc(run_name)}</h3>
            <p>{_esc(row.get('timestamp', ''))}<br><code>{_esc(row.get('run_id', ''))}</code></p>
          </div>
          <div>
            <p><strong>Inputs</strong><br>{_esc(row.get('input_files', ''))}</p>
            <p><strong>Wells</strong> {_esc(well_count)} · <strong>Status</strong> complete · <strong>Warnings</strong> {_esc(warning_count)}</p>
          </div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_history_preview(index: pd.DataFrame, run_dir_for_row, metadata_loader, limit: int = 4) -> None:
    if index.empty:
        render_info_card("No runs yet", ["Run an analysis to start building a local, reproducible history."], tone="default")
        return
    for _, row in index.tail(limit).iloc[::-1].iterrows():
        run_dir = run_dir_for_row(row)
        render_history_card(row, metadata_loader(run_dir))
