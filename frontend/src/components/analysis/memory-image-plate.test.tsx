import { render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { MemoryImagePlate } from "./memory-image-plate"


const ALT = "Imagen representativa del cierre de memoria del caso"

describe("MemoryImagePlate", () => {
  it("announces the closing image and then settles on its own", async () => {
    render(
      <MemoryImagePlate imageSource="blob:cierre" revealKey="img-1:1" revealMs={40} />,
    )

    // Se anuncia sin que nadie la pida, al terminar el analisis.
    expect(await screen.findByRole("dialog", { name: ALT })).toBeInTheDocument()
    // Y baja sola: nadie tiene que cerrarla para seguir trabajando.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })

  it("waits for the image instead of flashing an empty plate", () => {
    render(<MemoryImagePlate imageSource={null} revealKey="img-1:1" />)

    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("does not interrupt twice for the same generation", async () => {
    const view = render(
      <MemoryImagePlate imageSource="blob:cierre" revealKey="img-1:1" revealMs={30} />,
    )
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())

    view.rerender(
      <MemoryImagePlate imageSource="blob:cierre" revealKey="img-1:1" revealMs={30} />,
    )

    expect(screen.queryByRole("dialog")).toBeNull()
  })
})
