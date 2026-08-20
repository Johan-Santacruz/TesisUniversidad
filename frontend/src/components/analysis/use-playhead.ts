import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { components } from "../../api/generated"


type Segment = components["schemas"]["TranscriptSegment"]
type TimelineEvent = components["schemas"]["TimelineEventRead"]
type Fact = components["schemas"]["FactRead"]

export interface PlayheadSources {
  segments: Segment[]
  timeline: TimelineEvent[]
  facts: Fact[]
}

/* El tiempo es la clave que une los tres módulos: segmentos, momentos y
 * evidencias de hechos vienen todos con start_ms/end_ms. Un solo cabezal
 * gobierna qué está activo en cada uno, así que una selección hecha en
 * cualquier panel se refleja en los demás sin duplicar estado.
 *
 * La selección explícita manda sobre el seguimiento automático: si alguien
 * eligió un fragmento para leerlo con calma, el video avanzando no se lo debe
 * arrebatar. Vuelve a mandar el tiempo en cuanto se pulsa reproducir.
 */
export function usePlayhead(
  // Recibe el elemento y no un ref: un RefObject es estable, así que un efecto
  // que dependa de él nunca vuelve a correr. El video aparece después del
  // montaje —mientras la persona sube su testimonio no existe todavía—, y con
  // un ref el cabezal se quedaba sin escuchar `timeupdate` para siempre.
  video: HTMLVideoElement | null,
  { segments, timeline, facts }: PlayheadSources,
) {
  const [currentMs, setCurrentMs] = useState(0)
  const [pinnedSegmentId, setPinnedSegmentId] = useState<string | null>(null)
  const [pinnedEventId, setPinnedEventId] = useState<string | null>(null)
  const frameRef = useRef<number | null>(null)

  // timeupdate llega ~4 veces por segundo y cada una redibujaría los tres
  // paneles. Se colapsa a un cuadro para no re-renderizar de más.
  useEffect(() => {
    if (!video) return

    const publish = () => {
      frameRef.current = null
      setCurrentMs(Math.round(video.currentTime * 1000))
    }
    const schedule = () => {
      if (frameRef.current !== null) return
      frameRef.current = typeof requestAnimationFrame === "function"
        ? requestAnimationFrame(publish)
        : (publish(), null)
    }
    // Al reproducir, el tiempo recupera el mando sobre la selección fijada.
    const release = () => {
      setPinnedSegmentId(null)
      setPinnedEventId(null)
    }

    video.addEventListener("timeupdate", schedule)
    video.addEventListener("seeked", schedule)
    video.addEventListener("play", release)
    return () => {
      video.removeEventListener("timeupdate", schedule)
      video.removeEventListener("seeked", schedule)
      video.removeEventListener("play", release)
      if (frameRef.current !== null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
    }
  }, [video])

  const durationMs = useMemo(() => {
    const ends = [
      ...segments.map((item) => item.end_ms),
      ...timeline.map((item) => item.end_ms),
    ]
    // Sin material no hay eje: 1 evita divisiones por cero aguas abajo.
    return ends.length ? Math.max(...ends) : 1
  }, [segments, timeline])

  const seekTo = useCallback(
    (milliseconds: number) => {
      if (video) video.currentTime = milliseconds / 1000
      setCurrentMs(milliseconds)
    },
    [video],
  )

  const selectSegment = useCallback(
    (segment: Segment) => {
      setPinnedSegmentId(segment.id)
      setPinnedEventId(null)
      seekTo(segment.start_ms)
    },
    [seekTo],
  )

  const selectEvent = useCallback(
    (event: TimelineEvent) => {
      setPinnedEventId(event.id)
      setPinnedSegmentId(null)
      seekTo(event.start_ms)
    },
    [seekTo],
  )

  const activeSegment = useMemo(() => {
    const pinned = segments.find((item) => item.id === pinnedSegmentId)
    if (pinned) return pinned
    const covering = segments.find(
      (item) => currentMs >= item.start_ms && currentMs <= item.end_ms,
    )
    if (covering) return covering
    // Entre dos fragmentos (una pausa al hablar) se conserva el último dicho,
    // que es el que la persona todavía está leyendo.
    const previous = [...segments]
      .filter((item) => item.start_ms <= currentMs)
      .sort((left, right) => right.start_ms - left.start_ms)[0]
    return previous ?? segments[0] ?? null
  }, [segments, pinnedSegmentId, currentMs])

  const activeEvent = useMemo(() => {
    const pinned = timeline.find((item) => item.id === pinnedEventId)
    if (pinned) return pinned
    const covering = timeline.find(
      (item) => currentMs >= item.start_ms && currentMs <= item.end_ms,
    )
    if (covering) return covering
    // Igual que con los fragmentos: entre un momento y el siguiente se conserva
    // el último alcanzado. Quedarse sin nada resaltado le quita a la persona la
    // referencia de por dónde va el relato.
    const previous = [...timeline]
      .filter((item) => item.start_ms <= currentMs)
      .sort((left, right) => right.start_ms - left.start_ms)[0]
    return previous ?? null
  }, [timeline, pinnedEventId, currentMs])

  // Una señal está activa cuando el cabezal cae dentro de alguna de sus
  // evidencias. Es la relación que el contrato ya entrega en EvidenceRef.
  const activeFactIds = useMemo(() => {
    const reference = activeSegment?.start_ms ?? currentMs
    return new Set(
      facts
        .filter((fact) =>
          (fact.evidence ?? []).some(
            (evidence) =>
              reference >= evidence.start_ms && reference <= evidence.end_ms,
          ))
        .map((fact) => fact.id),
    )
  }, [facts, activeSegment, currentMs])

  return {
    currentMs,
    durationMs,
    activeSegment,
    activeEvent,
    activeFactIds,
    seekTo,
    selectSegment,
    selectEvent,
  }
}
