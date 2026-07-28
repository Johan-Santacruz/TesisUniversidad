export type ClassificationLabel = {
  label: string
  confidence?: number
  probabilities?: Array<{
    label: string
    confidence: number
  }>
}

export type ViolenceClassification = {
  available: boolean
  source: "classifier_service" | "unavailable"
  category?: ClassificationLabel
  subcategory?: ClassificationLabel
  riskLevel?: "bajo" | "medio" | "alto" | "critico"
  notes?: string[]
  warnings?: string[]
}

export type CaseBrief = {
  source: "video_transcript"
  transcript: string
  transcriptPreview: string
  classification: ViolenceClassification
  createdAt: string
}

export type TranscriptionResponse = {
  success: boolean
  transcript?: string
  classification?: ViolenceClassification
  caseBrief?: CaseBrief
  error?: string
}
