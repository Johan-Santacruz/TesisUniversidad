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
          alt="Montañas andinas cubiertas de niebla"
          className="absolute inset-0 h-full w-full object-cover object-[center_44%] contrast-125 saturate-0 brightness-[0.82]"
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
            <p className="mb-3 font-sans text-[10px] uppercase text-paper/56 md:mb-4">Libro interactivo</p>
            <h2 className="font-serif text-[clamp(1.9rem,min(8vh,13vw),5rem)] leading-[0.88] text-paper">
              <span className="block italic font-normal">Los que</span>
              <span className="block">caminan</span>
              <span className="block italic font-normal text-paper/72">todavía.</span>
            </h2>
            <p className="mt-4 border-t border-paper/22 pt-4 font-serif text-[clamp(0.95rem,min(2.6vh,4.2vw),1.34rem)] leading-snug text-paper/82 text-pretty md:mt-5 md:pt-5">
              Una lectura sobre desplazamiento, derechos y la posibilidad de volver a orientarse.
            </p>
            <p className="mt-4 flex items-center gap-2.5 font-sans text-[10px] uppercase tracking-[0.14em] text-paper/58 transition-colors group-hover:text-paper/86 md:mt-6">
              <span aria-hidden="true" className="h-px w-7 bg-paper/45" />
              Abrir el libro
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
