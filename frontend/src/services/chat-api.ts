import type { TranscriptionApiResponse } from "../types/transcription"

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5001"

export async function transcribeTestimony(
  file: File
): Promise<TranscriptionApiResponse & { transcript: string }> {
  const formData = new FormData()
  formData.append("file", file)

  const response = await fetch(`${API_BASE_URL}/api/chat/transcribe`, {
    method: "POST",
    body: formData,
  })

  const data = (await response.json()) as TranscriptionApiResponse

  if (!response.ok || !data.success || !data.transcript) {
    throw new Error(data.error || "No se pudo obtener la transcripción")
  }

  return {
    ...data,
    transcript: data.transcript,
  }
}
