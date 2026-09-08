import type { components } from "../api/generated"


export const memoryImageFixture: components["schemas"]["MemoryImageRead"] = {
  id: "memory-image-fixture",
  generation: 1,
  status: "pending_review",
  image_url: "/api/v1/cases/case-fixture/memory-image/content",
  rendered_video_url: null,
  render_status: null,
  failure_code: null,
  reviewed_at: null,
}


export const caseFixture: components["schemas"]["CaseRead"] = {
  id: "case-fixture",
  analysis_id: "analysis-fixture",
  video_id: "video-fixture",
  status: "in_review",
  recommendation_status: "preliminary",
  approved_at: null,
  video_stream_url: "/api/v1/videos/video-fixture/stream",
  critical_inconsistencies: 1,
  segments: [
    {
      id: "segment-1",
      start_ms: 0,
      end_ms: 14200,
      text: "La familia ficticia salió de El Tambo.",
    },
    {
      id: "segment-2",
      start_ms: 18400,
      end_ms: 31800,
      text: "La familia llegó a Popayán y necesita alojamiento seguro.",
    },
  ],
  timeline: [
    {
      id: "event-1",
      title: "Salida de El Tambo",
      description: "La familia relata la salida de su territorio.",
      start_ms: 0,
      end_ms: 14200,
      origin: "mentioned",
      verification_status: "confirmed",
      confidence_band: "high",
      provider_options: null,
    },
    {
      id: "event-2",
      title: "Desplazamiento hacia Popayán",
      description: "Se identifica la llegada a la capital del Cauca.",
      start_ms: 18400,
      end_ms: 31800,
      origin: "contrasted",
      verification_status: "inconsistent",
      confidence_band: "low",
      provider_options: {
        gpt: { start_ms: 18400 },
        claude: { start_ms: 21100 },
      },
    },
  ],
  facts: [
    {
      id: "fact-location",
      label: "Ubicación actual",
      value: "Popayán, Cauca",
      origin: "contrasted",
      verification_status: "confirmed",
      confidence_band: "high",
      is_critical: false,
      evidence: [{ segment_id: "segment-2", start_ms: 18400, end_ms: 31800 }],
      provider_values: {},
    },
    {
      id: "fact-urgency",
      label: "Urgencia",
      value: null,
      origin: "contrasted",
      verification_status: "inconsistent",
      confidence_band: "low",
      is_critical: true,
      evidence: [{ segment_id: "segment-2", start_ms: 18400, end_ms: 31800 }],
      provider_values: { gpt: "high", claude: "medium" },
    },
    {
      id: "fact-date",
      label: "Fecha exacta",
      value: null,
      origin: "mentioned",
      verification_status: "not_identified",
      confidence_band: "low",
      is_critical: false,
      evidence: [],
      provider_values: {},
    },
  ],
  classification: {
    model: "BETO",
    scope: "category_subcategory_only",
    category: { label: "Desplazamiento", confidence: 0.91 },
    subcategory: { label: "Desplazamiento forzado", confidence: 0.87 },
  },
  sources: [
    {
      id: "uariv-crav-popayan",
      entity: "Unidad para las Víctimas",
      program: "CRAV Popayán",
      coverage: "Popayán, Cauca",
      requirements: "Confirmar requisitos.",
      contact: "Consultar canal vigente.",
      url: "https://www.unidadvictimas.gov.co/",
      verified_at: "2026-07-01T00:00:00Z",
      expires_at: "2026-07-31T00:00:00Z",
      source_kind: "contact",
      route_types: ["emergency"],
      status: "active",
      is_expired: false,
      disclaimer: null,
    },
  ],
  routes: [
    {
      id: "route-emergency",
      route_type: "emergency",
      title: "Atención inmediata",
      summary: "Orientación inicial y valoración institucional.",
      origin: "contrasted",
      verification_status: "pending",
      confidence_band: "medium",
      applicability: "applies",
      provider_options: null,
      steps: [
        {
          title: "Contactar el punto territorial",
          key_point: "Lleve la denuncia impresa.",
          instructions: "Confirmar horario antes del traslado.",
          claims: [
            {
              text: "El CRAV orienta el acceso a la oferta institucional.",
              source_entry_id: "uariv-crav-popayan",
            },
          ],
        },
      ],
    },
    {
      id: "route-housing",
      route_type: "housing_stabilization",
      title: "Estabilización de vivienda",
      summary: "Revisar una alternativa temporal segura.",
      origin: "inferred",
      verification_status: "pending",
      confidence_band: "medium",
      applicability: "applies",
      provider_options: null,
      steps: [],
    },
    {
      id: "route-return",
      route_type: "return_relocation",
      title: "Retorno o reubicación",
      summary: "Evaluar voluntariedad y seguridad.",
      origin: "inferred",
      verification_status: "pending",
      confidence_band: "medium",
      applicability: "applies",
      provider_options: null,
      steps: [],
    },
  ],
}

/* El mismo caso con el trabajo humano ya hecho.
 *
 * La ruta no se muestra mientras haya señales críticas sin confirmar, así que
 * cualquier prueba que mire la ruta necesita un caso donde esa revisión ya
 * ocurrió. Se deriva del original en vez de copiarlo para que las dos versiones
 * no se separen con el tiempo. */
export const caseFixtureRevisado: components["schemas"]["CaseRead"] = {
  ...caseFixture,
  critical_inconsistencies: 0,
  facts: caseFixture.facts.map((fact) =>
    fact.is_critical
      ? { ...fact, verification_status: "confirmed" as const }
      : fact,
  ),
}
