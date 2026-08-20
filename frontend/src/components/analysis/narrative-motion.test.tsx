import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { caseFixture } from "../../test/case-fixture"
import { ListeningStage } from "./listening-stage"
import { RoutesComparison } from "./routes-comparison"


vi.mock("framer-motion", async () => {
  const React = await import("react")

  function motionElement(tag: "article" | "button" | "div" | "img" | "li" | "ol") {
    return function MotionElement({
      children,
      animate: _animate,
      exit: _exit,
      initial: _initial,
      transition,
      variants,
      ...props
    }: {
      children?: React.ReactNode
      transition?: { duration?: number }
      variants?: {
        visible?: {
          transition?: {
            duration?: number
            staggerChildren?: number
          }
        }
      }
      [key: string]: unknown
    }) {
      const visibleTransition = variants?.visible?.transition
      const duration = transition?.duration ?? visibleTransition?.duration
      const stagger = visibleTransition?.staggerChildren

      return React.createElement(
        tag,
        {
          ...props,
          "data-motion-duration": duration,
          "data-motion-stagger": stagger,
        },
        children,
      )
    }
  }

  return {
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => children,
    motion: {
      article: motionElement("article"),
      button: motionElement("button"),
      div: motionElement("div"),
      img: motionElement("img"),
      li: motionElement("li"),
      ol: motionElement("ol"),
    },
    useReducedMotion: () => false,
  }
})


function entranceCompletion(
  container: HTMLElement,
  items: HTMLElement[],
) {
  const stagger = Number(container.dataset.motionStagger ?? 0)
  const duration = Math.max(
    ...items.map((item) => Number(item.dataset.motionDuration ?? 0)),
  )
  return ((items.length - 1) * stagger) + duration
}


describe("narrative child motion", () => {
  it("settles every listening fragment during the 220ms parent enter phase", () => {
    const segments = Array.from({ length: 9 }, (_, index) => ({
      ...caseFixture.segments[index % caseFixture.segments.length],
      id: `segment-${index}`,
    }))

    const { container } = render(
      <ListeningStage
        segments={segments}
        timeline={[]}
        facts={[]}
        playing={false}
        activeSegmentId={null}
        activeEventId={null}
        onSelect={vi.fn()}
        onSelectEvent={vi.fn()}
      />,
    )
    const list = container.querySelector(".listening-stage > ol")
    expect(list).not.toBeNull()
    const items = within(list as HTMLElement).getAllByRole("listitem")
    const completion = entranceCompletion(list as HTMLElement, items)

    expect(completion).toBeGreaterThan(0)
    expect(completion).toBeLessThanOrEqual(0.22)
  })

  it("lays the story moments out in a readable sequence", () => {
    const events = Array.from({ length: 8 }, (_, index) => ({
      ...caseFixture.timeline[index % caseFixture.timeline.length],
      id: `moment-${index}`,
      title: `Momento ${index}`,
    }))

    const { container } = render(
      <ListeningStage
        segments={caseFixture.segments}
        timeline={events}
        facts={[]}
        playing={false}
        activeSegmentId={null}
        activeEventId={null}
        onSelect={vi.fn()}
        onSelectEvent={vi.fn()}
      />,
    )
    const list = container.querySelector(".listening-stage > ol") as HTMLElement
    const stagger = Number(list.dataset.motionStagger)

    // Una cronología debe verse formarse: por debajo de ~40ms entre hitos el
    // ojo no distingue la secuencia y la animación deja de explicar nada.
    expect(stagger).toBeGreaterThanOrEqual(0.04)
    // Y sin obligar a esperar: la cascada completa se cierra dentro de 1.5s.
    expect(entranceCompletion(list, within(list).getAllByRole("listitem")))
      .toBeLessThanOrEqual(1.5)
  })

  it("settles every route card during the 220ms parent enter phase", () => {
    const { container } = render(
      <RoutesComparison
        caseData={caseFixture}
        role="operador"
        onApprove={vi.fn()}
      />,
    )
    const grid = container.querySelector(".route-grid")
    expect(grid).not.toBeNull()
    const cards = screen.getAllByTestId("route-journey")
    const completion = entranceCompletion(grid as HTMLElement, cards)

    expect(completion).toBeGreaterThan(0)
    expect(completion).toBeLessThanOrEqual(0.22)
  })
})
