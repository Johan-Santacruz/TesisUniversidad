import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { ClassificationPanel } from "./classification-panel"


function panel(confidence: number) {
  return {
    category: { label: "Ataques contra la población civil", confidence },
  }
}

describe("ClassificationPanel", () => {
  // Un porcentaje suelto junto a una afirmación rotunda se lee como marcador
  // de demo. La palabra es lo que ve quien revisa el caso.
  it.each([
    [0.92, "lectura firme"],
    [0.7, "lectura probable"],
    [0.41, "lectura provisional"],
    [0.21, "lectura débil"],
  ])("dice la certeza en palabras (%s)", (confidence, expected) => {
    render(<ClassificationPanel classification={panel(confidence)} />)

    expect(screen.getByText(new RegExp(`^${expected} · \\d+%`))).toBeVisible()
  })

  // El número es evidencia del clasificador y se va a mirar en capturas de la
  // tesis: tiene que estar impreso, no detrás de un cursor.
  it("imprime el porcentaje exacto junto a la palabra", () => {
    render(<ClassificationPanel classification={panel(0.41)} />)

    expect(
      screen.getByText("lectura provisional · 41% de confianza"),
    ).toBeVisible()
  })

  it("no inventa una certeza cuando el modelo no la da", () => {
    render(
      <ClassificationPanel
        classification={{ category: { label: "Ataques contra la población civil" } }}
      />,
    )

    expect(screen.getByText("Ataques contra la población civil")).toBeVisible()
    expect(
      screen.queryByText(/^lectura (firme|probable|provisional|débil) ·/),
    ).toBeNull()
  })

  // La "confianza" de la subcategoría es el inverso de cuántas cuelgan de la
  // categoría —0.19 cuando cuelgan siete—, no una certeza. Imprimirla hacía
  // que una etiqueta equivocada se leyera como dato del caso.
  it("no le pone porcentaje a la subcategoría", () => {
    render(
      <ClassificationPanel
        classification={{
          category: {
            label: "Ataques contra la población civil",
            confidence: 0.87,
          },
          subcategory: { label: "Secuestro", confidence: 0.187 },
        }}
      />,
    )

    expect(screen.getByText("Secuestro")).toBeVisible()
    expect(
      screen.getByText("sin calibrar · contrástela con el relato"),
    ).toBeVisible()
    expect(screen.queryByText(/19% de confianza/)).toBeNull()
    // La categoría sí está calibrada y conserva su número.
    expect(screen.getByText("lectura firme · 87% de confianza")).toBeVisible()
  })

  it("dice que no hay lectura en vez de dejar el hueco", () => {
    render(<ClassificationPanel classification={{}} />)

    expect(screen.getAllByText("No disponible")).toHaveLength(2)
  })
})
