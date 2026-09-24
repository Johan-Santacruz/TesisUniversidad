import { afterEach, describe, expect, it, vi } from "vitest"

import { AUDIO_SAMPLE_RATE, encodeWav, extractAudio } from "./separar-audio"


// El Blob de jsdom no se deja leer por el Response de Node; FileReader sí.
function bytes(blob: Blob) {
  return new Promise<DataView>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(new DataView(reader.result as ArrayBuffer))
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(blob)
  })
}

function ascii(view: DataView, offset: number, length: number) {
  return String.fromCharCode(
    ...Array.from({ length }, (_, index) => view.getUint8(offset + index)),
  )
}


describe("encodeWav", () => {
  it("writes the 16-bit mono PCM header the server counts samples from", async () => {
    const view = await bytes(encodeWav(new Float32Array([0, 0.5, -0.5, 1]), 16_000))

    expect(ascii(view, 0, 4)).toBe("RIFF")
    expect(ascii(view, 8, 4)).toBe("WAVE")
    expect(view.getUint16(20, true)).toBe(1)
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint32(24, true)).toBe(16_000)
    expect(view.getUint16(34, true)).toBe(16)
    expect(ascii(view, 36, 4)).toBe("data")
    expect(view.getUint32(40, true)).toBe(8)
    expect(view.byteLength).toBe(44 + 8)
  })

  it("clips out-of-range samples instead of wrapping them", async () => {
    const view = await bytes(encodeWav(new Float32Array([2, -2]), 16_000))

    expect(view.getInt16(44, true)).toBe(0x7fff)
    expect(view.getInt16(46, true)).toBe(-0x8000)
  })
})


describe("extractAudio", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("decodes at 16 kHz and folds the channels into one", async () => {
    const decodeAudioData = vi.fn(async () => ({
      length: 2,
      sampleRate: AUDIO_SAMPLE_RATE,
      numberOfChannels: 2,
      duration: 2 / AUDIO_SAMPLE_RATE,
      getChannelData: (channel: number) =>
        channel === 0 ? new Float32Array([0.5, 0]) : new Float32Array([0.5, -1]),
    }))
    const created: number[] = []
    vi.stubGlobal(
      "OfflineAudioContext",
      class {
        constructor(_channels: number, _length: number, sampleRate: number) {
          created.push(sampleRate)
        }
        decodeAudioData = decodeAudioData
      },
    )

    const view = await bytes(
      await extractAudio(new Blob(["video"]), { probeDuration: async () => 2 / AUDIO_SAMPLE_RATE }),
    )

    expect(created).toEqual([AUDIO_SAMPLE_RATE])
    expect(view.getUint32(40, true)).toBe(4)
    // (0.5 + 0.5) / 2 y (0 - 1) / 2: el promedio de los dos canales.
    expect(view.getInt16(44, true)).toBe(0x3fff)
    expect(view.getInt16(46, true)).toBe(-0x4000)
  })

  it("refuses a file whose audio is empty", async () => {
    vi.stubGlobal(
      "OfflineAudioContext",
      class {
        decodeAudioData = async () => ({
          length: 0,
          sampleRate: AUDIO_SAMPLE_RATE,
          numberOfChannels: 1,
          getChannelData: () => new Float32Array(),
        })
      },
    )

    await expect(
      extractAudio(new Blob(["video"]), { probeDuration: async () => 1 }),
    ).rejects.toThrow()
  })

  it("refuses an audio shorter than the video it came from", async () => {
    // Lo que hace WebKit con un video largo: entrega 28 s y no avisa.
    vi.stubGlobal(
      "OfflineAudioContext",
      class {
        decodeAudioData = async () => ({
          length: 28 * AUDIO_SAMPLE_RATE,
          sampleRate: AUDIO_SAMPLE_RATE,
          numberOfChannels: 1,
          duration: 28,
          getChannelData: () => new Float32Array(28 * AUDIO_SAMPLE_RATE),
        })
      },
    )

    await expect(
      extractAudio(new Blob(["video"]), { probeDuration: async () => 101 }),
    ).rejects.toThrow("no cubre todo el video")
  })

  it("refuses when the file does not say how long it is", async () => {
    vi.stubGlobal(
      "OfflineAudioContext",
      class {
        decodeAudioData = async () => ({
          length: AUDIO_SAMPLE_RATE,
          sampleRate: AUDIO_SAMPLE_RATE,
          numberOfChannels: 1,
          duration: 1,
          getChannelData: () => new Float32Array(AUDIO_SAMPLE_RATE),
        })
      },
    )

    await expect(
      extractAudio(new Blob(["video"]), { probeDuration: async () => null }),
    ).rejects.toThrow()
  })

  it("gives up where the browser has no Web Audio", async () => {
    vi.stubGlobal("OfflineAudioContext", undefined)

    await expect(extractAudio(new Blob(["video"]))).rejects.toThrow()
  })
})
