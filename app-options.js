    function renderOptions() {
      const section = $("moduleOptions");
      section.innerHTML = "";
      section.classList.remove("hidden");
      if (activeModule === "wellid") {
        section.innerHTML = `
          <div class="step-title">步骤 2</div>
          <h2>识别设置</h2>
          <p class="lede">Extractor 会识别常见波长列和 96/384 孔 well ID。</p>
          <div class="row four" style="margin-top: 12px;">
            <div><label>Well ID 范围</label><input type="text" value="A01-H12 或 A01-P24" disabled></div>
            <label class="check inline"><input type="checkbox" checked disabled>自动识别波长列</label>
            <div><label for="manualWavelength">手动波长列名</label><input id="manualWavelength" type="text" placeholder="可选"></div>
            <div><label>输出文件格式</label><select disabled><option>xlsx</option></select></div>
          </div>`;
      } else {
        const heatmap = activeModule !== "anti";
        const smoothing = "启用平滑";
        const colorLabels = {
          geco: ["with CA 颜色", "without CA 颜色"],
          luci: ["主曲线颜色", "辅助曲线颜色"],
          lss: ["Emission 颜色", "Excitation 颜色"],
          anti: ["Excitation 颜色", "Emission 颜色"],
        }[activeModule] || ["主曲线颜色", "辅助曲线颜色"];
        let moduleSpecific = "";
        if (activeModule === "luci") {
          moduleSpecific = `
            <div class="section-title">峰窗口</div>
            <label class="check inline"><input type="checkbox" checked disabled>按列最大值归一化</label>
            <div class="row four" style="margin-top: 12px;">
              <div><label for="peak450Low">450 nm 下限</label><input id="peak450Low" type="number" min="350" max="650" value="430"></div>
              <div><label for="peak450High">450 nm 上限</label><input id="peak450High" type="number" min="350" max="650" value="470"></div>
              <div><label for="peak520Low">520 nm 下限</label><input id="peak520Low" type="number" min="350" max="750" value="500"></div>
              <div><label for="peak520High">520 nm 上限</label><input id="peak520High" type="number" min="350" max="750" value="540"></div>
            </div>`;
        } else if (activeModule === "lss") {
          moduleSpecific = `<label class="check inline"><input type="checkbox" disabled>归一化数据</label>`;
        } else if (activeModule === "anti") {
          moduleSpecific = `<label class="check inline"><input type="checkbox" checked disabled>按列最大值归一化</label>`;
        }
        section.innerHTML = `
          <div class="step-title">步骤 2</div>
          <h2>分析设置</h2>
          <p class="lede">常用参数直接显示；更细的绘图参数在高级设置里。</p>
          ${moduleSpecific}
          <div class="section-title">绘图控制</div>
          <div class="row">
            <label class="check inline"><input id="smoothEnabled" type="checkbox" checked>${smoothing}</label>
            <div><label for="markerSize">散点大小</label><input id="markerSize" type="range" min="0.5" max="8" step="0.5" value="1"></div>
            <div><label for="lineWidth">线宽</label><input id="lineWidth" type="range" min="0.2" max="3" step="0.1" value="1"></div>
          </div>
          <div class="row two" style="margin-top: 12px;">
            <label class="check inline"><input id="perWellYAxis" type="checkbox" checked>每个 well 独立 y 轴</label>
            <div><label for="yUpperPadding">Y 轴上方留白</label><input id="yUpperPadding" type="range" min="1" max="1.5" step="0.01" value="1.10"></div>
          </div>
          <div class="row two" style="margin-top: 12px; display: ${heatmap ? "grid" : "none"};">
            <label class="check inline"><input id="showHeatmapValues" type="checkbox" checked>显示热图数值</label>
            <label class="check inline"><input id="robustHeatmap" type="checkbox" checked>稳健热图色阶</label>
          </div>
          <details class="advanced">
            <summary>高级设置</summary>
            <div class="row" style="margin-top: 14px;">
              <div><label for="smoothMethod">平滑方法</label><select id="smoothMethod"><option value="savgol">savgol</option></select></div>
              <div><label for="windowLength">窗口长度</label><input id="windowLength" type="number" min="3" max="51" step="2" value="9"></div>
              <div><label for="polyorder">多项式阶数</label><input id="polyorder" type="number" min="1" max="5" value="3"></div>
            </div>
            <div class="row" style="margin-top: 12px;">
              <div><label for="markerAlpha">散点透明度</label><input id="markerAlpha" type="range" min="0.1" max="1" step="0.05" value="0.55"></div>
              <div><label for="lineAlpha">线条透明度</label><input id="lineAlpha" type="range" min="0.1" max="1" step="0.05" value="0.95"></div>
              <label class="check inline"><input id="niceRounding" type="checkbox" checked>启用漂亮取整</label>
            </div>
            <div class="row" style="margin-top: 12px;">
              <div><label for="primaryColor">${colorLabels[0]}</label><input id="primaryColor" type="color" value="#0F4D92"></div>
              <div><label for="secondaryColor">${colorLabels[1]}</label><input id="secondaryColor" type="color" value="#8BCF8B"></div>
              <div><label for="badgeColor">${activeModule.toUpperCase()} 标记颜色</label><input id="badgeColor" type="color" value="${activeModule === "geco" ? "#42949E" : activeModule === "luci" ? "#9A4D8E" : activeModule === "lss" ? "#E28E2C" : "#42949E"}"></div>
            </div>
            <div class="row" style="margin-top: 12px; display: ${heatmap ? "grid" : "none"};">
              <div><label for="heatmapColor">热图配色</label><select id="heatmapColor"><option value="hc_nature">hc_nature</option><option value="hc_soft">hc_soft</option><option value="YlGnBu">YlGnBu</option><option value="BuGn">BuGn</option><option value="viridis">viridis</option><option value="cividis">cividis</option><option value="plasma">plasma</option></select></div>
              <div><label for="robustLow">低百分位</label><input id="robustLow" type="number" min="0" max="20" step="1" value="5"></div>
              <div><label for="robustHigh">高百分位</label><input id="robustHigh" type="number" min="80" max="100" step="1" value="95"></div>
            </div>
          </details>`;
      }
    }

    function render() {
      const meta = MODULES[activeModule];
      renderNav();
      $("crumbTitle").textContent = meta.title;
      $("moduleTitle").textContent = meta.title;
      $("moduleDesc").textContent = meta.desc;
      $("moduleTags").innerHTML = tagHtml(meta.tags);
      $("moduleMode").textContent = meta.mode;
      renderPlateControls();
      $("autoStandardize").disabled = activeModule === "wellid";
      $("autoStandardize").checked = activeModule === "wellid" ? false : $("autoStandardize").checked;
      renderFiles(meta);
      renderOptions();
      $("resultPanel").style.display = "none";
      $("previewPanel").style.display = "none";
    }
