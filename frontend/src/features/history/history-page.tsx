import { useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { Link } from "react-router-dom"

import { SHEET_LANDING } from "../../components/analysis/analysis-workspace"
import { DeskSurface } from "../../components/desk-surface"
import { WorkspaceHeader } from "../../components/workspace-header"
import {
  caseDate,
  caseProgress,
  caseStatusLabel,
  caseTime,
  caseTitle,
} from "./case-labels"
import { ReportButton } from "./case-report"
import { useCaseHistory, type HistoryFilter } from "./use-case-history"
import "./history-page.css"


const FILTERS: Array<{ id: HistoryFilter; label: string; empty: string }> = [
  { id: "all", label: "Todos", empty: "Todavía no hay casos guardados." },
  { id: "in_review", label: "En revisión", empty: "No hay casos en revisión." },
  { id: "approved", label: "Aprobados", empty: "Ningún caso tiene todavía la orientación aprobada." },
]


export default function HistoryPage() {
  const [filter, setFilter] = useState<HistoryFilter>("all")
  const history = useCaseHistory(filter)
  const reduceMotion = useReducedMotion() ?? false
  const empty = FILTERS.find((item) => item.id === filter)?.empty ?? ""

  return (
    <div className="analysis-app" data-testid="case-history">
      <WorkspaceHeader />
      <div className="desk-stage history-stage">
        <DeskSurface />
        {/* Una sola hoja, del mismo papel que el pliego de la subida: el
            historial es el registro del libro, no otra aplicación. */}
        <motion.section
          className="history-sheet"
          aria-labelledby="history-title"
          initial={reduceMotion ? false : SHEET_LANDING.from}
          animate={SHEET_LANDING.to}
          transition={SHEET_LANDING.transition}
        >
          <header className="history-head">
            <p className="eyebrow">Historial</p>
            <h1 id="history-title">Cada caso, donde lo dejaste.</h1>
            <span className="history-rule" aria-hidden="true"><i /><i /><i /></span>
            <p className="history-lede">
              Cada análisis queda guardado y cifrado tal como lo viste. Ábrelo
              para seguir revisándolo o descarga su resumen en PDF.
            </p>
          </header>

          <div className="history-toolbar">
            <div className="signal-filters" role="group" aria-label="Filtrar casos por estado">
              {FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={item.id === filter ? "is-current" : ""}
                  aria-pressed={item.id === filter}
                  onClick={() => setFilter(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {history.status === "ready" && history.total ? (
              <p className="history-count" role="status">
                {history.total === 1 ? "1 caso" : `${history.total} casos`}
              </p>
            ) : null}
          </div>

          {history.status === "loading" ? (
            <div className="history-loading">
              <p className="visually-hidden" role="status">Cargando el historial…</p>
              {/* Tres renglones en blanco guardan el sitio de la lista: sin
                  ellos la hoja se encogía y volvía a crecer al llegar. */}
              {[0, 1, 2].map((row) => (
                <span key={row} className="history-placeholder" aria-hidden="true" />
              ))}
            </div>
          ) : null}

          {history.status === "error" ? (
            <div className="history-empty" role="alert">
              <p>
                <strong>No se pudo cargar el historial.</strong> {history.error}
              </p>
              <button type="button" className="history-action" onClick={history.retry}>
                Reintentar
              </button>
            </div>
          ) : null}

          {history.status === "ready" && !history.items.length ? (
            <div className="history-empty">
              <p><strong>{empty}</strong></p>
              {filter === "all" ? (
                <Link to="/subir-video" className="history-open">
                  Analizar un testimonio <span aria-hidden="true">→</span>
                </Link>
              ) : null}
            </div>
          ) : null}

          {history.status === "ready" && history.items.length ? (
            <ol className="history-list">
              {history.items.map((item) => (
                <li key={item.id} className="history-entry">
                  <p className="history-entry-when">
                    <time dateTime={item.created_at}>{caseDate(item.created_at)}</time>
                    <small>{caseTime(item.created_at)}</small>
                  </p>
                  <div className="history-entry-body">
                    <p className="history-entry-reference">
                      Caso {item.reference}
                      {item.is_demo ? " · Demostración" : ""}
                    </p>
                    <h2>{caseTitle(item)}</h2>
                    <p className="history-entry-progress">
                      {caseProgress(item)}
                      {item.video_status === "deleted" ? " · video eliminado por retención" : ""}
                    </p>
                  </div>
                  <span
                    className={
                      item.status === "approved"
                        ? "recommendation-label is-final"
                        : "recommendation-label"
                    }
                  >
                    {caseStatusLabel(item)}
                  </span>
                  <div className="history-entry-actions">
                    <Link
                      to={`/historial/${item.id}`}
                      className="history-open"
                      aria-label={`Abrir el caso ${item.reference}`}
                    >
                      Abrir caso <span aria-hidden="true">→</span>
                    </Link>
                    <ReportButton
                      caseId={item.id}
                      className="history-report"
                      accessibleName={`Descargar en PDF el resumen del caso ${item.reference}`}
                    />
                  </div>
                </li>
              ))}
            </ol>
          ) : null}

          {history.status === "ready" && history.hasMore ? (
            <div className="history-more">
              <button
                type="button"
                className="history-action"
                disabled={history.loadingMore}
                onClick={history.loadMore}
              >
                {history.loadingMore ? "Cargando…" : "Mostrar más casos"}
              </button>
              {history.moreError ? (
                <p className="case-report-error" role="alert">{history.moreError}</p>
              ) : null}
            </div>
          ) : null}
        </motion.section>
      </div>
    </div>
  )
}
