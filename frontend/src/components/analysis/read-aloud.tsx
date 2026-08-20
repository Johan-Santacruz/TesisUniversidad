import { useEffect, useState } from "react"


/* Leer no debería ser el único camino a la información. La síntesis de voz va
 * en el navegador —sin servicio externo, sin enviar el testimonio a ningún
 * lado— así que un paso de la ruta se puede escuchar en vez de leerse. */
function speechSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window
}

export function ReadAloud({
  text,
  label = "Escuchar este paso",
}: {
  text: string
  label?: string
}) {
  const [speaking, setSpeaking] = useState(false)
  const [available, setAvailable] = useState(false)

  useEffect(() => {
    setAvailable(speechSupported())
  }, [])

  // Si el componente se desmonta a media lectura, la voz debe callarse.
  useEffect(() => {
    return () => {
      if (speechSupported()) window.speechSynthesis.cancel()
    }
  }, [])

  if (!available) return null

  const toggle = () => {
    const synth = window.speechSynthesis
    if (speaking) {
      synth.cancel()
      setSpeaking(false)
      return
    }
    synth.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = "es-CO"
    // Algo más lento que el habla normal: se sigue mejor una instrucción.
    utterance.rate = 0.94
    utterance.onend = () => setSpeaking(false)
    utterance.onerror = () => setSpeaking(false)
    setSpeaking(true)
    synth.speak(utterance)
  }

  return (
    <button
      type="button"
      className={speaking ? "read-aloud is-speaking" : "read-aloud"}
      aria-label={speaking ? "Detener la lectura" : label}
      onClick={toggle}
    >
      <span className="read-aloud-icon" aria-hidden="true">
        {speaking ? (
          <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
            <rect x="4" y="3.5" width="3" height="9" rx="1" />
            <rect x="9" y="3.5" width="3" height="9" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none"
            stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6.2v3.6h2.3L8.6 12V4L5.3 6.2H3Z" fill="currentColor" stroke="none" />
            <path d="M11 5.6a3.2 3.2 0 0 1 0 4.8" />
            <path d="M12.9 3.6a5.8 5.8 0 0 1 0 8.8" />
          </svg>
        )}
      </span>
      <span>{speaking ? "Detener" : "Escuchar"}</span>
    </button>
  )
}
