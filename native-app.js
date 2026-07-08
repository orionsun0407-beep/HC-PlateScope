(() => {
  "use strict";

  const APP_VERSION = "2026-07-08-native5";
  const ROWS_384 = "ABCDEFGHIJKLMNOP".split("");
  const COLS_384 = Array.from({ length: 24 }, (_, i) => i + 1);
  const STORE_KEY = "hc_platescope_native_runs";
  const CONFIG_KEY = "hc_platescope_native_config";
  const LIBS = {
    xlsx: { url: "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js", test: () => window.XLSX },
    papa: { url: "https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js", test: () => window.Papa },
    zip: { url: "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js", test: () => window.JSZip },
    pdf: { url: "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js", test: () => window.jspdf },
    tiff: { url: "https://cdn.jsdelivr.net/npm/utif@3.1.0/UTIF.min.js", test: () => window.UTIF },
  };
  const libPromises = {};

  const DEFAULT_CONFIG = {
    project: { name: "HC PlateScope", version: "2.0.0" },
    input: {
      wavelength_keywords: ["wavelength", "wave", "lambda", "nm", "wl", "波长"],
      scan_all_columns_for_wells: true,
      coerce_numeric: true,
    },
    plate: { format: "auto" },
    smoothing: { method: "savgol", window_length: 9, polyorder: 3 },
    peaks: { luci_450_window: [430, 470], luci_520_window: [500, 540] },
    normalization: { enabled: true, mode: "max_per_well" },
    plotting: {
      marker_size: 1.0,
      line_width: 1.0,
      alpha: 0.55,
      line_alpha: 0.95,
      dpi: 300,
      font_family: "Arial",
      colors: {
        primary: "#0F4D92",
        secondary: "#8BCF8B",
        accent: "#B64342",
        heatmap: "hc_nature",
      },
      badges: {
        lss_emission: "#B64342",
        lss_excitation: "#0F4D92",
        lss_distance: "#E28E2C",
        geco_ratio: "#42949E",
        luci_ratio: "#9A4D8E",
      },
      y_axis: { per_well: true, upper_padding: 1.1, rounding_mode: "nice_round" },
      x_axis: { tick_interval_nm: 10, label_interval_nm: 50, show_labels_on_bottom_row_only: true, tick_label_rotation: 90 },
      heatmap: { enabled: true, show_values: true, value_format: ".2f", robust_scaling: true, robust_lower_percentile: 5, robust_upper_percentile: 95 },
      layout: { rows: 8, cols: 12, page_size: "A4_portrait" },
      spectra_grid: { mode: "compact", columns: 12, rows_per_page: 8 },
    },
    output: { base_dir: "outputs", run_index: "outputs/run_index.csv" },
    ui: { show_recent_runs: true, recent_runs: 5, debug_mode: false },
    lss: { normalize: false, use_raw_data: true, output_heatmap: false, y_axis: { mode: "per_well", upper_padding: 1.1, rounding_mode: "nice_round" } },
    anti: {
      normalize: true,
      normalization_method: "column_max",
      output_heatmap: false,
      y_axis: { mode: "per_well", upper_padding: 1.1 },
      output: { save_normalized_excitation: true, save_normalized_emission: true, save_grid_pdf: true, save_combined_report: true },
    },
    plot: {
      layout: { rows: 8, columns: 12 },
      page_size: "A4",
      orientation: "portrait",
      marker_size: 1.0,
      line_width: 1.0,
      marker_alpha: 0.55,
      line_alpha: 0.95,
      smoothing: { enabled: true, method: "savgol", window_length: 9, polyorder: 3 },
    },
  };

  const MODULES = {
    wellid: {
      title: "Well ID Extractor",
      description: "Convert raw plate-reader files into standardized well-by-column tables.",
      tags: ["Standardization", "Well ID", "Excel export"],
      accent: "teal",
      data_mode: "Raw reader export, standardized output",
    },
    geco: {
      title: "GECO Analysis",
      description: "Compare with-CA and without-CA spectra and generate peak-ratio heatmaps.",
      tags: ["Raw spectra", "Peak ratio", "Heatmap"],
      accent: "bluegreen",
      data_mode: "Raw spectra, peak ratio heatmap",
    },
    luci: {
      title: "LUCI Analysis",
      description: "Normalize spectra, detect 450/520 nm peaks, and calculate emission ratios.",
      tags: ["Normalization", "Peak detection", "520:450"],
      accent: "blueorange",
      data_mode: "Normalized spectra, 450/520 peak detection",
    },
    lss: {
      title: "LSS Analysis",
      description: "Overlay raw excitation and emission spectra for each well without normalization.",
      tags: ["Raw overlay", "Excitation", "Emission"],
      accent: "purpleteal",
      data_mode: "Raw spectra, no normalization",
    },
    anti: {
      title: "ANTI Analysis",
      description: "Normalize excitation and emission spectra, then overlay both signals for each well.",
      tags: ["Normalized overlay", "Excitation", "Emission"],
      accent: "greenblue",
      data_mode: "Normalized excitation/emission overlay",
    },
  };

  const state = {
    page: "dashboard",
    module: null,
    config: loadConfig(),
    lastResult: null,
    history: loadHistory(),
    debug: false,
  };

  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const isFiniteNumber = (value) => Number.isFinite(Number(value));
  const asNum = (value) => {
    if (value === null || value === undefined || value === "") return NaN;
    const n = Number(String(value).replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : NaN;
  };
  const fmt = (value, digits = 3) => Number.isFinite(value) ? Number(value).toFixed(digits).replace(/\.?0+$/, "") : "";
  const nowIso = () => new Date().toISOString();
  const runId = (module) => `${module}_${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}`;

  function deepCopy(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function loadScriptOnce(key) {
    const lib = LIBS[key];
    if (!lib) return Promise.reject(new Error(`Unknown library: ${key}`));
    if (lib.test()) return Promise.resolve();
    if (libPromises[key]) return libPromises[key];
    libPromises[key] = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `${lib.url}?v=${APP_VERSION}`;
      script.async = true;
      script.onload = () => lib.test() ? resolve() : reject(new Error(`Loaded ${key}, but the library did not initialize.`));
      script.onerror = () => reject(new Error(`Could not load ${key} from ${lib.url}`));
      document.head.appendChild(script);
    });
    return libPromises[key];
  }

  async function ensureAnalysisLibraries() {
    await Promise.all([loadScriptOnce("xlsx"), loadScriptOnce("papa"), loadScriptOnce("pdf")]);
  }

  async function ensureZipLibrary() {
    await loadScriptOnce("zip");
  }

  async function ensureTiffLibrary() {
    await loadScriptOnce("tiff");
  }

  function simpleCsv(rows) {
    if (!rows.length) return "";
    const columns = Object.keys(rows[0]);
    const quote = (value) => {
      if (value === null || value === undefined || Number.isNaN(value)) return "";
      const text = String(value);
      return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    return [columns.join(","), ...rows.map((row) => columns.map((col) => quote(row[col])).join(","))].join("\n");
  }

  function showFatalError(error) {
    const message = error && error.message ? error.message : String(error || "Unknown error");
    const stack = error && error.stack ? error.stack : "";
    const dashboard = $("dashboard");
    const workspace = $("workspace");
    if (dashboard) {
      dashboard.classList.remove("hidden");
      dashboard.innerHTML = `<div class="hc-info-card hc-error"><strong>Page script error</strong><div>${esc(message)}</div><pre class="log">${esc(stack)}</pre></div>`;
    }
    if (workspace) workspace.classList.add("hidden");
  }

  function loadConfig() {
    try {
      return mergeDeep(deepCopy(DEFAULT_CONFIG), JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}"));
    } catch {
      return deepCopy(DEFAULT_CONFIG);
    }
  }

  function saveConfig() {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(state.config));
  }

  function loadHistory() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function saveHistory() {
    localStorage.setItem(STORE_KEY, JSON.stringify(state.history.slice(0, 50)));
  }

  function mergeDeep(base, patch) {
    for (const [key, value] of Object.entries(patch || {})) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        base[key] = mergeDeep(base[key] || {}, value);
      } else {
        base[key] = value;
      }
    }
    return base;
  }

  function plateFormatFromConfig(config = state.config) {
    const value = config?.plate?.format ?? "auto";
    if (value === 96 || String(value).toLowerCase().startsWith("96")) return 96;
    if (value === 384 || String(value).toLowerCase().startsWith("384")) return 384;
    return "auto";
  }

  function normalizeWellId(value, plateFormat = "auto") {
    const text = String(value ?? "").trim().toUpperCase();
    const match = text.match(/^([A-P])\s*0?([1-9]|1[0-9]|2[0-4])$/);
    if (!match) return null;
    const row = match[1];
    const col = Number(match[2]);
    const fmtValue = plateFormat === "auto" ? "auto" : plateFormatFromConfig({ plate: { format: plateFormat } });
    if (fmtValue === 96 && (!"ABCDEFGH".includes(row) || col > 12)) return null;
    if (fmtValue === 384 && (!ROWS_384.includes(row) || col > 24)) return null;
    return `${row}${String(col).padStart(2, "0")}`;
  }

  function detectPlateFormat(wells) {
    for (const raw of wells) {
      const well = normalizeWellId(raw);
      if (well && (!"ABCDEFGH".includes(well[0]) || Number(well.slice(1)) > 12)) return 384;
    }
    return 96;
  }

  function plateLayout(config, wells = []) {
    let format = plateFormatFromConfig(config);
    if (format === "auto") format = detectPlateFormat(wells);
    return {
      format,
      rows: format === 96 ? "ABCDEFGH".split("") : ROWS_384,
      cols: format === 96 ? Array.from({ length: 12 }, (_, i) => i + 1) : COLS_384,
    };
  }

  function sortedWells(wells, config = state.config) {
    const fmtValue = plateFormatFromConfig(config);
    const normalized = wells.map((w) => normalizeWellId(w, fmtValue)).filter(Boolean);
    return [...new Set(normalized)].sort((a, b) => ROWS_384.indexOf(a[0]) - ROWS_384.indexOf(b[0]) || Number(a.slice(1)) - Number(b.slice(1)));
  }

  function ensureUniqueColumns(columns) {
    const seen = new Map();
    return columns.map((col) => {
      let name = String(col ?? "").trim();
      if (!seen.has(name)) {
        seen.set(name, 0);
        return name;
      }
      const next = seen.get(name) + 1;
      seen.set(name, next);
      return `${name}.${next}`;
    });
  }

  function tableFromAoA(aoa, headerIndex = 0) {
    const header = ensureUniqueColumns((aoa[headerIndex] || []).map((x) => String(x ?? "").trim()));
    const keep = header.map((h, i) => h ? i : -1).filter((i) => i >= 0);
    const columns = keep.map((i) => header[i]);
    const rows = [];
    for (let r = headerIndex + 1; r < aoa.length; r += 1) {
      const source = aoa[r] || [];
      if (!source.some((cell) => String(cell ?? "").trim())) continue;
      const row = {};
      columns.forEach((col, idx) => { row[col] = source[keep[idx]] ?? ""; });
      rows.push(row);
    }
    return { columns, rows };
  }

  function hasWavelengthKeyword(value, config = state.config) {
    const name = String(value ?? "").trim().toLowerCase();
    const keywords = config.input.wavelength_keywords.length ? config.input.wavelength_keywords : ["wavelength", "wave", "lambda", "nm"];
    return keywords.some((keyword) => {
      const k = String(keyword).trim().toLowerCase();
      if (!k) return false;
      if (k === "nm") return name === "nm" || name.includes("[nm]") || name.includes("(nm)") || name.endsWith(" nm");
      return name.includes(k);
    });
  }

  function scoreHeader(fields, config = state.config) {
    const cleaned = fields.map((f) => String(f ?? "").trim());
    if (cleaned.filter(Boolean).length < 2) return 0;
    const hasWavelength = cleaned.some((field) => hasWavelengthKeyword(field, config));
    const wellCount = cleaned.filter((field) => normalizeWellId(field)).length;
    const generic = new Set(["well", "well id", "well_id", "signal", "value", "intensity"]);
    const genericScore = cleaned.filter((field) => generic.has(field.toLowerCase())).length;
    if (!hasWavelength && !wellCount && !genericScore) return 0;
    return wellCount * 10 + (hasWavelength ? 25 : 0) + genericScore * 5 + Math.min(cleaned.length, 30);
  }

  function detectHeaderRow(aoa, config = state.config) {
    let best = { score: -1, index: 0 };
    for (let i = 0; i < Math.min(aoa.length, 250); i += 1) {
      const score = scoreHeader(aoa[i] || [], config);
      if (score > best.score) best = { score, index: i };
    }
    return best.score > 0 ? best.index : 0;
  }

  async function readUploadedTable(file, config = state.config) {
    const ext = file.name.split(".").pop().toLowerCase();
    if (["xlsx", "xls"].includes(ext)) {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      return tableFromAoA(aoa, detectHeaderRow(aoa, config));
    }
    if (ext === "csv") {
      const text = await file.text();
      const candidates = [",", "\t", ";"].map((delimiter) => Papa.parse(text, { delimiter, skipEmptyLines: false }).data);
      const best = candidates.map((aoa) => ({ aoa, header: detectHeaderRow(aoa, config), score: scoreHeader(aoa[detectHeaderRow(aoa, config)] || [], config) }))
        .sort((a, b) => b.score - a.score)[0];
      return tableFromAoA(best.aoa, best.header);
    }
    throw new Error(`Unsupported file type .${ext}. Please upload .xlsx, .xls, or .csv.`);
  }

  function findWavelengthColumn(table, config = state.config) {
    for (const col of table.columns) {
      if (hasWavelengthKeyword(col, config)) {
        const numeric = table.rows.map((row) => asNum(row[col])).filter(Number.isFinite);
        if (numeric.length >= Math.max(3, table.rows.length * 0.4)) return col;
      }
    }
    let best = null;
    let bestScore = -1;
    for (const col of table.columns) {
      const numeric = table.rows.map((row) => asNum(row[col])).filter(Number.isFinite);
      if (numeric.length < 3) continue;
      const sorted = numeric.every((v, i) => i === 0 || v >= numeric[i - 1]) || numeric.every((v, i) => i === 0 || v <= numeric[i - 1]);
      const median = numeric.slice().sort((a, b) => a - b)[Math.floor(numeric.length / 2)];
      const score = (sorted ? 1000 : 0) + (median >= 100 && median <= 1000 ? 200 : 0) + new Set(numeric).size;
      if (score > bestScore) {
        best = col;
        bestScore = score;
      }
    }
    if (!best) throw new Error("Could not identify a wavelength column.");
    return best;
  }

  function standardizeByWell(table, config = state.config) {
    const plateFormat = plateFormatFromConfig(config);
    const wavelengthCol = findWavelengthColumn(table, config);
    const wellCols = {};
    for (const col of table.columns) {
      if (col === wavelengthCol) continue;
      const well = normalizeWellId(col, plateFormat);
      if (well) {
        if (wellCols[well]) throw new Error(`Duplicate well column detected after normalization: ${well}.`);
        wellCols[well] = col;
      }
    }
    if (Object.keys(wellCols).length) {
      const wells = sortedWells(Object.keys(wellCols), config);
      const rows = table.rows
        .map((row) => {
          const out = { Wavelength: asNum(row[wavelengthCol]) };
          wells.forEach((well) => { out[well] = asNum(row[wellCols[well]]); });
          return out;
        })
        .filter((row) => Number.isFinite(row.Wavelength))
        .sort((a, b) => a.Wavelength - b.Wavelength);
      return { table: { columns: ["Wavelength", ...wells], rows }, info: { format: "wide", wavelength_column: wavelengthCol, well_count: wells.length } };
    }

    let wellRowCol = null;
    for (const col of table.columns) {
      const count = table.rows.map((row) => normalizeWellId(row[col], plateFormat)).filter(Boolean).length;
      if (count >= 2) {
        wellRowCol = col;
        break;
      }
    }
    if (!wellRowCol) throw new Error("Could not identify well IDs in columns or rows. Expected IDs like A01-H12 or A01-P24.");

    const signalCandidates = [];
    for (const col of table.columns) {
      if (col === wavelengthCol || col === wellRowCol) continue;
      const numeric = table.rows.map((row) => asNum(row[col])).filter(Number.isFinite);
      if (numeric.length >= Math.max(3, table.rows.length * 0.25)) {
        const name = col.toLowerCase();
        let score = numeric.length + new Set(numeric).size;
        if (name === "signal") score += 20000;
        else if (name.includes("signal") && !name.includes("ref")) score += 12000;
        else if (["intensity", "value", "result"].some((k) => name.includes(k))) score += 6000;
        if (["repeat", "row", "column", "step", "loop"].includes(name)) score -= 12000;
        if (["time", "position", "barcode", "channel", "window", "wavelength"].some((k) => name.includes(k))) score -= 12000;
        signalCandidates.push({ col, score });
      }
    }
    if (!signalCandidates.length) throw new Error("Could not identify a numeric signal column for long-format data.");
    const signalCol = signalCandidates.sort((a, b) => b.score - a.score)[0].col;
    const grouped = new Map();
    for (const row of table.rows) {
      const wl = asNum(row[wavelengthCol]);
      const well = normalizeWellId(row[wellRowCol], plateFormat);
      const value = asNum(row[signalCol]);
      if (!Number.isFinite(wl) || !well) continue;
      const key = `${wl}||${well}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(value);
    }
    const byWavelength = new Map();
    for (const [key, values] of grouped.entries()) {
      const [wlText, well] = key.split("||");
      const wl = Number(wlText);
      if (!byWavelength.has(wl)) byWavelength.set(wl, { Wavelength: wl });
      const finite = values.filter(Number.isFinite);
      byWavelength.get(wl)[well] = finite.length ? finite.reduce((a, b) => a + b, 0) / finite.length : NaN;
    }
    const wells = sortedWells([...new Set([...grouped.keys()].map((key) => key.split("||")[1]))], config);
    const rows = [...byWavelength.values()].sort((a, b) => a.Wavelength - b.Wavelength);
    return { table: { columns: ["Wavelength", ...wells], rows }, info: { format: "long", wavelength_column: wavelengthCol, well_column: wellRowCol, signal_column: signalCol, well_count: wells.length } };
  }

  function validateStandardTable(table, name, config = state.config) {
    if (!table.rows.length || table.columns.length < 2) throw new Error(`${name}: expected a wavelength column plus at least one well column.`);
    const first = table.columns[0];
    const plateFormat = plateFormatFromConfig(config);
    const map = {};
    const wells = [];
    for (const col of table.columns.slice(1)) {
      const well = normalizeWellId(col, plateFormat);
      if (well) {
        map[col] = well;
        wells.push(well);
      }
    }
    if (!wells.length) throw new Error(`${name}: no well columns were found. Expected column names like A01-H12 or A01-P24.`);
    if (new Set(wells).size !== wells.length) throw new Error(`${name}: duplicate well IDs detected after normalization.`);
    const ordered = sortedWells(wells, config);
    const rows = table.rows.map((row) => {
      const out = { Wavelength: asNum(row[first]) };
      for (const original of Object.keys(map)) out[map[original]] = asNum(row[original]);
      return out;
    }).filter((row) => Number.isFinite(row.Wavelength)).sort((a, b) => a.Wavelength - b.Wavelength);
    return { table: { columns: ["Wavelength", ...ordered], rows }, wells: ordered };
  }

  async function prepareFile(file, config, autoStandardize) {
    const raw = await readUploadedTable(file, config);
    if (!autoStandardize) return { ...validateStandardTable(raw, file.name, config), sourceName: file.name };
    const standardized = standardizeByWell(raw, config);
    return { table: standardized.table, wells: standardized.table.columns.slice(1), info: standardized.info, sourceName: `${file.name.replace(/\.[^.]+$/, "")}_standardized.xlsx` };
  }

  function warningIfNegative(table, wells) {
    const warnings = [];
    let negative = false;
    let missing = false;
    for (const row of table.rows) {
      for (const well of wells) {
        const value = asNum(row[well]);
        if (Number.isFinite(value) && value < 0) negative = true;
        if (!Number.isFinite(value)) missing = true;
      }
    }
    if (negative) warnings.push("Detected negative signal values; values were kept and processed as provided.");
    if (missing) warnings.push("Detected missing or non-numeric signal values; affected points were ignored in calculations/plots.");
    return warnings;
  }

  function maxOfWell(table, well) {
    const values = table.rows.map((row) => asNum(row[well])).filter(Number.isFinite);
    return values.length ? Math.max(...values) : NaN;
  }

  function maxInWindow(table, well, window) {
    let best = { wavelength: NaN, value: NaN };
    for (const row of table.rows) {
      const wl = asNum(row.Wavelength);
      const value = asNum(row[well]);
      if (Number.isFinite(wl) && wl >= window[0] && wl <= window[1] && Number.isFinite(value)) {
        if (!Number.isFinite(best.value) || value > best.value) best = { wavelength: wl, value };
      }
    }
    return best;
  }

  function normalizeMaxPerWell(table, wells, strictPositive = false, dataset = "") {
    const rows = table.rows.map((row) => ({ Wavelength: row.Wavelength }));
    const summary = [];
    const warnings = [];
    for (const well of wells) {
      const maxValue = maxOfWell(table, well);
      const valid = Number.isFinite(maxValue) && (strictPositive ? maxValue > 0 : maxValue !== 0);
      if (!valid && strictPositive) warnings.push(`${dataset} ${well}: column maximum is zero, negative, or invalid; normalized values set to NaN.`);
      for (let i = 0; i < table.rows.length; i += 1) {
        const value = asNum(table.rows[i][well]);
        rows[i][well] = valid && Number.isFinite(value) ? value / maxValue : NaN;
      }
      if (strictPositive) summary.push({ dataset, well_id: well, raw_max: maxValue, normalized: Boolean(valid), status: valid ? "normalized" : "invalid_max" });
    }
    return { table: { columns: ["Wavelength", ...wells], rows }, summary, warnings };
  }

  function gecoPeakRatio(withCa, withoutCa, wells) {
    return wells.map((well) => {
      const withMax = maxOfWell(withCa, well);
      const withoutMax = maxOfWell(withoutCa, well);
      return { well_id: well, with_ca_max: withMax, without_ca_max: withoutMax, ratio: Number.isFinite(withMax) && Number.isFinite(withoutMax) && withoutMax !== 0 ? withMax / withoutMax : NaN };
    });
  }

  function luciPeakSummary(table, wells, peak450, peak520) {
    return wells.map((well) => {
      const p450 = maxInWindow(table, well, peak450);
      const p520 = maxInWindow(table, well, peak520);
      return {
        well_id: well,
        peak450_wavelength: p450.wavelength,
        peak450_value: p450.value,
        peak520_wavelength: p520.wavelength,
        peak520_value: p520.value,
        ratio_520_450: Number.isFinite(p450.value) && p450.value !== 0 && Number.isFinite(p520.value) ? p520.value / p450.value : NaN,
      };
    });
  }

  function lssSummary(emission, excitation, wells) {
    const rows = wells.map((well) => {
      const e = maxInWindow(emission, well, [-Infinity, Infinity]);
      const x = maxInWindow(excitation, well, [-Infinity, Infinity]);
      return {
        well_id: well,
        emission_peak_wavelength: e.wavelength,
        emission_max: e.value,
        excitation_peak_wavelength: x.wavelength,
        excitation_max: x.value,
        peak_wavelength_distance: Number.isFinite(e.wavelength) && Number.isFinite(x.wavelength) ? Math.abs(e.wavelength - x.wavelength) : NaN,
      };
    });
    for (const [metric, rankCol, flagCol] of [
      ["emission_max", "emission_rank", "emission_top10"],
      ["excitation_max", "excitation_rank", "excitation_top10"],
      ["peak_wavelength_distance", "peak_distance_rank", "peak_distance_top10"],
    ]) {
      const values = rows.map((r) => r[metric]).filter(Number.isFinite).sort((a, b) => b - a);
      const topN = values.length ? Math.max(1, Math.ceil(values.length * 0.1)) : 0;
      const cutoff = topN ? values[topN - 1] : Infinity;
      rows.forEach((row) => {
        row[rankCol] = Number.isFinite(row[metric]) ? 1 + values.findIndex((v) => v <= row[metric]) : NaN;
        row[flagCol] = Number.isFinite(row[metric]) && row[metric] >= cutoff;
      });
    }
    return rows;
  }

  function commonWells(a, b, labelA, labelB, config) {
    const setB = new Set(b);
    const wells = sortedWells(a.filter((well) => setB.has(well)), config);
    if (!wells.length) throw new Error(`No common well IDs were found between ${labelA} and ${labelB} files.`);
    const diff = [...a.filter((well) => !setB.has(well)), ...b.filter((well) => !a.includes(well))];
    const warnings = diff.length ? [`Well IDs differ between files; only common wells were processed. Different wells: ${sortedWells(diff, config).join(", ")}`] : [];
    return { wells, warnings };
  }

  function geco384Pairs(wells) {
    const set = new Set(wells);
    const pairs = [];
    const warnings = [];
    for (const well of wells) {
      const col = Number(well.slice(1));
      if (col % 2 !== 1) continue;
      const partner = `${well[0]}${String(col + 1).padStart(2, "0")}`;
      if (set.has(partner)) pairs.push([well, partner]);
      else warnings.push(`GECO 384 pairing: ${well} has no adjacent even-column with-CA partner ${partner}; skipped.`);
    }
    for (const well of wells) {
      const col = Number(well.slice(1));
      if (col % 2 === 0 && !set.has(`${well[0]}${String(col - 1).padStart(2, "0")}`)) warnings.push(`GECO 384 pairing: ${well} has no adjacent odd-column without-CA partner; skipped.`);
    }
    return { pairs, warnings };
  }

  function subsetTable(table, wells) {
    return { columns: ["Wavelength", ...wells], rows: table.rows.map((row) => Object.fromEntries(["Wavelength", ...wells].map((col) => [col, row[col]]))) };
  }

  function savgolLike(values, windowLength = 9) {
    const arr = values.map((v) => Number.isFinite(v) ? v : NaN);
    const finite = arr.filter(Number.isFinite);
    if (finite.length < 3) return arr;
    let window = Math.max(3, Math.round(windowLength));
    if (window % 2 === 0) window += 1;
    const half = Math.floor(window / 2);
    return arr.map((value, index) => {
      const vals = [];
      for (let i = index - half; i <= index + half; i += 1) {
        if (i >= 0 && i < arr.length && Number.isFinite(arr[i])) vals.push(arr[i]);
      }
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : value;
    });
  }

  function niceUpperLimit(value) {
    if (!Number.isFinite(value) || value <= 0) return 1;
    const exponent = Math.floor(Math.log10(value));
    const fraction = value / (10 ** exponent);
    const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
    return nice * (10 ** exponent);
  }

  function heatmapValues(summary, valueColumn) {
    return Object.fromEntries(summary.map((row) => [row.well_id || row.without_ca_well, row[valueColumn]]));
  }

  function colorRamp(name) {
    const ramps = {
      hc_soft: ["#F8FBF8", "#DDEFE8", "#9FD1C4", "#5F9FBE", "#E6A15C"],
      hc_nature: ["#F7FBF8", "#DDF3DE", "#AADCA9", "#3775BA", "#B64342"],
      YlGnBu: ["#ffffd9", "#c7e9b4", "#41b6c4", "#225ea8"],
      BuGn: ["#f7fcfd", "#ccece6", "#66c2a4", "#238b45"],
      viridis: ["#440154", "#31688e", "#35b779", "#fde725"],
      cividis: ["#00224e", "#575d6d", "#a59c74", "#fee838"],
      plasma: ["#0d0887", "#9c179e", "#ed7953", "#f0f921"],
    };
    return ramps[name] || ramps.hc_nature;
  }

  function hexToRgb(hex) {
    const h = hex.replace("#", "");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  function lerpColor(ramp, t) {
    const clamped = Math.max(0, Math.min(1, t));
    const scaled = clamped * (ramp.length - 1);
    const idx = Math.min(ramp.length - 2, Math.floor(scaled));
    const local = scaled - idx;
    const a = hexToRgb(ramp[idx]);
    const b = hexToRgb(ramp[idx + 1]);
    const rgb = a.map((v, i) => Math.round(v + (b[i] - v) * local));
    return `rgb(${rgb.join(",")})`;
  }

  function svgEl(tag, attrs = {}, body = "") {
    const attr = Object.entries(attrs).map(([k, v]) => ` ${k}="${esc(v)}"`).join("");
    return `<${tag}${attr}>${body}</${tag}>`;
  }

  function seriesRange(table, wells) {
    const xs = table.rows.map((r) => asNum(r.Wavelength)).filter(Number.isFinite);
    const ys = [];
    for (const row of table.rows) for (const well of wells) {
      const value = asNum(row[well]);
      if (Number.isFinite(value)) ys.push(value);
    }
    return { xmin: Math.min(...xs), xmax: Math.max(...xs), ymin: Math.min(0, ...ys), ymax: niceUpperLimit(Math.max(...ys) * 1.1) };
  }

  function wellPanelSvg({ tables, labels, colors, well, title, x, y, width, height, smooth = true, windowLength = 9, badge }) {
    const pad = { l: 28, r: 8, t: 20, b: 26 };
    const innerW = width - pad.l - pad.r;
    const innerH = height - pad.t - pad.b;
    const range = seriesRange(tables[0], [well]);
    for (const table of tables.slice(1)) {
      const r = seriesRange(table, [well]);
      range.ymax = Math.max(range.ymax, r.ymax);
    }
    const sx = (v) => x + pad.l + ((v - range.xmin) / Math.max(1e-9, range.xmax - range.xmin)) * innerW;
    const sy = (v) => y + pad.t + innerH - ((v - range.ymin) / Math.max(1e-9, range.ymax - range.ymin)) * innerH;
    const grid = [];
    for (let i = 0; i <= 4; i += 1) {
      const gx = x + pad.l + innerW * i / 4;
      const gy = y + pad.t + innerH * i / 4;
      grid.push(svgEl("line", { x1: gx, y1: y + pad.t, x2: gx, y2: y + pad.t + innerH, stroke: "#E6ECE8", "stroke-width": 0.6 }));
      grid.push(svgEl("line", { x1: x + pad.l, y1: gy, x2: x + pad.l + innerW, y2: gy, stroke: "#E6ECE8", "stroke-width": 0.6 }));
    }
    const plots = [];
    tables.forEach((table, idx) => {
      const pts = table.rows.map((row) => [asNum(row.Wavelength), asNum(row[well])]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
      plots.push(...pts.map(([px, py]) => svgEl("circle", { cx: sx(px), cy: sy(py), r: 0.9, fill: colors[idx], opacity: 0.45 })));
      const yValues = smooth ? savgolLike(pts.map((p) => p[1]), windowLength) : pts.map((p) => p[1]);
      const d = pts.map((p, i) => `${i ? "L" : "M"}${sx(p[0]).toFixed(2)} ${sy(yValues[i]).toFixed(2)}`).join(" ");
      plots.push(svgEl("path", { d, fill: "none", stroke: colors[idx], "stroke-width": 1.15, opacity: 0.95 }));
    });
    const badgeSvg = badge ? svgEl("rect", { x: x + width - 42, y: y + 18, width: 34, height: 13, rx: 2, fill: badge.color || "#42949E", opacity: 0.92 }) +
      svgEl("text", { x: x + width - 25, y: y + 28, "text-anchor": "middle", "font-size": 7, "font-weight": "700", fill: "white" }, badge.text) : "";
    return svgEl("g", {}, [
      svgEl("rect", { x, y, width, height, fill: "white" }),
      ...grid,
      svgEl("line", { x1: x + pad.l, y1: y + pad.t + innerH, x2: x + pad.l + innerW, y2: y + pad.t + innerH, stroke: "#333", "stroke-width": 0.75 }),
      svgEl("line", { x1: x + pad.l, y1: y + pad.t, x2: x + pad.l, y2: y + pad.t + innerH, stroke: "#333", "stroke-width": 0.75 }),
      ...plots,
      svgEl("text", { x: x + width - 8, y: y + 12, "text-anchor": "end", "font-size": 8, "font-weight": "700", fill: "#333" }, title || well),
      badgeSvg,
      svgEl("text", { x: x + pad.l, y: y + height - 8, "font-size": 6, fill: "#444" }, fmt(range.xmin, 0)),
      svgEl("text", { x: x + width - pad.r, y: y + height - 8, "text-anchor": "end", "font-size": 6, fill: "#444" }, fmt(range.xmax, 0)),
      svgEl("text", { x: x + 4, y: y + pad.t + innerH, "font-size": 6, fill: "#444" }, "0"),
      svgEl("text", { x: x + 4, y: y + pad.t + 5, "font-size": 6, fill: "#444" }, fmt(range.ymax, 0)),
    ].join(""));
  }

  function gridSvg({ title, tables, labels, wells, config, normalized = false, moduleKey = "", highlights = {} }) {
    const layout = config.plotting.spectra_grid || {};
    const ncols = layout.mode === "compact" ? Math.max(4, Math.min(24, Number(layout.columns || 12))) : plateLayout(config, wells).cols.length;
    const pageWells = wells.slice();
    const panelW = 92;
    const panelH = 76;
    const gap = 10;
    const rows = Math.ceil(pageWells.length / ncols);
    const width = 42 + ncols * panelW + (ncols - 1) * gap;
    const height = 60 + rows * panelH + (rows - 1) * gap;
    const colors = [config.plotting.colors.primary, config.plotting.colors.secondary];
    const panels = pageWells.map((well, idx) => {
      const col = idx % ncols;
      const row = Math.floor(idx / ncols);
      return wellPanelSvg({
        tables,
        labels,
        colors,
        well,
        title: well,
        x: 22 + col * (panelW + gap),
        y: 42 + row * (panelH + gap),
        width: panelW,
        height: panelH,
        smooth: config.plot.smoothing.enabled,
        windowLength: config.plot.smoothing.window_length,
        badge: (highlights[well] || [])[0],
      });
    }).join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="100%" height="100%" fill="white"/>
      <text x="${width / 2}" y="24" text-anchor="middle" font-size="18" font-weight="700" fill="#111">${esc(title)}</text>
      ${panels}
      <text x="${width / 2}" y="${height - 8}" text-anchor="middle" font-size="10" fill="#444">Wavelength (nm)</text>
    </svg>`;
  }

  function heatmapSvg(values, config, title, label) {
    const layout = plateLayout(config, Object.keys(values));
    const rows = layout.rows;
    const cols = layout.cols;
    const cell = layout.format === 384 ? 24 : 34;
    const left = 48;
    const top = 58;
    const width = left + cols.length * cell + 96;
    const height = top + rows.length * cell + 52;
    const finite = Object.values(values).map(Number).filter(Number.isFinite);
    const min = finite.length ? Math.min(...finite) : 0;
    const max = finite.length ? Math.max(...finite) : 1;
    const ramp = colorRamp(config.plotting.colors.heatmap);
    let body = `<rect width="100%" height="100%" fill="white"/>
      <text x="${width / 2}" y="26" text-anchor="middle" font-size="18" font-weight="700" fill="#111">${esc(title)}</text>
      <text x="${width / 2}" y="${height - 8}" text-anchor="middle" font-size="10" fill="#444">${esc(label)}</text>`;
    cols.forEach((col, i) => { body += svgEl("text", { x: left + i * cell + cell / 2, y: top - 10, "text-anchor": "middle", "font-size": 8, fill: "#444" }, col); });
    rows.forEach((row, r) => {
      body += svgEl("text", { x: left - 12, y: top + r * cell + cell / 2 + 3, "text-anchor": "middle", "font-size": 8, fill: "#444" }, row);
      cols.forEach((col, c) => {
        const well = `${row}${String(col).padStart(2, "0")}`;
        const value = Number(values[well]);
        const fill = Number.isFinite(value) ? lerpColor(ramp, (value - min) / Math.max(1e-9, max - min)) : "#F2F2F2";
        body += svgEl("rect", { x: left + c * cell, y: top + r * cell, width: cell - 1, height: cell - 1, fill, stroke: "#fff", "stroke-width": 0.5 });
        if (config.plotting.heatmap.show_values && Number.isFinite(value) && cell >= 28) {
          body += svgEl("text", { x: left + c * cell + cell / 2, y: top + r * cell + cell / 2 + 3, "text-anchor": "middle", "font-size": 7, fill: "#1F2A24" }, fmt(value, 2));
        }
      });
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
  }

  function combineReportSvg(title, grid, heatmap) {
    const gridBox = svgSize(grid);
    const heatBox = svgSize(heatmap);
    const width = 794;
    const height = 1123;
    const gridMaxW = 734;
    const gridMaxH = 650;
    const heatMaxW = 680;
    const heatMaxH = 360;
    const gridScale = Math.min(gridMaxW / gridBox.width, gridMaxH / gridBox.height);
    const heatScale = Math.min(heatMaxW / heatBox.width, heatMaxH / heatBox.height);
    const gridX = (width - gridBox.width * gridScale) / 2;
    const heatX = (width - heatBox.width * heatScale) / 2;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="100%" height="100%" fill="white"/>
      <text x="${width / 2}" y="30" text-anchor="middle" font-size="22" font-weight="700" fill="#111">${esc(title)}</text>
      <g transform="translate(${gridX.toFixed(2)} 58) scale(${gridScale.toFixed(4)})">${stripSvg(grid)}</g>
      <g transform="translate(${heatX.toFixed(2)} 742) scale(${heatScale.toFixed(4)})">${stripSvg(heatmap)}</g>
    </svg>`;
  }

  function svgSize(svg) {
    const w = Number((svg.match(/width="([\d.]+)"/) || [0, 1000])[1]);
    const h = Number((svg.match(/height="([\d.]+)"/) || [0, 700])[1]);
    return { width: w, height: h };
  }

  function stripSvg(svg) {
    return svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
  }

  function csvBytes(rows) {
    if (!rows.length) return new TextEncoder().encode("");
    const columns = Object.keys(rows[0]);
    const cleanRows = rows.map((row) => Object.fromEntries(columns.map((col) => [col, Number.isNaN(row[col]) ? "" : row[col]])));
    const csv = window.Papa ? Papa.unparse(cleanRows) : simpleCsv(cleanRows);
    return new TextEncoder().encode(csv);
  }

  function tableToXlsxBytes(table, sheetName = "Sheet1") {
    const aoa = [table.columns, ...table.rows.map((row) => table.columns.map((col) => Number.isNaN(row[col]) ? "" : row[col]))];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    return XLSX.write(wb, { bookType: "xlsx", type: "array" });
  }

  function workbookToXlsxBytes(sheets) {
    const wb = XLSX.utils.book_new();
    for (const sheet of sheets) {
      const rows = sheet.rows || [];
      const columns = sheet.columns || Object.keys(rows[0] || {});
      const aoa = [columns, ...rows.map((row) => columns.map((col) => Number.isNaN(row[col]) ? "" : row[col]))];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), sheet.name.slice(0, 31));
    }
    return XLSX.write(wb, { bookType: "xlsx", type: "array" });
  }

  function configToYaml(value, indent = 0) {
    const pad = " ".repeat(indent);
    if (Array.isArray(value)) {
      return value.map((item) => `${pad}- ${typeof item === "object" && item !== null ? `\n${configToYaml(item, indent + 2)}` : yamlScalar(item)}`).join("\n");
    }
    if (value && typeof value === "object") {
      return Object.entries(value).map(([key, item]) => {
        if (item && typeof item === "object") return `${pad}${key}:\n${configToYaml(item, indent + 2)}`;
        return `${pad}${key}: ${yamlScalar(item)}`;
      }).join("\n");
    }
    return `${pad}${yamlScalar(value)}`;
  }

  function yamlScalar(value) {
    if (value === null || value === undefined) return "null";
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return JSON.stringify(String(value));
  }

  async function svgToPngDataUrl(svg, scale = 2) {
    const { width, height } = svgSize(svg);
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.decoding = "async";
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    return { dataUrl: canvas.toDataURL("image/png"), canvas };
  }

  async function svgToPdfBytes(svg) {
    await loadScriptOnce("pdf");
    const { jsPDF } = window.jspdf;
    const { width, height } = svgSize(svg);
    const pdf = new jsPDF({ orientation: width > height ? "landscape" : "portrait", unit: "pt", format: [width, height] });
    const { dataUrl } = await svgToPngDataUrl(svg, 2);
    pdf.addImage(dataUrl, "PNG", 0, 0, width, height);
    return pdf.output("arraybuffer");
  }

  async function svgToTiffBytes(svg, dpi = 600) {
    await ensureTiffLibrary();
    const scale = Math.max(1, dpi / 150);
    const { canvas } = await svgToPngDataUrl(svg, scale);
    const rgba = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    return UTIF.encodeImage(rgba, canvas.width, canvas.height);
  }

  function downloadBlob(bytes, name, type = "application/octet-stream") {
    const blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function buildOutputsZip(result) {
    await ensureZipLibrary();
    const zip = new JSZip();
    const tables = zip.folder("tables");
    const figures = zip.folder("figures");
    const report = zip.folder("report");
    for (const file of result.files) {
      const folder = file.path.startsWith("tables/") ? tables : file.path.startsWith("figures/") ? figures : file.path.startsWith("report/") ? report : zip;
      const name = file.path.split("/").pop();
      folder.file(name, file.bytes);
    }
    zip.file("run_metadata.json", JSON.stringify(result.metadata, null, 2));
    zip.file("config_snapshot.yaml", configToYaml(result.config));
    zip.file("processing_log.txt", result.log.join("\n"));
    return zip.generateAsync({ type: "blob" });
  }

  async function addFigureFiles(files, basePath, svg) {
    files.push({ path: `${basePath}.pdf`, bytes: await svgToPdfBytes(svg), previewSvg: svg });
  }

  function selectedWellSeries(result) {
    if (result.module === "geco") return { tables: [result.data.with_ca, result.data.without_ca], labels: ["with CA", "without CA"], wells: result.wells };
    if (result.module === "luci") return { tables: [result.data.normalized], labels: ["LUCI"], wells: result.wells };
    if (result.module === "lss") return { tables: [result.data.emission, result.data.excitation], labels: ["Emission", "Excitation"], wells: result.wells };
    if (result.module === "anti") return { tables: [result.data.excitation, result.data.emission], labels: ["Excitation", "Emission"], wells: result.wells };
    return null;
  }

  function metricColumns(summary) {
    if (!summary || !summary.length) return [];
    return Object.keys(summary[0]).filter((key) => key !== "well_id" && key !== "without_ca_well" && key !== "with_ca_well" && key !== "pair_id" && summary.some((row) => Number.isFinite(Number(row[key]))));
  }

  function defaultMetric(module, metrics) {
    const preferred = { geco: "ratio", luci: "ratio_520_450", lss: "peak_wavelength_distance", anti: "raw_max" }[module];
    return metrics.includes(preferred) ? preferred : metrics[0];
  }

  function defaultSelectedWells(summary, wells, metric) {
    if (!summary || !summary.length || !metric) return wells.slice(0, Math.min(8, wells.length));
    return summary.slice().filter((row) => wells.includes(row.well_id || row.without_ca_well) && Number.isFinite(Number(row[metric])))
      .sort((a, b) => Number(b[metric]) - Number(a[metric]))
      .slice(0, Math.min(12, wells.length))
      .map((row) => row.well_id || row.without_ca_well);
  }

  async function runWellId(form) {
    const config = formConfig("wellid");
    const file = fileInput("wellid_upload");
    if (!file) throw new Error("Upload one raw Excel or CSV file before running.");
    const raw = await readUploadedTable(file, config);
    const standardized = standardizeByWell(raw, config);
    const warnings = warningIfNegative(standardized.table, standardized.table.columns.slice(1));
    const id = runId("WellID");
    const files = [{ path: "tables/standardized_by_well.xlsx", bytes: tableToXlsxBytes(standardized.table, "standardized") }];
    return makeResult({
      id,
      module: "wellid",
      config,
      summary: standardized.table.rows.slice(0, 50),
      wells: standardized.table.columns.slice(1),
      data: { standardized: standardized.table },
      files,
      metadataExtra: { module_type: "WellID", recognition: standardized.info, input_files: [file.name], plate_format: plateLayout(config, standardized.table.columns.slice(1)).format },
      warnings,
      log: [`Created run ${id}`, `Standardized ${standardized.info.well_count} wells using ${standardized.info.format} format.`],
    });
  }

  async function runGeco() {
    const config = formConfig("geco");
    const auto = getChecked("geco_auto");
    const is384 = plateFormatFromConfig(config) === 384;
    const warnings = [];
    let withCa;
    let withoutCa;
    let wells;
    let inputFiles;
    let summary;
    let metadataExtra = {};
    if (is384) {
      const file = fileInput("geco_paired");
      if (!file) throw new Error("Upload one 384-well paired table before running.");
      const prepared = await prepareFile(file, config, auto);
      const pairs = geco384Pairs(prepared.wells);
      warnings.push(...pairs.warnings);
      if (!pairs.pairs.length) throw new Error("No odd/even adjacent GECO pairs were found. Expected pairs like A05 without CA and A06 with CA.");
      wells = pairs.pairs.map((pair) => pair[0]);
      const withRows = prepared.table.rows.map((row) => {
        const out = { Wavelength: row.Wavelength };
        pairs.pairs.forEach(([odd, even]) => { out[odd] = row[even]; });
        return out;
      });
      const withoutRows = prepared.table.rows.map((row) => {
        const out = { Wavelength: row.Wavelength };
        pairs.pairs.forEach(([odd]) => { out[odd] = row[odd]; });
        return out;
      });
      withCa = { columns: ["Wavelength", ...wells], rows: withRows };
      withoutCa = { columns: ["Wavelength", ...wells], rows: withoutRows };
      summary = gecoPeakRatio(withCa, withoutCa, wells).map((row) => ({ ...row, without_ca_well: row.well_id, with_ca_well: pairs.pairs.find((p) => p[0] === row.well_id)?.[1], pair_id: `${row.well_id}/${pairs.pairs.find((p) => p[0] === row.well_id)?.[1]}` }));
      inputFiles = [file.name];
      metadataExtra = { geco_input_mode: "single_file_adjacent_pairs", pairing_rule: "odd column without CA; adjacent even column with CA" };
    } else {
      const withFile = fileInput("geco_with");
      const withoutFile = fileInput("geco_without");
      if (!withFile || !withoutFile) throw new Error("Upload both with-CA and without-CA tables before running.");
      const withPrepared = await prepareFile(withFile, config, auto);
      const withoutPrepared = await prepareFile(withoutFile, config, auto);
      const common = commonWells(withPrepared.wells, withoutPrepared.wells, "with ca", "without ca", config);
      wells = common.wells;
      warnings.push(...common.warnings);
      withCa = subsetTable(withPrepared.table, wells);
      withoutCa = subsetTable(withoutPrepared.table, wells);
      summary = gecoPeakRatio(withCa, withoutCa, wells);
      inputFiles = [withFile.name, withoutFile.name];
    }
    warnings.push(...warningIfNegative(withCa, wells), ...warningIfNegative(withoutCa, wells));
    const heat = heatmapValues(summary, is384 ? "ratio" : "ratio");
    const highlights = Object.fromEntries(summary.map((row) => [row.well_id, [{ text: fmt(row.ratio, 2), color: config.plotting.badges.geco_ratio }]]));
    const grid = gridSvg({ title: is384 ? "GECO 384 paired spectra by well" : "GECO spectra by well", tables: [withCa, withoutCa], labels: ["with CA", "without CA"], wells, config, moduleKey: "geco", highlights });
    const heatSvg = heatmapSvg(heat, config, is384 ? "GECO 384 paired max(with CA) / max(without CA)" : "GECO max(with ca) / max(without ca)", "ratio");
    const reportSvg = combineReportSvg(is384 ? "GECO 384 paired spectra and peak ratio heatmap" : "GECO spectra and peak ratio heatmap", grid, heatSvg);
    const files = [{ path: "tables/GECO_peak_ratio.csv", bytes: csvBytes(summary) }];
    await addFigureFiles(files, "figures/GECO_grid_plots", grid);
    await addFigureFiles(files, "figures/GECO_heatmap", heatSvg);
    await addFigureFiles(files, "report/GECO_combined_report", reportSvg);
    const id = runId("GECO");
    return makeResult({ id, module: "geco", config, summary, wells, data: { with_ca: withCa, without_ca: withoutCa }, files, metadataExtra: { module_type: "GECO", input_files: inputFiles, plate_format: is384 ? 384 : plateLayout(config, wells).format, common_well_count: wells.length, ...metadataExtra }, warnings, log: [`Created run ${id}`, `Processed ${wells.length} wells.`] });
  }

  async function runLuci() {
    const config = formConfig("luci");
    const file = fileInput("luci_upload");
    if (!file) throw new Error("Upload one LUCI table before running.");
    const prepared = await prepareFile(file, config, getChecked("luci_auto"));
    const wells = prepared.wells;
    const warnings = warningIfNegative(prepared.table, wells);
    const norm = normalizeMaxPerWell(prepared.table, wells).table;
    const peaks = config.peaks;
    const summary = luciPeakSummary(norm, wells, peaks.luci_450_window, peaks.luci_520_window);
    const heat = heatmapValues(summary, "ratio_520_450");
    const highlights = Object.fromEntries(summary.map((row) => [row.well_id, [{ text: fmt(row.ratio_520_450, 2), color: config.plotting.badges.luci_ratio }]]));
    const grid = gridSvg({ title: "LUCI normalized spectra", tables: [norm], labels: ["LUCI"], wells, config, normalized: true, moduleKey: "luci", highlights });
    const heatSvg = heatmapSvg(heat, config, "LUCI 520/450 ratio", "ratio_520_450");
    const reportSvg = combineReportSvg("LUCI spectra and 520/450 ratio heatmap", grid, heatSvg);
    const files = [
      { path: "tables/LUCI_normalized.xlsx", bytes: tableToXlsxBytes(norm, "normalized") },
      { path: "tables/LUCI_peak_summary.csv", bytes: csvBytes(summary) },
    ];
    await addFigureFiles(files, "figures/LUCI_grid_plots", grid);
    await addFigureFiles(files, "figures/LUCI_ratio_heatmap", heatSvg);
    await addFigureFiles(files, "report/LUCI_combined_report", reportSvg);
    const id = runId("LUCI");
    return makeResult({ id, module: "luci", config, summary, wells, data: { normalized: norm }, files, metadataExtra: { module_type: "LUCI", input_files: [file.name], plate_format: plateLayout(config, wells).format, common_well_count: wells.length }, warnings, log: [`Created run ${id}`, `Processed ${wells.length} wells.`] });
  }

  async function runLss() {
    const config = formConfig("lss");
    const emissionFile = fileInput("lss_emission");
    const excitationFile = fileInput("lss_excitation");
    if (!emissionFile || !excitationFile) throw new Error("Upload both Excitation and Emission tables before running.");
    const emissionPrepared = await prepareFile(emissionFile, config, getChecked("lss_auto"));
    const excitationPrepared = await prepareFile(excitationFile, config, getChecked("lss_auto"));
    const common = commonWells(emissionPrepared.wells, excitationPrepared.wells, "emission", "excitation", config);
    const wells = common.wells;
    const emission = subsetTable(emissionPrepared.table, wells);
    const excitation = subsetTable(excitationPrepared.table, wells);
    const warnings = [...common.warnings, ...warningIfNegative(emission, wells), ...warningIfNegative(excitation, wells)];
    const summary = lssSummary(emission, excitation, wells);
    const highlights = {};
    summary.forEach((row) => {
      const list = [];
      if (row.emission_top10) list.push({ text: "E", color: config.plotting.badges.lss_emission });
      if (row.excitation_top10) list.push({ text: "X", color: config.plotting.badges.lss_excitation });
      if (row.peak_distance_top10) list.push({ text: "LSS", color: config.plotting.badges.lss_distance });
      if (list.length) highlights[row.well_id] = list;
    });
    const heat = heatmapValues(summary, "peak_wavelength_distance");
    const grid = gridSvg({ title: "LSS raw spectra", tables: [emission, excitation], labels: ["Emission", "Excitation"], wells, config, moduleKey: "lss", highlights });
    const heatSvg = heatmapSvg(heat, config, "LSS Stokes shift", "Stokes shift (nm)");
    const reportSvg = combineReportSvg("LSS raw spectra and Stokes shift heatmap", grid, heatSvg);
    const columns = Object.keys(summary[0] || {});
    const files = [
      { path: "tables/LSS_summary.csv", bytes: csvBytes(summary) },
      {
        path: "tables/LSS_peak_top10.xlsx",
        bytes: workbookToXlsxBytes([
          { name: "all_wells", columns, rows: summary },
          { name: "emission_top10", columns, rows: summary.filter((row) => row.emission_top10) },
          { name: "excitation_top10", columns, rows: summary.filter((row) => row.excitation_top10) },
          { name: "LSS_distance_top10", columns, rows: summary.filter((row) => row.peak_distance_top10) },
        ]),
      },
    ];
    await addFigureFiles(files, "figures/LSS_grid_plots", grid);
    await addFigureFiles(files, "figures/LSS_peak_distance_heatmap", heatSvg);
    await addFigureFiles(files, "report/LSS_combined_report", reportSvg);
    const id = runId("LSS");
    return makeResult({ id, module: "lss", config, summary, wells, data: { emission, excitation }, files, metadataExtra: { module_type: "LSS", input_files: [emissionFile.name, excitationFile.name], plate_format: plateLayout(config, wells).format, common_well_count: wells.length, normalize: false, use_raw_data: true }, warnings, log: [`Created run ${id}`, `Processed ${wells.length} common wells.`] });
  }

  async function runAnti() {
    const config = formConfig("anti");
    const excitationFile = fileInput("anti_excitation");
    const emissionFile = fileInput("anti_emission");
    if (!emissionFile || !excitationFile) throw new Error("Upload both Excitation and Emission tables before running.");
    const excitationPrepared = await prepareFile(excitationFile, config, getChecked("anti_auto"));
    const emissionPrepared = await prepareFile(emissionFile, config, getChecked("anti_auto"));
    const common = commonWells(excitationPrepared.wells, emissionPrepared.wells, "excitation", "emission", config);
    const wells = common.wells;
    const excitationRaw = subsetTable(excitationPrepared.table, wells);
    const emissionRaw = subsetTable(emissionPrepared.table, wells);
    const excitationNorm = normalizeMaxPerWell(excitationRaw, wells, true, "Excitation");
    const emissionNorm = normalizeMaxPerWell(emissionRaw, wells, true, "Emission");
    const warnings = [...common.warnings, ...warningIfNegative(excitationRaw, wells), ...warningIfNegative(emissionRaw, wells), ...excitationNorm.warnings, ...emissionNorm.warnings];
    const summary = [...excitationNorm.summary, ...emissionNorm.summary];
    const grid = gridSvg({ title: "anti normalized spectra", tables: [excitationNorm.table, emissionNorm.table], labels: ["Excitation", "Emission"], wells, config, normalized: true, moduleKey: "anti" });
    const files = [
      { path: "tables/anti_excitation_normalized.xlsx", bytes: tableToXlsxBytes(excitationNorm.table, "normalized") },
      { path: "tables/anti_emission_normalized.xlsx", bytes: tableToXlsxBytes(emissionNorm.table, "normalized") },
      { path: "tables/anti_summary.csv", bytes: csvBytes(summary) },
    ];
    await addFigureFiles(files, "figures/anti_grid_plots", grid);
    await addFigureFiles(files, "report/anti_combined_report", grid);
    const id = runId("anti");
    return makeResult({ id, module: "anti", config, summary, wells, data: { excitation: excitationNorm.table, emission: emissionNorm.table }, files, metadataExtra: { module_type: "anti", input_files: [excitationFile.name, emissionFile.name], plate_format: plateLayout(config, wells).format, common_well_count: wells.length, normalize: true, normalization_method: "column_max" }, warnings, log: [`Created run ${id}`, `Processed ${wells.length} common wells.`] });
  }

  function makeResult({ id, module, config, summary, wells, data, files, metadataExtra, warnings, log }) {
    const metadata = {
      run_id: id,
      timestamp: nowIso(),
      run_name: config.run_name || "",
      parameters: config,
      output_dir: `${config.output.base_dir}/${id}`,
      output_files: files.map((file) => file.path).concat(["run_metadata.json", "config_snapshot.yaml", "processing_log.txt"]),
      warnings,
      ...metadataExtra,
    };
    return { id, module, config, summary, wells, data, files, metadata, warnings, log };
  }

  function updateHistory(result) {
    const entry = {
      run_id: result.id,
      run_name: result.metadata.run_name || "",
      timestamp: result.metadata.timestamp,
      module_type: result.metadata.module_type,
      input_files: (result.metadata.input_files || []).join(", "),
      warnings: result.warnings.length,
      output_files: result.metadata.output_files,
      summary: result.summary.slice(0, 20),
    };
    state.history = [entry, ...state.history.filter((row) => row.run_id !== result.id)].slice(0, 50);
    saveHistory();
  }

  function renderDashboard() {
    state.page = "dashboard";
    state.module = null;
    $("dashboard").classList.remove("hidden");
    $("workspace").classList.add("hidden");
    $("currentWorkspace").textContent = "Current workspace: Dashboard";
    $("dashboard").innerHTML = `
      <div class="hc-hero-row">
        <div class="hc-hero">
          <div class="hc-eyebrow">Local-first scientific workspace</div>
          <h1>HC PlateScope</h1>
          <p class="hc-hero-subtitle">A cozy workspace for 96-well plate spectra analysis.</p>
          <p class="hc-hero-copy">Local-first analysis workspace for well ID extraction, spectra processing, peak detection, ratio heatmaps, and reproducible reports.</p>
          <div class="hc-tags"><span class="hc-tag">Clean</span><span class="hc-tag">Reproducible</span><span class="hc-tag">Nature-style figures</span><span class="hc-tag">browser history</span></div>
        </div>
        <div class="hc-plate-wrap"><div class="hc-plate-title">96-well layout</div><div class="hc-plate-grid">${plateDecoration()}</div></div>
      </div>
      ${section("Choose a workspace", "Start with a focused module. Each run saves inputs, figures, tables, metadata, logs, and config snapshots locally.")}
      <div class="feature-grid dashboard-row">${["wellid", "geco", "luci"].map(featureCard).join("")}</div>
      <div class="feature-grid dashboard-row">${["lss", "anti"].map(featureCard).join("")}
        <div class="feature-slot">
          <div class="hc-feature-card hc-accent-teal"><div class="hc-accent-line"></div><h3>Analysis History</h3><p>Browse browser-local runs, metadata, reports, and restored settings.</p><div class="hc-tags"><span class="hc-tag">history</span><span class="hc-tag">metadata</span><span class="hc-tag">settings</span></div></div>
          <button class="card-button" data-page="history">Open history</button>
          <button class="card-button" data-page="settings">Settings</button>
        </div>
      </div>
      <div class="two-col">
        <div>${section("Recent runs", "Latest browser-local records.")}${historyPreview()}</div>
        <div class="hc-info-card hc-success"><strong>Local-first analysis</strong><div>All analyses run inside this browser.</div><div>Use Download outputs.zip to save a permanent run folder.</div></div>
      </div>`;
    $("dashboard").querySelectorAll("[data-module]").forEach((btn) => btn.addEventListener("click", () => renderModule(btn.dataset.module)));
    $("dashboard").querySelectorAll("[data-page]").forEach((btn) => btn.addEventListener("click", () => btn.dataset.page === "history" ? renderHistory() : renderSettings()));
    updateSide();
  }

  function plateDecoration() {
    const h = new Set(["1,1", "2,1", "3,1", "4,1", "5,1", "6,1", "1,4", "2,4", "3,4", "4,4", "5,4", "6,4", "3,2", "3,3", "4,2", "4,3", "1,7", "1,8", "1,9", "1,10", "2,6", "3,6", "4,6", "5,6", "6,7", "6,8", "6,9", "6,10"]);
    let out = "";
    for (let row = 0; row < 8; row += 1) for (let col = 0; col < 12; col += 1) out += `<span class="${h.has(`${row},${col}`) ? "blue" : (row + col) % 5 === 0 ? "warm" : ""}"></span>`;
    return out;
  }

  function section(title, subtitle = "") {
    return `<div class="hc-section-heading"><h2>${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ""}</div>`;
  }

  function featureCard(key) {
    const m = MODULES[key];
    return `<div class="feature-slot"><div class="hc-feature-card hc-accent-${m.accent}"><div class="hc-accent-line"></div><h3>${esc(m.title)}</h3><p>${esc(m.description)}</p><div class="hc-tags">${m.tags.map((tag) => `<span class="hc-tag">${esc(tag)}</span>`).join("")}</div></div><button class="card-button" data-module="${key}">Start analysis</button></div>`;
  }

  function historyPreview() {
    if (!state.history.length) return `<div class="hc-info-card"><strong>No history found</strong><div>No browser-local runs yet.</div></div>`;
    return `<div>${state.history.slice(0, state.config.ui.recent_runs || 5).map((row) => `<div class="hc-history-card panel"><strong>${esc(row.run_name || row.run_id)}</strong><p>${esc(row.module_type)} - ${esc(row.timestamp)}</p><p>${esc(row.input_files)}</p></div>`).join("")}</div>`;
  }

  function renderModule(module) {
    state.page = "module";
    state.module = module;
    const m = MODULES[module];
    $("dashboard").classList.add("hidden");
    $("workspace").classList.remove("hidden");
    $("currentWorkspace").textContent = `Current workspace: ${m.title}`;
    $("workspace").innerHTML = `
      <button data-back>Back to Dashboard</button>
      <div class="hc-breadcrumb">Dashboard / ${esc(m.title)}</div>
      <div class="hc-module-header"><div><h1>${esc(m.title)}</h1><p>${esc(m.description)}</p><div class="hc-tags">${m.tags.map((tag) => `<span class="hc-tag">${esc(tag)}</span>`).join("")}</div></div><div class="hc-mode-pill"><span>Data mode</span><strong>${esc(m.data_mode)}</strong></div></div>
      <form id="runForm">${moduleBody(module)}</form>
      <section id="resultArea"></section>`;
    $("workspace").querySelector("[data-back]").addEventListener("click", renderDashboard);
    wireModuleControls(module);
    $("runForm").addEventListener("submit", onRunSubmit);
    updateSide();
  }

  function step(n, title, subtitle = "") {
    return `<div class="hc-step-card"><div class="hc-step-kicker">Step ${n}</div><h2>${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ""}</div>`;
  }

  function fileField(id, label) {
    return `<div><label for="${id}">${esc(label)}</label><input id="${id}" type="file" accept=".xlsx,.xls,.csv"><div class="field-note" id="${id}_note"></div></div>`;
  }

  function commonControls(module, opts = {}) {
    const cfg = state.config;
    const manualOnly = opts.manualOnly;
    const includeHeatmap = opts.heatmap;
    const colorA = opts.colorA || "Primary color";
    const colorB = opts.colorB || "Secondary color";
    return `
      ${step(2, "Analysis settings", opts.subtitle || "Common controls stay visible; detailed plotting controls live in Advanced settings.")}
      <div class="panel">
        <div class="grid three">
          <div><label>Plate format</label><select id="${module}_plate">${manualOnly ? "" : `<option value="auto">Auto-detect</option>`}<option value="96">96-well</option><option value="384">384-well</option></select></div>
          <div><label>Project name for this run</label><input id="${module}_run_name" value="${esc(`${MODULES[module].title.split(" ")[0]} ${new Date().toISOString().slice(0, 10)}`)}"></div>
          <label class="check"><input id="${module}_auto" type="checkbox" checked> Auto-standardize uploaded files with Well ID Extractor</label>
        </div>
        <div class="grid three">
          <div><label>Scatter plot arrangement</label><select id="${module}_spectra_mode"><option value="plate">Plate layout</option><option value="compact">Compact</option></select></div>
          <div><label>Plots per row</label><input id="${module}_spectra_columns" type="number" min="4" max="24" value="${cfg.plotting.spectra_grid.columns}"></div>
          <div><label>Rows per PDF page</label><input id="${module}_rows_page" type="number" min="2" max="16" value="${cfg.plotting.spectra_grid.rows_per_page}"></div>
        </div>
        <div class="grid three">
          <label class="check"><input id="${module}_smooth" type="checkbox" checked> Smoothing enabled</label>
          <div><label>Marker size</label><input id="${module}_marker" type="range" min="0.5" max="8" step="0.5" value="${cfg.plot.marker_size}"></div>
          <div><label>Line width</label><input id="${module}_line" type="range" min="0.2" max="3" step="0.1" value="${cfg.plot.line_width}"></div>
          <label class="check"><input id="${module}_perwell" type="checkbox" checked> Per-well y-axis</label>
          <div><label>Y-axis upper padding</label><input id="${module}_ypad" type="range" min="1" max="1.5" step="0.01" value="${cfg.plotting.y_axis.upper_padding}"></div>
          ${includeHeatmap ? `<label class="check"><input id="${module}_heat_vals" type="checkbox" checked> Show heatmap values</label><label class="check"><input id="${module}_robust" type="checkbox" checked> Robust heatmap scale</label>` : ""}
        </div>
        <details><summary>Advanced settings</summary>
          <div class="grid three">
            <div><label>Smoothing method</label><select id="${module}_smooth_method"><option value="savgol">savgol</option></select></div>
            <div><label>Window length</label><input id="${module}_window" type="range" min="3" max="51" step="2" value="${cfg.plot.smoothing.window_length}"></div>
            <div><label>Polynomial order</label><input id="${module}_poly" type="range" min="1" max="5" value="${cfg.plot.smoothing.polyorder}"></div>
            <div><label>Marker alpha</label><input id="${module}_malpha" type="range" min="0.1" max="1" step="0.05" value="${cfg.plot.marker_alpha}"></div>
            <div><label>Line alpha</label><input id="${module}_lalpha" type="range" min="0.1" max="1" step="0.05" value="${cfg.plot.line_alpha}"></div>
            <label class="check"><input id="${module}_nice" type="checkbox" checked> Nice rounding enabled</label>
            <div><label>${esc(colorA)}</label><input id="${module}_primary" type="color" value="${cfg.plotting.colors.primary}"></div>
            <div><label>${esc(colorB)}</label><input id="${module}_secondary" type="color" value="${cfg.plotting.colors.secondary}"></div>
            ${includeHeatmap ? `<div><label>Heatmap colormap</label><select id="${module}_cmap"><option>hc_nature</option><option>hc_soft</option><option>YlGnBu</option><option>BuGn</option><option>viridis</option><option>cividis</option><option>plasma</option></select></div><div><label>Low percentile</label><input id="${module}_robust_low" type="number" min="0" max="20" value="5"></div><div><label>High percentile</label><input id="${module}_robust_high" type="number" min="80" max="100" value="95"></div>` : ""}
          </div>
        </details>
      </div>`;
  }

  function wellIdControls() {
    const today = new Date().toISOString().slice(0, 10);
    return `
      ${step(2, "Detection settings", "The extractor recognizes common wavelength columns and 96/384-well IDs.")}
      <div class="panel">
        <div class="grid four">
          <div><label>Plate format</label><select id="wellid_plate"><option value="auto">Auto-detect</option><option value="96">96-well</option><option value="384">384-well</option></select></div>
          <div><label>Well ID pattern</label><input value="A01-H12 or A01-P24" disabled></div>
          <label class="check"><input type="checkbox" checked disabled> Auto-detect wavelength column</label>
          <div><label>Manual wavelength column name</label><input placeholder="Optional" disabled></div>
        </div>
        <div class="grid two">
          <div><label>Output file format</label><select disabled><option>xlsx</option></select></div>
          <div><label>Project name for this run</label><input id="wellid_run_name" value="Well ID ${today}"></div>
        </div>
      </div>`;
  }

  function moduleBody(module) {
    if (module === "wellid") {
      return `${step(1, "Upload raw file", "Supported formats: .xlsx, .xls, .csv.")}
        <div class="panel">${fileField("wellid_upload", "Upload Excel or CSV file")}</div>
        ${wellIdControls()}
        ${runStep("Run Well ID Extraction")}`;
    }
    if (module === "geco") {
      return `${step(1, "Upload files", "Choose 96-well two-file GECO or 384-well single-file adjacent-pair GECO.")}
        <div class="panel" id="gecoFiles"></div>
        ${commonControls("geco", { manualOnly: true, heatmap: true, colorA: "Color with CA", colorB: "Color without CA" })}
        ${runStep("Run GECO Analysis")}`;
    }
    if (module === "luci") {
      return `${step(1, "Upload file", "Upload a raw reader export or a standardized LUCI well-by-column table.")}
        <div class="panel">${fileField("luci_upload", "Upload LUCI table")}</div>
        ${commonControls("luci", { heatmap: true, subtitle: "Peak windows are shown here because they affect the LUCI ratio." })}
        <div class="panel grid two"><div><label>450 nm peak window</label><input id="luci_450" value="430,470"></div><div><label>520 nm peak window</label><input id="luci_520" value="500,540"></div></div>
        ${runStep("Run LUCI Analysis")}`;
    }
    if (module === "lss") {
      return `${step(1, "Upload files", "Upload Excitation and Emission tables. LSS always uses raw signal values.")}
        <div class="panel grid two">${fileField("lss_excitation", "Upload Excitation table")}${fileField("lss_emission", "Upload Emission table")}</div>
        ${commonControls("lss", { heatmap: true, colorA: "Emission color", colorB: "Excitation color" })}
        ${runStep("Run LSS Analysis")}`;
    }
    return `${step(1, "Upload files", "Upload Excitation and Emission tables. Each signal is normalized separately.")}
      <div class="panel grid two">${fileField("anti_excitation", "Upload Excitation table")}${fileField("anti_emission", "Upload Emission table")}</div>
      ${commonControls("anti", { heatmap: false, colorA: "Excitation color", colorB: "Emission color" })}
      ${runStep("Run ANTI Analysis")}`;
  }

  function runStep(label) {
    return `${step(3, "Run analysis")}<div class="panel"><div class="hc-info-card">This native GitHub Pages version runs directly in the browser without Streamlit or Python initialization.</div><button class="primary" type="submit">${esc(label)}</button></div>`;
  }

  function wireModuleControls(module) {
    const plate = $(`${module}_plate`);
    if (plate) {
      plate.value = module === "geco" ? "96" : String(plateFormatFromConfig(state.config));
      plate.addEventListener("change", () => module === "geco" && renderGecoFiles());
    }
    if (module === "geco") renderGecoFiles();
    document.querySelectorAll("input[type=file]").forEach((input) => input.addEventListener("change", () => {
      const note = $(`${input.id}_note`);
      if (note && input.files[0]) note.innerHTML = `<span class="hc-file-pill"><strong>${esc(input.files[0].name)}</strong><span>${(input.files[0].size / 1024).toFixed(1)} KB</span><span>${esc(input.files[0].name.split(".").pop().toUpperCase())}</span></span>`;
    }));
  }

  function renderGecoFiles() {
    const is384 = $("geco_plate")?.value === "384";
    $("gecoFiles").innerHTML = is384
      ? `${fileField("geco_paired", "Upload 384-well paired GECO table")}<div class="hc-info-card"><strong>GECO 384 pairing rule</strong><div>Upload one table with A01-P24 well columns.</div><div>Odd columns are without CA; adjacent even columns are with CA.</div></div>`
      : `<div class="grid two">${fileField("geco_with", "Upload with CA table")}${fileField("geco_without", "Upload without CA table")}</div>`;
    $("gecoFiles").querySelectorAll("input[type=file]").forEach((input) => input.addEventListener("change", () => {
      const note = $(`${input.id}_note`);
      if (note && input.files[0]) note.innerHTML = `<span class="hc-file-pill"><strong>${esc(input.files[0].name)}</strong><span>${(input.files[0].size / 1024).toFixed(1)} KB</span><span>${esc(input.files[0].name.split(".").pop().toUpperCase())}</span></span>`;
    }));
  }

  function formConfig(module) {
    const cfg = deepCopy(state.config);
    cfg.run_name = $(`${module}_run_name`)?.value?.trim() || "";
    cfg.plate.format = $(`${module}_plate`)?.value === "auto" ? "auto" : Number($(`${module}_plate`)?.value || 96);
    cfg.plotting.spectra_grid.mode = $(`${module}_spectra_mode`)?.value || "compact";
    cfg.plotting.spectra_grid.columns = Number($(`${module}_spectra_columns`)?.value || 12);
    cfg.plotting.spectra_grid.rows_per_page = Number($(`${module}_rows_page`)?.value || 8);
    cfg.plot.smoothing.enabled = getChecked(`${module}_smooth`);
    cfg.plot.marker_size = Number($(`${module}_marker`)?.value || 1);
    cfg.plot.line_width = Number($(`${module}_line`)?.value || 1);
    cfg.plotting.y_axis.per_well = getChecked(`${module}_perwell`);
    cfg.plotting.y_axis.upper_padding = Number($(`${module}_ypad`)?.value || 1.1);
    cfg.plot.smoothing.window_length = Number($(`${module}_window`)?.value || 9);
    cfg.plot.smoothing.polyorder = Number($(`${module}_poly`)?.value || 3);
    cfg.plot.marker_alpha = Number($(`${module}_malpha`)?.value || 0.55);
    cfg.plot.line_alpha = Number($(`${module}_lalpha`)?.value || 0.95);
    cfg.plotting.y_axis.rounding_mode = getChecked(`${module}_nice`) ? "nice_round" : "raw";
    cfg.plotting.colors.primary = $(`${module}_primary`)?.value || cfg.plotting.colors.primary;
    cfg.plotting.colors.secondary = $(`${module}_secondary`)?.value || cfg.plotting.colors.secondary;
    if ($(`${module}_heat_vals`)) cfg.plotting.heatmap.show_values = getChecked(`${module}_heat_vals`);
    if ($(`${module}_robust`)) cfg.plotting.heatmap.robust_scaling = getChecked(`${module}_robust`);
    if ($(`${module}_cmap`)) cfg.plotting.colors.heatmap = $(`${module}_cmap`).value;
    if ($(`${module}_robust_low`)) cfg.plotting.heatmap.robust_lower_percentile = Number($(`${module}_robust_low`).value || 5);
    if ($(`${module}_robust_high`)) cfg.plotting.heatmap.robust_upper_percentile = Number($(`${module}_robust_high`).value || 95);
    if (module === "luci") {
      cfg.peaks.luci_450_window = parseWindow($("luci_450").value, [430, 470]);
      cfg.peaks.luci_520_window = parseWindow($("luci_520").value, [500, 540]);
    }
    return cfg;
  }

  function parseWindow(value, fallback) {
    const nums = String(value).split(/[,\s-]+/).map(Number).filter(Number.isFinite);
    return nums.length >= 2 ? [nums[0], nums[1]] : fallback;
  }

  function getChecked(id) {
    return Boolean($(id)?.checked);
  }

  function fileInput(id) {
    return $(id)?.files?.[0] || null;
  }

  async function onRunSubmit(event) {
    event.preventDefault();
    const area = $("resultArea");
    area.innerHTML = `<div class="hc-info-card">Running analysis...</div>`;
    try {
      await ensureAnalysisLibraries();
      const runners = { wellid: runWellId, geco: runGeco, luci: runLuci, lss: runLss, anti: runAnti };
      const result = await runners[state.module]();
      state.lastResult = result;
      updateHistory(result);
      renderResult(result);
      updateSide();
    } catch (error) {
      area.innerHTML = `<div class="hc-info-card hc-error"><strong>${esc(error.message)}</strong>${state.debug ? `<pre class="log">${esc(error.stack)}</pre>` : ""}</div>`;
    }
  }

  function renderResult(result) {
    const area = $("resultArea");
    const report = result.files.find((file) => file.path.includes("combined_report") && file.previewSvg);
    const summaryName = result.module === "wellid" ? "Preview table" : result.module === "geco" ? "Peak ratio preview" : result.module === "luci" ? "Peak summary preview" : result.module === "lss" ? "LSS summary preview" : "Normalization summary preview";
    area.innerHTML = `
      ${step(4, "Results & downloads", "Inspect summary, warnings, previews, and browser output files.")}
      <div class="panel">
        <div class="hc-info-card hc-success"><strong>Analysis complete: ${esc(result.id)}</strong></div>
        ${kpis(result)}
        ${result.warnings.length ? `<div class="hc-info-card hc-warning"><strong>Warnings</strong>${result.warnings.map((w) => `<div>${esc(w)}</div>`).join("")}</div>` : ""}
        <div class="actions"><button class="primary" id="downloadZip" type="button">Download outputs.zip</button></div>
        <ul class="file-list">${result.metadata.output_files.map((file) => `<li><span>${esc(file)}</span></li>`).join("")}</ul>
      </div>
      <div class="panel"><h2>${esc(summaryName)}</h2>${tableHtml(result.summary.slice(0, 100))}</div>
      ${report ? `<div class="panel"><h2>Report preview</h2><div class="hc-pdf-preview">${report.previewSvg}</div></div>` : ""}
      ${selectedWellPanel(result)}
    `;
    $("downloadZip").addEventListener("click", async () => downloadBlob(await buildOutputsZip(result), `${result.id}_outputs.zip`, "application/zip"));
    wireSelectedWellPanel(result);
  }

  function kpis(result) {
    const items = [
      ["Project", result.metadata.run_name || ""],
      ["Module", result.metadata.module_type],
      ["Wells", result.metadata.common_well_count || result.wells.length],
      ["Run ID", result.id],
    ];
    return `<div class="kpi-grid">${items.map(([k, v]) => `<div class="hc-kpi"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join("")}</div>`;
  }

  function tableHtml(rows) {
    if (!rows || !rows.length) return `<div class="hc-info-card">No rows to preview.</div>`;
    const cols = Object.keys(rows[0]);
    return `<div class="table-wrap"><table><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${cols.map((c) => `<td>${esc(Number.isFinite(Number(row[c])) ? fmt(Number(row[c]), 4) : row[c])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }

  function selectedWellPanel(result) {
    const series = selectedWellSeries(result);
    if (!series || !series.wells.length) return "";
    const metrics = metricColumns(result.summary);
    const metric = defaultMetric(result.module, metrics);
    const selected = defaultSelectedWells(result.summary, series.wells, metric);
    return `<div class="panel" id="selectedWellPanel"><h2>Selected well smooth scatter plots</h2><p>Choose good wells, preview one plot, then export one independent figure per well.</p>
      <div class="grid three"><div><label>Recommend wells by</label><select id="wellMetric">${metrics.map((m) => `<option ${m === metric ? "selected" : ""}>${esc(m)}</option>`).join("")}</select></div><label class="check"><input id="wellSmooth" type="checkbox" checked> Smooth curve</label><div><label>TIF resolution</label><select id="wellDpi"><option>300</option><option selected>600</option><option>1200</option></select></div></div>
      <div class="grid two"><div><label>Good wells</label><select id="wellSelect" multiple size="10">${series.wells.map((w) => `<option value="${esc(w)}" ${selected.includes(w) ? "selected" : ""}>${esc(w)}</option>`).join("")}</select><div class="field-note">Hold Shift or Command to select multiple wells.</div></div><div><label>Smoothing window</label><input id="wellWindow" type="number" min="5" max="51" step="2" value="11"><div class="actions"><button id="previewWell" type="button">Preview first well</button><button id="svgWell" type="button">Download SVG ZIP</button><button id="pdfWell" type="button">Download PDF ZIP</button><button id="tifWell" type="button">Download TIF ZIP</button><button id="dataWell" type="button">Download Data ZIP</button></div></div></div>
      <div id="wellPreview" class="preview-card"></div></div>`;
  }

  function wireSelectedWellPanel(result) {
    if (!$("selectedWellPanel")) return;
    $("wellMetric").addEventListener("change", () => {
      const metric = $("wellMetric").value;
      const selected = defaultSelectedWells(result.summary, result.wells, metric);
      [...$("wellSelect").options].forEach((opt) => { opt.selected = selected.includes(opt.value); });
    });
    $("previewWell").addEventListener("click", () => {
      const svg = selectedWellSvgs(result)[0]?.svg;
      $("wellPreview").innerHTML = svg || `<div class="hc-info-card hc-warning">Select at least one well.</div>`;
    });
    $("svgWell").addEventListener("click", () => downloadSelectedPlots(result, "svg"));
    $("pdfWell").addEventListener("click", () => downloadSelectedPlots(result, "pdf"));
    $("tifWell").addEventListener("click", () => downloadSelectedPlots(result, "tif"));
    $("dataWell").addEventListener("click", () => downloadSelectedData(result));
  }

  function selectedWellSvgs(result) {
    const series = selectedWellSeries(result);
    const selected = [...$("wellSelect").selectedOptions].map((opt) => opt.value);
    const smooth = getChecked("wellSmooth");
    const windowLength = Number($("wellWindow").value || 11);
    return selected.map((well) => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="620" height="430" viewBox="0 0 620 430"><rect width="100%" height="100%" fill="white"/><text x="310" y="30" text-anchor="middle" font-size="20" font-weight="700">${esc(MODULES[result.module].title)} ${esc(well)}</text>${wellPanelSvg({ tables: series.tables, labels: series.labels, colors: [result.config.plotting.colors.primary, result.config.plotting.colors.secondary], well, title: well, x: 40, y: 54, width: 540, height: 330, smooth, windowLength })}</svg>`;
      return { well, svg };
    });
  }

  async function downloadSelectedPlots(result, format) {
    await ensureZipLibrary();
    const zip = new JSZip();
    const dpi = Number($("wellDpi").value || 600);
    for (const item of selectedWellSvgs(result)) {
      if (format === "svg") zip.file(`${result.id}_${item.well}.svg`, item.svg);
      if (format === "pdf") zip.file(`${result.id}_${item.well}.pdf`, await svgToPdfBytes(item.svg));
      if (format === "tif") zip.file(`${result.id}_${item.well}.tif`, await svgToTiffBytes(item.svg, dpi));
    }
    downloadBlob(await zip.generateAsync({ type: "blob" }), `${result.id}_selected_well_plots_${format}.zip`, "application/zip");
  }

  async function downloadSelectedData(result) {
    await ensureZipLibrary();
    const series = selectedWellSeries(result);
    const zip = new JSZip();
    const selected = [...$("wellSelect").selectedOptions].map((opt) => opt.value);
    for (const well of selected) {
      const rows = series.tables[0].rows.map((row, idx) => {
        const out = { Wavelength: row.Wavelength };
        series.tables.forEach((table, t) => { out[series.labels[t]] = table.rows[idx]?.[well]; });
        return out;
      });
      zip.file(`${result.id}_${well}_plot_data.csv`, csvBytes(rows));
    }
    downloadBlob(await zip.generateAsync({ type: "blob" }), `${result.id}_selected_well_plot_data.zip`, "application/zip");
  }

  function renderHistory() {
    $("dashboard").classList.add("hidden");
    $("workspace").classList.remove("hidden");
    $("currentWorkspace").textContent = "Current workspace: Analysis History";
    $("workspace").innerHTML = `<button data-back>Back to Dashboard</button><div class="hc-breadcrumb">Dashboard / Analysis History</div><div class="hc-module-header"><div><h1>Analysis History</h1><p>Browse previous analysis runs stored in this browser.</p><div class="hc-tags"><span class="hc-tag">Local records</span><span class="hc-tag">Metadata</span><span class="hc-tag">Reproducibility</span></div></div><div class="hc-mode-pill"><span>Data mode</span><strong>browser localStorage</strong></div></div>${section("Runs", `${state.history.length} record(s) shown.`)}${state.history.length ? tableHtml(state.history) : `<div class="hc-info-card">No history found.</div>`}`;
    $("workspace").querySelector("[data-back]").addEventListener("click", renderDashboard);
  }

  function renderSettings() {
    const cfg = state.config;
    $("dashboard").classList.add("hidden");
    $("workspace").classList.remove("hidden");
    $("currentWorkspace").textContent = "Current workspace: Settings";
    $("workspace").innerHTML = `<button data-back>Back to Dashboard</button><div class="hc-breadcrumb">Dashboard / Settings</div><div class="hc-module-header"><div><h1>Settings</h1><p>Set global default plotting, smoothing, output, and history parameters.</p><div class="hc-tags"><span class="hc-tag">Defaults</span><span class="hc-tag">browser</span><span class="hc-tag">GitHub Pages</span></div></div><div class="hc-mode-pill"><span>Data mode</span><strong>Session settings</strong></div></div>
      <div class="panel grid three"><div><label>Marker size</label><input id="set_marker" type="range" min="0.5" max="8" step="0.5" value="${cfg.plot.marker_size}"></div><div><label>Line width</label><input id="set_line" type="range" min="0.2" max="3" step="0.1" value="${cfg.plot.line_width}"></div><div><label>Default heatmap palette</label><select id="set_cmap"><option>hc_nature</option><option>hc_soft</option><option>YlGnBu</option><option>BuGn</option><option>viridis</option><option>cividis</option><option>plasma</option></select></div><label class="check"><input id="set_smooth" type="checkbox" ${cfg.plot.smoothing.enabled ? "checked" : ""}> Smoothing enabled</label><div><label>Window length</label><input id="set_window" type="range" min="3" max="51" step="2" value="${cfg.plot.smoothing.window_length}"></div><div><label>Number of recent runs</label><input id="set_recent" type="range" min="3" max="10" value="${cfg.ui.recent_runs}"></div></div>
      <div class="actions"><button class="primary" id="saveSettings">Save settings</button><button id="exportConfig">Export config.json</button><input id="importConfig" type="file" accept=".json"></div>`;
    $("set_cmap").value = cfg.plotting.colors.heatmap;
    $("workspace").querySelector("[data-back]").addEventListener("click", renderDashboard);
    $("saveSettings").addEventListener("click", () => {
      cfg.plot.marker_size = Number($("set_marker").value);
      cfg.plot.line_width = Number($("set_line").value);
      cfg.plotting.colors.heatmap = $("set_cmap").value;
      cfg.plot.smoothing.enabled = getChecked("set_smooth");
      cfg.plot.smoothing.window_length = Number($("set_window").value);
      cfg.ui.recent_runs = Number($("set_recent").value);
      saveConfig();
      renderSettings();
    });
    $("exportConfig").addEventListener("click", () => downloadBlob(new TextEncoder().encode(JSON.stringify(cfg, null, 2)), "config.json", "application/json"));
    $("importConfig").addEventListener("change", async () => {
      const file = $("importConfig").files[0];
      if (file) {
        state.config = mergeDeep(deepCopy(DEFAULT_CONFIG), JSON.parse(await file.text()));
        saveConfig();
        renderSettings();
      }
    });
  }

  function updateSide() {
    const latest = state.history[0];
    $("latestRun").textContent = latest ? `Latest run: ${latest.run_id}` : "Latest run: none";
  }

  window.addEventListener("error", (event) => showFatalError(event.error || event.message));
  window.addEventListener("unhandledrejection", (event) => showFatalError(event.reason));
  try {
    $("debugMode").addEventListener("change", () => { state.debug = $("debugMode").checked; });
    renderDashboard();
  } catch (error) {
    showFatalError(error);
  }
})();
