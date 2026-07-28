import { Router } from "express"
import { transcribeTestimony } from "../controllers/transcription.controller.js"
import { uploadTestimonyFile } from "../middleware/testimony-upload.js"

const router = Router()

router.post("/transcribe", uploadTestimonyFile.single("file"), transcribeTestimony)

router.get("/health", (_request, response) => {
  response.json({
    success: true,
    message: "Transcription API is running",
    transcriptionConfigured: Boolean(process.env.OPENAI_API_KEY),
    timestamp: new Date().toISOString(),
  })
})

export default router
