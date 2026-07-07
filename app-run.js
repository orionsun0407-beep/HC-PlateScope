    function requestPayload(files) {
      const payload = {
        module: activeModule,
        run_name: $("runName").value.trim(),
        plate_format: $("plateFormat").value,
        auto_standardize: $("autoStandardize").checked,
        files,
        spectra_layout: activeModule === "wellid" ? null : {
          mode: $("spectraMode").value,
          columns: Number($("spectraColumns").value),
          rows_per_page: Number($("spectraRowsPerPage").value),
        },
      };
      if (activeModule !== "wellid") {
        payload.plot = {
          smoothing_enabled: $("smoothEnabled").checked,
          marker_size: Number($("markerSize").value),
          line_width: Number($("lineWidth").value),
          per_well_y_axis: $("perWellYAxis").checked,
          y_upper_padding: Number($("yUpperPadding").value),
          show_heatmap_values: $("showHeatmapValues") ? $("showHeatmapValues").checked : false,
          robust_heatmap: $("robustHeatmap") ? $("robustHeatmap").checked : false,
          smoothing_method: $("smoothMethod").value,
          window_length: Number($("windowLength").value),
          polyorder: Number($("polyorder").value),
          marker_alpha: Number($("markerAlpha").value),
          line_alpha: Number($("lineAlpha").value),
          nice_rounding: $("niceRounding").checked,
          primary_color: $("primaryColor").value,
          secondary_color: $("secondaryColor").value,
          badge_color: $("badgeColor").value,
          heatmap_color: $("heatmapColor") ? $("heatmapColor").value : "hc_nature",
          robust_low: $("robustLow") ? Number($("robustLow").value) : 5,
          robust_high: $("robustHigh") ? Number($("robustHigh").value) : 95,
        };
      }
      if (activeModule === "luci") {
        payload.peak450 = [Number($("peak450Low").value), Number($("peak450High").value)];
        payload.peak520 = [Number($("peak520Low").value), Number($("peak520High").value)];
      }
      return payload;
    }

    function escapeHtml(value) {
      return String(value ?? "").replace(/[&<>"']/g, (ch) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
    }

    function renderResult(result) {
      $("summary").innerHTML = `
        <div class="notice">
          运行完成：<strong>${escapeHtml(result.run_id)}</strong><br>
          模块：${escapeHtml(result.module_type)} · 孔板：${escapeHtml(result.plate_format)} · 警告：${result.warnings.length}
        </div>`;
      const list = $("fileList");
      list.innerHTML = "";
      for (const file of result.files) {
        const li = document.createElement("li");
        li.textContent = file;
        list.appendChild(li);
      }
      $("resultPanel").style.display = "block";

      if (result.preview && result.preview.columns.length) {
        const head = `<tr>${result.preview.columns.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr>`;
        const rows = result.preview.rows.map((row) => `<tr>${result.preview.columns.map((c) => `<td>${escapeHtml(row[c])}</td>`).join("")}</tr>`).join("");
        $("preview").innerHTML = `<table>${head}${rows}</table>`;
        $("previewPanel").style.display = "block";
      }
      renderWellPlotPanel(result.well_plots);
    }

    function renderWellPlotPanel(info) {
      latestWellPlotInfo = info || null;
      const panel = $("wellPlotPanel");
      if (!info || !info.enabled) {
        panel.style.display = "none";
        return;
      }
      panel.style.display = "block";
      const metric = $("wellMetric");
      metric.innerHTML = "";
      for (const value of info.metrics || []) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        option.selected = value === info.default_metric;
        metric.appendChild(option);
      }
      if (!metric.options.length) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "plate order";
        metric.appendChild(option);
      }

      const selectedDefaults = new Set(info.default_wells || []);
      const wellSelect = $("wellSelect");
      wellSelect.innerHTML = "";
      for (const well of info.wells || []) {
        const option = document.createElement("option");
        option.value = well;
        option.textContent = well;
        option.selected = selectedDefaults.has(well);
        wellSelect.appendChild(option);
      }
      $("wellPreview").innerHTML = "";
    }

    function selectedWells() {
      return Array.from($("wellSelect").selectedOptions).map((option) => option.value);
    }

    async function refreshDefaultWells() {
      if (!latestWellPlotInfo || !pyodide) return;
      const request = {
        module: activeModule,
        metric: $("wellMetric").value || null,
      };
      pyodide.globals.set("WELL_PLOT_REQUEST_JSON", JSON.stringify(request));
      const raw = await pyodide.runPythonAsync(`
import json
from plate_processor.selected_well_plots import build_plot_series, available_plot_wells, default_selected_wells

req = json.loads(WELL_PLOT_REQUEST_JSON)
plot_series = build_plot_series(LATEST_ANALYSIS_RESULT, req["module"])
wells = available_plot_wells(plot_series)
summary = LATEST_ANALYSIS_RESULT.get("summary")
json.dumps(default_selected_wells(summary, req["module"], wells, req.get("metric")), ensure_ascii=False)
`);
      const defaults = new Set(JSON.parse(raw));
      for (const option of $("wellSelect").options) {
        option.selected = defaults.has(option.value);
      }
    }

    async function previewSelectedWell() {
      const wells = selectedWells();
      if (!wells.length) {
        setNotice("请至少选择一个 Good well。", true);
        return;
      }
      const request = {
        module: activeModule,
        well: wells[0],
        smooth: $("wellSmooth").checked,
        window: Number($("wellWindow").value),
      };
      pyodide.globals.set("WELL_PLOT_REQUEST_JSON", JSON.stringify(request));
      const dataUrl = await pyodide.runPythonAsync(`
import base64, json
from plate_processor.selected_well_plots import build_plot_series, preview_png_bytes

req = json.loads(WELL_PLOT_REQUEST_JSON)
plot_series = build_plot_series(LATEST_ANALYSIS_RESULT, req["module"])
data = preview_png_bytes(plot_series, req["well"], req["module"].upper(), smooth=bool(req.get("smooth", True)), window_length=int(req.get("window", 11)))
"data:image/png;base64," + base64.b64encode(data).decode("ascii")
`);
      $("wellPreview").innerHTML = `<img src="${dataUrl}" alt="Selected well preview">`;
      setNotice(`已预览 ${wells[0]}。`);
    }

    async function downloadWellPlot(kind) {
      const wells = selectedWells();
      if (!wells.length) {
        setNotice("请至少选择一个 Good well。", true);
        return;
      }
      const request = {
        module: activeModule,
        wells,
        kind,
        smooth: $("wellSmooth").checked,
        window: Number($("wellWindow").value),
        dpi: Number($("wellDpi").value),
      };
      pyodide.globals.set("WELL_PLOT_REQUEST_JSON", JSON.stringify(request));
      const raw = await pyodide.runPythonAsync(`
import json
from pathlib import Path
from plate_processor.selected_well_plots import build_plot_series, safe_filename, zipped_data_bytes, zipped_plot_bytes

req = json.loads(WELL_PLOT_REQUEST_JSON)
plot_series = build_plot_series(LATEST_ANALYSIS_RESULT, req["module"])
wells = req["wells"]
kind = req["kind"]
base = safe_filename(f"{LATEST_ANALYSIS_METADATA.get('run_id', 'browser')}_{req['module']}_selected_well_plots")
if kind == "data":
    payload = zipped_data_bytes(plot_series, wells, req["module"].upper())
    name = f"{base}_data.zip"
else:
    payload = zipped_plot_bytes(
        plot_series,
        wells,
        req["module"].upper(),
        "tiff" if kind == "tif" else kind,
        smooth=bool(req.get("smooth", True)),
        window_length=int(req.get("window", 11)),
        dpi=int(req.get("dpi", 600)),
    )
    name = f"{base}_{kind}.zip"
path = Path(name)
path.write_bytes(payload)
json.dumps({"path": str(path), "name": name}, ensure_ascii=False)
`);
      const result = JSON.parse(raw);
      const bytes = pyodide.FS.readFile(result.path);
      const blob = new Blob([bytes], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setNotice(`已生成 ${result.name}。`);
    }

    async function runAnalysis(event) {
      event.preventDefault();
      try {
        if (!pyodide) await initPython();
        $("runBtn").disabled = true;
        $("downloadBtn").disabled = true;
        setNotice("正在运行分析...");
        const files = await collectFiles();
        const payload = requestPayload(files);
        pyodide.globals.set("RUN_REQUEST_JSON", JSON.stringify(payload));
        const raw = await pyodide.runPythonAsync(`
import json, zipfile, traceback
from pathlib import Path
import pandas as pd
from plate_processor.io import standardize_by_well
from plate_processor.report import run_wellid, run_geco, run_geco_384_paired, run_luci, run_lss
from plate_processor.anti_analysis import run_anti_analysis
from plate_processor.selected_well_plots import available_plot_wells, build_plot_series, default_quality_metric, default_selected_wells, summary_metric_columns
from plate_processor.utils import load_config

req = json.loads(RUN_REQUEST_JSON)
cfg = load_config("config.yaml")
cfg["run_name"] = req.get("run_name", "")
plate_format = req.get("plate_format", "auto")
cfg.setdefault("plate", {})["format"] = "auto" if plate_format == "auto" else int(plate_format)

layout_req = req.get("spectra_layout") or {}
if layout_req:
    spectra_grid = cfg.setdefault("plotting", {}).setdefault("spectra_grid", {})
    spectra_grid["mode"] = layout_req.get("mode", spectra_grid.get("mode", "compact"))
    spectra_grid["columns"] = int(layout_req.get("columns", spectra_grid.get("columns", 12)))
    spectra_grid["rows_per_page"] = int(layout_req.get("rows_per_page", spectra_grid.get("rows_per_page", 8)))
if req.get("module") == "geco" and plate_format == "384":
    cfg.setdefault("plotting", {}).setdefault("spectra_grid", {})["mode"] = "compact"

plot_req = req.get("plot") or {}
if plot_req:
    plotting = cfg.setdefault("plotting", {})
    plot = cfg.setdefault("plot", {})
    smoothing = plot.setdefault("smoothing", cfg.setdefault("smoothing", {}).copy())
    smoothing["enabled"] = bool(plot_req.get("smoothing_enabled", True))
    smoothing["method"] = plot_req.get("smoothing_method", "savgol")
    smoothing["window_length"] = int(plot_req.get("window_length", 9))
    smoothing["polyorder"] = int(plot_req.get("polyorder", 3))
    cfg.setdefault("smoothing", {}).update(smoothing)
    plot["marker_size"] = float(plot_req.get("marker_size", 1.0))
    plot["line_width"] = float(plot_req.get("line_width", 1.0))
    plot["marker_alpha"] = float(plot_req.get("marker_alpha", 0.55))
    plot["line_alpha"] = float(plot_req.get("line_alpha", 0.95))
    plot["smoothing"] = smoothing
    plotting["marker_size"] = plot["marker_size"]
    plotting["line_width"] = plot["line_width"]
    plotting["alpha"] = plot["marker_alpha"]
    plotting["line_alpha"] = plot["line_alpha"]
    y_axis = plotting.setdefault("y_axis", {})
    y_axis["per_well"] = bool(plot_req.get("per_well_y_axis", True))
    y_axis["upper_padding"] = float(plot_req.get("y_upper_padding", 1.10))
    y_axis["rounding_mode"] = "nice_round" if plot_req.get("nice_rounding", True) else "raw"
    colors = plotting.setdefault("colors", {})
    colors["primary"] = plot_req.get("primary_color", colors.get("primary", "#0F4D92"))
    colors["secondary"] = plot_req.get("secondary_color", colors.get("secondary", "#8BCF8B"))
    colors["heatmap"] = plot_req.get("heatmap_color", colors.get("heatmap", "hc_nature"))
    heatmap = plotting.setdefault("heatmap", {})
    heatmap["show_values"] = bool(plot_req.get("show_heatmap_values", True))
    heatmap["robust_scaling"] = bool(plot_req.get("robust_heatmap", True))
    heatmap["robust_lower_percentile"] = float(plot_req.get("robust_low", 5))
    heatmap["robust_upper_percentile"] = float(plot_req.get("robust_high", 95))
    badges = plotting.setdefault("badges", {})
    module_key = req.get("module")
    if module_key == "geco":
        badges["geco_ratio"] = plot_req.get("badge_color", badges.get("geco_ratio", "#42949E"))
    elif module_key == "luci":
        badges["luci_ratio"] = plot_req.get("badge_color", badges.get("luci_ratio", "#9A4D8E"))
    elif module_key == "lss":
        badges["lss_distance"] = plot_req.get("badge_color", badges.get("lss_distance", "#E28E2C"))
        cfg.setdefault("lss", {}).setdefault("y_axis", {})["upper_padding"] = y_axis["upper_padding"]
        cfg.setdefault("lss", {}).setdefault("y_axis", {})["rounding_mode"] = y_axis["rounding_mode"]
    elif module_key == "anti":
        cfg.setdefault("anti", {}).setdefault("y_axis", {})["upper_padding"] = y_axis["upper_padding"]
if req.get("module") == "luci":
    cfg.setdefault("peaks", {})["luci_450_window"] = req.get("peak450", [430, 470])
    cfg.setdefault("peaks", {})["luci_520_window"] = req.get("peak520", [500, 540])

def maybe_standardize(file_info):
    if not req.get("auto_standardize"):
        return file_info["path"], file_info["name"]
    in_path = Path(file_info["path"])
    df, _ = standardize_by_well(in_path, cfg, filename=file_info["name"])
    out_path = Path("browser_inputs") / f"{in_path.stem}_standardized.xlsx"
    df.to_excel(out_path, index=False)
    return str(out_path), out_path.name

files = req["files"]
module = req["module"]
if module == "wellid":
    info = files["input"]
    result = run_wellid(info["path"], info["name"], cfg)
elif module == "geco":
    if str(cfg.get("plate", {}).get("format")) == "384":
        path, name = maybe_standardize(files["input"])
        result = run_geco_384_paired(path, name, cfg)
    else:
        with_path, with_name = maybe_standardize(files["with_ca"])
        without_path, without_name = maybe_standardize(files["without_ca"])
        result = run_geco(with_path, without_path, with_name, without_name, cfg)
elif module == "luci":
    path, name = maybe_standardize(files["input"])
    result = run_luci(path, name, cfg)
elif module == "lss":
    emission_path, emission_name = maybe_standardize(files["emission"])
    excitation_path, excitation_name = maybe_standardize(files["excitation"])
    result = run_lss(emission_path, excitation_path, emission_name, excitation_name, cfg)
elif module == "anti":
    emission_path, emission_name = maybe_standardize(files["emission"])
    excitation_path, excitation_name = maybe_standardize(files["excitation"])
    result = run_anti_analysis(excitation_path, emission_path, excitation_name, emission_name, cfg)
else:
    raise ValueError(f"Unknown module: {module}")

metadata = result.get("metadata", {})
LATEST_ANALYSIS_RESULT = result
LATEST_ANALYSIS_METADATA = metadata
run_dir = Path(result["run_dir"])
zip_name = f"{metadata.get('run_id', run_dir.name)}_outputs.zip"
zip_path = Path(zip_name)
with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
    for item in run_dir.rglob("*"):
        if item.is_file():
            zf.write(item, arcname=str(Path(run_dir.name) / item.relative_to(run_dir)))

preview_df = None
for key in ["summary", "standardized", "normalized", "excitation_normalized"]:
    value = result.get(key)
    if isinstance(value, pd.DataFrame):
        preview_df = value
        break
preview = {"columns": [], "rows": []}
if preview_df is not None:
    small = preview_df.head(12).where(pd.notna(preview_df), "")
    preview = {"columns": [str(c) for c in small.columns], "rows": small.astype(str).to_dict(orient="records")}

plot_series = build_plot_series(result, module)
wells = available_plot_wells(plot_series)
metrics = summary_metric_columns(result.get("summary"))
default_metric = default_quality_metric(result.get("summary"), module)
well_plots = {
    "enabled": bool(plot_series and wells),
    "wells": wells,
    "metrics": metrics,
    "default_metric": default_metric or "",
    "default_wells": default_selected_wells(result.get("summary"), module, wells, default_metric) if wells else [],
}

json.dumps({
    "run_id": metadata.get("run_id", ""),
    "module_type": metadata.get("module_type", module),
    "plate_format": metadata.get("plate_format", ""),
    "warnings": metadata.get("warnings", []),
    "files": [str(Path(f).relative_to(run_dir)) if str(f).startswith(str(run_dir)) else str(f) for f in result.get("output_files", [])],
    "zip_path": str(zip_path),
    "zip_name": zip_name,
    "preview": preview,
    "well_plots": well_plots,
}, ensure_ascii=False)
`);
        const result = JSON.parse(raw);
        const zipBytes = pyodide.FS.readFile(result.zip_path);
        latestZip = { name: result.zip_name, blob: new Blob([zipBytes], { type: "application/zip" }) };
        $("downloadBtn").disabled = false;
        renderResult(result);
        setNotice("分析完成，可以下载 outputs.zip。");
      } catch (err) {
        console.error(err);
        setNotice(err.message || String(err), true);
      } finally {
        $("runBtn").disabled = !pyodide;
      }
    }

    $("dashboardBtn").addEventListener("click", openDashboard);
    $("backBtn").addEventListener("click", openDashboard);
    $("initBtn").addEventListener("click", () => initPython().catch((err) => {
      console.error(err);
      setStatus("初始化失败");
      setNotice(err.message || String(err), true);
      $("initBtn").disabled = false;
    }));
    $("runForm").addEventListener("submit", runAnalysis);
    $("downloadBtn").addEventListener("click", () => {
      if (!latestZip) return;
      const url = URL.createObjectURL(latestZip.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = latestZip.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
    $("wellMetric").addEventListener("change", () => refreshDefaultWells().catch((err) => {
      console.error(err);
      setNotice(err.message || String(err), true);
    }));
    $("wellPreviewBtn").addEventListener("click", () => previewSelectedWell().catch((err) => {
      console.error(err);
      setNotice(err.message || String(err), true);
    }));
    $("wellSvgBtn").addEventListener("click", () => downloadWellPlot("svg").catch((err) => {
      console.error(err);
      setNotice(err.message || String(err), true);
    }));
    $("wellPdfBtn").addEventListener("click", () => downloadWellPlot("pdf").catch((err) => {
      console.error(err);
      setNotice(err.message || String(err), true);
    }));
    $("wellTifBtn").addEventListener("click", () => downloadWellPlot("tif").catch((err) => {
      console.error(err);
      setNotice(err.message || String(err), true);
    }));
    $("wellDataBtn").addEventListener("click", () => downloadWellPlot("data").catch((err) => {
      console.error(err);
      setNotice(err.message || String(err), true);
    }));
    $("plateFormat").addEventListener("change", render);
    $("spectraMode").addEventListener("change", renderPlateControls);
    renderDashboard();
    openDashboard();
