import { useState } from "react"
import { motion, useReducedMotion } from "framer-motion"

import type { components } from "../../api/generated"


type MemoryImage = components["schemas"]["MemoryImageRead"]
type Role = components["schemas"]["UserRole"]

export type VideoMode = "original" | "memory"

/* SENDA escribe la leyenda; el modelo nunca produce texto dentro de la imagen.
   Aquí se repite la misma frase que FFmpeg quema en la placa de cierre. */
export const MEMORY_IMAGE_DISCLOSURE =
  "Imagen representativa generada a partir del contexto documentado del caso. "
  + "No corresponde a un registro de los hechos."

/* El texto alternativo nombra la función de la imagen, no los hechos narrados. */
export const MEMORY_IMAGE_ALT = "Imagen representativa del cierre de memoria del caso"

type Action = "approve" | "reject" | "regenerate" | "retry"

const RUNNING_LABEL: Record<Action, string> = {
  approve: "Aprobando…",
  reject: "Descartando…",
  regenerate: "Generando…",
  retry: "Reintentando…",
}


function statusMessage(memoryImage: MemoryImage | null, claiming: boolean): string {
  // Sin fila de imagen el caso no está "mal configurado": todavía no tiene
  // cierre. Decir lo contrario mandaba a revisar el .env, que estaba bien.
  if (!memoryImage) {
    return claiming
      ? "Preparando la imagen de cierre…"
      : "Este caso todavía no tiene imagen de cierre."
  }
  switch (memoryImage.status) {
    case "generating":
      return "Preparando la imagen de cierre…"
    case "pending_review":
      return "La imagen está pendiente de revisión."
    case "rejected":
      return "La imagen fue descartada. El caso continúa sin cierre visual."
    case "failed":
      // La falta de proveedor es lo único que de verdad se arregla en la
      // configuración; el resto es un fallo de generación y se reintenta.
      return memoryImage.failure_code === "image_provider_not_configured"
        ? (
          "El proveedor de imágenes no está configurado, así que el cierre "
          + "visual no se puede generar en este entorno."
        )
        : (
          "No fue posible generar la imagen de cierre. "
          + "El caso continúa sin cierre visual y se puede intentar otra generación."
        )
    case "approved":
      switch (memoryImage.render_status) {
        case "ready":
          return "La versión con cierre de memoria está disponible."
        case "failed":
          return (
            "No fue posible preparar la versión con cierre. "
            + "El testimonio original permanece intacto y el cierre se puede reintentar."
          )
        case "expired":
          return (
            "La versión con cierre ya no está disponible por la política de retención. "
            + "El testimonio original permanece disponible."
          )
        default:
          return "Preparando versión con cierre…"
      }
  }
}


export function MemoryImagePanel({
  memoryImage,
  claiming = false,
  role,
  imageSource,
  videoMode,
  onRegenerate,
  onDecision,
  onRetryRender,
  onVideoModeChange,
}: {
  memoryImage: MemoryImage | null
  claiming?: boolean
  role: Role
  imageSource: string | null
  videoMode: VideoMode
  onRegenerate: () => Promise<void> | void
  onDecision: (action: "approve" | "reject") => Promise<void> | void
  onRetryRender: () => Promise<void> | void
  onVideoModeChange: (mode: VideoMode) => void
}) {
  const [running, setRunning] = useState<Action | null>(null)
  const [error, setError] = useState("")
  const reduceMotion = useReducedMotion() ?? false

  const canReview = role === "validador" || role === "admin"
  const status = memoryImage?.status ?? null
  const renderStatus = memoryImage?.render_status ?? null
  const showsImage = Boolean(
    memoryImage
    && memoryImage.image_url
    && (status === "pending_review" || status === "approved"),
  )
  const derivativeReady = Boolean(
    status === "approved" && renderStatus === "ready" && memoryImage?.rendered_video_url,
  )
  // Regenerar sustituye la generación activa: sólo se ofrece mientras no haya
  // una aprobación en pie, para no descartar en silencio un cierre ya emitido.
  // El caso sin fila entra aquí: antes se quedaba sin imagen y sin botón, así
  // que no había forma de pedirla desde la interfaz.
  const canRegenerate = canReview
    && !claiming
    && (status === null
      || status === "pending_review"
      || status === "failed"
      || status === "rejected")
  const canDecide = canReview && status === "pending_review"
  const canRetryRender = canReview && status === "approved" && renderStatus === "failed"
  const busy = running !== null

  const run = async (action: Action, task: () => Promise<void> | void) => {
    setRunning(action)
    setError("")
    try {
      await task()
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No fue posible completar la acción",
      )
    } finally {
      setRunning(null)
    }
  }

  const label = (action: Action, idle: string) =>
    running === action ? RUNNING_LABEL[action] : idle

  return (
    <section className="memory-image-panel" aria-labelledby="memory-image-title">
      <header className="memory-image-header">
        <h3 id="memory-image-title">Cierre de memoria</h3>
        <p className="memory-image-status" role="status">
          {statusMessage(memoryImage, claiming)}
        </p>
      </header>

      {showsImage ? (
        <figure className="memory-image-figure">
          {/* La lamina llega al final del caso: aparece en vez de estar. */}
          <motion.div
            className="memory-image-frame"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: reduceMotion ? 0.01 : 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            {imageSource ? (
              <img alt={MEMORY_IMAGE_ALT} src={imageSource} decoding="async" />
            ) : (
              <span className="memory-image-placeholder" aria-hidden="true">
                SENDA
              </span>
            )}
          </motion.div>
          {/* La advertencia va fuera del gráfico: sobrevive a una imagen que no
              carga y se lee igual con lector de pantalla. */}
          <figcaption className="memory-image-disclosure">
            {MEMORY_IMAGE_DISCLOSURE}
          </figcaption>
        </figure>
      ) : null}

      {canDecide || canRegenerate || canRetryRender ? (
        <div className="memory-image-actions">
          {canDecide ? (
            <button
              type="button"
              className="memory-image-approve"
              disabled={busy}
              onClick={() => void run("approve", () => onDecision("approve"))}
            >
              {label("approve", "Aprobar")}
            </button>
          ) : null}
          {canRegenerate ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run("regenerate", onRegenerate)}
            >
              {label("regenerate", status === null ? "Generar cierre" : "Generar otra")}
            </button>
          ) : null}
          {canDecide ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run("reject", () => onDecision("reject"))}
            >
              {label("reject", "Descartar")}
            </button>
          ) : null}
          {canRetryRender ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run("retry", onRetryRender)}
            >
              {label("retry", "Reintentar cierre")}
            </button>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="action-error" role="alert">
          {error}
        </p>
      ) : null}

      {derivativeReady ? (
        <div
          className="memory-video-selector"
          role="group"
          aria-label="Fuente del video"
        >
          <button
            type="button"
            aria-pressed={videoMode === "original"}
            className={videoMode === "original" ? "is-selected" : ""}
            onClick={() => onVideoModeChange("original")}
          >
            Testimonio original
          </button>
          <button
            type="button"
            aria-pressed={videoMode === "memory"}
            className={videoMode === "memory" ? "is-selected" : ""}
            onClick={() => onVideoModeChange("memory")}
          >
            Versión con cierre de memoria
          </button>
        </div>
      ) : null}

    </section>
  )
}
