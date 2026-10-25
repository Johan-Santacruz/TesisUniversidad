import { describe, expect, it } from "vitest"

import type { components } from "../../api/generated"
import { caseProgress, caseStatusLabel, caseTitle } from "./case-labels"


type CaseSummary = components["schemas"]["CaseSummaryRead"]

const base: CaseSummary = {
  id: "case",
  reference: "CASE0001",
  created_at: "2026-10-24T15:45:00Z",
  status: "in_review",
  recommendation_status: "preliminary",
  routes_status: "initial",
  approved_at: null,
  is_demo: false,
  video_status: "uploaded",
  category: "Desplazamiento",
  subcategory: "Desplazamiento forzado",
  signals_total: 4,
  critical_pending: 0,
}


describe("case labels", () => {
  it.each([
    [{ critical_pending: 1 }, "4 señales · 1 crítica sin confirmar"],
    [{ critical_pending: 2 }, "4 señales · 2 críticas sin confirmar"],
    [{ status: "approved" as const }, "4 señales · orientación aprobada"],
    [{ routes_status: "rebuilding" }, "4 señales · ajustando la ruta"],
    [{ routes_status: "rebuild_failed" }, "4 señales · falta ajustar la ruta"],
    [{}, "4 señales · orientación por aprobar"],
    [{ signals_total: 1 }, "1 señal · orientación por aprobar"],
  ])("summarises %o as %s", (overrides, expected) => {
    expect(caseProgress({ ...base, ...overrides })).toBe(expected)
  })

  it("titles a case by its category, never by the uncalibrated subcategory", () => {
    expect(caseTitle(base)).toBe("Desplazamiento")
    expect(caseTitle({ ...base, category: null })).toBe("Caso sin clasificar")
  })

  it("names the two states a saved case can be in", () => {
    expect(caseStatusLabel(base)).toBe("En revisión")
    expect(caseStatusLabel({ status: "approved" })).toBe("Aprobado")
  })
})
