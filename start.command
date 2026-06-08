#!/bin/zsh

cd "$(dirname "$0")" || exit 1

echo "Starting HC PlateScope for macOS..."
echo

find_python() {
  for candidate in python3.12 python3.11 python3.10 python3; do
    if command -v "$candidate" >/dev/null 2>&1; then
      if "$candidate" - <<'PY' >/dev/null 2>&1
import sys
raise SystemExit(0 if (3, 10) <= sys.version_info[:2] <= (3, 13) else 1)
PY
      then
        echo "$candidate"
        return 0
      fi
    fi
  done
  return 1
}

PYTHON_CMD="$(find_python)"
if [ -z "$PYTHON_CMD" ]; then
  echo "Python 3.10, 3.11, 3.12, or 3.13 was not found."
  echo "Please install Python from https://www.python.org/downloads/"
  echo
  read "?Press Enter to close."
  exit 1
fi

echo "Using Python: $PYTHON_CMD"
"$PYTHON_CMD" --version

if [ ! -d ".venv" ]; then
  echo "Creating local Python environment..."
  "$PYTHON_CMD" -m venv .venv
fi

if [ ! -x ".venv/bin/python" ] || ! .venv/bin/python -m pip --version >/dev/null 2>&1; then
  echo "The existing .venv is incomplete or pip is broken. Rebuilding it..."
  rm -rf .venv
  "$PYTHON_CMD" -m venv .venv
fi

source .venv/bin/activate

export PYTHONUTF8=1
export PIP_DISABLE_PIP_VERSION_CHECK=1
export MPLBACKEND=Agg
export STREAMLIT_BROWSER_GATHER_USAGE_STATS=false

echo "Installing/updating dependencies..."
python -m ensurepip --upgrade >/dev/null 2>&1
python -m pip install --upgrade pip setuptools wheel
if [ $? -ne 0 ]; then
  echo
  echo "Could not update pip/setuptools/wheel. Please check your network or proxy, then run start.command again."
  echo
  read "?Press Enter to close."
  exit 1
fi

python -m pip install --prefer-binary -r requirements.txt
if [ $? -ne 0 ]; then
  echo
  echo "Dependency installation failed. Delete the .venv folder and run start.command again, or check your network/proxy."
  echo
  read "?Press Enter to close."
  exit 1
fi

echo
python launch_platescope.py

echo
read "?HC PlateScope has stopped. Press Enter to close."
