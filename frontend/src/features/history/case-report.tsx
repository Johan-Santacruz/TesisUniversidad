import { useRef, useState } from "react"
import { Link } from "react-router-dom"

import { apiClient } from "../../api/client"
import "./case-report.css"


// Algunos navegadores cancelan la descarga si el enlace se revoca en el mismo
// turno del clic. Medio minuto sobra para que el archivo ya esté en disco.
const REVOKE_AFTER_MS = 30_000


/* Pide el resumen al servidor —que lo arma, lo registra en la auditoría y lo
 * entrega con su nombre— y lo guarda en el equipo. */
export async function downloadCaseReport(caseId: string): Promise<void> {
  const { blob, filename } = await apiClient.downloadFile(
    `/api/v1/cases/${caseId}/report`,
  )
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename ?? "senda-resumen-del-caso.pdf"
  // Firefox sólo descarga desde enlaces que están en el documento.
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS)
}


export function ReportButton({
  caseId,
  className,
  label = "Descargar PDF",
  accessibleName,
}: {
  caseId: string
  className?: string
  label?: string
  // En una lista hay un botón por caso: el lector de pantalla necesita saber
  // de cuál es cada uno.
  accessibleName?: string
}) {
  const [state, setState] = useState<"idle" | "working" | "failed">("idle")
  const [problem, setProblem] = useState("")
  // Un doble clic no debe pedir dos PDF ni dejar dos registros de auditoría.
  const workingRef = useRef(false)

  const download = async () => {
    if (workingRef.current) return
    workingRef.current = true
    setState("working")
    setProblem("")
    try {
      await downloadCaseReport(caseId)
      setState("idle")
    } catch (caught) {
      setState("failed")
      setProblem(
        caught instanceof Error && caught.message
          ? caught.message
          : "No se pudo preparar el PDF. Inténtalo de nuevo.",
      )
    } finally {
      workingRef.current = false
    }
  }

  return (
    <>
      <button
        type="button"
        className={className}
        aria-label={state === "working" ? undefined : accessibleName}
        aria-busy={state === "working"}
        onClick={() => void download()}
      >
        {state === "working" ? "Preparando el PDF…" : label}
      </button>
      {state === "failed" ? (
        <span className="case-report-error" role="alert">
          {problem}
        </span>
      ) : null}
    </>
  )
}


/* El pie del pliego dice que lo que se ve ya quedó guardado y ofrece las dos
 * salidas: volver a encontrarlo en el historial o llevárselo en PDF. Va como
 * ranura y no dentro del espacio de trabajo para que éste no dependa del
 * enrutador. */
export function CaseFileActions({ caseId }: { caseId: string }) {
  return (
    <span className="case-file-actions">
      <Link to="/historial" className="tour-again case-file-saved">
        <span aria-hidden="true">✓ </span>Guardado en el historial
      </Link>
      <ReportButton
        caseId={caseId}
        className="tour-again"
        label="Descargar resumen en PDF"
      />
    </span>
  )
}
