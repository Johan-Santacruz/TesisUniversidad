import { render, screen } from "@testing-library/react"
import { expect, it } from "vitest"

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
