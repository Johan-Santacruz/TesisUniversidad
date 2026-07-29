import type { ReactNode } from "react"


export type NarrativeStage = "listening" | "evidence" | "route"


export const NARRATIVE_STAGES: Array<{
  id: NarrativeStage
  number: string
  title: string
  description: string
}> = [
  {
    id: "listening",
    number: "01",
    title: "Escuchando el relato",
    description:
      "Revisa cómo el testimonio quedó organizado en fragmentos vinculados al video.",
  },
  {
    id: "evidence",
    number: "02",
    title: "Ordenando lo importante",
    description:
      "Confirma las señales, los hechos y la clasificación encontrados en el relato.",
  },
  {
    id: "route",
    number: "03",
    title: "Trazando la ruta",
    description:
      "Recorre la cronología y compara las rutas institucionales sustentadas.",
  },
]


export function NarrativeStageHeader({
  stage,
  aside,
  onStageChange,
}: {
  stage: NarrativeStage
  aside?: ReactNode
  onStageChange: (stage: NarrativeStage) => void
}) {
  const current = NARRATIVE_STAGES.find((item) => item.id === stage)
    ?? NARRATIVE_STAGES[0]

  return (
    <header className="narrative-stage-header">
      <div className="narrative-stage-meta">
        <p>
          <strong>{current.number} / 03</strong>
          <span>Del relato a la ruta</span>
        </p>
        <nav aria-label="Etapas del análisis">
          {NARRATIVE_STAGES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === stage ? "is-current" : ""}
              aria-current={item.id === stage ? "step" : undefined}
              aria-label={`Ir a ${item.title}`}
              onClick={() => onStageChange(item.id)}
            >
              <span aria-hidden="true" />
            </button>
          ))}
        </nav>
      </div>
      <div className="narrative-stage-title-row">
        <div>
          <h1>{current.title}</h1>
          <span className="narrative-title-rule" aria-hidden="true" />
          <p>{current.description}</p>
        </div>
        {aside}
      </div>
    </header>
  )
}
