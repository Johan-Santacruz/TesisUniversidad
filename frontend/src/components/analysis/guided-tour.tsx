import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { createPortal } from "react-dom"


export interface TourStep {
  eyebrow: string
  title: string
  body: string
  /* Selector del elemento real que se ilumina. Sin él, el paso se muestra
     centrado: sirve para lo que todavía no está en pantalla. */
  target?: string
  /* Etapa del pliego que hay que abrir para que ese elemento exista. El
     recorrido cambia de etapa por su cuenta: enseñar la revisión de señales
     con una captura sería mentir sobre dónde está el botón. */
  stage?: string
  points?: string[]
}


/* El recorrido del pliego de análisis: lo que se puede hacer con el caso ya
 * analizado, que es donde de verdad hay algo que aprender. Cada paso abre la
 * etapa que le toca y señala el elemento real, no una explicación aparte.
 */
export const WORKSPACE_TOUR: TourStep[] = [
  {
    eyebrow: "Cómo se lee",
    title: "Tres etapas, y mandas tú",
    body:
      "Escuchar, Señales y Ruta. Avanzan solas mientras corre el video, pero "
      + "puedes saltar a cualquiera y volver: al pulsar una, el avance "
      + "automático se detiene y el paso queda en tus manos.",
    target: ".narrative-stage-meta",
    stage: "listening",
  },
  {
    eyebrow: "Mientras corre el video",
    title: "Todo se mueve con el minuto exacto",
    body:
      "Reproduce y no tendrás que buscar nada: la transcripción, la cronología "
      + "y las señales se resaltan solas en el segundo en que se dicen.",
    target: ".documentary-video",
    stage: "listening",
  },
  {
    eyebrow: "Ir al momento exacto",
    title: "Pulsa una frase y el video salta ahí",
    body:
      "Funciona en los dos sentidos. Y si eliges un fragmento para leerlo con "
      + "calma, el video que sigue corriendo no te lo quita: la selección "
      + "manda hasta que vuelvas a darle a reproducir.",
    target: ".documentary-fragments",
    stage: "listening",
  },
  {
    eyebrow: "Señales",
    title: "Nada queda confirmado solo",
    body:
      "Cada dato que el sistema creyó encontrar llega sin confirmar, con lo "
      + "que entendió cada modelo y si coinciden. Tú confirmas o corriges a "
      + "mano, y queda registrado quién lo hizo.",
    target: ".verification-panel",
    stage: "evidence",
  },
  {
    eyebrow: "Con la prueba delante",
    title: "Cada señal enseña de dónde salió",
    body:
      "Al margen queda la frase textual que la sostiene, con su minuto. "
      + "Púlsala y el video vuelve a ese punto para que lo escuches tú antes "
      + "de decidir.",
    target: ".marginalia-jump",
    stage: "evidence",
  },
  {
    eyebrow: "Ruta",
    title: "Tres rutas, para poder compararlas",
    body:
      "Emergencia, estabilización y retorno. Cada una dice de qué entidad es, "
      + "qué piden y cómo se contacta, con la fuente oficial detrás.",
    target: ".route-grid",
    stage: "route",
  },
  {
    eyebrow: "Ruta",
    title: "Ábrela y una voz te va guiando",
    body:
      "Las paradas se despliegan de una en una. Al escucharlas, la voz lee "
      + "cada una y abre la siguiente al ritmo en que habla.",
    target: ".route-journey-toggle",
    stage: "route",
  },
  {
    eyebrow: "Para terminar",
    title: "Lo que queda en tus manos",
    body: "El caso no se cierra solo. Estas decisiones son tuyas.",
    points: [
      "Aprobar la ruta cuando la hayas revisado entera",
      "Aceptar o rechazar la ilustración de cierre antes de que se use",
      "Borrar el caso: se va todo, y queda constancia en la auditoría",
      "El video se borra solo a los siete días",
    ],
    target: ".approval-bar",
    stage: "route",
  },
]


const HALO = 12       // aire entre el elemento iluminado y el borde del foco
const GAP = 18        // separación entre el foco y la ficha
const CARD_WIDTH = 372


function focusableWithin(root: HTMLElement | null): HTMLElement[] {
  if (!root) return []
  return Array.from(
    root.querySelectorAll<HTMLElement>("button:not(:disabled), [href], [tabindex]:not([tabindex='-1'])"),
  )
}


export function GuidedTour({
  steps,
  open,
  onClose,
  onStageChange,
}: {
  steps: TourStep[]
  open: boolean
  onClose: () => void
  onStageChange?: (stage: string) => void
}) {
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [cardHeight, setCardHeight] = useState(0)
  // La ficha se guarda en estado y no en un ref: con `mode="wait"` la nueva
  // monta cuando la anterior termina de salir, así que un efecto atado al
  // índice corría antes de que existiera. Un ref es estable y nunca vuelve a
  // disparar el efecto; el estado sí, en cuanto el nodo se engancha.
  const [card, setCard] = useState<HTMLDivElement | null>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const reduceMotion = useReducedMotion() ?? false

  const step = steps[index]
  const last = index === steps.length - 1

  const close = useCallback(() => {
    onClose()
    // Devolver el foco a donde estaba: si se pierde, el teclado vuelve al
    // principio del documento y la persona no sabe dónde quedó.
    restoreFocusRef.current?.focus?.()
  }, [onClose])

  useEffect(() => {
    if (!open) return
    setIndex(0)
    restoreFocusRef.current = document.activeElement as HTMLElement | null
  }, [open])

  // La etapa se pide antes de medir: el elemento del paso siguiente todavía no
  // existe mientras el pliego no cambie de hoja.
  useEffect(() => {
    if (!open || !step?.stage) return
    onStageChange?.(step.stage)
  }, [open, step?.stage, onStageChange])

  // Se mide con useLayoutEffect para que el foco nunca se pinte una vez en el
  // sitio equivocado antes de saltar al correcto.
  useLayoutEffect(() => {
    if (!open) return
    const selector = step?.target
    if (!selector) {
      setRect(null)
      return
    }

    let frame = 0
    let attempts = 0
    let observer: ResizeObserver | null = null

    const measure = () => {
      const element = document.querySelector(selector)
      setRect(element ? element.getBoundingClientRect() : null)
    }

    const attach = () => {
      const element = document.querySelector(selector)
      if (!element) {
        // Al cambiar de etapa, el contenido nuevo entra sólo cuando el anterior
        // termina de salir. Reintentar unos cuadros es la diferencia entre un
        // paso iluminado y un paso que se queda sin foco para siempre.
        if (attempts++ < 90) {
          frame = requestAnimationFrame(attach)
          return
        }
        setRect(null)
        return
      }

      measure()
      // jsdom no implementa scrollIntoView, y tampoco todos los navegadores
      // antiguos: comprobarlo evita que el recorrido se caiga entero por esto.
      if (typeof element.scrollIntoView === "function") {
        element.scrollIntoView({
          block: "center",
          behavior: reduceMotion ? "auto" : "smooth",
        })
      }
      // La pantalla se mueve con animaciones que no producen scroll ni resize;
      // sin observador, el foco se queda sobre la posición inicial.
      if (typeof ResizeObserver === "function") {
        observer = new ResizeObserver(measure)
        observer.observe(element)
        observer.observe(document.body)
      }
    }

    attach()
    window.addEventListener("resize", measure)
    // En captura: así también se entera de los desplazamientos de cualquier
    // contenedor interno, no sólo de la ventana.
    window.addEventListener("scroll", measure, true)

    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener("resize", measure)
      window.removeEventListener("scroll", measure, true)
      observer?.disconnect()
    }
  }, [open, step?.target, step?.stage, reduceMotion])

  useEffect(() => {
    card?.focus()
  }, [card])

  // La colocación necesita saber cuánto mide la ficha; su alto cambia con el
  // texto de cada paso y con el ancho de la ventana.
  useLayoutEffect(() => {
    if (!card) return
    const update = () => setCardHeight(card.offsetHeight)
    update()
    if (typeof ResizeObserver !== "function") return
    const observer = new ResizeObserver(update)
    observer.observe(card)
    return () => observer.disconnect()
  }, [card])

  if (!open || !step) return null

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault()
      close()
      return
    }
    if (event.key === "ArrowRight" && !last) {
      event.preventDefault()
      setIndex((value) => value + 1)
      return
    }
    if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault()
      setIndex((value) => value - 1)
      return
    }
    if (event.key !== "Tab") return
    // Encierro del foco: sin esto el tabulador se va a la página de debajo,
    // que está tapada por el velo y no se puede ver.
    const items = focusableWithin(card)
    if (items.length === 0) return
    const first = items[0]
    const lastItem = items[items.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      lastItem.focus()
    } else if (!event.shiftKey && document.activeElement === lastItem) {
      event.preventDefault()
      first.focus()
    }
  }

  const viewportHeight = typeof window === "undefined" ? 0 : window.innerHeight
  const viewportWidth = typeof window === "undefined" ? 0 : window.innerWidth
  // Debajo si cabe entera, si no encima, y si no cabe en ningún lado —un
  // elemento alto como la rejilla de rutas ocupa media pantalla— se centra
  // sobre él. Sin medir la altura de la ficha, el paso de las rutas la mandaba
  // fuera de la ventana y no había forma de pulsar "Siguiente".
  const fitsBelow = rect
    ? rect.bottom + GAP + cardHeight <= viewportHeight - GAP
    : false
  const fitsAbove = rect ? rect.top - GAP - cardHeight >= GAP : false
  const below = fitsBelow || !fitsAbove
  const cardStyle: React.CSSProperties = rect
    ? {
        top: Math.min(
          Math.max(
            GAP,
            fitsBelow
              ? rect.bottom + GAP
              : fitsAbove
                ? rect.top - GAP - cardHeight
                : (viewportHeight - cardHeight) / 2,
          ),
          Math.max(GAP, viewportHeight - cardHeight - GAP),
        ),
        left: Math.min(
          Math.max(GAP, rect.left),
          Math.max(GAP, viewportWidth - CARD_WIDTH - GAP),
        ),
      }
    : {}

  return createPortal(
    <div
      className="tour-layer"
      onKeyDown={handleKeyDown}
      data-testid="guided-tour"
    >
      {rect ? (
        <motion.div
          className="tour-spotlight"
          aria-hidden="true"
          initial={false}
          animate={{
            top: rect.top - HALO,
            left: rect.left - HALO,
            width: rect.width + HALO * 2,
            height: rect.height + HALO * 2,
          }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { type: "spring", stiffness: 260, damping: 30 }
          }
        />
      ) : (
        <div className="tour-scrim" aria-hidden="true" />
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          ref={setCard}
          className={rect ? "tour-card" : "tour-card tour-card--centered"}
          style={cardStyle}
          role="dialog"
          aria-modal="true"
          aria-labelledby="tour-title"
          tabIndex={-1}
          initial={reduceMotion ? false : { opacity: 0, y: below ? 10 : -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: below ? -6 : 6 }}
          transition={{ duration: reduceMotion ? 0.01 : 0.24 }}
        >
          <p className="tour-eyebrow">{step.eyebrow}</p>
          <h2 id="tour-title">{step.title}</h2>
          <p className="tour-body">{step.body}</p>

          {step.points ? (
            <ul className="tour-points">
              {step.points.map((point, position) => (
                <motion.li
                  key={point}
                  initial={reduceMotion ? false : { opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{
                    duration: reduceMotion ? 0.01 : 0.26,
                    delay: reduceMotion ? 0 : 0.06 + position * 0.05,
                  }}
                >
                  {point}
                </motion.li>
              ))}
            </ul>
          ) : null}

          <div className="tour-foot">
            <p className="tour-progress">
              <span className="tour-count">
                {String(index + 1).padStart(2, "0")}
                <i aria-hidden="true">/</i>
                {String(steps.length).padStart(2, "0")}
              </span>
              <span className="tour-dots" aria-hidden="true">
                {steps.map((item, position) => (
                  <i
                    key={item.title}
                    className={position === index ? "is-here" : undefined}
                  />
                ))}
              </span>
            </p>
            <div className="tour-controls">
              <button type="button" className="tour-skip" onClick={close}>
                {last ? "Cerrar" : "Saltar"}
              </button>
              {index > 0 ? (
                <button
                  type="button"
                  className="tour-back"
                  onClick={() => setIndex((value) => value - 1)}
                >
                  Atrás
                </button>
              ) : null}
              {last ? (
                <button type="button" className="tour-next" onClick={close}>
                  Empezar
                </button>
              ) : (
                <button
                  type="button"
                  className="tour-next"
                  onClick={() => setIndex((value) => value + 1)}
                >
                  Siguiente
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>,
    document.body,
  )
}
