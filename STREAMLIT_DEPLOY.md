# GitHub Pages 在线部署说明

这个分支的默认入口是 `index.html`，可直接部署为 GitHub Pages 静态网页。网页界面由 HTML/CSS/JavaScript 实现，分析核心通过 Pyodide 在用户浏览器中运行，不需要 Streamlit 服务器。

## 推荐部署方式

使用 GitHub Pages：

1. 将本目录推送到 GitHub 仓库。
2. 打开仓库 `Settings`。
3. 进入 `Pages`。
4. `Build and deployment` 选择 `Deploy from a branch`。
5. Branch 选择 `streamlit-online`，目录选择 `/ (root)`。
6. 保存后等待 GitHub Pages 构建完成。

部署完成后，访问 GitHub Pages 生成的链接即可使用在线版。

## 在线版入口文件

- `index.html`
- `styles.css`
- `app-core.js`
- `app-dashboard.js`
- `app-init.js`
- `app-options.js`
- `app-run.js`
- `config.yaml`
- `plate_processor/`

## 运行方式

在线版不会启动 Python 后端，也不会上传输入文件到服务器。首次运行分析时，浏览器会从 CDN 加载 Pyodide 和科学计算包，然后在浏览器本地执行 `plate_processor/` 中的 Python 分析代码。

## 不要上传的本地运行产物

- `.venv/`
- `outputs/`
- `__pycache__/`
- `.DS_Store`

这些已经写入 `.gitignore`。

## Streamlit 备用说明

仓库仍保留 `app.py`、`start.command` 和本地 Streamlit 相关文件，作为本地运行或回退版本。GitHub Pages 在线版不依赖 Streamlit。
