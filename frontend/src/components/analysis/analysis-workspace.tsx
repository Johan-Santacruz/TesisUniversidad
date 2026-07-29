import { useEffect, useMemo, useRef, useState } from "react"

import { apiClient } from "../../api/client"
import type { components } from "../../api/generated"
import { useAnalysisEvents } from "../../hooks/use-analysis-events"
import { AnalysisProgress } from "./analysis-progress"
import { EvidenceStage, riskLabelForFacts } from "./evidence-stage"
import { ListeningStage } from "./listening-stage"
import {
  NarrativeStageHeader,
  type NarrativeStage,
} from "./narrative-stage"
import { RouteStage } from "./route-stage"
import { UploadPanel } from "./upload-panel"
import { DocumentaryVideoRail } from "./video-panel"


type CaseData = components["schemas"]["CaseRead"]
type FactReview = components["schemas"]["FactReviewRequest"]
type Role = components["schemas"]["UserRole"]
type VideoRead = components["schemas"]["VideoRead"]
type AnalysisRead = components["schemas"]["AnalysisRead"]
type TimelineEvent = components["schemas"]["TimelineEventRead"]
type Segment = components["schemas"]["TranscriptSegment"]


export function AnalysisWorkspace({
  initialCase,
  role,
}: {
  initialCase?: CaseData
  role: Role
}) {
  const [caseData, setCaseData] = useState<CaseData | null>(initialCase ?? null)
  const [eventsUrl, setEventsUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [narrativeStage, setNarrativeStage] = useState<NarrativeStage>("listening")
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null)
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null)
  const [videoSource, setVideoSource] = useState<string | null>(null)
  const [loadRemoteVideo, setLoadRemoteVideo] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const stream = useAnalysisEvents(eventsUrl)

  useEffect(() => {
    if (!stream.caseId) return
    let active = true
    apiClient.request<CaseData>(`/api/v1/cases/${stream.caseId}`).then(
      (value) => {
        if (!active) return
        setCaseData(value)
        setBusy(false)
        setLoadRemoteVideo(true)
      },
      (caught) => {
        if (active) {
          setBusy(false)
          setError(caught instanceof Error ? caught.message : "No se pudo abrir el caso")
        }
      },
    )
    return () => {
      active = false
    }
  }, [stream.caseId])

  useEffect(() => {
    if (!caseData || !loadRemoteVideo) return
    let active = true
    let localUrl: string | null = null
    apiClient.download(caseData.video_stream_url).then(
      (blob) => {
        if (!active) return
        localUrl = URL.createObjectURL(blob)
        setVideoSource(localUrl)
      },
      () => {
        if (active) setVideoSource(null)
      },
    )
    return () => {
      active = false
      if (localUrl) URL.revokeObjectURL(localUrl)
    }
  }, [caseData, loadRemoteVideo])

  const activeSegment = useMemo(() => {
    if (!caseData) return null
    const explicitlySelected = caseData.segments.find(
      (segment) => segment.id === selectedSegmentId,
    )
    if (explicitlySelected) return explicitlySelected
    if (!selectedEvent) return caseData.segments[0] ?? null
    return caseData.segments.find(
      (segment) =>
        selectedEvent.start_ms >= segment.start_ms
        && selectedEvent.start_ms <= segment.end_ms,
    ) ?? null
  }, [caseData, selectedEvent, selectedSegmentId])

  const startAnalysis = async (video: VideoRead) => {
    const analysis = await apiClient.request<AnalysisRead>(
      `/api/v1/videos/${video.id}/analyses`,
      { method: "POST" },
    )
    setEventsUrl(analysis.events_url)
  }

  const useDemo = async () => {
    setBusy(true)
    setError("")
    setNarrativeStage("listening")
    setSelectedEvent(null)
    setSelectedSegmentId(null)
    try {
      const video = await apiClient.request<VideoRead>("/api/v1/videos/demo", {
        method: "POST",
      })
      await startAnalysis(video)
    } catch (caught) {
      setBusy(false)
      setError(caught instanceof Error ? caught.message : "No se pudo iniciar la demostración")
    }
  }

  const upload = async (file: File) => {
    setBusy(true)
    setError("")
    setNarrativeStage("listening")
    setSelectedEvent(null)
    setSelectedSegmentId(null)
    const body = new FormData()
    body.append("file", file)
    body.append("data_kind", "fictitious")
    try {
      const video = await apiClient.request<VideoRead>("/api/v1/videos", {
        method: "POST",
        body,
      })
      await startAnalysis(video)
    } catch (caught) {
      setBusy(false)
      setError(caught instanceof Error ? caught.message : "No se pudo cargar el video")
    }
  }

  const seekTo = (milliseconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = milliseconds / 1000
    }
  }

  const selectEvent = (event: TimelineEvent) => {
    setSelectedEvent(event)
    const segment = caseData?.segments.find(
      (item) =>
        event.start_ms >= item.start_ms && event.start_ms <= item.end_ms,
    )
    setSelectedSegmentId(segment?.id ?? null)
    seekTo(event.start_ms)
  }

  const selectSegment = (segment: Segment) => {
    setSelectedSegmentId(segment.id)
    seekTo(segment.start_ms)
    const event = caseData?.timeline.find(
      (item) =>
        item.start_ms >= segment.start_ms && item.start_ms <= segment.end_ms,
    )
    if (event) setSelectedEvent(event)
  }

  const review = async (factId: string, payload: FactReview) => {
    if (!caseData) return
    const fact = await apiClient.request<components["schemas"]["FactRead"]>(
      `/api/v1/cases/${caseData.id}/facts/${factId}`,
      { method: "PATCH", body: JSON.stringify(payload) },
    )
    setCaseData((current) => {
      if (!current) return current
      const facts = current.facts.map((item) => item.id === fact.id ? fact : item)
      return {
        ...current,
        facts,
        critical_inconsistencies: facts.filter(
          (item) => item.is_critical && item.verification_status !== "confirmed",
        ).length,
      }
    })
  }

  const approve = async () => {
    if (!caseData) return
    const approved = await apiClient.request<components["schemas"]["CaseApprovalRead"]>(
      `/api/v1/cases/${caseData.id}/approve`,
      {
        method: "POST",
        body: JSON.stringify({
          confirmed_route_types: caseData.routes.map((route) => route.route_type),
        }),
      },
    )
    setCaseData({
      ...caseData,
      status: approved.status,
      recommendation_status: approved.recommendation_status,
      approved_at: approved.approved_at,
      routes: caseData.routes.map((route) => ({
        ...route,
        verification_status: "confirmed",
        confidence_band: "high",
      })),
    })
  }

  if (!caseData && !eventsUrl) {
    return (
      <UploadPanel
        busy={busy}
        error={error}
        onUpload={upload}
        onDemo={useDemo}
      />
    )
  }

  if (!caseData) {
    return <AnalysisProgress events={stream.events} error={stream.error || error} />
  }

  const riskLabel = riskLabelForFacts(caseData.facts)

  return (
    <div className="analysis-workspace">
      <div className="narrative-workspace-grid">
        <DocumentaryVideoRail
          ref={videoRef}
          source={videoSource}
          segments={caseData.segments}
          activeSegmentId={activeSegment?.id ?? null}
          onSegmentSelect={selectSegment}
        />
        <main className="narrative-sheet" aria-live="polite">
          <NarrativeStageHeader
            stage={narrativeStage}
            onStageChange={setNarrativeStage}
            aside={
              narrativeStage === "evidence"
                ? (
                    <span className="risk-summary-header" role="status">
                      {riskLabel}
                    </span>
                  )
                : undefined
            }
          />
          <div key={narrativeStage} className="narrative-stage-content">
            {narrativeStage === "listening" ? (
              <ListeningStage
                segments={caseData.segments}
                activeSegmentId={activeSegment?.id ?? null}
                onSelect={selectSegment}
              />
            ) : null}
            {narrativeStage === "evidence" ? (
              <EvidenceStage
                classification={caseData.classification}
                facts={caseData.facts}
                role={role}
                selectedStartMs={activeSegment?.start_ms}
                onReview={review}
              />
            ) : null}
            {narrativeStage === "route" ? (
              <RouteStage
                caseData={caseData}
                role={role}
                selectedId={selectedEvent?.id ?? null}
                onTimelineSelect={selectEvent}
                onApprove={approve}
              />
            ) : null}
          </div>
          <footer className="narrative-stage-actions">
            <p>Los cambios quedan guardados en el caso.</p>
            {narrativeStage !== "route" ? (
              <button
                type="button"
                onClick={() => setNarrativeStage(
                  narrativeStage === "listening" ? "evidence" : "route",
                )}
              >
                {narrativeStage === "listening"
                  ? "Revisar señales"
                  : "Continuar a la ruta"}{" "}
                <span aria-hidden="true">→</span>
              </button>
            ) : null}
          </footer>
        </main>
      </div>
    </div>
  )
}
