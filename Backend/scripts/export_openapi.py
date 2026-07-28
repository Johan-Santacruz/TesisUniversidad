from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import FastAPI

from app.main import create_app


def build_openapi(application: FastAPI) -> dict[str, Any]:
    return application.openapi()


def main() -> None:
    destination = Path(__file__).resolve().parents[1] / "openapi.json"
    schema = build_openapi(create_app())
    destination.write_text(
        json.dumps(schema, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(destination)


if __name__ == "__main__":
    main()
