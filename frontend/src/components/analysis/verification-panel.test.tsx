import { fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { caseFixture } from "../../test/case-fixture"
import { VerificationPanel } from "./verification-panel"


const motionTestState = vi.hoisted(() => ({ reduceMotion: false }))

vi.mock("framer-motion", async () => {
  const React = await import("react")

  function MotionDiv({
    children,
    initial,
    animate: _animate,
    exit: _exit,
    transition,
    ...props
  }: {
    children?: React.ReactNode
    initial?: unknown
    transition?: unknown
    [key: string]: unknown
  }) {
    const duration = transition
      && typeof transition === "object"
      && "duration" in transition
        ? String(transition.duration)
        : undefined

    return React.createElement(
      "div",
      {
        ...props,
        "data-motion-duration": duration,
        "data-motion-initial": initial === false ? "false" : "animated",
      },
      children,
    )
  }

  return {
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => children,
    motion: { div: MotionDiv },
    useReducedMotion: () => motionTestState.reduceMotion,
  }
})


describe("VerificationPanel motion", () => {
  beforeEach(() => {
    motionTestState.reduceMotion = false
  })

  it("opens the review form without interpolation for reduced motion", () => {
    motionTestState.reduceMotion = true
    render(
      <VerificationPanel
        facts={caseFixture.facts}
        role="validador"
        onReview={vi.fn()}
      />,
    )
    const urgency = screen.getByText("Urgencia").closest("article")
    expect(urgency).not.toBeNull()

    fireEvent.click(
      within(urgency as HTMLElement).getByRole("button", {
        name: /esto es correcto/i,
      }),
    )
    const reveal = within(urgency as HTMLElement)
      .getByLabelText("Valor confirmado")
      .closest(".fact-review-reveal")

    expect(reveal).toHaveAttribute("data-motion-initial", "false")
    expect(reveal).toHaveAttribute("data-motion-duration", "0.01")
  })
})
