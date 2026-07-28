export type RouteUrgency = "critica" | "alta" | "media"

export type RouteStep = {
  id: string
  title: string
  entity: string
  reason: string
  action: string
  documents: string[]
  urgency: RouteUrgency
}

export type NeedSignal = {
  id: string
  evidence: string
}
