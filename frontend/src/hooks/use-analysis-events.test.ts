import { expect, it, vi } from "vitest"

import { consumeAnalysisStream } from "./use-analysis-events"


it("parses persisted SSE events split across network chunks", async () => {
  const encoder = new TextEncoder()
  const chunks = [
    "id: 1\nevent: audio\ndata: {\"stage\":\"audio\",\"state\":\"completed\",",
    "\"payload\":{\"audio_present\":true}}\n\n",
    "id: 2\nevent: transcription\ndata: {\"stage\":\"transcription\",\"state\":\"completed\",\"payload\":{\"segments\":[]}}\n\n",
  ]
  const response = new Response(
    new ReadableStream({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)))
        controller.close()
      },
    }),
  )
  const onEvent = vi.fn()

  await consumeAnalysisStream(response, onEvent)

  expect(onEvent).toHaveBeenCalledTimes(2)
  expect(onEvent.mock.calls[0][0]).toMatchObject({
    id: 1,
    stage: "audio",
    state: "completed",
  })
  expect(onEvent.mock.calls[1][0].id).toBe(2)
})
