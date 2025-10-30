#!/usr/bin/env python3
"""Format the raw traffic camera JSON into a readable variant."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def load_json(path: Path) -> object:
    with path.open("r", encoding="utf-8") as src:
        return json.load(src)


def dump_json(data: object, path: Path, indent: int = 2) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as dst:
        json.dump(data, dst, indent=indent, sort_keys=True)
        dst.write("\n")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Pretty-print traffic camera JSON data")
    parser.add_argument(
        "input",
        type=Path,
        nargs="?",
        default=Path("other_data/traffic_cameras.json"),
        help="Path to the raw traffic_cameras.json file",
    )
    parser.add_argument(
        "output",
        type=Path,
        nargs="?",
        default=Path("other_data/traffic_cameras_v2.json"),
        help="Where to write the formatted JSON",
    )
    parser.add_argument(
        "--indent",
        type=int,
        default=2,
        help="Number of spaces to indent JSON with (default: 2)",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    data = load_json(args.input)
    dump_json(data, args.output, indent=args.indent)


if __name__ == "__main__":
    main()
