(() => {
  "use strict";

  const APP_VERSION = "2026-08-21-384-fixed-layout";
  const ROWS_384 = "ABCDEFGHIJKLMNOP".split("");
  const COLS_384 = Array.from({ length: 24 }, (_, i) => i + 1);
  const STORE_KEY = "hc_platescope_native_runs";
  const CONFIG_KEY = "hc_platescope_native_config";
  const LIBS = {
    xlsx: { url: "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js", test: () => window.XLSX },
    papa: { url: "https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js", test: () => window.Papa },
    zip: { url: "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js", test: () => window.JSZip },
    pdf: { url: "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js", test: () => window.jspdf },
    svg2pdf: { url: "https://cdn.jsdelivr.net/npm/svg2pdf.js@2.2.3/dist/svg2pdf.umd.min.js", test: () => window.svg2pdf || window.jspdf?.jsPDF?.API?.svg },
    tiff: { url: "https://cdn.jsdelivr.net/npm/utif@3.1.0/UTIF.min.js", test: () => window.UTIF },
  };
  const libPromises = {};


  const HEATMAP_PALETTES = [
    { id: "hc_nature", name: "HC nature", colors: ["#F7FBF8", "#DDF3DE", "#AADCA9", "#3775BA", "#B64342"] },
    { id: "hc_soft", name: "HC soft", colors: ["#F8FBF8", "#DDEFE8", "#9FD1C4", "#5F9FBE", "#E6A15C"] },
    { id: "YlGnBu", name: "YlGnBu", colors: ["#ffffd9", "#c7e9b4", "#41b6c4", "#225ea8"] },
    { id: "BuGn", name: "BuGn", colors: ["#f7fcfd", "#ccece6", "#66c2a4", "#238b45"] },
    { id: "viridis", name: "viridis", colors: ["#440154", "#31688e", "#35b779", "#fde725"] },
    { id: "cividis", name: "cividis", colors: ["#00224e", "#575d6d", "#a59c74", "#fee838"] },
    { id: "plasma", name: "plasma", colors: ["#0d0887", "#9c179e", "#ed7953", "#f0f921"] },
    { id: "mako", name: "mako", colors: ["#0B0405", "#264A6A", "#4C99A6", "#DEF5E5"] },
    { id: "rocket", name: "rocket", colors: ["#03051A", "#7B1F59", "#D64F40", "#FAEBDD"] },
    { id: "crest", name: "crest", colors: ["#173F5F", "#2C7C7B", "#8FD0A9", "#F5F7D4"] },
    { id: "coolwarm", name: "coolwarm", colors: ["#3B4CC0", "#89A9FC", "#F7F7F7", "#F4987A", "#B40426"] },
    { id: "magma", name: "magma", colors: ["#000004", "#3B0F70", "#8C2981", "#DE4968", "#FCFDBF"] },
  ];

  const DEFAULT_CONFIG = {
    project: { name: "HC PlateScope", version: "1.0.0" },
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
      marker_size: 1.2,
      line_width: 1.4,
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
      marker_size: 1.2,
      line_width: 1.4,
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
    reportZoom: 1,
  };

  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const isFiniteNumber = (value) => Number.isFinite(Number(value));
  const asNum = (value) => {
    if (value === null || value === undefined || value === "") return NaN;
    const n = Number(String(value).replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : NaN;
  };
  const fmt = (value, digits = 3) => {
    if (!Number.isFinite(value)) return "";
    if (digits <= 0) return String(Math.round(Number(value)));
    return Number(value).toFixed(digits).replace(/\.?0+$/, "");
  };
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
      return normalizeLoadedConfig(mergeDeep(deepCopy(DEFAULT_CONFIG), JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}")));
    } catch {
      return deepCopy(DEFAULT_CONFIG);
    }
  }

  function normalizeLoadedConfig(config) {
    return config;
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

  function tableFromMultiBlockAoA(aoa, config = state.config) {
    const plateFormat = plateFormatFromConfig(config);
    const blocks = [];
    aoa.forEach((row, rowIndex) => {
      const fields = (row || []).map((x) => String(x ?? "").trim());
      const wavelengthIndex = fields.findIndex((field) => hasWavelengthKeyword(field, config));
      if (wavelengthIndex < 0) return;
      const wells = [];
      fields.forEach((field, colIndex) => {
        const well = normalizeWellId(field, plateFormat);
        if (well) wells.push({ colIndex, well });
      });
      if (wells.length >= 2) blocks.push({ rowIndex, wavelengthIndex, wells });
    });
    if (blocks.length <= 1) return null;

    const grouped = new Map();
    const seenWells = new Set();
    blocks.forEach((block, blockIndex) => {
      const nextBlockRow = blocks[blockIndex + 1]?.rowIndex ?? aoa.length;
      for (let r = block.rowIndex + 1; r < nextBlockRow; r += 1) {
        const source = aoa[r] || [];
        const wavelength = asNum(source[block.wavelengthIndex]);
        if (!Number.isFinite(wavelength)) continue;
        for (const { colIndex, well } of block.wells) {
          const value = asNum(source[colIndex]);
          if (!Number.isFinite(value)) continue;
          const key = `${wavelength}||${well}`;
          if (!grouped.has(key)) grouped.set(key, []);
          grouped.get(key).push(value);
          seenWells.add(well);
        }
      }
    });
    if (!grouped.size || !seenWells.size) return null;

    const rowsByWavelength = new Map();
    for (const [key, values] of grouped.entries()) {
      const [wavelengthText, well] = key.split("||");
      const wavelength = Number(wavelengthText);
      if (!rowsByWavelength.has(wavelength)) rowsByWavelength.set(wavelength, { Wavelength: wavelength });
      rowsByWavelength.get(wavelength)[well] = values.reduce((a, b) => a + b, 0) / values.length;
    }
    const wells = sortedWells([...seenWells], config);
    const rows = [...rowsByWavelength.values()].sort((a, b) => a.Wavelength - b.Wavelength);
    return { columns: ["Wavelength", ...wells], rows };
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
      return tableFromMultiBlockAoA(aoa, config) || tableFromAoA(aoa, detectHeaderRow(aoa, config));
    }
    if (ext === "csv") {
      const text = await file.text();
      const candidates = [",", "\t", ";"].map((delimiter) => Papa.parse(text, { delimiter, skipEmptyLines: false }).data);
      const best = candidates.map((aoa) => ({ aoa, header: detectHeaderRow(aoa, config), score: scoreHeader(aoa[detectHeaderRow(aoa, config)] || [], config) }))
        .sort((a, b) => b.score - a.score)[0];
      return tableFromMultiBlockAoA(best.aoa, config) || tableFromAoA(best.aoa, best.header);
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

  function ceilingToNearestTen(value) {
    if (!Number.isFinite(value) || value <= 0) return 10;
    return Math.max(10, Math.ceil(value / 10) * 10);
  }

  function heatmapValues(summary, valueColumn) {
    return Object.fromEntries(summary.map((row) => [row.well_id || row.without_ca_well, row[valueColumn]]));
  }

  function colorRamp(name) {
    return HEATMAP_PALETTES.find((palette) => palette.id === name)?.colors || HEATMAP_PALETTES[0].colors;
  }

  function paletteGradient(name) {
    return colorRamp(name).join(", ");
  }

  function paletteSelect(id, value) {
    const current = HEATMAP_PALETTES.find((palette) => palette.id === value) || HEATMAP_PALETTES[0];
    const options = HEATMAP_PALETTES.map((palette) => `<button class="palette-option${palette.id === current.id ? " selected" : ""}" type="button" data-palette-value="${esc(palette.id)}"><span>${esc(palette.name)}</span><i style="background: linear-gradient(90deg, ${esc(palette.colors.join(", "))})"></i></button>`).join("");
    return `<div class="palette-select-wrap" data-palette-root><input id="${id}" type="hidden" value="${esc(current.id)}" data-palette-input><button class="palette-trigger" type="button" data-palette-trigger aria-haspopup="listbox" aria-expanded="false"><span data-palette-name>${esc(current.name)}</span><i data-palette-preview style="background: linear-gradient(90deg, ${esc(current.colors.join(", "))})"></i></button><div class="palette-menu" data-palette-menu role="listbox">${options}</div></div>`;
  }

  function wireVisualSelects(root = document) {
    root.querySelectorAll("[data-palette-root]").forEach((picker) => {
      const input = picker.querySelector("[data-palette-input]");
      const trigger = picker.querySelector("[data-palette-trigger]");
      const menu = picker.querySelector("[data-palette-menu]");
      const name = picker.querySelector("[data-palette-name]");
      const preview = picker.querySelector("[data-palette-preview]");
      const close = () => {
        picker.classList.remove("open");
        trigger?.setAttribute("aria-expanded", "false");
      };
      const update = (value) => {
        const palette = HEATMAP_PALETTES.find((item) => item.id === value) || HEATMAP_PALETTES[0];
        input.value = palette.id;
        if (name) name.textContent = palette.name;
        if (preview) preview.style.background = `linear-gradient(90deg, ${palette.colors.join(", ")})`;
        picker.querySelectorAll("[data-palette-value]").forEach((btn) => btn.classList.toggle("selected", btn.dataset.paletteValue === palette.id));
      };
      trigger?.addEventListener("click", () => {
        const isOpen = picker.classList.toggle("open");
        trigger.setAttribute("aria-expanded", isOpen ? "true" : "false");
      });
      menu?.querySelectorAll("[data-palette-value]").forEach((btn) => btn.addEventListener("click", () => {
        update(btn.dataset.paletteValue);
        close();
      }));
      update(input.value);
    });
    if (!window.__hcPaletteOutsideClick) {
      window.__hcPaletteOutsideClick = true;
      document.addEventListener("click", (event) => {
        document.querySelectorAll("[data-palette-root].open").forEach((picker) => {
          if (!picker.contains(event.target)) {
            picker.classList.remove("open");
            picker.querySelector("[data-palette-trigger]")?.setAttribute("aria-expanded", "false");
          }
        });
      });
    }
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

  function seriesRange(table, wells, config = DEFAULT_CONFIG, normalized = false, moduleKey = "") {
    const xs = table.rows.map((r) => asNum(r.Wavelength)).filter(Number.isFinite);
    const ys = [];
    for (const row of table.rows) for (const well of wells) {
      const value = asNum(row[well]);
      if (Number.isFinite(value)) ys.push(value);
    }
    const yCfg = config.plotting?.y_axis || {};
    const padding = Number(yCfg.upper_padding || 1.1);
    const rawMax = Math.max(...ys);
    const ymax = ["luci", "anti"].includes(moduleKey) ? 1.1 : ceilingToNearestTen(Number.isFinite(rawMax) && rawMax > 0 ? rawMax * padding : padding);
    return {
      xmin: Math.min(...xs),
      xmax: Math.max(...xs),
      ymin: Math.min(0, ...ys),
      ymax: Number.isFinite(ymax) && ymax > 0 ? ymax : 1,
    };
  }

  function wavelengthTicks(values, interval = 10) {
    const xs = values.map(asNum).filter(Number.isFinite);
    if (!xs.length) return [];
    const step = Math.max(1, Number(interval) || 10);
    const low = Math.floor(Math.min(...xs) / step) * step;
    const high = Math.ceil(Math.max(...xs) / step) * step;
    const ticks = [];
    for (let tick = low; tick <= high + 1e-9; tick += step) ticks.push(tick);
    return ticks;
  }

  function wellPanelSvg({ tables, labels, colors, well, title, x, y, width, height, smooth = true, windowLength = 9, badge, config = DEFAULT_CONFIG, normalized = false, moduleKey = "" }) {
    const compact = width < 80 || height < 80;
    const pad = compact ? { l: 12, r: 3, t: 9, b: 12 } : { l: 32, r: 10, t: 18, b: 36 };
    const innerW = width - pad.l - pad.r;
    const innerH = height - pad.t - pad.b;
    const range = seriesRange(tables[0], [well], config, normalized, moduleKey);
    for (const table of tables.slice(1)) {
      const r = seriesRange(table, [well], config, normalized, moduleKey);
      range.ymax = Math.max(range.ymax, r.ymax);
    }
    const allX = tables.flatMap((table) => table.rows.map((row) => row.Wavelength));
    const tickInterval = config.plotting?.x_axis?.tick_interval_nm || 10;
    const ticks = wavelengthTicks(allX, tickInterval);
    if (ticks.length) {
      range.xmin = ticks[0];
      range.xmax = ticks[ticks.length - 1];
    }
    const sx = (v) => x + pad.l + ((v - range.xmin) / Math.max(1e-9, range.xmax - range.xmin)) * innerW;
    const sy = (v) => y + pad.t + innerH - ((v - range.ymin) / Math.max(1e-9, range.ymax - range.ymin)) * innerH;
    const markerRadius = compact ? Math.max(0.42, Math.sqrt(Number(config.plot?.marker_size || config.plotting?.marker_size || 1)) * 0.48) : Math.max(0.85, Math.sqrt(Number(config.plot?.marker_size || config.plotting?.marker_size || 1)) * 0.78);
    const lineWidth = compact ? Math.max(0.62, Number(config.plot?.line_width || config.plotting?.line_width || 1) * 0.82) : Math.max(0.95, Number(config.plot?.line_width || config.plotting?.line_width || 1) * 1.15);
    const markerAlpha = Number(config.plot?.marker_alpha || config.plotting?.alpha || 0.55);
    const lineAlpha = Number(config.plot?.line_alpha || config.plotting?.line_alpha || 0.95);
    const grid = [];
    const yTicks = [0, range.ymax / 2, range.ymax];
    for (const tick of ticks) {
      const gx = sx(tick);
      grid.push(svgEl("line", { x1: gx, y1: y + pad.t, x2: gx, y2: y + pad.t + innerH, stroke: "#EAEAEA", "stroke-width": compact ? 0.55 : 0.5 }));
      grid.push(svgEl("line", { x1: gx, y1: y + pad.t + innerH, x2: gx, y2: y + pad.t + innerH + (compact ? 1.5 : 3), stroke: "#333", "stroke-width": compact ? 0.42 : 0.58 }));
      grid.push(svgEl("text", { x: gx + 0.7, y: y + height - (compact ? 3.5 : 6), "font-size": compact ? 3.3 : 6.0, "font-weight": "700", fill: "#333", transform: `rotate(-90 ${gx + 0.7} ${y + height - (compact ? 3.5 : 6)})` }, fmt(tick, 0)));
    }
    for (const tick of yTicks) {
      const gy = sy(tick);
      grid.push(svgEl("line", { x1: x + pad.l, y1: gy, x2: x + pad.l + innerW, y2: gy, stroke: "#EAEAEA", "stroke-width": compact ? 0.55 : 0.5 }));
      grid.push(svgEl("line", { x1: x + pad.l - (compact ? 1.5 : 3), y1: gy, x2: x + pad.l, y2: gy, stroke: "#333", "stroke-width": compact ? 0.42 : 0.58 }));
      grid.push(svgEl("text", { x: x + pad.l - (compact ? 2.4 : 5), y: gy + (compact ? 1.1 : 2), "text-anchor": "end", "font-size": compact ? 3.5 : 6.2, "font-weight": "700", fill: "#333" }, fmt(tick, tick >= 10 ? 0 : 1)));
    }
    if (!ticks.length) {
      for (let i = 0; i <= 4; i += 1) {
        const gx = x + pad.l + innerW * i / 4;
        grid.push(svgEl("line", { x1: gx, y1: y + pad.t, x2: gx, y2: y + pad.t + innerH, stroke: "#EAEAEA", "stroke-width": compact ? 0.55 : 0.5 }));
      }
    }
    for (let i = 0; i <= 4; i += 1) {
      const gy = y + pad.t + innerH * i / 4;
      grid.push(svgEl("line", { x1: x + pad.l, y1: gy, x2: x + pad.l + innerW, y2: gy, stroke: "#F2F2F2", "stroke-width": compact ? 0.42 : 0.38 }));
    }
    const plots = [];
    tables.forEach((table, idx) => {
      const pts = table.rows.map((row) => [asNum(row.Wavelength), asNum(row[well])]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
      plots.push(...pts.map(([px, py]) => svgEl("circle", { cx: sx(px), cy: sy(py), r: markerRadius.toFixed(2), fill: colors[idx], opacity: markerAlpha })));
      const yValues = pts.map((p) => p[1]);
      const d = pts.map((p, i) => `${i ? "L" : "M"}${sx(p[0]).toFixed(2)} ${sy(yValues[i]).toFixed(2)}`).join(" ");
      plots.push(svgEl("path", { d, fill: "none", stroke: colors[idx], "stroke-width": lineWidth.toFixed(2), opacity: lineAlpha }));
    });
    const badgeW = compact ? 18 : 40;
    const badgeH = compact ? 6 : 14;
    const badgeX = x + width - badgeW - (compact ? 2 : 8);
    const badgeY = y + (compact ? 1.5 : 18);
    const badgeSvg = badge ? svgEl("rect", { x: badgeX, y: badgeY, width: badgeW, height: badgeH, rx: compact ? 1.2 : 2.5, fill: badge.color || "#42949E", opacity: 0.92 }) +
      svgEl("text", { x: badgeX + badgeW / 2, y: badgeY + (compact ? 4.4 : 10.5), "text-anchor": "middle", "font-size": compact ? 3.8 : 7.8, "font-weight": "800", fill: "white" }, badge.text) : "";
    const titleAttrs = compact
      ? { x: x + 3, y: y + 5.2, "text-anchor": "start" }
      : moduleKey === "geco"
        ? { x: x + width - 8, y: y + 12, "text-anchor": "end" }
        : { x: x + 8, y: y + 12, "text-anchor": "start" };
    return svgEl("g", {}, [
      svgEl("rect", { x, y, width, height, fill: "white" }),
      ...grid,
      svgEl("line", { x1: x + pad.l, y1: y + pad.t + innerH, x2: x + pad.l + innerW, y2: y + pad.t + innerH, stroke: "#333", "stroke-width": compact ? 0.55 : 0.9 }),
      svgEl("line", { x1: x + pad.l, y1: y + pad.t, x2: x + pad.l, y2: y + pad.t + innerH, stroke: "#333", "stroke-width": compact ? 0.55 : 0.9 }),
      ...plots,
      svgEl("text", { ...titleAttrs, "font-size": compact ? 5.2 : 9, "font-weight": "800", fill: "#333" }, title || well),
      badgeSvg,
    ].join(""));
  }

  function gridSvg({ title, tables, labels, wells, config, normalized = false, moduleKey = "", highlights = {}, report = false }) {
    const layout = config.plotting.spectra_grid || {};
    const plate = plateLayout(config, wells);
    const is384Report = report && plate.format === 384;
    const configuredCols = Math.max(1, Math.min(24, Number(layout.columns || 12)));
    const baseCols = is384Report || layout.mode === "compact" ? configuredCols : plate.cols.length;
    const cm = 28.3464567;
    const report384PanelSize = 2.5 * cm;
    const report384MaxCols = 12;
    const pageWells = wells.slice();
    const gap = report ? (is384Report ? 4 : 1.5) : 14;
    const left = report ? 4 : 22;
    const top = report ? 18 : 48;
    if (is384Report && baseCols > report384MaxCols) {
      const error = new Error(`Plots per row = ${baseCols} 放进 PDF 后会让单个散点图过小。384 孔板报告每行最多建议 ${report384MaxCols} 个；请把 Plots per row 调小后重新运行。`);
      error.showAlert = true;
      throw error;
    }
    const ncols = baseCols;
    const basePanelW = report ? 48 : 128;
    const basePanelH = report ? 57 : 100;
    const panelW = is384Report ? report384PanelSize : basePanelW;
    const panelH = is384Report ? report384PanelSize : basePanelH;
    const rows = Math.ceil(pageWells.length / ncols);
    const width = left * 2 + ncols * panelW + Math.max(0, ncols - 1) * gap;
    const height = top + rows * Math.max(basePanelH, panelH) + Math.max(0, rows - 1) * gap + (report ? 10 : 26);
    const colors = [config.plotting.colors.primary, config.plotting.colors.secondary];
    const panels = pageWells.map((well, idx) => {
      const col = idx % ncols;
      const row = Math.floor(idx / ncols);
      const rowStart = row * ncols;
      const wellsInRow = Math.min(ncols, pageWells.length - rowStart);
      const rowW = wellsInRow * panelW + Math.max(0, wellsInRow - 1) * gap;
      const rowOffset = is384Report ? (width - left * 2 - rowW) / 2 : 0;
      return wellPanelSvg({
        tables,
        labels,
        colors,
        well,
        title: well,
        x: left + rowOffset + col * (panelW + gap),
        y: top + row * (panelH + gap),
        width: panelW,
        height: panelH,
        smooth: config.plot.smoothing.enabled,
        windowLength: config.plot.smoothing.window_length,
        badge: (highlights[well] || [])[0],
        config,
        normalized,
        moduleKey,
      });
    }).join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="100%" height="100%" fill="white"/>
      <text x="${width / 2}" y="${report ? 10 : 24}" text-anchor="middle" font-size="${report ? 9 : 18}" font-weight="800" fill="#111">${esc(title)}</text>
      ${panels}
      <text x="${width / 2}" y="${height - (report ? 2 : 10)}" text-anchor="middle" font-size="${report ? 6 : 10}" font-weight="700" fill="#333">Wavelength (nm)</text>
    </svg>`;
  }

  function heatmapSvg(values, config, title, label) {
    const layout = plateLayout(config, Object.keys(values));
    const valueWells = Object.keys(values).filter((well) => Number.isFinite(Number(values[well])));
    const is384Layout = layout.format === 384;
    const usedRows = new Set(valueWells.map((well) => well[0]));
    const usedCols = new Set(valueWells.map((well) => Number(well.slice(1))));
    const rows = is384Layout ? layout.rows.filter((row) => usedRows.has(row)) : layout.rows;
    const cols = is384Layout ? layout.cols.filter((col) => usedCols.has(col)) : layout.cols;
    const cm = 28.3464567;
    const baseCell = layout.format === 384 ? 24 : 34;
    const cell = is384Layout ? 1.5 * cm : baseCell;
    const left = 48;
    const top = 58;
    const rightPad = is384Layout ? 48 : 64;
    const colorbar = is384Layout ? { h: 14, gap: 18 } : { w: 14, gap: 30 };
    const gridW = cols.length * cell;
    const gridH = rows.length * cell;
    const min384Width = 520;
    const width = is384Layout ? Math.max(min384Width, left + gridW + rightPad) : left + gridW + colorbar.gap + colorbar.w + 64;
    const height = is384Layout ? top + gridH + colorbar.gap + colorbar.h + 44 : top + gridH + 52;
    const gridX = is384Layout ? (width - gridW) / 2 : left;
    const rowLabelX = gridX - 12;
    const finite = Object.values(values).map(Number).filter(Number.isFinite);
    const min = finite.length ? Math.min(...finite) : 0;
    const max = finite.length ? Math.max(...finite) : 1;
    const ramp = colorRamp(config.plotting.colors.heatmap);
    let body = `<rect width="100%" height="100%" fill="white"/>
      <text x="${width / 2}" y="26" text-anchor="middle" font-size="${is384Layout ? 11 : 18}" font-weight="700" fill="#111">${esc(title)}</text>`;
    cols.forEach((col, i) => { body += svgEl("text", { x: gridX + i * cell + cell / 2, y: top - 10, "text-anchor": "middle", "font-size": 8, fill: "#444" }, col); });
    rows.forEach((row, r) => {
      body += svgEl("text", { x: rowLabelX, y: top + r * cell + cell / 2 + 3, "text-anchor": "middle", "font-size": 8, fill: "#444" }, row);
      cols.forEach((col, c) => {
        const well = `${row}${String(col).padStart(2, "0")}`;
        const value = Number(values[well]);
        const fill = Number.isFinite(value) ? lerpColor(ramp, (value - min) / Math.max(1e-9, max - min)) : "#F2F2F2";
        body += svgEl("rect", { x: gridX + c * cell, y: top + r * cell, width: cell - 1, height: cell - 1, fill, stroke: "#fff", "stroke-width": 0.5 });
        if (config.plotting.heatmap.show_values && Number.isFinite(value) && (is384Layout || cell >= 28)) {
          body += svgEl("text", { x: gridX + c * cell + cell / 2, y: top + r * cell + cell / 2 + 3, "text-anchor": "middle", "font-size": is384Layout ? 6.5 : 7, fill: "#1F2A24" }, fmt(value, 2));
        }
      });
    });
    const segments = 80;
    if (is384Layout) {
      const barW = Math.min(Math.max(gridW, 180), width - left * 2);
      const barX = (width - barW) / 2;
      const barY = top + gridH + colorbar.gap;
      for (let i = 0; i < segments; i += 1) {
        const t0 = i / segments;
        const x0 = barX + i * barW / segments;
        body += svgEl("rect", { x: x0, y: barY, width: Math.ceil(barW / segments) + 0.5, height: colorbar.h, fill: lerpColor(ramp, t0), stroke: "none" });
      }
      body += svgEl("rect", { x: barX, y: barY, width: barW, height: colorbar.h, fill: "none", stroke: "#555", "stroke-width": 0.45 });
      const tickValues = [min, (min + max) / 2, max];
      tickValues.forEach((value, idx) => {
        const xTick = idx === 0 ? barX : idx === 1 ? barX + barW / 2 : barX + barW;
        body += svgEl("line", { x1: xTick, y1: barY + colorbar.h, x2: xTick, y2: barY + colorbar.h + 4, stroke: "#444", "stroke-width": 0.45 });
        body += svgEl("text", { x: xTick, y: barY + colorbar.h + 13, "text-anchor": "middle", "font-size": 7, fill: "#444" }, fmt(value, 2));
      });
      body += svgEl("text", { x: width / 2, y: height - 8, "text-anchor": "middle", "font-size": 8, fill: "#444" }, esc(label));
    } else {
      const barX = gridX + gridW + colorbar.gap;
      const barY = top;
      const barH = gridH - 1;
      for (let i = 0; i < segments; i += 1) {
        const t0 = i / segments;
        const y0 = barY + barH - (i + 1) * barH / segments;
        body += svgEl("rect", { x: barX, y: y0, width: colorbar.w, height: Math.ceil(barH / segments) + 0.4, fill: lerpColor(ramp, t0), stroke: "none" });
      }
      body += svgEl("rect", { x: barX, y: barY, width: colorbar.w, height: barH, fill: "none", stroke: "#555", "stroke-width": 0.45 });
      const tickValues = [max, (min + max) / 2, min];
      tickValues.forEach((value, idx) => {
        const yTick = idx === 0 ? barY : idx === 1 ? barY + barH / 2 : barY + barH;
        body += svgEl("line", { x1: barX + colorbar.w, y1: yTick, x2: barX + colorbar.w + 4, y2: yTick, stroke: "#444", "stroke-width": 0.45 });
        body += svgEl("text", { x: barX + colorbar.w + 7, y: yTick + 3, "font-size": 7, fill: "#444" }, fmt(value, 2));
      });
      body += svgEl("text", { x: barX + colorbar.w / 2, y: barY + barH + 22, "text-anchor": "middle", "font-size": 8, fill: "#444" }, esc(label));
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
  }

  function combineReportSvg(title, grid, heatmap) {
    const gridBox = svgSize(grid);
    const heatBox = svgSize(heatmap);
    const width = 595.28;
    const height = 841.89;
    const marginX = 18;
    const gridRegion = { x: marginX, y: 38, width: width - marginX * 2, height: 500 };
    const heatRegion = { x: 42, y: 552, width: width - 84, height: 280 };
    const gridScale = Math.min(1, gridRegion.width / gridBox.width, gridRegion.height / gridBox.height);
    const heatScale = Math.min(1, heatRegion.width / heatBox.width, heatRegion.height / heatBox.height);
    const gridX = gridRegion.x + (gridRegion.width - gridBox.width * gridScale) / 2;
    const heatX = heatRegion.x + (heatRegion.width - heatBox.width * heatScale) / 2;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="100%" height="100%" fill="white"/>
      <text x="${width / 2}" y="24" text-anchor="middle" font-size="11" font-weight="800" fill="#111">${esc(title)}</text>
      <g transform="translate(${gridX.toFixed(2)} ${gridRegion.y}) scale(${gridScale.toFixed(5)})">${stripSvg(grid)}</g>
      <g transform="translate(${heatX.toFixed(2)} ${heatRegion.y}) scale(${heatScale.toFixed(5)})">${stripSvg(heatmap)}</g>
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

  function rowsToXlsxBytes(rows, sheetName = "Sheet1") {
    const columns = Object.keys(rows[0] || {});
    return tableToXlsxBytes({ columns, rows }, sheetName);
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

  function parseSimpleYaml(text) {
    const root = {};
    const stack = [{ indent: -1, value: root, key: null }];
    const lines = String(text).split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith("#"));
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      const indent = line.match(/^\s*/)[0].length;
      const trimmed = line.trim();
      while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
      const parent = stack[stack.length - 1].value;
      if (trimmed.startsWith("- ")) {
        if (!Array.isArray(parent)) continue;
        parent.push(parseYamlScalar(trimmed.slice(2)));
        continue;
      }
      const idx = trimmed.indexOf(":");
      if (idx < 0) continue;
      const key = trimmed.slice(0, idx).trim();
      const rest = trimmed.slice(idx + 1).trim();
      if (rest) {
        parent[key] = parseYamlScalar(rest);
      } else {
        const nextLine = lines[lineIndex + 1] || "";
        const nextTrimmed = nextLine.trim();
        parent[key] = nextTrimmed.startsWith("- ") ? [] : {};
        stack.push({ indent, value: parent[key], key });
      }
    }
    return root;
  }

  function parseYamlScalar(value) {
    const text = String(value).trim();
    if (text === "null") return null;
    if (text === "true") return true;
    if (text === "false") return false;
    if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
    try { return JSON.parse(text); } catch { return text.replace(/^["']|["']$/g, ""); }
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

  async function ensureVectorPdfLibraries() {
    await loadScriptOnce("pdf");
    await loadScriptOnce("svg2pdf");
  }

  async function drawSvgVector(pdf, svg, box) {
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    const svgElement = doc.documentElement;
    if (pdf.svg) {
      await pdf.svg(svgElement, box);
      return;
    }
    if (window.svg2pdf) {
      await window.svg2pdf(svgElement, pdf, box);
      return;
    }
    throw new Error("Vector PDF renderer is unavailable.");
  }

  async function svgToPdfBytes(svg, options = {}) {
    await ensureVectorPdfLibraries();
    const { jsPDF } = window.jspdf;
    const { width, height } = svgSize(svg);
    if (options.forcePortrait) {
      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const pageWidth = 595.28;
      const pageHeight = 841.89;
      const margin = Math.abs(width - pageWidth) < 1 && Math.abs(height - pageHeight) < 1 ? 0 : 24;
      const scale = Math.min((pageWidth - margin * 2) / width, (pageHeight - margin * 2) / height);
      const imageWidth = width * scale;
      const imageHeight = height * scale;
      const x = (pageWidth - imageWidth) / 2;
      const y = (pageHeight - imageHeight) / 2;
      await drawSvgVector(pdf, svg, { x, y, width: imageWidth, height: imageHeight });
      return pdf.output("arraybuffer");
    }
    const pdf = new jsPDF({ orientation: width > height ? "landscape" : "portrait", unit: "pt", format: [width, height] });
    await drawSvgVector(pdf, svg, { x: 0, y: 0, width, height });
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

  function safeFilenamePart(value) {
    return String(value || "")
      .trim()
      .replace(/[\\/:*?"<>|]+/g, " ")
      .replace(/\s+/g, " ")
      .slice(0, 90) || "untitled";
  }

  function resultDate(result) {
    return String(result?.metadata?.timestamp || nowIso()).slice(0, 10);
  }

  function resultProjectName(result) {
    return safeFilenamePart(result?.metadata?.run_name || result?.metadata?.module_type || result?.module || "HC PlateScope");
  }

  function extensionForPath(path) {
    const name = String(path || "");
    const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
    return ext ? `.${ext}` : "";
  }

  function fileTypeForPath(path) {
    const name = String(path || "").split("/").pop().replace(/\.[^.]+$/, "").toLowerCase();
    const table = [
      [/combined_report/, "combined report"],
      [/grid_plots/, "grid plots"],
      [/ratio_heatmap|peak_distance_heatmap|heatmap/, "heatmap"],
      [/geco_peak_ratio/, "peak ratio"],
      [/luci_normalized/, "normalized table"],
      [/luci_peak_summary/, "peak summary"],
      [/lss_peak_top10/, "top10 table"],
      [/lss_summary/, "LSS summary"],
      [/anti_excitation_normalized/, "excitation normalized table"],
      [/anti_emission_normalized/, "emission normalized table"],
      [/anti_summary/, "ANTI summary"],
      [/standardized_by_well/, "standardized table"],
      [/run_metadata/, "metadata"],
      [/config_snapshot|config/, "config"],
      [/processing_log/, "processing log"],
    ];
    const hit = table.find(([pattern]) => pattern.test(name));
    return hit ? hit[1] : name.replace(/[_-]+/g, " ").trim() || "output";
  }

  function exportFilename(result, path, overrideType = "") {
    const type = safeFilenamePart(overrideType || fileTypeForPath(path));
    return `${resultDate(result)}-${resultProjectName(result)}-${type}${extensionForPath(path)}`;
  }

  function exportZipFilename(result, type = "outputs") {
    return `${resultDate(result)}-${resultProjectName(result)}-${safeFilenamePart(type)}.zip`;
  }

  async function buildOutputsZip(result) {
    await ensureZipLibrary();
    const zip = new JSZip();
    const tables = zip.folder("tables");
    const figures = zip.folder("figures");
    const report = zip.folder("report");
    for (const file of result.files) {
      const folder = file.path.startsWith("tables/") ? tables : file.path.startsWith("figures/") ? figures : file.path.startsWith("report/") ? report : zip;
      folder.file(exportFilename(result, file.path), file.bytes);
    }
    zip.file(exportFilename(result, "run_metadata.json"), JSON.stringify(result.metadata, null, 2));
    zip.file(exportFilename(result, "config_snapshot.yaml"), configToYaml(result.config));
    zip.file(exportFilename(result, "processing_log.txt"), result.log.join("\n"));
    return zip.generateAsync({ type: "blob" });
  }

  function resultDownloadFiles(result) {
    return [
      ...result.files,
      { path: "run_metadata.json", bytes: JSON.stringify(result.metadata, null, 2) },
      { path: "config_snapshot.yaml", bytes: configToYaml(result.config) },
      { path: "processing_log.txt", bytes: result.log.join("\n") },
    ];
  }

  function mimeForPath(path) {
    const ext = path.split(".").pop().toLowerCase();
    if (ext === "pdf") return "application/pdf";
    if (ext === "csv") return "text/csv";
    if (ext === "xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    if (ext === "json") return "application/json";
    if (ext === "yaml" || ext === "yml") return "text/yaml";
    if (ext === "txt") return "text/plain";
    if (ext === "svg") return "image/svg+xml";
    if (ext === "tif" || ext === "tiff") return "image/tiff";
    return "application/octet-stream";
  }

  async function addFigureFiles(files, basePath, svg) {
    const forcePortrait = basePath.startsWith("report/") && basePath.includes("combined_report");
    files.push({ path: `${basePath}.pdf`, bytes: await svgToPdfBytes(svg, { forcePortrait }), previewSvg: svg });
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
    const reportGrid = gridSvg({ title: is384 ? "GECO 384 paired spectra by well" : "GECO spectra by well", tables: [withCa, withoutCa], labels: ["with CA", "without CA"], wells, config, moduleKey: "geco", highlights, report: true });
    const heatSvg = heatmapSvg(heat, config, is384 ? "GECO 384 paired max(with CA) / max(without CA)" : "GECO max(with ca) / max(without ca)", "ratio");
    const reportSvg = combineReportSvg(is384 ? "GECO 384 paired spectra and peak ratio heatmap" : "GECO spectra and peak ratio heatmap", reportGrid, heatSvg);
    const files = [{ path: "tables/GECO_peak_ratio.xlsx", bytes: rowsToXlsxBytes(summary, "peak_ratio") }];
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
    const reportGrid = gridSvg({ title: "LUCI normalized spectra", tables: [norm], labels: ["LUCI"], wells, config, normalized: true, moduleKey: "luci", highlights, report: true });
    const heatSvg = heatmapSvg(heat, config, "LUCI 520/450 ratio", "ratio_520_450");
    const reportSvg = combineReportSvg("LUCI spectra and 520/450 ratio heatmap", reportGrid, heatSvg);
    const files = [
      { path: "tables/LUCI_normalized.xlsx", bytes: tableToXlsxBytes(norm, "normalized") },
      { path: "tables/LUCI_peak_summary.xlsx", bytes: rowsToXlsxBytes(summary, "peak_summary") },
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
    const reportGrid = gridSvg({ title: "LSS raw spectra", tables: [emission, excitation], labels: ["Emission", "Excitation"], wells, config, moduleKey: "lss", highlights, report: true });
    const heatSvg = heatmapSvg(heat, config, "LSS Stokes shift", "Stokes shift (nm)");
    const reportSvg = combineReportSvg("LSS raw spectra and Stokes shift heatmap", reportGrid, heatSvg);
    const columns = Object.keys(summary[0] || {});
    const files = [
      { path: "tables/LSS_summary.xlsx", bytes: rowsToXlsxBytes(summary, "LSS_summary") },
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
      { path: "tables/anti_summary.xlsx", bytes: rowsToXlsxBytes(summary, "anti_summary") },
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
      wells: result.metadata.common_well_count || result.wells?.length || result.metadata.recognition?.well_count || "n/a",
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
          <div class="hc-tags"><span class="hc-tag">Clean</span><span class="hc-tag">Reproducible</span><span class="hc-tag">Nature-style figures</span><span class="hc-tag">outputs/ history</span></div>
        </div>
        <div class="hc-plate-wrap"><div class="hc-plate-title">96-well layout</div><div class="hc-plate-grid">${plateDecoration()}</div></div>
      </div>
      ${section("Choose a workspace", "Start with a focused module. Each run saves inputs, figures, tables, metadata, logs, and config snapshots locally.")}
      <div class="feature-grid dashboard-row">${["wellid", "geco", "luci"].map(featureCard).join("")}</div>
      <div class="feature-grid dashboard-row">${["lss", "anti"].map(featureCard).join("")}
        <div class="feature-slot">
          <div class="hc-feature-card hc-accent-teal"><div class="hc-accent-line"></div><h3>Analysis History</h3><p>Browse local runs, metadata, reports, and restored settings.</p><div class="hc-tags"><span class="hc-tag">outputs/</span><span class="hc-tag">metadata</span><span class="hc-tag">settings</span></div></div>
          <button class="card-button" data-page="history">Open history</button>
          <button class="card-button" data-page="settings">Settings</button>
        </div>
      </div>
      <div class="two-col">
        <div>${section("Recent runs", "Latest local records from outputs/run_index.csv.")}${historyPreview()}</div>
        <div class="hc-info-card hc-success"><strong>Local-first analysis</strong><div>All analyses are executed locally in this browser.</div><div>Download outputs.zip to save inputs, figures, tables, metadata, logs, and config snapshots.</div></div>
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
    if (!state.history.length) return `<div class="hc-info-card"><strong>No history found</strong><div>No local runs yet.</div></div>`;
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
      <div class="hc-breadcrumb" data-back>Dashboard / ${esc(m.title)}</div>
      <div class="hc-module-header"><div><h1>${esc(m.title)}</h1><p>${esc(m.description)}</p><div class="hc-tags">${m.tags.map((tag) => `<span class="hc-tag">${esc(tag)}</span>`).join("")}</div></div><div class="hc-mode-pill"><span>Data mode</span><strong>${esc(m.data_mode)}</strong></div></div>
      <form id="runForm">${moduleBody(module)}</form>
      <section id="resultArea"></section>`;
    $("workspace").querySelector("[data-back]").addEventListener("click", renderDashboard);
    wireVisualSelects($("workspace"));
    wireModuleControls(module);
    $("runForm").addEventListener("submit", onRunSubmit);
    updateSide();
  }

  function step(n, title, subtitle = "") {
    return `<div class="hc-step-card"><div class="hc-step-kicker">Step ${n}</div><h2>${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ""}</div>`;
  }

  function fileField(id, label) {
    return `<div class="hc-upload-field"><label for="${id}">${esc(label)}</label><label class="hc-upload-box" for="${id}"><input id="${id}" type="file" accept=".xlsx,.xls,.csv"><span class="hc-upload-button">Upload</span><span class="hc-upload-hint">200MB per file • XLSX, XLS, CSV</span></label><div class="field-note" id="${id}_note"></div></div>`;
  }

  function helpDot(text = "Help") {
    return `<span class="hc-help-dot" title="${esc(text)}">?</span>`;
  }

  function controlField(label, inner, help = "") {
    return `<div class="hc-control-field"><div class="hc-control-label"><label>${esc(label)}</label>${help ? helpDot(help) : ""}</div>${inner}</div>`;
  }

  function plateControls(module, opts = {}) {
    const cfg = state.config;
    const manualOnly = opts.manualOnly;
    return `<div class="hc-streamlit-controls">
      ${controlField("Plate format", `<select id="${module}_plate">${manualOnly ? "" : `<option value="auto">Auto-detect</option>`}<option value="96">96-well</option><option value="384">384-well</option></select>`, "Choose the plate layout used by this analysis.")}
      ${controlField("Scatter plot arrangement", `<select id="${module}_spectra_mode"><option value="plate">Plate layout</option><option value="compact">Compact</option></select>`, "Arrange spectra by plate location or compact rows.")}
      <div class="hc-control-row two">
        ${controlField("Plots per row", `<input id="${module}_spectra_columns" type="number" min="4" max="24" value="${cfg.plotting.spectra_grid.columns}">`, "Number of small plots shown in each row.")}
        ${controlField("Rows per PDF page", `<input id="${module}_rows_page" type="number" min="2" max="16" value="${cfg.plotting.spectra_grid.rows_per_page}">`, "Number of plot rows placed on each PDF page.")}
      </div>
    </div>`;
  }

  function standardizationOption(module) {
    return `<label class="check standalone-check"><input id="${module}_auto" type="checkbox" checked> Auto-standardize uploaded files with Well ID Extractor</label>
      <div class="hc-info-card"><strong>Built-in Well ID Extractor</strong><div>Uploaded files are converted to Wavelength + well ID columns before analysis.</div><div>Plate format can be auto-detected or manually set to 96-well / 384-well.</div><div>This changes file preparation only; analysis formulas remain unchanged.</div></div>`;
  }

  function runNameControl(module) {
    const prefix = module === "wellid" ? "Well ID" : MODULES[module].title.split(" ")[0];
    return `<div><label>Project name for this run</label><input id="${module}_run_name" value="${esc(`${prefix} ${new Date().toISOString().slice(0, 10)}`)}"></div>`;
  }

  function commonControls(module, opts = {}) {
    const cfg = state.config;
    const includeHeatmap = opts.heatmap;
    const colorA = opts.colorA || "Primary color";
    const colorB = opts.colorB || "Secondary color";
    return `
      ${step(2, "Analysis settings", opts.subtitle || "Common controls stay visible; detailed plotting controls live in Advanced settings.")}
      <div class="hc-streamlit-controls analysis-controls">
        ${opts.includePlate === false ? "" : plateControls(module, { manualOnly: opts.manualOnly })}
        ${opts.fixedNormalize ? `<label class="check standalone-check"><input type="checkbox" checked disabled> ${esc(opts.fixedNormalize)}</label>` : ""}
        ${opts.fixedRaw ? `<label class="check standalone-check"><input type="checkbox" disabled> ${esc(opts.fixedRaw)}</label>` : ""}
        ${opts.beforePlot || ""}
        <div class="settings-checks">
          <label class="check"><input id="${module}_smooth" type="checkbox" disabled> Raw point-to-point lines</label>
          <label class="check"><input id="${module}_perwell" type="checkbox" checked> Per-well y-axis</label>
          ${includeHeatmap ? `<label class="check"><input id="${module}_heat_vals" type="checkbox" checked> Show heatmap values</label><label class="check"><input id="${module}_robust" type="checkbox" checked> Robust heatmap scale</label>` : ""}
        </div>
        <div class="settings-group">
          ${controlField("Marker size", `<input id="${module}_marker" type="range" min="0.5" max="8" step="0.5" value="${cfg.plot.marker_size}">`)}
          ${controlField("Line width", `<input id="${module}_line" type="range" min="0.2" max="3" step="0.1" value="${cfg.plot.line_width}">`)}
          ${controlField("Y-axis upper padding", `<input id="${module}_ypad" type="range" min="1" max="1.5" step="0.01" value="${cfg.plotting.y_axis.upper_padding}">`)}
        </div>
        <details><summary>Advanced settings</summary>
          <div class="settings-group">
            <div><label>Smoothing method</label><select id="${module}_smooth_method"><option value="savgol">savgol</option></select></div>
            <div><label>Window length</label><input id="${module}_window" type="range" min="3" max="51" step="2" value="${cfg.plot.smoothing.window_length}"></div>
            <div><label>Polynomial order</label><input id="${module}_poly" type="range" min="1" max="5" value="${cfg.plot.smoothing.polyorder}"></div>
          </div>
          <div class="settings-group">
            <div><label>Marker alpha</label><input id="${module}_malpha" type="range" min="0.1" max="1" step="0.05" value="${cfg.plot.marker_alpha}"></div>
            <div><label>Line alpha</label><input id="${module}_lalpha" type="range" min="0.1" max="1" step="0.05" value="${cfg.plot.line_alpha}"></div>
            <label class="check"><input id="${module}_nice" type="checkbox" checked> Nice rounding enabled</label>
          </div>
          <div class="settings-group color-settings-group">
            <div><label>${esc(colorA)}</label><input id="${module}_primary" type="color" value="${cfg.plotting.colors.primary}"></div>
            <div><label>${esc(colorB)}</label><input id="${module}_secondary" type="color" value="${cfg.plotting.colors.secondary}"></div>
            ${includeHeatmap ? `<div><label>Heatmap colormap</label>${paletteSelect(`${module}_cmap`, cfg.plotting.colors.heatmap)}</div>${["geco", "luci"].includes(module) ? `<div><label>Ratio badge color</label><input id="${module}_ratio_badge" type="color" value="${module === "luci" ? cfg.plotting.badges.luci_ratio : cfg.plotting.badges.geco_ratio}"></div>` : ""}<div><label>Low percentile</label><input id="${module}_robust_low" type="number" min="0" max="20" value="5"></div><div><label>High percentile</label><input id="${module}_robust_high" type="number" min="80" max="100" value="95"></div>` : ""}
          </div>
        </details>
        <div class="settings-group single">${controlField("Project name for this run", `<input id="${module}_run_name" value="${esc(`${module === "wellid" ? "Well ID" : MODULES[module].title.split(" ")[0]} ${new Date().toISOString().slice(0, 10)}`)}">`)}</div>
      </div>`;
  }

  function wellIdControls() {
    return `
      ${step(2, "Detection settings", "The extractor recognizes common wavelength columns and 96/384-well IDs.")}
      <div class="hc-streamlit-controls">
        <div class="grid four">
          ${controlField("Plate format", `<select id="wellid_plate"><option value="auto">Auto-detect</option><option value="96">96-well</option><option value="384">384-well</option></select>`)}
          ${controlField("Well ID pattern", `<input value="A01-H12 or A01-P24" disabled>`)}
          <label class="check"><input type="checkbox" checked disabled> Auto-detect wavelength column</label>
          ${controlField("Manual wavelength column name", `<input placeholder="Optional" disabled>`)}
        </div>
        <div class="grid two">
          ${controlField("Output file format", `<select disabled><option>xlsx</option></select>`)}
          ${controlField("Project name for this run", `<input id="wellid_run_name" value="${esc(`Well ID ${new Date().toISOString().slice(0, 10)}`)}">`)}
        </div>
      </div>`;
  }

  function moduleBody(module) {
    if (module === "wellid") {
      return `${step(1, "Upload raw file", "Supported formats: .xlsx, .xls, .csv.")}
        <div class="hc-upload-row single">${fileField("wellid_upload", "Upload Excel or CSV file")}</div>
        ${wellIdControls()}
        ${runStep("Run Well ID Extraction", "Upload one raw Excel or CSV file before running.")}`;
    }
    if (module === "geco") {
      return `${step(1, "Upload files", "Choose 96-well two-file GECO or 384-well single-file adjacent-pair GECO.")}
        ${plateControls("geco", { manualOnly: true })}<div id="gecoFiles"></div>${standardizationOption("geco")}
        ${commonControls("geco", { includePlate: false, heatmap: true, colorA: "Color with CA", colorB: "Color without CA" })}
        ${runStep("Run GECO Analysis", "Upload both with-CA and without-CA tables before running.")}`;
    }
    if (module === "luci") {
      return `${step(1, "Upload file", "Upload a raw reader export or a standardized LUCI well-by-column table.")}
        <div class="hc-upload-row single">${fileField("luci_upload", "Upload LUCI table")}</div>${standardizationOption("luci")}
        ${commonControls("luci", { heatmap: true, subtitle: "Peak windows are shown here because they affect the LUCI ratio.", fixedNormalize: "Normalize by column maximum", beforePlot: `<div class="hc-control-row two">${controlField("450 nm peak window", `<input id="luci_450" value="430,470">`)}${controlField("520 nm peak window", `<input id="luci_520" value="500,540">`)}</div>` })}
        ${runStep("Run LUCI Analysis", "Upload one LUCI table before running.")}`;
    }
    if (module === "lss") {
      return `${step(1, "Upload files", "Upload Excitation and Emission tables. LSS always uses raw signal values.")}
        <div class="hc-upload-row two">${fileField("lss_excitation", "Upload Excitation table")}${fileField("lss_emission", "Upload Emission table")}</div>${standardizationOption("lss")}
        ${commonControls("lss", { heatmap: true, colorA: "Emission color", colorB: "Excitation color", fixedRaw: "Normalize data" })}
        ${runStep("Run LSS Analysis", "Upload both Excitation and Emission tables before running.")}`;
    }
    return `${step(1, "Upload files", "Upload Excitation and Emission tables. Each signal is normalized separately.")}
      <div class="hc-upload-row two">${fileField("anti_excitation", "Upload Excitation table")}${fileField("anti_emission", "Upload Emission table")}</div>${standardizationOption("anti")}
      ${commonControls("anti", { heatmap: false, colorA: "Excitation color", colorB: "Emission color", fixedNormalize: "Normalize by column maximum" })}
      ${runStep("Run ANTI Analysis", "Upload both Excitation and Emission tables before running.")}`;
  }

  function runStep(label, helpText) {
    return `${step(3, "Run analysis")}<div class="panel"><button class="primary" id="runSubmitButton" type="submit" disabled>${esc(label)}</button><div class="hc-info-card hc-warning" id="readyCheck"><strong>Ready check</strong><div>${esc(helpText)}</div></div></div>`;
  }

  function wireModuleControls(module) {
    const plate = $(`${module}_plate`);
    if (plate) {
      plate.value = module === "geco" ? "96" : String(plateFormatFromConfig(state.config));
      plate.addEventListener("change", () => {
        if (module === "geco") renderGecoFiles();
        updateReadyState(module);
      });
    }
    if (module === "geco") renderGecoFiles();
    document.querySelectorAll("input[type=file]").forEach((input) => initFileUpload(input, module));
    updateReadyState(module);
  }

  function initFileUpload(input, module) {
    if (!input || input.dataset.bound === "1") return;
    input.dataset.bound = "1";
    const box = input.closest(".hc-upload-box");
    const onFileChange = () => {
      const note = $(`${input.id}_note`);
      if (note && input.files[0]) note.innerHTML = `<span class="hc-file-pill"><strong>${esc(input.files[0].name)}</strong><span>${(input.files[0].size / 1024).toFixed(1)} KB</span><span>${esc(input.files[0].name.split(".").pop().toUpperCase())}</span></span>`;
      updateReadyState(module);
    };
    input.addEventListener("change", onFileChange);
    if (!box) return;
    ["dragenter", "dragover"].forEach((type) => box.addEventListener(type, (event) => {
      event.preventDefault();
      event.stopPropagation();
      box.classList.add("is-dragover");
    }));
    ["dragleave", "drop"].forEach((type) => box.addEventListener(type, (event) => {
      event.preventDefault();
      event.stopPropagation();
      box.classList.remove("is-dragover");
    }));
    box.addEventListener("drop", (event) => {
      const files = event.dataTransfer?.files;
      if (!files || !files.length) return;
      try {
        const transfer = new DataTransfer();
        transfer.items.add(files[0]);
        input.files = transfer.files;
      } catch {
        input.files = files;
      }
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  function renderGecoFiles() {
    const is384 = $("geco_plate")?.value === "384";
    $("gecoFiles").innerHTML = is384
      ? `<div class="hc-upload-row single">${fileField("geco_paired", "Upload 384-well paired GECO table")}</div><div class="hc-info-card"><strong>GECO 384 pairing rule</strong><div>Upload one table with A01-P24 well columns.</div><div>Odd columns are without CA; adjacent even columns are with CA.</div></div>`
      : `<div class="hc-upload-row two">${fileField("geco_with", "Upload with CA table")}${fileField("geco_without", "Upload without CA table")}</div>`;
    $("gecoFiles").querySelectorAll("input[type=file]").forEach((input) => initFileUpload(input, "geco"));
  }

  function updateReadyState(module) {
    const button = $("runSubmitButton");
    if (!button) return;
    const is384 = $("geco_plate")?.value === "384";
    const ready = module === "wellid" ? Boolean(fileInput("wellid_upload"))
      : module === "geco" ? (is384 ? Boolean(fileInput("geco_paired")) : Boolean(fileInput("geco_with") && fileInput("geco_without")))
      : module === "luci" ? Boolean(fileInput("luci_upload"))
      : module === "lss" ? Boolean(fileInput("lss_excitation") && fileInput("lss_emission"))
      : Boolean(fileInput("anti_excitation") && fileInput("anti_emission"));
    button.disabled = !ready;
    if ($("readyCheck")) {
      $("readyCheck").classList.toggle("hidden", ready);
      if (module === "geco") $("readyCheck").innerHTML = `<strong>Ready check</strong><div>${is384 ? "Upload one 384-well paired table before running." : "Upload both with-CA and without-CA tables before running."}</div>`;
    }
  }


  function moduleControl(module, suffix) {
    return $(`${module}_${suffix}`) || $(`runForm`)?.querySelector(`[id$="_${suffix}"]`);
  }

  function numberControlValue(module, suffix, fallback) {
    const control = moduleControl(module, suffix);
    const value = Number(control?.value);
    return Number.isFinite(value) ? value : fallback;
  }

  function formConfig(module) {
    const cfg = deepCopy(state.config);
    cfg.run_name = moduleControl(module, "run_name")?.value?.trim() || "";
    cfg.plate.format = moduleControl(module, "plate")?.value === "auto" ? "auto" : Number(moduleControl(module, "plate")?.value || 96);
    cfg.plotting.spectra_grid.mode = moduleControl(module, "spectra_mode")?.value || "compact";
    cfg.plotting.spectra_grid.columns = numberControlValue(module, "spectra_columns", cfg.plotting.spectra_grid.columns || 12);
    cfg.plotting.spectra_grid.rows_per_page = numberControlValue(module, "rows_page", cfg.plotting.spectra_grid.rows_per_page || 8);
    cfg.plot.smoothing.enabled = false;
    cfg.plot.marker_size = numberControlValue(module, "marker", cfg.plot.marker_size || 1);
    cfg.plot.line_width = numberControlValue(module, "line", cfg.plot.line_width || 1);
    cfg.plotting.y_axis.per_well = Boolean(moduleControl(module, "perwell")?.checked);
    cfg.plotting.y_axis.upper_padding = numberControlValue(module, "ypad", cfg.plotting.y_axis.upper_padding || 1.1);
    cfg.plot.smoothing.window_length = numberControlValue(module, "window", cfg.plot.smoothing.window_length || 9);
    cfg.plot.smoothing.polyorder = numberControlValue(module, "poly", cfg.plot.smoothing.polyorder || 3);
    cfg.plot.marker_alpha = numberControlValue(module, "malpha", cfg.plot.marker_alpha || 0.55);
    cfg.plot.line_alpha = numberControlValue(module, "lalpha", cfg.plot.line_alpha || 0.95);
    cfg.plotting.y_axis.rounding_mode = Boolean(moduleControl(module, "nice")?.checked) ? "nice_round" : "raw";
    cfg.plotting.colors.primary = moduleControl(module, "primary")?.value || cfg.plotting.colors.primary;
    cfg.plotting.colors.secondary = moduleControl(module, "secondary")?.value || cfg.plotting.colors.secondary;
    if (moduleControl(module, "heat_vals")) cfg.plotting.heatmap.show_values = Boolean(moduleControl(module, "heat_vals")?.checked);
    if (moduleControl(module, "robust")) cfg.plotting.heatmap.robust_scaling = Boolean(moduleControl(module, "robust")?.checked);
    if (moduleControl(module, "cmap")) cfg.plotting.colors.heatmap = moduleControl(module, "cmap").value;
    if (moduleControl(module, "ratio_badge")) {
      if (module === "luci") cfg.plotting.badges.luci_ratio = moduleControl(module, "ratio_badge").value;
      else cfg.plotting.badges.geco_ratio = moduleControl(module, "ratio_badge").value;
    }
    if (moduleControl(module, "robust_low")) cfg.plotting.heatmap.robust_lower_percentile = numberControlValue(module, "robust_low", 5);
    if (moduleControl(module, "robust_high")) cfg.plotting.heatmap.robust_upper_percentile = numberControlValue(module, "robust_high", 95);
    if (module === "luci") {
      cfg.peaks.luci_450_window = parseWindow(moduleControl(module, "450")?.value, [430, 470]);
      cfg.peaks.luci_520_window = parseWindow(moduleControl(module, "520")?.value, [500, 540]);
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
      if (error?.showAlert) window.alert(error.message);
      area.innerHTML = `<div class="hc-info-card hc-error"><strong>${esc(error.message)}</strong>${state.debug ? `<pre class="log">${esc(error.stack)}</pre>` : ""}</div>`;
    }
  }

  function reportPreviewHtml(report) {
    const svg = report.previewSvg || `<div class="hc-info-card hc-warning">Report preview is unavailable. Please use the download button.</div>`;
    return `<div class="panel pdf-preview"><div class="pdf-toolbar"><h2>Report preview</h2><div class="pdf-zoom-controls"><button type="button" id="pdfZoomOut" title="Zoom out">−</button><button type="button" id="pdfZoomReset" title="Reset zoom">100%</button><button type="button" id="pdfZoomIn" title="Zoom in">+</button><button type="button" id="downloadReportPdf">Download report PDF</button></div></div><div class="pdf-frame-shell" id="reportPreviewShell" tabindex="0" aria-label="Report preview. Use Command plus and Command minus to zoom the report preview only."><div class="pdf-frame" id="reportPreviewFrame">${svg}</div></div></div>`;
  }

  function wireReportPreview(result, report) {
    const shell = $("reportPreviewShell");
    const frame = $("reportPreviewFrame");
    const setZoom = (value) => {
      state.reportZoom = Math.min(3, Math.max(0.45, Number(value) || 1));
      if (frame) frame.style.setProperty("--preview-zoom", state.reportZoom);
      if ($("pdfZoomReset")) $("pdfZoomReset").textContent = `${Math.round(state.reportZoom * 100)}%`;
    };
    setZoom(state.reportZoom || 1);
    $("pdfZoomOut")?.addEventListener("click", () => setZoom(state.reportZoom - 0.15));
    $("pdfZoomIn")?.addEventListener("click", () => setZoom(state.reportZoom + 0.15));
    $("pdfZoomReset")?.addEventListener("click", () => setZoom(1));
    $("downloadReportPdf")?.addEventListener("click", () => downloadBlob(report.bytes, exportFilename(result, report.path), "application/pdf"));
    shell?.addEventListener("click", () => shell.focus());
    shell?.addEventListener("keydown", (event) => {
      const key = event.key;
      if (!(event.metaKey || event.ctrlKey) || !["+", "=", "-", "_", "0"].includes(key)) return;
      event.preventDefault();
      event.stopPropagation();
      if (key === "0") setZoom(1);
      else if (key === "-" || key === "_") setZoom(state.reportZoom - 0.15);
      else setZoom(state.reportZoom + 0.15);
    });
  }

  function renderResult(result) {
    const area = $("resultArea");
    const report = result.files.find((file) => file.path.includes("combined_report") && file.path.endsWith(".pdf"));
    const downloads = resultDownloadFiles(result);
    const summaryName = result.module === "wellid" ? "Preview table" : result.module === "geco" ? "Peak ratio preview" : result.module === "luci" ? "Peak summary preview" : result.module === "lss" ? "LSS summary preview" : "Normalization summary preview";
    area.innerHTML = `
      ${step(4, "Results & downloads", "Inspect summary, warnings, previews, and local output files.")}
      ${report ? reportPreviewHtml(report) : ""}
      <div class="panel">
        <div class="hc-info-card hc-success"><strong>Analysis complete: ${esc(result.id)}</strong></div>
        ${kpis(result)}
        ${result.warnings.length ? `<div class="hc-info-card hc-warning"><strong>Warnings</strong>${result.warnings.map((w) => `<div>${esc(w)}</div>`).join("")}</div>` : ""}
        <div class="actions"><button class="primary" id="downloadZip" type="button">Download ${esc(exportZipFilename(result))}</button></div>
        <div class="download-grid">${downloads.map((file, idx) => `<button class="download-file" type="button" data-download-index="${idx}"><span>Download</span><strong>${esc(exportFilename(result, file.path))}</strong><small>${esc(file.path)}</small></button>`).join("")}</div>
      </div>
      <div class="panel"><h2>${esc(summaryName)}</h2>${tableHtml(result.summary.slice(0, 100))}</div>
      ${selectedWellPanel(result)}
    `;
    if (report) wireReportPreview(result, report);
    $("downloadZip").addEventListener("click", async () => downloadBlob(await buildOutputsZip(result), exportZipFilename(result), "application/zip"));
    area.querySelectorAll("[data-download-index]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const file = downloads[Number(btn.dataset.downloadIndex)];
        downloadBlob(file.bytes, exportFilename(result, file.path), mimeForPath(file.path));
      });
    });
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
      <div class="grid three"><div><label>Recommend wells by</label><select id="wellMetric">${metrics.map((m) => `<option ${m === metric ? "selected" : ""}>${esc(m)}</option>`).join("")}</select></div><label class="check"><input id="wellSmooth" type="checkbox" disabled> Raw point-to-point lines</label><div><label>TIF resolution</label><select id="wellDpi"><option>300</option><option selected>600</option><option>1200</option></select></div></div>
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
    const smooth = false;
    const windowLength = Number($("wellWindow").value || 11);
    return selected.map((well) => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="520" viewBox="0 0 760 520"><rect width="100%" height="100%" fill="white"/><text x="380" y="32" text-anchor="middle" font-size="20" font-weight="700">${esc(MODULES[result.module].title)} ${esc(well)}</text>${wellPanelSvg({ tables: series.tables, labels: series.labels, colors: [result.config.plotting.colors.primary, result.config.plotting.colors.secondary], well, title: well, x: 52, y: 60, width: 656, height: 390, smooth, windowLength, config: result.config, moduleKey: result.module, normalized: ["luci", "anti"].includes(result.module) })}<text x="380" y="500" text-anchor="middle" font-size="11" fill="#444">Wavelength (nm)</text></svg>`;
      return { well, svg };
    });
  }

  async function downloadSelectedPlots(result, format) {
    await ensureZipLibrary();
    const zip = new JSZip();
    const dpi = Number($("wellDpi").value || 600);
    for (const item of selectedWellSvgs(result)) {
      if (format === "svg") zip.file(exportFilename(result, `${item.well}.svg`, `selected well ${item.well} plot`), item.svg);
      if (format === "pdf") zip.file(exportFilename(result, `${item.well}.pdf`, `selected well ${item.well} plot`), await svgToPdfBytes(item.svg));
      if (format === "tif") zip.file(exportFilename(result, `${item.well}.tif`, `selected well ${item.well} plot`), await svgToTiffBytes(item.svg, dpi));
    }
    downloadBlob(await zip.generateAsync({ type: "blob" }), exportZipFilename(result, `selected well plots ${format}`), "application/zip");
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
      zip.file(exportFilename(result, `${well}.xlsx`, `selected well ${well} plot data`), rowsToXlsxBytes(rows, well));
    }
    downloadBlob(await zip.generateAsync({ type: "blob" }), exportZipFilename(result, "selected well plot data"), "application/zip");
  }

  function renderHistory() {
    $("dashboard").classList.add("hidden");
    $("workspace").classList.remove("hidden");
    $("currentWorkspace").textContent = "Current workspace: Analysis History";
    const modules = [...new Set(state.history.map((row) => row.module_type).filter(Boolean))].sort();
    $("workspace").innerHTML = `<div class="hc-breadcrumb" data-back>Dashboard / Analysis History</div><div class="hc-module-header"><div><h1>Analysis History</h1><p>Browse previous analysis runs stored in the local outputs folder.</p><div class="hc-tags"><span class="hc-tag">Local records</span><span class="hc-tag">Metadata</span><span class="hc-tag">Reproducibility</span></div></div><div class="hc-mode-pill"><span>Data mode</span><strong>outputs/run_index.csv</strong></div></div>
      ${state.history.length ? `${section("Filters")}<div class="panel grid three"><div><label>Module type</label><select id="histModule"><option>All</option>${modules.map((m) => `<option>${esc(String(m).toLowerCase() === "anti" ? "ANTI" : m)}</option>`).join("")}</select></div><div><label>Sort by time</label><select id="histSort"><option>Newest first</option><option>Oldest first</option></select></div><div><label>Search project name, run_id, or input file name</label><input id="histSearch"></div></div><div id="historyRuns"></div>` : `<div class="hc-info-card"><strong>No history found</strong><div>outputs/run_index.csv does not exist yet.</div></div>`}`;
    $("workspace").querySelector("[data-back]").addEventListener("click", renderDashboard);
    if ($("historyRuns")) {
      const renderRuns = () => {
        const moduleFilter = $("histModule").value;
        const search = $("histSearch").value.trim().toLowerCase();
        const asc = $("histSort").value === "Oldest first";
        let rows = [...state.history];
        if (moduleFilter !== "All") rows = rows.filter((row) => String(row.module_type).toLowerCase() === moduleFilter.toLowerCase());
        if (search) rows = rows.filter((row) => [row.run_id, row.run_name, row.input_files].some((v) => String(v || "").toLowerCase().includes(search)));
        rows.sort((a, b) => asc ? String(a.timestamp).localeCompare(String(b.timestamp)) : String(b.timestamp).localeCompare(String(a.timestamp)));
        $("historyRuns").innerHTML = `${section("Runs", `${rows.length} record(s) shown.`)}${rows.map((row, idx) => `<div class="hc-history-card"><div><span class="hc-tag">${esc(row.module_type || "Run")}</span><h3>${esc(row.run_id || "")}</h3><p>${esc(row.timestamp || "")}</p></div><div><p><strong>Inputs</strong><br>${esc(row.input_files || "")}</p><p><strong>Wells</strong> ${esc(row.wells || "n/a")} · <strong>Status</strong> complete · <strong>Warnings</strong> ${esc(row.warnings || 0)}</p></div></div><div class="grid four history-actions"><button disabled>Open report</button><button type="button" data-folder="${idx}">Open folder</button><button type="button" data-meta="${idx}">View metadata</button><button type="button" data-restore="${idx}">Restore settings</button></div><div id="histExtra${idx}"></div>`).join("")}`;
        $("historyRuns").querySelectorAll("[data-folder]").forEach((btn) => btn.addEventListener("click", () => { $(`histExtra${btn.dataset.folder}`).innerHTML = `<div class="hc-file-pill">Run folder <code>${esc(state.history[Number(btn.dataset.folder)].run_id || "")}</code></div>`; }));
        $("historyRuns").querySelectorAll("[data-meta]").forEach((btn) => btn.addEventListener("click", () => { $(`histExtra${btn.dataset.meta}`).innerHTML = `<pre class="log">${esc(JSON.stringify(state.history[Number(btn.dataset.meta)], null, 2))}</pre>`; }));
        $("historyRuns").querySelectorAll("[data-restore]").forEach((btn) => btn.addEventListener("click", () => { renderSettings(); }));
      };
      ["histModule", "histSort", "histSearch"].forEach((id) => $(id).addEventListener(id === "histSearch" ? "input" : "change", renderRuns));
      renderRuns();
    }
  }

  function renderSettings() {
    const cfg = state.config;
    $("dashboard").classList.add("hidden");
    $("workspace").classList.remove("hidden");
    $("currentWorkspace").textContent = "Current workspace: Settings";
    $("workspace").innerHTML = `<div class="hc-breadcrumb" data-back>Dashboard / Settings</div><div class="hc-module-header"><div><h1>Settings</h1><p>Set global default plotting, smoothing, output, and history parameters.</p><div class="hc-tags"><span class="hc-tag">Defaults</span><span class="hc-tag">config.yaml</span><span class="hc-tag">Local</span></div></div><div class="hc-mode-pill"><span>Data mode</span><strong>Session settings</strong></div></div>
      <div class="tabs" id="settingsTabs">${["Plot style", "Smoothing", "Y-axis", "Output", "History", "Import / Export"].map((tab, i) => `<button type="button" class="${i === 0 ? "active" : ""}" data-tab="${i}">${esc(tab)}</button>`).join("")}</div>
      <div class="panel tab-panel" data-panel="0"><div class="grid three"><div><label>Marker size</label><input id="set_marker" type="range" min="0.5" max="8" step="0.5" value="${cfg.plot.marker_size}"></div><div><label>Line width</label><input id="set_line" type="range" min="0.2" max="3" step="0.1" value="${cfg.plot.line_width}"></div><div><label>Font family</label><input id="set_font" value="${esc(cfg.plotting.font_family || "Arial")}"></div><div><label>Marker alpha</label><input id="set_malpha" type="range" min="0.1" max="1" step="0.05" value="${cfg.plot.marker_alpha}"></div><div><label>Line alpha</label><input id="set_lalpha" type="range" min="0.1" max="1" step="0.05" value="${cfg.plot.line_alpha}"></div><div><label>Default heatmap palette</label>${paletteSelect("set_cmap", cfg.plotting.colors.heatmap)}</div></div></div>
      <div class="panel tab-panel hidden" data-panel="1"><label class="check"><input id="set_smooth" type="checkbox" ${cfg.plot.smoothing.enabled ? "checked" : ""}> Enabled</label><div class="grid two"><div><label>Window length</label><input id="set_window" type="range" min="3" max="51" step="2" value="${cfg.plot.smoothing.window_length}"></div><div><label>Polyorder</label><input id="set_poly" type="range" min="1" max="5" value="${cfg.plot.smoothing.polyorder}"></div></div></div>
      <div class="panel tab-panel hidden" data-panel="2"><label class="check"><input id="set_perwell" type="checkbox" ${cfg.plotting.y_axis.per_well ? "checked" : ""}> Per-well y-axis</label><div><label>Upper padding</label><input id="set_ypad" type="range" min="1" max="1.5" step="0.01" value="${cfg.plotting.y_axis.upper_padding}"></div><label class="check"><input id="set_nice" type="checkbox" ${cfg.plotting.y_axis.rounding_mode === "nice_round" ? "checked" : ""}> Nice rounding</label></div>
      <div class="panel tab-panel hidden" data-panel="3"><div class="grid two"><div><label>Output root folder</label><input id="set_output_root" value="${esc(cfg.output.base_dir)}"></div><div><label>Run index path</label><input id="set_run_index" value="${esc(cfg.output.run_index)}"></div></div><label class="check"><input type="checkbox" checked disabled> Save metadata</label><label class="check"><input type="checkbox" checked disabled> Save config snapshot</label><label class="check"><input type="checkbox" checked disabled> Save processing log</label></div>
      <div class="panel tab-panel hidden" data-panel="4"><label class="check"><input id="set_show_recent" type="checkbox" ${cfg.ui.show_recent_runs ? "checked" : ""}> Show recent runs on dashboard</label><div><label>Number of recent runs</label><input id="set_recent" type="range" min="3" max="10" value="${cfg.ui.recent_runs}"></div></div>
      <div class="panel tab-panel hidden" data-panel="5"><button id="exportConfig">Export config.yaml</button><input id="importConfig" type="file" accept=".yaml,.yml,.json"><button id="loadConfig" type="button">Load imported config</button></div>
      <div class="actions"><button class="primary" id="saveSettings">Save settings</button><button id="resetSettings">Reset to config.yaml</button></div>`;
    wireVisualSelects($("workspace"));
    $("workspace").querySelector("[data-back]").addEventListener("click", renderDashboard);
    $("settingsTabs").querySelectorAll("[data-tab]").forEach((btn) => btn.addEventListener("click", () => {
      $("settingsTabs").querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === btn));
      document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.toggle("hidden", panel.dataset.panel !== btn.dataset.tab));
    }));
    $("saveSettings").addEventListener("click", () => {
      cfg.plot.marker_size = Number($("set_marker").value);
      cfg.plot.line_width = Number($("set_line").value);
      cfg.plot.marker_alpha = Number($("set_malpha").value);
      cfg.plot.line_alpha = Number($("set_lalpha").value);
      cfg.plotting.font_family = $("set_font").value;
      cfg.plotting.colors.heatmap = $("set_cmap").value;
      cfg.plot.smoothing.enabled = getChecked("set_smooth");
      cfg.plot.smoothing.window_length = Number($("set_window").value);
      cfg.plot.smoothing.polyorder = Number($("set_poly").value);
      cfg.plotting.y_axis.per_well = getChecked("set_perwell");
      cfg.plotting.y_axis.upper_padding = Number($("set_ypad").value);
      cfg.plotting.y_axis.rounding_mode = getChecked("set_nice") ? "nice_round" : "raw";
      cfg.output.base_dir = $("set_output_root").value;
      cfg.output.run_index = $("set_run_index").value;
      cfg.ui.show_recent_runs = getChecked("set_show_recent");
      cfg.ui.recent_runs = Number($("set_recent").value);
      saveConfig();
      renderSettings();
    });
    $("resetSettings").addEventListener("click", () => {
      state.config = deepCopy(DEFAULT_CONFIG);
      saveConfig();
      renderSettings();
    });
    $("exportConfig").addEventListener("click", () => downloadBlob(new TextEncoder().encode(configToYaml(cfg)), `${nowIso().slice(0, 10)}-HC PlateScope-config.yaml`, "text/yaml"));
    $("loadConfig").addEventListener("click", async () => {
      const file = $("importConfig").files[0];
      if (file) {
        const text = await file.text();
        state.config = mergeDeep(deepCopy(DEFAULT_CONFIG), file.name.endsWith(".json") ? JSON.parse(text) : parseSimpleYaml(text));
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
