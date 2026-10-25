import { useCallback, useEffect, useRef, useState } from "react"

import { apiClient } from "../../api/client"
import type { components } from "../../api/generated"


type CaseSummary = components["schemas"]["CaseSummaryRead"]
type CaseSummaryList = components["schemas"]["CaseSummaryList"]

export type HistoryFilter = "all" | "in_review" | "approved"

export const HISTORY_PAGE_SIZE = 20

interface HistoryState {
  status: "loading" | "ready" | "error"
  items: CaseSummary[]
  total: number
  error: string
  loadingMore: boolean
  moreError: string
}

const INITIAL: HistoryState = {
  status: "loading",
  items: [],
  total: 0,
  error: "",
  loadingMore: false,
  moreError: "",
}


function historyPath(filter: HistoryFilter, offset: number) {
  const params = new URLSearchParams({
    limit: String(HISTORY_PAGE_SIZE),
    offset: String(offset),
  })
  if (filter !== "all") params.set("status", filter)
  return `/api/v1/cases?${params}`
}

function failure(caught: unknown) {
  return caught instanceof Error && caught.message
    ? caught.message
    : "No se pudo cargar el historial."
}


/* El historial por páginas. Cada pedido lleva un número de turno: si la
 * persona cambia de filtro mientras otro pedido viaja, la respuesta vieja
 * llega tarde y se descarta en vez de pisar la lista nueva. */
export function useCaseHistory(filter: HistoryFilter) {
  const [state, setState] = useState<HistoryState>(INITIAL)
  const turnRef = useRef(0)

  const load = useCallback(() => {
    const turn = ++turnRef.current
    setState(INITIAL)
    apiClient.request<CaseSummaryList>(historyPath(filter, 0)).then(
      (page) => {
        if (turn !== turnRef.current) return
        setState({ ...INITIAL, status: "ready", items: page.items, total: page.total })
      },
      (caught) => {
        if (turn !== turnRef.current) return
        setState({ ...INITIAL, status: "error", error: failure(caught) })
      },
    )
  }, [filter])

  useEffect(() => {
    load()
    // Al desmontar, cualquier respuesta pendiente queda fuera de turno.
    return () => {
      turnRef.current += 1
    }
  }, [load])

  const loadMore = useCallback(() => {
    if (state.status !== "ready" || state.loadingMore) return
    if (state.items.length >= state.total) return
    const turn = turnRef.current
    setState((current) => ({ ...current, loadingMore: true, moreError: "" }))
    apiClient.request<CaseSummaryList>(historyPath(filter, state.items.length)).then(
      (page) => {
        if (turn !== turnRef.current) return
        setState((current) => {
          // Un caso nuevo corre la lista entre una página y la siguiente: el
          // que ya estaba al final volvería a llegar repetido.
          const known = new Set(current.items.map((item) => item.id))
          return {
            ...current,
            items: [...current.items, ...page.items.filter((item) => !known.has(item.id))],
            total: page.total,
            loadingMore: false,
          }
        })
      },
      (caught) => {
        if (turn !== turnRef.current) return
        setState((current) => ({
          ...current,
          loadingMore: false,
          moreError: failure(caught),
        }))
      },
    )
  }, [filter, state.status, state.loadingMore, state.items.length, state.total])

  return { ...state, hasMore: state.items.length < state.total, loadMore, retry: load }
}
