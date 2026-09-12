/* Espejo de Backend/app/ai/vulnerabilities.py: si cambia una opción allá,
 * cambia aquí. El backend rechaza cualquier identificador que no conozca. */
export const VULNERABILITIES_KEY = "vulnerabilities"

// El orden es el de las casillas en pantalla.
export const VULNERABILITY_OPTIONS = [
  { id: "children", label: "Niñas, niños o adolescentes" },
  { id: "older_adults", label: "Personas mayores" },
  { id: "pregnancy", label: "Embarazo" },
  { id: "disability", label: "Discapacidad" },
  { id: "illness", label: "Enfermedad" },
  { id: "none", label: "Ninguna de las anteriores" },
] as const

const OPTION_IDS: string[] = VULNERABILITY_OPTIONS.map((option) => option.id)

/* Las opciones marcadas en un valor guardado. Un caso anterior a las casillas
 * trae texto libre, que no marca ninguna. */
export function chosenVulnerabilities(value: unknown): string[] {
  const items = Array.isArray(value)
    ? value.map(String)
    : typeof value === "string" ? [value] : []
  return OPTION_IDS.filter((id) => items.includes(id))
}

/* "Ninguna de las anteriores" excluye a las demás, y marcar cualquier otra
 * la quita: las dos cosas a la vez no pueden ser ciertas. */
export function toggleVulnerability(current: string[], id: string): string[] {
  if (current.includes(id)) return current.filter((item) => item !== id)
  const next = id === "none"
    ? ["none"]
    : [...current.filter((item) => item !== "none"), id]
  return OPTION_IDS.filter((option) => next.includes(option))
}
