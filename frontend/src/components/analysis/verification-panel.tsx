import { useEffect, useRef, useState, type FormEvent } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"

import type { components } from "../../api/generated"
import { StatusBadge } from "./status-badge"
import {
  VULNERABILITIES_KEY,
  VULNERABILITY_OPTIONS,
  chosenVulnerabilities,
  toggleVulnerability,
} from "./vulnerabilities"
import "./verification-panel.css"


type Fact = components["schemas"]["FactRead"]
type Segment = components["schemas"]["TranscriptSegment"]
type FactReview = components["schemas"]["FactReviewRequest"]
type Role = components["schemas"]["UserRole"]
type ReviewMode = "confirm" | "correct"


/* Una lectura suelta de un proveedor: se recompone desde el dato porque no
 * tiene texto propio. */
function scalarText(value: Fact["value"]) {
  if (Array.isArray(value)) {
    const parts = value.map((item) => String(item))
    if (parts.length > 1) {
      return `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}`
    }
    return parts[0] ?? "Sin valor acordado"
  }
  if (value === null) return "Sin valor acordado"
  if (typeof value === "boolean") return value ? "Sí" : "No"
  return String(value)
}

/* El dato canónico existe para contrastar proveedores y viaja en inglés
 * ("widowed", "paramilitaries"). Quien lee la ficha necesita el texto que el
 * modelo ya escribió en español, y sólo si falta se recompone desde el dato. */
function displayValue(fact: Pick<Fact, "value" | "display_value">) {
  return fact.display_value?.trim() || scalarText(fact.value)
}

/* Un valor ausente puede serlo por dos motivos opuestos: los modelos leyeron
 * cosas distintas, o no había nada que leer. La acción que corresponde no es
 * la misma, así que tampoco puede serlo el texto. */
function readingsOf(fact: Fact) {
  return Object.entries(fact.provider_values ?? {}).filter(
    ([, reading]) => reading !== null && reading !== "",
  )
}

function missingValueCopy(fact: Fact) {
  if (fact.key === VULNERABILITIES_KEY) {
    return {
      value: "No se encontró en el relato",
      action: "Marcar las opciones",
      help: "Marca lo que sepas del caso, o «Ninguna de las anteriores».",
    }
  }
  return readingsOf(fact).length
    ? {
        value: "Las lecturas no coinciden",
        action: "Elegir el valor",
        help: "Cada modelo leyó una cosa distinta. Elige cuál corresponde.",
      }
    : {
        value: "No se encontró en el relato",
        action: "Registrar el valor",
        help: "El testimonio no lo menciona. Escríbelo si lo sabes.",
      }
}

function stamp(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

type SignalFilter = "all" | "critical" | "pending"

const FILTERS: Array<{ id: SignalFilter; label: string }> = [
  { id: "all", label: "Todas" },
  { id: "critical", label: "Críticas" },
  { id: "pending", label: "Por confirmar" },
]

function matchesFilter(fact: Fact, filter: SignalFilter) {
  if (filter === "critical") return fact.is_critical
  if (filter === "pending") return fact.verification_status !== "confirmed"
  return true
}


function FactCard({
  fact,
  role,
  selected,
  contextual,
  evidenceQuotes,
  repeats = [],
  onSelect,
  onSeek,
  onReview,
  onNext,
}: {
  fact: Fact
  role: Role
  selected: boolean
  contextual: boolean
  evidenceQuotes: Array<{ text: string; startMs: number; endMs: number }>
  repeats?: number[]
  onSelect: () => void
  onSeek: (milliseconds: number) => void
  onReview: (factId: string, payload: FactReview) => Promise<void> | void
  onNext?: () => void
}) {
  const reduceMotion = useReducedMotion() ?? false
  // Vulnerabilidades se responde con casillas, no escribiendo: con texto libre
  // el rótulo y el valor cambiaban en cada caso y no se entendía qué se pedía.
  const closed = fact.key === VULNERABILITIES_KEY
  const [chosen, setChosen] = useState<string[]>(() =>
    closed ? chosenVulnerabilities(fact.value) : [],
  )
  // Un caso anterior a las casillas trae texto libre: para ellas eso es no
  // tener valor todavía.
  const missing = closed
    ? chosenVulnerabilities(fact.value).length === 0
    : fact.value === null
  const [value, setValue] = useState(
    fact.value === null ? "" : displayValue(fact),
  )
  const [reviewMode, setReviewMode] = useState<ReviewMode | null>(null)
  const [saving, setSaving] = useState(false)
  const [reviewError, setReviewError] = useState("")
  const savingRef = useRef(false)

  const send = async (
    action: ReviewMode,
    payload: { value?: string; reason: string },
  ) => {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setReviewError("")
    try {
      await onReview(fact.id, { action, ...payload })
      setReviewMode(null)
      // En la revisión guiada, confirmar ya es decir "siguiente": pedir un
      // segundo clic para avanzar sólo alargaba el recorrido.
      if (selected) onNext?.()
    } catch (caught) {
      setReviewError(
        caught instanceof Error && caught.message
          ? caught.message
          : "No se pudo guardar la revisión. Inténtalo de nuevo.",
      )
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!reviewMode || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setReviewError("")
    try {
      const reviewNeedsValue = reviewMode === "correct" || missing
      await onReview(fact.id, {
        action: reviewMode,
        value: reviewNeedsValue ? (closed ? chosen : value) : undefined,
        reason: "",
      })
      setReviewMode(null)
      if (selected) onNext?.()
    } catch (caught) {
      setReviewError(
        caught instanceof Error && caught.message
          ? caught.message
          : "No se pudo guardar la revisión. Inténtalo de nuevo.",
      )
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <article
      data-fact-id={fact.id}
      data-status={fact.verification_status}
      className={[
        "fact-card",
        selected ? "is-selected" : "",
        contextual ? "is-contextual" : "",
        fact.is_critical && fact.verification_status !== "confirmed"
          ? "is-blocking"
          : "",
        fact.verification_status === "confirmed" ? "is-confirmed" : "",
      ].filter(Boolean).join(" ")}
      // La fila entera abre la señal, no sólo su nombre: en un libro mayor se
      // señala el renglón. El botón del nombre sigue siendo el control para
      // teclado y lector de pantalla; lo demás sólo lo acompaña.
      onClick={(event) => {
        const target = event.target as HTMLElement
        if (target.closest("button, a, input, label, select, textarea, details, form")) return
        onSelect()
      }}
    >
      {/* La cabecera es el conmutador de la señal: seleccionarla ilumina su
          evidencia aquí, en la línea de tiempo y en el relato. */}
      <button
        type="button"
        className="fact-card-heading"
        aria-expanded={selected}
        onClick={onSelect}
      >
        <span className="fact-card-title">
          <h4>{fact.label}</h4>
          {/* La criticidad ya no grita con una etiqueta roja: se lee en el
              filete lateral de la tarjeta y en el aviso de abajo. */}
        </span>
        <span className="fact-card-open" aria-hidden="true">
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none"
            stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 6.5 8 10.5 12 6.5" />
          </svg>
        </span>
      </button>
      <p className="fact-value">
        {missing
          ? missingValueCopy(fact).value
          : displayValue(fact)}
      </p>
      {/* Lo que se dice varias veces se anota una sola vez. Aquí quedan los
          demás momentos, que son evidencia de insistencia, no señales nuevas. */}
      {repeats.length ? (
        <p className="fact-repeats">
          Lo vuelve a decir en{" "}
          {repeats.map((milliseconds, index) => (
            <span key={milliseconds}>
              {index ? <span aria-hidden="true"> · </span> : null}
              <button type="button" onClick={() => onSeek(milliseconds)}>
                {/* El espacio va fuera del span oculto: dentro se pierde al
                    calcular el nombre y el lector decía "minuto0:18". */}
                <span className="visually-hidden">Ver en el video, minuto</span>
                {" "}
                {stamp(milliseconds)}
              </button>
            </span>
          ))}
        </p>
      ) : null}
      <p className={`fact-review-status review-${fact.verification_status}`}>
        <span aria-hidden="true">{fact.verification_status === "confirmed" ? "✓" : fact.verification_status === "pending" ? "○" : "!"}</span>
        {fact.verification_status === "confirmed"
          ? "Confirmada"
          : fact.verification_status === "pending"
            ? "Por confirmar"
            : fact.verification_status === "not_identified"
              ? "Sin dato"
              : "Requiere revisión"}
        {fact.is_critical && fact.verification_status !== "confirmed" ? (
          <span className="fact-priority-label">Prioritaria</span>
        ) : null}
      </p>
      <div className="fact-card-state">
        <StatusBadge
          status={fact.verification_status}
          confidence={fact.confidence_band}
          origin={fact.origin}
        />
        {fact.is_critical && fact.verification_status !== "confirmed" ? (
          <span className="fact-card-blocking">Bloquea la aprobación</span>
        ) : null}
      </div>

      {/* La cita sale del segmento real referido por EvidenceRef. */}
      <AnimatePresence initial={false}>
        {selected ? (
          <motion.div
            className="fact-evidence"
            initial={reduceMotion ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: reduceMotion ? 0.01 : 0.24 }}
          >
            {evidenceQuotes.length ? (
              evidenceQuotes.map((quote) => (
                <div key={`${quote.startMs}-${quote.endMs}`} className="fact-quote">
                  <blockquote>{quote.text}</blockquote>
                  <button
                    type="button"
                    className="fact-quote-jump"
                    onClick={() => onSeek(quote.startMs)}
                  >
                    Ver en el video
                    <time>{stamp(quote.startMs)}</time>
                  </button>
                </div>
              ))
            ) : (
              <p className="fact-quote-empty">
                Sin fragmento en el testimonio. Revisa el dato con la persona antes de confirmarlo.
              </p>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
      {/* La lectura cruda de cada modelo es el dato más técnico de la tarjeta:
          queda a un clic para quien la necesite, sin cargar la vista. */}
      {Object.keys(fact.provider_values ?? {}).length > 1 ? (
        <details className="provider-readings">
          <summary>Ver lo que leyó cada modelo</summary>
          <dl>
            {Object.entries(fact.provider_values ?? {}).map(([provider, reading]) => (
              <div key={provider}>
                <dt>{provider}</dt>
                <dd>{scalarText(reading)}</dd>
              </div>
            ))}
          </dl>
        </details>
      ) : null}
      {fact.verification_status !== "confirmed" ? (
        <>
          <div className="fact-review-actions">
            {role !== "operador" ? (
              <button
                type="button"
                className="confirm-action"
                aria-pressed={reviewMode === "confirm"}
                disabled={saving}
                onClick={() => {
                  setReviewError("")
                  // No se puede confirmar lo que no existe: si falta el valor,
                  // la acción es elegirlo o escribirlo, no dar el visto bueno.
                  if (missing) {
                    setReviewMode("confirm")
                    return
                  }
                  void send("confirm", { reason: "" })
                }}
              >
                <span aria-hidden="true">
                  {missing ? "＋" : "✓"}
                </span>{" "}
                {saving
                  ? "Guardando…"
                  : missing
                    ? missingValueCopy(fact).action
                    : "Esto es correcto"}
              </button>
            ) : null}
            {!missing ? (
            <button
              type="button"
              className="correct-action"
              aria-pressed={reviewMode === "correct"}
              onClick={() => {
                setReviewError("")
                setReviewMode("correct")
              }}
            >
              <span aria-hidden="true">✎</span> Necesito corregirlo
            </button>
            ) : null}
            {/* Al operador le falta "Esto es correcto" porque confirmar es
                cosa de validadores. Sin esta línea ve media tarjeta y ninguna
                explicación de por qué. */}
            {role === "operador" ? (
              <p className="fact-review-note">
                {missing
                  ? "Un validador debe resolver esta señal."
                  : "Puedes pedir una corrección; confirmar es cosa de un validador."}
              </p>
            ) : null}
          </div>
          <AnimatePresence initial={false}>
            {reviewMode ? (
              <motion.div
                className="fact-review-reveal"
                initial={reduceMotion ? false : { opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={
                  reduceMotion
                    ? { opacity: 1, height: "auto" }
                    : { opacity: 0, height: 0 }
                }
                transition={{
                  duration: reduceMotion ? 0.01 : 0.22,
                  ease: reduceMotion ? "linear" : "easeOut",
                }}
              >
                <form onSubmit={submit} className="fact-review-form">
                  {missing ? (
                    <p className="fact-review-help">
                      {missingValueCopy(fact).help}
                    </p>
                  ) : null}
                  {!closed && missing && readingsOf(fact).length ? (
                    <div className="fact-readings" role="group"
                      aria-label="Lecturas de cada modelo">
                      {readingsOf(fact).map(([provider, reading]) => (
                        <button
                          key={provider}
                          type="button"
                          className={
                            value === scalarText(reading)
                              ? "fact-reading is-chosen"
                              : "fact-reading"
                          }
                          aria-pressed={value === scalarText(reading)}
                          onClick={() => setValue(scalarText(reading))}
                        >
                          <strong>{scalarText(reading)}</strong>
                          <small>{provider}</small>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {closed && (reviewMode === "correct" || missing) ? (
                    <fieldset className="fact-options">
                      <legend>¿Quiénes necesitan protección especial?</legend>
                      {VULNERABILITY_OPTIONS.map((option) => (
                        <label key={option.id}>
                          <input
                            type="checkbox"
                            checked={chosen.includes(option.id)}
                            onChange={() =>
                              setChosen((current) =>
                                toggleVulnerability(current, option.id))}
                          />
                          {option.label}
                        </label>
                      ))}
                    </fieldset>
                  ) : null}
                  {!closed && (reviewMode === "correct" || missing) ? (
                    <label>
                      {reviewMode === "confirm"
                        ? "Valor confirmado"
                        : "Valor corregido"}
                      <input
                        value={value}
                        onChange={(event) => setValue(event.target.value)}
                        required
                      />
                    </label>
                  ) : null}
                  <div className="fact-review-submit">
                    <button
                      type="button"
                      className="secondary-action"
                      onClick={() => {
                        setReviewMode(null)
                        setReviewError("")
                      }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={saving || (closed && chosen.length === 0)}
                    >
                      {saving
                        ? "Guardando…"
                        : reviewMode === "confirm"
                          ? "Confirmar lectura"
                          : "Guardar corrección"}
                    </button>
                  </div>
                  {reviewError ? (
                    <p className="action-error" role="alert">
                      {reviewError}
                    </p>
                  ) : null}
                </form>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </>
      ) : null}
      {selected && onNext ? (
        <button type="button" className="fact-review-next"
          disabled={saving || reviewMode !== null} onClick={onNext}>
          Revisar siguiente pendiente <span aria-hidden="true">→</span>
        </button>
      ) : null}
    </article>
  )
}


export function VerificationPanel({
  facts,
  role,
  segments = [],
  selectedStartMs,
  selectedFactId = null,
  onSelectFact,
  onSeek,
  onReview,
}: {
  facts: Fact[]
  role: Role
  segments?: Segment[]
  selectedStartMs?: number | null
  selectedFactId?: string | null
  onSelectFact?: (fact: Fact | null) => void
  onSeek?: (milliseconds: number) => void
  onReview: (factId: string, payload: FactReview) => Promise<void> | void
}) {
  const panelMotion = useReducedMotion() ?? false
  const [filter, setFilter] = useState<SignalFilter>("all")
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null)
  const activeFactId = onSelectFact ? selectedFactId : localSelectedId
  const select = (fact: Fact | null) => {
    if (onSelectFact) onSelectFact(fact)
    else setLocalSelectedId(fact?.id ?? null)
  }
  const panelRef = useRef<HTMLElement>(null)
  const [navigationTarget, setNavigationTarget] = useState<{ factId: string } | null>(null)

  // Sólo la navegación guiada mueve el foco; el video no interrumpe la lectura.
  useEffect(() => {
    if (!navigationTarget || navigationTarget.factId !== activeFactId) return
    const card = Array.from(panelRef.current?.querySelectorAll<HTMLElement>("[data-fact-id]") ?? [])
      .find((element) => element.dataset.factId === navigationTarget.factId)
    if (!card) return
    card.querySelector<HTMLButtonElement>(".fact-card-heading")?.focus({ preventScroll: true })
    card.scrollIntoView?.({ block: "nearest", behavior: panelMotion ? "instant" : "smooth" })
    setNavigationTarget(null)
  }, [navigationTarget, activeFactId, filter, panelMotion])

  // La revisión baja por las tarjetas en el orden en que se leen: por
  // fragmento del testimonio, las críticas primero dentro de cada uno, y al pie
  // las que no tienen fragmento. Antes saltaba a todas las críticas y, al
  // confirmar la última, volvía arriba: la lista se recorría a brincos.
  const readingPosition = new Map(
    segments.map((segment, index) => [segment.id, index] as const),
  )
  const anchorIndex = (fact: Fact) =>
    Math.min(
      Infinity,
      ...(fact.evidence ?? []).map(
        (evidence) => readingPosition.get(evidence.segment_id) ?? Infinity,
      ),
    )
  const readingOrder = [...facts]
    .sort((left, right) => Number(right.is_critical) - Number(left.is_critical))
    .sort((left, right) => {
      const a = anchorIndex(left)
      const b = anchorIndex(right)
      return a === b ? 0 : a < b ? -1 : 1
    })
  const pendingFacts = readingOrder.filter(
    (fact) => fact.verification_status !== "confirmed",
  )
  const selectedPosition = readingOrder.findIndex((fact) => fact.id === activeFactId)
  const nextPending =
    pendingFacts.find((fact) => readingOrder.indexOf(fact) > selectedPosition)
    ?? pendingFacts[0]
  const firstBlocking = pendingFacts.find((fact) => fact.is_critical)
  const navigateTo = (fact: Fact) => {
    // La siguiente puede quedar fuera del filtro que se estaba consultando.
    setFilter("all")
    setNavigationTarget({ factId: fact.id })
    select(fact)
  }
  const reviewNext = nextPending && nextPending.id !== activeFactId
    ? () => navigateTo(nextPending)
    : undefined


  const segmentById = new Map(segments.map((segment) => [segment.id, segment]))

  // Señales que el cabezal está tocando ahora mismo: contexto, distinto de la
  // señal que la persona eligió investigar.
  const contextualFacts = new Set(
    facts
      .filter((fact) =>
        selectedStartMs !== null
        && selectedStartMs !== undefined
        && (fact.evidence ?? []).some(
          (evidence) =>
            selectedStartMs >= evidence.start_ms
            && selectedStartMs <= evidence.end_ms,
        ))
      .map((fact) => fact.id),
  )

  const orderedFacts = readingOrder.filter((fact) => matchesFilter(fact, filter))

  const counts = {
    all: facts.length,
    critical: facts.filter((fact) => fact.is_critical).length,
    pending: facts.filter((fact) => fact.verification_status !== "confirmed").length,
  }
  // Las críticas sin confirmar son las que detienen la aprobación y, ahora,
  // también el paso a la ruta.
  const bloqueantes = facts.filter(
    (fact) => fact.is_critical && fact.verification_status !== "confirmed",
  ).length

  return (
    <section ref={panelRef} className="verification-panel" aria-labelledby="verification-title">
      <div className="signal-review-summary">
        <div className="stage-section-heading">
          <div>
            <p className="eyebrow">Control humano</p>
            <h2 id="verification-title">Señales encontradas</h2>
          </div>
          {/* El resumen distingue el trabajo pendiente de lo que bloquea la ruta. */}
          <p className="verification-worklist" role="status">
            {facts.length === 0 ? (
              <strong>No se encontraron señales para revisar.</strong>
            ) : counts.pending === 0 ? (
              <>
                <span className="verification-done" aria-hidden="true">✓</span>{" "}
                <strong>Todas las señales están confirmadas.</strong> Puedes
                continuar a la ruta.
              </>
            ) : (
              <>
                <strong>
                  {counts.pending === 1
                    ? "Falta 1 señal por confirmar"
                    : `Faltan ${counts.pending} señales por confirmar`}
                </strong>
                {bloqueantes > 0 ? (
                  <>
                    {" · "}
                    {bloqueantes === 1
                      ? "1 bloquea la aprobación"
                      : `${bloqueantes} bloquean la aprobación`}
                  </>
                ) : null}
              </>
            )}
          </p>
        </div>
        {facts.length > 0 ? (
          <div className="signal-review-progress">
            <span>{facts.length - counts.pending} de {facts.length} confirmadas</span>
            <div role="progressbar" aria-label="Señales confirmadas"
              aria-valuemin={0} aria-valuemax={facts.length}
              aria-valuenow={facts.length - counts.pending}>
              <span style={{ width: `${((facts.length - counts.pending) / facts.length) * 100}%` }} />
            </div>
          </div>
        ) : null}
        {nextPending ? (
          <div className="signal-review-navigation">
            <button type="button" className="signal-review-start" onClick={() => navigateTo(nextPending)}>
              {activeFactId ? "Continuar revisión" : "Empezar revisión"}
              <span aria-hidden="true">→</span>
            </button>
            {firstBlocking ? (
              <button type="button" className="signal-review-blocking" onClick={() => navigateTo(firstBlocking)}>
                Revisar bloqueantes <span aria-hidden="true">↗</span>
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      <p className="verification-policy">
        Cada corrección conserva autor, valor anterior y estado.
      </p>

      {/* Agrupar sin convertir esto en un tablero: tres cortes derivados de
          campos que ya existen, no facetas inventadas. */}
      <div className="signal-filters" role="group" aria-label="Filtrar señales">
        {FILTERS.map((option) => (
          <button
            key={option.id}
            type="button"
            className={filter === option.id ? "is-current" : ""}
            aria-pressed={filter === option.id}
            onClick={() => setFilter(option.id)}
          >
            {option.label}
            <span>{counts[option.id]}</span>
          </button>
        ))}
      </div>
      {facts.length > 0 && orderedFacts.length === 0 ? (
        <p className="signal-empty" role="status">
          {filter === "critical" ? "No hay señales críticas en este caso." : "No quedan señales por confirmar."}
        </p>
      ) : null}
      <div className="signal-list">
        {orderedFacts.map((fact) => {
          const evidence = [...(fact.evidence ?? [])].sort((a, b) => a.start_ms - b.start_ms)
          const first = evidence[0]
          const segment = first ? segmentById.get(first.segment_id) : undefined
          return (
            <FactCard
              key={fact.id}
              fact={fact}
              role={role}
              selected={fact.id === activeFactId}
              contextual={contextualFacts.has(fact.id)}
              evidenceQuotes={first && segment ? [{
                text: segment.text,
                startMs: first.start_ms,
                endMs: first.end_ms,
              }] : []}
              repeats={[...new Set(evidence.slice(1).map((item) => item.start_ms))]}
              onSelect={() => select(fact.id === activeFactId ? null : fact)}
              onSeek={(milliseconds) => onSeek?.(milliseconds)}
              onReview={onReview}
              onNext={reviewNext}
            />
          )
        })}
      </div>
    </section>
  )
}
