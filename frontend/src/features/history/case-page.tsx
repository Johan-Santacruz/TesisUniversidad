import { useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"

import { ApiError, apiClient } from "../../api/client"
import type { components } from "../../api/generated"
import { useAuth } from "../../auth/auth-context"
import { AnalysisWorkspace } from "../../components/analysis/analysis-workspace"
import { DeskSurface } from "../../components/desk-surface"
import { WorkspaceHeader } from "../../components/workspace-header"
import { CaseFileActions } from "./case-report"
import "./history-page.css"


type CaseData = components["schemas"]["CaseRead"]

type CaseLoad =
  | { status: "loading" }
  | { status: "ready"; caseData: CaseData }
  | { status: "error"; message: string; missing: boolean }


/* Un caso del historial se abre en la misma mesa en que se analizó: el mismo
 * pliego, las mismas tres etapas y las mismas acciones de revisión. Lo único
 * que cambia es de dónde llega —del servidor y no del análisis— y adónde lleva
 * "Analizar otro testimonio". */
export default function CasePage() {
  const { caseId = "" } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [load, setLoad] = useState<CaseLoad>({ status: "loading" })

  useEffect(() => {
    let active = true
    setLoad({ status: "loading" })
    apiClient.request<CaseData>(`/api/v1/cases/${encodeURIComponent(caseId)}`).then(
      (caseData) => {
        if (active) setLoad({ status: "ready", caseData })
      },
      (caught) => {
        if (!active) return
        const missing = caught instanceof ApiError && caught.status === 404
        setLoad({
          status: "error",
          missing,
          message: missing
            ? "Puede que se haya eliminado o que el enlace esté incompleto."
            : caught instanceof Error && caught.message
              ? caught.message
              : "No se pudo abrir el caso.",
        })
      },
    )
    return () => {
      active = false
    }
  }, [caseId])

  return (
    <div className="analysis-app" data-testid="history-case">
      <WorkspaceHeader />
      {load.status === "ready" && user ? (
        <AnalysisWorkspace
          // Otro caso es otra mesa: sin la llave, el estado del anterior
          // —etapa, video, cierre— se quedaría pegado al cambiar de URL.
          key={load.caseData.id}
          initialCase={load.caseData}
          role={user.role}
          loadRemoteVideo
          caseActions={(caseData) => (
            <CaseFileActions
              caseId={caseData.id}
              approved={caseData.status === "approved"}
            />
          )}
          onRestart={() => navigate("/subir-video")}
          // Desde la primera etapa, "atrás" es la lista de donde se vino.
          backAction={{ label: "Historial", onClick: () => navigate("/historial") }}
        />
      ) : (
        <div className="desk-stage history-stage">
          <DeskSurface />
          <section className="history-sheet history-notice" aria-live="polite">
            {load.status === "error" ? (
              <>
                <p className="eyebrow">Historial</p>
                <h1>{load.missing ? "No encontramos este caso." : "No se pudo abrir el caso."}</h1>
                <p className="history-lede" role="alert">{load.message}</p>
                <Link to="/historial" className="history-action">
                  <span aria-hidden="true">←</span> Volver al historial
                </Link>
              </>
            ) : (
              <p className="history-lede" role="status">Abriendo el caso…</p>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
