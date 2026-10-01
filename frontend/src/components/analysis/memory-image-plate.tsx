import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react"
import { createPortal } from "react-dom"
import { motion, useReducedMotion } from "framer-motion"
import { MEMORY_IMAGE_ALT, MEMORY_IMAGE_DISCLOSURE } from "./memory-image-panel"

type Position = { x: number; y: number }

// The floating card stays outside transformed ancestors and never opens itself.
export function MemoryImagePlate({ imageSource, revealKey, onOpenChange }: {
  imageSource: string | null
  revealKey: string | null
  onOpenChange?: (open: boolean) => void
}) {
  const reduceMotion = useReducedMotion() ?? false
  const [open, setOpen] = useState(false)
  // En un teléfono empieza guardada en la pestaña del borde: abierta de entrada tapaba el texto del caso.
  const [hidden, setHidden] = useState(() => window.innerWidth <= 600)
  const [position, setPosition] = useState<Position>(() => ({ x: window.innerWidth, y: Math.max(88, window.innerHeight - 270) }))
  const cardRef = useRef<HTMLDivElement>(null)
  const thumbnailRef = useRef<HTMLButtonElement>(null)
  const restoreRef = useRef<HTMLButtonElement>(null)
  const hideRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const dragRef = useRef<{ id: number; x: number; y: number; origin: Position } | null>(null)
  const [dragging, setDragging] = useState(false)

  const constrain = useCallback((next: Position): Position => {
    const width = cardRef.current?.offsetWidth || 180
    const height = cardRef.current?.offsetHeight || 150
    const maxX = Math.max(12, window.innerWidth - width - 12)
    const minX = Math.min(maxX, window.innerWidth / 2 + 12)
    // Se detiene por encima del pie de la hoja: más abajo tapaba el botón que continúa el recorrido.
    const maxY = Math.max(12, window.innerHeight - height - 116)
    const minY = Math.min(88, maxY)
    return { x: Math.max(minX, Math.min(next.x, maxX)), y: Math.max(minY, Math.min(next.y, maxY)) }
  }, [])

  useLayoutEffect(() => {
    const resize = () => setPosition(previous => constrain(previous))
    resize()
    window.addEventListener("resize", resize)
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize)
    if (cardRef.current) observer?.observe(cardRef.current)
    return () => { window.removeEventListener("resize", resize); observer?.disconnect() }
  }, [constrain, hidden, imageSource])

  useEffect(() => { setOpen(false) }, [revealKey, imageSource])
  useEffect(() => { onOpenChange?.(open && Boolean(imageSource)) }, [open, imageSource, onOpenChange])

  useEffect(() => {
    if (!open || !imageSource) return
    closeRef.current?.focus()
    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = overflow
      thumbnailRef.current?.focus()
    }
  }, [open, imageSource])

  const finishDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.id !== event.pointerId) return
    dragRef.current = null
    setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  if (!imageSource) return null

  return createPortal(<>
    <div inert={open} aria-hidden={open || undefined}>
        <motion.button ref={restoreRef} type="button" className="memory-image-tab"
          style={{ top: position.y, pointerEvents: hidden ? "auto" : "none" }}
          aria-hidden={!hidden} inert={!hidden} aria-label="Mostrar cierre de memoria"
          initial={false}
          animate={{ opacity: hidden ? 1 : 0, x: hidden ? 0 : 32, scale: hidden ? 1 : 0.94 }}
          transition={{ duration: reduceMotion ? 0 : 0.28, delay: hidden && !reduceMotion ? 0.12 : 0 }}
          whileHover={reduceMotion ? undefined : { x: -4 }}
          whileTap={reduceMotion ? undefined : { scale: 0.96 }}
          onClick={() => { setHidden(false); requestAnimationFrame(() => hideRef.current?.focus()) }}>
          <span aria-hidden="true">‹</span><span>Memoria</span>
        </motion.button>
        <motion.div ref={cardRef} className="memory-image-dock" role="region"
          aria-label="Cierre de memoria flotante" data-dragging={dragging}
          aria-hidden={hidden} inert={hidden}
          style={{ left: position.x, top: position.y, pointerEvents: hidden ? "none" : "auto", transformOrigin: "right center" }}
          initial={reduceMotion ? false : { opacity: 0, x: 40, y: 12, scale: 0.94 }}
          animate={{ opacity: hidden ? 0 : 1, x: hidden ? window.innerWidth - position.x + 16 : 0,
            y: 0, scale: hidden ? 0.84 : dragging ? 1.018 : 1, rotate: dragging && !reduceMotion ? -1 : 0 }}
          transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 29, mass: 0.8 }}>
          <div className="memory-image-dock-tools">
            <button type="button" className="memory-image-drag"
              aria-label="Mover cierre de memoria. Arrastra o usa las flechas del teclado."
              onPointerDown={event => {
                if (event.button !== 0 || !event.isPrimary) return
                event.currentTarget.setPointerCapture(event.pointerId)
                dragRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, origin: position }
                setDragging(true)
              }}
              onPointerMove={event => {
                const drag = dragRef.current
                if (!drag || drag.id !== event.pointerId) return
                setPosition(constrain({ x: drag.origin.x + event.clientX - drag.x, y: drag.origin.y + event.clientY - drag.y }))
              }}
              onPointerUp={finishDrag} onPointerCancel={finishDrag}
              onLostPointerCapture={() => { dragRef.current = null; setDragging(false) }}
              onKeyDown={event => {
                const steps: Record<string, Position> = { ArrowLeft: { x: -16, y: 0 }, ArrowRight: { x: 16, y: 0 }, ArrowUp: { x: 0, y: -16 }, ArrowDown: { x: 0, y: 16 } }
                const step = steps[event.key]
                if (!step) return
                event.preventDefault()
                setPosition(previous => constrain({ x: previous.x + step.x, y: previous.y + step.y }))
              }}><span className="memory-image-grip" aria-hidden="true" /><span>Cierre de memoria</span></button>
            <button ref={hideRef} type="button" className="memory-image-hide" aria-label="Ocultar cierre de memoria"
              onClick={() => { setHidden(true); requestAnimationFrame(() => restoreRef.current?.focus()) }}>−</button>
          </div>
          <button ref={thumbnailRef} type="button" className="memory-image-preview"
            aria-label={`${MEMORY_IMAGE_ALT}. Ver en grande.`} onClick={() => setOpen(true)}>
            <img src={imageSource} alt="" draggable={false} />
            <span aria-hidden="true">↗</span>
          </button>
        </motion.div>
    </div>
    {open ? (
      <motion.div className="memory-image-plate" role="dialog" aria-modal="true" aria-label={MEMORY_IMAGE_ALT}
        initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .2 }}
        onClick={() => setOpen(false)}
        onKeyDown={event => {
          if (event.key === "Escape") { event.preventDefault(); setOpen(false) }
          // Only the close button is interactive inside this dialog.
          if (event.key === "Tab") { event.preventDefault(); closeRef.current?.focus() }
        }}>
        <button ref={closeRef} type="button" className="memory-image-close" onClick={() => setOpen(false)}>Cerrar imagen</button>
        <img alt="" src={imageSource} onClick={event => event.stopPropagation()} />
        <p className="memory-image-plate-caption" onClick={event => event.stopPropagation()}>{MEMORY_IMAGE_DISCLOSURE}</p>
      </motion.div>
    ) : null}
  </>, document.body)
}
