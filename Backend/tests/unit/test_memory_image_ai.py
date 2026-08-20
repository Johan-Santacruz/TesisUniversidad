from __future__ import annotations

import base64
import json
from dataclasses import asdict
from types import SimpleNamespace

import pytest

from app.ai.memory_images import (
    GeneratedImage,
    MemoryImageProviderError,
    OpenAIMemoryImageAdapter,
    VisualContext,
    build_memory_prompt,
    build_visual_context,
)


PNG_BYTES = b"\x89PNG\r\n\x1a\nimage-data"
PRIVATE_NAME = "María del Carmen Paredes"
PRIVATE_TESTIMONY = "El 14 de marzo salimos por la amenaza que recibimos."
PRIVATE_ADDRESS = "Carrera 7 # 12-34, El Tambo, Cauca"
PRIVATE_SEGMENT_ID = "segment-private-001"


def _fact(key: str, value: object, **extra: object) -> dict[str, object]:
    return {
        "id": f"fact-{key}",
        "key": key,
        "value": value,
        "evidence": [{"segment_id": PRIVATE_SEGMENT_ID}],
        **extra,
    }


def _classification() -> dict[str, object]:
    return {
        "status": "available",
        "category": {"label": "Desplazamiento forzado", "confidence": 0.91},
        "subcategory": {
            "label": "Amenazas (individuales/colectivas)",
            "confidence": 0.87,
        },
    }


def test_visual_context_exposes_only_allowlisted_categorical_values():
    context = build_visual_context(
        _classification(),
        [
            _fact("people", PRIVATE_NAME),
            _fact("person_name", PRIVATE_NAME),
            _fact("testimony", PRIVATE_TESTIMONY),
            _fact("origin_location", PRIVATE_ADDRESS),
            _fact("current_location", "Bogotá, Colombia"),
            _fact("date", "2024-03-14"),
            _fact("urgency", "high"),
            _fact("vulnerabilities", ["niñas", "niños"]),
            _fact("origin_setting", "rural"),
            _fact("reception_setting", "urbano"),
        ],
    )

    assert context == VisualContext(
        category="Desplazamiento forzado",
        subcategory="Amenazas (individuales/colectivas)",
        setting="rural a urbano",
        # La dirección exacta se leyó aquí y sólo sobrevivió su región natural.
        region="andina",
        period="periodo reciente",
        scene=(
            "el camino de salida, con una puerta que queda atrás y "
            "un sendero que se aleja"
        ),
        nuance="una casa dejada por precaución, con la puerta entornada",
        themes=("desarraigo", "tránsito", "búsqueda de protección"),
    )
    serialized = json.dumps(asdict(context), ensure_ascii=False)
    for forbidden in (
        PRIVATE_NAME,
        PRIVATE_TESTIMONY,
        PRIVATE_SEGMENT_ID,
        PRIVATE_ADDRESS,
        "people",
        "current_location",
    ):
        assert forbidden not in serialized


def test_visual_context_uses_generic_setting_without_allowlisted_categories():
    context = build_visual_context(
        _classification(),
        [
            _fact("origin_location", "Vereda La Esperanza, El Tambo"),
            _fact("current_location", "Bogotá, Colombia"),
        ],
    )

    assert context.setting == "origen a recepción"


def test_visual_context_rejects_unrecognized_classification_labels():
    context = build_visual_context(
        {
            "category": {"label": PRIVATE_NAME},
            "subcategory": {"label": PRIVATE_ADDRESS},
        },
        [],
    )

    assert context.category == "No especificada"
    assert context.subcategory == "No especificada"


def test_visual_context_rejects_directly_supplied_private_values():
    with pytest.raises(ValueError):
        VisualContext(
            category=PRIVATE_NAME,
            subcategory=PRIVATE_ADDRESS,
            setting="rural a urbano",
            region="",
            period="periodo reciente",
            scene=PRIVATE_TESTIMONY,
            nuance=PRIVATE_ADDRESS,
            themes=("desarraigo", "tránsito", "búsqueda de protección"),
        )


def test_memory_prompt_is_deterministic_and_prohibits_identifying_content():
    context = build_visual_context(
        _classification(),
        [
            _fact("people", PRIVATE_NAME),
            _fact("testimony", PRIVATE_TESTIMONY),
            _fact("origin_location", PRIVATE_ADDRESS),
            _fact("current_location", "Bogotá, Colombia"),
            _fact("origin_setting", "rural"),
            _fact("reception_setting", "urbano"),
        ],
    )

    prompt = build_memory_prompt(context)

    assert prompt == build_memory_prompt(context)
    for required in (
        "16:9",
        "dibujada a mano",
        "No es una fotografía",
        "zona tranquila en la parte inferior para",
        "sin escenas del hecho",
        "sin menores reconocibles",
        "sin violencia explícita",
        "sin personas identificables",
        "sin texto generado",
        "sin logotipos",
        "sin banderas",
        "sin escudos",
        "sin encuadres probatorios de ubicaciones exactas",
        "sin sensacionalismo",
        "sin afirmaciones de documentación real",
    ):
        assert required in prompt
    for forbidden in (
        PRIVATE_NAME,
        PRIVATE_TESTIMONY,
        PRIVATE_ADDRESS,
        "Bogotá, Colombia",
    ):
        assert forbidden not in prompt


def test_memory_prompt_rejects_an_unvalidated_context_lookalike():
    class UnsafeContext:
        category = PRIVATE_NAME
        subcategory = PRIVATE_TESTIMONY
        setting = PRIVATE_ADDRESS
        period = "periodo reciente"
        themes = ("desarraigo",)

    with pytest.raises(TypeError, match="VisualContext"):
        build_memory_prompt(UnsafeContext())


class FakeImages:
    def __init__(self, response: object | BaseException) -> None:
        self.response = response
        self.calls: list[dict[str, object]] = []

    def generate(self, **kwargs: object) -> object:
        self.calls.append(kwargs)
        if isinstance(self.response, BaseException):
            raise self.response
        return self.response


class FakeClient:
    def __init__(self, response: object | BaseException) -> None:
        self.images = FakeImages(response)


def _image_response(payload: bytes) -> SimpleNamespace:
    return SimpleNamespace(
        data=[SimpleNamespace(b64_json=base64.b64encode(payload).decode("ascii"))]
    )


def test_adapter_returns_validated_png_and_uses_the_configured_image_model():
    client = FakeClient(_image_response(PNG_BYTES))
    prompt = "Prompt de prueba"

    result = OpenAIMemoryImageAdapter(
        client=client,
        max_bytes=1024,
        model="configured-image-model",
    ).generate(prompt)

    assert result == GeneratedImage(data=PNG_BYTES, mime_type="image/png")
    assert client.images.calls == [
        {
            "model": "configured-image-model",
            "prompt": prompt,
            "size": "1536x864",
            "quality": "high",
            "output_format": "png",
        }
    ]


@pytest.mark.parametrize(
    "response,max_bytes",
    [
        (
            SimpleNamespace(data=[SimpleNamespace(b64_json="not-base64%%")]),
            1024,
        ),
        (SimpleNamespace(data=[]), 1024),
        (_image_response(b"not-a-png"), 1024),
        (_image_response(PNG_BYTES + b"x" * 32), len(PNG_BYTES)),
        (RuntimeError("sdk unavailable"), 1024),
    ],
    ids=["malformed-base64", "empty-output", "non-png", "oversized", "sdk-error"],
)
def test_adapter_converts_invalid_provider_output_to_provider_error(
    response: object | BaseException,
    max_bytes: int,
):
    adapter = OpenAIMemoryImageAdapter(
        client=FakeClient(response),
        max_bytes=max_bytes,
        model="gpt-image-2",
    )

    with pytest.raises(MemoryImageProviderError):
        adapter.generate("Prompt de prueba")


def test_each_documented_category_produces_its_own_scene_and_themes():
    """Breaks if every case collapses into one interchangeable prompt again."""
    prompts = {}
    for category, subcategory in (
        ("Acciones armadas", "Combates"),
        ("Ataques contra la población civil", "Amenazas (individuales/colectivas)"),
        ("Desplazamiento forzado", "Hostigamiento"),
        ("Restricción al acceso humanitario", "Secuestro"),
        ("Uso de artefactos explosivos", "Mina antipersonal - MAP"),
    ):
        context = build_visual_context(
            {
                "category": {"label": category},
                "subcategory": {"label": subcategory},
            },
            [],
        )
        assert context.category == category
        assert context.subcategory == subcategory
        prompts[category] = build_memory_prompt(context)

    assert len(set(prompts.values())) == len(prompts)


def test_each_region_reaches_the_prompt_only_as_a_natural_region():
    """Breaks if an exact place survives into the provider request."""
    for place, landscape in (
        ("Vereda El Mirador, El Tambo, Cauca", "andino"),
        ("Corregimiento La Playa, Riohacha, La Guajira", "caribe"),
        ("Zona rural de Quibdó, Chocó", "pacífico"),
        ("Finca El Retiro, Yopal, Casanare", "llanero"),
        ("Ribera del río, Leticia, Amazonas", "amazónico"),
    ):
        context = build_visual_context(
            {"category": {"label": "Desplazamiento forzado"}},
            [{"key": "origin_location", "value": place}],
        )
        prompt = build_memory_prompt(context)

        assert landscape in prompt
        for fragment in place.split(", "):
            assert fragment not in prompt


def test_an_unmapped_place_falls_back_to_a_neutral_landscape():
    """Breaks if an unknown municipality invents a region it never documented."""
    context = build_visual_context(
        {"category": {"label": "Desplazamiento forzado"}},
        [{"key": "origin_location", "value": "Marquetalia"}],
    )

    assert context.region == ""
    assert "paisaje rural colombiano" in build_memory_prompt(context)


def test_the_prompt_never_asks_for_the_act_itself():
    """Breaks if the closing starts depicting the violence it accompanies."""
    for category in (
        "Acciones armadas",
        "Ataques contra la población civil",
        "Uso de artefactos explosivos",
    ):
        prompt = build_memory_prompt(
            build_visual_context({"category": {"label": category}}, [])
        )

        for forbidden in ("arma", "herida", "cuerpo", "uniforme", "combatiente"):
            # Sólo aparecen dentro de la lista de prohibiciones.
            prohibitions = prompt[prompt.index("Prohibiciones:"):]
            assert forbidden not in prompt[: prompt.index("Prohibiciones:")]
            assert forbidden in prohibitions or forbidden == "combatiente"
