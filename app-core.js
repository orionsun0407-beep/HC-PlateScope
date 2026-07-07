    const PY_FILE_PATHS = ['plate_processor/__init__.py', 'plate_processor/analysis_common.py', 'plate_processor/anti_analysis.py', 'plate_processor/io.py', 'plate_processor/logging_utils.py', 'plate_processor/lss_analysis.py', 'plate_processor/peak_analysis.py', 'plate_processor/plotting.py', 'plate_processor/preprocessing.py', 'plate_processor/report.py', 'plate_processor/selected_well_plots.py', 'plate_processor/utils.py'];
    const CONFIG_PATH = "config.yaml";
    const BASE = "/home/pyodide/hc_platescope";
    const MODULES = {
      wellid: {
        title: "Well ID Extractor",
        desc: "将原始读板仪文件转换为标准 well-by-column 表。",
        tags: ["标准化", "Well ID", "Excel 导出"],
        accent: "teal",
        mode: "原始导出转标准表",
        uploadHelp: "支持格式：.xlsx、.xls、.csv。",
        files: [["input", "上传 Excel 或 CSV 文件"]],
      },
      geco: {
        title: "GECO Analysis",
        desc: "比较 with-CA 与 without-CA 光谱，并生成峰值比值热图。",
        tags: ["原始光谱", "峰值比值", "热图"],
        accent: "blue",
        mode: "原始光谱，比值热图",
        uploadHelp: "选择 96 孔双文件 GECO，或 384 孔单文件相邻配对 GECO。",
        files: [["with_ca", "上传 with CA 表"], ["without_ca", "上传 without CA 表"]],
      },
      luci: {
        title: "LUCI Analysis",
        desc: "归一化光谱，识别 450/520 nm 峰，并计算发射比值。",
        tags: ["归一化", "峰识别", "520:450"],
        accent: "orange",
        mode: "归一化光谱，450/520 峰识别",
        uploadHelp: "上传原始读板仪导出文件，或标准化后的 LUCI well-by-column 表。",
        files: [["input", "上传 LUCI 表"]],
      },
      lss: {
        title: "LSS Analysis",
        desc: "对每个孔叠加原始激发与发射光谱，不进行归一化。",
        tags: ["原始叠图", "激发", "发射"],
        accent: "purple",
        mode: "原始光谱，不归一化",
        uploadHelp: "上传 Excitation 与 Emission 两张表。LSS 始终使用原始信号值。",
        files: [["emission", "上传 Emission 表"], ["excitation", "上传 Excitation 表"]],
      },
      anti: {
        title: "ANTI Analysis",
        desc: "分别归一化激发与发射光谱，并在每个孔中叠加两路信号。",
        tags: ["归一化叠图", "激发", "发射"],
        accent: "teal",
        mode: "激发/发射分别归一化叠图",
        uploadHelp: "上传 Excitation 与 Emission 两张表。两路信号会分别归一化。",
        files: [["emission", "上传 Emission 表"], ["excitation", "上传 Excitation 表"]],
      },
    };

    let activeModule = "wellid";
    let currentView = "dashboard";
    let pyodide = null;
    let latestZip = null;
    let latestWellPlotInfo = null;

    const $ = (id) => document.getElementById(id);

    function b64ToBytes(value) {
      const binary = atob(value);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      return bytes;
    }

    function setStatus(text) {
      $("kernelStatus").innerHTML = "<strong>计算内核</strong><br>" + text;
    }

    function setNotice(text, isError = false) {
      const notice = $("runNotice");
      notice.textContent = text;
      notice.classList.toggle("error", isError);
    }

    function tagHtml(tags) {
      return tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
    }

    function plateDecoration() {
      const h = new Set(["1,1","2,1","3,1","4,1","5,1","6,1","1,4","2,4","3,4","4,4","5,4","6,4","3,2","3,3","4,2","4,3"]);
      const c = new Set(["1,7","1,8","1,9","1,10","2,6","3,6","4,6","5,6","6,7","6,8","6,9","6,10"]);
      let out = "";
      for (let row = 0; row < 8; row += 1) {
        for (let col = 0; col < 12; col += 1) {
          const key = `${row},${col}`;
          const cls = h.has(key) || c.has(key) ? "blue" : ((row + col) % 5 === 0 ? "warm" : "");
          out += `<span class="well ${cls}"></span>`;
        }
      }
      return out;
    }

    function openDashboard() {
      currentView = "dashboard";
      $("dashboardView").classList.remove("hidden");
      $("workspaceView").classList.add("hidden");
      $("dashboardBtn").classList.add("active");
      renderNav();
    }

    function openModule(key) {
      activeModule = key;
      currentView = "module";
      latestZip = null;
      $("downloadBtn").disabled = true;
      $("dashboardView").classList.add("hidden");
      $("workspaceView").classList.remove("hidden");
      $("dashboardBtn").classList.remove("active");
      render();
    }
