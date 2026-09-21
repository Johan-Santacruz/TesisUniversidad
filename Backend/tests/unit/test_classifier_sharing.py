"""Encoder compartido entre los dos modelos: cuándo sí y cuándo no.

Categoría y subcategoría se entrenaron congelando el encoder salvo su última capa,
así que la mayor parte de sus pesos son los mismos bytes y no hace falta tener dos
copias en memoria. Compartirlos ahorra unos 390 MB, pero compartir un bloque que
en realidad difiere le daría a un modelo el encoder del otro y las predicciones
saldrían mal sin que nada fallara. Estas pruebas fijan esa frontera.

No cargan los artefactos reales: construyen bloques diminutos con pesos conocidos.
"""
from __future__ import annotations

import torch
import torch.nn as nn

from app.ai.ml_service.classifier_service import ViolenceClassifier


class _Bloque(nn.Module):
    def __init__(self, valor: float) -> None:
        super().__init__()
        self.lineal = nn.Linear(2, 2)
        with torch.no_grad():
            self.lineal.weight.fill_(valor)
            self.lineal.bias.fill_(valor)


class _Encoder(nn.Module):
    def __init__(self, valores: list[float]) -> None:
        super().__init__()
        self.layer = nn.ModuleList(_Bloque(v) for v in valores)


class _Transformer(nn.Module):
    def __init__(self, embeddings: float, capas: list[float], pooler: float) -> None:
        super().__init__()
        self.embeddings = _Bloque(embeddings)
        self.encoder = _Encoder(capas)
        self.pooler = _Bloque(pooler)


class _Modelo(nn.Module):
    def __init__(self, embeddings: float, capas: list[float], pooler: float) -> None:
        super().__init__()
        self.transformer = _Transformer(embeddings, capas, pooler)


def _servicio(categoria: _Modelo, subcategoria: _Modelo) -> ViolenceClassifier:
    servicio = ViolenceClassifier.__new__(ViolenceClassifier)
    servicio.category_model = categoria
    servicio.subcategory_model = subcategoria
    return servicio


def test_comparte_solo_los_bloques_que_coinciden():
    categoria = _Modelo(embeddings=1.0, capas=[1.0, 2.0], pooler=1.0)
    # El artefacto de subcategoría trae el mismo tronco y una última capa distinta:
    # es exactamente lo que produce congelar el encoder salvo esa capa.
    artefacto = _Modelo(embeddings=1.0, capas=[1.0, 3.0], pooler=1.0).state_dict()
    subcategoria = _Modelo(embeddings=9.0, capas=[9.0, 9.0], pooler=9.0)

    compartidos = _servicio(categoria, subcategoria)._share_frozen_trunk(artefacto)

    assert compartidos == ["embeddings", "encoder.layer.0", "pooler"]
    assert subcategoria.transformer.embeddings is categoria.transformer.embeddings
    assert subcategoria.transformer.encoder.layer[0] is categoria.transformer.encoder.layer[0]
    assert subcategoria.transformer.encoder.layer[1] is not categoria.transformer.encoder.layer[1]


def test_la_capa_afinada_conserva_los_pesos_de_cada_modelo():
    """Tras compartir y cargar, cada modelo mantiene su propia última capa."""
    categoria = _Modelo(embeddings=1.0, capas=[1.0, 2.0], pooler=1.0)
    artefacto = _Modelo(embeddings=1.0, capas=[1.0, 3.0], pooler=1.0).state_dict()
    subcategoria = _Modelo(embeddings=9.0, capas=[9.0, 9.0], pooler=9.0)

    _servicio(categoria, subcategoria)._share_frozen_trunk(artefacto)
    subcategoria.load_state_dict(artefacto)

    ultima_categoria = categoria.transformer.encoder.layer[1].lineal.weight
    ultima_subcategoria = subcategoria.transformer.encoder.layer[1].lineal.weight
    assert torch.equal(ultima_categoria, torch.full((2, 2), 2.0))
    assert torch.equal(ultima_subcategoria, torch.full((2, 2), 3.0))

    # Y el tronco compartido sigue valiendo lo que valía: cargar el artefacto de
    # subcategoría encima no lo movió, porque era idéntico.
    assert torch.equal(
        categoria.transformer.embeddings.lineal.weight, torch.full((2, 2), 1.0)
    )


def test_un_encoder_entero_distinto_no_comparte_nada():
    """Si un reentrenamiento descongela el encoder, se gasta más RAM pero nada se mezcla."""
    categoria = _Modelo(embeddings=1.0, capas=[1.0, 2.0], pooler=1.0)
    artefacto = _Modelo(embeddings=5.0, capas=[5.0, 5.0], pooler=5.0).state_dict()
    subcategoria = _Modelo(embeddings=9.0, capas=[9.0, 9.0], pooler=9.0)

    compartidos = _servicio(categoria, subcategoria)._share_frozen_trunk(artefacto)

    assert compartidos == []
    assert subcategoria.transformer.embeddings is not categoria.transformer.embeddings
