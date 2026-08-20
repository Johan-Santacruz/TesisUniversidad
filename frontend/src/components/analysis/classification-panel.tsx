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
            <dd className="model-confidence">
              {Math.round(category.confidence * 100)}% de confianza
            </dd>
          ) : null}
        </div>
        <div>
          <dt>Subcategoría</dt>
          <dd>{subcategory?.label ?? "No disponible"}</dd>
          {subcategory?.confidence !== undefined ? (
            <dd className="model-confidence">
              {Math.round(subcategory.confidence * 100)}% de confianza
            </dd>
          ) : null}
        </div>
      </dl>
      <p>
        Es una lectura automática del relato. La decisión final siempre queda
        en manos de quien revisa el caso.
      </p>
    </section>
  )
}
