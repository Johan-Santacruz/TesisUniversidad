import { useCallback, useEffect, useRef } from "react"

import { NARRATIVE_STAGES, type NarrativeStage } from "./narrative-stage"


/* Lo que cada entrada del historial guarda del caso, junto al estado propio
 * del enrutador, que se conserva intacto. */
interface StageEntry {
  sendaCase?: string
  sendaStage?: string
  // Cuántas etapas se apilaron sobre la primera de este caso.
  sendaDepth?: number
}

function isStage(value: unknown): value is NarrativeStage {
  return NARRATIVE_STAGES.some(({ id }) => id === value)
}

function currentEntry(): StageEntry & Record<string, unknown> {
  const state: unknown = window.history.state
  return typeof state === "object" && state !== null
    ? (state as StageEntry & Record<string, unknown>)
    : {}
}


/* Cada etapa del caso es una entrada del historial del navegador.
 *
 * Subida, análisis y las tres etapas viven en una sola dirección, así que
 * "atrás" —el botón del teléfono, el gesto de deslizar— sacaba de la
 * aplicación en vez de volver de Señales a Escuchar. Ahora cada cambio de
 * etapa apila una entrada en la misma dirección, y volver atrás la deshace.
 *
 * Se apila sobre el estado del enrutador sin pisarlo: sus claves siguen
 * ahí, así que para él es la misma ubicación y no vuelve a montar nada.
 *
 * Si se vuelve a una entrada de este caso —desde la subida, al historial y
 * de regreso—, el caso se retoma en la etapa en que quedó. */
export function useStageHistory({
  caseId,
  stage,
  onRestore,
}: {
  caseId: string | null
  stage: NarrativeStage
  onRestore: (stage: NarrativeStage) => void
}) {
  const trackedCaseRef = useRef<string | null>(null)
  const onRestoreRef = useRef(onRestore)
  onRestoreRef.current = onRestore

  useEffect(() => {
    if (!caseId) {
      trackedCaseRef.current = null
      return
    }
    const entry = currentEntry()
    if (trackedCaseRef.current !== caseId) {
      trackedCaseRef.current = caseId
      if (entry.sendaCase === caseId && isStage(entry.sendaStage)) {
        if (entry.sendaStage !== stage) onRestoreRef.current(entry.sendaStage)
        return
      }
      // La primera etapa marca la entrada en que el caso apareció: abrirlo
      // no es un paso que haya que deshacer.
      window.history.replaceState(
        { ...entry, sendaCase: caseId, sendaStage: stage, sendaDepth: 0 },
        "",
      )
      return
    }
    if (entry.sendaCase === caseId && entry.sendaStage === stage) return
    window.history.pushState(
      {
        ...entry,
        sendaCase: caseId,
        sendaStage: stage,
        sendaDepth: entry.sendaCase === caseId ? (entry.sendaDepth ?? 0) + 1 : 0,
      },
      "",
    )
  }, [caseId, stage])

  useEffect(() => {
    if (!caseId) return
    const restore = (event: PopStateEvent) => {
      const entry: StageEntry | null = event.state
      if (entry?.sendaCase === caseId && isStage(entry.sendaStage)) {
        onRestoreRef.current(entry.sendaStage)
      }
    }
    window.addEventListener("popstate", restore)
    return () => window.removeEventListener("popstate", restore)
  }, [caseId])

  /* Al dejar el caso sin salir de la pantalla —"Analizar otro testimonio"—
   * sus etapas se desapilan. Si no, "atrás" recorría entradas de un caso que
   * ya no está y no pasaba nada a la vista, tres veces seguidas. */
  return useCallback(() => {
    const entry = currentEntry()
    const depth = entry.sendaCase === caseId ? entry.sendaDepth ?? 0 : 0
    if (depth > 0) window.history.go(-depth)
  }, [caseId])
}
