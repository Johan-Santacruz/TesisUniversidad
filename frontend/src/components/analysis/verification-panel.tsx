import { useRef, useState, type FormEvent } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"

import type { components } from "../../api/generated"
import {
  narrativeChildTransition,
  narrativeStageStagger,
} from "./motion"
import { StatusBadge } from "./status-badge"


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
}) {
  const reduceMotion = useReducedMotion() ?? false
  const [value, setValue] = useState(
    fact.value === null ? "" : displayValue(fact),
  )
  const [reason, setReason] = useState("")
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
      setReason("")
      setReviewMode(null)
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
      const reviewNeedsValue = reviewMode === "correct" || fact.value === null
      await onReview(fact.id, {
        action: reviewMode,
        value: reviewNeedsValue ? value : undefined,
        reason,
      })
      setReason("")
      setReviewMode(null)
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
      className={[
        "fact-card",
        selected ? "is-selected" : "",
        contextual ? "is-contextual" : "",
        fact.is_critical && fact.verification_status !== "confirmed"
          ? "is-blocking"
          : "",
        fact.verification_status === "confirmed" ? "is-confirmed" : "",
      ].filter(Boolean).join(" ")}
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
        {fact.value === null
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
                <span className="visually-hidden">Ver en el video, minuto </span>
                {stamp(milliseconds)}
              </button>
            </span>
          ))}
        </p>
      ) : null}
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
                Esta señal no quedó anclada a un fragmento del testimonio.
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
                  if (fact.value === null) {
                    setReviewMode("confirm")
                    return
                  }
                  void send("confirm", { reason: "" })
                }}
              >
                <span aria-hidden="true">
                  {fact.value === null ? "＋" : "✓"}
                </span>{" "}
                {saving
                  ? "Guardando…"
                  : fact.value === null
                    ? missingValueCopy(fact).action
                    : "Esto es correcto"}
              </button>
            ) : null}
            {fact.value !== null ? (
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
                {fact.value === null
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
                  {fact.value === null ? (
                    <p className="fact-review-help">
                      {missingValueCopy(fact).help}
                    </p>
                  ) : null}
                  {fact.value === null && readingsOf(fact).length ? (
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
                  {reviewMode === "correct" || fact.value === null ? (
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
                  {reviewMode === "correct" ? (
                    <label>
                      Razón de la corrección
                      <textarea
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        minLength={5}
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
                        setReason("")
                        setReviewError("")
                      }}
                    >
                      Cancelar
                    </button>
                    <button type="submit" disabled={saving}>
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

  const orderedFacts = [...facts]
    .filter((fact) => matchesFilter(fact, filter))
    .sort((left, right) => {
      if (left.is_critical === right.is_critical) return 0
      return left.is_critical ? -1 : 1
    })

  // Una señal puede apoyarse en varios pasajes. La nota se escribe una sola
  // vez, en el primero, y los demás quedan como retornos a esa nota: repetir
  // la tarjeta entera mostraba tres veces los mismos botones para la misma
  // señal, y confirmar en una las confirmaba todas.
  const segmentOrder = new Map(
    segments.map((segment, index) => [segment.id, index] as const),
  )
  const mentionsOf = new Map<string, string[]>()
  for (const fact of orderedFacts) {
    const anchored = [
      ...new Set(
        (fact.evidence ?? [])
          .map((evidence) => evidence.segment_id)
          .filter((segmentId) => segmentOrder.has(segmentId)),
      ),
    ].sort(
      (left, right) =>
        (segmentOrder.get(left) ?? 0) - (segmentOrder.get(right) ?? 0),
    )
    if (anchored.length) mentionsOf.set(fact.id, anchored)
  }
  const anchorOf = (fact: Fact) => mentionsOf.get(fact.id)?.[0]

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
    <section className="verification-panel" aria-labelledby="verification-title">
      <div className="stage-section-heading">
        <div>
          <p className="eyebrow">Control humano</p>
          <h2 id="verification-title">Señales encontradas</h2>
        </div>
        {/* Esta línea decía "Cada corrección conserva autor, razón y estado",
            que es cierto y es política, pero no es lo que necesita saber quien
            acaba de llegar. Lo que necesita saber es cuánto trabajo queda y
            qué lo bloquea. La política pasa abajo, donde sigue estando. */}
        <p className="verification-worklist" role="status">
          {counts.pending === 0 ? (
            <>
              <span className="verification-done" aria-hidden="true">✓</span>{" "}
              <strong>Todas las señales están confirmadas.</strong> La ruta ya
              puede aprobarse.
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
      <p className="verification-policy">
        Cada corrección conserva autor, razón y estado.
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
      {/* Edición anotada: el testimonio corrido y, al margen, la señal que
          nació de cada fragmento. La relación deja de pedir un clic porque se
          ve. El anclaje sale de EvidenceRef; nada se deduce. */}
      {segments.length ? (
        <div className="marginalia">
          {segments
            .map((segment) => ({
              segment,
              notas: orderedFacts.filter(
                (fact) => anchorOf(fact) === segment.id,
              ),
              ecos: orderedFacts.filter(
                (fact) =>
                  anchorOf(fact) !== segment.id
                  && (mentionsOf.get(fact.id) ?? []).includes(segment.id),
              ),
            }))
            // La línea de tiempo completa vive en el riel del video. Aquí sólo
            // los pasajes que produjeron algo: eso distingue "todo el
            // testimonio" de "lo que encontró el análisis".
            .filter(({ notas, ecos }) => notas.length || ecos.length)
            .map(({ segment, notas, ecos }) => {
            const tocada = [...notas, ...ecos].some(
              (fact) => fact.id === selectedFactId,
            )
            return (
              <article
                key={segment.id}
                className={[
                  "marginalia-row",
                  tocada ? "is-anotada" : "",
                  notas.length ? "" : "is-eco",
                ].filter(Boolean).join(" ")}
              >
                <p className="marginalia-text">
                  <button
                    type="button"
                    className="marginalia-jump"
                    onClick={() => onSeek?.(segment.start_ms)}
                  >
                    <span className="visually-hidden">Ver en el video, minuto </span>
                    {stamp(segment.start_ms)}
                  </button>
                  {segment.text}
                </p>
                <div className="marginalia-notes">
                  {notas.map((fact) => (
                    <FactCard
                      key={fact.id}
                      fact={fact}
                      role={role}
                      selected={fact.id === selectedFactId}
                      contextual={contextualFacts.has(fact.id)}
                      evidenceQuotes={[]}
                      repeats={(mentionsOf.get(fact.id) ?? [])
                        .slice(1)
                        .map((id) => segmentById.get(id)?.start_ms)
                        .filter((ms): ms is number => ms !== undefined)}
                      onSelect={() =>
                        onSelectFact?.(fact.id === selectedFactId ? null : fact)}
                      onSeek={(milliseconds) => onSeek?.(milliseconds)}
                      onReview={onReview}
                    />
                  ))}
                  {/* El pasaje se repite; la nota no. Queda la referencia a
                      dónde se anotó, que además ilumina todas sus apariciones. */}
                  {ecos.map((fact) => (
                    <button
                      key={fact.id}
                      type="button"
                      className={
                        fact.id === selectedFactId
                          ? "marginalia-echo is-selected"
                          : "marginalia-echo"
                      }
                      onClick={() =>
                        onSelectFact?.(fact.id === selectedFactId ? null : fact)}
                    >
                      <span className="marginalia-echo-label">{fact.label}</span>
                      <span className="marginalia-echo-back">
                        ya anotado en{" "}
                        {stamp(
                          segmentById.get(mentionsOf.get(fact.id)?.[0] ?? "")
                            ?.start_ms ?? segment.start_ms,
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </article>
            )
          })}

          {/* Señales que el análisis no ancló a ningún fragmento conocido: no
              tienen margen donde vivir, así que se recogen al pie. */}
          {orderedFacts.some((fact) => !mentionsOf.has(fact.id)) ? (
            <article className="marginalia-row is-suelta">
              <p className="marginalia-text marginalia-orphan">
                Sin fragmento en el testimonio
              </p>
              <div className="marginalia-notes">
                {orderedFacts
                  .filter((fact) => !mentionsOf.has(fact.id))
                  .map((fact) => (
                    <FactCard
                      key={fact.id}
                      fact={fact}
                      role={role}
                      selected={fact.id === selectedFactId}
                      contextual={false}
                      evidenceQuotes={[]}
                      onSelect={() =>
                        onSelectFact?.(fact.id === selectedFactId ? null : fact)}
                      onSeek={() => undefined}
                      onReview={onReview}
                    />
                  ))}
              </div>
            </article>
          ) : null}
        </div>
      ) : null}

      {segments.length ? null : (
      <motion.div
        className="evidence-grid"
        initial={panelMotion ? false : "hidden"}
        animate="visible"
        variants={{
          hidden: {},
          visible: {
            transition: {
              staggerChildren: narrativeStageStagger(
                orderedFacts.length,
                panelMotion,
                "set",
              ),
            },
          },
        }}
      >
        {orderedFacts.map((fact) => (
          <motion.div
            key={fact.id}
            variants={{
              hidden: { opacity: 0, y: 8 },
              visible: {
                opacity: 1,
                y: 0,
                transition: narrativeChildTransition(panelMotion, "set"),
              },
            }}
          >
            <FactCard
              fact={fact}
              role={role}
              selected={fact.id === selectedFactId}
              contextual={contextualFacts.has(fact.id)}
              evidenceQuotes={(fact.evidence ?? []).map((evidence) => ({
                text: segmentById.get(evidence.segment_id)?.text
                  ?? "Fragmento no disponible en este caso.",
                startMs: evidence.start_ms,
                endMs: evidence.end_ms,
              }))}
              onSelect={() =>
                onSelectFact?.(fact.id === selectedFactId ? null : fact)}
              onSeek={(milliseconds) => onSeek?.(milliseconds)}
              onReview={onReview}
            />
          </motion.div>
        ))}
      </motion.div>
      )}
    </section>
  )
}
