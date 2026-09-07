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


/* La causa real de que no se oyera nada: el contexto de audio nace suspendido
 * si la página todavía no recibió un gesto que el navegador reconozca, y girar
 * la página con el trackpad no es uno —Chrome no cuenta la rueda como
 * activación—. Programar el sonido sobre un reloj parado es no sonar nunca. */
describe("con el contexto suspendido", () => {
  function contextoFalso(estado: "running" | "suspended") {
    const dibujados: string[] = []
    const nodo = () => ({
      connect: (siguiente: unknown) => siguiente,
      start: () => dibujados.push("start"),
      stop: () => {},
      frequency: { value: 0, setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
      gain: { value: 0, setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
      Q: { value: 0 },
      type: "",
      buffer: null as unknown,
    })
    const ctx = {
      state: estado,
      currentTime: 0,
      sampleRate: 44100,
      destination: {},
      resume: vi.fn(async () => {
        ctx.state = "running"
      }),
      createBuffer: (_c: number, largo: number) => ({
        getChannelData: () => new Float32Array(largo),
      }),
      createBufferSource: nodo,
      createBiquadFilter: nodo,
      createGain: nodo,
      createOscillator: nodo,
    }
    return { ctx, dibujados }
  }

  it("reanuda el contexto antes de sonar, y entonces suena", async () => {
    const { ctx, dibujados } = contextoFalso("suspended")
    vi.stubGlobal("AudioContext", function () { return ctx })

    const { pageTurn } = await cargar()
    pageTurn()

    expect(ctx.resume).toHaveBeenCalled()
    await new Promise((listo) => setTimeout(listo, 0))
    expect(dibujados).toContain("start")
  })

  it("con el contexto ya corriendo suena sin reanudar nada", async () => {
    const { ctx, dibujados } = contextoFalso("running")
    vi.stubGlobal("AudioContext", function () { return ctx })

    const { pageTurn } = await cargar()
    pageTurn()

    expect(ctx.resume).not.toHaveBeenCalled()
    expect(dibujados).toContain("start")
  })
})
