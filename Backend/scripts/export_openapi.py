from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from fastapi import FastAPI

from app.main import create_app


def build_openapi(application: FastAPI) -> dict[str, Any]:
    return application.openapi()


def write_openapi(application: FastAPI, destination: Path) -> None:
    schema = build_openapi(application)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(schema, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def main(argv: list[str] | None = None) -> None:
    default = Path(__file__).resolve().parents[1] / "openapi.json"
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=default)
    arguments = parser.parse_args(argv)
    write_openapi(create_app(), arguments.output)
    destination = arguments.output.resolve()
    print(destination)


if __name__ == "__main__":
    main()
