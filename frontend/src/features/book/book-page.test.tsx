import { fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom"
import { expect, it } from "vitest"

import BookPage from "./book-page"


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
 * cambia la pantalla (book-depart.test.tsx). Quien pidió menos movimiento —que
 * es como corre este archivo— se va directo. */
it("con menos movimiento, «Crear ruta» se va directo", () => {
  renderBook()

  fireEvent.click(screen.getByRole("link", { name: /crear ruta/i }))

  expect(screen.getByTestId("ruta")).toHaveTextContent("/conversar")
})


/* El libro se pasaba de tres maneras y ninguna existe en un teléfono: la rueda
 * horizontal del trackpad, las flechas del teclado y arrastrar la esquina. Ese
 * arrastre, además, hacia atrás compite con el gesto de "volver" del propio
 * navegador. El resultado era un libro que se podía avanzar pero no devolver.
 * Estas dos pruebas cuidan el único camino que funciona en todas partes. */

it("ofrece un control visible para devolver de página", () => {
  renderBook()

  const anterior = screen.getByRole("button", { name: "Página anterior" })

  expect(anterior).toBeInTheDocument()
})

it("ofrece un control visible para avanzar de página", () => {
  renderBook()

  const siguiente = screen.getByRole("button", { name: "Página siguiente" })

  expect(siguiente).toBeInTheDocument()
})


it("deja apagar el sonido del papel desde el propio libro", () => {
  renderBook()

  const interruptor = screen.getByRole("button", {
    name: "Silenciar el paso de página",
  })
  expect(interruptor).toHaveAttribute("aria-pressed", "true")

  fireEvent.click(interruptor)

  expect(
    screen.getByRole("button", { name: "Activar el sonido del papel" }),
  ).toHaveAttribute("aria-pressed", "false")
})

it("conserva las páginas montadas al cerrar y volver a abrir la cubierta", async () => {
  const { container } = renderBook()
  const originalPage = container.querySelector("[data-book-page-scroll]")
  expect(originalPage).not.toBeNull()

  fireEvent.click(screen.getByRole("button", { name: "Página anterior" }))
  const cover = await screen.findByRole("button", { name: "Abrir libro" })
  expect(originalPage).toBeInTheDocument()

  fireEvent.click(cover)
  expect(container.querySelector("[data-book-page-scroll]")).toBe(originalPage)
  expect(screen.getByRole("button", { name: "Página siguiente" })).toBeEnabled()
})
