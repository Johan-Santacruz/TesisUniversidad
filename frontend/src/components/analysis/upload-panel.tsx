import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useId, useRef, useState, type DragEvent } from "react"

import { motionTransition, staggerContainer, staggerItem } from "./motion"
import { NARRATIVE_STAGES } from "./narrative-stage"
import "./upload-panel.css"


const MAX_BYTES = 500 * 1024 * 1024
const ACCEPTED = ["video/mp4", "video/webm", "video/quicktime"]
const STAGE_SUMMARIES = {
  listening: "El relato, organizado en fragmentos.",
  evidence: "Los hechos importantes, para revisar.",
  route: "Los pasos a seguir, con sus fuentes.",
}

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
        <h1 id="upload-title">Cada relato es<br />un punto de partida.</h1>
        <p className="intake-lede">
          Añade el video del testimonio para empezar a construir una ruta
          de acción. Podrás revisar cada paso.
        </p>
      </motion.header>

      {/* La carga y sus acciones permanecen juntas también en móvil. */}
      <motion.div
        className="intake-dropzone-wrap"
        variants={staggerItem}
        transition={motionTransition(reduceMotion)}
      >
        <div className="intake-source-heading">
          <span className="intake-source-kicker">Empieza aquí</span>
          <h2>Añade tu testimonio</h2>
          <p>
            Selecciona un video
            {linkIngestEnabled && onLink ? " o comparte su enlace." : " de tu equipo."}
          </p>
        </div>
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
            <span className="intake-icon-disc">
              <svg
                className="intake-mark"
                viewBox="0 0 64 40"
                width="64"
                height="40"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                aria-hidden="true"
              >
                <rect x="0.7" y="0.7" width="62.6" height="38.6" rx="3" />
                <path d="M12 0.7V39.3M52 0.7V39.3" />
                <g strokeWidth="1.1">
                  <path d="M4.5 6.5h3M4.5 14.5h3M4.5 22.5h3M4.5 30.5h3" />
                  <path d="M56.5 6.5h3M56.5 14.5h3M56.5 22.5h3M56.5 30.5h3" />
                </g>
                <path d="m28 13 11 7-11 7Z" fill="currentColor" stroke="none" />
              </svg>
            </span>
            <strong>Arrastra aquí el testimonio</strong>
            <span className="intake-alt">o selecciónalo desde tu equipo</span>
            <span className="intake-browse">
              {file ? "Cambiar archivo" : "Elegir archivo"}
              <span aria-hidden="true">↗</span>
            </span>
            <span id={hintId} className="intake-hint">
              MP4, WebM o MOV · hasta 500 MB
            </span>
          </span>
        </button>

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
            <span className="intake-link-or" aria-hidden="true">o usa un enlace</span>
            <label className="intake-link-label" htmlFor={linkId}>
              Enlace del video en YouTube
            </label>
            <div className="intake-link-row">
              <input
                id={linkId}
                type="url"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                placeholder="Pega aquí el enlace…"
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
              Hasta{" "}
              {Math.round(linkMaxSeconds / 60)} minutos de duración.
            </p>
          </div>
        ) : null}

        {problem ? (
          <p id={problemId} className="intake-problem" role="alert">
            {problem}
          </p>
        ) : null}
        <motion.div
          className="intake-actions"
          variants={staggerItem}
          transition={motionTransition(reduceMotion)}
        >
          {/* El análisis se ofrece cuando hay un archivo válido. */}
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
            Ver primero el caso de demostración <span aria-hidden="true">→</span>
          </button>
        </motion.div>
      </motion.div>
      <motion.div
        className="intake-guide"
        variants={staggerItem}
        transition={motionTransition(reduceMotion)}
      >
        <p className="intake-index-title">Del relato a la ruta</p>
        <ol className="intake-index" aria-label="Lo que hará el sistema">
          {NARRATIVE_STAGES.map((stage) => (
            <li key={stage.id}>
              <span className="intake-index-number" aria-hidden="true">
                {stage.number}
              </span>
              <span className="intake-index-body">
                <strong>{stage.shortTitle}</strong>
                <small>{STAGE_SUMMARIES[stage.id]}</small>
              </span>
            </li>
          ))}
        </ol>

        <p className="intake-note">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <rect x="5" y="10" width="14" height="11" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
          </svg>
          <span>Nada se publica. El video queda cifrado y se borra a los siete días.</span>
        </p>
      </motion.div>
    </motion.section>
  )
}
