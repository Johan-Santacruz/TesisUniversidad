"""Sube un lote de videos, corre el análisis completo y guarda lo que respondió.

    .venv/bin/python scripts/probar_lote.py "$SENDA_MATERIAL_PRUEBAS/prueba-videos/clips"

El material de prueba vive fuera del repositorio —pesa mas de 700 MB y no se
versiona—: `SENDA_MATERIAL_PRUEBAS` dice donde esta.

Cada video queda con su propio JSON: los eventos del SSE tal como llegaron, el
caso final, y el tiempo que tardó cada etapa. Nada se interpreta aquí; la
lectura se hace después, sobre el archivo.
"""
from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path

import httpx

BASE = "http://127.0.0.1:8000/api/v1"

# Los videos de prueba y sus resultados no viven en el repositorio: son cientos
# de megas de descargas que no se versionan.
MATERIAL = Path(
    os.environ.get("SENDA_MATERIAL_PRUEBAS", Path.home() / "Documents/SENDA-material-pruebas")
)


def login(client: httpx.Client, email: str, password: str) -> str:
    response = client.post(
        f"{BASE}/auth/token",
        data={"username": email, "password": password},
    )
    response.raise_for_status()
    return response.json()["access_token"]


def upload(client: httpx.Client, headers: dict, video: Path) -> str:
    with video.open("rb") as handle:
        response = client.post(
            f"{BASE}/videos",
            headers=headers,
            files={"file": (video.name, handle, "video/mp4")},
            timeout=300.0,
        )
    response.raise_for_status()
    return response.json()["id"]


def analyse(client: httpx.Client, headers: dict, video_id: str) -> dict:
    """Arranca el análisis y consume el SSE hasta que se cierre."""
    started = client.post(f"{BASE}/videos/{video_id}/analyses", headers=headers)
    started.raise_for_status()
    analysis = started.json()

    events: list[dict] = []
    marks: list[dict] = []
    origin = time.monotonic()
    last = origin

    with client.stream(
        "GET",
        f"{BASE}/analyses/{analysis['id']}/events",
        headers=headers,
        timeout=httpx.Timeout(1200.0, read=1200.0),
    ) as stream:
        stream.raise_for_status()
        for line in stream.iter_lines():
            if not line.startswith("data:"):
                continue
            payload = json.loads(line[5:].strip())
            events.append(payload)
            now = time.monotonic()
            marks.append(
                {
                    "stage": payload.get("stage"),
                    "state": payload.get("state"),
                    "segundos_etapa": round(now - last, 1),
                    "segundos_total": round(now - origin, 1),
                }
            )
            last = now
            if payload.get("state") in {"failed", "error"}:
                break
            if payload.get("stage") == "delivery" and payload.get("state") == "completed":
                break

    return {"analysis": analysis, "events": events, "tiempos": marks}


def find_case_id(events: list[dict]) -> str | None:
    for event in reversed(events):
        payload = event.get("payload") or {}
        for key in ("case_id", "caseId", "id"):
            value = payload.get(key)
            if isinstance(value, str) and len(value) == 36:
                return value
        case = payload.get("case")
        if isinstance(case, dict) and isinstance(case.get("id"), str):
            return case["id"]
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("carpeta", type=Path)
    parser.add_argument(
        "--salida", type=Path, default=MATERIAL / "prueba-videos/resultados"
    )
    parser.add_argument("--email", default="camilobalanta1@gmail.com")
    parser.add_argument("--password", default="dios#12Admin")
    args = parser.parse_args()

    videos = sorted(args.carpeta.glob("*.mp4"))
    if not videos:
        print(f"No hay .mp4 en {args.carpeta}")
        return 1
    args.salida.mkdir(parents=True, exist_ok=True)

    with httpx.Client(timeout=120.0) as client:
        token = login(client, args.email, args.password)
        headers = {"Authorization": f"Bearer {token}"}

        for video in videos:
            destino = args.salida / f"{video.stem}.json"
            if destino.exists():
                print(f"— {video.stem}: ya existe, lo salto")
                continue

            print(f"\n▶ {video.stem}")
            registro: dict = {"archivo": video.name}
            try:
                video_id = upload(client, headers, video)
                registro["video_id"] = video_id
                print(f"  subido: {video_id}")

                resultado = analyse(client, headers, video_id)
                registro.update(resultado)

                total = resultado["tiempos"][-1]["segundos_total"] if resultado["tiempos"] else 0
                ultima = resultado["events"][-1] if resultado["events"] else {}
                print(f"  {len(resultado['events'])} eventos en {total}s")
                print(f"  final: {ultima.get('stage')} / {ultima.get('state')}")

                case_id = find_case_id(resultado["events"])
                if case_id:
                    registro["case_id"] = case_id
                    caso = client.get(f"{BASE}/cases/{case_id}", headers=headers)
                    if caso.status_code == 200:
                        registro["caso"] = caso.json()
                        print(f"  caso: {case_id}")
                    else:
                        registro["caso_error"] = caso.status_code
            except Exception as exc:  # se guarda el fallo, no se pierde la corrida
                registro["error"] = f"{type(exc).__name__}: {exc}"
                print(f"  FALLÓ: {registro['error']}")

            destino.write_text(json.dumps(registro, ensure_ascii=False, indent=2))
            print(f"  guardado: {destino}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
