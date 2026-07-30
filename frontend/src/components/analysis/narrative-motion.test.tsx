import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { caseFixture } from "../../test/case-fixture"
import { ListeningStage } from "./listening-stage"
import { RoutesComparison } from "./routes-comparison"
import { Timeline } from "./timeline"


vi.mock("framer-motion", async () => {
  const React = await import("react")

  function motionElement(tag: "article" | "button" | "div" | "li" | "ol") {
    return function MotionElement({
      children,
      animate: _animate,
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
    motion: {
      article: motionElement("article"),
      button: motionElement("button"),
      div: motionElement("div"),
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
        activeSegmentId={null}
        onSelect={vi.fn()}
      />,
    )
    const list = container.querySelector(".listening-stage > ol")
    expect(list).not.toBeNull()
    const items = within(list as HTMLElement).getAllByRole("listitem")
    const completion = entranceCompletion(list as HTMLElement, items)

    expect(completion).toBeGreaterThan(0)
    expect(completion).toBeLessThanOrEqual(0.22)
  })

  it("settles the complete timeline during the 220ms parent enter phase", () => {
    const events = Array.from({ length: 7 }, (_, index) => ({
      ...caseFixture.timeline[index % caseFixture.timeline.length],
      id: `event-${index}`,
      title: `Momento ${index}`,
    }))

    render(
      <Timeline events={events} selectedId={null} onSelect={vi.fn()} />,
    )
    const rail = screen.getByTestId("tricolor-rail")
    const list = screen.getByRole("list", {
      name: "Momentos vinculados al video",
    })
    const items = within(list).getAllByRole("listitem")
    const completion = entranceCompletion(list, items)

    expect(Number(rail.dataset.motionDuration)).toBeGreaterThan(0)
    expect(Number(rail.dataset.motionDuration)).toBeLessThanOrEqual(0.22)
    expect(completion).toBeGreaterThan(0)
    expect(completion).toBeLessThanOrEqual(0.22)
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
