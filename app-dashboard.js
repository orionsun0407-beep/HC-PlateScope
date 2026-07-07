    function renderDashboard() {
      const cards = Object.entries(MODULES).map(([key, meta]) => `
        <article class="feature-card ${escapeHtml(meta.accent)}">
          <div class="feature-line"></div>
          <h3>${escapeHtml(meta.title)}</h3>
          <p>${escapeHtml(meta.desc)}</p>
          <div class="tags">${tagHtml(meta.tags)}</div>
          <button class="secondary" type="button" data-open-module="${escapeHtml(key)}">进入分析</button>
        </article>
      `).join("");
      $("dashboardView").innerHTML = `
        <section class="hero">
          <div class="hero-copy">
            <div class="eyebrow">本地优先的科学分析工作台</div>
            <h1>HC PlateScope</h1>
            <p><strong>面向 96/384 孔板光谱数据的在线分析工作区。</strong></p>
            <p>此版本可直接部署在 GitHub Pages。分析核心在浏览器中运行，不需要 Streamlit 服务器。</p>
            <div class="tags">
              <span class="tag">清爽</span>
              <span class="tag">可复现</span>
              <span class="tag">论文风格图件</span>
              <span class="tag">outputs.zip 下载</span>
            </div>
          </div>
          <div class="plate-wrap">
            <div class="plate-title">96 孔板布局</div>
            <div class="plate-grid">${plateDecoration()}</div>
          </div>
        </section>
        <section>
          <h2>选择分析模块</h2>
          <p class="lede">从一个模块开始。每次运行都会生成表格、图件、元数据、日志，并在浏览器会话中提供可下载的 outputs.zip。</p>
          <div class="cards">${cards}</div>
        </section>
        <section class="panel span" style="margin-top: 16px;">
          <h2>本地运行说明</h2>
          <div class="notice">在线版在你的浏览器中本地运行，不会把输入文件上传到服务器。刷新页面会清空当前会话输出，请及时下载 outputs.zip 和优秀孔绘图文件。</div>
        </section>
      `;
      for (const btn of document.querySelectorAll("[data-open-module]")) {
        btn.addEventListener("click", () => openModule(btn.dataset.openModule));
      }
    }

    function renderNav() {
      const nav = $("moduleNav");
      nav.innerHTML = "";
      for (const [key, meta] of Object.entries(MODULES)) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = meta.title;
        btn.className = currentView === "module" && key === activeModule ? "active" : "";
        btn.addEventListener("click", () => {
          openModule(key);
        });
        nav.appendChild(btn);
      }
    }

    function renderPlateControls() {
      const plate = $("plateFormat");
      const current = plate.value;
      if (activeModule === "geco") {
        plate.innerHTML = `<option value="96">96 孔板</option><option value="384">384 孔板</option>`;
        plate.value = current === "384" ? "384" : "96";
      } else {
        plate.innerHTML = `<option value="auto">自动识别</option><option value="96">96 孔板</option><option value="384">384 孔板</option>`;
        plate.value = ["auto", "96", "384"].includes(current) ? current : "auto";
      }

      const allowLayout = activeModule !== "wellid";
      $("spectraLayoutControls").classList.toggle("hidden", !allowLayout);
      if (!allowLayout) return;
      if (activeModule === "geco" && plate.value === "384") {
        $("spectraMode").value = "compact";
      }
      const isCompact = $("spectraMode").value === "compact";
      for (const el of document.querySelectorAll(".compact-controls")) {
        el.classList.toggle("hidden", !isCompact);
      }
    }

    function renderFiles(meta) {
      const wrap = $("fileFields");
      wrap.innerHTML = "";
      $("uploadHelp").textContent = meta.uploadHelp || "";
      $("uploadInfo").innerHTML = "";
      const files = [...meta.files];
      if (activeModule === "geco" && $("plateFormat").value === "384") {
        files.splice(0, files.length, ["input", "上传 384 孔配对 GECO 表"]);
        $("uploadInfo").innerHTML = `
          <div class="notice" style="margin-top: 12px;">
            <strong>GECO 384 配对规则</strong><br>
            上传一张包含 A01-P24 well 列的表。奇数列按 without CA 处理，相邻偶数列按 with CA 处理。例如 A05 without CA 与 A06 with CA 会作为一组绘图。
          </div>`;
      }
      for (const [key, label] of files) {
        const box = document.createElement("div");
        box.className = "panel";
        box.innerHTML = `<label for="file_${key}">${label}</label><input id="file_${key}" data-file-key="${key}" type="file" accept=".xlsx,.xls,.csv"><div class="field-note">单文件 200MB 以内 · XLSX、XLS、CSV</div>`;
        wrap.appendChild(box);
      }
    }
