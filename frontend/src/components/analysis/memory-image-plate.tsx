import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"

import { MEMORY_IMAGE_ALT, MEMORY_IMAGE_DISCLOSURE } from "./memory-image-panel"


/* El cierre del caso se anuncia cuando el análisis termina, no cuando alguien
 * llega a la etapa de ruta: es el remate del recorrido y debe encontrarse a la
 * persona donde esté. Después baja al riel, que es la única columna presente en
 * las tres etapas, y desde ahí queda siempre a la vista.
 *
 * Vive fuera del árbol animado: un ancestro con `transform` convierte
 * `position: fixed` en relativo a él y la lámina quedaría encajonada.
 */
export function MemoryImagePlate({
  imageSource,
  revealKey,
  revealMs = 3400,
  onOpenChange,
}: {
  imageSource: string | null
  revealKey: string | null
  revealMs?: number
  // Avisa mientras ocupa la pantalla, para que nada más se le encime encima.
  onOpenChange?: (open: boolean) => void
}) {
  const reduceMotion = useReducedMotion() ?? false
  const [open, setOpen] = useState(false)
  const revealedRef = useRef<string | null>(null)

  useEffect(() => {
    onOpenChange?.(open)
  }, [open, onOpenChange])

  useEffect(() => {
    if (!revealKey || !imageSource || revealedRef.current === revealKey) return
    revealedRef.current = revealKey
    setOpen(true)
  }, [revealKey, imageSource])

  // El temporizador va aparte, atado sólo a que esté abierta: compartiendo
  // efecto con la revelación, un re-render cancelaba la cuenta sin crear otra.
  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => setOpen(false), reduceMotion ? 320 : revealMs)
    return () => window.clearTimeout(timer)
  }, [open, revealMs, reduceMotion])

  useEffect(() => {
    if (!open) return
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", close)
    return () => window.removeEventListener("keydown", close)
  }, [open])

  return createPortal(
    <>
      {/* La miniatura queda anclada cuando la lámina se retira: el cierre
          sigue presente en las tres etapas sin quitarle alto al testimonio.
          Va sobre el pie, no encima, para no tapar la acción que continúa el
          recorrido. */}
      <AnimatePresence>
        {imageSource && !open ? (
          <motion.button
            type="button"
            className="memory-image-dock"
            aria-label={`${MEMORY_IMAGE_ALT}. Ver en grande.`}
            onClick={() => setOpen(true)}
            initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.96 }}
            transition={{ duration: reduceMotion ? 0.01 : 0.55, ease: [0.16, 1, 0.3, 1] }}
          >
            <img src={imageSource} alt="" />
            <span>Cierre de memoria</span>
          </motion.button>
        ) : null}
      </AnimatePresence>
    <AnimatePresence>
      {open && imageSource ? (
        <motion.div
          className="memory-image-plate"
          role="dialog"
          aria-modal="true"
          aria-label={MEMORY_IMAGE_ALT}
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: reduceMotion ? 0.01 : 0.6 } }}
          transition={{ duration: reduceMotion ? 0.01 : 0.4 }}
          onClick={() => setOpen(false)}
        >
          <motion.img
            alt=""
            src={imageSource}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion
              ? { opacity: 0 }
              : { opacity: 0, scale: 0.9, y: 40, transition: { duration: 0.6, ease: [0.4, 0, 0.2, 1] } }}
            transition={{ duration: reduceMotion ? 0.01 : 0.75, ease: [0.16, 1, 0.3, 1] }}
          />
          <motion.p
            className="memory-image-plate-caption"
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0.01 : 0.6, delay: reduceMotion ? 0 : 0.25 }}
          >
            {MEMORY_IMAGE_DISCLOSURE}
          </motion.p>
        </motion.div>
      ) : null}
    </AnimatePresence>
    </>,
    document.body,
  )
}
