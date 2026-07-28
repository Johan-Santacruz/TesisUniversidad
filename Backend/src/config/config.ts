import "dotenv/config"

export const config = {
  port: Number.parseInt(process.env.PORT || "5001", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:3000",
  classifierApiUrl: process.env.CLASSIFIER_API_URL || "http://localhost:8001",
  classifierTimeoutMs: Number.parseInt(
    process.env.CLASSIFIER_TIMEOUT_MS || "15000",
    10
  ),
}

export function validateConfig(): void {
  if (process.env.OPENAI_API_KEY) return

  const message = "OPENAI_API_KEY no está configurada; la transcripción no estará disponible."
  if (config.nodeEnv === "production") {
    throw new Error(message)
  }

  console.warn(message)
}

export function getConfigSummary(): string {
  return [
    "Configuración SIAD:",
    `- Entorno: ${config.nodeEnv}`,
    `- Puerto: ${config.port}`,
    `- Frontend: ${config.frontendUrl}`,
    `- Clasificador: ${config.classifierApiUrl}`,
  ].join("\n")
}
