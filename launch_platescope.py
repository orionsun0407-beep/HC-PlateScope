from __future__ import annotations

import os
import socket
import subprocess
import sys
import time
import webbrowser
from pathlib import Path


DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8501
MAX_PORT = 8510
STARTUP_TIMEOUT_SECONDS = 90


def can_connect(host: str, port: int, timeout: float = 0.5) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def port_is_free(host: str, port: int) -> bool:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.bind((host, port))
            return True
    except OSError:
        return False


def pick_port(host: str, preferred_port: int) -> int:
    for port in range(preferred_port, MAX_PORT + 1):
        if port_is_free(host, port):
            return port
    raise RuntimeError(
        f"No free local port was found between {preferred_port} and {MAX_PORT}. "
        "Close other local apps and try again."
    )


def main() -> int:
    app_dir = Path(__file__).resolve().parent
    app_path = app_dir / "app.py"
    if not app_path.exists():
        print("app.py was not found. Please run this launcher from the HC PlateScope folder.")
        return 1

    host = os.environ.get("HC_PLATESCOPE_HOST", DEFAULT_HOST)
    preferred_port = int(os.environ.get("HC_PLATESCOPE_PORT", DEFAULT_PORT))

    try:
        port = pick_port(host, preferred_port)
    except RuntimeError as exc:
        print(exc)
        return 1

    url = f"http://{host}:{port}"
    env = os.environ.copy()
    env.setdefault("PYTHONUTF8", "1")
    env.setdefault("PIP_DISABLE_PIP_VERSION_CHECK", "1")
    env.setdefault("MPLBACKEND", "Agg")
    env.setdefault("STREAMLIT_BROWSER_GATHER_USAGE_STATS", "false")

    cmd = [
        sys.executable,
        "-m",
        "streamlit",
        "run",
        str(app_path),
        "--server.address",
        host,
        "--server.port",
        str(port),
        "--server.headless",
        "true",
        "--browser.gatherUsageStats",
        "false",
    ]

    print(f"Starting HC PlateScope on {url}")
    print("Keep this window open while you use the app.")
    process = subprocess.Popen(cmd, cwd=str(app_dir), env=env)

    opened = False
    deadline = time.time() + STARTUP_TIMEOUT_SECONDS
    try:
        while time.time() < deadline:
            if process.poll() is not None:
                print(f"HC PlateScope stopped before the browser could connect. Exit code: {process.returncode}")
                return int(process.returncode or 1)
            if can_connect(host, port):
                print(f"Opening browser: {url}")
                webbrowser.open(url)
                opened = True
                break
            time.sleep(0.5)

        if not opened:
            print(f"HC PlateScope did not become reachable within {STARTUP_TIMEOUT_SECONDS} seconds.")
            print(f"If the terminal is still installing packages, wait and then open {url} manually.")

        return int(process.wait())
    except KeyboardInterrupt:
        print("\nStopping HC PlateScope...")
        process.terminate()
        try:
            return int(process.wait(timeout=10))
        except subprocess.TimeoutExpired:
            process.kill()
            return int(process.wait())


if __name__ == "__main__":
    raise SystemExit(main())
