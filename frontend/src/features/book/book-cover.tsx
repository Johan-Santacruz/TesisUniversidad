import { motion, useMotionValue, useTransform } from "framer-motion"
import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react"
import "./book-cover.css"

export type BookPhase = "closed" | "opening" | "open" | "closing"

export const COVER_TRANSITION = {
  duration: 1.15,
  ease: [0.45, 0, 0.2, 1] as const,
}

export function BookCover({
  phase,
  single,
  still,
  readerRef,
  onOpen,
  onComplete,
}: {
  phase: BookPhase
  single: boolean
  still: boolean
  readerRef: RefObject<HTMLDivElement | null>
  onOpen: () => void
  onComplete: () => void
}) {
  const previewRef = useRef<HTMLDivElement>(null)
  const [bounds, setBounds] = useState<CSSProperties>({})
  const angle = useMotionValue(-180)
  const shadowOpacity = useTransform(angle, [-180, -90, 0], [0, 0.26, 0])
  const shadowScale = useTransform(angle, [-180, -90, 0], [0.08, 0.65, 1])
  const closed = phase === "closed"
  const opening = phase === "opening" || phase === "open"

  useLayoutEffect(() => {
    if (phase === "open") return
    const reader = readerRef.current
    const source = reader?.querySelector<HTMLElement>("[data-book-page-scroll]")?.parentElement
    if (!reader || !source) return

    // PageFlip aplica su propia proporción: en tablet la hoja puede ser
    // bastante más baja que la caja disponible. Medimos sin transforms para
    // que el desplazamiento de la escena no altere el eje ni las medidas.
    const measure = () => {
      let left = 0
      let top = 0
      let node: HTMLElement | null = source
      while (node && node !== reader) {
        left += node.offsetLeft
        top += node.offsetTop
        node = node.offsetParent as HTMLElement | null
      }
      const width = parseFloat(source.style.width) || source.offsetWidth
      const height = parseFloat(source.style.height) || source.offsetHeight
      if (!width || !height) return
      const next = { left: left + (single ? 0 : width), top, width, height, right: "auto", bottom: "auto" }
      setBounds((previous) => previous.left === next.left && previous.top === next.top && previous.width === width && previous.height === height ? previous : next)
    }
    measure()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(measure)
    observer.observe(source)
    observer.observe(reader)
    return () => observer.disconnect()
  }, [phase, readerRef, single])

  useLayoutEffect(() => {
    if (single || phase === "open" || phase === "closed") return
    const source = readerRef.current?.querySelector<HTMLElement>("[data-book-page-scroll]")
    const target = previewRef.current
    if (!source?.parentElement || !target) return

    // Una instantánea de la hoja real mantiene texto, imágenes y scroll en
    // el mismo sitio al levantar/apoyar la tapa, sin reiniciar sus reveals.
    // Sólo existe en la cara decorativa e inerte de la cubierta.
    const snapshot = source.parentElement.cloneNode(true) as HTMLElement
    snapshot.removeAttribute("style")
    snapshot.classList.remove("stf__item", "--left", "--right", "--hard", "--soft")
    snapshot.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"))
    target.replaceChildren(snapshot)
    const scroll = snapshot.querySelector<HTMLElement>("[data-book-page-scroll]")
    if (scroll) scroll.scrollTop = source.scrollTop
  }, [phase, readerRef, single])

  return (
    <>
    <motion.div
      className="book-cover-shadow"
      aria-hidden="true"
      style={{ ...bounds, opacity: shadowOpacity, scaleX: shadowScale, visibility: phase === "open" || closed ? "hidden" : "visible" }}
    />
    <motion.div
      className="book-cover-hinge"
      data-single={single}
      data-phase={phase}
      initial={false}
      animate={{ rotateY: opening ? -180 : 0 }}
      transition={still ? { duration: 0 } : COVER_TRANSITION}
      onAnimationComplete={onComplete}
      style={{ ...bounds, rotateY: angle, visibility: phase === "open" ? "hidden" : "visible" }}
    >
      <button
        type="button"
        className="book-cover-front group text-left text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-paper"
        onClick={onOpen}
        disabled={!closed}
        tabIndex={closed ? 0 : -1}
        aria-hidden={!closed}
        aria-label="Abrir libro"
      >
        <img
          src="/images/cover-andes.jpg"
          alt="Un camino entre montañas andinas cubiertas de niebla"
          className="absolute inset-0 h-full w-full object-cover object-[center_62%] sepia-[.18] contrast-[1.08]"
        />
        <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(180deg,rgba(17,27,24,.90)_0%,rgba(17,27,24,.65)_34%,rgba(17,27,24,.06)_57%,rgba(17,27,24,.32)_72%,rgba(17,27,24,.96)_100%)]" />
        <div aria-hidden="true" className="absolute inset-3 border border-paper/20 sm:inset-4" />
        <div className="relative z-10 flex h-full min-h-0 flex-col px-7 py-8 sm:px-10 sm:py-10 md:px-11 md:py-11 [@media(max-height:560px)]:px-7 [@media(max-height:560px)]:pt-16 [@media(max-height:560px)]:pb-5">
          <div className="flex items-center justify-between gap-3 border-b border-paper/25 pb-3 font-sans text-[11px] uppercase tracking-[0.12em] text-paper/80 [@media(max-height:560px)]:hidden">
            <span>Crónica visual</span>
            <span>Memoria · Derechos</span>
          </div>
          <div className="mt-5 sm:mt-7 [@media(max-height:560px)]:mt-0">
            <h2 className="font-serif text-[clamp(2.2rem,min(8.8vh,12vw),5.5rem)] leading-[0.96] tracking-[-0.035em] text-paper [@media(max-height:560px)]:text-[1.8rem]">
              <span className="mb-1 block text-[0.65em] font-normal">Los que</span>
              <span className="block font-normal">caminan</span>
              <span className="block font-normal italic text-[#e4c58b]">todavía.</span>
            </h2>
            <p className="mt-4 flex items-center gap-3 font-sans text-[11px] uppercase tracking-[0.12em] text-paper/80 [@media(max-height:560px)]:hidden">
              <span aria-hidden="true" className="h-px w-7 bg-[#e4c58b]" />
              Libro interactivo
            </p>
          </div>
          <div className="mt-auto pt-5 [@media(max-height:560px)]:pt-2">
            <p className="max-w-[25rem] font-serif text-[clamp(0.9rem,min(2.15vh,3.8vw),1.2rem)] leading-snug text-paper/90 text-pretty">
              Una lectura sobre desplazamiento, derechos y la posibilidad de volver a orientarse.
            </p>
            <p className="mt-4 flex items-center justify-between gap-3 border-t border-paper/30 pt-3 font-sans text-[11px] uppercase tracking-[0.12em] text-paper md:mt-5 md:pt-4 [@media(max-height:560px)]:mt-2 [@media(max-height:560px)]:pt-1">
              <span>Abrir el libro</span>
              <span aria-hidden="true" className="text-xl text-[#e4c58b]">→</span>
            </p>
          </div>
        </div>
        <div aria-hidden="true" className="book-cover-binding" />
        <motion.div
          aria-hidden="true"
          className="book-cover-light"
          initial={false}
          animate={{ opacity: opening ? 0.3 : 0 }}
          transition={still ? { duration: 0 } : COVER_TRANSITION}
        />
      </button>
      <div className="book-cover-back" aria-hidden="true" inert>
        {single ? <div className="book-cover-endpaper" /> : <div ref={previewRef} className="h-full w-full" />}
      </div>
      <div className="book-cover-edge" aria-hidden="true" />
    </motion.div>
    </>
  )
}
