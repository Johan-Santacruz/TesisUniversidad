import "@testing-library/jest-dom/vitest"
import { cleanup, configure } from "@testing-library/react"
import { MotionGlobalConfig } from "framer-motion"
import { afterEach } from "vitest"


// Las animaciones del espacio de trabajo se resuelven contra el reloj real, y
// bajo carga tardan mas que cualquier espera razonable: la suite perdia una o
// dos pruebas por corrida sin que nada estuviera roto. Saltarlas deja el estado
// final de inmediato, que es lo unico que las pruebas afirman.
MotionGlobalConfig.skipAnimations = true


// El espacio de trabajo entra con animaciones de framer-motion, y `findBy*`
// espera 1 s por defecto. Con la maquina cargada —varios archivos de prueba en
// paralelo— esas transiciones tardan mas y las pruebas fallaban con "element is
// not visible" sin que nada estuviera roto. Cinco segundos no ralentizan nada:
// solo se agotan cuando algo de verdad no aparece.
configure({ asyncUtilTimeout: 5000 })

afterEach(cleanup)


function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key)
    },
    setItem: (key, value) => {
      values.set(key, value)
    },
  }
}

Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: memoryStorage(),
})
Object.defineProperty(window, "sessionStorage", {
  configurable: true,
  value: memoryStorage(),
})

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
})

// jsdom no implementa el desplazamiento: las etapas lo usan para seguir el
// fragmento activo mientras corre el testimonio.
Object.defineProperty(Element.prototype, "scrollIntoView", {
  configurable: true,
  writable: true,
  value: () => undefined,
})

class IntersectionObserverMock implements IntersectionObserver {
  readonly root = null
  readonly rootMargin = "0px"
  readonly thresholds = [0]

  constructor(
    _callback: IntersectionObserverCallback,
    _options?: IntersectionObserverInit,
  ) {}

  disconnect() {}
  observe(_target: Element) {}
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
  unobserve(_target: Element) {}
}

Object.defineProperty(window, "IntersectionObserver", {
  configurable: true,
  writable: true,
  value: IntersectionObserverMock,
})
