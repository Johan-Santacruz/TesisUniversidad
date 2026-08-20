import { render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AuthProvider, useAuth } from "./auth-context"


function Probe() {
  const { status, user } = useAuth()
  return <p>{status === "loading" ? "Cargando" : user?.email ?? "Invitado"}</p>
}


describe("AuthProvider", () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it("renews through the HttpOnly cookie without persisting the access token", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "memory-only-token",
          token_type: "bearer",
          expires_in: 900,
          user: {
            id: "admin-1",
            email: "admin@senda.local",
            role: "admin",
            is_active: true,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    )

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    expect(await screen.findByText("admin@senda.local")).toBeVisible()
    expect(localStorage.getItem("access_token")).toBeNull()
    expect(sessionStorage.getItem("access_token")).toBeNull()
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/v1\/auth\/refresh$/),
        expect.objectContaining({ credentials: "include", method: "POST" }),
      ),
    )
  })

  it("settles as anonymous when no refresh session exists", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ detail: "Sesión inválida" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    )

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    expect(await screen.findByText("Invitado")).toBeVisible()
  })
})
