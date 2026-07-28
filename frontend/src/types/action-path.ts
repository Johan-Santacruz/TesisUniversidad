export type ActionFragment = {
  id: string
  text: string
  reference: string
}

export type ActionSignal = {
  id: string
  numero: string
  titulo: string
  evidencia: string
  fraseOrigen: string
  incierta?: boolean
}

export type ActionUrgency = "inmediata" | "prioritaria" | "importante"

export type ActionRouteStep = {
  id: string
  numero: string
  nombre: string
  entidad: string
  porQue: string
  quePreparar: string
  urgencia: ActionUrgency
  senalOrigen: string
}

export type ActionPathData = {
  fragments: ActionFragment[]
  signals: ActionSignal[]
  routeSteps: ActionRouteStep[]
}
