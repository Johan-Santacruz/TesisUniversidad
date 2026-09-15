import { useEffect, useState, type CSSProperties } from "react"
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

/* Si la cortina se muestra y cuándo se retira. Vive fuera del componente
 * porque el libro, debajo, necesita saberlo: espera con la cortina puesta y
 * entra en el mismo movimiento con que ésta se levanta. Antes el libro hacía
 * su entrada a oscuras y, al retirarse la cortina, ya estaba quieto. */
export function useOpeningCurtain(holdMs = 2600): boolean {
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

  return open
}

/* La salida es la lámpara encendiéndose sobre el libro: el título sube y se
 * disuelve, y la oscuridad se abre en círculo desde donde está el libro hacia
 * los bordes. Un fundido plano no decía dónde mirar; el foco sí. */
const LIFT = { duration: 0.42, ease: [0.4, 0, 1, 1] as const }
export const CURTAIN_IRIS = { duration: 0.95, delay: 0.12, ease: [0.22, 1, 0.36, 1] as const }

export function OpeningCurtain({ open }: { open: boolean }) {
  const reduceMotion = useReducedMotion() ?? false

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="opening-curtain"
          data-testid="opening-curtain"
          // El libro ya está montado detrás: para un lector de pantalla la
          // cortina no existe y el contenido se anuncia de una vez.
          aria-hidden="true"
          style={{ "--iris": "0%" } as CSSProperties}
          initial={{ "--iris": "0%", opacity: 1 }}
          animate={{ "--iris": "0%", opacity: 1 }}
          exit={reduceMotion
            ? { opacity: 0, transition: { duration: 0.01 } }
            : {
                "--iris": "118%",
                opacity: 0,
                transition: {
                  "--iris": CURTAIN_IRIS,
                  // El velo termina de irse cuando el foco ya abarca la
                  // pantalla: sin esto quedaba un anillo oscuro en las esquinas.
                  opacity: { duration: 0.28, delay: 0.84 },
                },
              }}
        >
          <motion.p
            className="opening-curtain-eyebrow"
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -10, transition: LIFT }}
            transition={{ duration: reduceMotion ? 0.01 : 0.5, delay: reduceMotion ? 0 : 0.1 }}
          >
            SENDA
          </motion.p>
          <motion.h1
            className="opening-curtain-title"
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -16, transition: LIFT }}
            transition={{ duration: reduceMotion ? 0.01 : 0.6, delay: reduceMotion ? 0 : 0.18 }}
          >
            Escuchar antes<br />de orientar.
          </motion.h1>
          {/* El tricolor se traza como quien subraya un título a mano, y se
              recoge hacia el centro al irse. */}
          <motion.span
            className="opening-curtain-rule"
            aria-hidden="true"
            initial={reduceMotion ? false : { scaleX: 0 }}
            animate={{ scaleX: 1 }}
            exit={reduceMotion ? undefined : { scaleX: 0, opacity: 0, transition: LIFT }}
            transition={{ duration: reduceMotion ? 0.01 : 0.75, delay: reduceMotion ? 0 : 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <i /><i /><i />
          </motion.span>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
