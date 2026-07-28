import type { CaseBrief } from "../types/case-brief"
import type {
  ActionFragment,
  ActionPathData,
  ActionRouteStep,
  ActionSignal,
  ActionUrgency,
} from "../types/action-path"
import { buildNeeds, buildRoute } from "./route-analysis"

const NUMBER_WORDS: Record<string, number> = {
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
}

const LOCATION_WORDS = [
  "vereda",
  "municipio",
  "barrio",
  "corregimiento",
  "departamento",
  "finca",
  "territorio",
  "pueblo",
  "ciudad",
]

const FAMILY_WORDS = [
  "familia",
  "hijo",
  "hija",
  "niño",
  "niña",
  "esposo",
  "esposa",
  "mamá",
  "mama",
  "papá",
  "papa",
  "hermano",
  "hermana",
]

function splitSentences(transcript: string) {
  const sentences = transcript
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 12)

  if (sentences.length > 0) return sentences

  const clean = transcript.replace(/\s+/g, " ").trim()
  return clean ? [clean] : []
}

function sentenceWith(sentences: string[], words: string[]) {
  return sentences.find((sentence) => {
    const lower = sentence.toLowerCase()
    return words.some((word) => lower.includes(word))
  })
}

function quote(sentence?: string) {
  if (!sentence) return "La transcripción no contiene una frase suficientemente clara para mostrar."
  const clean = sentence.replace(/^[“\"']|[”\"']$/g, "").trim()
  const compact = clean.length > 190 ? `${clean.slice(0, 187).trim()}…` : clean
  return `“${compact}”`
}

function extractFamilyCount(sentence?: string) {
  if (!sentence) return undefined
  const lower = sentence.toLowerCase()
  const numberPattern = "(\\d{1,2}|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)"
  const patterns = [
    new RegExp(`(?:somos|éramos|eramos|veníamos|veniamos|salimos|vivíamos|viviamos)\\s+(?:los\\s+)?${numberPattern}`),
    new RegExp(`${numberPattern}\\s+(?:personas|integrantes|miembros)`),
    new RegExp(`mis\\s+${numberPattern}\\s+(?:hijos|hijas|niños|niñas)`),
  ]

  for (const pattern of patterns) {
    const match = lower.match(pattern)
    const value = match?.[1]
    if (!value) continue
    const numeric = Number(value)
    if (Number.isFinite(numeric)) return numeric
    if (NUMBER_WORDS[value]) return NUMBER_WORDS[value]
  }

  return undefined
}

function buildFragments(sentences: string[]): ActionFragment[] {
  return sentences.slice(0, 5).map((sentence, index) => ({
    id: `fragment-${index + 1}`,
    text: quote(sentence),
    reference: String(index + 1).padStart(2, "0"),
  }))
}

function buildSignals(transcript: string, caseBrief: CaseBrief | undefined, sentences: string[]) {
  const needs = buildNeeds(transcript, caseBrief)
  const signals: Omit<ActionSignal, "numero">[] = []
  const familySentence = sentenceWith(sentences, FAMILY_WORDS)
  const familyCount = extractFamilyCount(familySentence)
  const displacementNeed = needs.find((need) => need.id === "declaration")
  const securityNeed = needs.find((need) => need.id === "security")
  const humanitarianNeed = needs.find((need) => need.id === "humanitarian")
  const careNeed = needs.find((need) => need.id === "care")
  const documentsNeed = needs.find((need) => need.id === "documents")
  const locationSentence = sentenceWith(sentences, LOCATION_WORDS)
  const classification = caseBrief?.classification

  if (familySentence) {
    signals.push({
      id: "family",
      titulo: "Núcleo familiar",
      evidencia: familyCount
        ? `El relato menciona un grupo familiar de ${familyCount} personas.`
        : "El relato menciona personas del núcleo familiar, pero su número necesita confirmación.",
      fraseOrigen: quote(familySentence),
      incierta: !familyCount,
    })
  }

  const category = classification?.category?.label
  const subcategory = classification?.subcategory?.label
  const factEvidence = category
    ? `${category}${subcategory ? ` · ${subcategory}` : ""}.`
    : displacementNeed
      ? "El relato contiene señales compatibles con una situación de desplazamiento."
      : "El hecho principal necesita revisión antes de definir la ruta institucional."

  signals.push({
    id: "main-fact",
    titulo: "Hecho principal",
    evidencia: factEvidence,
    fraseOrigen: quote(displacementNeed?.evidence || sentences[0]),
    incierta: classification?.available !== true,
  })

  if (locationSentence) {
    signals.push({
      id: "place-time",
      titulo: "Lugar y momento",
      evidencia: "Se encontró una referencia territorial; conviene confirmar el lugar y la fecha aproximada.",
      fraseOrigen: quote(locationSentence),
      incierta: true,
    })
  }

  if (securityNeed) {
    const risk = classification?.riskLevel
    signals.push({
      id: "risk",
      titulo: "Riesgo actual",
      evidencia: risk
        ? `La lectura inicial ubica el nivel de riesgo como ${risk}. Debe ser revisado con prioridad.`
        : "El relato contiene expresiones asociadas con temor, amenaza o imposibilidad de retorno.",
      fraseOrigen: quote(securityNeed.evidence),
      incierta: !risk,
    })
  }

  if (humanitarianNeed || careNeed) {
    const evidence = humanitarianNeed?.evidence || careNeed?.evidence
    signals.push({
      id: "urgent-needs",
      titulo: "Necesidades prioritarias",
      evidencia: humanitarianNeed && careNeed
        ? "Se identifican necesidades básicas y personas que podrían requerir atención diferencial."
        : humanitarianNeed
          ? "Se identifican posibles necesidades de alojamiento, alimentación o ayuda inmediata."
          : "Se mencionan personas que podrían requerir atención diferencial.",
      fraseOrigen: quote(evidence),
    })
  }

  if (documentsNeed) {
    signals.push({
      id: "documents",
      titulo: "Documentos",
      evidencia: "El relato menciona documentos perdidos, faltantes o necesarios para continuar la atención.",
      fraseOrigen: quote(documentsNeed.evidence),
    })
  }

  return signals.map((signal, index) => ({
    ...signal,
    numero: String(index + 1).padStart(2, "0"),
  }))
}

function mapUrgency(urgency: "critica" | "alta" | "media"): ActionUrgency {
  if (urgency === "critica") return "inmediata"
  if (urgency === "alta") return "prioritaria"
  return "importante"
}

function signalOrigin(stepId: string) {
  const origins: Record<string, string> = {
    security: "Riesgo actual",
    declaration: "Hecho principal",
    humanitarian: "Necesidades prioritarias",
    documents: "Documentos",
    care: "Núcleo familiar y atención diferencial",
    "follow-up": "Seguimiento del caso",
  }

  return origins[stepId] || "Lectura general del relato"
}

function buildRouteSteps(transcript: string, caseBrief?: CaseBrief): ActionRouteStep[] {
  const needs = buildNeeds(transcript, caseBrief)
  return buildRoute(needs, caseBrief).map((step, index) => ({
    id: step.id,
    numero: String(index + 1).padStart(2, "0"),
    nombre: step.title,
    entidad: step.entity,
    porQue: step.reason,
    quePreparar: step.documents.length > 0
      ? step.documents.join(" · ")
      : step.action,
    urgencia: mapUrgency(step.urgency),
    senalOrigen: signalOrigin(step.id),
  }))
}

export function buildActionPathData(
  transcript: string,
  caseBrief?: CaseBrief
): ActionPathData {
  const sentences = splitSentences(transcript)

  return {
    fragments: buildFragments(sentences),
    signals: buildSignals(transcript, caseBrief, sentences),
    routeSteps: buildRouteSteps(transcript, caseBrief),
  }
}
