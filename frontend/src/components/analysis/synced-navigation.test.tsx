import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { caseFixture, caseFixtureRevisado } from "../../test/case-fixture"
import { AnalysisWorkspace } from "./analysis-workspace"
import { VerificationPanel } from "./verification-panel"


function openSignals() {
  fireEvent.click(screen.getByRole("button", { name: "Señales" }))
}

// Los momentos del relato listan sus señales como etiquetas, así que su nombre
// accesible también contiene "Ubicación actual". Hay que acotar al panel.
async function openSignal(label: RegExp) {
  const panel = await screen.findByRole("region", { name: "Señales encontradas" })
  const card = await waitFor(() =>
    within(panel).getByRole("button", { name: label }))
  fireEvent.click(card)
  return panel
}

describe("navegación sincronizada", () => {
  // El vínculo señal → fragmento del testimonio sale de EvidenceRef, que el
  // contrato ya entrega. No se infiere nada.
  it("abrir una señal muestra la cita del fragmento real que la sustenta", async () => {
    render(<AnalysisWorkspace initialCase={caseFixture} role="operador" />)
    openSignals()

    await openSignal(/^Ubicación actual/)

    // En la edición anotada la cita sobra: el pasaje está al lado de la nota.
    expect(
      document.querySelector(".marginalia-row.is-anotada .marginalia-text"),
    ).toHaveTextContent("La familia llegó a Popayán y necesita alojamiento seguro.")
  })

  it("desde la cita se vuelve al momento del video", async () => {
    render(<AnalysisWorkspace initialCase={caseFixture} role="operador" />)
    const video = screen.getByTestId("case-video") as HTMLVideoElement
    openSignals()

    // La llamada de minuto del pasaje abre ese momento del video.
    fireEvent.click(
      await screen.findByRole("button", { name: /ver en el video, minuto\s*0:18/i }),
    )

    expect(video.currentTime).toBe(18.4)
  })

  it("avisa cuando una señal no quedó anclada a ningún fragmento", async () => {
    render(<AnalysisWorkspace initialCase={caseFixture} role="operador" />)
    openSignals()

    // Las señales sin anclaje se recogen al pie, fuera del margen.
    expect(
      await screen.findByText(/sin fragmento en el testimonio/i),
    ).toBeInTheDocument()
  })

  it("filtra las señales por criticidad sin inventar facetas", async () => {
    render(<AnalysisWorkspace initialCase={caseFixture} role="operador" />)
    openSignals()

    fireEvent.click(await screen.findByRole("button", { name: /^Críticas/ }))

    const labels = [...document.querySelectorAll(".fact-card h4")].map(
      (node) => node.textContent,
    )
    expect(labels).toContain("Urgencia")
    expect(labels).not.toContain("Fecha exacta")
  })

  // El contrato no ata una ruta a un momento del testimonio, así que esa
  // relación no se finge. La que sí existe es el bloqueo por señales críticas.
  it("explica que las señales críticas bloquean la aprobación", async () => {
    render(<AnalysisWorkspace initialCase={caseFixture} role="validador" />)

    fireEvent.click(screen.getByRole("button", { name: "Ruta" }))

    expect(
      await screen.findByText("1 señal crítica sin confirmar"),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /ir a las señales/i }))

    expect(
      await screen.findByRole("heading", { name: "Ordenando lo importante" }),
    ).toBeInTheDocument()
  })

  it("elegir un momento lleva el video a su minuto", () => {
    render(<AnalysisWorkspace initialCase={caseFixture} role="operador" />)

    const moment = screen.getByRole("button", {
      name: /desplazamiento hacia popayán/i,
    })
    fireEvent.click(moment)

    expect(moment).toHaveAttribute("aria-current", "true")
    expect((screen.getByTestId("case-video") as HTMLVideoElement).currentTime)
      .toBe(18.4)
  })
})

describe("lo esencial de cada paso", () => {
  // Dentro de un párrafo la instrucción crítica se pierde. Debe estar visible
  // antes de desplegar el detalle, y el audio debe leerla primero.
  it("muestra el punto clave sin necesidad de abrir el paso", async () => {
    render(<AnalysisWorkspace initialCase={caseFixtureRevisado} role="operador" />)

    fireEvent.click(screen.getByRole("button", { name: "Ruta" }))
    fireEvent.click(await screen.findByRole("button", { name: /atención inmediata/i }))

    expect(
      await screen.findByText("Lleve la denuncia impresa."),
    ).toBeInTheDocument()
  })
})

// El fixture no trae ninguna señal con valor y sin confirmar, que es
// justamente el caso donde confirmar debe bastar con un clic.
const senalConValor = {
  ...caseFixture.facts[0],
  id: "fact-pendiente",
  label: "Ubicación actual",
  value: "Popayán, Cauca",
  verification_status: "pending" as const,
}

describe("confirmar una señal", () => {
  // Confirmar es decir "esto ya estaba bien". Pedir una justificación para eso
  // sólo añade fricción y llena la auditoría de motivos de relleno.
  it("confirma en un clic cuando la señal ya tiene valor", async () => {
    const onReview = vi.fn()
    render(
      <VerificationPanel
        facts={[senalConValor]}
        role="validador"
        onReview={onReview}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: /esto es correcto/i }))

    expect(onReview).toHaveBeenCalledWith("fact-pendiente", {
      action: "confirm",
      reason: "",
    })
    expect(screen.queryByLabelText(/razón/i)).not.toBeInTheDocument()
  })

  it("al corregir sigue exigiendo el motivo", () => {
    render(
      <VerificationPanel
        facts={[senalConValor]}
        role="validador"
        onReview={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: /necesito corregirlo/i }))

    expect(screen.getByLabelText("Razón de la corrección")).toBeRequired()
  })
})


/* La ruta retenida.
 *
 * Antes la ruta se mostraba con un aviso encima. El aviso decía la verdad, pero
 * la ruta se leía igual, y una ruta que se puede leer es una ruta que alguien
 * va a seguir. Ahora, mientras haya señales críticas sin confirmar, la etapa
 * entrega la explicación en lugar de la orientación. */
describe("la ruta espera a que se confirmen las señales críticas", () => {
  it("no muestra ninguna ruta mientras quede una crítica sin confirmar", async () => {
    render(<AnalysisWorkspace initialCase={caseFixture} role="validador" />)

    fireEvent.click(screen.getByRole("button", { name: "Ruta" }))

    expect(await screen.findByText("La ruta espera")).toBeInTheDocument()
    expect(screen.queryByTestId("route-journey")).not.toBeInTheDocument()
    expect(screen.queryByText("Atención inmediata")).not.toBeInTheDocument()
  })

  it("dice cuál es la señal que falta, con su nombre", async () => {
    render(<AnalysisWorkspace initialCase={caseFixture} role="validador" />)

    fireEvent.click(screen.getByRole("button", { name: "Ruta" }))

    await screen.findByText("La ruta espera")
    const lista = document.querySelector(".route-gate-list")

    expect(lista).not.toBeNull()
    expect(lista?.textContent).toContain("Urgencia")
  })

  it("al operador le dice quién puede resolverlas", async () => {
    render(<AnalysisWorkspace initialCase={caseFixture} role="operador" />)

    fireEvent.click(screen.getByRole("button", { name: "Ruta" }))

    expect(
      await screen.findByText(/Confirmar es cosa de un validador/i),
    ).toBeInTheDocument()
  })

  it("con las críticas confirmadas, la ruta aparece", async () => {
    render(<AnalysisWorkspace initialCase={caseFixtureRevisado} role="validador" />)

    fireEvent.click(screen.getByRole("button", { name: "Ruta" }))

    expect(
      await screen.findByRole("button", { name: /atención inmediata/i }),
    ).toBeInTheDocument()
    expect(screen.queryByText("La ruta espera")).not.toBeInTheDocument()
  })
})
