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


def render_header(title: str, subtitle: str, tags: Iterable[str] | None = None, body: str | None = None) -> None:
    tag_html = ""
    if tags:
        tag_html = "<div class='hc-tags'>" + "".join(f"<span class='hc-tag'>{_esc(tag)}</span>" for tag in tags) + "</div>"
    body_html = f"<p class='hc-header-body'>{_esc(body)}</p>" if body else ""
    st.markdown(
        f"""
        <div class="hc-header">
          <h1>{_esc(title)}</h1>
          <p>{_esc(subtitle)}</p>
          {body_html}
          {tag_html}
        </div>
        """,
        unsafe_allow_html=True,
    )


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


def render_step(number: int, title: str, subtitle: str | None = None) -> None:
    subtitle_html = f"<p>{_esc(subtitle)}</p>" if subtitle else ""
    st.markdown(
        f"""
        <div class="hc-step-title">
          <span>Step {number}</span>
          <strong>{_esc(title)}</strong>
          {subtitle_html}
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_card(title: str, body: str, tag: str | None = None) -> None:
    tag_html = f"<div class='hc-tags'><span class='hc-tag'>{_esc(tag)}</span></div>" if tag else ""
    st.markdown(
        f"""
        <div class="hc-card">
          <h3>{_esc(title)}</h3>
          <p>{_esc(body)}</p>
          {tag_html}
        </div>
        """,
        unsafe_allow_html=True,
    )


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
            "Input files, reports, metadata, logs, and history records are saved in the outputs folder.",
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


def render_upload_card(label: str, key: str, help_text: str | None = None):
    uploaded = st.file_uploader(label, type=["xlsx", "xls", "csv"], key=key, help=help_text)
    render_file_info(uploaded)
    return uploaded


def render_run_button(label: str, key: str, disabled: bool = False, help_text: str | None = None) -> bool:
    clicked = st.button(label, type="primary", key=key, disabled=disabled, use_container_width=True)
    if disabled and help_text:
        render_info_card("Ready check", [help_text], tone="warning")
    return clicked


def render_warning_card(warnings: list[str] | None) -> None:
    if not warnings:
        return
    lines = [str(w) for w in warnings]
    render_info_card("Warnings", lines, tone="warning")


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
    render_section("Results & downloads", "Download files from this local run.")
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
    data = base64.b64encode(pdf_path.read_bytes()).decode("utf-8")
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


def render_history_card(row: pd.Series, metadata: dict | None = None) -> None:
    metadata = metadata or {}
    warning_count = warning_count_from_metadata(metadata, row.get("warnings", ""))
    well_count = metadata.get("common_well_count") or metadata.get("recognition", {}).get("well_count") or "n/a"
    st.markdown(
        f"""
        <div class="hc-history-card">
          <div>
            <span class="hc-tag">{_esc(row.get('module_type', 'Run'))}</span>
            <h3>{_esc(row.get('run_id', ''))}</h3>
            <p>{_esc(row.get('timestamp', ''))}</p>
          </div>
          <div>
            <p><strong>Inputs</strong><br>{_esc(row.get('input_files', ''))}</p>
            <p><strong>Wells</strong> {_esc(well_count)} · <strong>Status</strong> complete · <strong>Warnings</strong> {_esc(warning_count)}</p>
          </div>
        </div>
        """,
        unsafe_allow_html=True,
    )
