import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ForwardRefExoticComponent,
  type ReactNode,
  type RefAttributes,
} from "react"
import HTMLFlipBook from "react-pageflip"
import { BookCover, COVER_TRANSITION, type BookPhase } from "./book-cover"
import { DeskSurface } from "../../components/desk-surface"
import { cambiarSonido, pageTurn, sonidoHabilitado } from "../../audio/sonidos"
import { Link, useNavigate } from "react-router-dom"
import { BookDepartContext } from "./book-depart"
import {
  BOOK_PAGES,
  type FlipbookPageItem,
} from "./flipbook-pages"

type TurnDirection = "next" | "previous"

type PageFlipApi = {
  flipNext: (corner?: "top" | "bottom") => void
  flipPrev: (corner?: "top" | "bottom") => void
  turnToPage: (pageNumber: number) => void
  getCurrentPageIndex: () => number
}

type FlipBookRef = {
  pageFlip: () => PageFlipApi | undefined
}

type FlipBookEvent<T = number | string> = {
  data: T
}

type FlipBookProps = {
  children: ReactNode
  className?: string
  style?: CSSProperties
  width: number
  height: number
  size: "fixed" | "stretch"
  minWidth: number
  maxWidth: number
  minHeight: number
  maxHeight: number
  startPage: number
  drawShadow: boolean
  flippingTime: number
  usePortrait: boolean
  startZIndex: number
  autoSize: boolean
  maxShadowOpacity: number
  showCover: boolean
  mobileScrollSupport: boolean
  clickEventForward: boolean
  useMouseEvents: boolean
  swipeDistance: number
  showPageCorners: boolean
  disableFlipByClick: boolean
  renderOnlyPageLengthChange?: boolean
  onFlip?: (event: FlipBookEvent<number>) => void
  onChangeState?: (event: FlipBookEvent<string>) => void
  onInit?: (event: FlipBookEvent<{ page: number; mode: string }>) => void
}

const FlipBook = HTMLFlipBook as unknown as ForwardRefExoticComponent<
  FlipBookProps & RefAttributes<FlipBookRef>
>

const FLIPPING_TIME = 920
const HORIZONTAL_WHEEL_THRESHOLD = 18
const WHEEL_COOLDOWN_MS = 520
const OPEN_BOOK_PAGES = BOOK_PAGES.slice(1)

// Una vez que la persona pasó una página, el gesto ya está aprendido: la
// pista no vuelve a aparecer en visitas siguientes.
const HINT_STORAGE_KEY = "senda:libro-gesto-visto"

function readHintSeen() {
  try {
    return window.localStorage.getItem(HINT_STORAGE_KEY) === "1"
  } catch {
    return false // modo privado / almacenamiento bloqueado
  }
}

function cx(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ")
}

// El modo de lectura no puede decidirse sólo por el ancho: un teléfono
// apaisado mide 844 de ancho —más que una tablet vertical— pero sólo 390 de
// alto, y ahí el pliego tampoco cabe. Se decide con las dos medidas, y por
// eso se calcula aquí en vez de encadenar media queries.
const SPREAD_RATIO = 1.5128 // 2 × 590 / 780
const COVER_RATIO = 0.7564 // 590 / 780: una tapa es media hoja
// Por debajo de cualquiera de los dos, una hoja doble va demasiado apretada.
const SPREAD_MIN_WIDTH = 900
const SPREAD_MIN_HEIGHT = 560

type Box = { width: number; height: number }
type BookGeometry = {
  single: boolean
  page: Box
  box: Box
  cover: Box
}

// La repisa deja arriba la banda de la barra flotante y abajo el pie de la
// pista. dvh y no vh: en el navegador móvil la barra de direcciones entra y
// sale, y con vh el pie del libro quedaba debajo de ella.
function measureBook(
  vw: number,
  vh: number,
  forceSpread = false
): BookGeometry {
  const shelf = Math.min(vh * 0.82, 880)
  const room = Math.min(vw * 0.94, 1340)
  const coverWidth = Math.min(vw * 0.86, shelf * COVER_RATIO)
  const cover = { width: coverWidth, height: coverWidth / COVER_RATIO }
  const single =
    !forceSpread && (vw < SPREAD_MIN_WIDTH || vh < SPREAD_MIN_HEIGHT)

  if (!single) {
    // El alto de la caja es toda la repisa, no el que dicta la proporción del
    // pliego: ese aire de más es el que deja a page-flip honrar su minHeight
    // y dar hojas más altas que su proporción natural. Recortarlo dejaba las
    // hojas 50px más bajas y el pie se subía sobre el cuerpo en tablet.
    const width = Math.min(room, shelf * SPREAD_RATIO)
    return {
      single: false,
      page: { width: 590, height: 780 },
      box: { width, height: shelf },
      cover,
    }
  }

  // Una sola hoja toma la proporción del hueco que le queda, con topes: más
  // estrecha no se lee, y más ancha deja renglones interminables.
  const aspect = Math.min(Math.max(room / shelf, 0.45), 1.3)
  const width = Math.min(room, shelf * aspect)
  const box = { width, height: width / aspect }
  return {
    single: true,
    page: { width: Math.round(box.width), height: Math.round(box.height) },
    box,
    cover,
  }
}

function sameBox(a: Box, b: Box) {
  return a.width === b.width && a.height === b.height
}

function useBookGeometry(forceSpread: boolean): BookGeometry {
  const [geometry, setGeometry] = useState(() =>
    typeof window === "undefined"
      ? measureBook(1280, 800, forceSpread)
      : measureBook(window.innerWidth, window.innerHeight, forceSpread)
  )

  useEffect(() => {
    // Devolver el estado anterior cuando la medida no cambió no es una
    // optimización, es un requisito: react-pageflip vacía sus referencias a
    // las hojas en cada render y sólo las vuelve a tomar si cambia el NÚMERO
    // de páginas (renderOnlyPageLengthChange). Un render de más entre medias
    // lo deja sin referencias y el libro no llega a inicializarse: se queda
    // el contenedor vacío. En un móvil esto no es hipotético, la barra de
    // direcciones dispara "resize" constantemente al desplazar.
    const remeasure = () =>
      setGeometry((previous) => {
        const next = measureBook(
          window.innerWidth,
          window.innerHeight,
          forceSpread
        )
        return previous.single === next.single &&
          sameBox(previous.box, next.box) &&
          sameBox(previous.page, next.page) &&
          sameBox(previous.cover, next.cover)
          ? previous
          : next
      })

    remeasure()
    window.addEventListener("resize", remeasure)
    window.addEventListener("orientationchange", remeasure)
    return () => {
      window.removeEventListener("resize", remeasure)
      window.removeEventListener("orientationchange", remeasure)
    }
  }, [forceSpread])

  return geometry
}

/* Pasar la página tenía tres caminos y ninguno existe en un teléfono: la rueda
 * horizontal del trackpad, las flechas del teclado y arrastrar la esquina. Y el
 * arrastre hacia atrás lo intercepta el navegador, que en el borde izquierdo
 * entiende su propio gesto de "volver". Por eso el libro se podía avanzar pero
 * no devolver. Estos dos botones son el único camino que funciona en todas
 * partes, y de paso lo vuelven alcanzable con lector de pantalla. */
function PageTurnButton({
  direction,
  disabled,
  onTurn,
}: {
  direction: TurnDirection
  disabled: boolean
  onTurn: (direction: TurnDirection) => void
}) {
  const previous = direction === "previous"
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={previous ? "Página anterior" : "Página siguiente"}
      onClick={() => onTurn(direction)}
      className={cx(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
        "border-ink/12 bg-paper-white/70 text-ink transition-colors duration-200",
        "hover:border-ink/35 hover:text-rojo focus-visible:outline focus-visible:outline-2",
        "focus-visible:outline-offset-2 focus-visible:outline-azul",
        "disabled:cursor-not-allowed disabled:border-ink/8 disabled:text-ink/25",
      )}
    >
      <svg
        viewBox="0 0 16 16"
        width="13"
        height="13"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={previous ? "M10 3.5 5.5 8 10 12.5" : "M6 3.5 10.5 8 6 12.5"} />
      </svg>
    </button>
  )
}

/* El interruptor vive junto a los botones de pasar página porque es el único
 * sitio de la aplicación que suena. Sin él, el sonido sería algo que le ocurre
 * a la persona en vez de algo que decide. */
function SoundToggle() {
  const [activo, setActivo] = useState(sonidoHabilitado)

  return (
    <button
      type="button"
      aria-pressed={activo}
      aria-label={activo ? "Silenciar el paso de página" : "Activar el sonido del papel"}
      onClick={() => {
        const siguiente = !activo
        cambiarSonido(siguiente)
        setActivo(siguiente)
      }}
      className={cx(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
        "border-ink/12 bg-paper-white/70 transition-colors duration-200",
        "hover:border-ink/35 focus-visible:outline focus-visible:outline-2",
        "focus-visible:outline-offset-2 focus-visible:outline-azul",
        activo ? "text-ink" : "text-ink/30",
      )}
    >
      <svg
        viewBox="0 0 16 16"
        width="13"
        height="13"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 6H2v4h2l3.5 2.5v-9L4 6Z" />
        {activo ? (
          <path d="M10.5 5.5a3.5 3.5 0 0 1 0 5M12.5 3.5a6 6 0 0 1 0 9" />
        ) : (
          <path d="M10.5 6.5 14 9.5M14 6.5l-3.5 3" />
        )}
      </svg>
    </button>
  )
}

function BookHeader({
  currentPage,
  progressIndex,
  totalPages,
  width,
  canTurnNext,
  turnDisabled,
  onTurn,
  onDepart,
}: {
  currentPage: FlipbookPageItem
  progressIndex: number
  totalPages: number
  width: number
  canTurnNext: boolean
  turnDisabled: boolean
  onTurn: (direction: TurnDirection) => void
  onDepart: (path: string) => void
}) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 px-4 pt-4 md:px-8 md:pt-5">
      <div
        className="mx-auto flex items-center justify-between gap-3 rounded-full border border-ink/8 bg-paper/95 px-4 py-2.5 md:gap-6 md:px-7"
        style={{
          width,
          boxShadow:
            "0 12px 30px rgb(12 9 6 / 34%), 0 2px 6px rgb(12 9 6 / 20%), inset 0 1px 0 rgb(255 255 255 / 62%)",
        }}
      >
        <div className="flex min-w-0 items-baseline gap-3" aria-live="polite">
          <span className="truncate font-sans text-[10px] uppercase tracking-[0.14em] text-ink-faded">
            {currentPage.eyebrow}
          </span>
          <span
            aria-hidden="true"
            className="hidden h-3 w-px shrink-0 bg-ink/20 md:block"
          />
          <span className="hidden truncate font-serif text-sm italic text-ink-soft md:inline">
            Los que caminan todavía
          </span>
        </div>

        {/* El listón vive en la misma banda que el título: como una sola línea
            devuelve al pliego los ~40px verticales que antes ocupaba solo. Los
            dos botones lo flanquean porque el sitio donde se lee en qué página
            vas es el mismo donde se espera poder cambiarla. */}
        <div className="flex shrink-0 items-center gap-2 md:gap-3">
          <PageTurnButton
            direction="previous"
            disabled={turnDisabled}
            onTurn={onTurn}
          />
          <BookProgressRibbon
            progressIndex={progressIndex}
            totalPages={totalPages}
          />
          <PageTurnButton
            direction="next"
            disabled={turnDisabled || !canTurnNext}
            onTurn={onTurn}
          />
          <SoundToggle />
        </div>

        <Link
          to="/conversar"
          className="group flex shrink-0 items-center gap-2 font-sans text-[10px] uppercase tracking-[0.14em] text-ink transition-colors hover:text-rojo focus:outline-none"
          onClick={(event) => {
            event.preventDefault()
            onDepart("/conversar")
          }}
        >
          <span>Crear ruta</span>
          <span
            aria-hidden="true"
            className="inline-block h-1.5 w-1.5 rounded-full transition-transform duration-300 group-hover:scale-125"
          />
        </Link>
      </div>
    </header>
  )
}

// Siempre va dentro de la barra de papel, así que se resuelve en tinta.
function BookProgressRibbon({
  progressIndex,
  totalPages,
}: {
  progressIndex: number
  totalPages: number
}) {
  return (
    <div
      className="pointer-events-none flex shrink-0 items-center gap-2 md:gap-4"
      aria-hidden="true"
    >
      <div className="hidden items-center gap-1.5 md:flex">
        {Array.from({ length: totalPages }).map((_, index) => (
          <span
            key={index}
            className={cx(
              "h-[3px] rounded-full transition-all duration-500",
              index === progressIndex
                ? "w-6 bg-ink"
                : index < progressIndex
                ? "w-3 bg-ink/45"
                : "w-3 bg-ink/16"
            )}
          />
        ))}
      </div>
      <span className="font-sans text-[10px] tabular-nums tracking-[0.1em] text-ink-faded">
        {String(progressIndex + 1).padStart(2, "0")} · {String(totalPages).padStart(2, "0")}
      </span>
    </div>
  )
}

// La invitación a pasar la página no es un botón: es la esquina del papel
// levantándose sola, como cuando alguien va a dar vuelta a una hoja. Vive
// encima del flipbook pero con pointer-events-none, porque el objetivo real
// de arrastre es la esquina de react-pageflip que queda debajo.
function PageTurnHint({ still }: { still: boolean }) {
  const fold = 44

  return (
    <motion.div
      className="pointer-events-none absolute inset-0 z-30"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.45, ease: "easeOut" } }}
      transition={{ duration: 0.9, delay: 1.5, ease: "easeOut" }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 64 64"
        className="absolute bottom-0 right-0 h-[124px] w-[124px] overflow-visible"
      >
        <defs>
          {/* Sombra que proyecta la hoja levantada sobre la página de abajo:
              floja en el vértice y firme junto al pliegue, para que el par
              hueco+solapa no se lea como un cuadrado macizo. */}
          <linearGradient id="book-hint-gap" x1="1" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="rgb(24 20 16 / 10%)" />
            <stop offset="52%" stopColor="rgb(24 20 16 / 26%)" />
            <stop offset="100%" stopColor="rgb(24 20 16 / 38%)" />
          </linearGradient>
          <linearGradient id="book-hint-flap" x1="1" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="rgb(255 253 248)" />
            <stop offset="55%" stopColor="rgb(243 237 223)" />
            <stop offset="100%" stopColor="rgb(214 201 174)" />
          </linearGradient>
        </defs>

        {/* framer-motion normaliza los SVG a transform-box: fill-box y
            transform-origin 50% 50%, así que el vértice se pide en
            porcentaje de la caja del trazo, no en coordenadas del viewBox. */}
        <motion.g
          style={{ transformOrigin: "100% 100%", transformBox: "fill-box" }}
          initial={{ scale: still ? 1 : 0.3, opacity: still ? 1 : 0 }}
          animate={
            still
              ? { scale: 1, opacity: 1 }
              : { scale: [0.3, 1, 1, 0.3], opacity: [0, 1, 1, 0] }
          }
          transition={
            still
              ? { duration: 0 }
              : {
                  duration: 2.6,
                  times: [0, 0.34, 0.62, 1],
                  ease: [0.4, 0, 0.25, 1],
                  repeat: Infinity,
                  repeatDelay: 1.4,
                }
          }
        >
          {/* Hueco que deja el papel al despegarse. */}
          <path
            d={`M64,${64 - fold} L64,64 L${64 - fold},64 Z`}
            fill="url(#book-hint-gap)"
          />
          {/* Hoja doblada hacia adentro: reflejo del vértice sobre la diagonal. */}
          <path
            d={`M64,${64 - fold} L${64 - fold},64 L${64 - fold},${64 - fold} Z`}
            fill="url(#book-hint-flap)"
            stroke="rgb(24 20 16 / 12%)"
            strokeWidth="0.4"
            style={{ filter: "drop-shadow(2px 2px 3px rgb(24 20 16 / 34%))" }}
          />
        </motion.g>
      </svg>
    </motion.div>
  )
}

// Se apoya en la misma microtipografía del listón de progreso para que lea
// como parte del aparato editorial del libro y no como un tooltip.
function PageTurnCaption({
  still,
  onTable,
}: {
  still: boolean
  onTable: boolean
}) {
  const ruleClass = onTable ? "h-px bg-paper/28" : "h-px bg-ink/20"

  return (
    <motion.p
      className={cx(
        "pointer-events-none absolute inset-x-0 -bottom-8 z-30 flex items-center justify-center gap-3 font-sans text-[10px] uppercase tracking-[0.14em] md:-bottom-9",
        onTable ? "text-paper/58" : "text-ink-faded"
      )}
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.45, ease: "easeOut" } }}
      transition={{ duration: 0.9, delay: 1.7, ease: "easeOut" }}
      aria-hidden="true"
    >
      <motion.span
        className={ruleClass}
        initial={{ width: still ? 28 : 8 }}
        animate={still ? { width: 28 } : { width: [8, 28, 28, 8] }}
        transition={
          still
            ? { duration: 0 }
            : {
                duration: 2.6,
                times: [0, 0.34, 0.62, 1],
                ease: [0.4, 0, 0.25, 1],
                repeat: Infinity,
                repeatDelay: 1.4,
              }
        }
      />
      {/* En una pantalla táctil no hay flechas que usar: la mitad de la
          pista sobraría y además no cabe. */}
      <span>
        Arrastra la esquina
        <span className="[@media(pointer:coarse)]:hidden"> · o usa ← →</span>
      </span>
      <motion.span
        className={ruleClass}
        initial={{ width: still ? 28 : 8 }}
        animate={still ? { width: 28 } : { width: [8, 28, 28, 8] }}
        transition={
          still
            ? { duration: 0 }
            : {
                duration: 2.6,
                times: [0, 0.34, 0.62, 1],
                ease: [0.4, 0, 0.25, 1],
                repeat: Infinity,
                repeatDelay: 1.4,
              }
        }
      />
    </motion.p>
  )
}

const FlipBookPage = forwardRef<
  HTMLDivElement,
  { page: FlipbookPageItem; single: boolean }
>(({ page, single }, ref) => {
  const Component = page.Component

  return (
    <div
      ref={ref}
      className="relative h-full w-full overflow-hidden rounded-md border border-rule bg-paper shadow-2xl"
      data-density={page.density ?? "soft"}
    >
      <div
        data-book-page-scroll
        /* En hoja única la página crece con su contenido y es este
           contenedor el que desplaza: clavarla a h-full hacía que el
           overflow-hidden de la sección recortara el texto y que el pie se
           subiera encima del cuerpo.
           En el pliego se mantiene la altura exacta del papel, porque esas
           páginas reparten el espacio con flex-1 y grid-rows-[auto_1fr]: sin
           una altura definida las fotos crecen a su tamaño natural y empujan
           el pie fuera de la hoja. */
        className={cx(
          "relative h-full w-full overflow-x-hidden overflow-y-auto overscroll-contain bg-paper [scrollbar-gutter:stable] [&>section]:min-h-full",
          single ? "[&>section]:!h-auto" : "[&>section]:h-full"
        )}
      >
        <Component />
      </div>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 z-20 w-12"
        style={{
          background:
            "linear-gradient(90deg, rgba(24, 20, 16, 0.16), transparent 72%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 z-20 w-12"
        style={{
          background:
            "linear-gradient(270deg, rgba(24, 20, 16, 0.12), transparent 72%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.12), transparent 28%, transparent 76%, rgba(24,20,16,0.08))",
        }}
      />
    </div>
  )
})

FlipBookPage.displayName = "FlipBookPage"

type BookPageProps = {
  backgroundMode?: boolean
  // "held": la cortina de apertura sigue puesta y el libro espera debajo,
  // fuera de foco. "now": entra (o ya entró). La ruta cambia de uno a otro
  // en el instante en que la cortina se levanta.
  arrival?: "now" | "held"
}

// De dónde llega el libro a la mesa: un poco más abajo, más pequeño y apenas
// ladeado, como se deja un libro que se trae en la mano.
const ARRIVAL_FROM = { opacity: 0, rotateX: 4, rotateY: -7, scale: 0.95, y: 24 }

export default function BookPage({ backgroundMode = false, arrival = "now" }: BookPageProps) {
  const prefersReducedMotion = useReducedMotion()
  const held = arrival === "held"
  // El reflejo de la lámpara sobre las páginas sólo ocurre cuando el libro
  // entra tras la cortina: sin ella, no hay luz que se encienda.
  const [arrivalLight, setArrivalLight] = useState(false)
  const wasHeldRef = useRef(held)
  useEffect(() => {
    if (wasHeldRef.current && !held && !prefersReducedMotion) setArrivalLight(true)
    wasHeldRef.current = held
  }, [held, prefersReducedMotion])
  // Detrás del acceso institucional el libro es decorativo y va tapado por la
  // hoja del formulario. Ahí se queda como pliego a cualquier tamaño: una
  // hoja única agranda el texto fantasma que se transparenta bajo el
  // formulario y lo vuelve ruido legible en vez de textura.
  const { single, page, box } = useBookGeometry(backgroundMode)
  const [bookPhase, setBookPhase] = useState<BookPhase>("open")
  const [openPageIndex, setOpenPageIndex] = useState(0)
  const [hintSeen, setHintSeen] = useState(readHintSeen)
  const hintSeenRef = useRef(false)
  const flipBookRef = useRef<FlipBookRef>(null)
  const readerRef = useRef<HTMLDivElement>(null)
  const openPageIndexRef = useRef(0)
  const isTurningRef = useRef(false)
  // Estado anterior del flipbook, para distinguir el comienzo de un giro de
  // los avisos repetidos que llegan mientras se arrastra la hoja.
  const estadoLibroRef = useRef("read")
  const lastWheelAtRef = useRef(0)
  const turnUnlockTimerRef = useRef<number | null>(null)
  const isInitialLoadRef = useRef(true)

  const progressIndex = bookPhase === "closed" || bookPhase === "closing"
    ? 0
    : Math.min(openPageIndex + 1, BOOK_PAGES.length - 1)

  // Con el libro cerrado, "siguiente" es abrirlo. Abierto, depende de que
  // quede pliego por delante. "Anterior" nunca se agota: en la primera página
  // cierra el libro, que es de donde se venía.
  const canTurnNext = bookPhase === "closed"
    ? true
    : Boolean(OPEN_BOOK_PAGES[openPageIndex + 1])
  const currentPage = bookPhase === "closed" || bookPhase === "closing"
    ? BOOK_PAGES[0]
    : OPEN_BOOK_PAGES[openPageIndex] ?? OPEN_BOOK_PAGES[0]

  // De fondo del login el libro es textura bajo un velo pálido: ahí la mesa
  // sobra y oscurecería el formulario.
  const onTable = !backgroundMode
  const showHint = onTable && bookPhase === "open" && !hintSeen

  const dismissHint = useCallback(() => {
    if (hintSeenRef.current) return
    hintSeenRef.current = true

    try {
      window.localStorage.setItem(HINT_STORAGE_KEY, "1")
    } catch {
      // Sin almacenamiento la pista simplemente reaparece en la próxima visita.
    }

    setHintSeen(true)
  }, [])

  const releaseTurnLock = useCallback(() => {
    if (turnUnlockTimerRef.current) {
      window.clearTimeout(turnUnlockTimerRef.current)
      turnUnlockTimerRef.current = null
    }

    isTurningRef.current = false
    lastWheelAtRef.current = Date.now()
  }, [])

  const scheduleTurnUnlock = useCallback(() => {
    if (turnUnlockTimerRef.current) {
      window.clearTimeout(turnUnlockTimerRef.current)
    }

    turnUnlockTimerRef.current = window.setTimeout(
      releaseTurnLock,
      FLIPPING_TIME + 180
    )
  }, [releaseTurnLock])

  const openBook = useCallback(() => {
    if (bookPhase !== "closed") return

    // Abrir y cerrar también son papel moviéndose, y son el primer gesto que
    // hace cualquiera que llega. Van aquí, después de la guarda, para que sólo
    // suenen cuando el libro de verdad se mueve.
    pageTurn()

    isTurningRef.current = false
    openPageIndexRef.current = 0
    lastWheelAtRef.current = Date.now()
    setOpenPageIndex(0)
    // La apertura ya hizo el trabajo dramático; la doble página entra con la
    // transición corta en vez de encadenar un segundo intro de un segundo.
    isInitialLoadRef.current = false

    if (prefersReducedMotion) {
      setBookPhase("open")
      return
    }

    isTurningRef.current = true
    setBookPhase("opening")
  }, [bookPhase, prefersReducedMotion])

  const closeBook = useCallback(() => {
    if (bookPhase === "closing" || bookPhase === "closed") return

    pageTurn()

    releaseTurnLock()
    openPageIndexRef.current = 0
    setOpenPageIndex(0)

    if (prefersReducedMotion) {
      setBookPhase("closed")
      return
    }

    isTurningRef.current = true
    setBookPhase("closing")
  }, [bookPhase, prefersReducedMotion, releaseTurnLock])

  const requestTurn = useCallback(
    (direction: TurnDirection) => {
      if (bookPhase === "opening" || bookPhase === "closing") return

      if (bookPhase === "closed") {
        if (direction === "next") openBook()
        return
      }

      if (isTurningRef.current) return

      const fromIndex = openPageIndexRef.current
      const targetIndex = direction === "next" ? fromIndex + 1 : fromIndex - 1

      if (targetIndex < 0) {
        closeBook()
        return
      }

      if (!OPEN_BOOK_PAGES[targetIndex]) return

      const pageFlip = flipBookRef.current?.pageFlip()
      if (!pageFlip) return

      isTurningRef.current = true

      if (direction === "next") {
        pageFlip.flipNext("bottom")
      } else {
        pageFlip.flipPrev("bottom")
      }

      scheduleTurnUnlock()
    },
    [bookPhase, closeBook, openBook, scheduleTurnUnlock]
  )

  const navigate = useNavigate()
  const departureRef = useRef<string | null>(null)

  // "Crear ruta" cierra el libro antes de irse: quien deja de leer para ir a
  // hacer algo cierra el libro, y ver la tapa caer es lo que dice que la
  // lectura terminó. Con el libro ya cerrado, o con menos movimiento, se va
  // directo.
  const departTo = useCallback((path: string) => {
    if (bookPhase === "open" && !prefersReducedMotion && !backgroundMode) {
      departureRef.current = path
      closeBook()
      return
    }
    navigate(path)
  }, [bookPhase, prefersReducedMotion, backgroundMode, closeBook, navigate])

  // El cambio de fase sigue al giro real: no hay temporizadores compitiendo
  // con una animación de salida ni una segunda escena que tenga que cargar.
  const finishCoverMotion = useCallback(() => {
    if (bookPhase !== "opening" && bookPhase !== "closing") return
    setBookPhase(bookPhase === "opening" ? "open" : "closed")
    releaseTurnLock()
    // Tapa abajo: si el cierre era para irse, ahora sí.
    const destination = departureRef.current
    if (bookPhase === "closing" && destination) {
      departureRef.current = null
      navigate(destination)
    }
  }, [bookPhase, releaseTurnLock, navigate])

  useEffect(() => {
    openPageIndexRef.current = openPageIndex
  }, [openPageIndex])

  useEffect(() => {
    return () => {
      if (turnUnlockTimerRef.current) {
        window.clearTimeout(turnUnlockTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      const horizontalDelta = event.deltaX
      const verticalDelta = event.deltaY
      const isHorizontalGesture =
        Math.abs(horizontalDelta) > HORIZONTAL_WHEEL_THRESHOLD &&
        Math.abs(horizontalDelta) > Math.abs(verticalDelta)

      if (!isHorizontalGesture) return

      event.preventDefault()

      if (isTurningRef.current) return

      const now = Date.now()
      if (now - lastWheelAtRef.current < WHEEL_COOLDOWN_MS) return

      lastWheelAtRef.current = now
      requestTurn(horizontalDelta > 0 ? "next" : "previous")
    }

    window.addEventListener("wheel", onWheel, { passive: false })
    return () => window.removeEventListener("wheel", onWheel)
  }, [requestTurn])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") {
        event.preventDefault()
        requestTurn("next")
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault()
        requestTurn("previous")
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [requestTurn])

  return (
    <BookDepartContext.Provider value={departTo}>
    <main
      className={cx(
        "book-typeset relative h-dvh overflow-hidden px-4 pb-16 pt-[5.25rem] text-ink md:px-8 md:pb-[4.5rem] md:pt-[5.5rem]",
        onTable ? "bg-[oklch(0.29_0.04_58)]" : "bg-paper"
      )}
    >
      {onTable ? <DeskSurface /> : null}
      <BookHeader
        currentPage={currentPage}
        progressIndex={progressIndex}
        totalPages={BOOK_PAGES.length}
        width={box.width}
        canTurnNext={canTurnNext}
        turnDisabled={bookPhase === "opening" || bookPhase === "closing"}
        onTurn={requestTurn}
        onDepart={departTo}
      />

      <section
        className="relative z-10 mx-auto flex h-full max-w-[1380px] items-center justify-center"
        style={{ perspective: Math.max(3200, box.width * 4.5) }}
      >
            <motion.div
              data-book-phase={bookPhase}
              data-book-arrival={arrival}
              className="relative"
              initial={
                backgroundMode
                  ? false
                  : isInitialLoadRef.current && !prefersReducedMotion
                  ? ARRIVAL_FROM
                  : {
                      opacity: 0.96,
                      rotateX: 0,
                      rotateY: 0,
                      scale: 1,
                      y: -12,
                    }
              }
              animate={
                // Bajo la cortina el libro se queda donde llegó: el viaje a la
                // mesa empieza cuando ella se levanta.
                held && !prefersReducedMotion
                  ? ARRIVAL_FROM
                  : {
                      opacity: 1,
                      rotateX: 0,
                      rotateY: 0,
                      scale: 1,
                      y: -12,
                      x: !single && (bookPhase === "closed" || bookPhase === "closing") ? -box.width / 4 : 0,
                    }
              }
              onAnimationComplete={() => {
                // Esperar no es haber entrado: la entrada sigue pendiente.
                if (!held) isInitialLoadRef.current = false
              }}
              transition={
                isInitialLoadRef.current && !prefersReducedMotion
                  ? { duration: 1.05, ease: [0.16, 1, 0.3, 1] }
                  : prefersReducedMotion ? { duration: 0 } : COVER_TRANSITION
              }
              style={{
                ...box,
                transformStyle: "preserve-3d",
              }}
            >
              <div
                ref={readerRef}
                className="absolute inset-0"
                inert={bookPhase !== "open"}
                aria-hidden={bookPhase !== "open"}
                style={{
                  visibility: bookPhase === "closed" ? "hidden" : "visible",
                  clipPath: !single && bookPhase !== "open" ? "inset(-100px -100px -100px 50%)" : undefined,
                  filter: onTable
                    ? "drop-shadow(0 26px 44px rgba(10,7,4,0.52)) drop-shadow(0 3px 8px rgba(10,7,4,0.4))"
                    : "drop-shadow(0 42px 76px rgba(24,20,16,0.28))",
                }}
              >
              {/* Sombra de contacto: es lo que asienta el libro sobre la
                  madera en vez de dejarlo flotando. Al aterrizar tras la
                  cortina llega ancha y tenue y se aprieta bajo el libro. */}
              {onTable ? (
                <motion.div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-8 -bottom-3 -z-10 h-8 rounded-[50%] blur-xl"
                  style={{ background: "oklch(0.12 0.02 45 / 62%)" }}
                  initial={false}
                  animate={held && !prefersReducedMotion
                    ? { opacity: 0.35, scaleX: 1.18, scaleY: 1.4 }
                    : { opacity: 1, scaleX: 1, scaleY: 1 }}
                  transition={{ duration: 1.05, ease: [0.16, 1, 0.3, 1] }}
                />
              ) : null}

              <AnimatePresence>
                {showHint ? (
                  <PageTurnHint
                    key="turn-hint"
                    still={Boolean(prefersReducedMotion)}
                  />
                ) : null}
                {showHint ? (
                  <PageTurnCaption
                    key="turn-caption"
                    still={Boolean(prefersReducedMotion)}
                    onTable={onTable}
                  />
                ) : null}
              </AnimatePresence>

              <div
                aria-hidden="true"
                className="absolute -right-4 bottom-3 top-4 w-4 rounded-r-sm border-r border-ink/10"
                style={{
                  background:
                    "linear-gradient(90deg, rgba(248,244,230,0.92), rgba(146,130,98,0.46))",
                  transform: "rotateY(-72deg) translateZ(-10px)",
                  transformOrigin: "left center",
                  zIndex: 0,
                }}
              />
              <div
                aria-hidden="true"
                className="absolute inset-x-5 -bottom-4 h-5 rounded-b-sm border-b border-ink/10"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(248,244,230,0.92), rgba(133,115,87,0.44))",
                  transform: "rotateX(72deg) translateZ(-12px)",
                  transformOrigin: "top center",
                  zIndex: 0,
                }}
              />
              {/* Espejo exacto del canto derecho. Antes era sólo un degradado
                  oscuro —pensado para el fondo claro de papel— que sobre la
                  madera desaparecía: se veía bloque de hojas a la derecha y
                  nada a la izquierda, y el libro parecía correrse de eje. */}
              <div
                aria-hidden="true"
                className="absolute -left-4 bottom-3 top-4 w-4 rounded-l-sm border-l border-ink/10"
                style={{
                  background:
                    "linear-gradient(270deg, rgba(248,244,230,0.92), rgba(146,130,98,0.46))",
                  transform: "rotateY(72deg) translateZ(-10px)",
                  transformOrigin: "right center",
                  zIndex: 0,
                }}
              />

              {/* La luz de la lámpara cruza las páginas una vez, cuando el
                  libro ya se asentó; después no vuelve. Va en CSS, como el
                  polvo: montado a mitad de la entrada del libro, framer-motion
                  le escribía el estado final de una vez y no lo animaba. */}
              {arrivalLight ? (
                <div
                  aria-hidden="true"
                  className="book-arrival-light"
                  data-testid="book-arrival-light"
                  onAnimationEnd={() => setArrivalLight(false)}
                />
              ) : null}

              <FlipBook
                // react-pageflip congela sus medidas al inicializarse: sin
                // esta llave, girar el teléfono deja el libro con la
                // geometría del modo anterior.
                key={single ? "una-hoja" : "pliego"}
                ref={flipBookRef}
                className="relative z-10 mx-auto"
                style={{ transformStyle: "preserve-3d" }}
                width={page.width}
                height={page.height}
                size="stretch"
                // En una sola hoja los suelos van deliberadamente bajos: si
                // minWidth supera lo que mide la caja, page-flip lo impone
                // igual y el libro se sale de la pantalla. En el pliego se
                // mantienen los de siempre, que son los que dan hojas altas.
                minWidth={single ? Math.round(page.width * 0.6) : 350}
                maxWidth={single ? page.width : 650}
                minHeight={single ? Math.round(page.height * 0.6) : 520}
                maxHeight={880}
                startPage={0}
                drawShadow={true}
                flippingTime={FLIPPING_TIME}
                usePortrait={single}
                startZIndex={12}
                autoSize={true}
                maxShadowOpacity={0.62}
                showCover={false}
                mobileScrollSupport={true}
                clickEventForward={true}
                useMouseEvents={true}
                swipeDistance={38}
                showPageCorners={true}
                disableFlipByClick={true}
                renderOnlyPageLengthChange={true}
                onFlip={(event) => {
                  const nextIndex = Number(event.data)
                  if (Number.isNaN(nextIndex)) return
                  // react-pageflip también emite "flip" al montarse, con la
                  // página de arranque. Sólo un cambio real de índice cuenta
                  // como gesto aprendido; si no, la pista se autodescartaría
                  // en la primera carga y quedaría marcada para siempre.
                  if (nextIndex !== openPageIndexRef.current) {
                    dismissHint()
                  }
                  openPageIndexRef.current = nextIndex
                  setOpenPageIndex(nextIndex)
                }}
                onChangeState={(event) => {
                  const state = String(event.data)

                  /* El sonido vive aquí y no en requestTurn porque aquel sólo
                     cubre la rueda, el teclado y los botones. Arrastrar la
                     hoja —que es como se pasa la página de verdad, y lo único
                     que existe en un teléfono— lo resuelve react-pageflip por
                     dentro y nunca pasaba por ahí. Este evento es el único
                     punto por el que pasan los cuatro caminos. Se compara con
                     el estado anterior para que suene al empezar el giro y una
                     sola vez, no en cada aviso del arrastre. */
                  if (state === "flipping" && estadoLibroRef.current !== "flipping") {
                    pageTurn()
                  }
                  estadoLibroRef.current = state

                  if (state === "read") {
                    releaseTurnLock()
                    return
                  }

                  isTurningRef.current =
                    state === "flipping" || state === "user_fold"
                }}
                onInit={(event) => {
                  const initialIndex = Number(event.data.page)
                  if (Number.isNaN(initialIndex)) return
                  openPageIndexRef.current = initialIndex
                  setOpenPageIndex(initialIndex)
                }}
              >
                {OPEN_BOOK_PAGES.map((item) => (
                  <FlipBookPage key={item.id} page={item} single={single} />
                ))}
              </FlipBook>
              </div>
              <BookCover
                phase={bookPhase}
                single={single}
                still={Boolean(prefersReducedMotion)}
                readerRef={readerRef}
                onOpen={openBook}
                onComplete={finishCoverMotion}
              />
            </motion.div>
      </section>
    </main>
    </BookDepartContext.Provider>
  )
}
