"""Prueba el fotograma de referencia sobre un video, sin tocar la base de datos.

Dos etapas, para no gastar una llamada a la API a ciegas:

    # 1. sólo mira qué fotograma elegiría (gratis)
    .venv/bin/python scripts/probar_fotograma.py video.mp4

    # 2. además genera la imagen conmemorativa (consume API)
    .venv/bin/python scripts/probar_fotograma.py video.mp4 --generar

La primera etapa responde a la pregunta que importa antes de nada: qué ve el
modelo. Si el fotograma es una pared o un primer plano de la persona, la
referencia no va a aportar lugar y conviene ajustar antes de generar.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.ai.memory_images import build_memory_prompt, build_visual_context  # noqa: E402
from app.services.reference_frames import (  # noqa: E402
    ReferenceFrameExtractor,
    ReferenceFrameUnavailable,
    _visual_information,
)


class _ArchivoLocal:
    """Hace pasar un archivo suelto por el servicio de video."""

    def __init__(self, path: Path) -> None:
        self.path = path

    def iter_plain_chunks(self, video: object):
        with open(self.path, "rb") as handle:
            while chunk := handle.read(1024 * 1024):
                yield chunk


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("video", type=Path)
    parser.add_argument("--generar", action="store_true", help="llama a la API de imagen")
    parser.add_argument("--categoria", default="Desplazamiento forzado")
    parser.add_argument("--subcategoria", default="No especificada")
    parser.add_argument("--departamento", default="Chocó")
    parser.add_argument("--salida", type=Path, default=Path("prueba-fotograma"))
    args = parser.parse_args()

    if not args.video.is_file():
        print(f"No existe el video: {args.video}")
        return 1
    args.salida.mkdir(parents=True, exist_ok=True)

    extractor = ReferenceFrameExtractor(video_service=_ArchivoLocal(args.video))
    try:
        frame = extractor.extract(object())
    except ReferenceFrameUnavailable as exc:
        print(f"Sin fotograma aprovechable: {exc}")
        print("La imagen se generaría sólo con el contexto, como antes.")
        return 0

    destino = args.salida / "fotograma.png"
    destino.write_bytes(frame.data)
    print(f"Fotograma elegido: segundo {frame.at_seconds:.1f}")
    print(f"Información visual: {_visual_information(destino):.1f} (umbral 12.0)")
    print(f"Guardado en: {destino.resolve()}")
    print("\nÁbrelo y mira qué hay: ¿territorio, casa, camino? ¿o una pared y un rostro?")

    contexto = build_visual_context(
        {
            "category": {"label": args.categoria},
            "subcategory": {"label": args.subcategoria},
        },
        [{"key": "place", "value": args.departamento}],
    )
    prompt = build_memory_prompt(contexto, with_reference=True)
    (args.salida / "prompt.txt").write_text(prompt, encoding="utf-8")
    print(f"Prompt guardado en: {(args.salida / 'prompt.txt').resolve()}")

    if not args.generar:
        print("\nPara generar la imagen: vuelve a ejecutar con --generar")
        return 0

    from app.config import Settings  # noqa: PLC0415
    from openai import OpenAI  # noqa: PLC0415
    from app.ai.memory_images import OpenAIMemoryImageAdapter  # noqa: PLC0415

    settings = Settings()
    clave = settings.openai_api_key.get_secret_value() if settings.openai_api_key else ""
    if not clave:
        print("\nNo hay SENDA_OPENAI_API_KEY configurada; no se puede generar.")
        return 1

    print("\nGenerando la imagen conmemorativa...")
    adaptador = OpenAIMemoryImageAdapter(
        client=OpenAI(api_key=clave),
        max_bytes=settings.memory_image_max_bytes,
        model=settings.openai_image_model,
    )
    imagen = adaptador.generate(prompt, frame.data)
    final = args.salida / "imagen-con-referencia.png"
    final.write_bytes(imagen.data)
    print(f"Imagen guardada en: {final.resolve()}")

    print("Generando la versión SIN referencia, para comparar...")
    sin = adaptador.generate(build_memory_prompt(contexto))
    comparacion = args.salida / "imagen-sin-referencia.png"
    comparacion.write_bytes(sin.data)
    print(f"Comparación en: {comparacion.resolve()}")
    print("\nMira las dos juntas: la de referencia debería reconocerse como ESE lugar.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
