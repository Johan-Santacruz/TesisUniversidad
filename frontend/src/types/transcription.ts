import type { CaseBrief } from "./case-brief"

export type TranscriptionApiResponse = {
  success: boolean
  transcript?: string
  caseBrief?: CaseBrief
  error?: string
}
