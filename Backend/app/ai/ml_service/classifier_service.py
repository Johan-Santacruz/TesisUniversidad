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
    def __init__(self, model_name: str, num_classes: int, dropout: float = 0.35, extra_features: int = 0):
        super().__init__()
        self.transformer = AutoModel.from_pretrained(model_name)
        hidden = self.transformer.config.hidden_size
        self.dropout = nn.Dropout(dropout)
        self.fc1 = nn.Linear(hidden + extra_features, 256)
        self.drop2 = nn.Dropout(dropout)
        self.out = nn.Linear(256, num_classes)

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
        self.model_name = self.config["config"]["MODEL_NAME"]
        self.max_len = int(self.config["config"].get("MAX_LEN", 256))
        self.dropout = float(self.config["config"].get("DROPOUT", 0.35))

        self.tokenizer = AutoTokenizer.from_pretrained(artifact_dir / "tokenizer")
        self.category_encoder = joblib.load(artifact_dir / "label_encoder_categoria.joblib")
        self.subcategory_encoder = joblib.load(artifact_dir / "label_encoder_subcategoria.joblib")
        self.category_to_subcategories = self._load_hierarchy()
        self.subcategory_mask = self._build_mask()

        self.category_model = TransformerClasificador(
            self.model_name,
            len(self.category_encoder.classes_),
            self.dropout,
        ).to(self.device)
        self.subcategory_model = TransformerClasificador(
            self.model_name,
            len(self.subcategory_encoder.classes_),
            self.dropout,
            extra_features=len(self.category_encoder.classes_),
        ).to(self.device)

        self.category_model.load_state_dict(
            torch.load(artifact_dir / "model_categoria.pt", map_location=self.device)
        )
        self.subcategory_model.load_state_dict(
            torch.load(artifact_dir / "model_subcategoria.pt", map_location=self.device)
        )
        self.category_model.eval()
        self.subcategory_model.eval()

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

    def _load_config(self) -> dict[str, Any]:
        config_path = self.artifact_dir / "metrics_config_singlelabel.json"
        if not config_path.exists():
            raise FileNotFoundError(f"No existe {config_path}")
        return json.loads(config_path.read_text(encoding="utf-8"))

    def _encode(self, text: str) -> dict[str, torch.Tensor]:
        encoded = self.tokenizer(
            text,
            truncation=True,
            padding="max_length",
            max_length=self.max_len,
            return_tensors="pt",
        )
        return {
            key: value.to(self.device)
            for key, value in encoded.items()
            if key in {"input_ids", "attention_mask"}
        }

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

        encoded = self._encode(clean_text)
        category_logits = self.category_model(**encoded)
        category_probs = torch.softmax(category_logits, dim=1).squeeze(0).detach().cpu().numpy()
        category_idx = int(category_probs.argmax())
        category_label = str(self.category_encoder.inverse_transform([category_idx])[0])

        category_extra = torch.zeros(
            (1, len(self.category_encoder.classes_)),
            dtype=torch.float32,
            device=self.device,
        )
        category_extra[0, category_idx] = 1.0

        subcategory_logits = self.subcategory_model(**encoded, extra=category_extra)
        subcategory_probs = torch.softmax(subcategory_logits, dim=1).squeeze(0).detach().cpu().numpy()

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
