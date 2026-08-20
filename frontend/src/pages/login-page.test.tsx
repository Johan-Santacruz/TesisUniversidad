import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, expect, it, vi } from "vitest"

import { AuthProvider } from "../auth/auth-context"
import LoginPage from "./login-page"


const DEMO_EMAIL = "camilobalanta1@gmail.com"
const DEMO_PASSWORD = "dios#12Admin"


function renderLogin() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/login"]}>
        <LoginPage />
      </MemoryRouter>
    </AuthProvider>,
  )
}


function anonymous() {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ detail: "Sin sesión" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    }),
  )
}


beforeEach(() => {
  vi.restoreAllMocks()
})


it("el atajo de pruebas llena correo y contraseña, y descubre la clave", async () => {
  anonymous()
  renderLogin()
  await screen.findByRole("heading", { name: /bienvenido de nuevo/i })

  fireEvent.click(
    screen.getByRole("button", { name: /probar administrador de prueba/i }),
  )

  expect(screen.getByLabelText("Correo institucional")).toHaveValue(DEMO_EMAIL)
  const password = screen.getByLabelText("Contraseña")
  expect(password).toHaveValue(DEMO_PASSWORD)
  // Con el campo en puntos, pulsar el atajo parecía no hacer nada.
  expect(password).toHaveAttribute("type", "text")
  expect(screen.getByRole("status")).toHaveTextContent(/credenciales cargadas/i)
})


it("envía las credenciales que el atajo dejó en el formulario", async () => {
  const fetchMock = anonymous()
  renderLogin()
  await screen.findByRole("heading", { name: /bienvenido de nuevo/i })

  fireEvent.click(
    screen.getByRole("button", { name: /probar administrador de prueba/i }),
  )
  fireEvent.click(screen.getByLabelText(/acepto los términos/i))
  fireEvent.click(screen.getByRole("button", { name: "Ingresar" }))

  // Lo que se llena en pantalla tiene que ser lo que viaja: los campos pasaron
  // a estar controlados por estado y dejaron de leerse con FormData.
  await waitFor(() => {
    const call = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/api/v1/auth/token"),
    )
    expect(call).toBeDefined()
    expect(String(call?.[1]?.body)).toBe(
      `username=${encodeURIComponent(DEMO_EMAIL)}&password=${encodeURIComponent(DEMO_PASSWORD)}`,
    )
  })
})


it("el atajo no envía el formulario por sí solo", async () => {
  const fetchMock = anonymous()
  renderLogin()
  await screen.findByRole("heading", { name: /bienvenido de nuevo/i })

  // El formulario queda válido a propósito: con un campo vacío el navegador
  // bloquea el envío y la prueba pasaría sin comprobar nada.
  fireEvent.change(screen.getByLabelText("Correo institucional"), {
    target: { value: "alguien@senda.local" },
  })
  fireEvent.change(screen.getByLabelText("Contraseña"), {
    target: { value: "Clave-Valida-2026!" },
  })
  fireEvent.click(screen.getByLabelText(/acepto los términos/i))

  fireEvent.click(
    screen.getByRole("button", { name: /probar administrador de prueba/i }),
  )

  // Un <button> sin type dentro de un form lo envía: pulsar el atajo iniciaría
  // sesión de una vez, en vez de dejar las credenciales listas para revisarlas.
  expect(
    fetchMock.mock.calls.some(([url]) =>
      String(url).endsWith("/api/v1/auth/token"),
    ),
  ).toBe(false)
})
