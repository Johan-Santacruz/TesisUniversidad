# SIAD Smart Video Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the prototype conversation flow with a locally demonstrable, security-first video analysis workspace backed by one FastAPI service and a continuous, auditable timeline.

**Architecture:** A synchronous SQLAlchemy/FastAPI application persists users, sessions, encrypted case records, analysis events, source entries, and audit tombstones in SQLite. AES-256-GCM and per-record HKDF derivation protect sensitive fields and chunked video files; a typed service layer coordinates Whisper, GPT, Claude, BETO, RAG grounding, reconciliation, SSE replay, review, approval, and retention. The React application keeps access tokens only in memory, renews through an HttpOnly refresh cookie, consumes OpenAPI-derived DTOs, and presents video, timeline, verification, classification, and three fixed route families in a responsive workspace.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2, Alembic, SQLite/FTS5, cryptography, PyJWT, Argon2id, Pydantic 2, httpx, OpenAI, Anthropic, React 19, TypeScript 5.7, Vite 8, Framer Motion, Vitest, Testing Library, Playwright, Axe.

## Global Constraints

- Use Superpowers `writing-plans` → `test-driven-development` → `executing-plans` → `verification-before-completion`; execute inline without subagents.
- Remove Express and all keyword, regex, and fixed-map classification from the runtime path.
- BETO produces category and subcategory only; GPT and Claude independently extract facts, urgency, vulnerabilities, and grounded route content.
- Reject startup when AES and JWT keys are absent or invalid outside the explicitly marked test environment.
- Keep `REAL_DATA_ENABLED=false` unless OpenAI ZDR, Anthropic ZDR, and institutional authorization are all configured; every real upload also requires explicit consent.
- Use fixed route types `emergency`, `housing_stabilization`, and `return_relocation`, while personalizing steps and validating every institutional `source_entry_id`.
- Persist eight analysis stages and expose replayable SSE using `Last-Event-ID`.
- Delete encrypted video idempotently seven days after approval; keep encrypted derivatives and audit until administrative deletion; preserve only a non-sensitive tombstone after total deletion.
- Preserve the current paper/ink, Libre Caslon Text, Public Sans, and Colombian tricolor visual language; make the tricolor spine the functional timeline rail.
- Respect keyboard use, visible focus, `aria-live`, WCAG AA contrast, 44 px targets, and reduced motion at 360, 768, and 1440 px.

---

### Task 1: Python service foundation, strict configuration, and encrypted persistence

**Files:**
- Delete: `Backend/package.json`
- Delete: `Backend/tsconfig.json`
- Delete: `Backend/src/config/config.ts`
- Delete: `Backend/src/controllers/transcription.controller.ts`
- Delete: `Backend/src/core/classifier-client.ts`
- Delete: `Backend/src/core/transcription.service.ts`
- Delete: `Backend/src/index.ts`
- Delete: `Backend/src/middleware/testimony-upload.ts`
- Delete: `Backend/src/routes/transcription.routes.ts`
- Delete: `Backend/src/types/transcription.ts`
- Create: `Backend/pyproject.toml`
- Create: `Backend/.env.example`
- Create: `Backend/app/__init__.py`
- Create: `Backend/app/config.py`
- Create: `Backend/app/database.py`
- Create: `Backend/app/models.py`
- Create: `Backend/app/security/crypto.py`
- Create: `Backend/app/security/passwords.py`
- Create: `Backend/app/security/tokens.py`
- Create: `Backend/tests/conftest.py`
- Create: `Backend/tests/unit/test_config.py`
- Create: `Backend/tests/unit/test_crypto.py`
- Create: `Backend/tests/unit/test_tokens.py`

**Interfaces:**
- Produces: `Settings`, `get_settings()`, `Database`, SQLAlchemy model classes, `EnvelopeCipher.encrypt_json()`, `EnvelopeCipher.decrypt_json()`, `ChunkCipher.encrypt_stream()`, `ChunkCipher.read_range()`, `PasswordService`, and `TokenService`.
- Consumes: Existing BETO artifacts remain unchanged under `Backend/models/violencia_classifier_artifacts`.

- [ ] **Step 1: Write failing security and configuration tests**

```python
def test_cipher_detects_tampering(cipher):
    encrypted = cipher.encrypt_json("case-7", "facts", {"name": "ficticio"})
    damaged = encrypted.model_copy(update={"ciphertext": encrypted.ciphertext[:-1] + b"0"})
    with pytest.raises(InvalidTag):
        cipher.decrypt_json("case-7", "facts", damaged)

def test_real_data_requires_all_three_authorizations(settings_factory):
    settings = settings_factory(
        real_data_enabled=True,
        openai_zdr_confirmed=True,
        anthropic_zdr_confirmed=False,
        institutional_authorization_id="ACTA-7",
    )
    assert settings.real_data_ready is False

def test_refresh_token_is_not_accepted_as_access(token_service):
    refresh = token_service.issue_refresh("user-1", "session-1")
    with pytest.raises(InvalidTokenType):
        token_service.verify_access(refresh)
```

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `cd Backend && python3.12 -m pytest tests/unit/test_config.py tests/unit/test_crypto.py tests/unit/test_tokens.py -q`

Expected: collection fails because `app.config`, `app.security.crypto`, and `app.security.tokens` do not exist.

- [ ] **Step 3: Implement strict settings, SQLAlchemy tables, AES-GCM/HKDF, Argon2id, and JWT**

Implement Pydantic settings that accept base64-encoded 32-byte encryption and JWT keys, derive `real_data_ready` from all four controls, and allow deterministic test values only under `SIAD_ENV=test`. Define focused SQLAlchemy tables for users, refresh sessions, videos, chunks, analyses, events, cases, facts, routes, sources, reviews, consents, audits, and tombstones. Encrypt JSON with AES-256-GCM using HKDF `salt=record_id` and `info=purpose:key_version`, and authenticate record identity as AAD.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run: `cd Backend && python3.12 -m pytest tests/unit/test_config.py tests/unit/test_crypto.py tests/unit/test_tokens.py -q`

Expected: all focused tests pass with no warnings from application code.

- [ ] **Step 5: Commit the security foundation**

```bash
git add Backend
git commit -m "feat: establish encrypted FastAPI persistence"
```

### Task 2: Authentication, authorization, users, and audit-safe logging

**Files:**
- Create: `Backend/app/api/__init__.py`
- Create: `Backend/app/api/dependencies.py`
- Create: `Backend/app/api/auth.py`
- Create: `Backend/app/api/admin.py`
- Create: `Backend/app/schemas.py`
- Create: `Backend/app/services/auth.py`
- Create: `Backend/app/services/audit.py`
- Create: `Backend/app/logging.py`
- Create: `Backend/app/main.py`
- Create: `Backend/tests/integration/test_auth_api.py`
- Create: `Backend/tests/integration/test_admin_api.py`
- Create: `Backend/tests/unit/test_logging.py`

**Interfaces:**
- Consumes: `Settings`, `Database`, `PasswordService`, `TokenService`, encrypted audit model.
- Produces: `create_app()`, OAuth2 token/refresh/logout/me routes, role dependencies `require_operator`, `require_validator`, `require_admin`, user CRUD, source CRUD shell, and redacted structured logs.

- [ ] **Step 1: Write failing API tests for token rotation, revocation, roles, and redaction**

```python
def test_logout_revokes_refresh_cookie(client, admin_credentials):
    login = client.post("/api/v1/auth/token", data=admin_credentials)
    assert login.status_code == 200
    assert client.post("/api/v1/auth/logout").status_code == 204
    assert client.post("/api/v1/auth/refresh").status_code == 401

def test_operator_cannot_create_users(operator_client):
    response = operator_client.post(
        "/api/v1/users",
        json={"email": "nuevo@siad.local", "password": "Safe-Pass-2026!", "role": "operador"},
    )
    assert response.status_code == 403

def test_log_payload_never_contains_sensitive_text(caplog, audit_logger):
    audit_logger.info("analysis_failed", case_id="case-1", transcript="dato sensible")
    assert "dato sensible" not in caplog.text
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `cd Backend && python3.12 -m pytest tests/integration/test_auth_api.py tests/integration/test_admin_api.py tests/unit/test_logging.py -q`

Expected: tests fail because `create_app()` and API routes are absent.

- [ ] **Step 3: Implement API behavior**

Create 15-minute access tokens returned in JSON and 8-hour rotating refresh tokens stored only as hashed JTI-backed sessions and an HttpOnly/SameSite=Lax cookie. Revoke the old session during refresh and logout. Implement role inheritance where admin satisfies operator and validator. Whitelist structured log fields to identifiers, stages, states, durations, provider names, and error codes; ignore text-bearing keys.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run: `cd Backend && python3.12 -m pytest tests/integration/test_auth_api.py tests/integration/test_admin_api.py tests/unit/test_logging.py -q`

Expected: all tests pass.

- [ ] **Step 5: Commit authentication and administration**

```bash
git add Backend/app Backend/tests
git commit -m "feat: add role-based sessions and audited admin APIs"
```

### Task 3: Encrypted video upload, HTTP Range streaming, and real-data gate

**Files:**
- Create: `Backend/app/api/videos.py`
- Create: `Backend/app/services/videos.py`
- Create: `Backend/app/services/retention.py`
- Create: `Backend/tests/unit/test_chunk_cipher.py`
- Create: `Backend/tests/integration/test_video_api.py`
- Create: `Backend/tests/integration/test_retention.py`

**Interfaces:**
- Consumes: `ChunkCipher`, video/chunk/consent/audit models, operator dependency, `Settings.real_data_ready`.
- Produces: `POST /api/v1/videos`, `POST /api/v1/videos/demo`, `GET /api/v1/videos/{id}/stream`, `VideoService.open_plain_stream()`, `RetentionService.delete_due_videos()`.

- [ ] **Step 1: Write failing range, consent, and retention tests**

```python
def test_encrypted_chunks_reconstruct_requested_byte_range(chunk_cipher, tmp_path):
    original = bytes(range(256)) * 40
    manifest = chunk_cipher.encrypt_bytes("video-1", original, tmp_path, chunk_size=1024)
    assert chunk_cipher.read_range("video-1", manifest, 777, 2500) == original[777:2501]

def test_real_upload_is_blocked_without_zdr(operator_client, tiny_video):
    response = operator_client.post(
        "/api/v1/videos",
        files={"file": ("real.mp4", tiny_video, "video/mp4")},
        data={"data_kind": "real", "explicit_consent": "true", "consent_reference": "ACTA-1"},
    )
    assert response.status_code == 403

def test_due_video_deletion_is_idempotent(retention_service, approved_video):
    assert retention_service.delete_due_videos(now=approved_video.delete_after) == 1
    assert retention_service.delete_due_videos(now=approved_video.delete_after) == 0
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `cd Backend && python3.12 -m pytest tests/unit/test_chunk_cipher.py tests/integration/test_video_api.py tests/integration/test_retention.py -q`

Expected: tests fail because video services and routes are absent.

- [ ] **Step 3: Implement chunked upload and streaming**

Validate MP4/WebM/MOV content signatures and size, encrypt fixed-size chunks directly from the upload stream, and never persist plaintext. Parse one RFC 7233 byte range, decrypt only intersecting chunks, return `206`, `Content-Range`, `Accept-Ranges`, and exact `Content-Length`. Add a persisted fictitious demo video without testimony content. Real uploads require all global gates, explicit consent, and a consent reference encrypted at rest.

- [ ] **Step 4: Implement and verify idempotent retention**

Mark approved video rows with `delete_after=approved_at+7 days`; deletion removes chunk files, records `video_deleted_at`, and emits a non-sensitive audit action. Repeated runs do nothing.

- [ ] **Step 5: Run focused tests and confirm GREEN**

Run: `cd Backend && python3.12 -m pytest tests/unit/test_chunk_cipher.py tests/integration/test_video_api.py tests/integration/test_retention.py -q`

Expected: all tests pass.

- [ ] **Step 6: Commit encrypted media behavior**

```bash
git add Backend/app Backend/tests
git commit -m "feat: stream encrypted testimony video by range"
```

### Task 4: Structured AI adapters, reconciliation, BETO, official RAG, and persisted SSE

**Files:**
- Modify: `Backend/services/ml_service/classifier_service.py`
- Create: `Backend/app/ai/contracts.py`
- Create: `Backend/app/ai/providers.py`
- Create: `Backend/app/ai/beto.py`
- Create: `Backend/app/ai/reconcile.py`
- Create: `Backend/app/services/rag.py`
- Create: `Backend/app/services/analysis.py`
- Create: `Backend/app/api/analyses.py`
- Create: `Backend/app/data/official_sources.json`
- Create: `Backend/tests/unit/test_ai_contracts.py`
- Create: `Backend/tests/unit/test_reconcile.py`
- Create: `Backend/tests/unit/test_rag.py`
- Create: `Backend/tests/integration/test_analysis_sse.py`

**Interfaces:**
- Consumes: decrypted in-memory video stream, encrypted analysis/case/event storage, existing BETO artifacts, official source seeds.
- Produces: `WhisperAdapter`, `OpenAIAnalysisAdapter`, `AnthropicAnalysisAdapter`, `BetoAdapter`, `reconcile_readings()`, `RagCatalog.search()`, `AnalysisService.start()`, `POST /videos/{id}/analyses`, and replayable `GET /analyses/{id}/events`.

- [ ] **Step 1: Write failing reconciliation, grounding, and replay tests**

```python
def test_disagreement_is_visible_and_never_silently_selected():
    result = reconcile_readings(
        gpt=reading(value="alta", evidence=[segment("seg-1", 0, 3000)]),
        claude=reading(value="media", evidence=[segment("seg-1", 0, 3000)]),
        known_segments={"seg-1"},
    )
    assert result.status == "inconsistent"
    assert result.value is None
    assert result.provider_values == {"gpt": "alta", "claude": "media"}

def test_expired_source_requires_confirmation(rag_catalog, expired_source):
    result = rag_catalog.get(expired_source.id)
    assert result.is_expired is True
    assert result.disclaimer == "Requiere confirmación con la entidad"

def test_sse_replays_only_events_after_last_id(operator_client, completed_analysis):
    response = operator_client.get(
        f"/api/v1/analyses/{completed_analysis.id}/events",
        headers={"Last-Event-ID": "3"},
    )
    assert "id: 3\n" not in response.text
    assert "id: 4\n" in response.text
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `cd Backend && python3.12 -m pytest tests/unit/test_ai_contracts.py tests/unit/test_reconcile.py tests/unit/test_rag.py tests/integration/test_analysis_sse.py -q`

Expected: collection fails because analysis modules are absent.

- [ ] **Step 3: Implement strict provider contracts and retries**

Use Pydantic models with forbidden extra fields. Whisper requests `whisper-1`, `response_format=verbose_json`, and segment timestamps. OpenAI uses the configured GPT-5.6 Terra model and Anthropic uses configured Claude Sonnet 5; both return strict structured readings with canonical values and segment evidence. Retry retryable timeouts/rate limits twice with bounded backoff, persist provider failures as partial analysis state, and never send real data unless the global gate and upload consent both pass.

- [ ] **Step 4: Integrate BETO without risk keywords**

Refactor the existing classifier into a lazy in-process adapter that loads artifacts once, returns category/subcategory probabilities, and reports unavailable without inventing a result. Delete `_risk_level`, keyword checks, and the standalone FastAPI classifier surface.

- [ ] **Step 5: Seed and query official FTS5 sources**

Seed UARIV procedures, returns/relocations, Defensoría/Ministerio Público, ICBF mobile units, and CRAV Popayán with entity, program, coverage, requirements, contact, URL, verification date, expiry date, status, and supported route types. Build an FTS5 table linked to source rows. Expire contacts after 30 days and program information after 90 days. Reject route claims whose source IDs do not exist; expose expired entries with the required disclaimer.

- [ ] **Step 6: Implement eight persisted stages and SSE replay**

Persist `audio`, `transcription`, `people_places`, `dates_facts`, `classification`, `sources`, `timeline`, and `routes` events with monotonically increasing integer sequence per analysis. Commit every event before publishing. On reconnect, emit all rows after `Last-Event-ID`; use heartbeat comments while an analysis is still running. The fictitious demo runs deterministically through real persistence without external provider calls.

- [ ] **Step 7: Run focused tests and confirm GREEN**

Run: `cd Backend && python3.12 -m pytest tests/unit/test_ai_contracts.py tests/unit/test_reconcile.py tests/unit/test_rag.py tests/integration/test_analysis_sse.py -q`

Expected: all tests pass.

- [ ] **Step 8: Commit the AI and RAG pipeline**

```bash
git add Backend/app Backend/services Backend/tests
git commit -m "feat: persist reconciled AI analysis and official RAG"
```

### Task 5: Case review, approval, complete deletion, Alembic, CLI, and OpenAPI

**Files:**
- Create: `Backend/app/api/cases.py`
- Create: `Backend/app/services/cases.py`
- Create: `Backend/app/cli.py`
- Create: `Backend/alembic.ini`
- Create: `Backend/alembic/env.py`
- Create: `Backend/alembic/versions/0001_initial.py`
- Create: `Backend/scripts/export_openapi.py`
- Create: `Backend/tests/integration/test_case_review.py`
- Create: `Backend/tests/integration/test_case_deletion.py`
- Create: `Backend/tests/integration/test_pipeline.py`

**Interfaces:**
- Consumes: persisted case/fact/route/source/audit records and role dependencies.
- Produces: `GET /cases/{id}`, `PATCH /cases/{id}/facts/{fact_id}`, `POST /cases/{id}/approve`, `DELETE /cases/{id}`, `python -m app.cli users ...`, migrations, and `Backend/openapi.json`.

- [ ] **Step 1: Write failing human-review and tombstone tests**

```python
def test_operator_correction_is_pending_until_validator_confirms(operator_client, analyzed_case):
    response = operator_client.patch(
        f"/api/v1/cases/{analyzed_case.id}/facts/{analyzed_case.fact_id}",
        json={"value": "Popayán", "action": "correct", "reason": "Confirmado en entrevista"},
    )
    assert response.status_code == 200
    assert response.json()["verification_status"] == "pending"

def test_validator_approval_schedules_video_deletion(validator_client, reviewed_case):
    response = validator_client.post(f"/api/v1/cases/{reviewed_case.id}/approve")
    assert response.status_code == 200
    assert response.json()["video_delete_after"] == reviewed_case.expected_delete_after

def test_total_delete_leaves_only_non_sensitive_tombstone(admin_client, approved_case):
    assert admin_client.delete(f"/api/v1/cases/{approved_case.id}").status_code == 204
    tombstone = admin_client.get(f"/api/v1/audit/tombstones/{approved_case.id}").json()
    assert set(tombstone) == {"case_id_hash", "deleted_at", "action", "actor_role"}
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `cd Backend && python3.12 -m pytest tests/integration/test_case_review.py tests/integration/test_case_deletion.py tests/integration/test_pipeline.py -q`

Expected: routes are missing.

- [ ] **Step 3: Implement auditable review and deletion**

Operator changes create encrypted review records and leave confirmation pending; validators confirm facts, route selection, and final approval. Reject approval while critical inconsistencies remain. Total deletion removes video chunks and encrypted case derivatives in one transaction, then writes a salted case hash, timestamp, action, and actor role only.

- [ ] **Step 4: Add migration, user/source CLI, and OpenAPI export**

Create an initial Alembic migration matching SQLAlchemy metadata. Expose non-interactive CLI commands to create/list/disable users, rotate passwords, seed sources, and run due retention. Export a deterministic OpenAPI document from `create_app()` without starting a server.

- [ ] **Step 5: Run focused tests and confirm GREEN**

Run: `cd Backend && python3.12 -m pytest tests/integration/test_case_review.py tests/integration/test_case_deletion.py tests/integration/test_pipeline.py -q`

Expected: all tests pass.

- [ ] **Step 6: Commit case lifecycle and public contract**

```bash
git add Backend
git commit -m "feat: add auditable case validation and retention lifecycle"
```

### Task 6: Frontend API client, memory-only session, generated DTOs, and route guards

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/src/router/app-router.tsx`
- Delete: `frontend/src/services/chat-api.ts`
- Delete: `frontend/src/utils/action-path-builder.ts`
- Delete: `frontend/src/utils/route-analysis.ts`
- Delete: `frontend/src/types/action-path.ts`
- Delete: `frontend/src/types/route-analysis.ts`
- Create: `frontend/src/api/generated.ts`
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/auth/auth-context.tsx`
- Create: `frontend/src/auth/protected-route.tsx`
- Create: `frontend/src/pages/login-page.tsx`
- Create: `frontend/src/test/setup.ts`
- Create: `frontend/src/auth/auth-context.test.tsx`
- Create: `frontend/src/router/app-router.test.tsx`

**Interfaces:**
- Consumes: FastAPI OpenAPI endpoints and role values.
- Produces: `apiClient`, `AuthProvider`, `useAuth()`, `ProtectedRoute`, `/login`, `/subir-video`, and `/conversar` redirect.

- [ ] **Step 1: Write failing session and guard tests**

```tsx
it("renews through the cookie without persisting the access token", async () => {
  render(<AuthProvider><Probe /></AuthProvider>)
  await screen.findByText("admin@siad.local")
  expect(localStorage.getItem("access_token")).toBeNull()
  expect(sessionStorage.getItem("access_token")).toBeNull()
})

it("redirects unauthenticated visitors and preserves the target", async () => {
  renderRouterAt("/subir-video")
  expect(await screen.findByRole("heading", { name: /ingresar a siad/i })).toBeVisible()
})

it("redirects the legacy conversar URL to subir-video", async () => {
  renderAuthenticatedRouterAt("/conversar")
  expect(await screen.findByTestId("video-analysis-workspace")).toBeVisible()
})
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `cd frontend && npm test -- src/auth/auth-context.test.tsx src/router/app-router.test.tsx`

Expected: the test command or imports fail because Vitest, auth modules, and new routes do not exist.

- [ ] **Step 3: Implement generated DTO workflow and memory-only auth**

Generate `generated.ts` from `Backend/openapi.json` with `openapi-typescript`. Keep the access token in React state only; call refresh with `credentials: include` at startup and once after a 401. Never write tokens to Web Storage. Render role-appropriate actions and redirect unauthorized routes.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run: `cd frontend && npm test -- src/auth/auth-context.test.tsx src/router/app-router.test.tsx`

Expected: all focused tests pass.

- [ ] **Step 5: Commit the browser security boundary**

```bash
git add frontend
git commit -m "feat: add memory-only authentication and typed API client"
```

### Task 7: Continuous tricolor timeline workspace and human verification

**Files:**
- Modify: `frontend/src/pages/conversation-page.tsx`
- Modify: `frontend/src/components/route-builder/narrative-canvas.tsx`
- Modify: `frontend/src/components/route-builder/video-panel.tsx`
- Modify: `frontend/src/components/route-builder/signal-card.tsx`
- Modify: `frontend/src/components/route-builder/route-step-card.tsx`
- Modify: `frontend/src/index.css`
- Create: `frontend/src/hooks/use-analysis-events.ts`
- Create: `frontend/src/components/analysis/analysis-workspace.tsx`
- Create: `frontend/src/components/analysis/upload-panel.tsx`
- Create: `frontend/src/components/analysis/timeline.tsx`
- Create: `frontend/src/components/analysis/verification-panel.tsx`
- Create: `frontend/src/components/analysis/classification-panel.tsx`
- Create: `frontend/src/components/analysis/routes-comparison.tsx`
- Create: `frontend/src/components/analysis/status-badge.tsx`
- Create: `frontend/src/components/analysis/analysis-workspace.test.tsx`
- Create: `frontend/src/components/analysis/timeline.test.tsx`

**Interfaces:**
- Consumes: typed case DTOs, video Range URL, SSE analysis events, patch/approve APIs, authenticated role.
- Produces: fixed-left video, central continuous timeline, contextual verification sidebar/bottom sheet, classification section, and three comparable route journeys.

- [ ] **Step 1: Write failing interaction and accessibility tests**

```tsx
it("seeks the video to the selected timeline event", async () => {
  render(<AnalysisWorkspace initialCase={caseFixture} />)
  fireEvent.click(screen.getByRole("button", { name: /desplazamiento hacia popayán/i }))
  expect(screen.getByTestId("case-video")).toHaveProperty("currentTime", 18.4)
})

it("groups facts by verification state using text labels", () => {
  render(<VerificationPanel facts={factFixture} />)
  expect(screen.getByRole("heading", { name: "Alta confianza" })).toBeVisible()
  expect(screen.getByRole("heading", { name: "Requiere confirmación" })).toBeVisible()
  expect(screen.getByRole("heading", { name: "No identificado" })).toBeVisible()
})

it("marks a recommendation preliminary while critical inconsistencies remain", () => {
  render(<RoutesComparison caseData={inconsistentCaseFixture} />)
  expect(screen.getByText("Recomendación preliminar")).toBeVisible()
})
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `cd frontend && npm test -- src/components/analysis/analysis-workspace.test.tsx src/components/analysis/timeline.test.tsx`

Expected: component imports fail.

- [ ] **Step 3: Implement the upload and progressive workspace**

Provide drag/drop plus file input, a clearly labeled fictitious demo, explicit real-data consent controls, and live eight-stage progress through a fetch-based SSE parser that can send Authorization and `Last-Event-ID`. The video remains sticky on desktop and first in document order. Selecting a node seeks to `start_ms`, highlights the source segment, and updates the verification context.

- [ ] **Step 4: Implement visual hierarchy and responsive behavior**

Turn the existing yellow/blue/red spine into a growing central rail with segment, fact, and route nodes. Use Libre Caslon Text for editorial headings and Public Sans for controls/data. Use motion only for progress, rail growth, and node entry; `useReducedMotion()` must remove displacement and shorten transitions. At mobile widths, stack the workspace and open verification as an accessible bottom sheet.

- [ ] **Step 5: Implement inline audited review and route comparison**

Show origin, confidence, and verification with text, icon, and color. Operators propose corrections; validators confirm and approve. Place BETO classification after the timeline. Render all three fixed route families with personalized steps, official source links, verification age, and expired-source disclaimer. Disable final approval when critical inconsistencies remain.

- [ ] **Step 6: Run focused tests and confirm GREEN**

Run: `cd frontend && npm test -- src/components/analysis/analysis-workspace.test.tsx src/components/analysis/timeline.test.tsx`

Expected: all tests pass.

- [ ] **Step 7: Commit the continuous timeline**

```bash
git add frontend
git commit -m "feat: replace page prototype with continuous video timeline"
```

### Task 8: End-to-end acceptance, visual QA, documentation, and contract checks

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/playwright.config.ts`
- Create: `frontend/e2e/smart-video.spec.ts`
- Create: `frontend/e2e/fixtures/tiny-fictitious.webm`
- Create: `README.md`
- Create: `Makefile`
- Create: `scripts/bootstrap-local.sh`
- Create: `scripts/generate-contracts.sh`
- Create: `Backend/tests/smoke/test_real_providers.py`

**Interfaces:**
- Consumes: complete backend and frontend.
- Produces: one-command bootstrap, deterministic local demo, opt-in fictitious real-provider smoke test, E2E accessibility/screenshots, and full acceptance command.

- [ ] **Step 1: Write failing E2E acceptance**

```ts
for (const viewport of [
  { width: 360, height: 800 },
  { width: 768, height: 1024 },
  { width: 1440, height: 1000 },
]) {
  test(`fictitious analysis completes at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await loginAsOperator(page)
    await page.getByRole("button", { name: /usar caso ficticio/i }).click()
    await expect(page.getByRole("heading", { name: /línea de tiempo/i })).toBeVisible()
    await expect(page.getByText("Recomendación preliminar")).toBeVisible()
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  })
}
```

- [ ] **Step 2: Run E2E and confirm RED**

Run: `cd frontend && npm run e2e`

Expected: Playwright configuration or fixtures are absent.

- [ ] **Step 3: Add deterministic local orchestration and real-provider smoke gate**

Bootstrap Python 3.12 virtualenv, install backend and frontend dependencies, generate secure development keys into ignored local env files, migrate/seed SQLite, and print demo credentials. The provider smoke test must be skipped unless `RUN_REAL_PROVIDER_SMOKE=1`, must assert `data_kind=fictitious`, and must never load a real testimony fixture.

- [ ] **Step 4: Add browser acceptance at three viewports**

Run backend and Vite through Playwright web servers. Cover login, upload/demo, eight-stage progress, timeline seek, review permissions, expired sources, keyboard traversal, Axe, screenshots, and `prefers-reduced-motion`.

- [ ] **Step 5: Run E2E and confirm GREEN**

Run: `cd frontend && npm run e2e`

Expected: all browser tests pass at 360, 768, and 1440 with zero serious/critical Axe violations.

- [ ] **Step 6: Run fresh full verification**

Run:

```bash
cd Backend && python3.12 -m pytest -q
cd frontend && npm test -- --run
cd frontend && npm run build
cd frontend && npm run e2e
./scripts/generate-contracts.sh --check
git diff --check
git status --short
```

Expected: unit, integration, frontend, build, E2E, contract drift, whitespace, and worktree checks all succeed; only intentional implementation changes are present before the final commit.

- [ ] **Step 7: Commit the verified local demonstration**

```bash
git add .
git commit -m "test: verify SIAD smart video workflow end to end"
```

## Self-Review

- Spec coverage: tasks cover FastAPI replacement, security, roles, encrypted Range streaming, AI separation, reconciliation, RAG/expiry/grounding, eight-stage SSE replay, review/approval/retention/deletion, OpenAPI DTOs, continuous timeline, mobile sheet, reduced motion, E2E, and provider/data controls.
- Intentional local-demo boundary: legal review and provider ZDR activation remain external; code blocks real data until their auditable controls are configured.
- Placeholder scan: no deferred implementation markers remain.
- Type consistency: API paths use `/api/v1`; route, status, origin, confidence, and stage values match the approved public types.
- Execution choice: the user explicitly required no subagents, so this plan will be executed inline with `superpowers:executing-plans`.
