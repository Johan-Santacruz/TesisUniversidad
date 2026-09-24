/* El análisis sólo escucha. Del video de un celular le basta el audio, que
   pesa decenas de veces menos: 147 MB de video son 3 MB de audio a 16 kHz.
   Separarlo aquí deja que el análisis arranque en segundos mientras el video
   sigue subiendo, en vez de esperar minutos a que llegue entero. */

// Lo mismo que el servidor le pide a ffmpeg antes de mandar el audio a
// Whisper: 16 kHz y un solo canal. Más no le sirve a nadie y pesa más.
export const AUDIO_SAMPLE_RATE = 16_000

// La misma holgura con que el servidor compara este audio con el video cuando
// llega: el relleno del AAC y las listas de edición no pasan de décimas.
const DURATION_TOLERANCE_S = 1.5
const METADATA_TIMEOUT_MS = 10_000


export async function extractAudio(
  file: Blob,
  { probeDuration = mediaDuration }: { probeDuration?: (file: Blob) => Promise<number | null> } = {},
): Promise<Blob> {
  if (typeof OfflineAudioContext === "undefined") {
    throw new Error("Este navegador no decodifica audio")
  }
  // El contexto no reproduce nada: sólo fija la frecuencia a la que
  // decodeAudioData entrega las muestras, así que el remuestreo lo hace el
  // navegador al decodificar.
  const context = new OfflineAudioContext(1, 1, AUDIO_SAMPLE_RATE)
  const [decoded, expected] = await Promise.all([
    file.arrayBuffer().then((data) => context.decodeAudioData(data)),
    probeDuration(file),
  ])
  if (decoded.length === 0) {
    throw new Error("El video no trae audio")
  }
  // WebKit decodifica los videos largos a medias y no avisa: devuelve unos
  // 28 segundos de un relato de dos minutos. Analizar eso sería leer medio
  // testimonio, así que si el audio no dura lo que el video se sube el video
  // entero y el servidor lo separa como siempre.
  if (
    expected === null
    || Math.abs(decoded.duration - expected)
      > Math.max(DURATION_TOLERANCE_S, expected / 100)
  ) {
    throw new Error("El audio decodificado no cubre todo el video")
  }
  return encodeWav(downmix(decoded), decoded.sampleRate)
}


/* Duración que declara el propio archivo, leída como la lee el reproductor.
   null si el navegador no la sabe: sin ella no hay contra qué comprobar. */
function mediaDuration(file: Blob): Promise<number | null> {
  const url = URL.createObjectURL(file)
  const media = document.createElement("video")
  return new Promise<number | null>((resolve) => {
    const timer = window.setTimeout(() => settle(null), METADATA_TIMEOUT_MS)
    function settle(value: number | null) {
      window.clearTimeout(timer)
      media.removeAttribute("src")
      media.load()
      URL.revokeObjectURL(url)
      resolve(value)
    }
    media.preload = "metadata"
    media.muted = true
    media.onloadedmetadata = () =>
      settle(Number.isFinite(media.duration) && media.duration > 0 ? media.duration : null)
    media.onerror = () => settle(null)
    media.src = url
  })
}


function downmix(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0)
  const mono = new Float32Array(buffer.length)
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const samples = buffer.getChannelData(channel)
    for (let index = 0; index < mono.length; index += 1) {
      mono[index] += samples[index]
    }
  }
  for (let index = 0; index < mono.length; index += 1) {
    mono[index] /= buffer.numberOfChannels
  }
  return mono
}


/* WAV PCM de 16 bits: el servidor lo lee con el módulo wave de Python y
   cuenta sus muestras para saber cuánto dura el audio que se analizó. */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const dataBytes = samples.length * 2
  const header = new DataView(new ArrayBuffer(44))
  const ascii = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) {
      header.setUint8(offset + index, text.charCodeAt(index))
    }
  }
  ascii(0, "RIFF")
  header.setUint32(4, 36 + dataBytes, true)
  ascii(8, "WAVE")
  ascii(12, "fmt ")
  header.setUint32(16, 16, true)
  header.setUint16(20, 1, true)
  header.setUint16(22, 1, true)
  header.setUint32(24, sampleRate, true)
  header.setUint32(28, sampleRate * 2, true)
  header.setUint16(32, 2, true)
  header.setUint16(34, 16, true)
  ascii(36, "data")
  header.setUint32(40, dataBytes, true)

  const pcm = new DataView(new ArrayBuffer(dataBytes))
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]))
    pcm.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
  }
  return new Blob([header.buffer, pcm.buffer], { type: "audio/wav" })
}
