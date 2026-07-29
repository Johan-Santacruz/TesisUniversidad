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
        <p className="eyebrow">Lectura especializada</p>
        <h2 id="classification-title">Clasificación BETO</h2>
      </div>
      <dl>
        <div>
          <dt>Categoría</dt>
          <dd>{category?.label ?? "No disponible"}</dd>
          {category?.confidence !== undefined ? (
            <dd className="model-confidence">
              {Math.round(category.confidence * 100)}% de confianza del modelo
            </dd>
          ) : null}
        </div>
        <div>
          <dt>Subcategoría</dt>
          <dd>{subcategory?.label ?? "No disponible"}</dd>
          {subcategory?.confidence !== undefined ? (
            <dd className="model-confidence">
              {Math.round(subcategory.confidence * 100)}% de confianza del modelo
            </dd>
          ) : null}
        </div>
      </dl>
      <p>
        BETO aporta categoría y subcategoría; la verificación humana conserva
        la decisión final.
      </p>
    </section>
  )
}
