import { useState, type FormEvent } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"

import type { components } from "../../api/generated"
import { StatusBadge } from "./status-badge"


type Fact = components["schemas"]["FactRead"]
type FactReview = components["schemas"]["FactReviewRequest"]
type Role = components["schemas"]["UserRole"]
type ReviewMode = "confirm" | "correct"


function displayValue(value: Fact["value"]) {
  if (Array.isArray(value)) return value.join(", ")
  if (value === null) return "Sin valor acordado"
  return String(value)
}


function FactCard({
  fact,
  role,
  selected,
  onReview,
}: {
  fact: Fact
  role: Role
  selected: boolean
  onReview: (factId: string, payload: FactReview) => Promise<void> | void
}) {
  const reduceMotion = useReducedMotion() ?? false
  const [value, setValue] = useState(
    fact.value === null ? "" : displayValue(fact.value),
  )
  const [reason, setReason] = useState("")
  const [reviewMode, setReviewMode] = useState<ReviewMode | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!reviewMode) return
    setSaving(true)
    try {
      const reviewNeedsValue = reviewMode === "correct" || fact.value === null
      await onReview(fact.id, {
        action: reviewMode,
        value: reviewNeedsValue ? value : undefined,
        reason,
      })
      setReason("")
      setReviewMode(null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <article className={selected ? "fact-card is-contextual" : "fact-card"}>
      <div className="fact-card-heading">
        <div>
          <h4>{fact.label}</h4>
          {fact.is_critical ? <span className="critical-mark">Crítico</span> : null}
        </div>
        <StatusBadge
          status={fact.verification_status}
          confidence={fact.confidence_band}
          origin={fact.origin}
        />
      </div>
      <p className="fact-value">{displayValue(fact.value)}</p>
      {Object.keys(fact.provider_values ?? {}).length > 1 ? (
        <dl className="provider-readings">
          {Object.entries(fact.provider_values ?? {}).map(([provider, reading]) => (
            <div key={provider}>
              <dt>{provider}</dt>
              <dd>{displayValue(reading)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {fact.verification_status !== "confirmed" ? (
        <>
          <div className="fact-review-actions">
            {role !== "operador" ? (
              <button
                type="button"
                className="confirm-action"
                aria-pressed={reviewMode === "confirm"}
                onClick={() => setReviewMode("confirm")}
              >
                <span aria-hidden="true">✓</span> Esto es correcto
              </button>
            ) : null}
            <button
              type="button"
              className="correct-action"
              aria-pressed={reviewMode === "correct"}
              onClick={() => setReviewMode("correct")}
            >
              <span aria-hidden="true">✎</span> Necesito corregirlo
            </button>
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
                  <label>
                    {reviewMode === "confirm"
                      ? "Razón de la confirmación"
                      : "Razón de la corrección"}
                    <textarea
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      minLength={5}
                      required
                    />
                  </label>
                  <div className="fact-review-submit">
                    <button
                      type="button"
                      className="secondary-action"
                      onClick={() => {
                        setReviewMode(null)
                        setReason("")
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
  selectedStartMs,
  onReview,
}: {
  facts: Fact[]
  role: Role
  selectedStartMs?: number | null
  onReview: (factId: string, payload: FactReview) => Promise<void> | void
}) {
  const selectedFacts = new Set(
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
  const orderedFacts = [...facts].sort((left, right) => {
    if (left.is_critical === right.is_critical) return 0
    return left.is_critical ? -1 : 1
  })

  return (
    <section className="verification-panel" aria-labelledby="verification-title">
      <div className="stage-section-heading">
        <div>
          <p className="eyebrow">Control humano</p>
          <h2 id="verification-title">Señales encontradas</h2>
        </div>
        <p>Cada corrección conserva autor, razón y estado.</p>
      </div>
      <div className="evidence-grid">
        {orderedFacts.map((fact) => (
          <FactCard
            key={fact.id}
            fact={fact}
            role={role}
            selected={selectedFacts.has(fact.id)}
            onReview={onReview}
          />
        ))}
      </div>
    </section>
  )
}
