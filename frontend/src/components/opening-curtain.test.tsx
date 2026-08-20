import { render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"

import { OpeningCurtain } from "./opening-curtain"


describe("OpeningCurtain", () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  it("names the book before it opens and then withdraws", async () => {
    render(<OpeningCurtain holdMs={20} />)

    expect(screen.getByTestId("opening-curtain")).toBeInTheDocument()
    // Se retira sola: una portada que no se va deja de ser una entrada.
    await waitFor(() =>
      expect(screen.queryByTestId("opening-curtain")).toBeNull())
  })

  it("does not return on a second visit within the session", async () => {
    const first = render(<OpeningCurtain holdMs={20} />)
    await waitFor(() =>
      expect(screen.queryByTestId("opening-curtain")).toBeNull())
    first.unmount()

    render(<OpeningCurtain holdMs={20} />)

    expect(screen.queryByTestId("opening-curtain")).toBeNull()
  })
})
