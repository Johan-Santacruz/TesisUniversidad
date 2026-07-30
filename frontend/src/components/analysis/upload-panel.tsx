import { motion, useReducedMotion } from "framer-motion"
import { useRef, useState, type DragEvent } from "react"

import {
  motionTransition,
  staggerContainer,
  staggerItem,
} from "./motion"


export function UploadPanel({
  busy,
  error = "",
  onUpload,
  onDemo,
}: {
  busy: boolean
  error?: string
  onUpload: (file: File) => Promise<void> | void
  onDemo: () => Promise<void> | void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const reduceMotion = useReducedMotion() ?? false

  const choose = (selected: File | undefined) => {
    if (selected) setFile(selected)
  }
  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    choose(event.dataTransfer.files[0])
  }

  return (
    <motion.section
      className="analysis-prelude upload-prelude soft-editorial-shell"
      data-testid="soft-editorial-upload"
      data-visual-state={
        busy ? "busy" : dragging ? "dragging" : file ? "selected" : "ready"
      }
      initial={reduceMotion ? false : "hidden"}
      animate="visible"
      variants={staggerContainer}
      aria-labelledby="upload-title"
    >
      <motion.aside
        className="intake-rail"
        aria-labelledby="intake-title"
        variants={staggerItem}
        transition={motionTransition(reduceMotion)}
      >
        <p className="eyebrow">Nuevo análisis</p>
        <h2 id="intake-title">Tu declaración</h2>
        <p>
          Selecciona un video ficticio o abre el caso preparado para la
          demostración.
        </p>
        <motion.div
          className={dragging ? "drop-zone is-dragging" : "drop-zone"}
          variants={staggerItem}
          transition={motionTransition(reduceMotion)}
          onDragEnter={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={drop}
        >
          <span className="upload-glyph" aria-hidden="true">↑</span>
          <strong>{file ? file.name : "Arrastra un video ficticio"}</strong>
          <p>MP4, WebM o MOV · hasta 500 MB</p>
          <button
            type="button"
            className={file ? "file-picker-action" : "primary-action"}
            onClick={() => inputRef.current?.click()}
          >
            {file ? "Cambiar archivo" : "Elegir archivo"}
          </button>
          <input
            ref={inputRef}
            className="visually-hidden"
            type="file"
            aria-label="Archivo de video ficticio"
            accept="video/mp4,video/webm,video/quicktime"
            onChange={(event) => choose(event.target.files?.[0])}
          />
        </motion.div>
        <motion.div
          className="upload-actions"
          variants={staggerItem}
          transition={motionTransition(reduceMotion)}
        >
          {file ? (
            <button
              type="button"
              className="primary-action"
              disabled={busy}
              onClick={() => void onUpload(file)}
            >
              {busy ? "Iniciando análisis…" : "Analizar video ficticio"}
            </button>
          ) : null}
          <span>o</span>
          <button
            type="button"
            className="demo-link"
            disabled={busy}
            onClick={() => void onDemo()}
          >
            Probar caso de demostración
          </button>
        </motion.div>
        {error ? <p className="workspace-error" role="alert">{error}</p> : null}
      </motion.aside>

      <motion.article
        className="narrative-sheet welcome-sheet"
        variants={staggerItem}
        transition={motionTransition(reduceMotion)}
      >
        <span className="welcome-sheet-number" aria-hidden="true">01</span>
        <motion.div
          className="welcome-sheet-copy"
          variants={staggerItem}
          transition={motionTransition(reduceMotion)}
        >
          <p className="eyebrow">Antes de comenzar</p>
          <h1 id="upload-title">
            Tu relato se convertirá en un camino que podrás revisar.
          </h1>
          <span className="welcome-title-rule" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <p>
            Selecciona el video de tu declaración. Cuando decidas comenzar,
            verás cómo el sistema escucha, encuentra señales y construye cada
            paso de la ruta.
          </p>
        </motion.div>

        <ol className="welcome-steps" aria-label="Etapas del análisis">
          <li>
            <span>01</span>
            <strong>Escuchar</strong>
            <small>Recogemos el relato tal como fue contado.</small>
          </li>
          <li>
            <span>02</span>
            <strong>Ordenar</strong>
            <small>Separamos hechos, señales y contexto.</small>
          </li>
          <li>
            <span>03</span>
            <strong>Trazar</strong>
            <small>Construimos una ruta que podrás revisar.</small>
          </li>
        </ol>

        <div className="real-data-lock" role="note">
          <span aria-hidden="true">⌁</span>
          <div>
            <strong>Testimonios reales bloqueados</strong>
            <p>
              Se habilitarán únicamente después de confirmar ZDR con ambos
              proveedores y registrar la autorización institucional explícita.
            </p>
          </div>
        </div>
      </motion.article>
    </motion.section>
  )
}
