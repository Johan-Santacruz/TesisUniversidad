import { NARRATIVE_STAGES, type NarrativeStage } from "./narrative-stage"
import "./stage-pager.css"


const NEXT_LABELS: Partial<Record<NarrativeStage, string>> = {
  listening: "Revisar señales",
  evidence: "Continuar a la ruta",
}


/* Atrás y adelante entre las tres etapas, desde el pie.
 *
 * La ranura de "qué sigue" ya recorría las etapas hacia adelante y, en la
 * última, ofrecía empezar otro testimonio. Faltaba el regreso: en un teléfono
 * las pestañas de arriba quedan a mil y pico píxeles, y volver de Señales a
 * Escuchar obligaba a subir la página entera. En pantallas apiladas esta
 * barra flota abajo, al alcance del pulgar.
 *
 * Antes de la primera etapa puede haber adónde volver —la lista del
 * historial, cuando el caso se abrió desde allí—; si no, no se ofrece nada. */
export function StagePager({
  stage,
  back,
  onStageChange,
  onFinish,
}: {
  stage: NarrativeStage
  back?: { label: string; onClick: () => void }
  onStageChange: (stage: NarrativeStage) => void
  onFinish: () => void
}) {
  const index = NARRATIVE_STAGES.findIndex(({ id }) => id === stage)
  const previous = index > 0 ? NARRATIVE_STAGES[index - 1] : null
  const next = NARRATIVE_STAGES[index + 1] ?? null

  return (
    <nav className="stage-pager" aria-label="Moverse entre etapas">
      {previous ? (
        <button
          type="button"
          className="stage-pager-back"
          // El nombre lleva el verbo; la vista, sólo la flecha y el destino.
          aria-label={`Volver a ${previous.shortTitle}`}
          onClick={() => onStageChange(previous.id)}
        >
          <span aria-hidden="true">←</span> {previous.shortTitle}
        </button>
      ) : back ? (
        <button
          type="button"
          className="stage-pager-back"
          aria-label={`Volver al ${back.label.toLowerCase()}`}
          onClick={back.onClick}
        >
          <span aria-hidden="true">←</span> {back.label}
        </button>
      ) : null}
      {next ? (
        <button
          type="button"
          className="stage-pager-next"
          onClick={() => onStageChange(next.id)}
        >
          {NEXT_LABELS[stage]} <span aria-hidden="true">→</span>
        </button>
      ) : (
        <button
          type="button"
          className="stage-pager-next workspace-restart"
          onClick={onFinish}
        >
          Analizar otro testimonio <span aria-hidden="true">→</span>
        </button>
      )}
    </nav>
  )
}
