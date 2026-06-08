# HC PlateScope for macOS

## One-click start

1. Install Python 3.10 or newer if needed: https://www.python.org/downloads/
2. Put the folder at `/Users/hc/Desktop/HC PlateScope` if you want to use the documented desktop location.
3. Double-click `start.command`.
4. If macOS blocks the file, right-click `start.command`, choose `Open`, then confirm.
5. The app opens at:

```text
http://localhost:8501
```

The first launch may take a few minutes because dependencies are installed into a local `.venv` folder.

The launcher uses the folder that contains `start.command`, so it still works if you move the folder somewhere else.

## Local records

All analysis runs are saved locally in:

```text
outputs/
```

No browser storage or cloud service is required.
