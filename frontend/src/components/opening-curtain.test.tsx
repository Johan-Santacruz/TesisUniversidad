import { render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"

import { OpeningCurtain, useOpeningCurtain } from "./opening-curtain"


/* La cortina se compone en dos piezas —el estado y la lámina— para que el
 * libro, debajo, sepa cuándo entrar. Aquí se prueban juntas, como en la ruta. */
function Curtain({ holdMs }: { holdMs: number }) {
  const open = useOpeningCurtain(holdMs)
  return (
    <>
      <p data-testid="book-arrival">{open ? "held" : "now"}</p>
      <OpeningCurtain open={open} />
    </>
  )
}


describe("OpeningCurtain", () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  it("names the book before it opens and then withdraws", async () => {
    render(<Curtain holdMs={20} />)

    expect(screen.getByTestId("opening-curtain")).toBeInTheDocument()
    // Se retira sola: una portada que no se va deja de ser una entrada.
    await waitFor(() =>
      expect(screen.queryByTestId("opening-curtain")).toBeNull())
  })

  // El libro esperaba a oscuras y hacía su entrada sin que nadie la viera.
  // Ahora la cortina avisa: primero "held", y "now" en el instante en que se
  // levanta, para que el libro llegue a la mesa a la vista.
  it("holds the book while it is up and releases it as it lifts", async () => {
    render(<Curtain holdMs={20} />)

    expect(screen.getByTestId("book-arrival")).toHaveTextContent("held")

    await waitFor(() =>
      expect(screen.getByTestId("book-arrival")).toHaveTextContent("now"))
  })

  it("does not return on a second visit within the session", async () => {
    const first = render(<Curtain holdMs={20} />)
    await waitFor(() =>
      expect(screen.queryByTestId("opening-curtain")).toBeNull())
    first.unmount()

    render(<Curtain holdMs={20} />)

    expect(screen.queryByTestId("opening-curtain")).toBeNull()
    // Sin cortina no hay a qué esperar: el libro entra de una vez.
    expect(screen.getByTestId("book-arrival")).toHaveTextContent("now")
  })
})
