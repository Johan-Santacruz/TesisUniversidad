import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, expect, it, vi } from "vitest"

import { AuthProvider } from "../auth/auth-context"
import { AppRoutes } from "./app-router"


function renderAt(path: string) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>,
  )
}


beforeEach(() => {
  vi.restoreAllMocks()
})


it("redirects unauthenticated visitors to login", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ detail: "Sin sesión" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    }),
  )

  renderAt("/subir-video")

  expect(
    await screen.findByRole("heading", { name: /bienvenido de nuevo/i }),
  ).toBeVisible()
})


it("redirects the legacy conversar URL to the authenticated workspace", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        access_token: "token",
        token_type: "bearer",
        expires_in: 900,
        user: {
          id: "operator-1",
          email: "operador@siad.local",
          role: "operador",
          is_active: true,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  )

  renderAt("/conversar")

  expect(await screen.findByTestId("video-analysis-workspace")).toBeVisible()
})
