import { useEffect, useRef } from "react"
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


/* Los grids de señales y rutas no son una cronología, así que el ritmo "set"
 * los entra casi a la vez para no insinuar una prioridad que no existe. Pero
 * en la pantalla en vivo cada tarjeta aparece cuando el análisis la acaba de
 * encontrar: aquí el escalonado no dice "esta importa más", dice "esta acaba
 * de llegar". Por eso sí se separan, a un paso corto. */
const ARRIVAL_STEP_SECONDS = 0.055

export type ArrivalRhythm = NarrativeRhythm | "arrival"


/* Los resultados en vivo no llegan de una vez: el servidor emite un evento
 * con doce fragmentos y más tarde otro con cuatro. Un contenedor con
 * staggerChildren sólo escalona su propia animación de entrada, así que el
 * primer lote cascadea y todos los siguientes aterrizan de una pieza —que es
 * justo lo que se veía plano—.
 *
 * El retardo se cuenta sobre la posición dentro del lote recién llegado, no
 * sobre el índice absoluto: el fragmento 40 de un testimonio largo no espera
 * tres segundos, y cada lote nuevo vuelve a entrar uno por uno.
 */
export function useBatchCascade(
  count: number,
  reduceMotion: boolean,
  rhythm: ArrivalRhythm = "arrival",
) {
  const rendered = useRef(0)
  // Se lee durante el render: en el render que estrena un lote todavía vale
  // el total anterior, que es exactamente dónde empieza lo nuevo.
  const alreadyIn = rendered.current

  useEffect(() => {
    rendered.current = count
  }, [count])

  return (index: number): number => {
    if (reduceMotion) return 0
    const step = rhythm === "sequence"
      ? SEQUENCE_STEP_SECONDS
      : rhythm === "set"
        ? SET_STEP_CAP_SECONDS
        : ARRIVAL_STEP_SECONDS
    return Math.min(
      Math.max(0, index - alreadyIn) * step,
      SEQUENCE_TOTAL_CAP_SECONDS,
    )
  }
}
