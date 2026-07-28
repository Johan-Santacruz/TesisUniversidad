export interface ClassificationLabel {
  label: string
  confidence?: number
}

export interface ViolenceClassification {
  available: boolean
  source: "classifier_service" | "unavailable"
  category?: ClassificationLabel
  subcategory?: ClassificationLabel
  riskLevel?: "bajo" | "medio" | "alto" | "critico"
  notes?: string[]
  warnings?: string[]
}

export interface CaseBrief {
  source: "video_transcript" | "typed_message"
  transcript?: string
  transcriptPreview?: string
  classification?: ViolenceClassification
  createdAt: string
}
