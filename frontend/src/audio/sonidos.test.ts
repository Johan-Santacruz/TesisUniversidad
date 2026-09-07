import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"


/* jsdom no trae Web Audio. Eso convierte a estas pruebas en la comprobación
 * que de verdad importa: que un sonido imposible no tumbe la página que lo
 * pidió. Pasar una hoja tiene que funcionar igual en un navegador sin audio,
 * con el almacenamiento bloqueado o con el sonido apagado. */

async function cargar() {
  vi.resetModules()
  return import("./sonidos")
}

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})


describe("sin Web Audio disponible", () => {
  it("pasar la página no lanza nada", async () => {
    const { pageTurn } = await cargar()

    expect(() => pageTurn()).not.toThrow()
  })

  it("el aviso de análisis terminado tampoco", async () => {
    const { analysisReady } = await cargar()

    expect(() => analysisReady()).not.toThrow()
  })
})


describe("la preferencia", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it("suena salvo que se haya apagado a propósito", async () => {
    const { sonidoHabilitado } = await cargar()

    expect(sonidoHabilitado()).toBe(true)
  })

  it("recuerda que se apagó", async () => {
    const { cambiarSonido, sonidoHabilitado } = await cargar()

    cambiarSonido(false)

    expect(sonidoHabilitado()).toBe(false)
    expect(window.localStorage.getItem("senda:sonido")).toBe("apagado")
  })

  it("un módulo recién cargado respeta lo que se guardó", async () => {
    window.localStorage.setItem("senda:sonido", "apagado")

    const { sonidoHabilitado } = await cargar()

    expect(sonidoHabilitado()).toBe(false)
  })

  it("sobrevive a un almacenamiento que lanza excepciones", async () => {
    const roto = {
      getItem: () => {
        throw new Error("modo privado")
      },
      setItem: () => {
        throw new Error("modo privado")
      },
    }
    vi.stubGlobal("localStorage", roto)

    const { cambiarSonido, sonidoHabilitado } = await cargar()

    expect(sonidoHabilitado()).toBe(true)
    expect(() => cambiarSonido(false)).not.toThrow()
  })
})
