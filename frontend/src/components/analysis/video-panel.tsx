import { Fragment, forwardRef, useEffect, useMemo } from "react"
import type React from "react"

import type { components } from "../../api/generated"


type Segment = components["schemas"]["TranscriptSegment"]
type TimelineEvent = components["schemas"]["TimelineEventRead"]

function timestamp(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

function vttTimestamp(milliseconds: number) {
  const totalMs = Math.max(0, Math.floor(milliseconds))
  const hours = Math.floor(totalMs / 3_600_000)
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000)
  const seconds = Math.floor((totalMs % 60_000) / 1000)
  const millis = totalMs % 1000
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`
}

/* Corta el fragmento en oraciones sólo para leerlo: cada una arranca renglón
 * propio, pero ninguna lleva minuto, porque Whisper no lo da por oración y
 * repartir el del fragmento sería inventarlo. El clic sigue cayendo en el
 * minuto real del fragmento. Sólo corta si lo que sigue empieza en mayúscula o
 * con signo de apertura: "Sr. Pérez" no es el fin de nada. */
const CLOSES = /[.?!…]["'»)\]]*$/u

function sentencesOf(text: string) {
  const pieces = text
    .split(/(?<=[.?!…])\s+(?=[A-ZÁÉÍÓÚÜÑ¿¡"«])/u)
    .filter((sentence) => sentence.trim())
  // El servidor cierra el fragmento al llegar a su tope aunque la frase siga,
  // y el pedazo que sobra ("Por") quedaba solo en su renglón. Se queda pegado
  // a la oración anterior, que es donde se dijo.
  if (pieces.length > 1 && !CLOSES.test(pieces[pieces.length - 1].trim())) {
    const tail = pieces.pop()
    pieces[pieces.length - 1] += ` ${tail}`
  }
  return pieces
}

/* La frase que el tope partió sigue en el fragmento siguiente: los puntos
 * suspensivos lo dicen a cada lado del corte. Van por CSS y no en el texto,
 * que es la transcripción y no se toca. */
function cutsOff(text: string) {
  return !CLOSES.test(text.trim())
}

function continues(text: string) {
  return /^[a-záéíóúüñ]/u.test(text.trim())
}

/* Los momentos del caso son las secciones de la línea de tiempo: cada
 * fragmento va con el momento con el que más se solapa, o con el último que
 * empezó antes que él si no toca ninguno. Lo que llega antes del primer
 * momento queda arriba, sin título. Un momento sin fragmentos no se pinta:
 * sería un título colgando sobre nada. */
function groupByMoment(segments: Segment[], timeline: TimelineEvent[]) {
  const moments = [...timeline].sort((a, b) => a.start_ms - b.start_ms)
  const groups: Array<{ moment: TimelineEvent | null; segments: Segment[] }> = [
    { moment: null, segments: [] },
    ...moments.map((moment) => ({ moment, segments: [] as Segment[] })),
  ]
  for (const segment of segments) {
    let best = 0
    let bestOverlap = 0
    moments.forEach((moment, index) => {
      const overlap = Math.min(segment.end_ms, moment.end_ms)
        - Math.max(segment.start_ms, moment.start_ms)
      if (overlap > bestOverlap) {
        best = index + 1
        bestOverlap = overlap
      } else if (bestOverlap === 0 && moment.start_ms <= segment.start_ms) {
        best = index + 1
      }
    })
    groups[best].segments.push(segment)
  }
  return groups.filter((group) => group.segments.length)
}

// Los subtitulos se arman en el navegador a partir de los mismos fragmentos
// que ya se piden para el riel de la transcripcion: no hay un endpoint de
// subtitulos aparte que mantener sincronizado con el backend.
function buildVtt(segments: Segment[]) {
  const cues = segments.map(
    (segment) =>
      `${vttTimestamp(segment.start_ms)} --> ${vttTimestamp(segment.end_ms)}\n${segment.text}`,
  )
  return ["WEBVTT", "", ...cues].join("\n\n")
}


export const DocumentaryVideoRail = forwardRef<
  HTMLVideoElement,
  {
    source: string | null
    segments: Segment[]
    // Los momentos del caso, que parten el relato en secciones.
    timeline?: TimelineEvent[]
    activeSegmentId: string | null
    activeEventId?: string | null
    collapsed?: boolean
    frozenHeight?: number | null
    sourceLabel?: string
    playbackError?: string
    // Un aviso bajo el reproductor, como el de la subida que sigue en curso.
    note?: React.ReactNode
    ref2?: React.Ref<HTMLElement>
    onSegmentSelect: (segment: Segment) => void
    onToggle?: () => void
  }
>(function DocumentaryVideoRail(
  {
    source,
    segments,
    timeline = [],
    activeSegmentId,
    activeEventId = null,
    collapsed = false,
    frozenHeight,
    sourceLabel = "Reproductor del testimonio ficticio",
    playbackError = "",
    note = null,
    ref2,
    onSegmentSelect,
    onToggle,
  },
  ref,
) {
  const captionsUrl = useMemo(() => {
    if (!segments.length) return null
    return URL.createObjectURL(new Blob([buildVtt(segments)], { type: "text/vtt" }))
  }, [segments])

  useEffect(() => {
    return () => {
      if (captionsUrl) URL.revokeObjectURL(captionsUrl)
    }
  }, [captionsUrl])

  const groups = useMemo(
    () => groupByMoment(segments, timeline),
    [segments, timeline],
  )

  return (
    <aside
      ref={ref2}
      className={collapsed ? "documentary-rail is-collapsed" : "documentary-rail"}
      style={frozenHeight ? { height: frozenHeight } : undefined}
      aria-labelledby="video-title"
    >
      {/* El riel se pliega para devolverle ancho a la etapa; el video sigue
          montado para no perder la posición de reproducción. */}
      {onToggle ? (
        <button
          type="button"
          className="documentary-rail-toggle"
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Mostrar el video" : "Ocultar el video"}
          onClick={onToggle}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none"
            stroke="currentColor" strokeWidth="1.9"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={collapsed ? "M6 3.5 10.5 8 6 12.5" : "M10 3.5 5.5 8 10 12.5"} />
          </svg>
        </button>
      ) : null}
      <h2 id="video-title">Tu declaración</h2>
      <div className="documentary-video">
        <video
          ref={ref}
          data-testid="case-video"
          controls
          preload="metadata"
          src={source ?? undefined}
          aria-label={sourceLabel}
        >
          {captionsUrl ? (
            <track
              kind="captions"
              srcLang="es"
              label="Español"
              src={captionsUrl}
              default
            />
          ) : null}
        </video>
        {!source ? (
          <div className="video-placeholder" aria-hidden="true">
            <span>SENDA</span>
            <p>Preparando la vista local protegida…</p>
          </div>
        ) : null}
      </div>
      {playbackError ? (
        <p className="action-error" role="alert">
          {playbackError}
        </p>
      ) : null}
      {note}
      <div
        className="documentary-fragments"
        role="group"
        aria-label="Fragmentos de la transcripción"
      >
        {groups.map(({ moment, segments: fragments }) => (
          <section
            key={moment?.id ?? "antes"}
            className={
              moment && moment.id === activeEventId
                ? "documentary-moment is-active"
                : "documentary-moment"
            }
          >
            {/* Un título y no un botón: elegir el momento ya se hace en
                Escucha, y dos controles con el mismo nombre confunden. */}
            {moment ? (
              <h3 className="documentary-moment-title">
                <span>{moment.title}</span>
                <time>{timestamp(moment.start_ms)}</time>
              </h3>
            ) : null}
            {fragments.map((segment) => (
              <button
                type="button"
                key={segment.id}
                className={segment.id === activeSegmentId ? "is-active" : ""}
                aria-pressed={segment.id === activeSegmentId}
                aria-current={
                  segment.id === activeSegmentId ? "true" : undefined
                }
                onClick={() => onSegmentSelect(segment)}
              >
                <time>{timestamp(segment.start_ms)}</time>
                <span
                  className={[
                    "documentary-text",
                    cutsOff(segment.text) ? "is-cut" : "",
                    continues(segment.text) ? "is-continued" : "",
                  ].filter(Boolean).join(" ")}
                >
                  {sentencesOf(segment.text).map((sentence, index) => (
                    <Fragment key={index}>
                      {index ? " " : null}
                      <span className="documentary-sentence">{sentence}</span>
                    </Fragment>
                  ))}
                </span>
              </button>
            ))}
          </section>
        ))}
      </div>
    </aside>
  )
})
