import { useState, type FormEvent } from "react"

import type { components } from "../../api/generated"
import { StatusBadge } from "./status-badge"


type Fact = components["schemas"]["FactRead"]
type FactReview = components["schemas"]["FactReviewRequest"]
type Role = components["schemas"]["UserRole"]


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
  const [value, setValue] = useState(displayValue(fact.value))
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    try {
      await onReview(fact.id, {
        action: role === "operador" ? "correct" : "confirm",
        value: value === "Sin valor acordado" ? null : value,
        reason,
      })
      setReason("")
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
        <form onSubmit={submit} className="fact-review-form">
          <label>
            {role === "operador" ? "Corrección propuesta" : "Lectura validada"}
            <input
              value={value}
              onChange={(event) => setValue(event.target.value)}
              required
            />
          </label>
          <label>
            Razón de la revisión
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              minLength={5}
              required
            />
          </label>
          <button type="submit" disabled={saving}>
            {role === "operador" ? "Proponer corrección" : "Confirmar lectura"}
          </button>
        </form>
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
  const groups = [
    {
      title: "Alta confianza",
      facts: facts.filter(
        (fact) =>
          fact.verification_status === "confirmed"
          && fact.confidence_band === "high",
      ),
    },
    {
      title: "Requiere confirmación",
      facts: facts.filter((fact) =>
        fact.verification_status === "pending"
        || fact.verification_status === "inconsistent"),
    },
    {
      title: "No identificado",
      facts: facts.filter(
        (fact) => fact.verification_status === "not_identified",
      ),
    },
  ]

  return (
    <aside className="verification-panel" aria-labelledby="verification-title">
      <div className="verification-intro">
        <p className="eyebrow">Control humano</p>
        <h2 id="verification-title">Verificación</h2>
        <p>
          Cada cambio conserva autor, razón y estado. Ninguna inconsistencia se
          resuelve en silencio.
        </p>
      </div>
      {groups.map((group) => (
        <section key={group.title} className="fact-group">
          <h3>{group.title}</h3>
          {group.facts.length ? (
            <div className="fact-list">
              {group.facts.map((fact) => (
                <FactCard
                  key={fact.id}
                  fact={fact}
                  role={role}
                  selected={selectedFacts.has(fact.id)}
                  onReview={onReview}
                />
              ))}
            </div>
          ) : (
            <p className="empty-group">Sin elementos en este grupo.</p>
          )}
        </section>
      ))}
    </aside>
  )
}
