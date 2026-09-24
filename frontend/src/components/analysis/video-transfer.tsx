import "./video-transfer.css"


export type VideoTransfer = {
  videoId: string
  // Fracción del archivo ya enviada.
  progress: number
  // Por qué se cortó, o null mientras sigue.
  failed: string | null
}


/* El análisis arrancó con el audio y el video sigue subiendo detrás. Se dice
   dónde va porque cerrar la pestaña lo corta, y sin él el caso no se aprueba
   ni recibe su cierre de memoria. Sin subida en curso en esta pestaña —otra
   sesión, una recarga— sólo queda decir que todavía no llega. */
export function VideoTransferNote({
  transfer,
  onRetry,
}: {
  transfer: VideoTransfer | null
  onRetry?: () => void
}) {
  if (!transfer) {
    return (
      <div className="video-transfer" role="status">
        <p>El video de este testimonio todavía no llega al servidor.</p>
      </div>
    )
  }
  if (transfer.failed) {
    return (
      <div className="video-transfer is-failed" role="alert">
        <p>No se pudo guardar el video en el servidor. {transfer.failed}</p>
        {onRetry ? (
          <button type="button" onClick={onRetry}>
            Reintentar la subida
          </button>
        ) : null}
      </div>
    )
  }
  const percent = Math.round(transfer.progress * 100)
  return (
    <div className="video-transfer" role="status">
      <p>
        {percent < 100
          ? `El video se sigue guardando en el servidor: ${percent} %.`
          : "El servidor está revisando el video…"}{" "}
        No cierres esta pestaña hasta que termine.
      </p>
      <span className="video-transfer-meter" aria-hidden="true">
        <span style={{ transform: `scaleX(${transfer.progress})` }} />
      </span>
    </div>
  )
}
