# Streamlit 网页部署说明

这个版本保持原始 `app.py` UI 和原始 Python 分析功能，不做 GitHub Pages/Pyodide 改写。

## 推荐部署方式

使用 Streamlit Community Cloud：

1. 将本目录上传到 GitHub 仓库。
2. 在 Streamlit Community Cloud 选择 `New app`。
3. 选择刚上传的仓库和分支。
4. Main file path 填写 `app.py`。
5. 点击部署。

部署后，用户打开网页即可使用原 Streamlit 界面，不需要手动初始化 Python。

## 需要上传的核心文件

- `app.py`
- `config.yaml`
- `requirements.txt`
- `plate_processor/`
- `run_analysis.py`
- `style.py`
- `ui_components.py`
- `README.md`

## 不要上传的本地运行产物

- `.venv/`
- `outputs/`
- `__pycache__/`
- `.DS_Store`

这些已经写入 `.gitignore`。

## 为什么不是 GitHub Pages

GitHub Pages 只能托管静态 HTML/CSS/JavaScript，不能直接运行 Streamlit 和 Python 后端。要完全保留当前 UI 和功能，应部署为 Streamlit 应用，而不是静态 GitHub Pages 页面。
