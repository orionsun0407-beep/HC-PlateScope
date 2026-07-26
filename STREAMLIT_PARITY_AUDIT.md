# Streamlit parity audit

Baseline: https://hc-platescope.streamlit.app

Allowed differences:
- GitHub Pages runs analysis in the browser instead of Streamlit server Python.
- Per-well plot y-axis uses max signal * 110%, rounded up to the nearest multiple of 10.
- Result preview displays the generated PDF in an iframe.

Pages checked:
- Dashboard: workspace cards, History card, Settings button, recent runs notice.
- Module shell: Back to Dashboard, breadcrumb, module header, tags, data-mode pill.
- Well ID: upload, detection settings, disabled recognition controls, run-name field, ready check, results.
- GECO: 96/384 plate mode in Step 1, dynamic file upload mode, pairing rule, auto-standardization card, analysis settings, ready check, results.
- LUCI: upload, auto-standardization card, fixed normalization, peak windows, analysis settings, ready check, results.
- LSS: excitation/emission upload, raw data fixed control, auto-standardization card, analysis settings, ready check, results.
- ANTI: excitation/emission upload, fixed column-max normalization, auto-standardization card, analysis settings, ready check, results.
- History: filters, run list, metadata/folder/restore controls.
- Settings: six tabs matching Streamlit sections, config.yaml export/import, save/reset controls.
