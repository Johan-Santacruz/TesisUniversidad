import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { expect, it, vi } from "vitest"

import { caseFixture } from "../../test/case-fixture"
import { RoutesComparison } from "./routes-comparison"
import { Timeline } from "./timeline"


it("renders every event on one continuous tricolor timeline", () => {
  render(
    <Timeline
      events={caseFixture.timeline}
      selectedId={null}
      onSelect={() => undefined}
    />,
  )

  expect(
    screen.getByRole("heading", { name: "Línea de tiempo" }),
  ).toBeVisible()
  expect(screen.getAllByRole("listitem")).toHaveLength(2)
  expect(screen.getByTestId("tricolor-rail")).toBeVisible()
})


it("marks route guidance preliminary while critical inconsistencies remain", () => {
  render(
    <RoutesComparison
      caseData={caseFixture}
      role="validador"
      onApprove={() => undefined}
    />,
  )

  expect(screen.getByText("Recomendación preliminar")).toBeVisible()
  expect(
    screen.getByRole("button", { name: /aprobar orientación final/i }),
  ).toBeDisabled()
  expect(screen.getAllByTestId("route-journey")).toHaveLength(3)
})


it("makes a missing institutional source visibly ungrounded", () => {
  const invalidCase = {
    ...caseFixture,
    routes: caseFixture.routes.map((route, index) =>
      index === 0
        ? {
            ...route,
            steps: route.steps.map((step) => ({
              ...step,
              claims: step.claims.map((claim) => ({
                ...claim,
                source_entry_id: "missing-source",
              })),
            })),
          }
        : route),
  }

  render(
    <RoutesComparison
      caseData={invalidCase}
      role="operador"
      onApprove={() => undefined}
    />,
  )

  expect(
    screen.getByText(/fuente no disponible.+requiere revisión/i),
  ).toBeVisible()
})


function approvableCase() {
  return {
    ...caseFixture,
    critical_inconsistencies: 0,
  }
}


function deferred() {
  let resolve!: () => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}


it("shows a rejected approval beside its action", async () => {
  const request = deferred()
  render(
    <RoutesComparison
      caseData={approvableCase()}
      role="validador"
      onApprove={() => request.promise}
    />,
  )
  const approve = screen.getByRole("button", {
    name: "Aprobar orientación final",
  })

  fireEvent.click(approve)
  request.reject(new Error("No se pudo aprobar la orientación"))

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "No se pudo aprobar la orientación",
  )
  expect(approve).toBeEnabled()
})


it("prevents duplicate approvals while the first request is pending", async () => {
  const request = deferred()
  const onApprove = vi.fn(() => request.promise)
  render(
    <RoutesComparison
      caseData={approvableCase()}
      role="validador"
      onApprove={onApprove}
    />,
  )
  const approve = screen.getByRole("button", {
    name: "Aprobar orientación final",
  })

  fireEvent.click(approve)
  fireEvent.click(approve)

  expect(onApprove).toHaveBeenCalledOnce()
  expect(approve).toBeDisabled()

  request.resolve()
  await waitFor(() => expect(approve).toBeEnabled())
})
