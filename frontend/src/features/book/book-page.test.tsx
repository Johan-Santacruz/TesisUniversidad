import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { expect, it } from "vitest"

import BookPage from "./book-page"


function renderBook() {
  return render(
    <MemoryRouter>
      <BookPage />
    </MemoryRouter>,
  )
}


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
