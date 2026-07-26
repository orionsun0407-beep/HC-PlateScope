# Streamlit parity audit

Baseline: https://hc-platescope.streamlit.app

Allowed differences:
- GitHub Pages runs analysis in the browser instead of Streamlit server Python.
- Per-well plot y-axis uses max signal * 110%, rounded up to the nearest multiple of 10.
- Result preview displays the generated PDF in an iframe.

Pages checked:
- Dashboard: top HC PlateScope hero, right-side 96-well layout panel, workspace cards, History card, Settings button, recent runs notice.
- Module shell: clickable breadcrumb, module header, tags, data-mode pill, large card spacing.
- Well ID: Streamlit-style uploader, detection settings, disabled recognition controls, run-name field, ready check, results.
- GECO: 96/384 plate mode in Step 1, Streamlit-style full-width controls, dynamic dashed upload boxes, pairing rule, auto-standardization card, analysis settings, ready check, results.
- LUCI: Streamlit-style uploader, auto-standardization card, fixed normalization, peak windows, analysis settings, ready check, results.
- LSS: Streamlit-style excitation/emission upload boxes, raw data fixed control, auto-standardization card, analysis settings, ready check, results.
- ANTI: Streamlit-style excitation/emission upload boxes, fixed column-max normalization, auto-standardization card, analysis settings, ready check, results.
- History: filters, run list, metadata/folder/restore controls.
- Settings: six tabs matching Streamlit sections, config.yaml export/import, save/reset controls.
