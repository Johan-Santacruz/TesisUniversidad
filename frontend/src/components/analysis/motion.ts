import type { Transition, Variants } from "framer-motion"


export const stageVariants: Variants = {
  enter: (direction: number) => ({
    opacity: 0,
    x: direction >= 0 ? 54 : -54,
    filter: "blur(10px)",
  }),
  center: { opacity: 1, x: 0, filter: "blur(0px)" },
  exit: (direction: number) => ({
    opacity: 0,
    x: direction >= 0 ? -38 : 38,
    filter: "blur(8px)",
  }),
}

export const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.08 } },
}

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 22, scale: 0.985 },
  visible: { opacity: 1, y: 0, scale: 1 },
}

export const NARRATIVE_STAGE_PHASE_SECONDS = 0.22
const NARRATIVE_CHILD_DURATION_SECONDS = 0.14


/* El movimiento dice algo sobre el contenido, no lo adorna.
 *
 *  - "sequence": los elementos cuentan una historia y su orden es el sentido.
 *    Entran uno tras otro, a un ritmo que se alcanza a leer, porque ver la
 *    secuencia formarse es ver la cronología del relato.
 *  - "set": los elementos son pares entre sí y pueden revisarse en cualquier
 *    orden. Entran casi a la vez: escalonarlos insinuaría una prioridad que
 *    no existe.
 */
export type NarrativeRhythm = "sequence" | "set"

const SEQUENCE_STEP_SECONDS = 0.085
// Techo para que un relato largo no obligue a esperar toda la cascada.
const SEQUENCE_TOTAL_CAP_SECONDS = 1.1
const SET_STEP_CAP_SECONDS = 0.03


export function narrativeChildTransition(
  reduceMotion: boolean,
  rhythm: NarrativeRhythm = "set",
): Transition {
  if (reduceMotion) return { duration: 0.01 }
  return {
    // Un momento del relato entra con algo más de recorrido que un dato suelto.
    duration: rhythm === "sequence" ? 0.34 : NARRATIVE_CHILD_DURATION_SECONDS,
    ease: [0.16, 1, 0.3, 1],
  }
}


export function narrativeStageStagger(
  itemCount: number,
  reduceMotion: boolean,
  rhythm: NarrativeRhythm = "set",
) {
  if (reduceMotion || itemCount <= 1) return 0
  if (rhythm === "set") {
    return Math.min(
      SET_STEP_CAP_SECONDS,
      (NARRATIVE_STAGE_PHASE_SECONDS - NARRATIVE_CHILD_DURATION_SECONDS)
        / (itemCount - 1),
    )
  }
  return Math.min(
    SEQUENCE_STEP_SECONDS,
    SEQUENCE_TOTAL_CAP_SECONDS / (itemCount - 1),
  )
}


export function motionTransition(reduceMotion: boolean): Transition {
  return reduceMotion
    ? { duration: 0.01 }
    : { duration: 0.52, ease: [0.16, 1, 0.3, 1] }
}

export function narrativeStageTransition(reduceMotion: boolean): Transition {
  return reduceMotion
    ? { duration: 0.01 }
    : {
        duration: NARRATIVE_STAGE_PHASE_SECONDS,
        ease: [0.16, 1, 0.3, 1],
      }
}
