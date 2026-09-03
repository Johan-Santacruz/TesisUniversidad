function classificationValue(value: unknown): { label: string; confidence?: number } | null {
  if (typeof value !== "object" || value === null || !("label" in value)) {
    return null
  }
  const label = typeof value.label === "string" ? value.label : null
  const confidence = "confidence" in value && typeof value.confidence === "number"
    ? value.confidence
    : undefined
  return label ? { label, confidence } : null
}


/* Un "21%" impreso junto a una afirmación tan rotunda como "reclutamiento de
 * menores" se lee como puntuación de demo, y ese es justo el dato que hay que
 * matizar, no marcar. La palabra va delante y da la lectura a quien revisa;
 * el número queda detrás, a la vista, porque es evidencia del clasificador y
 * dentro de un tooltip no habría sobrevivido a una captura ni a una
 * impresión.
 *
 * Vale para la categoría y sólo para ella: abajo está por qué la subcategoría
 * se quedó sin número. */
const CERTAINTY_FLOORS = [
  [0.85, "lectura firme"],
  [0.65, "lectura probable"],
  [0.35, "lectura provisional"],
] as const

function certaintyWord(confidence: number) {
  for (const [floor, word] of CERTAINTY_FLOORS) {
    if (confidence >= floor) return word
  }
  return "lectura débil"
}


function Certainty({ confidence }: { confidence: number }) {
  return (
    <dd className="model-confidence">
      {certaintyWord(confidence)} · {Math.round(confidence * 100)}% de confianza
    </dd>
  )
}


export function ClassificationPanel({
  classification,
}: {
  classification: Record<string, unknown>
}) {
  const category = classificationValue(classification.category)
  const subcategory = classificationValue(classification.subcategory)

  return (
    <section
      className="classification-summary"
      aria-labelledby="classification-title"
    >
      <div>
        {/* Quien lee esto no necesita saber qué modelo clasifica: le importa
            qué tipo de caso es y con cuánta seguridad se afirma. */}
        <p className="eyebrow">Lectura del relato</p>
        <h2 id="classification-title">Tipo de caso</h2>
      </div>
      <dl>
        <div>
          <dt>Categoría</dt>
          <dd>{category?.label ?? "No disponible"}</dd>
          {category?.confidence !== undefined ? (
            <Certainty confidence={category.confidence} />
          ) : null}
        </div>
        {/* La subcategoría no lleva porcentaje. El clasificador la elige
            entre las que cuelgan de la categoría ya predicha, y su "confianza"
            acaba siendo el inverso de cuántas había —1.0 cuando cuelga una
            sola, 0.19 cuando cuelgan siete—, no una medida de qué tan seguro
            está. Imprimir ese número sería inventar una precisión que no
            existe, y ya pasó que una subcategoría equivocada se leyera como
            dato del caso. Queda la etiqueta, con el aviso de qué hacer con
            ella. */}
        <div>
          <dt>Subcategoría</dt>
          <dd>{subcategory?.label ?? "No disponible"}</dd>
          {subcategory ? (
            <dd className="model-confidence">
              sin calibrar · contrástela con el relato
            </dd>
          ) : null}
        </div>
      </dl>
    </section>
  )
}
