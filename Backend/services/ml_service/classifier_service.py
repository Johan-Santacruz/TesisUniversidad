from __future__ import annotations

from pathlib import Path
from typing import Any
import json
import os

import joblib
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from transformers import AutoModel, AutoTokenizer


ARTIFACT_DIR = Path(
    os.environ.get("MODEL_ARTIFACT_DIR", "./models/violencia_classifier_artifacts")
).resolve()


class PredictionRequest(BaseModel):
    text: str


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
        ]

    @staticmethod
    def _risk_level(category: str, subcategory: str) -> str:
        text = f"{category} {subcategory}".lower()
        if any(term in text for term in ["homicidio", "secuestro", "masacre", "desaparici", "reclutamiento"]):
            return "critico"
        if any(term in text for term in ["amenaza", "desplazamiento", "confinamiento", "ataque"]):
            return "alto"
        return "medio"

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
        subcategory_idx = int(subcategory_probs.argmax())
        subcategory_label = str(self.subcategory_encoder.inverse_transform([subcategory_idx])[0])

        return {
            "category": {
                "label": category_label,
                "confidence": float(category_probs[category_idx]),
                "probabilities": self._top_probabilities(
                    self.category_encoder.classes_,
                    category_probs,
                ),
            },
            "subcategory": {
                "label": subcategory_label,
                "confidence": float(subcategory_probs[subcategory_idx]),
                "probabilities": self._top_probabilities(
                    self.subcategory_encoder.classes_,
                    subcategory_probs,
                ),
            },
            "riskLevel": self._risk_level(category_label, subcategory_label),
            "notes": ["Prediccion generada con el modelo BETO entrenado en el notebook."],
        }


app = FastAPI(title="SIAD Violence Classifier")
classifier: ViolenceClassifier | None = None


@app.on_event("startup")
def load_classifier() -> None:
    global classifier
    classifier = ViolenceClassifier(ARTIFACT_DIR)


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "success": True,
        "artifactDir": str(ARTIFACT_DIR),
        "loaded": classifier is not None,
    }


@app.post("/predict")
def predict(payload: PredictionRequest) -> dict[str, Any]:
    if classifier is None:
        raise HTTPException(status_code=503, detail="El clasificador aun no esta cargado.")

    try:
        return classifier.predict(payload.text)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
