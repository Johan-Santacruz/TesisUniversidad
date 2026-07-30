import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
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


function deferred() {
  let resolve!: () => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}


function openUrgencyCorrection(onReview: () => Promise<void>) {
  render(
    <VerificationPanel
      facts={caseFixture.facts}
      role="validador"
      onReview={onReview}
    />,
  )
  const urgency = screen.getByText("Urgencia").closest("article")
  expect(urgency).not.toBeNull()
  const card = urgency as HTMLElement
  fireEvent.click(
    within(card).getByRole("button", { name: /necesito corregirlo/i }),
  )
  fireEvent.change(within(card).getByLabelText("Valor corregido"), {
    target: { value: "Urgencia alta corregida" },
  })
  fireEvent.change(within(card).getByLabelText("Razón de la corrección"), {
    target: { value: "Corrección humana conservada" },
  })
  return card
}


describe("VerificationPanel review errors", () => {
  it("shows a rejected review beside the action and retains form values", async () => {
    const request = deferred()
    const card = openUrgencyCorrection(() => request.promise)
    const submit = within(card).getByRole("button", {
      name: "Guardar corrección",
    })

    fireEvent.click(submit)
    request.reject(new Error("No se pudo guardar la revisión"))

    expect(await within(card).findByRole("alert")).toHaveTextContent(
      "No se pudo guardar la revisión",
    )
    expect(within(card).getByLabelText("Valor corregido")).toHaveValue(
      "Urgencia alta corregida",
    )
    expect(within(card).getByLabelText("Razón de la corrección")).toHaveValue(
      "Corrección humana conservada",
    )
    expect(submit).toBeEnabled()
  })

  it("prevents duplicate reviews while the first request is pending", async () => {
    const request = deferred()
    const onReview = vi.fn(() => request.promise)
    const card = openUrgencyCorrection(onReview)
    const form = within(card).getByLabelText("Valor corregido").closest("form")
    const submit = within(card).getByRole("button", {
      name: "Guardar corrección",
    })
    expect(form).not.toBeNull()

    fireEvent.submit(form as HTMLFormElement)
    fireEvent.submit(form as HTMLFormElement)

    expect(onReview).toHaveBeenCalledOnce()
    expect(submit).toBeDisabled()

    request.resolve()
    await waitFor(() => {
      expect(
        within(card).queryByLabelText("Valor corregido"),
      ).not.toBeInTheDocument()
    })
  })
})
