import OpenAI from "openai"
import ffmpeg from "fluent-ffmpeg"
import { createReadStream } from "fs"
import { promises as fs } from "fs"
import path from "path"
import { randomUUID } from "crypto"

let openai: OpenAI | null = null

function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) {
    return null
  }

  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  }

  return openai
}

export interface TranscriptionResult {
  success: boolean
  transcript?: string
  error?: string
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function removeIfExists(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath)
  } catch (error) {
    const code = error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined
    if (code !== "ENOENT") {
      console.warn(`No se pudo eliminar el archivo temporal: ${filePath}`, error)
    }
  }
}

function extractAudioToMp3(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .noVideo()
      .audioCodec("libmp3lame")
      .audioBitrate(128)
      .format("mp3")
      .on("error", reject)
      .on("end", () => resolve())
      .save(outputPath)
  })
}

/**
 * 🛠️ Función auxiliar para limpiar bucles infinitos causados por silencios en Whisper
 */
function cleanWhisperHallucinations(text: string): string {
  if (!text) return ""

  // Divide el texto en oraciones/frases usando los signos de puntuación comunes
  const phrases = text.split(/(?<=[.?!,¿🛈])/).map(p => p.trim()).filter(Boolean)
  const cleanedPhrases: string[] = []

  let consecutiveMatches = 0
  
  for (let i = 0; i < phrases.length; i++) {
    const current = phrases[i].toLowerCase().replace(/[^a-zA-Z0-9áéíóúñ]/g, "")
    const lastAdded = cleanedPhrases[cleanedPhrases.length - 1]?.toLowerCase().replace(/[^a-zA-Z0-9áéíóúñ]/g, "")

    if (current === lastAdded) {
      consecutiveMatches++
      // Si la frase se repite consecutivamente más de 2 veces, asumimos que entró en bucle y la ignoramos
      if (consecutiveMatches >= 2) {
        continue
      }
    } else {
      consecutiveMatches = 0 // Reseteamos el contador si cambia la frase
    }

    cleanedPhrases.push(phrases[i])
  }

  return cleanedPhrases.join(" ")
}

async function transcribeWithWhisper(
  client: OpenAI,
  audioPath: string
): Promise<string> {
  const transcript = await client.audio.transcriptions.create({
    file: createReadStream(audioPath),
    model: "whisper-1",
    language: "es",
    temperature: 0.0,
    prompt: "Transcripción de un testimonio corrido sobre desplazamiento forzado en Colombia. Si hay silencios o ruidos, detén la escritura.",
  })

  // Retornamos el texto pasando primero por el filtro de limpieza
  return cleanWhisperHallucinations(transcript.text)
}

export async function transcribeAudio(
  filePath: string
): Promise<TranscriptionResult> {
  const client = getOpenAIClient()
  if (!client) {
    return {
      success: false,
      error: "OPENAI_API_KEY no está configurada. No se puede transcribir el audio.",
    }
  }

  const originalExists = await fileExists(filePath)
  if (!originalExists) {
    return {
      success: false,
      error: "El archivo no existe",
    }
  }

  const tempAudioPath = path.join(
    path.dirname(filePath),
    `${path.parse(filePath).name}-${randomUUID()}.mp3`
  )

  try {
    await extractAudioToMp3(filePath, tempAudioPath)

    const audioStats = await fs.stat(tempAudioPath)
    if (audioStats.size <= 0) {
      return {
        success: false,
        error: "No se pudo extraer audio utilizable del video.",
      }
    }

    const transcript = await transcribeWithWhisper(client, tempAudioPath)

    return {
      success: true,
      transcript,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error("Error transcribiendo audio:", error)
    return {
      success: false,
      error: `Error en transcripción: ${errorMessage}`,
    }
  } finally {
    await Promise.all([removeIfExists(tempAudioPath), removeIfExists(filePath)])
  }
}

export function isWhisperAvailable(): boolean {
  return !!process.env.OPENAI_API_KEY
}