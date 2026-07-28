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
import { Link } from "react-router-dom"
import {
  BOOK_PAGES,
  type FlipbookPageItem,
} from "../components/book/flipbook-pages"

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

function cx(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ")
}

function BookHeader({ currentPage }: { currentPage: FlipbookPageItem }) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 px-6 pt-6 md:px-10 md:pt-8">
      <div className="mx-auto flex max-w-[1380px] items-center justify-between gap-6">
        <div className="flex min-w-0 items-baseline gap-3" aria-live="polite">
          <span className="font-sans text-[10px] uppercase tracking-[0.14em] text-ink-faded">
            {currentPage.eyebrow}
          </span>
          <span aria-hidden="true" className="h-3 w-px bg-ink/20" />
          <span className="hidden truncate font-serif text-sm italic text-ink-soft md:inline">
            Los que caminan todavía
          </span>
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

function BookProgressRibbon({
  progressIndex,
  totalPages,
}: {
  progressIndex: number
  totalPages: number
}) {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 -top-8 z-40 flex items-center justify-center gap-4 md:-top-9"
      aria-hidden="true"
    >
      <div className="flex items-center gap-1.5">
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

function ClosedBookView({ onOpen }: { onOpen: () => void }) {
  return (
    <motion.div
      className="relative h-[min(81vh,860px)] w-[min(78vw,650px,calc(min(81vh,860px)*0.85))] min-w-[300px] md:w-[min(48vw,650px,calc(min(81vh,860px)*0.85))]"
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

        <div className="relative z-10 flex h-full min-h-0 flex-col p-7 md:p-9">
          <div className="flex items-center justify-between font-sans text-[10px] uppercase tracking-normal text-paper/62">
            <span>Crónica visual</span>
            <span>Derechos</span>
          </div>

          <div className="mt-auto max-w-[24rem]">
            <p className="mb-4 font-sans text-[10px] uppercase text-paper/56">
              Libro interactivo
            </p>
            <h2 className="font-serif text-[clamp(2.65rem,8vh,5rem)] leading-[0.88] text-paper">
              <span className="block italic font-normal">Los que</span>
              <span className="block">caminan</span>
              <span className="block italic font-normal text-paper/72">
                todavía.
              </span>
            </h2>
            <p className="mt-5 border-t border-paper/22 pt-5 font-serif text-[clamp(1.02rem,2.6vh,1.34rem)] leading-snug text-paper/82 text-pretty">
              Una lectura sobre desplazamiento, derechos y la posibilidad de
              volver a orientarse.
            </p>
          </div>
        </div>
      </motion.button>
    </motion.div>
  )
}

function OpeningBookView() {
  return (
    <motion.div
      key="opening-book"
      className="relative h-[min(81vh,860px)] w-[min(96vw,1320px,calc(min(81vh,860px)*1.7))]"
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
            <p className="mb-4 font-sans text-[10px] uppercase text-paper/56">
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
              <p className="mb-4 font-sans text-[10px] uppercase text-paper/56">
                Libro interactivo
              </p>
              <h2 className="font-serif text-[clamp(2.65rem,8vh,5rem)] leading-[0.88] text-paper">
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

function ClosingBookView() {
  return (
    <motion.div
      key="closing-book"
      className="relative h-[min(81vh,860px)] w-[min(96vw,1320px,calc(min(81vh,860px)*1.7))]"
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
              <p className="mb-4 font-sans text-[10px] uppercase text-paper/56">
                Libro interactivo
              </p>
              <h2 className="font-serif text-[clamp(2.65rem,8vh,5rem)] leading-[0.88] text-paper">
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

const FlipBookPage = forwardRef<HTMLDivElement, { page: FlipbookPageItem }>(
  ({ page }, ref) => {
    const Component = page.Component

    return (
      <div
        ref={ref}
        className="relative h-full w-full overflow-hidden rounded-md border border-rule bg-paper shadow-2xl"
        data-density={page.density ?? "soft"}
      >
        <div
          data-book-page-scroll
          className="relative h-full w-full overflow-x-hidden overflow-y-auto overscroll-contain bg-paper [scrollbar-gutter:stable] [&>section]:h-full [&>section]:min-h-full"
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
  }
)

FlipBookPage.displayName = "FlipBookPage"

export default function BookPage() {
  const prefersReducedMotion = useReducedMotion()
  const [bookPhase, setBookPhase] = useState<BookPhase>("open")
  const [openPageIndex, setOpenPageIndex] = useState(0)
  const flipBookRef = useRef<FlipBookRef>(null)
  const openPageIndexRef = useRef(0)
  const isTurningRef = useRef(false)
  const lastWheelAtRef = useRef(0)
  const turnUnlockTimerRef = useRef<number | null>(null)
  const isInitialLoadRef = useRef(true)

  const progressIndex = bookPhase === "closed" || bookPhase === "closing"
    ? 0
    : Math.min(openPageIndex + 1, BOOK_PAGES.length - 1)
  const currentPage = bookPhase === "closed" || bookPhase === "closing"
    ? BOOK_PAGES[0]
    : OPEN_BOOK_PAGES[openPageIndex] ?? OPEN_BOOK_PAGES[0]

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
    <main className="relative h-screen overflow-hidden bg-paper px-4 pb-6 pt-[6.25rem] text-ink md:px-8 md:pb-8 md:pt-[7.5rem]">
      <BookHeader currentPage={currentPage} />

      <section
        className="relative mx-auto flex h-full max-w-[1380px] -translate-y-7 items-center justify-center md:-translate-y-10"
        style={{ perspective: "1500px" }}
      >
        <AnimatePresence mode="wait">
          {bookPhase === "closed" ? (
            <ClosedBookView key="closed-view" onOpen={openBook} />
          ) : null}

          {bookPhase === "opening" ? (
            <OpeningBookView key="opening-view" />
          ) : null}

          {bookPhase === "closing" ? (
            <ClosingBookView key="closing-view" />
          ) : null}

          {bookPhase === "open" ? (
            <motion.div
              key="open-book"
              className="relative h-[min(81vh,860px)] w-[min(96vw,1320px,calc(min(81vh,860px)*1.7))]"
              initial={
                isInitialLoadRef.current && !prefersReducedMotion
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
                transformStyle: "preserve-3d",
                filter: "drop-shadow(0 42px 76px rgba(24,20,16,0.28))",
              }}
            >
              <BookProgressRibbon
                progressIndex={progressIndex}
                totalPages={BOOK_PAGES.length}
              />

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
              <div
                aria-hidden="true"
                className="absolute -left-3 bottom-5 top-5 w-4 rounded-l-sm"
                style={{
                  background:
                    "linear-gradient(90deg, rgba(24,20,16,0.26), rgba(24,20,16,0.08), transparent)",
                  transform: "translateZ(-6px)",
                  zIndex: 1,
                }}
              />

              <FlipBook
                ref={flipBookRef}
                className="relative z-10 mx-auto"
                style={{ transformStyle: "preserve-3d" }}
                width={590}
                height={780}
                size="stretch"
                minWidth={350}
                maxWidth={650}
                minHeight={520}
                maxHeight={880}
                startPage={0}
                drawShadow={true}
                flippingTime={FLIPPING_TIME}
                usePortrait={false}
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
                {OPEN_BOOK_PAGES.map((page) => (
                  <FlipBookPage key={page.id} page={page} />
                ))}
              </FlipBook>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </section>
    </main>
  )
}
