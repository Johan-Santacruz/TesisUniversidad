from __future__ import annotations

from pathlib import Path
from typing import Any
import json

import joblib
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from transformers import AutoModel, AutoTokenizer


class TransformerClasificador(nn.Module):
    def __init__(
        self,
        model_name: str,
        num_classes: int,
        dropout: float = 0.35,
        extra_features: int = 0,
        head_hidden: int = 256,
    ):
        super().__init__()
        self.transformer = AutoModel.from_pretrained(model_name)
        hidden = self.transformer.config.hidden_size
        self.dropout = nn.Dropout(dropout)
        # El ancho de la cabeza dejó de ser fijo: los perfiles de control de sobreajuste
        # del notebook la estrechan (256 -> 96 -> 64). Si aquí se asume 256, load_state_dict
        # falla con error de forma al cargar cualquier artefacto entrenado con un perfil.
        self.fc1 = nn.Linear(hidden + extra_features, head_hidden)
        self.drop2 = nn.Dropout(dropout)
        self.out = nn.Linear(head_hidden, num_classes)

    def forward(self, input_ids: torch.Tensor, attention_mask: torch.Tensor, extra: torch.Tensor | None = None) -> torch.Tensor:
        outputs = self.transformer(input_ids=input_ids, attention_mask=attention_mask)
        cls = outputs.last_hidden_state[:, 0, :]
        cls = self.dropout(cls)
        if extra is not None:
            cls = torch.cat([cls, extra], dim=1)
        x = F.gelu(self.fc1(cls))
        x = self.drop2(x)
        return self.out(x)


class ViolenceClassifier:
    def __init__(self, artifact_dir: Path):
        self.artifact_dir = artifact_dir
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.config = self._load_config()
        category_config = self._task_config("categoria")
        subcategory_config = self._task_config("subcategoria")
        self.model_name = category_config["MODEL_NAME"]
        # Categoría y subcategoría pueden entrenarse con contexto distinto: el notebook
        # aplica AJUSTES_SUBCATEGORIA sobre MAX_LEN_CAP. Truncar en inferencia con un tope
        # distinto al del entrenamiento degrada la predicción sin lanzar ningún error.
        self.category_max_len = int(category_config.get("MAX_LEN", 256))
        self.subcategory_max_len = int(subcategory_config.get("MAX_LEN", self.category_max_len))
        self.max_len = self.category_max_len
        self.dropout = float(category_config.get("DROPOUT", 0.35))

        self.tokenizer = AutoTokenizer.from_pretrained(artifact_dir / "tokenizer")
        self.category_encoder = joblib.load(artifact_dir / "label_encoder_categoria.joblib")
        self.subcategory_encoder = joblib.load(artifact_dir / "label_encoder_subcategoria.joblib")
        self.category_to_subcategories = self._load_hierarchy()
        self.subcategory_mask = self._build_mask()

        self.category_model = TransformerClasificador(
            self.model_name,
            len(self.category_encoder.classes_),
            self.dropout,
            head_hidden=int(category_config.get("HEAD_HIDDEN", 256)),
        ).to(self.device)
        self.subcategory_model = TransformerClasificador(
            self.model_name,
            len(self.subcategory_encoder.classes_),
            float(subcategory_config.get("DROPOUT", self.dropout)),
            extra_features=len(self.category_encoder.classes_),
            head_hidden=int(subcategory_config.get("HEAD_HIDDEN", 256)),
        ).to(self.device)

        self.category_model.load_state_dict(
            torch.load(artifact_dir / "model_categoria.pt", map_location=self.device)
        )
        self.subcategory_model.load_state_dict(
            torch.load(artifact_dir / "model_subcategoria.pt", map_location=self.device)
        )
        self.category_model.eval()
        self.subcategory_model.eval()

        self.category_temperature, self.subcategory_temperature = self._load_calibration()

    def _load_hierarchy(self) -> dict[str, list[str]] | None:
        """Devuelve el mapa categoria -> subcategorias alcanzables, o None.

        Sin este mapa el servicio no puede saber que una subcategoria es imposible para la
        categoria predicha, y devuelve el argmax global. Con los artefactos v1 eso hacia que
        todo evento de "Desplazamiento forzado" recibiera una subcategoria de otra familia
        con confianza superior a 0.9. Si el artefacto no trae el mapa se conserva el
        comportamiento anterior, para no romper despliegues con artefactos antiguos.
        """
        raw = self.config.get("category_to_subcategories")
        if not isinstance(raw, dict):
            return None
        known = set(self.subcategory_encoder.classes_)
        return {
            str(category): [str(sub) for sub in subs if str(sub) in known]
            for category, subs in raw.items()
            if isinstance(subs, list)
        }

    def _build_mask(self) -> np.ndarray | None:
        """Matriz booleana (categorias x subcategorias) de pares compatibles."""
        if self.category_to_subcategories is None:
            return None
        sub_index = {str(label): i for i, label in enumerate(self.subcategory_encoder.classes_)}
        mask = np.zeros(
            (len(self.category_encoder.classes_), len(self.subcategory_encoder.classes_)),
            dtype=bool,
        )
        for row, category in enumerate(self.category_encoder.classes_):
            for sub in self.category_to_subcategories.get(str(category), []):
                position = sub_index.get(str(sub))
                if position is not None:
                    mask[row, position] = True
        return mask

    def _task_config(self, task: str) -> dict[str, Any]:
        """Configuración de una tarea, con respaldo en la global.

        El notebook permite perfiles distintos por tarea, así que categoría y subcategoría
        pueden diferir en HEAD_HIDDEN, DROPOUT y MAX_LEN. Los artefactos antiguos sólo traen
        'config': en ese caso las dos tareas la comparten y el comportamiento no cambia.
        """
        base = self.config.get("config", {})
        specific = self.config.get(f"config_{task}")
        if isinstance(specific, dict):
            return {**base, **specific}
        return base

    def _load_config(self) -> dict[str, Any]:
        config_path = self.artifact_dir / "metrics_config_singlelabel.json"
        if not config_path.exists():
            raise FileNotFoundError(f"No existe {config_path}")
        return json.loads(config_path.read_text(encoding="utf-8"))

    def _load_calibration(self) -> tuple[float, float]:
        """Temperaturas de calibración, o (1.0, 1.0) si no hay archivo.

        El softmax crudo no es una probabilidad de acertar: con LABEL_SMOOTHING 0.2 el
        objetivo de la clase correcta durante el entrenamiento fue 0.84, no 1.0, así que
        la escala no es la que el número aparenta. Dividir el logit por una temperatura
        ajustada en validación lo acerca a una probabilidad. Sin el archivo la división
        es por 1 y el comportamiento es idéntico al anterior.
        """
        path = self.artifact_dir / "calibration.json"
        if not path.exists():
            return 1.0, 1.0
        data = json.loads(path.read_text(encoding="utf-8"))
        return (
            float(data.get("category_temperature", 1.0)) or 1.0,
            float(data.get("subcategory_temperature", 1.0)) or 1.0,
        )

    def _special_token_ids(self) -> tuple[list[int], list[int]]:
        """[CLS] y [SEP] del tokenizador, o listas vacías si no los define."""
        cls_id = getattr(self.tokenizer, "cls_token_id", None)
        sep_id = getattr(self.tokenizer, "sep_token_id", None)
        return (
            [cls_id] if cls_id is not None else [],
            [sep_id] if sep_id is not None else [],
        )

    def window_body(self, max_len: int) -> int:
        """Tokens de texto que caben en una ventana, sin contar los especiales."""
        prefijo, sufijo = self._special_token_ids()
        return max_len - len(prefijo) - len(sufijo)

    def _token_windows(self, text: str, max_len: int) -> dict[str, torch.Tensor]:
        """Parte el texto en ventanas solapadas de max_len tokens.

        Antes esto era `truncation=True`: de un testimonio de varios minutos el modelo
        leía los primeros ~128 tokens —alrededor de 45 segundos hablados— y el resto se
        descartaba en silencio, sin que nada en la respuesta lo dijera. El modelo se
        entrenó además con reportes de evento de unas 71 palabras de mediana, así que una
        ventana se le parece mucho más que un transcript entero.

        Devuelve un lote (n_ventanas, max_len). Para un texto corto es una sola ventana y
        el resultado coincide con el del truncado.
        """
        prefijo, sufijo = self._special_token_ids()
        body = max_len - len(prefijo) - len(sufijo)
        ids = self.tokenizer(text, add_special_tokens=False)["input_ids"]
        if len(ids) <= body:
            starts = [0]
        else:
            # Un cuarto de solape: una frase partida por el corte sobrevive entera en la
            # ventana siguiente.
            stride = max(1, body - body // 4)
            starts = list(range(0, len(ids) - body + 1, stride))
            # La última se ancla al final en vez de dejar fuera un resto corto: si no,
            # el cierre del relato no lo lee ninguna ventana.
            if starts[-1] != len(ids) - body:
                starts.append(len(ids) - body)

        pad_id = self.tokenizer.pad_token_id or 0
        input_ids: list[list[int]] = []
        attention: list[list[int]] = []
        for start in starts:
            window = prefijo + ids[start:start + body] + sufijo
            padding = max_len - len(window)
            input_ids.append(window + [pad_id] * padding)
            attention.append([1] * len(window) + [0] * padding)

        return {
            "input_ids": torch.tensor(input_ids, device=self.device),
            "attention_mask": torch.tensor(attention, device=self.device),
        }

    @staticmethod
    def _pool(logits: torch.Tensor) -> torch.Tensor:
        """Promedia los logits de las ventanas en un solo vector de documento.

        Se promedian logits y no probabilidades por dos razones: compone con la
        temperatura —que actúa sobre el logit— y no deja que una sola ventana muy
        segura arrastre al resto, que es lo que haría un máximo.
        """
        return logits.mean(dim=0, keepdim=True)

    @staticmethod
    def _top_probabilities(classes: np.ndarray, probs: np.ndarray, limit: int = 5) -> list[dict[str, float | str]]:
        top_idx = probs.argsort()[-limit:][::-1]
        return [
            {
                "label": str(classes[index]),
                "confidence": float(probs[index]),
            }
            for index in top_idx
            # Tras el enmascaramiento jerarquico las clases de otra familia valen 0:
            # listarlas sugeriria que fueron candidatas cuando estaban descartadas.
            if probs[index] > 0
        ]

    @torch.inference_mode()
    def predict(self, text: str) -> dict[str, Any]:
        clean_text = text.strip()
        if not clean_text:
            raise ValueError("El texto no puede estar vacio.")

        windows = self._token_windows(clean_text, self.category_max_len)
        category_logits = self._pool(self.category_model(**windows))
        # La distribución que ve el modelo de subcategoría va SIN calibrar: se entrenó
        # recibiendo el softmax crudo (get_category_extra), y darle uno con temperatura
        # sería una entrada que nunca vio. La temperatura sólo afecta al número que se
        # publica, no a ninguna predicción.
        category_distribution = torch.softmax(category_logits, dim=1)
        category_probs = (
            torch.softmax(category_logits / self.category_temperature, dim=1)
            .squeeze(0).detach().cpu().numpy()
        )
        category_idx = int(category_probs.argmax())
        category_label = str(self.category_encoder.inverse_transform([category_idx])[0])

        subcategory_windows = (
            windows
            if self.subcategory_max_len == self.category_max_len
            else self._token_windows(clean_text, self.subcategory_max_len)
        )
        # La categoría es una decisión de documento: cada ventana de subcategoría recibe
        # la misma, no una propia.
        category_extra = category_distribution.to(dtype=torch.float32, device=self.device)
        category_extra = category_extra.expand(subcategory_windows["input_ids"].shape[0], -1)

        subcategory_logits = self._pool(
            self.subcategory_model(**subcategory_windows, extra=category_extra)
        )
        subcategory_probs = (
            torch.softmax(subcategory_logits / self.subcategory_temperature, dim=1)
            .squeeze(0).detach().cpu().numpy()
        )

        reading = {
            "category": {
                "label": category_label,
                "confidence": float(category_probs[category_idx]),
                "probabilities": self._top_probabilities(
                    self.category_encoder.classes_,
                    category_probs,
                ),
            },
            "subcategory": None,
            "subcategory_abstention_reason": None,
        }

        if self.subcategory_mask is not None:
            allowed = self.subcategory_mask[category_idx]
            if not allowed.any():
                reading["subcategory_abstention_reason"] = (
                    f"La categoria '{category_label}' no tiene subcategorias entrenables en "
                    "este modelo; entregar una seria incoherente con la jerarquia."
                )
                return reading
            # Las subcategorias de otras familias quedan en cero y el resto se renormaliza.
            subcategory_probs = np.where(allowed, subcategory_probs, 0.0)
            total = subcategory_probs.sum()
            if total <= 0:
                reading["subcategory_abstention_reason"] = (
                    "La distribucion de subcategoria quedo vacia tras aplicar la jerarquia."
                )
                return reading
            subcategory_probs = subcategory_probs / total

        subcategory_idx = int(subcategory_probs.argmax())
        subcategory_label = str(self.subcategory_encoder.inverse_transform([subcategory_idx])[0])
        reading["subcategory"] = {
            "label": subcategory_label,
            "confidence": float(subcategory_probs[subcategory_idx]),
            "probabilities": self._top_probabilities(
                self.subcategory_encoder.classes_,
                subcategory_probs,
            ),
        }
        return reading
