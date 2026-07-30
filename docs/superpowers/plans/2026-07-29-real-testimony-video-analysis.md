# Real Testimony Video Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/subir-video` securely process a user-selected real testimony through actual transcription, BETO, independent GPT/Claude extraction, grounded official routes, progressive UI, review, and retention.

**Architecture:** Evolve the existing FastAPI/React pipeline instead of replacing it. Keep encrypted `AnalysisEvent` rows as immutable stage artifacts, add one mutable stage checkpoint per stage plus encrypted provider invocation traces, and expose typed readiness/retry/provenance contracts. The frontend submits real consented uploads, projects SSE generations into one current state per stage, and reveals only persisted payloads.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2, Alembic, SQLite/FTS5, OpenAI/Whisper, Anthropic, PyTorch/Transformers BETO, FFmpeg/FFprobe, React 19, TypeScript 5.7, Framer Motion 12, Vitest, Playwright, Axe.

## Global Constraints

- Work in the current main checkout; do not create another Git worktree.
- Preserve the untracked user-owned `Backend/package-lock.json`; never stage or delete it.
- Never read, print, copy, commit, or send the values of provider keys.
- Provider keys exist only in ignored `Backend/.env`; committed files contain empty examples.
- Real uploads use `data_kind=real`, explicit consent, and a nonblank authorization reference.
- Both provider keys, both ZDR confirmations, real-data enablement, and institutional authorization are required for real analysis.
- BETO availability is reported but does not close the gate; its failure produces a partial result.
- Keep `whisper-1`; transcription finishes before progressive result reveal begins.
- BETO remains category/subcategory only. Urgency is an LLM signal requiring human review.
- BETO processes segment windows within its 240-token capacity and never silently truncates testimony.
- No keyword/regex rules classify testimony content.
- Every extracted fact and timeline event cites canonical segment IDs.
- Routes cite only source IDs in the exact official-source snapshot supplied to the providers.
- Agreement between models may yield high confidence but never human-confirmed status.
- A real upload never falls back to deterministic demo payloads.
- MP4 and WebM are accepted up to `500 * 1024 * 1024` bytes; remove the unsupported MOV promise.
- A real video is scheduled for deletion at upload using the configured default of seven days; approval cannot extend the deadline.
- Framework-managed request spooling and a seek fallback may use restrictive request-scoped temporary files; delete them in `finally` and never place plaintext in application storage.
- Do not add Redis, Celery, a vector database, a third reconciliation model, or persisted audio.
- Automated tests never send the user’s real testimony or call paid providers by default.
- Every task follows RED → GREEN → focused regression → commit.

---

## File Structure

### Backend files to create

- `Backend/app/services/readiness.py` — sanitized pipeline readiness and gate enforcement.
- `Backend/app/services/media.py` — media probing, bounded audio extraction, and transient-file cleanup.
- `Backend/app/services/transcription.py` — chunk recomposition and canonical transcript IDs/timestamps.
- `Backend/app/services/analysis_state.py` — stage generations, atomic SSE events, invalidation, and resume.
- `Backend/app/services/model_trace.py` — encrypted metadata for each provider attempt.
- `Backend/app/services/route_planning.py` — exact-source snapshot validation and route reconciliation.
- `Backend/app/ai/prompts.py` — versioned extraction and routing instructions.
- `Backend/alembic/versions/0002_real_analysis_pipeline.py` — lifecycle and invocation schema.
- Focused unit/integration test files named in each task.

### Backend files to modify

- `Backend/app/config.py`
- `Backend/app/models.py`
- `Backend/app/schemas.py`
- `Backend/app/main.py`
- `Backend/app/api/videos.py`
- `Backend/app/api/analyses.py`
- `Backend/app/api/cases.py`
- `Backend/app/services/videos.py`
- `Backend/app/services/analysis.py`
- `Backend/app/services/cases.py`
- `Backend/app/services/retention.py`
- `Backend/app/services/rag.py`
- `Backend/app/ai/contracts.py`
- `Backend/app/ai/providers.py`
- `Backend/app/ai/beto.py`
- `Backend/app/ai/reconcile.py`
- `Backend/services/ml_service/classifier_service.py`
- `Backend/app/data/official_sources.json`
- Existing tests, `Backend/.env.example`, `README.md`, and `scripts/bootstrap-local.sh`.

### Frontend files to create

- `frontend/src/api/analysis-api.ts`
- `frontend/src/api/analysis-api.test.ts`
- `frontend/src/hooks/use-analysis-readiness.ts`
- `frontend/src/hooks/use-analysis-readiness.test.ts`
- `frontend/src/hooks/analysis-event-state.ts`
- `frontend/src/hooks/analysis-event-state.test.ts`
- `frontend/src/hooks/active-analysis-session.ts`
- `frontend/src/hooks/active-analysis-session.test.ts`
- `frontend/src/components/analysis/video-file.ts`
- `frontend/src/components/analysis/video-file.test.ts`
- `frontend/src/components/analysis/upload-panel.test.tsx`
- `frontend/src/components/analysis/analysis-processing-workspace.tsx`
- `frontend/src/components/analysis/analysis-processing-workspace.test.tsx`
- `frontend/e2e/real-analysis-fixture.ts`

### Frontend files to modify

- `frontend/src/components/analysis/upload-panel.tsx`
- `frontend/src/components/analysis/analysis-workspace.tsx`
- `frontend/src/components/analysis/analysis-progress.tsx`
- `frontend/src/components/analysis/video-panel.tsx`
- `frontend/src/components/analysis/classification-panel.tsx`
- `frontend/src/components/analysis/listening-stage.tsx`
- `frontend/src/components/analysis/evidence-stage.tsx`
- `frontend/src/components/analysis/timeline.tsx`
- `frontend/src/components/analysis/routes-comparison.tsx`
- `frontend/src/components/analysis/motion.ts`
- `frontend/src/hooks/use-analysis-events.ts`
- `frontend/src/pages/conversation-page.tsx`
- `frontend/src/test/case-fixture.ts`
- `frontend/src/index.css`
- Related existing tests and `frontend/e2e/smart-video.spec.ts`.
- Generated `Backend/openapi.json` and `frontend/src/api/generated.ts`.

---

### Task 1: Sanitized readiness, real consent gate, and upload-time retention

**Files:**
- Create: `Backend/app/services/readiness.py`
- Create: `Backend/tests/unit/test_readiness.py`
- Modify: `Backend/app/config.py`
- Modify: `Backend/app/schemas.py`
- Modify: `Backend/app/api/analyses.py`
- Modify: `Backend/app/services/videos.py`
- Modify: `Backend/app/services/cases.py`
- Modify: `Backend/app/main.py`
- Modify: `Backend/tests/unit/test_config.py`
- Modify: `Backend/tests/integration/test_video_api.py`
- Modify: `Backend/tests/integration/test_retention.py`
- Modify: `Backend/tests/integration/test_case_review.py`
- Modify: `Backend/.env.example`

**Interfaces:**
- Produces: `Settings.openai_configured`, `Settings.anthropic_configured`, `Settings.real_data_controls_ready`.
- Produces: `AnalysisReadinessService.check(role: UserRole) -> AnalysisReadinessRead`.
- Produces: `AnalysisReadinessService.require_real_ready() -> None`.
- Produces: authenticated `GET /api/v1/analyses/readiness`.
- Changes: real `Video.delete_after` is assigned during upload and preserved at approval.

- [ ] **Step 1: Write failing configuration and readiness tests**

```python
def test_real_controls_reject_blank_keys_and_authorization(settings_factory):
    settings = settings_factory(
        real_data_enabled=True,
        openai_zdr_confirmed=True,
        anthropic_zdr_confirmed=True,
        institutional_authorization_id="   ",
        openai_api_key="",
        anthropic_api_key=" ",
    )
    assert settings.openai_configured is False
    assert settings.anthropic_configured is False
    assert settings.real_data_controls_ready is False


def test_readiness_exposes_capabilities_without_secrets(settings_factory):
    service = AnalysisReadinessService(
        settings=settings_factory(),
        beto_available=False,
        command_available=lambda name: name in {"ffmpeg", "ffprobe"},
    )
    value = service.check(UserRole.OPERATOR).model_dump()
    assert set(value) == {
        "real_analysis_ready", "can_upload", "openai_configured",
        "anthropic_configured", "beto_available", "ffmpeg_available",
        "ffprobe_available", "accepted_media_types", "max_video_bytes",
        "video_retention_days",
    }
    assert "authorization" not in repr(value).lower()
```

- [ ] **Step 2: Run the focused tests and confirm RED**

Run:

```bash
cd Backend
PYTHONPATH=. .venv/bin/pytest \
  tests/unit/test_config.py \
  tests/unit/test_readiness.py -q
```

Expected: failures because normalized configuration properties, readiness schema,
and service do not exist.

- [ ] **Step 3: Implement normalized settings and readiness**

Use these public shapes:

```python
class AnalysisReadinessRead(BaseModel):
    real_analysis_ready: bool
    can_upload: bool
    openai_configured: bool
    anthropic_configured: bool
    beto_available: bool
    ffmpeg_available: bool
    ffprobe_available: bool
    accepted_media_types: list[Literal["video/mp4", "video/webm"]]
    max_video_bytes: int
    video_retention_days: int


class AnalysisReadinessService:
    def check(self, role: UserRole) -> AnalysisReadinessRead: ...
    def require_real_ready(self) -> None: ...
```

Normalize `institutional_authorization_id` with NFKC and `strip()`. Treat blank
`SecretStr` values as unconfigured. `real_analysis_ready` requires controls,
both commands, and both keys, but reports BETO separately without blocking.

- [ ] **Step 4: Write failing real-upload and retention assertions**

Add integration cases proving:

```python
assert upload_blank_reference.status_code == 422
assert upload_without_provider_keys.status_code == 403
assert uploaded_real["data_kind"] == "real"

with database.session() as session:
    stored = session.get(Video, uploaded_real["id"])
    assert stored.delete_after == upload_time + timedelta(days=7)

approved = validator.post(f"/api/v1/cases/{case_id}/approve", json=payload).json()
assert approved["video_delete_after"] == stored_deadline.isoformat()
```

- [ ] **Step 5: Implement gate, consent normalization, retention, and endpoint**

`VideoService._validate_data_gate()` must reject blank references before
encryption. Add `now` injection to `VideoService.create()` and assign:

```python
delete_after = (
    reference_now + timedelta(days=self.settings.video_retention_days)
    if data_kind is DataKind.REAL
    else None
)
```

Approval uses the existing deadline for real videos:

```python
if video.data_kind == DataKind.REAL.value:
    if video.delete_after is None:
        raise CaseConflictError("El testimonio real no tiene retención válida")
    delete_after = video.delete_after
else:
    delete_after = approved_at + timedelta(days=self.retention_days)
```

Expose readiness through the existing analyses router with `CurrentUser`. Set
`can_upload` only for `operador` and `admin`.

- [ ] **Step 6: Run focused backend regressions**

Run:

```bash
cd Backend
PYTHONPATH=. .venv/bin/pytest \
  tests/unit/test_config.py \
  tests/unit/test_readiness.py \
  tests/integration/test_video_api.py \
  tests/integration/test_retention.py \
  tests/integration/test_case_review.py -q
```

Expected: all selected tests pass.

- [ ] **Step 7: Commit Task 1**

```bash
git add Backend/app Backend/tests Backend/.env.example
git commit -m "feat: gate real testimony uploads safely"
```

---

### Task 2: Durable stage generations and encrypted model invocation traces

**Files:**
- Create: `Backend/alembic/versions/0002_real_analysis_pipeline.py`
- Create: `Backend/app/services/analysis_state.py`
- Create: `Backend/app/services/model_trace.py`
- Create: `Backend/tests/unit/test_analysis_state.py`
- Create: `Backend/tests/unit/test_model_trace.py`
- Modify: `Backend/app/models.py`
- Modify: `Backend/app/ai/contracts.py`
- Modify: `Backend/tests/integration/test_delivery_contract.py`
- Modify: `Backend/tests/unit/test_database.py`

**Interfaces:**
- Produces: one `AnalysisStageRun` checkpoint per `(analysis_id, stage)`.
- Produces: immutable `AnalysisEvent` rows with `generation` and `attempt`.
- Produces: encrypted `ModelInvocation` metadata.
- Produces: `StageRepository.claim`, `complete`, `fail`,
  `invalidate_descendants`, and `first_invalid`.
- Produces: `ModelInvocationTraceService.invoke`.

- [ ] **Step 1: Write failing migration/model tests**

```python
def test_analysis_has_one_checkpoint_per_stage(session, analysis):
    session.add_all([
        AnalysisStageRun(analysis_id=analysis.id, stage="audio", state="pending"),
        AnalysisStageRun(analysis_id=analysis.id, stage="audio", state="pending"),
    ])
    with pytest.raises(IntegrityError):
        session.flush()


def test_one_video_has_one_durable_analysis(session, video, user):
    session.add(Analysis(id="a1", video_id=video.id, requested_by_id=user.id))
    session.add(Analysis(id="a2", video_id=video.id, requested_by_id=user.id))
    with pytest.raises(IntegrityError):
        session.flush()
```

Extend the migration contract test to compare columns, unique constraints,
indexes, and foreign-key cascades rather than table names alone.

- [ ] **Step 2: Run the focused tests and confirm RED**

```bash
cd Backend
PYTHONPATH=. .venv/bin/pytest \
  tests/unit/test_analysis_state.py \
  tests/unit/test_model_trace.py \
  tests/integration/test_delivery_contract.py -q
```

- [ ] **Step 3: Add lifecycle models and migration**

Add:

```python
class AnalysisStageRun(TimestampMixin, Base):
    __tablename__ = "analysis_stage_runs"
    __table_args__ = (UniqueConstraint("analysis_id", "stage"),)
    id: Mapped[int]
    analysis_id: Mapped[str]
    stage: Mapped[str]
    state: Mapped[str]
    generation: Mapped[int]
    attempt: Mapped[int]
    started_at: Mapped[datetime | None]
    completed_at: Mapped[datetime | None]
    failure_code: Mapped[str | None]
    terminal_event_sequence: Mapped[int | None]


class ModelInvocation(EncryptedPayloadMixin, Base):
    __tablename__ = "model_invocations"
    id: Mapped[str]
    analysis_id: Mapped[str]
    stage: Mapped[str]
    provider: Mapped[str]
    model: Mapped[str]
    prompt_version: Mapped[str]
    attempt: Mapped[int]
    status: Mapped[str]
    error_code: Mapped[str | None]
    started_at: Mapped[datetime]
    completed_at: Mapped[datetime | None]
    duration_ms: Mapped[int | None]
```

Add `Analysis.next_event_sequence`, a unique constraint on `Analysis.video_id`,
and `generation`/`attempt` on `AnalysisEvent`. The Alembic migration must abort
with a clear exception if duplicate analyses already exist; never delete them.

- [ ] **Step 4: Implement stage repository and trace service**

Use immutable events for encrypted artifacts:

```python
class StageRepository:
    def claim(self, analysis_id: str, stage: AnalysisStage) -> AnalysisStageRun: ...
    def complete(
        self, analysis_id: str, stage: AnalysisStage, payload: dict[str, Any]
    ) -> AnalysisEvent: ...
    def fail(
        self, analysis_id: str, stage: AnalysisStage, code: str
    ) -> AnalysisEvent: ...
    def invalidate_descendants(
        self, analysis_id: str, stage: AnalysisStage
    ) -> list[AnalysisStage]: ...
    def first_invalid(self, analysis_id: str) -> AnalysisStage | None: ...
```

`claim` appends a `running` event and increments generation only after
invalidation/retry. `complete`/`fail` atomically reserve
`Analysis.next_event_sequence`. `ModelInvocationTraceService.invoke()` encrypts
only input segment/source IDs and a result event reference; plaintext columns
contain no testimony.

- [ ] **Step 5: Verify encryption and generation behavior**

Add assertions that database bytes do not contain sample segment text, exception
messages are reduced to safe class codes, retry keeps prior SSE rows, and only
the checkpoint points to the current generation.

Run:

```bash
cd Backend
PYTHONPATH=. .venv/bin/pytest \
  tests/unit/test_analysis_state.py \
  tests/unit/test_model_trace.py \
  tests/unit/test_database.py \
  tests/integration/test_delivery_contract.py -q
```

- [ ] **Step 6: Commit Task 2**

```bash
git add Backend/app/models.py Backend/app/services Backend/app/ai/contracts.py \
  Backend/alembic/versions/0002_real_analysis_pipeline.py Backend/tests
git commit -m "feat: persist resumable analysis stages"
```

---

### Task 3: Validate media and transcribe bounded audio without whole-video RAM

**Files:**
- Create: `Backend/app/services/media.py`
- Create: `Backend/app/services/transcription.py`
- Create: `Backend/tests/unit/test_media_pipeline.py`
- Create: `Backend/tests/unit/test_transcription.py`
- Modify: `Backend/app/services/videos.py`
- Modify: `Backend/app/ai/providers.py`
- Modify: `Backend/app/main.py`
- Modify: `Backend/tests/conftest.py`
- Modify: `Backend/tests/unit/test_audio.py`
- Modify: `Backend/tests/unit/test_ai_contracts.py`
- Modify: `Backend/tests/integration/test_video_api.py`

**Interfaces:**
- Produces: `MediaValidator.validate(source, max_bytes) -> MediaMetadata`.
- Produces: `VideoService.iter_plain_chunks(video) -> Iterator[bytes]`.
- Produces: `MediaPipeline.iter_audio_chunks(video) -> Iterator[AudioChunk]`.
- Produces: `WhisperAdapter.transcribe_chunk`.
- Produces: `TranscriptionService.transcribe`.

- [ ] **Step 1: Replace signature-only success fixtures and write failing media tests**

Generate deterministic valid MP4/WebM fixtures containing a sine-wave audio
track. Keep the old `ftyp` bytes only for rejection.

```python
def test_media_pipeline_never_requests_whole_plain_video(video_service, video):
    video_service.open_plain_bytes = Mock(side_effect=AssertionError("forbidden"))
    chunks = list(MediaPipeline(video_service).iter_audio_chunks(video))
    assert chunks
    assert all(len(chunk.wav_bytes) < 25 * 1024 * 1024 for chunk in chunks)


def test_real_upload_rejects_a_video_without_audio(real_operator_client, silent_mp4):
    response = upload_real(real_operator_client, silent_mp4)
    assert response.status_code == 422
    assert response.json()["detail"] == "El video no contiene una pista de audio"
```

- [ ] **Step 2: Run media/transcription tests and confirm RED**

```bash
cd Backend
PYTHONPATH=. .venv/bin/pytest \
  tests/unit/test_media_pipeline.py \
  tests/unit/test_transcription.py \
  tests/unit/test_audio.py \
  tests/integration/test_video_api.py -q
```

- [ ] **Step 3: Implement bounded media interfaces**

```python
@dataclass(frozen=True)
class MediaMetadata:
    media_type: Literal["video/mp4", "video/webm"]
    size_bytes: int
    duration_ms: int
    audio_stream_count: int


@dataclass(frozen=True)
class AudioChunk:
    index: int
    start_ms: int
    end_ms: int
    wav_bytes: bytes
```

Probe the seekable request stream with FFprobe, normalize errors, and always
rewind it. `VideoService.iter_plain_chunks()` must delegate to encrypted
`ChunkCipher.iter_range()`. `MediaPipeline` feeds those chunks into `Popen`
while draining stdout/stderr concurrently and emits mono 16-kHz WAV pieces that
remain below the provider limit.

Try the pipe path first. If a validated MP4 requires seeking, use a
`TemporaryDirectory` with directory mode `0700` and file mode `0600`; remove it
in `finally` and never place it under `storage_dir`.

- [ ] **Step 4: Implement canonical chunk transcription**

```python
class WhisperAdapter:
    def transcribe_chunk(
        self, audio: bytes, *, filename: str
    ) -> RawTranscriptChunk: ...


class TranscriptionService:
    def transcribe(
        self,
        *,
        analysis_id: str,
        video_id: str,
        chunks: Iterable[AudioChunk],
    ) -> TranscriptResult: ...
```

Offset local timestamps by `AudioChunk.start_ms`. Generate deterministic IDs
`segment-{chunk_index:04d}-{local_index:04d}` and strictly increasing
`order_index`. Reject no chunks, blank text, or zero valid segments. Do not
persist audio.

- [ ] **Step 5: Integrate validation before encrypted persistence**

`VideoService.create()` validates size, container, decodability, and audio before
creating the UUID storage directory. Map tool absence to 503, corrupt container
to 415, and no audio/empty media to 422. Persist only safe metadata.

- [ ] **Step 6: Run focused media regressions**

```bash
cd Backend
PYTHONPATH=. .venv/bin/pytest \
  tests/unit/test_media_pipeline.py \
  tests/unit/test_transcription.py \
  tests/unit/test_audio.py \
  tests/unit/test_ai_contracts.py \
  tests/unit/test_chunk_cipher.py \
  tests/integration/test_video_api.py -q
```

- [ ] **Step 7: Commit Task 3**

```bash
git add Backend/app/services/media.py Backend/app/services/transcription.py \
  Backend/app/services/videos.py Backend/app/ai/providers.py Backend/app/main.py \
  Backend/tests
git commit -m "feat: transcribe validated video in bounded chunks"
```

---

### Task 4: Token-safe BETO windows and truthful classification contract

**Files:**
- Modify: `Backend/services/ml_service/classifier_service.py`
- Modify: `Backend/app/ai/beto.py`
- Modify: `Backend/app/ai/contracts.py`
- Modify: `Backend/tests/unit/test_beto.py`
- Modify: `Backend/tests/integration/test_pipeline.py`

**Interfaces:**
- Produces: `ViolenceClassifier.count_tokens`.
- Produces: `ViolenceClassifier.predict_distribution`.
- Produces: `BetoAdapter.classify_segments`.
- Produces: `BetoWindowPrediction` and expanded `BetoClassification`.

- [ ] **Step 1: Write failing no-truncation and aggregation tests**

```python
def test_beto_groups_complete_segments_without_silent_truncation():
    classifier = FakeClassifier(max_len=12)
    result = BetoAdapter(classifier=classifier).classify_segments(segments)
    assert [window.segment_ids for window in result.windows] == [
        ["segment-1"], ["segment-2", "segment-3"]
    ]
    assert classifier.truncated_calls == []


def test_beto_preserves_the_real_artifact_label_shape():
    result = adapter.classify_segments(segments)
    assert result.category.label == "Desplazamiento forzado"
    assert "urgency" not in result.model_dump()
```

- [ ] **Step 2: Run BETO tests and confirm RED**

```bash
cd Backend
PYTHONPATH=. .venv/bin/pytest tests/unit/test_beto.py -q
```

- [ ] **Step 3: Expand strict classification contracts**

```python
class BetoWindowPrediction(StrictModel):
    window_id: str
    segment_ids: list[str]
    start_ms: int
    end_ms: int
    token_count: int
    category: LabelProbability
    subcategory: LabelProbability


class BetoClassification(StrictModel):
    status: Literal["available", "unavailable"]
    category: LabelProbability | None = None
    subcategory: LabelProbability | None = None
    windows: list[BetoWindowPrediction] = Field(default_factory=list)
    artifact_fingerprint: str | None = None
    unavailable_reason: str | None = None
```

- [ ] **Step 4: Implement full distributions, windowing, and aggregation**

`ViolenceClassifier.predict_distribution()` returns all class probabilities.
Group complete canonical segments within `max_len` including special tokens.
Never pass `truncation=True` for classification. If one segment exceeds the
capacity, return an explicit unavailable reason for that window.

Aggregate label distributions with a token-count-weighted arithmetic mean,
normalize, and label the result in the payload as an aggregate model score.
Retain every per-window prediction and a SHA-256 fingerprint of model,
encoders, tokenizer, and metrics configuration.

- [ ] **Step 5: Run focused BETO and pipeline contract tests**

```bash
cd Backend
PYTHONPATH=. .venv/bin/pytest \
  tests/unit/test_beto.py \
  tests/unit/test_ai_contracts.py \
  tests/integration/test_pipeline.py -q
```

- [ ] **Step 6: Commit Task 4**

```bash
git add Backend/services/ml_service/classifier_service.py Backend/app/ai \
  Backend/tests/unit/test_beto.py Backend/tests/integration/test_pipeline.py
git commit -m "feat: classify every testimony segment with BETO"
```

---

### Task 5: Independent extraction and grounded route-planning passes

**Files:**
- Create: `Backend/app/ai/prompts.py`
- Create: `Backend/app/services/route_planning.py`
- Create: `Backend/tests/unit/test_provider_passes.py`
- Create: `Backend/tests/unit/test_route_planning.py`
- Modify: `Backend/app/ai/contracts.py`
- Modify: `Backend/app/ai/providers.py`
- Modify: `Backend/app/ai/reconcile.py`
- Modify: `Backend/app/services/rag.py`
- Modify: `Backend/tests/unit/test_ai_contracts.py`
- Modify: `Backend/tests/unit/test_reconcile.py`
- Modify: `Backend/tests/unit/test_rag.py`
- Modify: `Backend/tests/smoke/test_real_providers.py`

**Interfaces:**
- Produces: `ProviderExtraction` separate from `ProviderRoutePlan`.
- Produces: `StructuredProvider.extract` and `plan_routes`.
- Produces: `ReconciliationService.reconcile_extractions`.
- Produces: exact source snapshots and `RoutePlanningService.reconcile`.

- [ ] **Step 1: Write failing strict contract tests**

```python
def test_extraction_cannot_return_programs_or_contacts():
    with pytest.raises(ValidationError):
        ProviderExtraction.model_validate({
            "provider": "gpt",
            "signals": [],
            "timeline": [],
            "beto_assessment": assessment,
            "programs": ["invented"],
        })


def test_route_step_rejects_a_source_not_in_the_request():
    result = reconcile_routes(
        gpt=plan_with("invented-source"),
        claude=None,
        allowed_source_ids={"uariv-services-national"},
    )
    assert result[0].steps == []
    assert result[0].summary == "Requiere confirmación con la entidad"
```

- [ ] **Step 2: Run provider/reconciliation tests and confirm RED**

```bash
cd Backend
PYTHONPATH=. .venv/bin/pytest \
  tests/unit/test_provider_passes.py \
  tests/unit/test_reconcile.py \
  tests/unit/test_rag.py \
  tests/unit/test_route_planning.py -q
```

- [ ] **Step 3: Define separate provider contracts**

```python
class BetoAssessment(StrictModel):
    category_verdict: Literal["supported", "disputed", "insufficient_evidence"]
    subcategory_verdict: Literal["supported", "disputed", "insufficient_evidence"]
    evidence_segment_ids: list[str]
    explanation: str


class ProviderExtraction(StrictModel):
    provider: Literal["gpt", "claude"]
    signals: list[ProviderSignal]
    timeline: list[ProviderTimelineEvent]
    beto_assessment: BetoAssessment


class ProviderRoutePlan(StrictModel):
    provider: Literal["gpt", "claude"]
    routes: list[ProviderRoute]
```

Provider output citations contain only `segment_id`; the backend expands
canonical start/end timestamps to prevent fabricated times.

- [ ] **Step 4: Implement versioned prompts and two adapter methods**

```python
EXTRACTION_PROMPT_VERSION = "siad-extraction-v1"
ROUTE_PROMPT_VERSION = "siad-routes-v1"


class StructuredProvider(Protocol):
    provider: Literal["gpt", "claude"]
    model: str
    def extract(self, request: ExtractionRequest) -> ProviderExtraction: ...
    def plan_routes(self, request: RoutePlanningRequest) -> ProviderRoutePlan: ...
```

Extraction input contains only current segments and canonical BETO. Route input
contains only the reconciled profile, allowed route types, and exact source
records. Preserve OpenAI `store=False`; Anthropic uses its independent strict
parse contract.

- [ ] **Step 5: Reconcile evidence without granting human confirmation**

Change matching valid readings to:

```python
origin = Origin.CONTRASTED
verification_status = VerificationStatus.PENDING
confidence_band = ConfidenceBand.HIGH
```

Unknown evidence invalidates only that provider. Group timeline candidates by
canonical cited time range; unmatched valid candidates remain pending/medium.
Never use a third model to reconcile.

- [ ] **Step 6: Retrieve and enforce the exact source snapshot**

Add:

```python
def RagCatalog.active_for_routes(
    self, route_types: set[RouteType]
) -> dict[RouteType, list[SourceView]]: ...
```

Filter active/non-retired records by route metadata. `RoutePlanningService`
validates against IDs in this returned snapshot, not every row in the database.
Discard only invalid steps. A route with no valid steps retains its required
route type and the explicit confirmation disclaimer.

- [ ] **Step 7: Run focused provider and grounding regressions**

```bash
cd Backend
PYTHONPATH=. .venv/bin/pytest \
  tests/unit/test_ai_contracts.py \
  tests/unit/test_provider_passes.py \
  tests/unit/test_reconcile.py \
  tests/unit/test_rag.py \
  tests/unit/test_route_planning.py -q
```

- [ ] **Step 8: Commit Task 5**

```bash
git add Backend/app/ai Backend/app/services/rag.py \
  Backend/app/services/route_planning.py Backend/tests
git commit -m "feat: ground independent provider analysis"
```

---

### Task 6: Verify the curated official-source snapshot

**Files:**
- Modify: `Backend/app/data/official_sources.json`
- Modify: `Backend/tests/unit/test_rag.py`
- Modify: `README.md`

**Interfaces:**
- Produces: a current, authoritative source snapshot for all three route types.
- Preserves: stable IDs used by tests and existing persisted cases where the
  underlying official record remains valid.

- [ ] **Step 1: Write failing source-quality assertions**

```python
def test_every_seed_is_official_current_and_actionable():
    seeds = load_official_sources()
    assert set(RouteType) <= {
        RouteType(route) for seed in seeds for route in seed.route_types
    }
    for seed in seeds:
        assert seed.url.startswith("https://")
        assert seed.verified_at < seed.expires_at
        assert seed.entity.strip()
        assert seed.program.strip()
        assert seed.contact.strip()
```

- [ ] **Step 2: Verify each existing URL against its primary official domain**

Use only authoritative pages from:

- `unidadvictimas.gov.co`
- `icbf.gov.co`
- `defensoria.gov.co` or its official legal compilation host

Record the actual verification date. Keep direct program/service pages, remove
dead redirects, and do not add inferred availability, cupos, or undocumented
requirements.

- [ ] **Step 3: Update seeds and expiry windows**

Contacts expire after 30 days and program records after 90 days, matching the
existing catalog policy. Every route must have at least one active record.
When a channel cannot be verified, store the conservative contact instruction
and let `SourceView.disclaimer` communicate confirmation requirements.

- [ ] **Step 4: Run source tests**

```bash
cd Backend
PYTHONPATH=. .venv/bin/pytest tests/unit/test_rag.py tests/integration/test_sources_api.py -q
```

- [ ] **Step 5: Commit Task 6**

```bash
git add Backend/app/data/official_sources.json Backend/tests/unit/test_rag.py README.md
git commit -m "docs: refresh official route sources"
```

---

### Task 7: Resumable orchestrator, secure retry, SSE lifecycle, and cleanup worker

**Files:**
- Create: `Backend/tests/integration/test_analysis_resume.py`
- Create: `Backend/tests/integration/test_analysis_retry.py`
- Modify: `Backend/app/services/analysis.py`
- Modify: `Backend/app/services/cases.py`
- Modify: `Backend/app/services/retention.py`
- Modify: `Backend/app/api/analyses.py`
- Modify: `Backend/app/api/cases.py`
- Modify: `Backend/app/schemas.py`
- Modify: `Backend/app/main.py`
- Modify: `Backend/tests/integration/test_pipeline.py`
- Modify: `Backend/tests/integration/test_analysis_sse.py`
- Modify: `Backend/tests/integration/test_case_review.py`
- Modify: `Backend/tests/integration/test_case_deletion.py`

**Interfaces:**
- Produces: `AnalysisService.start_or_get`, `retry`, `run`, and
  `recover_incomplete`.
- Produces: authenticated `GET /api/v1/analyses/{analysis_id}`.
- Produces: authenticated `POST /api/v1/analyses/{analysis_id}/retry`.
- Produces: typed `AnalysisStageState`, `AnalysisEventRead`, and event snapshots
  on `AnalysisRead`.
- Produces: SSE running/terminal generations with replay.
- Produces: startup recovery and periodic retention cleanup.

- [ ] **Step 1: Write failing lifecycle and isolation tests**

```python
def test_starting_the_same_video_twice_schedules_one_analysis(client, real_video):
    first = client.post(f"/api/v1/videos/{real_video.id}/analyses")
    second = client.post(f"/api/v1/videos/{real_video.id}/analyses")
    assert first.json()["id"] == second.json()["id"]
    assert fake_runner.enqueued == [first.json()["id"]]


def test_second_video_never_receives_first_video_segments(configured_client):
    first = run_video(configured_client, transcript="Relato alfa")
    second = run_video(configured_client, transcript="Relato beta")
    assert "alfa" not in json.dumps(second.events).lower()
    assert first.analysis_id != second.analysis_id
```

Add retry-after-review rejection, deleted/expired consent rejection, provider
partial states, and resume-from-transcription tests.

- [ ] **Step 2: Run lifecycle tests and confirm RED**

```bash
cd Backend
PYTHONPATH=. .venv/bin/pytest \
  tests/integration/test_pipeline.py \
  tests/integration/test_analysis_resume.py \
  tests/integration/test_analysis_retry.py \
  tests/integration/test_analysis_sse.py -q
```

- [ ] **Step 3: Refactor the uploaded pipeline into stage functions**

Keep `AnalysisService` as the public facade:

```python
@dataclass(frozen=True)
class StartAnalysisResult:
    analysis: Analysis
    scheduled: bool


class AnalysisService:
    def start_or_get(
        self, session: Session, *, video: Video, user: User
    ) -> StartAnalysisResult: ...
    def run(self, analysis_id: str) -> None: ...
    def retry(
        self, session: Session, *, analysis: Analysis, user: User
    ) -> Analysis: ...
    def recover_incomplete(self) -> list[str]: ...
```

True compute order is audio → transcription → BETO → provider extraction →
reconciliation → sources → route planning. Publish the approved visual stage
order while retaining true invocation timestamps in traces.

Each stage first checks its current checkpoint and decrypts a reusable terminal
event when valid. Case/facts/routes are transactionally upserted with stable IDs.
No successful retry duplicates them.

If both providers fail, preserve completed transcription/BETO checkpoints, mark
the analysis `partial`, create no case or routes, and make provider extraction
the first retryable stage.

- [ ] **Step 4: Enforce start/retry authorization and consent**

Before scheduling real analysis, validate:

- owner or admin starts it;
- readiness remains open;
- video is not deleted or due;
- consent exists, belongs to the owner, is not revoked, and decrypts to
  `explicit=true` plus a nonblank reference.

Retry is allowed to owner, validator, or admin only when status is `partial` or
`failed`. Reject retry with 409 after any human `Review` exists. Invalidate from
the first failed/unavailable stage and keep immutable SSE history.

- [ ] **Step 5: Make SSE state and case reading generation-aware**

Add these Pydantic contracts so event replay and recovery are present in
OpenAPI instead of being handwritten only in TypeScript:

```python
class AnalysisStageState(StrEnum):
    RUNNING = "running"
    COMPLETED = "completed"
    UNAVAILABLE = "unavailable"
    FAILED = "failed"


class AnalysisEventRead(BaseModel):
    sequence: int
    stage: AnalysisStage
    state: AnalysisStageState
    generation: int
    attempt: int
    occurred_at: datetime
    payload: dict[str, Any]
```

`AnalysisRead.events` contains the persisted snapshot of current and historical
events for reload recovery. SSE emits the same `AnalysisEventRead` JSON and
repeats `sequence` in the SSE `id` field:

```json
{
  "stage": "transcription",
  "state": "completed",
  "generation": 1,
  "attempt": 1,
  "occurred_at": "2026-07-29T00:00:00Z",
  "payload": {}
}
```

Replay respects `Last-Event-ID`. The stream ends only when analysis status is
`completed`, `partial`, or `failed`. `CaseService.read()` uses the terminal event
sequence referenced by each checkpoint, never a stale generation or current
`running` event.

Add `data_kind`, `is_demo`, and `video_delete_after` to `CaseRead`. Enforce
owner/validator/admin access on case reads.

- [ ] **Step 6: Run startup recovery and periodic retention**

```python
def RetentionService.run_once(
    self, database: Database, *, now: datetime | None = None
) -> int: ...
```

Run cleanup once on lifespan startup and in one cancellable hourly task. Recover
queued/interrupted analysis IDs at startup and enqueue them through the same
local runner. Cancel and await both tasks on shutdown. The SQLite deployment
remains single-process.

- [ ] **Step 7: Run focused integration regressions**

```bash
cd Backend
PYTHONPATH=. .venv/bin/pytest \
  tests/integration/test_pipeline.py \
  tests/integration/test_analysis_resume.py \
  tests/integration/test_analysis_retry.py \
  tests/integration/test_analysis_sse.py \
  tests/integration/test_case_review.py \
  tests/integration/test_case_deletion.py \
  tests/integration/test_retention.py -q
```

- [ ] **Step 8: Commit Task 7**

```bash
git add Backend/app Backend/tests
git commit -m "feat: resume and retry real video analysis"
```

---

### Task 8: Publish typed OpenAPI contracts and a focused frontend API boundary

**Files:**
- Create: `frontend/src/api/analysis-api.ts`
- Create: `frontend/src/api/analysis-api.test.ts`
- Modify: `Backend/openapi.json` (generated)
- Modify: `frontend/src/api/generated.ts` (generated)

**Interfaces:**
- Consumes: readiness, video, analysis, retry, and enriched case schemas.
- Produces: `fetchAnalysisReadiness`, `uploadRealVideo`, `startAnalysis`,
  `getAnalysis`, and `retryAnalysis`.

- [ ] **Step 1: Regenerate contracts**

```bash
./scripts/generate-contracts.sh
./scripts/generate-contracts.sh --check
```

Inspect generated types and fail this task if `AnalysisReadinessRead`,
`AnalysisEventRead`, enriched `AnalysisRead`, enriched `CaseRead`, or retry
responses remain untyped.

- [ ] **Step 2: Write failing frontend API tests**

```typescript
it("uploads an explicitly consented real testimony", async () => {
  await uploadRealVideo({
    file: new File(["video"], "testimonio.webm", { type: "video/webm" }),
    consentReference: " AUT-2026-001 ",
  })
  const body = fetchMock.calls[0][1]?.body as FormData
  expect(body.get("data_kind")).toBe("real")
  expect(body.get("explicit_consent")).toBe("true")
  expect(body.get("consent_reference")).toBe("AUT-2026-001")
})
```

- [ ] **Step 3: Implement API functions**

```typescript
export async function fetchAnalysisReadiness(
  signal?: AbortSignal,
): Promise<components["schemas"]["AnalysisReadinessRead"]> { ... }

export async function uploadRealVideo(input: {
  file: File
  consentReference: string
}): Promise<VideoRead> { ... }

export async function startAnalysis(videoId: string): Promise<AnalysisRead> { ... }
export async function getAnalysis(analysisId: string): Promise<AnalysisRead> { ... }
export async function retryAnalysis(analysisId: string): Promise<AnalysisRead> { ... }
```

Export concise aliases from the generated contract:

```typescript
export type AnalysisReadiness =
  components["schemas"]["AnalysisReadinessRead"]
export type AnalysisEvent = components["schemas"]["AnalysisEventRead"]
export type AnalysisRead = components["schemas"]["AnalysisRead"]
export type VideoRead = components["schemas"]["VideoRead"]
```

Do not set multipart `Content-Type`; let the browser generate the boundary.

- [ ] **Step 4: Run API and contract checks**

```bash
cd frontend
npm test -- --run src/api/analysis-api.test.ts
cd ..
./scripts/generate-contracts.sh --check
```

- [ ] **Step 5: Commit Task 8**

```bash
git add Backend/openapi.json frontend/src/api/generated.ts frontend/src/api
git commit -m "feat: expose typed real analysis API"
```

---

### Task 9: Real upload preview, validation, consent, and readiness UX

**Files:**
- Create: `frontend/src/hooks/use-analysis-readiness.ts`
- Create: `frontend/src/hooks/use-analysis-readiness.test.ts`
- Create: `frontend/src/components/analysis/video-file.ts`
- Create: `frontend/src/components/analysis/video-file.test.ts`
- Create: `frontend/src/components/analysis/upload-panel.test.tsx`
- Modify: `frontend/src/components/analysis/upload-panel.tsx`
- Modify: `frontend/src/components/analysis/analysis-workspace.tsx`
- Modify: `frontend/src/index.css`
- Modify: `frontend/src/components/analysis/analysis-workspace.test.tsx`

**Interfaces:**
- Consumes: `AnalysisReadiness`.
- Produces: `RealVideoSubmission`.
- Produces: local preview metadata with deterministic cleanup.

- [ ] **Step 1: Write failing validation and preview tests**

```typescript
expect(validateVideoFile(empty, readiness)).toEqual({
  ok: false,
  message: "El archivo de video está vacío.",
})
expect(validateVideoFile(oversized, readiness).ok).toBe(false)
expect(validateVideoFile(mov, readiness).ok).toBe(false)
```

In component tests assert object URL creation/revocation, finite duration,
consent reset on file replacement, retained state after network error, and demo
availability while the real gate is closed.

- [ ] **Step 2: Run upload tests and confirm RED**

```bash
cd frontend
npm test -- --run \
  src/components/analysis/video-file.test.ts \
  src/hooks/use-analysis-readiness.test.ts \
  src/components/analysis/upload-panel.test.tsx \
  src/components/analysis/analysis-workspace.test.tsx
```

- [ ] **Step 3: Implement the readiness hook and file helper**

```typescript
export type VideoPreview = {
  file: File
  objectUrl: string
  durationSeconds: number
  sizeLabel: string
  mediaType: "video/mp4" | "video/webm"
}

export type RealVideoSubmission = {
  file: File
  consentReference: string
}
```

Abort readiness fetch on unmount. Validate picker and drop identically. Revoke
the object URL on replacement/unmount. Metadata failure disables submission.

- [ ] **Step 4: Rebuild the upload panel within the approved editorial layout**

`UploadPanel` receives:

```typescript
{
  busyPhase: "idle" | "uploading" | "starting"
  readiness: AnalysisReadiness | null
  readinessStatus: "loading" | "ready" | "error"
  error?: string
  onReadinessRetry: () => void
  onUpload: (submission: RealVideoSubmission) => Promise<void> | void
  onDemo: () => Promise<void> | void
}
```

Show preview, name, size, duration, confidentiality note, consent checkbox, and
reference field. The primary action is `Iniciar análisis`. Disable it until
preview, gate, consent, and trimmed reference are valid. Keep demo secondary.
Disable picker/drop during an active upload.

- [ ] **Step 5: Send real FormData and preserve an uploaded video on start error**

`AnalysisWorkspace` calls `uploadRealVideo()` then `startAnalysis()`. If start
fails after upload succeeds, retain the `VideoRead` and retry start without
uploading a duplicate. Use an in-flight ref in addition to disabled controls.

- [ ] **Step 6: Run focused frontend tests**

```bash
cd frontend
npm test -- --run \
  src/components/analysis/video-file.test.ts \
  src/hooks/use-analysis-readiness.test.ts \
  src/components/analysis/upload-panel.test.tsx \
  src/components/analysis/analysis-workspace.test.tsx
```

- [ ] **Step 7: Commit Task 9**

```bash
git add frontend/src/hooks frontend/src/components/analysis \
  frontend/src/index.css
git commit -m "feat: prepare real testimony uploads"
```

---

### Task 10: Generation-aware SSE, session recovery, and progressive editorial reveal

**Files:**
- Create: `frontend/src/hooks/analysis-event-state.ts`
- Create: `frontend/src/hooks/analysis-event-state.test.ts`
- Create: `frontend/src/hooks/active-analysis-session.ts`
- Create: `frontend/src/hooks/active-analysis-session.test.ts`
- Create: `frontend/src/components/analysis/analysis-processing-workspace.tsx`
- Create: `frontend/src/components/analysis/analysis-processing-workspace.test.tsx`
- Modify: `frontend/src/hooks/use-analysis-events.ts`
- Modify: `frontend/src/hooks/use-analysis-events.test.ts`
- Modify: `frontend/src/components/analysis/analysis-progress.tsx`
- Modify: `frontend/src/components/analysis/analysis-progress.test.tsx`
- Modify: `frontend/src/components/analysis/analysis-workspace.tsx`
- Modify: `frontend/src/components/analysis/video-panel.tsx`
- Modify: `frontend/src/components/analysis/classification-panel.tsx`
- Modify: `frontend/src/components/analysis/listening-stage.tsx`
- Modify: `frontend/src/components/analysis/evidence-stage.tsx`
- Modify: `frontend/src/components/analysis/timeline.tsx`
- Modify: `frontend/src/components/analysis/routes-comparison.tsx`
- Modify: `frontend/src/components/analysis/motion.ts`
- Modify: `frontend/src/pages/conversation-page.tsx`
- Modify: `frontend/src/test/case-fixture.ts`
- Modify: `frontend/src/index.css`

**Interfaces:**
- Produces: one current event projection per stage/generation.
- Produces: owner-scoped non-sensitive active analysis recovery.
- Produces: progressive processing UI from terminal payloads only.
- Produces: correct real/demo player labels and BETO/provider contrast.

- [ ] **Step 1: Write failing event projection tests**

```typescript
const projection = reduceAnalysisEvents([
  running("transcription", 1, 1),
  completed("transcription", 1, 2, { segments }),
  running("transcription", 2, 3),
])
expect(projection.byStage.transcription.state).toBe("running")
expect(projection.byStage.transcription.payload).toEqual({})
expect(projection.completedStageCount).toBe(0)
```

Add assertions that a `running routes` event does not stop the stream, terminal
EOF does, duplicate sequences are ignored, and reconnect uses the latest ID.

- [ ] **Step 2: Run event/progress tests and confirm RED**

```bash
cd frontend
npm test -- --run \
  src/hooks/analysis-event-state.test.ts \
  src/hooks/use-analysis-events.test.ts \
  src/components/analysis/analysis-progress.test.tsx
```

- [ ] **Step 3: Implement generation-aware stream state**

`useAnalysisEvents(eventsUrl)` returns:

```typescript
{
  events,
  projection,
  connectionState:
    "idle" | "connecting" | "open" | "reconnecting" | "terminal",
  error,
  caseId,
  retryable,
  reconnect,
}
```

Deduplicate by sequence, reconnect with `Last-Event-ID`, and clear transient
errors on success. Progress counts unique stages in terminal states and never
counts `running` twice.

- [ ] **Step 4: Implement non-sensitive session recovery**

Persist only:

```typescript
type ActiveAnalysisSession = {
  version: 1
  ownerId: string
  video: VideoRead
  analysis: AnalysisRead | null
  caseId: string | null
}
```

Never persist files, object URLs, consent references, transcript, facts, routes,
or event payloads. Clear owner-scoped state on logout. After reload, call
`getAnalysis()` and replay SSE from persisted events. Clear when the case opens
or the user explicitly starts over.

- [ ] **Step 5: Render real terminal payloads progressively**

`AnalysisProcessingWorkspace` consumes the projection. Before transcription
completes it shows only real stage status. Then it reveals persisted segments,
signals, classification, timeline, and routes in stage order using stable IDs
and existing Framer Motion variants. No timer fabricates progress or data.

Use one atomic `aria-live` status region; do not make the full narrative sheet
live. Reduced motion reveals the same content immediately.

- [ ] **Step 6: Render truthful classification and provenance**

Show unchanged BETO aggregate plus per-window evidence, GPT verdict, Claude
verdict, confidence, and pending human status. Timeline nodes expose available
date/place/people/fact/evidence time/origin/confidence/verification.

`DocumentaryVideoRail` receives:

```typescript
{
  dataKind: "fictitious" | "real"
  isDemo: boolean
}
```

Use `Caso real · acceso protegido` for real data and keep synthetic copy only
for demo. Missing or expired route support says exactly
`Requiere confirmación con la entidad`.

- [ ] **Step 7: Add retry UI without erasing persisted work**

When the backend marks an analysis partial/failed without a case, show the first
invalid stage, preserved completed stages, and `Reintentar desde esta etapa`.
Call `retryAnalysis()` once under an in-flight lock and reconnect to the same
analysis ID.

- [ ] **Step 8: Run focused UI regressions**

```bash
cd frontend
npm test -- --run \
  src/hooks/analysis-event-state.test.ts \
  src/hooks/active-analysis-session.test.ts \
  src/hooks/use-analysis-events.test.ts \
  src/components/analysis/analysis-processing-workspace.test.tsx \
  src/components/analysis/analysis-progress.test.tsx \
  src/components/analysis/analysis-workspace.test.tsx \
  src/components/analysis/narrative-motion.test.tsx \
  src/components/analysis/timeline.test.tsx
```

- [ ] **Step 9: Commit Task 10**

```bash
git add frontend/src
git commit -m "feat: reveal persisted real analysis progressively"
```

---

### Task 11: Deterministic E2E, delivery setup, and full verification

**Files:**
- Create: `frontend/e2e/real-analysis-fixture.ts`
- Modify: `frontend/e2e/smart-video.spec.ts`
- Modify: `scripts/bootstrap-local.sh`
- Modify: `README.md`
- Modify: `Backend/.env.example`
- Modify: `Makefile` only if a focused opt-in provider target is needed.

**Interfaces:**
- Produces: deterministic browser coverage without external provider costs.
- Produces: documented local key/ZDR setup without committing secret values.
- Produces: one manual real-video handoff procedure.

- [ ] **Step 1: Add deterministic intercepted E2E fixtures**

Intercept readiness, real upload, start, SSE generations, case read, and retry.
Assert the outgoing multipart fields. Never include a real testimony or key.

Cover:

- gate unavailable while demo remains available;
- valid real preview/consent/upload;
- running then terminal events;
- progressive transcript/signals/timeline/routes;
- retry and reload recovery;
- correct real/demo labels;
- keyboard/focus and reduced motion;
- Axe at 360, 768, and 1440 px.

- [ ] **Step 2: Run targeted E2E and fix only observed failures**

```bash
cd frontend
npm run e2e -- --grep "testimonio real|recupera|reintenta"
```

- [ ] **Step 3: Update bootstrap and operations documentation**

Install the ML extra needed for actual BETO:

```bash
.venv/bin/pip install -e ".[test,ml]"
```

Document that the user must populate the six real-data/provider variables in
local `Backend/.env`, without pasting them into chat or source control. Document
`make backend`, `make frontend`, login, manual upload, expected eight stages,
provider cost warning, retry, and seven-day video deletion.

- [ ] **Step 4: Run the complete backend suite**

```bash
cd Backend
PYTHONPATH=. .venv/bin/pytest -q
```

Expected: all backend tests pass; the external provider smoke remains skipped
unless explicitly enabled.

- [ ] **Step 5: Run the complete frontend suite and build**

```bash
cd frontend
npm test -- --run
npm run build
npm run e2e
```

Expected: all Vitest and Playwright tests pass, build succeeds, and Axe reports
no serious/critical violations at the three required widths.

- [ ] **Step 6: Verify migrations, contracts, and repository hygiene**

```bash
cd Backend
.venv/bin/alembic upgrade head
cd ..
./scripts/generate-contracts.sh --check
git diff --check
git status --short
```

Expected: migration succeeds, generated files match, whitespace check is clean,
and `Backend/package-lock.json` remains the only unrelated untracked file.

- [ ] **Step 7: Perform a security-focused diff review**

Search the diff and committed tree for:

```bash
rg -n "SIAD_OPENAI_API_KEY=.+|SIAD_ANTHROPIC_API_KEY=.+" \
  --glob '!Backend/.env' .
rg -n "transcript|consent_reference|api_key" Backend/app/logging.py Backend/app/services
```

Expected: no committed secret values and no plaintext testimony/consent logging.
Inspect every provider call for current-analysis-only inputs and `store=False`
on OpenAI structured responses.

- [ ] **Step 8: Commit Task 11**

```bash
git add frontend/e2e scripts/bootstrap-local.sh README.md Backend/.env.example
git commit -m "test: verify real testimony analysis flow"
```

- [ ] **Step 9: Record manual handoff without calling providers automatically**

Report:

- exact commands to start both services;
- local URL and login;
- where the user adds keys privately;
- supported formats/limits;
- expected stage order;
- how to retry;
- the retention deadline behavior;
- any real-provider step that still requires the user’s own manual upload.
