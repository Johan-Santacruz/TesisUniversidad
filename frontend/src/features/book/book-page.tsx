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
import { DeskSurface } from "../../components/desk-surface"
import { cambiarSonido, pageTurn, sonidoHabilitado } from "../../audio/sonidos"
import { Link } from "react-router-dom"
import {
  BOOK_PAGES,
  type FlipbookPageItem,
} from "./flipbook-pages"

type TurnDirection = "next" | "previous"
type BookPhase = "closed" | "opening" | "open" | "closing"

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
const OPENING_TIME = 1220
const CLOSING_TIME = 1220
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
}: {
  currentPage: FlipbookPageItem
  progressIndex: number
  totalPages: number
  width: number
  canTurnNext: boolean
  turnDisabled: boolean
  onTurn: (direction: TurnDirection) => void
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

function ClosedBookView({
  onOpen,
  still,
  box,
}: {
  onOpen: () => void
  still: boolean
  box: Box
}) {
  return (
    <motion.div
      className="relative min-w-[300px]"
      initial={{
        opacity: 0,
        rotateX: 5,
        rotateY: -10,
        scale: 0.96,
        y: 12,
      }}
      animate={{
        opacity: 1,
        rotateX: 0,
        rotateY: -4,
        scale: 1,
        y: -8,
      }}
      exit={{ opacity: 0, rotateY: -18, scale: 0.95, x: -24 }}
      transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      style={{
        ...box,
        transformStyle: "preserve-3d",
        filter: "drop-shadow(0 44px 78px rgba(24,20,16,0.28))",
      }}
    >
      <div
        aria-hidden="true"
        className="absolute -right-5 bottom-4 top-4 w-5 rounded-r-sm border-r border-ink/10"
        style={{
          background:
            "linear-gradient(90deg, rgba(248,244,230,0.98), rgba(144,126,92,0.52))",
          transform: "rotateY(-68deg) translateZ(-12px)",
          transformOrigin: "left center",
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-5 -bottom-5 h-5 rounded-b-sm border-b border-ink/10"
        style={{
          background:
            "linear-gradient(180deg, rgba(248,244,230,0.98), rgba(126,108,78,0.46))",
          transform: "rotateX(72deg) translateZ(-12px)",
          transformOrigin: "top center",
        }}
      />
      <div
        aria-hidden="true"
        className="absolute -left-4 bottom-5 top-5 w-5 rounded-l-sm"
        style={{
          background:
            "linear-gradient(90deg, rgba(24,20,16,0.36), rgba(24,20,16,0.16), transparent)",
          transform: "translateZ(-8px)",
        }}
      />

      <motion.button
        type="button"
        onClick={onOpen}
        className="group relative z-10 h-full w-full overflow-hidden rounded-[3px] border border-ink/20 bg-ink text-left text-paper shadow-2xl focus:outline-none focus:ring-2 focus:ring-ink/40 focus:ring-offset-4 focus:ring-offset-paper"
        whileHover={{ rotateY: -2.5, y: -4 }}
        whileTap={{ scale: 0.985 }}
        transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
        style={{
          transformStyle: "preserve-3d",
          transformOrigin: "left center",
        }}
        aria-label="Abrir libro"
      >
        <motion.img
          src="/images/cover-andes.jpg"
          alt="Montañas andinas cubiertas de niebla"
          className="absolute inset-0 h-full w-full object-cover object-[center_44%] contrast-125 saturate-0 brightness-[0.82] transition-transform duration-700 group-hover:scale-[1.035]"
          initial={{ scale: 1.08 }}
          animate={{ scale: 1 }}
          transition={{ duration: 1.35, ease: [0.22, 1, 0.36, 1] }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-ink/72 via-ink/38 to-ink/96" />
        <div className="absolute inset-x-0 bottom-0 h-[58%] bg-gradient-to-t from-ink via-ink/86 to-transparent" />
        <div aria-hidden="true" className="absolute inset-x-0 top-0 z-10 flex h-[3px]">
          <span className="h-full w-1/2 bg-amarillo" />
          <span className="h-full w-1/4 bg-azul" />
          <span className="h-full w-1/4 bg-rojo" />
        </div>

        <div className="relative z-10 flex h-full min-h-0 flex-col p-5 sm:p-7 md:p-9">
          <div className="flex items-center justify-between font-sans text-[10px] uppercase tracking-normal text-paper/62">
            <span>Crónica visual</span>
            <span>Derechos</span>
          </div>

          <div className="mt-auto max-w-[24rem]">
            <p className="mb-3 font-sans text-[10px] uppercase text-paper/56 md:mb-4">
              Libro interactivo
            </p>
            <h2 className="font-serif text-[clamp(1.9rem,min(8vh,13vw),5rem)] leading-[0.88] text-paper">
              <span className="block italic font-normal">Los que</span>
              <span className="block">caminan</span>
              <span className="block italic font-normal text-paper/72">
                todavía.
              </span>
            </h2>
            <p className="mt-4 border-t border-paper/22 pt-4 font-serif text-[clamp(0.95rem,min(2.6vh,4.2vw),1.34rem)] leading-snug text-paper/82 text-pretty md:mt-5 md:pt-5">
              Una lectura sobre desplazamiento, derechos y la posibilidad de
              volver a orientarse.
            </p>

            {/* El filete que crece hace de latido: señala que la cubierta es
                una puerta, sin recurrir a un botón dentro del botón. */}
            <p className="mt-4 flex items-center gap-2.5 font-sans text-[10px] uppercase tracking-[0.14em] text-paper/58 transition-colors group-hover:text-paper/86 md:mt-6">
              <motion.span
                aria-hidden="true"
                className="h-px bg-paper/45"
                initial={{ width: still ? 30 : 10 }}
                animate={still ? { width: 30 } : { width: [10, 30, 30, 10] }}
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
              Abrir el libro
            </p>
          </div>
        </div>
      </motion.button>
    </motion.div>
  )
}

function OpeningBookView({ box }: { box: Box }) {
  return (
    <motion.div
      key="opening-book"
      className="relative"
      initial={{
        opacity: 1,
        x: "-25%",
        rotateX: 2.5,
        rotateY: -5,
        scale: 0.995,
        y: -8,
      }}
      animate={{
        opacity: 1,
        x: "0%",
        rotateX: 0,
        rotateY: 0,
        scale: 1,
        y: -12,
      }}
      transition={{
        duration: 1.18,
        ease: [0.16, 1, 0.3, 1],
      }}
      style={{
        ...box,
        transformStyle: "preserve-3d",
        filter: "drop-shadow(0 46px 84px rgba(24,20,16,0.3))",
      }}
      aria-hidden="true"
    >
      <div
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
        className="absolute inset-x-5 -bottom-4 h-5 rounded-b-sm border-b border-ink/10"
        style={{
          background:
            "linear-gradient(180deg, rgba(248,244,230,0.92), rgba(133,115,87,0.44))",
          transform: "rotateX(72deg) translateZ(-12px)",
          transformOrigin: "top center",
          zIndex: 0,
        }}
      />

      <motion.div
        className="absolute inset-0 z-10 overflow-hidden rounded-md border border-ink/12 bg-paper"
        initial={{ opacity: 0.2, scaleX: 0.52 }}
        animate={{ opacity: 1, scaleX: 1 }}
        transition={{ duration: 1.08, ease: [0.18, 1, 0.32, 1] }}
        style={{
          transformOrigin: "right center",
          transformStyle: "preserve-3d",
        }}
      >
        <motion.div
          className="absolute inset-y-0 left-0 w-1/2 overflow-hidden rounded-l-md bg-ink"
          initial={{ opacity: 0, rotateY: 7, x: 24 }}
          animate={{ opacity: 1, rotateY: 0, x: 0 }}
          transition={{
            duration: 1.05,
            delay: 0.1,
            ease: [0.16, 1, 0.3, 1],
          }}
          style={{
            transformOrigin: "right center",
            transformStyle: "preserve-3d",
          }}
        >
          <img
            src="/images/cover-andes.jpg"
            alt=""
            className="absolute inset-y-0 left-0 h-full w-[200%] max-w-none object-cover object-center contrast-125 saturate-0 brightness-[0.82]"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-ink/72 via-ink/24 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink/72 via-transparent to-ink/18" />
          <div className="absolute bottom-8 left-8 max-w-[16rem] border-t border-paper/24 pt-4 font-serif text-[clamp(1rem,2.5vh,1.28rem)] italic leading-snug text-paper/80">
            Un territorio, una ruta y una pregunta.
          </div>
        </motion.div>

        <motion.div
          className="absolute inset-y-0 right-0 w-1/2 overflow-hidden rounded-r-md bg-ink"
          initial={{ opacity: 0.42, scale: 0.985 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.95, ease: [0.16, 1, 0.3, 1] }}
        >
          <img
            src="/images/cover-andes.jpg"
            alt=""
            className="absolute inset-y-0 right-0 h-full w-[200%] max-w-none object-cover object-center contrast-125 saturate-0 brightness-[0.82]"
          />
          <div className="absolute inset-0 bg-gradient-to-l from-ink/72 via-ink/16 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink/76 via-transparent to-ink/18" />
          <div className="absolute bottom-9 left-9 max-w-[25rem]">
            <p className="mb-3 font-sans text-[10px] uppercase text-paper/56 md:mb-4">
              Los que
            </p>
            <h2 className="font-serif text-[clamp(2.9rem,7.4vh,5.2rem)] leading-[0.88] text-paper">
              <span className="block">caminan</span>
              <span className="block italic font-normal text-paper/72">
                todavía.
              </span>
            </h2>
          </div>
        </motion.div>

        <motion.div
          className="absolute inset-y-0 left-1/2 z-20 w-16 -translate-x-1/2"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.1, 0.32, 0.18] }}
          transition={{ duration: 1.18, times: [0, 0.22, 0.62, 1] }}
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(24,20,16,0.28), rgba(255,255,255,0.18), transparent)",
          }}
        />
      </motion.div>

      <motion.div
        className="absolute inset-y-0 left-1/2 z-30 w-1/2 overflow-hidden rounded-r-md border border-ink/20 bg-ink shadow-2xl"
        initial={{
          rotateY: 0,
          x: "0%",
          opacity: 1,
          z: 18,
        }}
        animate={{
          rotateY: [0, -18, -72, -138, -178],
          x: ["0%", "-0.5%", "-1.6%", "-0.8%", "0%"],
          opacity: [1, 1, 0.96, 0.48, 0],
          z: [18, 34, 42, 24, 4],
        }}
        transition={{
          duration: 1.2,
          times: [0, 0.18, 0.5, 0.82, 1],
          ease: [0.2, 0.88, 0.22, 1],
        }}
        style={{
          transformOrigin: "left center",
          transformStyle: "preserve-3d",
        }}
      >
        <div
          className="absolute inset-0 overflow-hidden bg-ink"
          style={{ backfaceVisibility: "hidden" }}
        >
          <img
            src="/images/cover-andes.jpg"
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-[center_44%] contrast-125 saturate-0 brightness-[0.82]"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-ink/72 via-ink/38 to-ink/96" />
          <div className="absolute inset-x-0 bottom-0 h-[58%] bg-gradient-to-t from-ink via-ink/86 to-transparent" />
          <div className="relative z-10 flex h-full flex-col p-7 md:p-9">
            <div className="flex items-center justify-between font-sans text-[10px] uppercase text-paper/62">
              <span>Crónica visual</span>
              <span>Derechos</span>
            </div>
            <div className="mt-auto max-w-[24rem]">
              <p className="mb-3 font-sans text-[10px] uppercase text-paper/56 md:mb-4">
                Libro interactivo
              </p>
              <h2 className="font-serif text-[clamp(1.9rem,min(8vh,13vw),5rem)] leading-[0.88] text-paper">
                <span className="block italic font-normal">Los que</span>
                <span className="block">caminan</span>
                <span className="block italic font-normal text-paper/72">
                  todavía.
                </span>
              </h2>
            </div>
          </div>
        </div>

        <div
          className="absolute inset-0 overflow-hidden bg-paper"
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(24,20,16,0.22),transparent_22%,rgba(255,255,255,0.26)_62%,transparent)]" />
          <div className="absolute inset-x-7 top-8 h-px bg-ink/18" />
          <div className="absolute inset-x-8 bottom-8 h-px bg-ink/12" />
        </div>

        <motion.div
          className="pointer-events-none absolute inset-0 z-20"
          initial={{ opacity: 0.08 }}
          animate={{ opacity: [0.08, 0.32, 0.58, 0.18, 0] }}
          transition={{
            duration: 1.2,
            times: [0, 0.24, 0.56, 0.84, 1],
            ease: [0.2, 0.88, 0.22, 1],
          }}
          style={{
            background:
              "linear-gradient(90deg, rgba(0,0,0,0.38), transparent 28%, rgba(255,255,255,0.22) 68%, rgba(0,0,0,0.3))",
          }}
        />
      </motion.div>

      <motion.div
        className="absolute inset-y-0 left-1/2 z-40 w-12 -translate-x-1/2"
        initial={{ opacity: 0.18, scaleX: 0.45 }}
        animate={{
          opacity: [0.18, 0.42, 0.28, 0.16],
          scaleX: [0.45, 1, 0.75, 0.55],
        }}
        transition={{ duration: 1.18, times: [0, 0.42, 0.74, 1] }}
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(24,20,16,0.32), rgba(255,255,255,0.2), transparent)",
        }}
      />
    </motion.div>
  )
}

function ClosingBookView({ box }: { box: Box }) {
  return (
    <motion.div
      key="closing-book"
      className="relative"
      initial={{
        opacity: 1,
        x: "0%",
        rotateX: 0,
        rotateY: 0,
        scale: 1,
        y: -12,
      }}
      animate={{
        opacity: 1,
        x: "-25%",
        rotateX: 2.5,
        rotateY: -5,
        scale: 0.995,
        y: -8,
      }}
      transition={{
        duration: 1.18,
        ease: [0.3, 0, 0.68, 0.98],
      }}
      style={{
        ...box,
        transformStyle: "preserve-3d",
        filter: "drop-shadow(0 46px 84px rgba(24,20,16,0.3))",
      }}
      aria-hidden="true"
    >
      <div
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
        className="absolute inset-x-5 -bottom-4 h-5 rounded-b-sm border-b border-ink/10"
        style={{
          background:
            "linear-gradient(180deg, rgba(248,244,230,0.92), rgba(133,115,87,0.44))",
          transform: "rotateX(72deg) translateZ(-12px)",
          transformOrigin: "top center",
          zIndex: 0,
        }}
      />

      <div
        className="absolute inset-0 z-10 overflow-hidden rounded-md border border-ink/12 bg-paper"
        style={{
          transformOrigin: "right center",
          transformStyle: "preserve-3d",
        }}
      >
        <div
          className="absolute inset-y-0 left-0 w-1/2 overflow-hidden rounded-l-md bg-ink"
          style={{
            transformOrigin: "right center",
            transformStyle: "preserve-3d",
          }}
        >
          <img
            src="/images/cover-andes.jpg"
            alt=""
            className="absolute inset-y-0 left-0 h-full w-[200%] max-w-none object-cover object-center contrast-125 saturate-0 brightness-[0.82]"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-ink/72 via-ink/24 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink/72 via-transparent to-ink/18" />
          <div className="absolute bottom-8 left-8 max-w-[16rem] border-t border-paper/24 pt-4 font-serif text-[clamp(1rem,2.5vh,1.28rem)] italic leading-snug text-paper/80">
            Un territorio, una ruta y una pregunta.
          </div>
        </div>

        <div className="absolute inset-y-0 right-0 w-1/2 overflow-hidden rounded-r-md bg-ink">
          <img
            src="/images/cover-andes.jpg"
            alt=""
            className="absolute inset-y-0 right-0 h-full w-[200%] max-w-none object-cover object-center contrast-125 saturate-0 brightness-[0.82]"
          />
          <div className="absolute inset-0 bg-gradient-to-l from-ink/72 via-ink/16 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink/76 via-transparent to-ink/18" />
        </div>
      </div>

      <motion.div
        className="absolute inset-y-0 left-1/2 z-30 w-1/2 overflow-hidden rounded-r-md border border-ink/20 bg-ink shadow-2xl"
        initial={{
          rotateY: -178,
          x: "0%",
          opacity: 0,
          z: 4,
        }}
        animate={{
          rotateY: [-178, -138, -72, -18, 0],
          x: ["0%", "-0.8%", "-1.6%", "-0.5%", "0%"],
          opacity: [0, 0.48, 0.96, 1, 1],
          z: [4, 24, 42, 34, 18],
        }}
        transition={{
          duration: 1.2,
          times: [0, 0.18, 0.5, 0.82, 1],
          ease: [0.2, 0.88, 0.22, 1],
        }}
        style={{
          transformOrigin: "left center",
          transformStyle: "preserve-3d",
        }}
      >
        <div
          className="absolute inset-0 overflow-hidden bg-ink"
          style={{ backfaceVisibility: "hidden" }}
        >
          <img
            src="/images/cover-andes.jpg"
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-[center_44%] contrast-125 saturate-0 brightness-[0.82]"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-ink/72 via-ink/38 to-ink/96" />
          <div className="absolute inset-x-0 bottom-0 h-[58%] bg-gradient-to-t from-ink via-ink/86 to-transparent" />
          <div className="relative z-10 flex h-full flex-col p-7 md:p-9">
            <div className="flex items-center justify-between font-sans text-[10px] uppercase text-paper/62">
              <span>Crónica visual</span>
              <span>Derechos</span>
            </div>
            <div className="mt-auto max-w-[24rem]">
              <p className="mb-3 font-sans text-[10px] uppercase text-paper/56 md:mb-4">
                Libro interactivo
              </p>
              <h2 className="font-serif text-[clamp(1.9rem,min(8vh,13vw),5rem)] leading-[0.88] text-paper">
                <span className="block italic font-normal">Los que</span>
                <span className="block">caminan</span>
                <span className="block italic font-normal text-paper/72">
                  todavía.
                </span>
              </h2>
            </div>
          </div>
        </div>

        <div
          className="absolute inset-0 overflow-hidden bg-paper"
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(24,20,16,0.22),transparent_22%,rgba(255,255,255,0.26)_62%,transparent)]" />
          <div className="absolute inset-x-7 top-8 h-px bg-ink/18" />
          <div className="absolute inset-x-8 bottom-8 h-px bg-ink/12" />
        </div>

        <motion.div
          className="pointer-events-none absolute inset-0 z-20"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.18, 0.58, 0.32, 0.08] }}
          transition={{
            duration: 1.2,
            times: [0, 0.16, 0.44, 0.76, 1],
            ease: [0.2, 0.88, 0.22, 1],
          }}
          style={{
            background:
              "linear-gradient(90deg, rgba(0,0,0,0.38), transparent 28%, rgba(255,255,255,0.22) 68%, rgba(0,0,0,0.3))",
          }}
        />
      </motion.div>

      <motion.div
        className="absolute inset-y-0 left-1/2 z-40 w-12 -translate-x-1/2"
        initial={{ opacity: 0.16, scaleX: 0.55 }}
        animate={{
          opacity: [0.16, 0.28, 0.42, 0.18],
          scaleX: [0.55, 0.75, 1, 0.45],
        }}
        transition={{ duration: 1.18, times: [0, 0.26, 0.58, 1] }}
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(24,20,16,0.32), rgba(255,255,255,0.2), transparent)",
        }}
      />
    </motion.div>
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
}

export default function BookPage({ backgroundMode = false }: BookPageProps) {
  const prefersReducedMotion = useReducedMotion()
  // Detrás del acceso institucional el libro es decorativo y va tapado por la
  // hoja del formulario. Ahí se queda como pliego a cualquier tamaño: una
  // hoja única agranda el texto fantasma que se transparenta bajo el
  // formulario y lo vuelve ruido legible en vez de textura.
  const { single, page, box, cover } = useBookGeometry(backgroundMode)
  const [bookPhase, setBookPhase] = useState<BookPhase>("open")
  const [openPageIndex, setOpenPageIndex] = useState(0)
  const [hintSeen, setHintSeen] = useState(readHintSeen)
  const hintSeenRef = useRef(false)
  const flipBookRef = useRef<FlipBookRef>(null)
  const openPageIndexRef = useRef(0)
  const isTurningRef = useRef(false)
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

      // Aquí y no en el manejador del botón: en este punto ya se descartaron
      // el libro cerrado, el giro en curso y la página que no existe, así que
      // el sonido acompaña un giro que de verdad ocurre.
      pageTurn()

      if (direction === "next") {
        pageFlip.flipNext("bottom")
      } else {
        pageFlip.flipPrev("bottom")
      }

      scheduleTurnUnlock()
    },
    [bookPhase, closeBook, openBook, scheduleTurnUnlock]
  )

  useEffect(() => {
    if (bookPhase !== "opening") return

    const timer = window.setTimeout(() => {
      openPageIndexRef.current = 0
      setOpenPageIndex(0)
      setBookPhase("open")
      releaseTurnLock()
    }, OPENING_TIME)

    return () => window.clearTimeout(timer)
  }, [bookPhase, releaseTurnLock])

  useEffect(() => {
    if (bookPhase !== "closing") return

    const timer = window.setTimeout(() => {
      setBookPhase("closed")
      releaseTurnLock()
    }, CLOSING_TIME)

    return () => window.clearTimeout(timer)
  }, [bookPhase, releaseTurnLock])

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
      />

      <section
        className="relative z-10 mx-auto flex h-full max-w-[1380px] items-center justify-center"
        style={{ perspective: "1500px" }}
      >
        <AnimatePresence mode="wait">
          {bookPhase === "closed" ? (
            <ClosedBookView
              key="closed-view"
              onOpen={openBook}
              still={Boolean(prefersReducedMotion)}
              box={cover}
            />
          ) : null}

          {bookPhase === "opening" ? (
            <OpeningBookView key="opening-view" box={box} />
          ) : null}

          {bookPhase === "closing" ? (
            <ClosingBookView key="closing-view" box={box} />
          ) : null}

          {bookPhase === "open" ? (
            <motion.div
              key="open-book"
              className="relative"
              initial={
                backgroundMode
                  ? false
                  : isInitialLoadRef.current && !prefersReducedMotion
                  ? {
                      opacity: 0,
                      rotateX: 4,
                      rotateY: -7,
                      scale: 0.965,
                      y: 16,
                    }
                  : {
                      opacity: 0.96,
                      rotateX: 0,
                      rotateY: 0,
                      scale: 1,
                      y: -12,
                    }
              }
              animate={{
                opacity: 1,
                rotateX: 0,
                rotateY: 0,
                scale: 1,
                y: -12,
              }}
              onAnimationComplete={() => {
                isInitialLoadRef.current = false
              }}
              exit={{ opacity: 0, rotateY: 8, scale: 0.97 }}
              transition={
                isInitialLoadRef.current && !prefersReducedMotion
                  ? { duration: 1.05, ease: [0.16, 1, 0.3, 1] }
                  : { duration: 0.24, ease: [0.22, 1, 0.36, 1] }
              }
              style={{
                ...box,
                transformStyle: "preserve-3d",
                filter: onTable
                  ? "drop-shadow(0 26px 44px rgba(10,7,4,0.52)) drop-shadow(0 3px 8px rgba(10,7,4,0.4))"
                  : "drop-shadow(0 42px 76px rgba(24,20,16,0.28))",
              }}
            >
              {/* Sombra de contacto: es lo que asienta el libro sobre la
                  madera en vez de dejarlo flotando. */}
              {onTable ? (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-8 -bottom-3 -z-10 h-8 rounded-[50%] blur-xl"
                  style={{ background: "oklch(0.12 0.02 45 / 62%)" }}
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
            </motion.div>
          ) : null}
        </AnimatePresence>
      </section>
    </main>
  )
}
