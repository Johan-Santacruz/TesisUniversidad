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

export function motionTransition(reduceMotion: boolean): Transition {
  return reduceMotion
    ? { duration: 0.01 }
    : { duration: 0.52, ease: [0.16, 1, 0.3, 1] }
}
