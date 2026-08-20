import { useEffect, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"


/* La apertura del libro.
 *
 * Antes de esta cortina, abrir la página mostraba un blanco de navegador
 * mientras cargaba el JavaScript: no era una entrada, era una ausencia. Aquí
 * ese mismo tiempo se usa para nombrar lo que se va a leer.
 *
 * Se muestra una sola vez por sesión: una portada que se repite en cada
 * navegación deja de ser una entrada y se vuelve un peaje.
 */
const SEEN_KEY = "senda:libro-abierto"

export function OpeningCurtain({ holdMs = 2600 }: { holdMs?: number }) {
  const reduceMotion = useReducedMotion() ?? false
  const [open, setOpen] = useState(() => {
    try {
      return window.sessionStorage.getItem(SEEN_KEY) === null
    } catch {
      // Sin almacenamiento disponible la cortina simplemente no se muestra:
      // más vale entrar directo que arriesgarse a repetirla en cada vista.
      return false
    }
  })

  useEffect(() => {
    if (!open) return
    try {
      window.sessionStorage.setItem(SEEN_KEY, "1")
    } catch {
      // Si no se puede recordar, igual se cierra sola.
    }
    // Quien pidió menos movimiento no debería esperar por una animación.
    const timer = window.setTimeout(() => setOpen(false), reduceMotion ? 260 : holdMs)
    return () => window.clearTimeout(timer)
  }, [open, holdMs, reduceMotion])

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="opening-curtain"
          data-testid="opening-curtain"
          // El libro ya está montado detrás: para un lector de pantalla la
          // cortina no existe y el contenido se anuncia de una vez.
          aria-hidden="true"
          initial={false}
          exit={reduceMotion
            ? { opacity: 0, transition: { duration: 0.01 } }
            : { opacity: 0, transition: { duration: 0.55, ease: [0.4, 0, 1, 1] } }}
        >
          <motion.p
            className="opening-curtain-eyebrow"
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0.01 : 0.5, delay: reduceMotion ? 0 : 0.1 }}
          >
            SENDA
          </motion.p>
          <motion.h1
            className="opening-curtain-title"
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0.01 : 0.6, delay: reduceMotion ? 0 : 0.18 }}
          >
            Escuchar antes<br />de orientar.
          </motion.h1>
          {/* El tricolor se traza como quien subraya un título a mano. */}
          <motion.span
            className="opening-curtain-rule"
            aria-hidden="true"
            initial={reduceMotion ? false : { scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: reduceMotion ? 0.01 : 0.75, delay: reduceMotion ? 0 : 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <i /><i /><i />
          </motion.span>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
