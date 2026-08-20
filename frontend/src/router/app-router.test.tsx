import { fireEvent, render, screen } from "@testing-library/react"
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


it("renders twelve distinct forced-displacement scenes without cross-column repetition", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ detail: "Sin sesión" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    }),
  )

  const { container } = renderAt("/login")

  await screen.findByRole("heading", { name: /bienvenido de nuevo/i })
  const sources = Array.from(
    container.querySelectorAll<HTMLImageElement>(".login-mosaic img"),
  ).map((image) => image.getAttribute("src") ?? "")
  const sourceCounts = sources.reduce((counts, source) => {
    counts.set(source, (counts.get(source) ?? 0) + 1)
    return counts
  }, new Map<string, number>())

  expect(new Set(sources)).toEqual(new Set([
    "/images/mosaic-desplazamiento/01-salida-forzada-v3.jpg",
    "/images/mosaic-desplazamiento/02-hogar-y-memoria-v3.jpg",
    "/images/mosaic-desplazamiento/03-recepcion-segura-v3.jpg",
    "/images/mosaic-desplazamiento/04-testimonio-protegido-v3.jpg",
    "/images/mosaic-desplazamiento/05-analisis-senda-v3.jpg",
    "/images/mosaic-desplazamiento/06-validacion-humana-v3.jpg",
    "/images/mosaic-desplazamiento/07-ruta-institucional-v3.jpg",
    "/images/mosaic-desplazamiento/08-terminal-intermunicipal-v3.jpg",
    "/images/mosaic-desplazamiento/09-alojamiento-temporal-v3.jpg",
    "/images/mosaic-desplazamiento/10-registro-confidencial-v3.jpg",
    "/images/mosaic-desplazamiento/11-transcripcion-anonima-v3.jpg",
    "/images/mosaic-desplazamiento/12-coordinacion-institucional-v3.jpg",
  ]))
  expect(sources).toHaveLength(24)
  expect(Array.from(sourceCounts.values())).toEqual(
    Array.from({ length: 12 }, () => 2),
  )
})


it("returns to the book from the login screen", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ detail: "Sin sesión" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    }),
  )

  renderAt("/login")

  fireEvent.click(
    await screen.findByRole("button", { name: /volver al inicio/i }),
  )

  expect(
    screen.queryByRole("heading", { name: /bienvenido de nuevo/i }),
  ).not.toBeInTheDocument()
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
          email: "operador@senda.local",
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
