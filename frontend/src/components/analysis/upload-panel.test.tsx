import {
  fireEvent,
  render,
  screen,
  waitForElementToBeRemoved,
} from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { UploadPanel, validateVideo } from "./upload-panel"


function fakeFile(name: string, type: string, sizeBytes: number) {
  const file = new File(["x"], name, { type })
  Object.defineProperty(file, "size", { value: sizeBytes })
  return file
}

const validVideo = () => fakeFile("testimonio.mp4", "video/mp4", 12 * 1024 * 1024)

function pick(file: File) {
  const input = screen.getByLabelText(
    "Archivo de video del testimonio",
  ) as HTMLInputElement
  Object.defineProperty(input, "files", { value: [file], configurable: true })
  fireEvent.change(input)
}

describe("validateVideo", () => {
  it("acepta un video dentro del límite", () => {
    expect(validateVideo(validVideo())).toBeNull()
  })

  it("rechaza lo que no es video", () => {
    expect(validateVideo(fakeFile("acta.pdf", "application/pdf", 2048)))
      .toMatch(/no es un video/i)
  })

  it("rechaza un video por encima de 500 MB", () => {
    expect(validateVideo(fakeFile("largo.mp4", "video/mp4", 620 * 1024 * 1024)))
      .toMatch(/máximo son 500 MB/i)
  })
})

describe("UploadPanel", () => {
  it("no deja analizar hasta que hay un archivo válido", async () => {
    render(<UploadPanel busy={false} onUpload={vi.fn()} onDemo={vi.fn()} />)

    expect(screen.queryByRole("button", { name: /analizar/i })).toBeNull()

    pick(validVideo())

    expect(
      await screen.findByRole("button", { name: "Analizar este testimonio" }),
    ).toBeEnabled()
    expect(screen.getByText("testimonio.mp4")).toBeVisible()
  })

  // Antes cualquier archivo soltado se enviaba y el rechazo llegaba del
  // servidor después de subirlo entero.
  it("explica el rechazo sin subir el archivo", () => {
    const onUpload = vi.fn()
    render(<UploadPanel busy={false} onUpload={onUpload} onDemo={vi.fn()} />)

    pick(fakeFile("acta.pdf", "application/pdf", 2048))

    expect(screen.getByRole("alert")).toHaveTextContent(/no es un video/i)
    expect(screen.queryByRole("button", { name: /analizar/i })).toBeNull()
    expect(onUpload).not.toHaveBeenCalled()
  })

  it("describe la zona de carga para lectores de pantalla", () => {
    render(<UploadPanel busy={false} onUpload={vi.fn()} onDemo={vi.fn()} />)

    const zone = screen.getByRole("button", {
      name: /arrastra aquí el testimonio/i,
    })
    const described = zone.getAttribute("aria-describedby")
    expect(described).toBeTruthy()
    expect(document.getElementById(described!.split(" ")[0]))
      .toHaveTextContent("MP4, WebM o MOV · hasta 500 MB")
  })

  it("permite quitar el archivo elegido", async () => {
    render(<UploadPanel busy={false} onUpload={vi.fn()} onDemo={vi.fn()} />)

    pick(validVideo())
    fireEvent.click(screen.getByRole("button", { name: "Quitar" }))

    // La ficha se desmonta al terminar su animación de salida.
    await waitForElementToBeRemoved(() => screen.queryByText("testimonio.mp4"))
    expect(screen.queryByRole("button", { name: /analizar/i })).toBeNull()
  })

  it("abre el caso de demostración sin exigir archivo", () => {
    const onDemo = vi.fn()
    render(<UploadPanel busy={false} onUpload={vi.fn()} onDemo={onDemo} />)

    fireEvent.click(
      screen.getByRole("button", { name: "Ver primero el caso de demostración" }),
    )

    expect(onDemo).toHaveBeenCalledTimes(1)
  })
})
