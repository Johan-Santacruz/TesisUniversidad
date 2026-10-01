import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { MemoryImagePlate } from "./memory-image-plate"

const ALT = "Imagen representativa del cierre de memoria del caso"

describe("MemoryImagePlate", () => {
  it("arrives at the side without opening a dialog or taking focus", () => {
    const changed = vi.fn()
    render(<MemoryImagePlate imageSource="blob:cierre" revealKey="img-1:1" onOpenChange={changed} />)
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(screen.getByRole("button", { name: `${ALT}. Ver en grande.` })).toBeInTheDocument()
    expect(changed).not.toHaveBeenCalledWith(true)
  })

  it("waits for the image", () => {
    render(<MemoryImagePlate imageSource={null} revealKey="img-1:1" />)
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("can be hidden and restored without opening the large view", () => {
    const view = render(<MemoryImagePlate imageSource="blob:cierre" revealKey="img-1:1" />)
    fireEvent.click(screen.getByRole("button", { name: "Ocultar cierre de memoria" }))
    expect(screen.queryByRole("button", { name: `${ALT}. Ver en grande.` })).toBeNull()
    view.rerender(<MemoryImagePlate imageSource="blob:otra" revealKey="img-1:2" />)
    expect(screen.queryByRole("dialog")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Mostrar cierre de memoria" }))
    expect(screen.getByRole("button", { name: `${ALT}. Ver en grande.` })).toBeInTheDocument()
  })

  it("opens only on request and Escape returns focus to the thumbnail", async () => {
    render(<MemoryImagePlate imageSource="blob:cierre" revealKey="img-1:1" />)
    const thumbnail = screen.getByRole("button", { name: `${ALT}. Ver en grande.` })
    fireEvent.click(thumbnail)
    expect(screen.getByRole("dialog", { name: ALT })).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole("button", { name: "Cerrar imagen" }), { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(thumbnail).toHaveFocus()
  })

  it("moves with the keyboard and remains within the right side", () => {
    render(<MemoryImagePlate imageSource="blob:cierre" revealKey="img-1:1" />)
    const handle = screen.getByRole("button", { name: /Mover cierre de memoria/ })
    const card = screen.getByRole("region", { name: "Cierre de memoria flotante" })
    const initial = parseFloat(card.style.top)
    fireEvent.keyDown(handle, { key: "ArrowUp" })
    expect(parseFloat(card.style.top)).toBe(initial - 16)
    for (let i = 0; i < 100; i++) fireEvent.keyDown(handle, { key: "ArrowRight" })
    expect(parseFloat(card.style.left)).toBeLessThan(window.innerWidth)
    expect(parseFloat(card.style.left)).toBeGreaterThanOrEqual(window.innerWidth / 2)
    for (let i = 0; i < 100; i++) fireEvent.keyDown(handle, { key: "ArrowLeft" })
    expect(parseFloat(card.style.left)).toBe(window.innerWidth / 2 + 12)
  })
})
