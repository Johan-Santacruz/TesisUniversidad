import { useEffect, useMemo, useRef, useState } from "react"

import { apiClient } from "../../api/client"
import type { components } from "../../api/generated"
import { useAnalysisEvents } from "../../hooks/use-analysis-events"
import { AnalysisProgress } from "./analysis-progress"
import { ClassificationPanel } from "./classification-panel"
import { RoutesComparison } from "./routes-comparison"
import { Timeline } from "./timeline"
import { UploadPanel } from "./upload-panel"
import { VerificationPanel } from "./verification-panel"
import { VideoPanel } from "./video-panel"


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
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null)
  const [videoSource, setVideoSource] = useState<string | null>(null)
  const [loadRemoteVideo, setLoadRemoteVideo] = useState(false)
  const [verificationOpen, setVerificationOpen] = useState(false)
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
    if (!selectedEvent || !caseData) return null
    return caseData.segments.find(
      (segment) =>
        selectedEvent.start_ms >= segment.start_ms
        && selectedEvent.start_ms <= segment.end_ms,
    ) ?? null
  }, [caseData, selectedEvent])

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
    seekTo(event.start_ms)
  }

  const selectSegment = (segment: Segment) => {
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
      <>
        <UploadPanel busy={busy} onUpload={upload} onDemo={useDemo} />
        {error ? <p className="workspace-error" role="alert">{error}</p> : null}
      </>
    )
  }

  if (!caseData) {
    return <AnalysisProgress events={stream.events} error={stream.error || error} />
  }

  return (
    <div className="analysis-workspace">
      <h1 className="visually-hidden">Análisis inteligente del video</h1>
      <div className="workspace-columns">
        <VideoPanel
          ref={videoRef}
          source={videoSource}
          segments={caseData.segments}
          activeSegmentId={activeSegment?.id ?? null}
          onSegmentSelect={selectSegment}
        />
        <div className="analysis-narrative">
          <Timeline
            events={caseData.timeline}
            selectedId={selectedEvent?.id ?? null}
            onSelect={selectEvent}
          />
          <ClassificationPanel classification={caseData.classification} />
        </div>
        <div className={verificationOpen ? "verification-shell is-open" : "verification-shell"}>
          <button
            type="button"
            className="verification-close"
            onClick={() => setVerificationOpen(false)}
          >
            Cerrar verificación
          </button>
          <VerificationPanel
            facts={caseData.facts}
            role={role}
            selectedStartMs={selectedEvent?.start_ms}
            onReview={review}
          />
        </div>
      </div>
      <button
        type="button"
        className="verification-trigger"
        onClick={() => setVerificationOpen(true)}
      >
        Abrir verificación
      </button>
      <RoutesComparison caseData={caseData} role={role} onApprove={approve} />
    </div>
  )
}
