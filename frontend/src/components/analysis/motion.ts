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


export function narrativeChildTransition(
  reduceMotion: boolean,
): Transition {
  return reduceMotion
    ? { duration: 0.01 }
    : {
        duration: NARRATIVE_CHILD_DURATION_SECONDS,
        ease: [0.16, 1, 0.3, 1],
      }
}


export function narrativeStageStagger(
  itemCount: number,
  reduceMotion: boolean,
) {
  if (reduceMotion || itemCount <= 1) return 0
  return (
    NARRATIVE_STAGE_PHASE_SECONDS - NARRATIVE_CHILD_DURATION_SECONDS
  ) / (itemCount - 1)
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
