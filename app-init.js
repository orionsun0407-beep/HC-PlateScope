    async function initPython() {
      if (pyodide) return;
      $("initBtn").disabled = true;
      setStatus("加载 Pyodide...");
      pyodide = await loadPyodide();
      setStatus("加载科学计算包...");
      await pyodide.loadPackage(["numpy", "pandas", "matplotlib", "scipy", "pyyaml", "micropip"]);
      setStatus("加载 Excel 支持...");
      await pyodide.runPythonAsync("import micropip\nawait micropip.install(['openpyxl', 'xlrd'])");
      setStatus("写入 HC PlateScope 分析模块...");
      pyodide.FS.mkdirTree(`${BASE}/plate_processor`);
      pyodide.FS.mkdirTree(`${BASE}/browser_inputs`);
      pyodide.FS.mkdirTree(`${BASE}/outputs`);
      for (const path of PY_FILE_PATHS) {
        const response = await fetch(assetUrl(path), { cache: "no-store" });
        if (!response.ok) throw new Error(`无法加载分析核心文件：${path}`);
        pyodide.FS.writeFile(`${BASE}/${path}`, await response.text(), { encoding: "utf8" });
      }
      const configResponse = await fetch(assetUrl(CONFIG_PATH), { cache: "no-store" });
      if (!configResponse.ok) throw new Error("无法加载配置文件：config.yaml");
      pyodide.FS.writeFile(`${BASE}/config.yaml`, await configResponse.text(), { encoding: "utf8" });
      await pyodide.runPythonAsync(`
import os, sys, matplotlib
matplotlib.use("Agg")
os.chdir("${BASE}")
if "${BASE}" not in sys.path:
    sys.path.insert(0, "${BASE}")
`);
      setStatus("已就绪");
      setNotice("Python 已初始化，可以运行分析。");
      $("runBtn").disabled = false;
    }

    function safeName(name) {
      return name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120) || "upload.dat";
    }

    async function collectFiles() {
      const out = {};
      for (const input of document.querySelectorAll("input[type=file][data-file-key]")) {
        if (!input.files.length) throw new Error(`缺少文件：${input.previousElementSibling.textContent}`);
        const file = input.files[0];
        const path = `${BASE}/browser_inputs/${Date.now()}_${safeName(file.name)}`;
        pyodide.FS.writeFile(path, new Uint8Array(await file.arrayBuffer()));
        out[input.dataset.fileKey] = { path, name: file.name };
      }
      return out;
    }
