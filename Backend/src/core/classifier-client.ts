import { config } from "../config/config.js"
import type {
  ClassificationLabel,
  ViolenceClassification,
} from "../types/transcription.js"

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asNumber(value: unknown): number | undefined {
  const numberValue = typeof value === "number" ? value : Number(value)
  return Number.isFinite(numberValue) ? numberValue : undefined
}

function normalizeLabel(value: unknown, fallbackConfidence?: unknown): ClassificationLabel | undefined {
  if (!value) {
    return undefined
  }

  if (typeof value === "string") {
    return {
      label: value,
      confidence: asNumber(fallbackConfidence),
    }
  }

  const record = asRecord(value)
  const label = record.label || record.etiqueta || record.name || record.clase
  if (typeof label !== "string" || !label.trim()) {
    return undefined
  }

  const rawProbabilities = Array.isArray(record.probabilities)
    ? record.probabilities
    : Array.isArray(record.probabilidades)
      ? record.probabilidades
      : undefined

  return {
    label,
    confidence: asNumber(
      record.confidence ?? record.confianza ?? record.score ?? fallbackConfidence
    ),
    probabilities: rawProbabilities
      ?.map((item) => {
        const probability = asRecord(item)
        const itemLabel = probability.label || probability.etiqueta
        const confidence = asNumber(
          probability.confidence ?? probability.confianza ?? probability.score
        )

        if (typeof itemLabel !== "string" || confidence === undefined) {
          return null
        }

        return {
          label: itemLabel,
          confidence,
        }
      })
      .filter((item): item is { label: string; confidence: number } => Boolean(item)),
  }
}

function inferRiskLevel(
  category?: ClassificationLabel,
  subcategory?: ClassificationLabel
): ViolenceClassification["riskLevel"] {
  const text = `${category?.label || ""} ${subcategory?.label || ""}`.toLowerCase()

  if (
    text.includes("homicidio") ||
    text.includes("secuestro") ||
    text.includes("masacre") ||
    text.includes("desaparici") ||
    text.includes("reclutamiento")
  ) {
    return "critico"
  }

  if (
    text.includes("amenaza") ||
    text.includes("desplazamiento") ||
    text.includes("confinamiento") ||
    text.includes("ataque")
  ) {
    return "alto"
  }

  if (category || subcategory) {
    return "medio"
  }

  return undefined
}

export async function classifyTranscript(
  transcript: string
): Promise<ViolenceClassification> {
  const cleanTranscript = transcript.trim()
  if (!cleanTranscript) {
    return {
      available: false,
      source: "unavailable",
      warnings: ["No hay transcripcion suficiente para clasificar."],
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    config.classifierTimeoutMs
  )

  try {
    const response = await fetch(`${config.classifierApiUrl}/predict`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: cleanTranscript }),
      signal: controller.signal,
    })

    if (!response.ok) {
      return {
        available: false,
        source: "unavailable",
        warnings: [`El clasificador respondio con estado ${response.status}.`],
      }
    }

    const payload = asRecord(await response.json())
    const category = normalizeLabel(
      payload.category ?? payload.categoria,
      payload.category_confidence ?? payload.confianza_categoria
    )
    const subcategory = normalizeLabel(
      payload.subcategory ?? payload.subcategoria,
      payload.subcategory_confidence ?? payload.confianza_subcategoria
    )
    const riskLevel =
      typeof payload.riskLevel === "string"
        ? payload.riskLevel
        : typeof payload.riesgo === "string"
          ? payload.riesgo
          : inferRiskLevel(category, subcategory)

    return {
      available: Boolean(category || subcategory),
      source: "classifier_service",
      category,
      subcategory,
      riskLevel: typeof riskLevel === "string" &&
        ["bajo", "medio", "alto", "critico"].includes(riskLevel)
        ? (riskLevel as ViolenceClassification["riskLevel"])
        : inferRiskLevel(category, subcategory),
      notes: Array.isArray(payload.notes)
        ? payload.notes.filter((note): note is string => typeof note === "string")
        : Array.isArray(payload.observaciones)
          ? payload.observaciones.filter(
              (note): note is string => typeof note === "string"
            )
          : undefined,
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.name === "AbortError"
          ? "El clasificador tardo demasiado en responder."
          : error.message
        : "No fue posible consultar el clasificador."

    return {
      available: false,
      source: "unavailable",
      warnings: [message],
    }
  } finally {
    clearTimeout(timeout)
  }
}
