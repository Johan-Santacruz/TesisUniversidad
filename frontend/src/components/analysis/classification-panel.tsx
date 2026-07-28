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
    <section className="classification-panel" aria-labelledby="classification-title">
      <div>
        <p className="eyebrow">Lectura especializada</p>
        <h2 id="classification-title">Clasificación BETO</h2>
        <p>
          BETO aporta únicamente categoría y subcategoría. La urgencia y las
          vulnerabilidades se contrastan por separado entre GPT y Claude.
        </p>
      </div>
      <dl>
        <div>
          <dt>Categoría</dt>
          <dd>{category?.label ?? "No disponible"}</dd>
          {category?.confidence !== undefined ? (
            <span>{Math.round(category.confidence * 100)}% de confianza del modelo</span>
          ) : null}
        </div>
        <div>
          <dt>Subcategoría</dt>
          <dd>{subcategory?.label ?? "No disponible"}</dd>
          {subcategory?.confidence !== undefined ? (
            <span>{Math.round(subcategory.confidence * 100)}% de confianza del modelo</span>
          ) : null}
        </div>
      </dl>
    </section>
  )
}
