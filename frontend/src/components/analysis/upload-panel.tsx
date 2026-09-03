import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useId, useRef, useState, type DragEvent } from "react"

import { motionTransition, staggerContainer, staggerItem } from "./motion"


const MAX_BYTES = 500 * 1024 * 1024
const ACCEPTED = ["video/mp4", "video/webm", "video/quicktime"]

function readableSize(bytes: number) {
  const mb = bytes / (1024 * 1024)
  if (mb >= 1) return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/* Se valida aquí y no sólo en el servidor: antes se aceptaba cualquier archivo
 * soltado —un PDF, o uno de 2 GB— y el rechazo llegaba después de subirlo. */
export function validateVideo(file: File): string | null {
  const looksLikeVideo = ACCEPTED.includes(file.type)
    || /\.(mp4|webm|mov)$/i.test(file.name)
  if (!looksLikeVideo) {
    return "Ese archivo no es un video MP4, WebM o MOV."
  }
  if (file.size > MAX_BYTES) {
    return `El video pesa ${readableSize(file.size)} y el máximo son 500 MB.`
  }
  return null
}


/* El servidor sólo acepta YouTube, así que la interfaz rechaza aquí lo que allá
 * volvería con un 422: pegar un enlace de Vimeo y esperar la ida y vuelta para
 * que le digan que no, es una espera que no hacía falta. */
export function validateLink(raw: string): string | null {
  const candidate = raw.trim()
  if (!candidate) return "Pega el enlace del video."
  let url: URL
  try {
    url = new URL(candidate.includes("://") ? candidate : `https://${candidate}`)
  } catch {
    return "Ese no parece un enlace."
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "")
  if (!["youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"].includes(host)) {
    return "Por ahora sólo se aceptan enlaces de YouTube."
  }
  return null
}


export function UploadPanel({
  busy,
  error = "",
  linkIngestEnabled = false,
  linkMaxSeconds = 1800,
  onUpload,
  onLink,
  onDemo,
}: {
  busy: boolean
  error?: string
  linkIngestEnabled?: boolean
  linkMaxSeconds?: number
  onUpload: (file: File) => Promise<void> | void
  onLink?: (url: string) => Promise<void> | void
  onDemo: () => Promise<void> | void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [link, setLink] = useState("")
  const [dragging, setDragging] = useState(false)
  const [rejection, setRejection] = useState("")
  const reduceMotion = useReducedMotion() ?? false
  const hintId = useId()
  const problemId = useId()
  const linkId = useId()

  const state = busy
    ? "uploading"
    : dragging
      ? "dragging"
      : file
        ? "selected"
        : "ready"

  const choose = (selected: File | undefined) => {
    if (!selected) return
    const problem = validateVideo(selected)
    if (problem) {
      setRejection(problem)
      setFile(null)
      return
    }
    setRejection("")
    setFile(selected)
    setLink("")
  }

  const submitLink = () => {
    const problem = validateLink(link)
    if (problem) {
      setRejection(problem)
      return
    }
    setRejection("")
    void onLink?.(link.trim())
  }

  const drop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    setDragging(false)
    choose(event.dataTransfer.files[0])
  }

  const problem = rejection || error

  return (
    <motion.section
      className="intake"
      data-testid="soft-editorial-upload"
      data-visual-state={state}
      initial={reduceMotion ? false : "hidden"}
      animate="visible"
      variants={staggerContainer}
      aria-labelledby="upload-title"
    >
      <motion.header
        className="intake-head"
        variants={staggerItem}
        transition={motionTransition(reduceMotion)}
      >
        <p className="eyebrow">Nuevo análisis</p>
        <h1 id="upload-title">Tu declaración</h1>
        <p className="intake-lede">
          Selecciona el video del testimonio. El sistema lo escuchará, separará
          los hechos y construirá una ruta que podrás revisar paso a paso.
        </p>
      </motion.header>

      <motion.div
        className="intake-dropzone-wrap"
        variants={staggerItem}
        transition={motionTransition(reduceMotion)}
      >
        {/* Es un <button> real: antes era un div con manejadores de arrastre,
            inalcanzable con teclado y mudo para un lector de pantalla. */}
        <button
          type="button"
          className={dragging ? "intake-dropzone is-dragging" : "intake-dropzone"}
          aria-describedby={problem ? `${hintId} ${problemId}` : hintId}
          onClick={() => inputRef.current?.click()}
          onDragEnter={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={drop}
        >
          <span className="intake-frame">
            <strong>Arrastra aquí el testimonio</strong>
            <span className="intake-alt">o elige un archivo del equipo</span>
          </span>
        </button>

        {/* Fuera del recuadro: es un dato de referencia, no una tercera línea
            de invitación compitiendo con las dos de arriba. Sigue siendo la
            descripción accesible de la zona. */}
        <p id={hintId} className="intake-hint">
          MP4, WebM o MOV · hasta 500 MB
        </p>

        <input
          ref={inputRef}
          className="visually-hidden"
          type="file"
          aria-label="Archivo de video del testimonio"
          accept={ACCEPTED.join(",")}
          onChange={(event) => choose(event.target.files?.[0])}
        />

        <AnimatePresence initial={false}>
          {file ? (
            <motion.div
              className="intake-file"
              initial={reduceMotion ? false : { opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
              transition={{ duration: reduceMotion ? 0.01 : 0.24 }}
            >
              <span className="intake-file-mark" aria-hidden="true" />
              <span className="intake-file-meta">
                <strong>{file.name}</strong>
                <small>{readableSize(file.size)} · listo para analizar</small>
              </span>
              <button
                type="button"
                className="intake-file-remove"
                onClick={() => {
                  setFile(null)
                  setRejection("")
                  if (inputRef.current) inputRef.current.value = ""
                }}
              >
                Quitar
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* El enlace es la segunda puerta, no la principal: quien tiene el
            archivo lo suelta arriba, y quien tiene el video en YouTube pega la
            dirección aquí. Sólo aparece si el servidor la tiene encendida. */}
        {linkIngestEnabled && onLink ? (
          <div className="intake-link">
            <span className="intake-link-or">o pega un enlace de YouTube</span>
            <div className="intake-link-row">
              <label className="visually-hidden" htmlFor={linkId}>
                Enlace del video en YouTube
              </label>
              <input
                id={linkId}
                type="url"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                placeholder="https://www.youtube.com/watch?v=…"
                value={link}
                disabled={busy}
                onChange={(event) => {
                  setLink(event.target.value)
                  setRejection("")
                  setFile(null)
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    submitLink()
                  }
                }}
              />
              <button
                type="button"
                className="intake-link-start"
                disabled={busy || !link.trim()}
                onClick={submitLink}
              >
                {busy ? "Trayendo…" : "Analizar"}
              </button>
            </div>
            <p className="intake-hint">
              El servidor lo descarga en 480p. Hasta{" "}
              {Math.round(linkMaxSeconds / 60)} minutos de duración.
            </p>
          </div>
        ) : null}

        {problem ? (
          <p id={problemId} className="intake-problem" role="alert">
            {problem}
          </p>
        ) : null}
      </motion.div>

      <motion.div
        className="intake-actions"
        variants={staggerItem}
        transition={motionTransition(reduceMotion)}
      >
        {/* Un boton gris que no puede hacer nada se lee como averiado. La
            accion aparece cuando hay algo que analizar; hasta entonces el
            fotograma es la unica cosa que pedir. */}
        <AnimatePresence initial={false}>
          {file ? (
            <motion.button
              type="button"
              className="intake-start"
              disabled={busy}
              onClick={() => void onUpload(file)}
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
              transition={{ duration: reduceMotion ? 0.01 : 0.22 }}
            >
              {busy ? "Iniciando análisis…" : "Analizar este testimonio"}
            </motion.button>
          ) : null}
        </AnimatePresence>
        <button
          type="button"
          className="intake-demo"
          disabled={busy}
          onClick={() => void onDemo()}
        >
          Ver primero el caso de demostración
        </button>
      </motion.div>
    </motion.section>
  )
}
