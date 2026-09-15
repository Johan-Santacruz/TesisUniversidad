import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom"
import { beforeAll, expect, it } from "vitest"

import BookPage from "./book-page"


/* Este archivo corre sin "menos movimiento". Va aparte porque framer-motion
 * lee prefers-reduced-motion una sola vez por módulo: cambiarlo a mitad de
 * otro archivo ya no cambia nada. */
beforeAll(() => {
  const reduced = window.matchMedia
  window.matchMedia = (query: string) => ({ ...reduced(query), matches: false })
})


function WhereAmI() {
  return <p data-testid="ruta">{useLocation().pathname}</p>
}

function renderBook() {
  return render(
    <MemoryRouter>
      <WhereAmI />
      <Routes>
        <Route path="/" element={<BookPage />} />
        <Route path="/conversar" element={<p>Constructor de ruta</p>} />
      </Routes>
    </MemoryRouter>,
  )
}


/* Salir del libro hacia "Crear ruta" es cerrarlo: la tapa cae y sólo entonces
 * cambia la pantalla. Antes el libro desaparecía abierto, a media lectura. */
it("cierra el libro antes de ir a crear la ruta", async () => {
  const { container } = renderBook()

  fireEvent.click(screen.getByRole("link", { name: /crear ruta/i }))

  expect(container.querySelector("[data-book-phase='closing']")).not.toBeNull()
  expect(screen.getByTestId("ruta")).toHaveTextContent("/")
  await waitFor(
    () => expect(screen.getByTestId("ruta")).toHaveTextContent("/conversar"),
    { timeout: 4000 },
  )
})
