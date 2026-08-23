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
    title: "Tres etapas, y mandas tú",
    body:
      "Escuchar, Señales y Ruta. Avanzan solas mientras corre el video, pero "
      + "puedes saltar a cualquiera y volver: al pulsar una, el avance "
      + "automático se detiene y el paso queda en tus manos.",
    target: ".narrative-stage-meta",
    stage: "listening",
  },
  {
    title: "Todo se mueve con el minuto exacto",
    body:
      "Reproduce y no tendrás que buscar nada: la transcripción, la cronología "
      + "y las señales se resaltan solas en el segundo en que se dicen.",
    target: ".documentary-video",
    stage: "listening",
  },
  {
    title: "Pulsa una frase y el video salta ahí",
    body:
      "Funciona en los dos sentidos. Y si eliges un fragmento para leerlo con "
      + "calma, el video que sigue corriendo no te lo quita: la selección "
      + "manda hasta que vuelvas a darle a reproducir.",
    target: ".documentary-fragments",
    stage: "listening",
  },
  {
    title: "Nada queda confirmado solo",
    body:
      "Cada dato que el sistema creyó encontrar llega sin confirmar, con lo "
      + "que entendió cada modelo y si coinciden. Tú confirmas o corriges a "
      + "mano, y queda registrado quién lo hizo.",
    target: ".verification-panel",
    stage: "evidence",
  },
  {
    title: "Cada señal enseña de dónde salió",
    body:
      "Al margen queda la frase textual que la sostiene, con su minuto. "
      + "Púlsala y el video vuelve a ese punto para que lo escuches tú antes "
      + "de decidir.",
    target: ".marginalia-jump",
    stage: "evidence",
  },
  {
    title: "Tres rutas, para poder compararlas",
    body:
      "Emergencia, estabilización y retorno. Cada una dice de qué entidad es, "
      + "qué piden y cómo se contacta, con la fuente oficial detrás.",
    target: ".route-grid",
    stage: "route",
  },
  {
    title: "Ábrela y una voz te va guiando",
    body:
      "Las paradas se despliegan de una en una. Al escucharlas, la voz lee "
      + "cada una y abre la siguiente al ritmo en que habla.",
    target: ".route-journey-toggle",
    stage: "route",
  },
  {
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
const MIN_SIDE_CARD_WIDTH = 300
const MOBILE_BREAKPOINT = 720

type TourPlacement =
  | "above"
  | "below"
  | "left"
  | "right"
  | "center"
  | "docked"
  | "mobile"


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
  const [card, setCard] = useState<HTMLDivElement | null>(null)
  // El contenido sí cambia con `mode="wait"`. Guardar ese nodo en estado
  // permite enfocar la ficha sólo cuando el título nuevo ya está montado.
  const [cardCopy, setCardCopy] = useState<HTMLDivElement | null>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const reduceMotion = useReducedMotion() ?? false

  const step = steps[index]
  const last = index === steps.length - 1
  const progressMax = Math.max(steps.length - 1, 1)
  const progressValue = steps.length === 1 ? 1 : index
  const progressRatio = progressValue / progressMax
  const borderProgress = progressRatio * 100
  const progressText = progressValue === 0
    ? "Recorrido sin avanzar"
    : last
      ? "Recorrido completo"
      : `Recorrido en progreso, paso ${index + 1} de ${steps.length}`

  const close = useCallback(() => {
    setIndex(0)
    onClose()
    // Devolver el foco a donde estaba: si se pierde, el teclado vuelve al
    // principio del documento y la persona no sabe dónde quedó.
    restoreFocusRef.current?.focus?.()
  }, [onClose])

  useEffect(() => {
    if (!open) {
      setIndex(0)
      return
    }
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
    if (cardCopy) card?.focus()
  }, [card, cardCopy])

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
    if (
      event.shiftKey
      && (document.activeElement === first || document.activeElement === card)
    ) {
      event.preventDefault()
      lastItem.focus()
    } else if (!event.shiftKey && document.activeElement === lastItem) {
      event.preventDefault()
      first.focus()
    }
  }

  const viewportHeight = typeof window === "undefined" ? 0 : window.innerHeight
  const viewportWidth = typeof window === "undefined" ? 0 : window.innerWidth
  const mobile = viewportWidth <= MOBILE_BREAKPOINT
  // Debajo si cabe entera, si no encima. Los elementos altos —como la rejilla
  // de rutas— no dejan aire vertical: en ese caso la ficha sale del elemento y
  // se apoya a uno de sus costados, donde haya más espacio.
  const fitsBelow = rect
    ? rect.bottom + GAP + cardHeight <= viewportHeight - GAP
    : false
  const fitsAbove = rect ? rect.top - GAP - cardHeight >= GAP : false
  const availableLeft = rect ? Math.max(0, rect.left - GAP * 2) : 0
  const availableRight = rect
    ? Math.max(0, viewportWidth - rect.right - GAP * 2)
    : 0
  const leftCardWidth = Math.min(CARD_WIDTH, availableLeft)
  const rightCardWidth = Math.min(CARD_WIDTH, availableRight)
  const fitsLeft = leftCardWidth >= MIN_SIDE_CARD_WIDTH
  const fitsRight = rightCardWidth >= MIN_SIDE_CARD_WIDTH
  const placement: TourPlacement = mobile
    ? "mobile"
    : !rect
      ? "center"
      : fitsBelow
        ? "below"
        : fitsAbove
          ? "above"
          : fitsLeft && fitsRight
            ? rect.left >= viewportWidth - rect.right ? "left" : "right"
            : fitsLeft
              ? "left"
              : fitsRight
                ? "right"
                : "docked"
  const sideTop = rect
    ? Math.min(
        Math.max(GAP, rect.top + (rect.height - cardHeight) / 2),
        Math.max(GAP, viewportHeight - cardHeight - GAP),
      )
    : GAP
  const cardStyle = {
    ...(rect && placement !== "mobile" && placement !== "docked"
      ? placement === "left"
        ? {
            top: sideTop,
            left: rect.left - GAP - leftCardWidth,
            width: leftCardWidth,
          }
        : placement === "right"
          ? { top: sideTop, left: rect.right + GAP, width: rightCardWidth }
          : {
              top: Math.min(
                Math.max(
                  GAP,
                  placement === "below"
                    ? rect.bottom + GAP
                    : placement === "above"
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
      : {}),
  } as React.CSSProperties

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

      <motion.div
        ref={setCard}
        className={rect ? "tour-card" : "tour-card tour-card--centered"}
        style={cardStyle}
        data-placement={placement}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        tabIndex={-1}
        initial={reduceMotion
          ? false
          : {
              opacity: 0,
              x: placement === "left" ? -8 : placement === "right" ? 8 : 0,
              y: placement === "below" ? 10 : placement === "above" ? -10 : 0,
            }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        transition={{ duration: reduceMotion ? 0.01 : 0.24 }}
      >
        <svg
          className="tour-progress-frame"
          data-progress={borderProgress}
          aria-hidden="true"
          focusable="false"
        >
          <motion.rect
            className="tour-progress-stroke"
            x="1"
            y="1"
            width="calc(100% - 2px)"
            height="calc(100% - 2px)"
            fill="none"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            initial={false}
            animate={{
              pathLength: progressRatio,
              opacity: progressRatio > 0 ? 1 : 0,
            }}
            transition={{
              duration: reduceMotion ? 0 : 0.36,
              ease: [0.22, 1, 0.36, 1],
            }}
          />
        </svg>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={index}
            ref={setCardCopy}
            className="tour-card-copy"
            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={{ duration: reduceMotion ? 0.01 : 0.2 }}
          >
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
          </motion.div>
        </AnimatePresence>

        <div className="tour-foot">
          <span
            className="visually-hidden"
            role="progressbar"
            aria-label="Progreso del recorrido"
            aria-valuemin={0}
            aria-valuemax={progressMax}
            aria-valuenow={progressValue}
            aria-valuetext={progressText}
          />
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
    </div>,
    document.body,
  )
}
