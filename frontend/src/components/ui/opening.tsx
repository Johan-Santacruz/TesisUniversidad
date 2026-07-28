"use client"

import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useCallback, useEffect, useMemo, useState } from "react"

const EASE_EDITORIAL = [0.22, 1, 0.36, 1] as const

/**
 * Curved footpath that gets "walked" across the screen while the
 * title reveals. Drawn in ink with a traveling rojo marker.
 */
const PATH_D =
  "M -40 96 C 180 30, 340 150, 520 84 S 880 20, 1060 96 S 1320 150, 1500 70"

const TITLE_WORDS = ["Los", "que", "caminan", "todavía"]

type OpeningSequenceProps = {
  onFinished: () => void
}

export default function OpeningSequence({ onFinished }: OpeningSequenceProps) {
  const prefersReducedMotion = useReducedMotion()
  const [phase, setPhase] = useState<"playing" | "leaving">("playing")

  const finish = useCallback(() => {
    setPhase((current) => (current === "playing" ? "leaving" : current))
  }, [])

  // Notify as soon as the curtain starts lifting so the book's
  // entrance overlaps with the reveal instead of waiting for it.
  useEffect(() => {
    if (phase === "leaving") onFinished()
  }, [phase, onFinished])

  // Reduced motion: skip the ceremony entirely.
  useEffect(() => {
    if (prefersReducedMotion) onFinished()
  }, [prefersReducedMotion, onFinished])

  // Auto-advance after the full sequence has played.
  useEffect(() => {
    if (phase !== "playing") return
    const timer = window.setTimeout(finish, 5200)
    return () => window.clearTimeout(timer)
  }, [phase, finish])

  // Any key, click or touch skips ahead.
  useEffect(() => {
    if (phase !== "playing") return
    const skip = () => finish()
    window.addEventListener("keydown", skip)
    window.addEventListener("pointerdown", skip)
    return () => {
      window.removeEventListener("keydown", skip)
      window.removeEventListener("pointerdown", skip)
    }
  }, [phase, finish])

  const wordVariants = useMemo(
    () => ({
      hidden: { y: "110%" },
      visible: (index: number) => ({
        y: "0%",
        transition: {
          duration: 1.05,
          ease: EASE_EDITORIAL,
          delay: 0.55 + index * 0.16,
        },
      }),
    }),
    [],
  )

  if (prefersReducedMotion) return null

  return (
    <AnimatePresence>
      {phase === "playing" ? (
        <motion.div
          key="opening"
          className="fixed inset-0 z-[70] flex flex-col overflow-hidden bg-paper text-ink paper-grain"
          exit={{ y: "-100%" }}
          transition={{ duration: 1.05, ease: EASE_EDITORIAL }}
          aria-label="Apertura de la crónica. Toca o presiona una tecla para saltar."
          role="button"
          tabIndex={0}
        >
          {/* Top edition line */}
          <motion.header
            className="flex items-baseline justify-between px-5 pt-6 md:px-10 md:pt-8"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE_EDITORIAL, delay: 0.25 }}
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-faded md:text-xs">
              Crónica visual · Colombia
            </p>
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-faded md:text-xs">
              Edición única
            </p>
          </motion.header>

          {/* Oversized display title, bleeding past the right edge */}
          <div className="relative flex flex-1 flex-col justify-center">
            <h1 className="select-none pl-5 font-serif font-semibold leading-[0.86] tracking-tight md:pl-10">
              {TITLE_WORDS.map((word, index) => (
                <span
                  key={word}
                  className="block overflow-hidden text-[clamp(3.4rem,13.5vw,11.5rem)]"
                >
                  <motion.span
                    className="block will-change-transform"
                    custom={index}
                    variants={wordVariants}
                    initial="hidden"
                    animate="visible"
                  >
                    {word === "todavía" ? (
                      <em className="not-italic text-rojo">{word}</em>
                    ) : (
                      word
                    )}
                  </motion.span>
                </span>
              ))}
            </h1>

            {/* Right editorial column: issue number + vertical dateline */}
            <motion.aside
              aria-hidden="true"
              className="pointer-events-none absolute right-5 top-1/2 hidden -translate-y-1/2 select-none flex-col items-end gap-6 md:right-10 md:flex"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, ease: EASE_EDITORIAL, delay: 1.5 }}
            >
              <p className="font-serif text-[clamp(5rem,9vw,8.5rem)] font-semibold leading-none text-ink/10">
                N.º1
              </p>
              <p
                className="font-mono text-[10px] uppercase tracking-[0.34em] text-ink-faded"
                style={{ writingMode: "vertical-rl" }}
              >
                Ocho capítulos · Una ruta de derechos
              </p>
            </motion.aside>

            {/* The walked path */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-[6%] h-40 md:bottom-[10%]"
            >
              <svg
                className="h-full w-full"
                viewBox="0 0 1440 190"
                fill="none"
                preserveAspectRatio="xMidYMid slice"
              >
                <motion.path
                  d={PATH_D}
                  stroke="oklch(0.19 0.012 62 / 0.5)"
                  strokeWidth="2"
                  strokeDasharray="2 12"
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{
                    duration: 3.1,
                    ease: "easeInOut",
                    delay: 0.9,
                  }}
                />
              </svg>
              {/* Traveling marker: the one who still walks */}
              <motion.span
                className="absolute left-0 top-0 block h-2.5 w-2.5 rounded-full bg-rojo will-change-transform"
                style={{
                  offsetPath: `path("${PATH_D}")`,
                  offsetRotate: "0deg",
                }}
                initial={{ offsetDistance: "0%", opacity: 0 }}
                animate={{ offsetDistance: "100%", opacity: [0, 1, 1, 1] }}
                transition={{
                  duration: 3.1,
                  ease: "easeInOut",
                  delay: 0.9,
                }}
              />
            </div>
          </div>

          {/* Bottom: tricolor rule + deck + skip hint */}
          <footer className="px-5 pb-7 md:px-10 md:pb-9">
            <div
              aria-hidden="true"
              className="mb-5 flex h-[3px] w-full overflow-hidden"
            >
              <motion.span
                className="h-full w-1/2 bg-amarillo will-change-transform"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                style={{ transformOrigin: "left" }}
                transition={{ duration: 0.9, ease: EASE_EDITORIAL, delay: 1.4 }}
              />
              <motion.span
                className="h-full w-1/4 bg-azul will-change-transform"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                style={{ transformOrigin: "left" }}
                transition={{ duration: 0.7, ease: EASE_EDITORIAL, delay: 2.1 }}
              />
              <motion.span
                className="h-full w-1/4 bg-rojo will-change-transform"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                style={{ transformOrigin: "left" }}
                transition={{ duration: 0.7, ease: EASE_EDITORIAL, delay: 2.7 }}
              />
            </div>

            <div className="flex flex-wrap items-end justify-between gap-4">
              <motion.p
                className="max-w-md text-pretty font-sans text-sm leading-relaxed text-ink-soft md:text-base"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: EASE_EDITORIAL, delay: 1.7 }}
              >
                Una crónica sobre el desplazamiento en Colombia y las personas
                que, a pesar de todo, siguen caminando.
              </motion.p>

              <motion.p
                className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-faded md:text-xs"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 1, 0.45, 1] }}
                transition={{ duration: 2.4, delay: 2.4, ease: "easeInOut" }}
              >
                Toca para abrir la crónica
              </motion.p>
            </div>
          </footer>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
