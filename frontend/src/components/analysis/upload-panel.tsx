import { useRef, useState, type DragEvent } from "react"


export function UploadPanel({
  busy,
  onUpload,
  onDemo,
}: {
  busy: boolean
  onUpload: (file: File) => Promise<void> | void
  onDemo: () => Promise<void> | void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)

  const choose = (selected: File | undefined) => {
    if (selected) setFile(selected)
  }
  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    choose(event.dataTransfer.files[0])
  }

  return (
    <section className="upload-panel" aria-labelledby="upload-title">
      <div className="upload-copy">
        <p className="eyebrow">Nuevo análisis</p>
        <h1 id="upload-title">Subir video</h1>
        <p>
          Convierta un testimonio ficticio en una secuencia verificable de
          segmentos, hechos, fuentes y rutas.
        </p>
      </div>
      <div
        className={dragging ? "drop-zone is-dragging" : "drop-zone"}
        onDragEnter={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
      >
        <span className="upload-glyph" aria-hidden="true">↑</span>
        <strong>{file ? file.name : "Arrastre un video ficticio"}</strong>
        <p>MP4, WebM o MOV · hasta 500 MB</p>
        <button type="button" onClick={() => inputRef.current?.click()}>
          Elegir archivo
        </button>
        <input
          ref={inputRef}
          className="visually-hidden"
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          onChange={(event) => choose(event.target.files?.[0])}
        />
      </div>
      <div className="upload-actions">
        <button
          type="button"
          className="primary-action"
          disabled={!file || busy}
          onClick={() => file && void onUpload(file)}
        >
          {busy ? "Iniciando análisis…" : "Analizar video ficticio"}
        </button>
        <span>o</span>
        <button
          type="button"
          className="demo-action"
          disabled={busy}
          onClick={() => void onDemo()}
        >
          Usar caso ficticio de demostración
        </button>
      </div>
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
    </section>
  )
}
