"""La ventana deslizante: que el modelo lea el testimonio entero, no su principio."""
from pathlib import Path

import torch

from app.ai.ml_service.classifier_service import ViolenceClassifier


CLS, SEP, PAD = 101, 102, 0


class _Tokenizer:
    """Tokenizador de juguete: una palabra, un id. Basta para medir las ventanas."""

    cls_token_id = CLS
    sep_token_id = SEP
    pad_token_id = PAD

    def __call__(self, text: str, add_special_tokens: bool = True) -> dict[str, list[int]]:
        return {"input_ids": [1000 + i for i, _ in enumerate(text.split())]}


def _service() -> ViolenceClassifier:
    service = ViolenceClassifier.__new__(ViolenceClassifier)
    service.tokenizer = _Tokenizer()
    service.device = torch.device("cpu")
    return service


def _texto(palabras: int) -> str:
    return " ".join(f"p{i}" for i in range(palabras))


def test_texto_corto_es_una_sola_ventana():
    """Con lo que cabía antes, el resultado tiene que ser el mismo de siempre."""
    windows = _service()._token_windows(_texto(20), max_len=32)

    assert windows["input_ids"].shape == (1, 32)
    assert windows["input_ids"][0][0].item() == CLS
    # 20 palabras + [CLS] + [SEP] = 22 posiciones reales, el resto es relleno.
    assert windows["attention_mask"][0].sum().item() == 22


def test_texto_largo_se_reparte_en_varias_ventanas():
    windows = _service()._token_windows(_texto(300), max_len=32)

    assert windows["input_ids"].shape[0] > 1
    assert windows["input_ids"].shape[1] == 32
    # Ninguna ventana queda a medias: todas van llenas.
    assert windows["attention_mask"].sum(dim=1).min().item() == 32


def test_la_ultima_ventana_llega_al_final_del_texto():
    """El fallo que motivó esto: el cierre del relato no lo leía nadie."""
    palabras = 300
    windows = _service()._token_windows(_texto(palabras), max_len=32)

    ultimo_id = 1000 + palabras - 1
    ultima_ventana = windows["input_ids"][-1].tolist()
    assert ultimo_id in ultima_ventana


def test_las_ventanas_se_solapan():
    """Una frase partida por el corte sobrevive entera en la ventana siguiente."""
    windows = _service()._token_windows(_texto(300), max_len=32)

    primera = set(windows["input_ids"][0].tolist())
    segunda = set(windows["input_ids"][1].tolist())
    solape = primera & segunda - {CLS, SEP, PAD}
    assert solape, "sin solape, el corte parte frases sin red"


def test_sin_archivo_de_calibracion_la_temperatura_es_neutra(tmp_path: Path):
    """Un despliegue sin calibrar tiene que comportarse igual que antes."""
    service = ViolenceClassifier.__new__(ViolenceClassifier)
    service.artifact_dir = tmp_path

    assert service._load_calibration() == (1.0, 1.0)
