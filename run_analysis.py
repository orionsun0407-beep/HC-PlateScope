from __future__ import annotations

import argparse
import os
from pathlib import Path

from plate_processor.anti_analysis import run_anti_analysis
from plate_processor.report import run_geco, run_geco_384_paired, run_lss, run_luci, run_wellid
from plate_processor.utils import load_config


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="96-well plate fluorescence/luminescence data processor")
    parser.add_argument("--config", default="config.yaml", help="Path to config.yaml")
    parser.add_argument("--module", choices=["wellid", "geco", "luci", "lss", "anti"], help="Analysis module to run")
    parser.add_argument("--run-name", help="Project/run name saved in metadata, run_index.csv, and the run folder name")
    parser.add_argument("--plate-format", choices=["auto", "96", "384"], default=None, help="Plate format for well IDs")
    parser.add_argument("--geco-input-mode", choices=["two-file", "paired-384"], default="two-file", help="GECO input mode")
    parser.add_argument("--input", help="Input file for wellid/luci")
    parser.add_argument("--with-ca", help="GECO with calcium file")
    parser.add_argument("--without-ca", help="GECO without calcium file")
    parser.add_argument("--emission", help="Emission file for LSS/anti")
    parser.add_argument("--excitation", help="Excitation file for LSS/anti")
    parser.add_argument("--peak450", nargs=2, type=float, metavar=("LOW", "HIGH"))
    parser.add_argument("--peak520", nargs=2, type=float, metavar=("LOW", "HIGH"))
    sub = parser.add_subparsers(dest="command")

    p = sub.add_parser("wellid", help="Extract/standardize well ID columns")
    p.add_argument("--run-name", default=argparse.SUPPRESS, help="Project/run name saved in history")
    p.add_argument("--input", required=True)

    p = sub.add_parser("geco", help="Process GECO with/without calcium files")
    p.add_argument("--run-name", default=argparse.SUPPRESS, help="Project/run name saved in history")
    p.add_argument("--with-ca", required=True)
    p.add_argument("--without-ca", required=True)

    p = sub.add_parser("luci", help="Process LUCI file")
    p.add_argument("--run-name", default=argparse.SUPPRESS, help="Project/run name saved in history")
    p.add_argument("--input", required=True)
    p.add_argument("--peak450", nargs=2, type=float, metavar=("LOW", "HIGH"))
    p.add_argument("--peak520", nargs=2, type=float, metavar=("LOW", "HIGH"))

    p = sub.add_parser("lss", help="Process LSS emission/excitation files")
    p.add_argument("--run-name", default=argparse.SUPPRESS, help="Project/run name saved in history")
    p.add_argument("--emission", required=True)
    p.add_argument("--excitation", required=True)

    p = sub.add_parser("anti", help="Process anti excitation/emission files with column-max normalization")
    p.add_argument("--run-name", default=argparse.SUPPRESS, help="Project/run name saved in history")
    p.add_argument("--emission", required=True)
    p.add_argument("--excitation", required=True)
    return parser


def _required_path(value: str | None, option: str) -> Path:
    if not value:
        raise SystemExit(f"Missing required option: {option}")
    path = Path(value).expanduser().resolve()
    if not path.exists():
        raise SystemExit(f"Input file not found for {option}: {path}")
    return path


def main() -> None:
    project_root = Path(__file__).resolve().parent
    args = build_parser().parse_args()
    module = args.module or args.command
    if not module:
        raise SystemExit("Please provide --module or use a subcommand.")

    config_path = Path(args.config).expanduser()
    if not config_path.is_absolute():
        config_path = (Path.cwd() / config_path).resolve()
        if not config_path.exists():
            config_path = project_root / args.config
    config = load_config(config_path)
    if args.run_name:
        config["run_name"] = args.run_name
    if args.plate_format:
        config.setdefault("plate", {})["format"] = "auto" if args.plate_format == "auto" else int(args.plate_format)
    os.chdir(project_root)

    if module == "wellid":
        path = _required_path(args.input, "--input")
        result = run_wellid(path, path.name, config)
    elif module == "geco":
        if args.geco_input_mode == "paired-384" or config.get("plate", {}).get("format") == 384:
            path = _required_path(args.input, "--input")
            config.setdefault("plate", {})["format"] = 384
            config.setdefault("plotting", {}).setdefault("spectra_grid", {}).setdefault("mode", "compact")
            result = run_geco_384_paired(path, path.name, config)
        else:
            with_path = _required_path(args.with_ca, "--with-ca")
            without_path = _required_path(args.without_ca, "--without-ca")
            result = run_geco(with_path, without_path, with_path.name, without_path.name, config)
    elif module == "luci":
        path = _required_path(args.input, "--input")
        if args.peak450:
            config.setdefault("peaks", {})["luci_450_window"] = args.peak450
        if args.peak520:
            config.setdefault("peaks", {})["luci_520_window"] = args.peak520
        result = run_luci(path, path.name, config)
    elif module == "lss":
        emission = _required_path(args.emission, "--emission")
        excitation = _required_path(args.excitation, "--excitation")
        result = run_lss(emission, excitation, emission.name, excitation.name, config)
    elif module == "anti":
        emission = _required_path(args.emission, "--emission")
        excitation = _required_path(args.excitation, "--excitation")
        result = run_anti_analysis(excitation, emission, excitation.name, emission.name, config)
    else:
        raise SystemExit("Unknown command")

    print(f"Run complete: {result['metadata']['run_id']}")
    print(f"Output directory: {result['run_dir']}")
    for file in result.get("output_files", []):
        print(f"- {file}")


if __name__ == "__main__":
    main()
