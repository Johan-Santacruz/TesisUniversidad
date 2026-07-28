import { useEffect, useState } from "react"

import { apiClient } from "../api/client"
import type { components } from "../api/generated"


export type AnalysisStage = components["schemas"]["AnalysisStage"]

export interface AnalysisEvent {
  id: number
  stage: AnalysisStage
  state: string
  payload: Record<string, unknown>
}


function parseBlock(block: string): AnalysisEvent | null {
  let id = 0
  let data = ""
  for (const line of block.split("\n")) {
    if (line.startsWith("id:")) {
      id = Number(line.slice(3).trim())
    }
    if (line.startsWith("data:")) {
      data += line.slice(5).trim()
    }
  }
  if (!id || !data) return null
  const value = JSON.parse(data) as Omit<AnalysisEvent, "id">
  return { id, ...value }
}


export async function consumeAnalysisStream(
  response: Response,
  onEvent: (event: AnalysisEvent) => void,
): Promise<void> {
  if (!response.body) {
    throw new Error("El navegador no recibió el flujo de análisis")
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  while (true) {
    const { value, done } = await reader.read()
    buffer += decoder.decode(value, { stream: !done }).replaceAll("\r\n", "\n")
    const blocks = buffer.split("\n\n")
    buffer = blocks.pop() ?? ""
    for (const block of blocks) {
      const event = parseBlock(block)
      if (event) onEvent(event)
    }
    if (done) break
  }
  const finalEvent = parseBlock(buffer)
  if (finalEvent) onEvent(finalEvent)
}


export function useAnalysisEvents(eventsUrl: string | null) {
  const [events, setEvents] = useState<AnalysisEvent[]>([])
  const [error, setError] = useState("")

  useEffect(() => {
    if (!eventsUrl) return
    let active = true
    let lastEventId = 0
    let routesSeen = false
    setEvents([])
    setError("")

    const run = async () => {
      let failures = 0
      while (active && !routesSeen) {
        try {
          const response = await apiClient.openStream(eventsUrl, lastEventId)
          await consumeAnalysisStream(response, (event) => {
            if (!active) return
            lastEventId = event.id
            routesSeen ||= event.stage === "routes"
            setEvents((current) => {
              if (current.some((item) => item.id === event.id)) return current
              return [...current, event]
            })
          })
          failures = 0
        } catch (caught) {
          failures += 1
          if (active && failures >= 3) {
            setError(
              caught instanceof Error
                ? caught.message
                : "Se interrumpió el análisis",
            )
          }
        }
        if (active && !routesSeen) {
          await new Promise((resolve) => window.setTimeout(resolve, 300))
        }
      }
    }
    void run()
    return () => {
      active = false
    }
  }, [eventsUrl])

  const routeEvent = events.find((event) => event.stage === "routes")
  const caseId = typeof routeEvent?.payload.case_id === "string"
    ? routeEvent.payload.case_id
    : null

  return { events, error, caseId }
}
