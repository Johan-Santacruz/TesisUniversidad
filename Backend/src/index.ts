import cors from "cors"
import express from "express"
import { config, getConfigSummary, validateConfig } from "./config/config.js"
import transcriptionRoutes from "./routes/transcription.routes.js"

const app = express()
const allowedOrigins = new Set([
  config.frontendUrl,
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
])

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true)
        return
      }

      callback(new Error(`Origen no permitido por CORS: ${origin}`))
    },
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  })
)

app.use(express.json({ limit: "1mb" }))

app.use((request, _response, next) => {
  console.log(`[${new Date().toISOString()}] ${request.method} ${request.path}`)
  next()
})

app.use("/api/chat", transcriptionRoutes)

app.get("/", (_request, response) => {
  response.json({
    name: "SIAD Backend - Procesamiento de testimonios",
    version: "1.0.0",
    endpoints: {
      transcribe: "/api/chat/transcribe",
      health: "/api/chat/health",
    },
  })
})

app.use(
  (
    error: unknown,
    _request: express.Request,
    response: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("Error:", error)
    const message = error instanceof Error ? error.message : "Error interno del servidor"
    response.status(500).json({ success: false, error: message })
  }
)

app.use((request, response) => {
  response.status(404).json({
    success: false,
    error: "Endpoint no encontrado",
    path: request.path,
  })
})

function startServer() {
  validateConfig()
  console.log(getConfigSummary())

  app.listen(config.port, "0.0.0.0", () => {
    console.log(`Servidor iniciado en http://localhost:${config.port}`)
  })
}

startServer()
