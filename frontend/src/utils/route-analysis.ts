import type { CaseBrief } from "../types/case-brief"
import type { NeedSignal, RouteStep } from "../types/route-analysis"

function includesAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word))
}

function sentenceWith(text: string, words: string[]) {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)

  return (
    sentences.find((sentence) =>
      words.some((word) => sentence.toLowerCase().includes(word))
    ) || "Se infiere a partir de la declaración transcrita."
  )
}

export function buildNeeds(
  transcript: string,
  caseBrief?: CaseBrief
): NeedSignal[] {
  const text = transcript.toLowerCase()
  const needs: NeedSignal[] = []
  const riskLevel = caseBrief?.classification?.riskLevel

  if (
    riskLevel === "critico" ||
    riskLevel === "alto" ||
    includesAny(text, ["amenaza", "amenaz", "riesgo", "miedo", "armado", "persegu"])
  ) {
    needs.push({
      id: "security",
      evidence: sentenceWith(transcript, ["amenaza", "riesgo", "miedo", "armado", "persegu"]),
    })
  }

  if (
    includesAny(text, [
      "desplaz",
      "salir",
      "huir",
      "sacaron",
      "abandon",
      "vereda",
      "territorio",
    ])
  ) {
    needs.push({
      id: "declaration",
      evidence: sentenceWith(transcript, ["desplaz", "salir", "huir", "sacaron", "abandon"]),
    })
  }

  if (
    includesAny(text, [
      "comida",
      "aliment",
      "arriendo",
      "dormir",
      "dónde vivir",
      "alojamiento",
      "ayuda",
      "urgente",
    ])
  ) {
    needs.push({
      id: "humanitarian",
      evidence: sentenceWith(transcript, ["comida", "aliment", "arriendo", "dormir", "alojamiento"]),
    })
  }

  if (
    includesAny(text, [
      "cédula",
      "cedula",
      "registro",
      "documento",
      "papeles",
      "perdí",
      "perdi",
    ])
  ) {
    needs.push({
      id: "documents",
      evidence: sentenceWith(transcript, ["cédula", "cedula", "registro", "documento", "papeles"]),
    })
  }

  if (
    includesAny(text, [
      "niño",
      "niña",
      "hijo",
      "hija",
      "embarazada",
      "adulto mayor",
      "enfermo",
      "salud",
    ])
  ) {
    needs.push({
      id: "care",
      evidence: sentenceWith(transcript, ["niño", "niña", "hijo", "embarazada", "salud"]),
    })
  }

  return needs
}

export function buildRoute(
  needs: NeedSignal[],
  caseBrief?: CaseBrief
): RouteStep[] {
  const has = (id: string) => needs.some((need) => need.id === id)
  const risk = caseBrief?.classification?.riskLevel
  const steps: RouteStep[] = []

  if (has("security") || risk === "critico" || risk === "alto") {
    steps.push({
      id: "security",
      title: "Activar protección antes del trámite",
      entity: "Personería, Defensoría del Pueblo, Fiscalía o Policía",
      reason: "La declaración sugiere riesgo actual o temor por seguridad.",
      action:
        "Solicitar orientación inmediata y dejar constancia de amenazas, actores, fechas aproximadas y personas afectadas.",
      documents: ["Documento de identidad si lo tiene", "Datos de contacto", "Relato breve de los hechos"],
      urgency: "critica",
    })
  }

  steps.push({
    id: "declaration",
    title: "Rendir declaración como víctima",
    entity: "Ministerio Público: Personería, Defensoría o Procuraduría",
    reason:
      "La ruta institucional empieza por registrar el hecho victimizante y el núcleo familiar afectado.",
    action:
      "Presentar el relato ordenado, indicar lugar, fecha aproximada, personas afectadas y necesidades urgentes.",
    documents: ["Documento de identidad", "Datos del grupo familiar", "Dirección o teléfono de contacto"],
    urgency: has("declaration") ? "alta" : "media",
  })

  if (has("humanitarian")) {
    steps.push({
      id: "humanitarian",
      title: "Solicitar ayuda humanitaria inmediata",
      entity: "Alcaldía municipal o enlace de víctimas",
      reason: "En el relato aparecen necesidades básicas que no deberían esperar al cierre del trámite.",
      action:
        "Pedir valoración de alojamiento, alimentación, transporte o atención básica mientras avanza la inscripción.",
      documents: ["Constancia de declaración si ya existe", "Documento de identidad", "Datos del núcleo familiar"],
      urgency: "alta",
    })
  }

  if (has("documents")) {
    steps.push({
      id: "documents",
      title: "Recuperar documentos esenciales",
      entity: "Registraduría, alcaldía o entidad que emitió el soporte",
      reason: "La falta de documentos puede bloquear atención, salud, educación o ayudas.",
      action:
        "Listar documentos perdidos y priorizar identificación, registros civiles y soportes del núcleo familiar.",
      documents: ["Nombres completos", "Fechas de nacimiento", "Lugar de expedición si se recuerda"],
      urgency: "media",
    })
  }

  if (has("care")) {
    steps.push({
      id: "care",
      title: "Marcar atención diferencial",
      entity: "Entidad receptora de la declaración y secretarías locales",
      reason: "La declaración menciona personas que pueden requerir atención prioritaria.",
      action:
        "Indicar si hay niñas, niños, embarazo, enfermedad, discapacidad o adultos mayores en el grupo familiar.",
      documents: ["Datos de las personas a cargo", "Soportes médicos si existen", "Registro civil si aplica"],
      urgency: "alta",
    })
  }

  steps.push({
    id: "follow-up",
    title: "Hacer seguimiento a la respuesta institucional",
    entity: "Unidad para las Víctimas y entidad donde se declaró",
    reason: "Después de declarar, la persona necesita saber qué esperar y cómo insistir si no recibe respuesta.",
    action:
      "Guardar radicados, fechas, nombres de funcionarios y canales de contacto para consultar el estado del caso.",
    documents: ["Número de radicado", "Copia o foto de constancias", "Teléfono y dirección actualizados"],
    urgency: "media",
  })

  return steps
}
