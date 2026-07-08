# HC PlateScope

A browser-based workspace for 96/384-well plate spectra analysis.

HC PlateScope 是一个可直接部署到 GitHub Pages 的孔板光谱分析工具。默认入口是 `index.html`，在线版已经迁移为纯 HTML/CSS/JavaScript 原生网页：不依赖 Streamlit，不启动 Python，也不使用 Pyodide。输入文件在用户浏览器中解析和分析，不会上传到服务器。

## 上传 GitHub 后部署成网页工具

推荐使用 GitHub Pages：

1. 将本目录推送到 GitHub 仓库。
2. 打开仓库 `Settings` → `Pages`。
3. `Build and deployment` 选择 `Deploy from a branch`。
4. Branch 选择 `streamlit-online`，目录选择 `/ (root)`。
5. 保存后等待 GitHub Pages 构建完成。

GitHub Pages 在线版会直接打开 `index.html`，不依赖 Streamlit 或 Python 初始化。浏览器会加载前端库用于读取 Excel/CSV、生成图表、打包 ZIP、导出 PDF/SVG/TIF 和表格文件。

仓库仍保留 `app.py`、`plate_processor/` 和本地 Streamlit 相关文件，作为本地运行或对照版本；GitHub Pages 在线版不使用这些文件。

## 安装

```bash
cd "/Users/hc/Desktop/HC PlateScope"
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 运行 Streamlit 界面

```bash
cd "/Users/hc/Desktop/HC PlateScope"
streamlit run app.py
```

打开浏览器中的本地地址后，会先进入 `Dashboard` 首页。新版 UI 使用两层结构：

- 第一层：`Dashboard`，展示工具总览、96 孔板装饰、功能入口卡片、Recent runs 和 local-first notice。
- 第二层：`Module Workspace`，点击功能卡片后进入对应模块页面，通过 `Back to Dashboard` 返回首页。

左侧 sidebar 不再作为主导航，只保留 Debug mode、当前 workspace、最新 run 和本地记录提示。

### Streamlit 页面用途

- `Dashboard`：工具总览、功能卡片、最近运行记录和 local-first 提示。
- `Well ID Extractor`：上传原始 plate reader 文件，提取 well ID，并导出标准化 well-by-column 表。
- `GECO Analysis`：96-well 上传 with-CA / without-CA 两个表格；384-well 上传一个相邻孔配对表格，生成叠加光谱图、ratio heatmap 和综合报告。
- `LUCI Analysis`：上传 LUCI 表格，按 well 归一化，检测 450/520 nm 峰并计算 520/450 ratio。
- `LSS Analysis`：上传 Excitation / Emission 表格，使用原始数据绘制每孔叠加光谱图，不做归一化。
- `ANTI Analysis`：上传 Excitation / Emission 表格，分别按列最大值归一化后绘制叠加光谱图。
- `Analysis History`：浏览本地 `outputs/run_index.csv` 中的历史运行，查看 metadata，恢复设置，或仅从索引中移除记录。
- `Settings`：调整全局绘图、平滑、y 轴、输出和历史记录默认参数，可导入/导出 `config.yaml`。

### UI 使用流程

新版 UI 的使用流程：

1. 打开 `Dashboard`。
2. 点击功能卡片的 `Start analysis` 进入模块 workspace。
3. 在 `Step 1: Upload files` 上传 `.xlsx`、`.xls` 或 `.csv` 文件。上传后页面会显示文件名、大小和格式。GECO、LUCI、LSS 和 ANTI 页面默认启用内置 Well ID Extractor，会先把 raw plate reader 文件自动标准化为 `Wavelength + well ID` 的表格，再交给分析模块。
4. 在 `Step 2: Analysis settings` 调整常用参数；高级绘图参数放在 `Advanced settings` 中。
5. 在运行按钮上方填写 `Project name for this run`。这个名称会写入 History、`run_metadata.json`、`config_snapshot.yaml`、`outputs/run_index.csv`，并作为 run 文件夹名称的一部分，方便后续搜索和归档。
6. 在 `Step 3: Run analysis` 点击运行按钮。缺少必要文件时，按钮下方会显示友好提示。
7. 在 `Step 4: Results & downloads` 查看 summary、warnings、预览表格或 PDF preview，并集中下载输出文件。
8. 回到 Dashboard 底部查看 recent runs，或进入 `Analysis History` 查看完整本地历史记录。

所有分析都在本机执行。输入文件副本、PDF、表格、`run_metadata.json`、`config_snapshot.yaml`、`processing_log.txt` 和历史索引都会保存在 `outputs/` 文件夹中，不写入浏览器缓存或 localStorage。

### 恢复之前的设置

在 `Analysis History` 页面点击某条记录的 `Restore settings`，界面会读取该 run 文件夹中的 `config_snapshot.yaml`，并加载到当前 Streamlit session。恢复后进入对应分析页面即可使用当次运行的参数。该操作不会删除或修改历史输出文件。

### Heatmap colormap 是什么

`Heatmap colormap` 只控制热图颜色映射，不会改变任何 ratio 或 peak 计算结果。为了避免少数离群孔把整张热图的色阶拉开，GECO 和 LUCI 热图默认启用 robust heatmap scale：颜色范围按第 5 到第 95 百分位显示，低于/高于该范围的孔会使用端点颜色，但表格、metadata 和图中数值标签仍保留真实计算值。

- `hc_soft`：默认推荐，浅色、本地工具风格，适合打印。
- `YlGnBu` / `BuGn`：较浅的连续色阶，适合论文草图和报告。
- `viridis` / `cividis` / `plasma`：更强对比的科学配色。

GECO 和 LUCI 的 combined report 使用 A4 竖版：上半页为 12 x 8 光谱矩阵，下半页为 heatmap。单独导出的 grid PDF 和 heatmap PDF 仍分别保留为独立图版。

## 命令行运行

```bash
python run_analysis.py --module wellid --input raw_file.xlsx --config config.yaml
python run_analysis.py --module geco --with-ca with_ca.xlsx --without-ca without_ca.xlsx --config config.yaml
python run_analysis.py --module geco --plate-format 384 --geco-input-mode paired-384 --input geco_384.xlsx --config config.yaml
python run_analysis.py --module luci --input luci.xlsx --peak450 430 470 --peak520 500 540 --config config.yaml
python run_analysis.py --module lss --emission emission.xlsx --excitation excitation.xlsx --config config.yaml
python run_analysis.py --module anti --emission emission.xlsx --excitation excitation.xlsx --config config.yaml --run-name "Project A"
```

旧版子命令形式仍可使用，例如 `python run_analysis.py lss --emission emission.xlsx --excitation excitation.xlsx`。

## 输入文件格式

标准输入表格要求：

- 第一列为波长，建议列名为 `Wavelength`、`nm`、`波长` 等。
- 后续列为 well ID。96-well 支持 `A01-H12`；384-well 支持 `A01-P24`。
- 支持 `.xlsx`、`.xls`、`.csv`。`.xls` 读取依赖 `xlrd`，已写入 `requirements.txt`。

Well ID 提取模块可处理两类常见格式：

- 宽表：一列波长，多个 well ID 作为列名。
- 长表：包含 well ID 列、波长列和一个数值信号列。

如果无法识别波长列或 well ID，程序会给出清晰错误提示。

## 功能说明

### Well ID 提取

上传原始文件后，程序会自动识别波长列和 well ID，导出：

- `standardized_by_well.xlsx`

输出表第一列为 `Wavelength`，后续列为标准化 well ID。

### GECO 数据处理

GECO 支持两种模式：

- 96-well：输入 with ca 和 without ca 两个标准表格。
- 384-well：输入一个标准表格，相邻两个孔为一组，奇数列为 without ca，相邻偶数列为 with ca。例如 `A05` 是 without ca，`A06` 是 with ca，二者在同一个 subplot 中叠加绘制。

程序会：

- 自动识别共同 well ID。
- 每个孔绘制 with/without ca 叠加散点和平滑曲线。
- 计算 `ratio = max(with ca) / max(without ca)`。
- 输出 ratio 热图。384-well 通常不会测整板，因此光谱散点图默认使用 `Compact` 排列。可在 UI 中手动设置每行 subplot 数量和每页行数；默认 `12 x 8`，让单个 subplot 尺寸接近 96-well 图版，超出部分会自动进入 PDF 后续页面。

主要输出：

- `GECO_peak_ratio.csv`
- `GECO_grid_plots.pdf`
- `GECO_heatmap.pdf`
- `GECO_combined_report.pdf`

### LUCI 数据处理

输入一个标准表格。程序会：

- 对每个 well 单独归一化，最大值设为 1。
- 在配置窗口内寻找 450 nm 和 520 nm 附近峰。
- 计算 `ratio_520_450 = peak520 / peak450`。
- 输出归一化表格、峰值表、热图和综合报告。

主要输出：

- `LUCI_normalized.xlsx`
- `LUCI_peak_summary.csv`
- `LUCI_grid_plots.pdf`
- `LUCI_ratio_heatmap.pdf`
- `LUCI_combined_report.pdf`

### LSS 数据处理

输入 Emission 和 Excitation 两个标准表格。程序会：

- 不做归一化，直接使用原始信号值。
- 自动识别共同 well ID。
- 同一 well 中叠加 Emission 原始散点/平滑曲线和 Excitation 原始散点/平滑曲线。
- Emission 和 Excitation 使用两组波长范围的并集作为横坐标范围，避免其中一组曲线被裁切。
- 每个 subplot 都显示横坐标刻度，LSS/ANTI 图版按 10 nm 标记。
- 如果数据只包含部分 plate 行，LSS/ANTI 光谱矩阵会按实际有数据的行压缩排版，尽量占满无热图的 A4 页面。
- 每个 well 独立设置 y 轴，上限约为该 well 两组原始信号最大值的 110%，并向上取整到整洁数值。
- 本模块不输出热图。

主要输出：

- `LSS_summary.csv`
- `LSS_grid_plots.pdf`
- `LSS_combined_report.pdf`

metadata 中会记录 `normalize=false` 和 `use_raw_data=true`。

### ANTI Analysis

输入 Emission 和 Excitation 两个标准表格。程序会：

- 分别对 Excitation 和 Emission 按 well 列最大值归一化。
- 归一化公式为 `normalized_value = raw_value / column_max`。
- 如果某个 well 的最大值为 0、负值或无效值，会记录 warning，并将该 well 的归一化结果设为 NaN，避免程序崩溃。
- 自动识别共同 well ID。
- 同一 well 中叠加归一化 Excitation 散点/平滑曲线和归一化 Emission 散点/平滑曲线。
- Excitation 和 Emission 使用两组波长范围的并集作为横坐标范围，避免其中一组曲线被裁切。
- 每个 subplot 都显示 10 nm 横坐标刻度；无热图时光谱矩阵会尽量占满 A4 页面。
- 每个 well 独立设置 y 轴，默认使用归一化图形范围。
- 本模块暂不输出热图。

主要输出：

- `anti_excitation_normalized.xlsx`
- `anti_emission_normalized.xlsx`
- `anti_summary.csv`
- `anti_grid_plots.pdf`
- `anti_combined_report.pdf`

metadata 中会记录 `module_type="anti"`、`normalize=true`、`normalization_method="column_max"`、输入文件名、共同 well 数量、输出文件和 warnings。界面中显示为 `ANTI Analysis`，命令行参数和 metadata 中仍使用兼容的 `anti`。

## 历史记录

每次运行都会生成唯一 `run_id`。如果在 UI 或命令行中填写了 run/project name，该名称会显示在 History 中，并被加入 run 文件夹名称中：

```text
outputs/<run_id>/
```

每个 run 目录包含：

- `inputs/`：本次输入文件副本
- `figures/`：图形 PDF
- `tables/`：CSV/XLSX 表格
- `report/`：综合报告 PDF
- `run_metadata.json`：run_id、时间、模块类型、输入文件 SHA256、参数、输出文件和 warnings
- `config_snapshot.yaml`：本次运行使用的配置快照
- `processing_log.txt`：处理日志

总索引保存在：

```text
outputs/run_index.csv
```

Streamlit 的“历史记录”页面可以查看每次运行概要、project name、metadata 和输出文件列表，并支持按 project name、run_id 或输入文件名搜索。

## 参数配置

默认参数在 `config.yaml` 中修改。常用项包括：

- `smoothing.window_length`
- `smoothing.polyorder`
- `peaks.luci_450_window`
- `peaks.luci_520_window`
- `plotting.marker_size`
- `plotting.line_width`
- `plotting.alpha`
- `plotting.colors`
- `plotting.x_axis.tick_interval_nm`：横坐标刻度线间隔，默认 10 nm
- `plotting.x_axis.label_interval_nm`：横坐标数字标签间隔，默认 50 nm，若确实需要每 10 nm 显示数字可改为 10
- `plotting.y_axis.upper_padding`
- `plotting.heatmap.show_values`
- `lss.normalize`：LSS 固定为 `false`
- `lss.use_raw_data`：LSS 固定使用原始数据
- `lss.output_heatmap`：LSS 默认不输出热图
- `anti.normalize`：anti 固定为 `true`
- `anti.normalization_method`：anti 使用 `column_max`
- `anti.output`：控制 anti 是否保存归一化表格、grid PDF 和 combined report
- `plot.marker_size`
- `plot.line_width`
- `plot.marker_alpha`
- `plot.line_alpha`
- `plot.smoothing.window_length`
- `plot.smoothing.polyorder`
- `output.base_dir`

Streamlit 左侧栏也提供常用绘图和平滑参数调节。

## 绘图说明

图形采用白底、低饱和配色、细线条和紧凑留白，目标是接近 Nature 论文配图中简约清晰的风格。96 个 subplot 在 A4 横版页面中非常密集，因此单孔图的字体和刻度会较小；综合报告优先保留 12 x 8 排布和热图区域，适合科研汇报和论文作图参考，必要时可进一步在矢量软件中拆分精修。

## 健壮性说明

程序会对以下情况给出提示或 warning：

- 找不到波长列。
- 找不到 well ID。
- 重复 well ID。
- 两个输入文件 well ID 不完全一致。
- 负值、空值或非数值信号。
- 峰查找窗口内没有有效数据。

当两个文件 well ID 不一致时，仅处理共同 well ID，并在 metadata 与日志中记录。
