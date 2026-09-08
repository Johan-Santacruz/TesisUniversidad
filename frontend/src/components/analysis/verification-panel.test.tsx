import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import { useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { caseFixture } from "../../test/case-fixture"
import { VerificationPanel } from "./verification-panel"


const motionTestState = vi.hoisted(() => ({ reduceMotion: false }))

vi.mock("framer-motion", async () => {
  const React = await import("react")

  function MotionDiv({
    children,
    initial,
    animate: _animate,
    exit: _exit,
    transition,
    ...props
  }: {
    children?: React.ReactNode
    initial?: unknown
    transition?: unknown
    [key: string]: unknown
  }) {
    const duration = transition
      && typeof transition === "object"
      && "duration" in transition
        ? String(transition.duration)
        : undefined

    return React.createElement(
      "div",
      {
        ...props,
        "data-motion-duration": duration,
        "data-motion-initial": initial === false ? "false" : "animated",
      },
      children,
    )
  }

  return {
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => children,
    motion: { div: MotionDiv },
    useReducedMotion: () => motionTestState.reduceMotion,
  }
})


describe("VerificationPanel motion", () => {
  beforeEach(() => {
    motionTestState.reduceMotion = false
  })

  it("opens the review form without interpolation for reduced motion", () => {
    motionTestState.reduceMotion = true
    render(
      <VerificationPanel
        facts={caseFixture.facts}
        role="validador"
        onReview={vi.fn()}
      />,
    )
    const urgency = screen.getByText("Urgencia").closest("article")
    expect(urgency).not.toBeNull()

    fireEvent.click(
      within(urgency as HTMLElement).getByRole("button", {
        name: /elegir el valor/i,
      }),
    )
    const reveal = within(urgency as HTMLElement)
      .getByLabelText("Valor confirmado")
      .closest(".fact-review-reveal")

    expect(reveal).toHaveAttribute("data-motion-initial", "false")
    expect(reveal).toHaveAttribute("data-motion-duration", "0.01")
  })
})


function deferred() {
  let resolve!: () => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}


// Corregir sólo tiene sentido sobre una señal que ya trae valor.
const senalConValor = {
  ...caseFixture.facts[0],
  id: "fact-editable",
  label: "Urgencia",
  value: "media",
  verification_status: "pending" as const,
}

function openUrgencyCorrection(onReview: () => Promise<void>) {
  render(
    <VerificationPanel
      facts={[senalConValor]}
      role="validador"
      onReview={onReview}
    />,
  )
  const urgency = screen.getByText("Urgencia").closest("article")
  expect(urgency).not.toBeNull()
  const card = urgency as HTMLElement
  fireEvent.click(
    within(card).getByRole("button", { name: /necesito corregirlo/i }),
  )
  fireEvent.change(within(card).getByLabelText("Valor corregido"), {
    target: { value: "Urgencia alta corregida" },
  })
  fireEvent.change(within(card).getByLabelText("Razón de la corrección"), {
    target: { value: "Corrección humana conservada" },
  })
  return card
}


describe("VerificationPanel review errors", () => {
  it("shows a rejected review beside the action and retains form values", async () => {
    const request = deferred()
    const card = openUrgencyCorrection(() => request.promise)
    const submit = within(card).getByRole("button", {
      name: "Guardar corrección",
    })

    fireEvent.click(submit)
    request.reject(new Error("No se pudo guardar la revisión"))

    expect(await within(card).findByRole("alert")).toHaveTextContent(
      "No se pudo guardar la revisión",
    )
    expect(within(card).getByLabelText("Valor corregido")).toHaveValue(
      "Urgencia alta corregida",
    )
    expect(within(card).getByLabelText("Razón de la corrección")).toHaveValue(
      "Corrección humana conservada",
    )
    expect(submit).toBeEnabled()
  })

  it("prevents duplicate reviews while the first request is pending", async () => {
    const request = deferred()
    const onReview = vi.fn(() => request.promise)
    const card = openUrgencyCorrection(onReview)
    const form = within(card).getByLabelText("Valor corregido").closest("form")
    const submit = within(card).getByRole("button", {
      name: "Guardar corrección",
    })
    expect(form).not.toBeNull()

    fireEvent.submit(form as HTMLFormElement)
    fireEvent.submit(form as HTMLFormElement)

    expect(onReview).toHaveBeenCalledOnce()
    expect(submit).toBeDisabled()

    request.resolve()
    await waitFor(() => {
      expect(
        within(card).queryByLabelText("Valor corregido"),
      ).not.toBeInTheDocument()
    })
  })
})


// ── Cuánto trabajo queda ───────────────────────────────────────────────────
//
// La cabecera del panel decía "Cada corrección conserva autor, razón y estado",
// que es política y no tarea. Quien llega necesita saber cuánto falta y qué
// bloquea; la política sigue estando, una línea más abajo.

describe("la cabecera dice cuánto falta", () => {
  const senal = (id: string, confirmada: boolean, critica: boolean) => ({
    ...caseFixture.facts[0],
    id,
    label: `Señal ${id}`,
    value: "un valor",
    is_critical: critica,
    verification_status: confirmada ? "confirmed" : "pending",
  }) as (typeof caseFixture.facts)[number]

  it("cuenta las pendientes y avisa de las que bloquean", () => {
    render(
      <VerificationPanel
        facts={[senal("a", false, true), senal("b", false, false), senal("c", true, false)]}
        role="validador"
        onReview={vi.fn()}
      />,
    )

    expect(screen.getByText(/Faltan 2 señales por confirmar/)).toBeInTheDocument()
    expect(screen.getByText(/1 bloquea la aprobación/)).toBeInTheDocument()
  })

  it("usa el singular cuando queda una sola", () => {
    render(
      <VerificationPanel
        facts={[senal("a", false, false), senal("b", true, false)]}
        role="validador"
        onReview={vi.fn()}
      />,
    )

    expect(screen.getByText(/Falta 1 señal por confirmar/)).toBeInTheDocument()
  })

  it("cierra el trabajo cuando no queda nada pendiente", () => {
    render(
      <VerificationPanel
        facts={[senal("a", true, true), senal("b", true, false)]}
        role="validador"
        onReview={vi.fn()}
      />,
    )

    expect(
      screen.getByText(/Todas las señales están confirmadas/),
    ).toBeInTheDocument()
    expect(screen.getByText(/ya puede aprobarse/)).toBeInTheDocument()
  })

  it("al operador le explica por qué no puede confirmar", () => {
    render(
      <VerificationPanel
        facts={[senal("a", false, false)]}
        role="operador"
        onReview={vi.fn()}
      />,
    )

    expect(
      screen.getByText(/confirmar es cosa de un validador/i),
    ).toBeInTheDocument()
  })
})


// La navegación debe priorizar bloqueantes y excluir las ya confirmadas,
// incluso si el filtro actual ocultaba la siguiente señal.
describe("revisión guiada de señales", () => {
  const facts = [
    { ...senalConValor, id: "pending", label: "Alojamiento", is_critical: false },
    { ...senalConValor, id: "done", label: "Ubicación", is_critical: true, verification_status: "confirmed" as const },
    { ...senalConValor, id: "blocking", label: "Urgencia", is_critical: true },
  ]

  function ReviewHarness({ initialFacts = facts }: { initialFacts?: typeof facts }) {
    const [items, setItems] = useState(initialFacts)
    const [selected, setSelected] = useState<string | null>(null)
    return <VerificationPanel facts={items} role="validador"
      segments={caseFixture.segments}
      selectedFactId={selected}
      onSelectFact={(fact) => setSelected(fact?.id ?? null)}
      onReview={async (id) => {
        setItems((current) => current.map((fact) => fact.id === id
          ? { ...fact, verification_status: "confirmed" as const } : fact))
      }} />
  }

  it("abre primero una bloqueante y permite continuar después de confirmarla", async () => {
    render(<ReviewHarness />)
    fireEvent.click(screen.getByRole("button", { name: /empezar revisión/i }))
    const urgent = screen.getByRole("button", { name: "Urgencia" })
    expect(urgent).toHaveAttribute("aria-expanded", "true")
    expect(urgent).toHaveFocus()
    const card = urgent.closest("article")!
    fireEvent.click(within(card).getByRole("button", { name: /esto es correcto/i }))
    await waitFor(() => expect(within(card).queryByRole("button", { name: /esto es correcto/i })).toBeNull())
    expect(screen.getByRole("progressbar", { name: /señales confirmadas/i })).toHaveAttribute("aria-valuenow", "2")
    fireEvent.click(within(card).getByRole("button", { name: /revisar siguiente pendiente/i }))
    expect(screen.getByRole("button", { name: "Alojamiento" })).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("button", { name: "Ubicación" })).toHaveAttribute("aria-expanded", "false")
  })

  it("permite llegar a una pendiente que el filtro de críticas ocultaba", () => {
    render(<ReviewHarness />)
    fireEvent.click(screen.getByRole("button", { name: /críticas/i }))
    fireEvent.click(screen.getByRole("button", { name: /revisar bloqueantes/i }))
    const card = screen.getByRole("button", { name: "Urgencia" }).closest("article")!
    fireEvent.click(within(card).getByRole("button", { name: /revisar siguiente pendiente/i }))
    expect(screen.getByRole("button", { name: "Alojamiento" })).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("button", { name: /todas/i })).toHaveAttribute("aria-pressed", "true")
  })

  it("devuelve el foco a la única pendiente aunque ya esté seleccionada", () => {
    render(<ReviewHarness initialFacts={[facts[2]]} />)
    fireEvent.click(screen.getByRole("button", { name: /empezar revisión/i }))
    const resume = screen.getByRole("button", { name: /continuar revisión/i })
    resume.focus()
    fireEvent.click(resume)
    expect(screen.getByRole("button", { name: "Urgencia" })).toHaveFocus()
  })

  it("termina el recorrido al confirmar la última pendiente", async () => {
    render(<ReviewHarness initialFacts={[facts[2]]} />)
    fireEvent.click(screen.getByRole("button", { name: /empezar revisión/i }))
    fireEvent.click(screen.getByRole("button", { name: /esto es correcto/i }))
    await waitFor(() => expect(screen.queryByRole("button", { name: /continuar revisión/i })).toBeNull())
    expect(screen.queryByRole("button", { name: /siguiente pendiente/i })).toBeNull()
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1")
  })

  it("no presenta un caso sin señales como revisión completada", () => {
    render(<ReviewHarness initialFacts={[]} />)
    expect(screen.queryByText(/todas las señales están confirmadas/i)).toBeNull()
    expect(screen.queryByRole("progressbar")).toBeNull()
    expect(screen.queryByRole("button", { name: /empezar revisión/i })).toBeNull()
    expect(screen.getByText(/no se encontraron señales/i)).toBeInTheDocument()
  })

  it("explica un filtro sin resultados", () => {
    render(<ReviewHarness initialFacts={[facts[0]]} />)
    fireEvent.click(screen.getByRole("button", { name: /críticas/i }))
    expect(screen.getByText(/no hay señales críticas/i)).toBeInTheDocument()
  })
})
