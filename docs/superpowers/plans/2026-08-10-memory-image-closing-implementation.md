# Memory Image Closing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reviewed, encrypted, case-specific memory image and produce an optional MP4 derivative with a seven-second institutional closing card while preserving the original video.

**Architecture:** A pure visual-context builder minimizes reconciled case data, an OpenAI adapter generates one landscape image composed for a 16:9 safe crop, and a `MemoryImageService` owns generation and review state. Images are encrypted as file assets; approved images are cropped to the 16:9 video frame and rendered with FFmpeg into a new encrypted `Video` derivative linked through `RenderedVideo`. The existing analysis remains authoritative and completes even when image generation fails.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2, Alembic, OpenAI Python SDK, AES-256-GCM, FFmpeg/FFprobe, React 19, TypeScript, Vitest, Testing Library.

## Global Constraints

- The generator receives only a structured, minimized summary; never the video, full transcript, names, or testimony quotations.
- The provider source is 1536×1024 and must preserve a centered 16:9 safe area; SIAD displays and renders that safe area at 16:9. The scene is documentary and symbolic, with no explicit violence, identifiable faces, generated text, logos, flags, or shields.
- Only validators and administrators may approve, reject, or regenerate an image.
- The original video is immutable and remains the evidentiary source.
- The derivative adds exactly seven seconds and labels the image as representative rather than evidentiary.
- Image-provider or render failures never change an otherwise complete analysis to `partial` or `failed`.
- Image bytes, prompt context, prompt text, decision details, and derivative video bytes are encrypted at rest.
- The demo path performs no paid provider call.
- Existing uncommitted workspace changes belong to the user; every commit must stage only files named by its task.

---

## File map

- `Backend/app/ai/memory_images.py`: visual context contract, deterministic prompt builder, generated-image contract, OpenAI image adapter.
- `Backend/app/services/assets.py`: encrypted small-file storage for generated images.
- `Backend/app/services/memory_images.py`: generation, review, render orchestration, state transitions, and audit records.
- `Backend/app/services/memory_video.py`: isolated FFmpeg render operation and output validation.
- `Backend/app/entities.py`: `MemoryImage` and `RenderedVideo` persistence models.
- `Backend/app/schemas.py`: API summaries and decision contracts.
- `Backend/app/api/cases.py`: protected image, decision, regeneration, and derivative-stream endpoints.
- `Backend/app/services/analysis.py`: non-critical initial generation hook after route persistence.
- `Backend/app/services/videos.py`: encryption and persistence of a validated derived MP4.
- `Backend/app/services/cases.py`: expose closing state and include closing resources in total deletion.
- `Backend/app/services/retention.py`: include linked derivative resources in retention behavior.
- `Backend/app/main.py`: compose image provider, asset store, memory-image service, and renderer.
- `Backend/alembic/versions/0004_memory_image_closing.py`: schema migration.
- `Backend/app/data/demo-memory-image.png`: deterministic synthetic closing image for demo cases.
- `frontend/src/components/analysis/memory-image-panel.tsx`: review UI and original/derivative selector.
- `frontend/src/components/analysis/analysis-workspace.tsx`: state and API integration.
- `frontend/src/components/analysis/route-stage.tsx`: place the closing panel after routes.
- `frontend/src/index.css`: responsive, accessible closing-card styles.

### Task 1: Persistence and public contracts

**Files:**
- Modify: `Backend/app/entities.py`
- Modify: `Backend/app/schemas.py`
- Modify: `Backend/app/config.py`
- Modify: `Backend/.env.example`
- Create: `Backend/alembic/versions/0004_memory_image_closing.py`
- Modify: `Backend/tests/unit/test_config.py`
- Modify: `Backend/tests/unit/test_database.py`

**Interfaces:**
- Produces: `MemoryImage`, `RenderedVideo`, `MemoryImageRead`, `MemoryImageDecisionRequest`, `MemoryImageDecisionRead`.
- Produces settings: `openai_image_model: str`, `memory_image_max_bytes: int`, `memory_image_prompt_version: str`, `memory_closing_seconds: int`.

- [ ] **Step 1: Write failing configuration and schema tests**

Add assertions that defaults are exactly:

```python
assert settings.openai_image_model == "gpt-image-1"
assert settings.memory_image_max_bytes == 10 * 1024 * 1024
assert settings.memory_image_prompt_version == "memory-image-v1"
assert settings.memory_closing_seconds == 7
```

Add a schema-creation test that inspects SQLite and expects `memory_images` and `rendered_videos`, plus uniqueness on `(case_id, generation)` and on `rendered_videos.memory_image_id`.

- [ ] **Step 2: Run the focused tests and confirm the failure**

Run: `cd Backend && PYTHONPATH=. .venv/bin/pytest tests/unit/test_config.py tests/unit/test_database.py -q`

Expected: FAIL because the settings and tables do not exist.

- [ ] **Step 3: Add entities and request/response schemas**

Add `MemoryImage` with UUID `id`, `case_id`, integer `generation`, state string, provider/model/prompt version, context hash, image MIME/dimensions/plaintext size, metadata columns `key_version`, `nonce`, `ciphertext`, encrypted-file columns `asset_key_version`, `asset_nonce`, `storage_path`, `ciphertext_size`, reviewer and timestamps. Add `RenderedVideo` with UUID `id`, unique `memory_image_id`, `case_id`, nullable unique `video_id`, state, failure code, and timestamps.

Use these API shapes:

```python
class MemoryImageRead(BaseModel):
    id: str
    generation: int
    status: Literal[
        "generating", "pending_review", "approved", "rejected", "failed"
    ]
    image_url: str | None
    rendered_video_url: str | None
    failure_code: str | None
    reviewed_at: datetime | None


class MemoryImageDecisionRequest(BaseModel):
    action: Literal["approve", "reject"]


class MemoryImageDecisionRead(BaseModel):
    memory_image: MemoryImageRead
```

Extend `CaseRead` with `memory_image: MemoryImageRead | None = None`.

- [ ] **Step 4: Add settings and migration**

Add bounded settings (`memory_image_max_bytes` from 1 MiB to 25 MiB, `memory_closing_seconds` fixed by validation to 7) and document their `SIAD_` environment names. Create migration `0004` with `down_revision = "0003_remove_real_data_gate"`, foreign keys using `ON DELETE CASCADE`, indexes on both `case_id` columns, and the uniqueness constraints from Step 1.

- [ ] **Step 5: Run tests and migration checks**

Run: `cd Backend && PYTHONPATH=. .venv/bin/pytest tests/unit/test_config.py tests/unit/test_database.py -q`

Expected: PASS.

- [ ] **Step 6: Commit only Task 1 files**

```bash
git add Backend/app/entities.py Backend/app/schemas.py Backend/app/config.py Backend/.env.example Backend/alembic/versions/0004_memory_image_closing.py Backend/tests/unit/test_config.py Backend/tests/unit/test_database.py
git commit -m "feat: add memory image persistence contracts"
```

### Task 2: Minimized visual context and OpenAI image adapter

**Files:**
- Create: `Backend/app/ai/memory_images.py`
- Create: `Backend/tests/unit/test_memory_image_ai.py`

**Interfaces:**
- Consumes: reconciled classification and fact dictionaries.
- Produces: `VisualContext`, `GeneratedImage`, `build_visual_context(classification: dict[str, Any], facts: list[dict[str, Any]]) -> VisualContext`, `build_memory_prompt(context: VisualContext) -> str`, `OpenAIMemoryImageAdapter.generate(prompt: str) -> GeneratedImage`.

- [ ] **Step 1: Write failing minimization tests**

Cover a payload containing `people`, a named person, exact testimony text, locations, dates, classification, urgency, and vulnerabilities. Assert the resulting contract contains only:

```python
VisualContext(
    category="Desplazamiento",
    subcategory="Desplazamiento forzado",
    setting="rural a urbano",
    period="periodo reciente",
    themes=("desarraigo", "tránsito", "búsqueda de protección"),
)
```

Assert no serialized form contains the person's name, transcript phrase, segment identifier, exact address, or keys `people` and `current_location`.

- [ ] **Step 2: Write failing prompt-policy tests**

Assert `build_memory_prompt(context)` includes `16:9`, `documental`, `simbólica`, a quiet text area, and every prohibition from the design. Assert it does not interpolate exact person or place strings. Assert the prompt is deterministic for the same context.

- [ ] **Step 3: Write failing adapter tests**

Use a fake client whose `images.generate` returns one `b64_json`. Verify this exact request shape:

```python
client.images.generate(
    model="gpt-image-1",
    prompt=prompt,
    size="1536x1024",
    quality="high",
    output_format="png",
)
```

Test malformed Base64, empty output, non-PNG signature, and payload over `max_bytes`; all must raise `MemoryImageProviderError` without returning bytes.

- [ ] **Step 4: Run tests and confirm the failures**

Run: `cd Backend && PYTHONPATH=. .venv/bin/pytest tests/unit/test_memory_image_ai.py -q`

Expected: FAIL because `app.ai.memory_images` does not exist.

- [ ] **Step 5: Implement the pure contracts, prompt, and adapter**

Use frozen Pydantic models or frozen dataclasses. Decode Base64 with validation, require the PNG magic bytes `b"\x89PNG\r\n\x1a\n"`, and enforce `0 < len(data) <= max_bytes`. Keep provider exceptions behind `MemoryImageProviderError` so service code never depends on SDK exception classes.

- [ ] **Step 6: Run tests and commit**

Run: `cd Backend && PYTHONPATH=. .venv/bin/pytest tests/unit/test_memory_image_ai.py -q`

Expected: PASS.

```bash
git add Backend/app/ai/memory_images.py Backend/tests/unit/test_memory_image_ai.py
git commit -m "feat: build privacy-safe memory image prompts"
```

### Task 3: Encrypted image asset storage

**Files:**
- Create: `Backend/app/services/assets.py`
- Create: `Backend/tests/unit/test_assets.py`

**Interfaces:**
- Consumes: `EnvelopeCipher`, `storage_dir`, asset UUID, bytes.
- Produces: `StoredAsset`, `EncryptedAssetStore.write(asset_id: str, purpose: str, data: bytes) -> StoredAsset`, `read(asset_id: str, purpose: str, asset: StoredAsset) -> bytes`, and `delete(asset: StoredAsset) -> None`.

- [ ] **Step 1: Write failing round-trip and safety tests**

Verify that `write(asset_id, purpose="memory-image", data=png)` creates exactly one `.bin` under `storage/memory-images/<asset_id>/`, that plaintext PNG markers are absent from the file, and that `read` returns the original bytes. Verify duplicate writes fail, traversal-like IDs fail validation, and deleting twice is harmless.

- [ ] **Step 2: Run the test and confirm failure**

Run: `cd Backend && PYTHONPATH=. .venv/bin/pytest tests/unit/test_assets.py -q`

Expected: FAIL because `EncryptedAssetStore` does not exist.

- [ ] **Step 3: Implement storage with exclusive file creation**

Define:

```python
@dataclass(frozen=True)
class StoredAsset:
    key_version: int
    nonce: bytes
    storage_path: str
    plaintext_size: int
    ciphertext_size: int
```

Validate `asset_id` with `UUID(asset_id)`, derive encryption using `EnvelopeCipher.encrypt_bytes(asset_id, purpose, data)`, open the target with `os.O_CREAT | os.O_EXCL` and mode `0o600`, and return a path relative to the configured storage root. On any failure, remove the partial file and newly created empty directory.

- [ ] **Step 4: Run tests and commit**

Run: `cd Backend && PYTHONPATH=. .venv/bin/pytest tests/unit/test_assets.py -q`

Expected: PASS.

```bash
git add Backend/app/services/assets.py Backend/tests/unit/test_assets.py
git commit -m "feat: store generated images encrypted"
```

### Task 4: Memory image generation service and deterministic demo

**Files:**
- Create: `Backend/app/services/memory_images.py`
- Create: `Backend/app/data/demo-memory-image.png`
- Modify: `Backend/app/services/analysis.py`
- Modify: `Backend/app/main.py`
- Create: `Backend/tests/unit/test_memory_images.py`
- Modify: `Backend/tests/integration/test_pipeline.py`

**Interfaces:**
- Consumes: `Database`, `EnvelopeCipher`, `EncryptedAssetStore`, optional image adapter, `AuditService`.
- Produces: `MemoryImageService.generate_initial(case_id: str, *, is_demo: bool) -> None` and `MemoryImageService.regenerate(case_id: str, actor: User) -> MemoryImage`.

- [ ] **Step 1: Create the demo bitmap asset**

Generate one original 1536×1024 PNG with a rural Colombian path transitioning toward a distant urban horizon, restrained documentary color, no visible faces, no text, no logos, no weapons, and generous dark negative space along the lower third. Inspect it visually and store it at the exact path above.

- [ ] **Step 2: Write failing service-state tests**

Test these transitions:

```text
no row -> generating -> pending_review
pending_review -> rejected (old generation) + generating -> pending_review (new generation)
provider missing -> failed / image_provider_not_configured
provider exception -> failed / image_generation_failed
```

Assert generation numbers increase monotonically, metadata ciphertext contains neither prompt nor place text in plaintext, and image bytes are delegated to `EncryptedAssetStore`.

- [ ] **Step 3: Write failing analysis integration tests**

For the demo analysis, assert one `MemoryImage` reaches `pending_review` and no provider is called. For an uploaded analysis with no image provider, assert the analysis still completes or remains partial only for its existing provider reasons while the image row is `failed`.

- [ ] **Step 4: Run tests and confirm failure**

Run: `cd Backend && PYTHONPATH=. .venv/bin/pytest tests/unit/test_memory_images.py tests/integration/test_pipeline.py -q`

Expected: FAIL because the service and hook do not exist.

- [ ] **Step 5: Implement generation without holding database transactions across provider calls**

In one short session, calculate the next generation, insert `generating`, encrypt context/prompt metadata, and commit. Call the provider or read the demo file after the session closes. Store the image, then open a new session and transition to `pending_review`. On failure, open a new session and transition to `failed` with a fixed failure code and encrypted diagnostic class name.

Build visual context only from the classification event and persisted fact payloads; pass no transcript segments to `build_visual_context`.

- [ ] **Step 6: Hook generation after route persistence**

Inject an optional `memory_images` service into `AnalysisService`. Immediately after the `routes` event is appended, call:

```python
try:
    self.memory_images.generate_initial(case_id, is_demo=is_demo)
except Exception:
    logger.exception("memory_image_generation_failed", extra={"case_id": case_id})
```

Do not append a ninth `AnalysisStage` and do not alter `partial` calculation.

- [ ] **Step 7: Compose the service in `create_app`**

Construct `OpenAIMemoryImageAdapter` only when OpenAI is configured, then compose `EncryptedAssetStore` and `MemoryImageService`. Expose it as `application.state.memory_images` and inject the same instance into `AnalysisService`.

- [ ] **Step 8: Run tests and commit**

Run: `cd Backend && PYTHONPATH=. .venv/bin/pytest tests/unit/test_memory_images.py tests/integration/test_pipeline.py -q`

Expected: PASS.

```bash
git add Backend/app/services/memory_images.py Backend/app/data/demo-memory-image.png Backend/app/services/analysis.py Backend/app/main.py Backend/tests/unit/test_memory_images.py Backend/tests/integration/test_pipeline.py
git commit -m "feat: generate memory images after analysis"
```

### Task 5: Review, regeneration, protected image API, and case summary

**Files:**
- Modify: `Backend/app/schemas.py`
- Modify: `Backend/app/services/memory_images.py`
- Modify: `Backend/app/services/cases.py`
- Modify: `Backend/app/api/cases.py`
- Create: `Backend/tests/integration/test_memory_image_api.py`

**Interfaces:**
- Consumes: active `MemoryImage` and validator/admin actor.
- Produces endpoints: image content, regenerate, and decision; `CaseRead.memory_image`.

- [ ] **Step 1: Write failing API tests**

Cover:

- authenticated case owner can read the active image but cannot decide or regenerate;
- unrelated operator receives 403 for image content;
- validator can regenerate and receives generation `2` in `pending_review`;
- validator can reject; rejected content is no longer served;
- validator can approve; state becomes `approved`;
- a second decision on the same generation returns 409;
- audit ciphertext records action and generation without plaintext prompt;
- image responses have `Cache-Control: private, no-store`, the stored MIME, and an exact content length.

- [ ] **Step 2: Run the focused integration test and confirm failure**

Run: `cd Backend && PYTHONPATH=. .venv/bin/pytest tests/integration/test_memory_image_api.py -q`

Expected: FAIL with missing endpoints and missing `memory_image` field.

- [ ] **Step 3: Add service methods and state guards**

Implement the exact service signatures `active_for_case(self, session: Session, case_id: str) -> MemoryImage | None`, `read_image(self, image: MemoryImage) -> bytes`, and `decide(self, session: Session, *, image: MemoryImage, action: Literal["approve", "reject"], actor: User) -> MemoryImage`.

Only `pending_review` may transition to `approved` or `rejected`. Persist reviewer/time, encrypt the decision metadata, and add `memory_image_approved`, `memory_image_rejected`, or `memory_image_regenerated` audit records.

- [ ] **Step 4: Add case serialization and endpoints**

Return URLs only when valid:

```python
image_url = (
    f"/api/v1/cases/{case.id}/memory-image/content"
    if image.status in {"pending_review", "approved"}
    else None
)
```

Implement endpoints from the design using `CurrentUser` for content and `ValidatorUser` for mutations. Use the same owner-or-validator authorization rule as video streaming.

- [ ] **Step 5: Run tests and commit**

Run: `cd Backend && PYTHONPATH=. .venv/bin/pytest tests/integration/test_memory_image_api.py tests/integration/test_case_review.py -q`

Expected: PASS.

```bash
git add Backend/app/schemas.py Backend/app/services/memory_images.py Backend/app/services/cases.py Backend/app/api/cases.py Backend/tests/integration/test_memory_image_api.py
git commit -m "feat: review case memory images"
```

### Task 6: Seven-second closing render and derivative streaming

**Files:**
- Create: `Backend/app/services/memory_video.py`
- Modify: `Backend/app/services/videos.py`
- Modify: `Backend/app/services/memory_images.py`
- Modify: `Backend/app/services/cases.py`
- Modify: `Backend/app/api/cases.py`
- Modify: `Backend/app/main.py`
- Create: `Backend/tests/unit/test_memory_video.py`
- Modify: `Backend/tests/integration/test_memory_image_api.py`

**Interfaces:**
- Produces: `MemoryVideoRenderer.render(video: Video, image_bytes: bytes, target: BinaryIO) -> RenderedMedia`.
- Produces: `VideoService.create_derived(session, *, original: Video, source: BinaryIO, filename: str) -> Video`.
- Produces: `GET /cases/{case_id}/rendered-video/stream` with HTTP Range support.

- [ ] **Step 1: Write failing FFmpeg render tests**

Generate a 0.4-second 64×64 MP4 fixture with audio and a valid PNG. Render it, then use FFprobe to assert:

```python
assert 7_300 <= rendered.duration_ms <= 7_700
assert rendered.media_type == "video/mp4"
assert rendered.audio_stream_count == 1
```

Decode the entire derivative with FFmpeg to prove both tracks are readable. Also assert renderer failure removes plaintext temporary files by observing an injected temporary-directory callback.

- [ ] **Step 2: Run the renderer test and confirm failure**

Run: `cd Backend && PYTHONPATH=. .venv/bin/pytest tests/unit/test_memory_video.py -q`

Expected: FAIL because `MemoryVideoRenderer` does not exist.

- [ ] **Step 3: Implement renderer using argument arrays, not shell interpolation**

Materialize original chunks and the image in a `TemporaryDirectory(prefix="siad-memory-render-")` with mode `0o700`. Write the disclosure to a UTF-8 `disclosure.txt` inside that directory and pass its absolute path through FFmpeg's `drawtext` `textfile` option. Normalize original and closing audio to stereo 48 kHz and concatenate seven seconds of silent closing audio. Encode H.264/AAC with `-movflags +faststart`, validate the output with `MediaValidator`, copy it into the supplied binary target, then remove all temporary files in `finally`.

- [ ] **Step 4: Write failing derivative persistence and Range tests**

After image approval, assert one `RenderedVideo` is `ready`, points to a distinct `Video` row with status `derived`, and leaves the original bytes unchanged. Assert full and partial requests to `/rendered-video/stream` return 200/206 with correct `Content-Range`. Assert an operator who does not own the case gets 403.

- [ ] **Step 5: Add `VideoService.create_derived`**

Extract the common encrypted-video persistence from `create` into a private helper. `create_derived` must validate the MP4, assign the original owner, set `media_type="video/mp4"`, `status="derived"`, copy `delete_after`, and avoid the `video_uploaded` audit action.

- [ ] **Step 6: Start render on approval and expose its URL**

After committing the `approved` image decision, render outside a database transaction into `tempfile.SpooledTemporaryFile`. In a new session, persist the derived `Video`, link it through `RenderedVideo`, and mark `ready`. Fixed failure code: `memory_video_render_failed`. Repeated approval or render requests must return the existing ready derivative instead of creating another.

Add `rendered_video_url` to `MemoryImageRead` only when the linked row is ready.

- [ ] **Step 7: Run tests and commit**

Run: `cd Backend && PYTHONPATH=. .venv/bin/pytest tests/unit/test_memory_video.py tests/integration/test_memory_image_api.py tests/integration/test_video_api.py -q`

Expected: PASS.

```bash
git add Backend/app/services/memory_video.py Backend/app/services/videos.py Backend/app/services/memory_images.py Backend/app/services/cases.py Backend/app/api/cases.py Backend/app/main.py Backend/tests/unit/test_memory_video.py Backend/tests/integration/test_memory_image_api.py
git commit -m "feat: render approved memory image closing"
```

### Task 7: Retention and total deletion

**Files:**
- Modify: `Backend/app/services/cases.py`
- Modify: `Backend/app/services/retention.py`
- Modify: `Backend/tests/integration/test_case_deletion.py`
- Modify: `Backend/tests/integration/test_retention.py`

**Interfaces:**
- Consumes: `MemoryImage`, `RenderedVideo`, linked derived `Video` and encrypted image path.
- Produces: complete resource cleanup with only the existing non-sensitive tombstone retained.

- [ ] **Step 1: Extend deletion tests and confirm failure**

Create an approved demo memory image and ready derivative, then total-delete the case. Assert all image files, derivative chunks, `MemoryImage`, `RenderedVideo`, original/derived `Video` rows, and related audit rows are absent. For scheduled retention, assert both original and derived video chunks are deleted at the same deadline while the case metadata remains.

Run: `cd Backend && PYTHONPATH=. .venv/bin/pytest tests/integration/test_case_deletion.py tests/integration/test_retention.py -q`

Expected: FAIL because closing resources survive.

- [ ] **Step 2: Implement explicit cleanup ordering**

Collect all paths and sensitive IDs before deleting rows. Delete rendered-video links before linked `Video` rows, delete memory-image rows, commit database changes through the existing session context, then unlink encrypted files and remove only their now-empty UUID directories. Add the derived video deadline when the case is approved after a derivative already exists, and copy the original deadline when the derivative is created after case approval.

- [ ] **Step 3: Run tests and commit**

Run: `cd Backend && PYTHONPATH=. .venv/bin/pytest tests/integration/test_case_deletion.py tests/integration/test_retention.py -q`

Expected: PASS.

```bash
git add Backend/app/services/cases.py Backend/app/services/retention.py Backend/tests/integration/test_case_deletion.py Backend/tests/integration/test_retention.py
git commit -m "fix: delete memory closing resources with cases"
```

### Task 8: Accessible review interface and video selector

**Files:**
- Create: `frontend/src/components/analysis/memory-image-panel.tsx`
- Create: `frontend/src/components/analysis/memory-image-panel.test.tsx`
- Modify: `frontend/src/components/analysis/analysis-workspace.tsx`
- Modify: `frontend/src/components/analysis/route-stage.tsx`
- Modify: `frontend/src/components/analysis/route-stage.test.tsx` if present, otherwise extend `frontend/src/components/analysis/analysis-workspace.test.tsx`
- Modify: `frontend/src/components/analysis/video-panel.tsx`
- Modify: `frontend/src/test/case-fixture.ts`
- Modify: `frontend/src/index.css`

**Interfaces:**
- Consumes: generated `MemoryImageRead`, current role, image URL, derivative URL.
- Produces callbacks `onRegenerate()`, `onDecision(action)`, `onVideoModeChange(mode)`.

- [ ] **Step 1: Write failing component tests**

Test all states and exact Spanish copy:

- `pending_review`: image, disclosure, and validator/admin controls are visible;
- operator: disclosure and image visible, no mutation controls;
- `failed`: fixed recovery message and validator `Generar otra` action;
- `rejected`: states that the case continues without a closing image;
- `approved` without derivative: `Preparando versión con cierre…`;
- `approved` with derivative: buttons `Testimonio original` and `Versión con cierre de memoria` switch the video source;
- status changes are announced through `role="status"`;
- image alt text is `Imagen representativa del cierre de memoria del caso` and does not narrate the alleged events.

- [ ] **Step 2: Run tests and confirm failure**

Run: `cd frontend && npm test -- --run src/components/analysis/memory-image-panel.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the focused panel**

Render a `<figure>` with the institutional disclosure outside the image. Disable all controls while a request is running, preserve keyboard focus, and expose API errors in an alert. Keep the panel independent of `CaseRead` by accepting only `memoryImage`, `role`, and callbacks.

- [ ] **Step 4: Integrate API state and protected blobs**

In `AnalysisWorkspace`, download `memory_image.image_url` through `apiClient.download`, create/revoke its object URL, and refresh `CaseRead` after regenerate or decision. Maintain `videoMode: "original" | "memory"`; when memory mode is selected, download `rendered_video_url` and provide that object URL to `DocumentaryVideoRail`. Reset to original whenever the derivative URL disappears.

Pass the panel through `RouteStage` after `RoutesComparison`, preserving existing route approval behavior.

- [ ] **Step 5: Add responsive styles**

Use a 16:9 image container, paper-colored disclosure block, AA text contrast, 44px minimum controls, visible focus, and a single-column mobile layout below the existing breakpoint. Under `prefers-reduced-motion`, remove image/status transitions.

- [ ] **Step 6: Run frontend tests and commit**

Run: `cd frontend && npm test -- --run src/components/analysis/memory-image-panel.test.tsx src/components/analysis/analysis-workspace.test.tsx`

Expected: PASS.

```bash
git add frontend/src/components/analysis/memory-image-panel.tsx frontend/src/components/analysis/memory-image-panel.test.tsx frontend/src/components/analysis/analysis-workspace.tsx frontend/src/components/analysis/route-stage.tsx frontend/src/components/analysis/analysis-workspace.test.tsx frontend/src/components/analysis/video-panel.tsx frontend/src/test/case-fixture.ts frontend/src/index.css
git commit -m "feat: review memory image closing in workspace"
```

### Task 9: Contracts, documentation, and full verification

**Files:**
- Modify: `Backend/openapi.json`
- Modify: `frontend/src/api/generated.ts`
- Modify: `README.md`
- Modify: `Backend/tests/integration/test_delivery_contract.py`

**Interfaces:**
- Consumes: final FastAPI routes and schemas.
- Produces: synchronized OpenAPI/TypeScript contracts and documented runtime configuration.

- [ ] **Step 1: Add delivery-contract assertions**

Assert OpenAPI contains the four memory-closing routes, `CaseRead.memory_image`, all memory-image states, and binary response schemas for image and rendered-video streams.

- [ ] **Step 2: Generate contracts**

Run: `./scripts/generate-contracts.sh`

Expected: `Backend/openapi.json` and `frontend/src/api/generated.ts` update without manual edits.

- [ ] **Step 3: Document operation and ethical boundary**

In `README.md`, add environment variables, the automatic-generation/review/render flow, the disclosure sentence, the fact that demo mode is local and free, and the rule that no video or full transcript is sent to image generation.

- [ ] **Step 4: Run backend verification**

Run: `cd Backend && PYTHONPATH=. .venv/bin/pytest -q`

Expected: all backend tests PASS.

- [ ] **Step 5: Run frontend verification**

Run: `cd frontend && npm test -- --run && npm run build`

Expected: all frontend tests PASS and the production build succeeds.

- [ ] **Step 6: Run repository contract and formatting checks**

Run: `make contracts-check && git diff --check`

Expected: both commands exit 0.

- [ ] **Step 7: Inspect the working tree before the final commit**

Run: `git status --short`

Confirm only memory-closing files from this plan are staged for this commit; preserve every unrelated pre-existing change.

- [ ] **Step 8: Commit delivery updates**

```bash
git add Backend/openapi.json frontend/src/api/generated.ts README.md Backend/tests/integration/test_delivery_contract.py
git commit -m "docs: document memory image closing flow"
```

- [ ] **Step 9: Perform manual visual and media QA**

Run SIAD locally, create the demo case, inspect the closing panel at desktop and mobile widths, navigate all controls by keyboard, approve the demo image, play the original and derivative, and verify the closing disclosure is visible for seven seconds with silence while the original content and audio remain unchanged.
