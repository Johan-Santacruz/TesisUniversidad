import { promises as fs } from "fs"
import type { Request, Response } from "express"
import { classifyTranscript } from "../core/classifier-client.js"
import {
  isWhisperAvailable,
  transcribeAudio,
} from "../core/transcription.service.js"
import type {
  CaseBrief,
  TranscriptionResponse,
  ViolenceClassification,
} from "../types/transcription.js"

function createCaseBrief(
  transcript: string,
  classification: ViolenceClassification
): CaseBrief {
  const transcriptPreview =
    transcript.length > 420 ? `${transcript.slice(0, 420).trim()}...` : transcript

  return {
    source: "video_transcript",
    transcript,
    transcriptPreview,
    classification,
    createdAt: new Date().toISOString(),
  }
}

async function removeTemporaryUpload(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath)
  } catch (error) {
    const code = error instanceof Error
      ? (error as NodeJS.ErrnoException).code
      : undefined
    if (code !== "ENOENT") {
      console.warn(`No se pudo eliminar el archivo temporal: ${filePath}`, error)
    }
  }
}

export async function transcribeTestimony(
  request: Request,
  response: Response<TranscriptionResponse>
): Promise<Response<TranscriptionResponse>> {
  const uploadedFile = request.file

  if (!uploadedFile) {
    return response.status(400).json({
      success: false,
      error: "No se proporcionó archivo",
    })
  }

  if (!isWhisperAvailable()) {
    await removeTemporaryUpload(uploadedFile.path)
    return response.status(503).json({
      success: false,
      error: "Servicio de transcripción no disponible. Falta OPENAI_API_KEY.",
    })
  }

  try {
    console.log(`Procesando testimonio: ${uploadedFile.originalname}`)
    const transcription = await transcribeAudio(uploadedFile.path)

    if (!transcription.success || !transcription.transcript) {
      return response.status(400).json({
        success: false,
        error: transcription.error || "No se obtuvo una transcripción válida",
      })
    }

    const classification = await classifyTranscript(transcription.transcript)
    const caseBrief = createCaseBrief(transcription.transcript, classification)

    return response.json({
      success: true,
      transcript: transcription.transcript,
      classification,
      caseBrief,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Error procesando el testimonio:", error)
    return response.status(500).json({
      success: false,
      error: `Error procesando archivo: ${message}`,
    })
  }
}
