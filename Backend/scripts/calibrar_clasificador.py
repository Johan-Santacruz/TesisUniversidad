"""Mide la ventana deslizante y calibra la temperatura del clasificador.

Responde a dos cosas que el número en pantalla no decía:

  1. Truncar en MAX_LEN descartaba en silencio todo lo que pasara de ~128 tokens.
     Aquí se compara, sobre la misma partición de test, truncar contra leer el texto
     entero en ventanas solapadas.
  2. El softmax crudo no es una probabilidad de acertar. Con LABEL_SMOOTHING 0.2 el
     objetivo de la clase correcta durante el entrenamiento fue 0.84, no 1.0. Se ajusta
     una temperatura sobre validación y se reporta el ECE antes y después.

Sólo cubre CATEGORÍA. El CSV de subcategoría disponible no corresponde a los artefactos
desplegados (1806 filas y 10 clases frente a las 2208 y 15 del artefacto, con 6 clases
ausentes), así que una temperatura ajustada ahí no describiría al modelo que corre.

    python scripts/calibrar_clasificador.py --datos <ruta.csv> [--escribir]
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from sklearn.metrics import accuracy_score, f1_score
from sklearn.model_selection import train_test_split

from app.ai.ml_service.classifier_service import ViolenceClassifier


SEED = 42
VAL_SIZE = 0.15
TEST_SIZE = 0.15
TEXT_COLUMN = "texto_evento"
LABEL_COLUMN = "categoria_modelo"


def split_como_el_notebook(frame: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Reproduce stratified_event_split() del notebook: mismas semillas y proporciones."""
    _, resto = train_test_split(
        frame,
        test_size=VAL_SIZE + TEST_SIZE,
        random_state=SEED,
        stratify=frame[LABEL_COLUMN],
    )
    relativo = TEST_SIZE / (VAL_SIZE + TEST_SIZE)
    validacion, prueba = train_test_split(
        resto,
        test_size=relativo,
        random_state=SEED,
        stratify=resto[LABEL_COLUMN],
    )
    return validacion.reset_index(drop=True), prueba.reset_index(drop=True)


@torch.inference_mode()
def logits_truncando(service: ViolenceClassifier, textos: list[str], lote: int = 16) -> np.ndarray:
    """El camino anterior: un corte duro en MAX_LEN y el resto al suelo."""
    salida = []
    for inicio in range(0, len(textos), lote):
        encoded = service.tokenizer(
            textos[inicio:inicio + lote],
            truncation=True,
            padding="max_length",
            max_length=service.category_max_len,
            return_tensors="pt",
        )
        encoded = {
            clave: valor.to(service.device)
            for clave, valor in encoded.items()
            if clave in {"input_ids", "attention_mask"}
        }
        salida.append(service.category_model(**encoded).float().cpu().numpy())
    return np.concatenate(salida)


@torch.inference_mode()
def logits_con_ventanas(service: ViolenceClassifier, textos: list[str]) -> np.ndarray:
    """El camino nuevo: el texto entero, en ventanas solapadas, promediado."""
    return np.stack([
        service._pool(
            service.category_model(**service._token_windows(texto, service.category_max_len))
        ).squeeze(0).float().cpu().numpy()
        for texto in textos
    ])


def ece(probabilidades: np.ndarray, aciertos: np.ndarray, bins: int = 15) -> float:
    """Expected Calibration Error: cuánto se aparta la confianza de la tasa real de acierto."""
    confianza = probabilidades.max(axis=1)
    bordes = np.linspace(0.0, 1.0, bins + 1)
    total = 0.0
    for bajo, alto in zip(bordes[:-1], bordes[1:]):
        dentro = (confianza > bajo) & (confianza <= alto)
        if not dentro.any():
            continue
        total += dentro.mean() * abs(aciertos[dentro].mean() - confianza[dentro].mean())
    return float(total)


def softmax(logits: np.ndarray, temperatura: float = 1.0) -> np.ndarray:
    escalados = logits / temperatura
    estables = escalados - escalados.max(axis=1, keepdims=True)
    exponenciales = np.exp(estables)
    return exponenciales / exponenciales.sum(axis=1, keepdims=True)


def ajustar_temperatura(logits: np.ndarray, verdad: np.ndarray) -> float:
    """Busca la T que minimiza la NLL en validación. Un solo escalar, como en Guo et al."""
    tensor_logits = torch.tensor(logits, dtype=torch.float32)
    tensor_verdad = torch.tensor(verdad, dtype=torch.long)
    log_t = torch.zeros(1, requires_grad=True)
    optimizador = torch.optim.LBFGS([log_t], lr=0.1, max_iter=200)

    def paso() -> torch.Tensor:
        optimizador.zero_grad()
        # Se optimiza log(T) para que T no pueda volverse negativa ni cero.
        perdida = torch.nn.functional.cross_entropy(
            tensor_logits / torch.exp(log_t), tensor_verdad
        )
        perdida.backward()
        return perdida

    optimizador.step(paso)
    return float(torch.exp(log_t).item())


def informe(nombre: str, logits: np.ndarray, verdad: np.ndarray, largos: np.ndarray) -> dict:
    predicho = logits.argmax(axis=1)
    datos = {
        "accuracy": accuracy_score(verdad, predicho),
        "f1_macro": f1_score(verdad, predicho, average="macro"),
        "accuracy_largos": accuracy_score(verdad[largos], predicho[largos]) if largos.any() else float("nan"),
    }
    print(
        f"  {nombre:<26} accuracy {datos['accuracy']:.4f}"
        f" | F1 macro {datos['f1_macro']:.4f}"
        f" | accuracy en textos largos {datos['accuracy_largos']:.4f}"
    )
    return datos


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--datos", required=True, type=Path)
    parser.add_argument(
        "--artefactos",
        type=Path,
        default=Path("ml-artifacts/violencia_classifier_artifacts"),
    )
    parser.add_argument(
        "--escribir",
        action="store_true",
        help="guarda calibration.json junto a los artefactos",
    )
    args = parser.parse_args()

    frame = pd.read_csv(args.datos, sep=";", encoding="utf-8-sig")
    frame = frame[frame[TEXT_COLUMN].notna() & frame[LABEL_COLUMN].notna()]
    validacion, prueba = split_como_el_notebook(frame)
    print(f"validación {len(validacion)} · prueba {len(prueba)} (de {len(frame)})\n")

    service = ViolenceClassifier(args.artefactos)
    if torch.backends.mps.is_available():
        service.device = torch.device("mps")
        service.category_model.to(service.device)
    clases = list(service.category_encoder.classes_)
    indice = {clase: i for i, clase in enumerate(clases)}

    def preparar(marco: pd.DataFrame):
        textos = marco[TEXT_COLUMN].astype(str).tolist()
        verdad = np.array([indice[etiqueta] for etiqueta in marco[LABEL_COLUMN]])
        # "Largo" = lo que el truncado no alcanzaba a leer entero.
        cuerpo = service.window_body(service.category_max_len)
        largos = np.array([
            len(service.tokenizer(texto, add_special_tokens=False)["input_ids"]) > cuerpo
            for texto in textos
        ])
        return textos, verdad, largos

    textos_prueba, verdad_prueba, largos_prueba = preparar(prueba)
    print(f"textos de prueba que el truncado cortaba: {largos_prueba.sum()} de {len(largos_prueba)}\n")

    print("PRUEBA")
    truncado = logits_truncando(service, textos_prueba)
    informe("truncando (antes)", truncado, verdad_prueba, largos_prueba)
    ventanas = logits_con_ventanas(service, textos_prueba)
    informe("con ventanas (ahora)", ventanas, verdad_prueba, largos_prueba)

    print("\nCALIBRACIÓN (T ajustada en validación, medida en prueba)")
    textos_val, verdad_val, _ = preparar(validacion)
    logits_val = logits_con_ventanas(service, textos_val)
    temperatura = ajustar_temperatura(logits_val, verdad_val)

    aciertos = (ventanas.argmax(axis=1) == verdad_prueba).astype(float)
    antes = softmax(ventanas)
    despues = softmax(ventanas, temperatura)
    print(f"  temperatura ajustada: T = {temperatura:.4f}")
    print(f"  ECE antes   {ece(antes, aciertos):.4f}  (confianza media {antes.max(axis=1).mean():.4f})")
    print(f"  ECE después {ece(despues, aciertos):.4f}  (confianza media {despues.max(axis=1).mean():.4f})")
    print(f"  tasa real de acierto: {aciertos.mean():.4f}")

    # Las cuatro palabras de la interfaz se apoyan en este número: conviene ver en qué
    # cubo cae cada lectura antes y después, porque una escala donde todo dice lo mismo
    # no informa de nada.
    print("\n  cómo caen las palabras de la interfaz (umbrales 85 / 65 / 35)")
    for nombre, matriz in (("antes", antes), ("después", despues)):
        maximos = matriz.max(axis=1)
        cubos = {
            "firme": maximos >= 0.85,
            "probable": (maximos >= 0.65) & (maximos < 0.85),
            "provisional": (maximos >= 0.35) & (maximos < 0.65),
            "débil": maximos < 0.35,
        }
        reparto = " · ".join(
            f"{etiqueta} {mascara.mean():.0%}" for etiqueta, mascara in cubos.items()
        )
        print(f"    {nombre:<8} {reparto}")

    if args.escribir:
        destino = args.artefactos / "calibration.json"
        destino.write_text(
            json.dumps(
                {
                    "category_temperature": temperatura,
                    "subcategory_temperature": 1.0,
                    "subcategory_reason": (
                        "Sin calibrar: el CSV de subcategoría disponible no corresponde a "
                        "estos artefactos (1806 filas y 10 clases frente a 2208 y 15)."
                    ),
                    "fitted_on": "validación, split SEED 42 / 0.15 / 0.15, camino con ventanas",
                },
                ensure_ascii=False,
                indent=2,
            ) + "\n",
            encoding="utf-8",
        )
        print(f"\nescrito {destino}")


if __name__ == "__main__":
    main()
