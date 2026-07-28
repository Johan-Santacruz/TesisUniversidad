import { randomUUID } from "crypto"
import { promises as fs } from "fs"
import multer from "multer"
import * as os from "os"
import * as path from "path"

const MAX_FILE_SIZE = 100 * 1024 * 1024
const ALLOWED_MIME_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/x-msvideo",
  "audio/mpeg",
  "audio/wav",
  "audio/m4a",
])

const storage = multer.diskStorage({
  destination: (_request, _file, callback) => {
    const uploadDirectory = path.join(os.tmpdir(), "siad-uploads")
    void fs
      .mkdir(uploadDirectory, { recursive: true })
      .then(() => callback(null, uploadDirectory))
      .catch((error) => callback(error as Error, uploadDirectory))
  },
  filename: (_request, file, callback) => {
    callback(null, `${randomUUID()}${path.extname(file.originalname)}`)
  },
})

export const uploadTestimonyFile = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_request, file, callback) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      callback(null, true)
      return
    }

    callback(new Error("Tipo de archivo no permitido"))
  },
})
