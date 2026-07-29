# Conversation Narrative Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the authenticated conversation workspace as the approved two-column editorial narrative while preserving every existing FastAPI operation and role rule.

**Architecture:** Keep `AnalysisWorkspace` as the owner of API, stream, video, review, and approval state. Replace the current three-column presentation with a documentary video rail plus one narrative sheet that renders three local presentation stages: listening, evidence, and route. Reuse the generated API types and existing leaf components where their responsibilities remain valid.

**Tech Stack:** React 19, TypeScript, React Router, Framer Motion, Tailwind CSS 4 utilities, scoped CSS in `frontend/src/index.css`, generated OpenAPI types.

## Global Constraints

- Work only in `/Users/johancamilobalantasantacruz/Documents/TESIS/.worktrees/siad-smart-video`.
- Do not modify the original project at `/Users/johancamilobalantasantacruz/Documents/TESIS/frontend`.
- Do not modify FastAPI code, generated contracts, endpoint paths, authentication, SSE persistence, fact review rules, route approval rules, or retention behavior.
- Preserve unrelated dirty changes in the login, book, router, and existing plan files.
- `frontend/src/index.css` already contains unrelated login work. Never stage the whole file; use `git add -p frontend/src/index.css` and inspect the cached diff before every commit.
- Add no dependency; `Newsreader`, `Manrope`, and Framer Motion are already available.
- Use exactly two primary desktop zones: a `320px` documentary rail and one flexible narrative sheet with a `24px` gap.
- Collapse to one column below `960px`; show transcript fragments as a horizontal scroll strip.
- Keep controls at least `44px` high, visible keyboard focus, `aria-live` for progress/errors, and `prefers-reduced-motion` support.
- Use implementable CSS/SVG only: no torn paper, tape, clips, floating scrapbook layers, glassmorphism, KPI tiles, charts, or generic sidebar.
- Keep the approved copy: `Constructor de ruta de acción`, `Tu declaración`, `Del relato a la ruta`, `Escuchando el relato`, `Ordenando lo importante`, and `Trazando la ruta`.
- Per the user's instruction, do not run tests, a build, or a development server. Verification is limited to static inspection, targeted `rg`, `git diff`, and `git diff --check`.

---

### Task 1: Add the narrative stage model and shared sheet header

**Files:**
- Create: `frontend/src/components/analysis/narrative-stage.tsx`
- Modify: `frontend/src/index.css`

**Interfaces:**
- Consumes: React `ReactNode`.
- Produces: `NarrativeStage`, `NARRATIVE_STAGES`, and `NarrativeStageHeader`.

- [ ] **Step 1: Create the stage model and metadata**

Create `frontend/src/components/analysis/narrative-stage.tsx` with these public definitions:

```tsx
import type { ReactNode } from "react"

export type NarrativeStage = "listening" | "evidence" | "route"

export const NARRATIVE_STAGES: Array<{
  id: NarrativeStage
  number: string
  title: string
  description: string
}> = [
  {
    id: "listening",
    number: "01",
    title: "Escuchando el relato",
    description: "Revisa cómo el testimonio quedó organizado en fragmentos vinculados al video.",
  },
  {
    id: "evidence",
    number: "02",
    title: "Ordenando lo importante",
    description: "Confirma las señales, los hechos y la clasificación encontrados en el relato.",
  },
  {
    id: "route",
    number: "03",
    title: "Trazando la ruta",
    description: "Recorre la cronología y compara las rutas institucionales sustentadas.",
  },
]
```

- [ ] **Step 2: Add the accessible shared header**

In the same file, add:

```tsx
export function NarrativeStageHeader({
  stage,
  aside,
  onStageChange,
}: {
  stage: NarrativeStage
  aside?: ReactNode
  onStageChange: (stage: NarrativeStage) => void
}) {
  const current = NARRATIVE_STAGES.find((item) => item.id === stage)
    ?? NARRATIVE_STAGES[0]

  return (
    <header className="narrative-stage-header">
      <div className="narrative-stage-meta">
        <p><strong>{current.number} / 03</strong><span>Del relato a la ruta</span></p>
        <nav aria-label="Etapas del análisis">
          {NARRATIVE_STAGES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === stage ? "is-current" : ""}
              aria-current={item.id === stage ? "step" : undefined}
              aria-label={`Ir a ${item.title}`}
              onClick={() => onStageChange(item.id)}
            >
              <span aria-hidden="true" />
            </button>
          ))}
        </nav>
      </div>
      <div className="narrative-stage-title-row">
        <div>
          <h1>{current.title}</h1>
          <span className="narrative-title-rule" aria-hidden="true" />
          <p>{current.description}</p>
        </div>
        {aside}
      </div>
    </header>
  )
}
```

- [ ] **Step 3: Add the shared sheet and header CSS**

Add the following primitives at the start of the analysis-workspace CSS section:

```css
.narrative-sheet {
  min-width: 0;
  padding: clamp(1.5rem, 3vw, 2.75rem);
  border: 1px solid color-mix(in oklch, var(--rule) 82%, white);
  border-radius: 1.25rem;
  background: color-mix(in oklch, var(--paper-white) 96%, transparent);
  box-shadow: 0 20px 60px color-mix(in oklch, var(--ink) 9%, transparent);
}

.narrative-stage-meta,
.narrative-stage-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.narrative-stage-meta p {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  margin: 0;
  font-family: "Newsreader", "Libre Caslon Text", Georgia, serif;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.narrative-stage-meta strong { color: var(--azul); }
.narrative-stage-meta nav { display: flex; align-items: center; gap: 0.55rem; }
.narrative-stage-meta nav button {
  display: grid;
  width: 28px;
  min-height: 44px;
  place-items: center;
  border: 0;
  background: transparent;
}
.narrative-stage-meta nav button span {
  width: 10px;
  height: 10px;
  border: 1px solid var(--ink);
  border-radius: 50%;
  background: var(--paper-white);
}
.narrative-stage-meta nav button.is-current span {
  border-color: var(--azul);
  background: var(--azul);
}
.narrative-stage-title-row h1 {
  margin: 1.5rem 0 0;
  font-family: "Newsreader", "Libre Caslon Text", Georgia, serif;
  font-size: clamp(2.5rem, 5vw, 4.8rem);
  font-weight: 500;
  letter-spacing: -0.045em;
  line-height: 0.96;
}
.narrative-title-rule {
  display: block;
  width: min(24rem, 72%);
  height: 4px;
  margin-top: 0.75rem;
  background: var(--amarillo);
  transform-origin: left;
  animation: narrative-rule-in 520ms ease-out both;
}
.narrative-stage-title-row > div > p {
  max-width: 42rem;
  margin: 0.8rem 0 0;
  color: var(--ink-soft);
  font-family: "Manrope", "Public Sans", sans-serif;
  line-height: 1.6;
}
```

- [ ] **Step 4: Perform static review**

Run:

```bash
rg -n "NarrativeStage|narrative-stage-header|narrative-sheet" frontend/src/components/analysis/narrative-stage.tsx frontend/src/index.css
git diff --check
```

Expected: the new type, component, and CSS selectors are found; `git diff --check` prints nothing.

- [ ] **Step 5: Commit the stage foundation**

```bash
git add frontend/src/components/analysis/narrative-stage.tsx
git add -p frontend/src/index.css
git diff --cached -- frontend/src/index.css frontend/src/components/analysis/narrative-stage.tsx
git commit -m "feat: add narrative analysis stages"
```

---

### Task 2: Rebuild the upload and processing states inside the same narrative composition

**Files:**
- Modify: `frontend/src/components/analysis/upload-panel.tsx`
- Modify: `frontend/src/components/analysis/analysis-progress.tsx`
- Modify: `frontend/src/components/analysis/analysis-workspace.tsx`
- Modify: `frontend/src/index.css`

**Interfaces:**
- Consumes: existing `UploadPanel` callbacks, a new `error: string` display prop, and existing `AnalysisProgress` `events`/`error` props.
- Produces: stable pre-result composition using `.analysis-prelude`, `.prelude-document`, and `.narrative-sheet`.

- [ ] **Step 1: Recompose `UploadPanel` without changing callbacks**

Keep file validation and drag/drop behavior unchanged. Add `error` to the
component contract:

```tsx
export function UploadPanel({
  busy,
  error,
  onUpload,
  onDemo,
}: {
  busy: boolean
  error: string
  onUpload: (file: File) => Promise<void> | void
  onDemo: () => Promise<void> | void
}) {
```

Replace its returned markup with this structure:

```tsx
return (
  <section className="analysis-prelude" aria-labelledby="upload-title">
    <aside className="prelude-document">
      <p className="eyebrow">Una lectura acompañada</p>
      <h1 id="upload-title">Del testimonio a una ruta verificable.</h1>
      <p>
        El video se organiza en fragmentos, hechos y recorridos que podrás
        revisar antes de tomar una decisión.
      </p>
      <ol aria-label="Etapas del análisis">
        <li><span>01</span><strong>Escuchar</strong></li>
        <li><span>02</span><strong>Ordenar</strong></li>
        <li><span>03</span><strong>Trazar</strong></li>
      </ol>
    </aside>
    <div className="narrative-sheet upload-sheet">
      <p className="eyebrow">Nuevo análisis</p>
      <h2>Tu declaración</h2>
      <p>Selecciona un video ficticio o abre el caso preparado para la demostración.</p>
      <div
        className={dragging ? "drop-zone is-dragging" : "drop-zone"}
        onDragEnter={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
      >
        <span className="upload-glyph" aria-hidden="true">↑</span>
        <strong>{file ? file.name : "Arrastra un video ficticio"}</strong>
        <p>MP4, WebM o MOV · hasta 500 MB</p>
        <button type="button" onClick={() => inputRef.current?.click()}>
          Elegir archivo
        </button>
        <input
          ref={inputRef}
          className="visually-hidden"
          type="file"
          aria-label="Archivo de video ficticio"
          accept="video/mp4,video/webm,video/quicktime"
          onChange={(event) => choose(event.target.files?.[0])}
        />
      </div>
      <div className="upload-actions">
        <button
          type="button"
          className="primary-action"
          disabled={!file || busy}
          onClick={() => file && void onUpload(file)}
        >
          {busy ? "Iniciando análisis…" : "Analizar video ficticio"}
        </button>
        <span>o</span>
        <button
          type="button"
          className="demo-action"
          disabled={busy}
          onClick={() => void onDemo()}
        >
          Usar caso ficticio de demostración
        </button>
      </div>
      {error ? <p className="workspace-error" role="alert">{error}</p> : null}
      <div className="real-data-lock" role="note">
        <span aria-hidden="true">⌁</span>
        <div>
          <strong>Testimonios reales bloqueados</strong>
          <p>
            Se habilitarán únicamente después de confirmar ZDR con ambos
            proveedores y registrar la autorización institucional explícita.
          </p>
        </div>
      </div>
    </div>
  </section>
)
```

- [ ] **Step 2: Pass upload errors into the sheet**

Update the initial branch in `analysis-workspace.tsx`:

```tsx
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
```

Remove the separate sibling `<p className="workspace-error">` from this branch.

- [ ] **Step 3: Group the eight persisted stages into three chapters**

In `analysis-progress.tsx`, add:

```tsx
const chapters = [
  { number: "01", title: "Escuchando", stages: ["audio", "transcription"] },
  {
    number: "02",
    title: "Ordenando",
    stages: ["people_places", "dates_facts", "classification", "sources"],
  },
  { number: "03", title: "Trazando", stages: ["timeline", "routes"] },
] as const
```

Render the progress view with the same `.analysis-prelude` outer structure. The
right `.narrative-sheet` must retain the existing `motion.span` progress rule
and render every one of the eight stage labels under its chapter:

```tsx
<ol className="progress-chapters">
  {chapters.map((chapter) => (
    <li key={chapter.number}>
      <span>{chapter.number}</span>
      <div>
        <strong>{chapter.title}</strong>
        <ul>
          {chapter.stages.map((stageId) => {
            const stage = stages.find((item) => item.id === stageId)
            const state = states.get(stageId)
            return (
              <li key={stageId} className={state ? `is-complete state-${state}` : ""}>
                <span aria-hidden="true" />
                {stage?.label}
                <small>{state ? "Persistida" : "En espera"}</small>
              </li>
            )
          })}
        </ul>
      </div>
    </li>
  ))}
</ol>
```

- [ ] **Step 4: Replace the old pre-result layout CSS**

Replace `.upload-panel` and `.analysis-progress` page-level grids with:

```css
.analysis-prelude {
  display: grid;
  width: min(100% - 2rem, 1420px);
  min-height: calc(100svh - 68px);
  margin-inline: auto;
  padding-block: clamp(1.5rem, 4vw, 4rem);
  grid-template-columns: minmax(16rem, 20rem) minmax(0, 1fr);
  align-items: center;
  gap: 1.5rem;
}
.prelude-document h1 {
  margin: 0.8rem 0;
  font-family: "Newsreader", "Libre Caslon Text", Georgia, serif;
  font-size: clamp(2.6rem, 4vw, 4.8rem);
  font-weight: 500;
  letter-spacing: -0.05em;
  line-height: 0.95;
}
.prelude-document > p:last-of-type { color: var(--ink-soft); line-height: 1.7; }
.prelude-document ol { display: grid; gap: 0.7rem; margin: 2rem 0 0; padding: 0; list-style: none; }
.prelude-document li { display: flex; gap: 0.8rem; align-items: baseline; border-top: 1px solid var(--rule); padding-top: 0.7rem; }
.prelude-document li span { color: var(--azul); font-family: ui-monospace, monospace; }
.upload-sheet h2,
.analysis-progress h2 {
  margin: 0.6rem 0;
  font-family: "Newsreader", "Libre Caslon Text", Georgia, serif;
  font-size: clamp(2.2rem, 4vw, 4rem);
  font-weight: 500;
}
.progress-chapters { display: grid; gap: 1rem; margin: 2rem 0 0; padding: 0; list-style: none; }
.progress-chapters > li { display: grid; grid-template-columns: 42px 1fr; gap: 0.8rem; padding: 1rem; border: 1px solid var(--rule); border-radius: 0.85rem; }
.progress-chapters ul { display: grid; gap: 0.5rem; margin: 0.7rem 0 0; padding: 0; list-style: none; }
.progress-chapters ul li { display: grid; grid-template-columns: 10px 1fr auto; align-items: center; gap: 0.5rem; color: var(--ink-faded); }
.progress-chapters ul li > span { width: 8px; height: 8px; border: 1px solid currentColor; border-radius: 50%; }
.progress-chapters ul li.is-complete { color: var(--green); }
.progress-chapters ul li.is-complete > span { background: currentColor; }
```

- [ ] **Step 5: Perform static review**

```bash
rg -n "analysis-prelude|progress-chapters|error=\\{error\\}|onUpload|onDemo|real-data-lock" frontend/src/components/analysis frontend/src/index.css
git diff --check
```

Expected: both states use the shared composition, all existing callbacks remain, and whitespace validation is clean.

- [ ] **Step 6: Commit the pre-result states**

```bash
git add frontend/src/components/analysis/upload-panel.tsx frontend/src/components/analysis/analysis-progress.tsx frontend/src/components/analysis/analysis-workspace.tsx
git add -p frontend/src/index.css
git diff --cached -- frontend/src/index.css frontend/src/components/analysis/upload-panel.tsx frontend/src/components/analysis/analysis-progress.tsx frontend/src/components/analysis/analysis-workspace.tsx
git commit -m "feat: narrate upload and analysis progress"
```

---

### Task 3: Turn the video panel into the documentary rail and add the listening stage

**Files:**
- Modify: `frontend/src/components/analysis/video-panel.tsx`
- Create: `frontend/src/components/analysis/listening-stage.tsx`
- Modify: `frontend/src/index.css`

**Interfaces:**
- Consumes: generated `TranscriptSegment`, current video `source`, active segment id, and segment selection callback.
- Produces: `DocumentaryVideoRail` and `ListeningStage`.

- [ ] **Step 1: Rename the panel export and retain its ref contract**

In `video-panel.tsx`, rename the export while keeping the prop signature and
`data-testid="case-video"`:

```tsx
export const DocumentaryVideoRail = forwardRef<
  HTMLVideoElement,
  {
    source: string | null
    segments: Segment[]
    activeSegmentId: string | null
    onSegmentSelect: (segment: Segment) => void
  }
>(function DocumentaryVideoRail(
  { source, segments, activeSegmentId, onSegmentSelect },
  ref,
) {
  return (
    <aside className="documentary-rail" aria-labelledby="video-title">
      <h2 id="video-title">Tu declaración</h2>
      <div className="documentary-video">
        <video
          ref={ref}
          data-testid="case-video"
          controls
          preload="metadata"
          src={source ?? undefined}
          aria-label="Reproductor del testimonio ficticio"
        />
        {!source ? <div className="video-placeholder" aria-hidden="true"><span>SIAD</span><p>Vista local protegida</p></div> : null}
      </div>
      <p className="privacy-caption">Caso ficticio · identidad protegida <span aria-hidden="true">●</span></p>
      <div className="documentary-fragments" aria-label="Fragmentos de la transcripción">
        {segments.map((segment) => (
          <button
            type="button"
            key={segment.id}
            className={segment.id === activeSegmentId ? "is-active" : ""}
            aria-pressed={segment.id === activeSegmentId}
            onClick={() => onSegmentSelect(segment)}
          >
            <time>{timestamp(segment.start_ms)}</time>
            <span>{segment.text}</span>
          </button>
        ))}
      </div>
    </aside>
  )
})
```

- [ ] **Step 2: Create a non-dashboard listening-stage summary**

Create `listening-stage.tsx`:

```tsx
import type { components } from "../../api/generated"

type Segment = components["schemas"]["TranscriptSegment"]

function timestamp(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

export function ListeningStage({
  segments,
  activeSegmentId,
  onSelect,
}: {
  segments: Segment[]
  activeSegmentId: string | null
  onSelect: (segment: Segment) => void
}) {
  return (
    <section className="listening-stage" aria-labelledby="listening-summary">
      <div className="stage-section-heading">
        <div>
          <p className="eyebrow">Transcripción protegida</p>
          <h2 id="listening-summary">{segments.length} fragmentos vinculados al video</h2>
        </div>
        <p>Selecciona un fragmento para revisar el momento exacto.</p>
      </div>
      <ol>
        {segments.map((segment, index) => (
          <li key={segment.id}>
            <button
              type="button"
              className={segment.id === activeSegmentId ? "is-active" : ""}
              onClick={() => onSelect(segment)}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <blockquote>{segment.text}</blockquote>
              <time>{timestamp(segment.start_ms)}</time>
            </button>
          </li>
        ))}
      </ol>
    </section>
  )
}
```

- [ ] **Step 3: Add documentary-rail and listening CSS**

```css
.narrative-workspace-grid {
  display: grid;
  width: min(100% - 2rem, 1500px);
  margin: 0 auto;
  padding: 1.5rem 0 4rem;
  grid-template-columns: 320px minmax(0, 1fr);
  align-items: start;
  gap: 24px;
}
.documentary-rail {
  position: sticky;
  top: 88px;
  min-width: 0;
}
.documentary-rail > h2 {
  margin: 0 0 0.75rem;
  font-family: "Newsreader", "Libre Caslon Text", Georgia, serif;
  font-size: 1.6rem;
  font-weight: 500;
}
.documentary-video {
  position: relative;
  aspect-ratio: 16 / 10;
  overflow: hidden;
  border: 1px solid var(--rule);
  border-radius: 1rem;
  background: var(--ink);
}
.documentary-video video { position: relative; z-index: 2; width: 100%; height: 100%; object-fit: contain; }
.privacy-caption { color: var(--ink-soft); font-family: "Manrope", sans-serif; font-size: 0.72rem; }
.privacy-caption span { color: var(--green); }
.documentary-fragments { position: relative; display: grid; gap: 0.65rem; padding-left: 1.35rem; }
.documentary-fragments::before { position: absolute; inset: 0 auto 0 0.25rem; width: 1px; background: var(--rule); content: ""; }
.documentary-fragments button {
  position: relative;
  display: grid;
  width: 100%;
  min-height: 72px;
  padding: 0.85rem;
  grid-template-columns: 46px 1fr;
  border: 1px solid var(--rule);
  border-radius: 0.75rem;
  background: color-mix(in oklch, var(--paper-white) 90%, transparent);
  color: var(--ink-soft);
  text-align: left;
}
.documentary-fragments button::before { position: absolute; top: 1.1rem; left: -1.35rem; width: 9px; height: 9px; border-radius: 50%; background: var(--ink); content: ""; }
.documentary-fragments button.is-active { border-color: var(--azul); color: var(--ink); box-shadow: inset 3px 0 0 var(--azul); }
.documentary-fragments time { color: var(--azul); font-family: ui-monospace, monospace; font-size: 0.7rem; }
.documentary-fragments button span { font-family: "Newsreader", serif; font-size: 0.85rem; line-height: 1.45; }
.listening-stage { margin-top: 2rem; }
.listening-stage ol { display: grid; gap: 0.8rem; margin: 1.25rem 0 0; padding: 0; list-style: none; }
.listening-stage button { display: grid; width: 100%; min-height: 88px; padding: 1rem; grid-template-columns: 42px 1fr auto; align-items: start; gap: 1rem; border: 1px solid var(--rule); border-radius: 0.85rem; background: var(--paper-white); text-align: left; }
.listening-stage button.is-active { border-color: var(--azul); box-shadow: inset 4px 0 0 var(--azul); }
.listening-stage blockquote { margin: 0; font-family: "Newsreader", serif; font-size: 1rem; line-height: 1.55; }
```

- [ ] **Step 4: Perform static review**

```bash
rg -n "DocumentaryVideoRail|ListeningStage|case-video|onSegmentSelect|documentary-fragments" frontend/src/components/analysis frontend/src/index.css
git diff --check
```

Expected: ref and callback contracts remain present, both stages use generated types, and whitespace validation is clean.

- [ ] **Step 5: Commit the documentary rail**

```bash
git add frontend/src/components/analysis/video-panel.tsx frontend/src/components/analysis/listening-stage.tsx
git add -p frontend/src/index.css
git diff --cached -- frontend/src/index.css frontend/src/components/analysis/video-panel.tsx frontend/src/components/analysis/listening-stage.tsx
git commit -m "feat: add documentary video rail"
```

---

### Task 4: Integrate classification and human verification into the evidence sheet

**Files:**
- Create: `frontend/src/components/analysis/evidence-stage.tsx`
- Modify: `frontend/src/components/analysis/classification-panel.tsx`
- Modify: `frontend/src/components/analysis/verification-panel.tsx`
- Modify: `frontend/src/index.css`

**Interfaces:**
- Consumes: `classification`, `facts`, `role`, `selectedStartMs`, and existing `onReview`.
- Produces: `EvidenceStage` with an urgency badge and in-sheet `VerificationPanel`.

- [ ] **Step 1: Make `ClassificationPanel` a compact summary**

Keep `classificationValue()` unchanged. Replace the panel markup with:

```tsx
<section className="classification-summary" aria-labelledby="classification-title">
  <div>
    <p className="eyebrow">Lectura especializada</p>
    <h2 id="classification-title">Clasificación BETO</h2>
  </div>
  <dl>
    <div><dt>Categoría</dt><dd>{category?.label ?? "No disponible"}</dd></div>
    <div><dt>Subcategoría</dt><dd>{subcategory?.label ?? "No disponible"}</dd></div>
  </dl>
  <p>BETO aporta categoría y subcategoría; la verificación humana conserva la decisión final.</p>
</section>
```

Retain confidence output beneath the corresponding value when present.

- [ ] **Step 2: Flatten verification groups into one evidence grid**

Keep `displayValue`, `FactCard`, its form submission, role-dependent action, and
provider readings. Replace only the grouping markup in `VerificationPanel`:

```tsx
const orderedFacts = [...facts].sort((left, right) => {
  if (left.is_critical === right.is_critical) return 0
  return left.is_critical ? -1 : 1
})

return (
  <section className="verification-panel" aria-labelledby="verification-title">
    <div className="stage-section-heading">
      <div>
        <p className="eyebrow">Control humano</p>
        <h2 id="verification-title">Señales encontradas</h2>
      </div>
      <p>Cada corrección conserva autor, razón y estado.</p>
    </div>
    <div className="evidence-grid">
      {orderedFacts.map((fact) => (
        <FactCard
          key={fact.id}
          fact={fact}
          role={role}
          selected={selectedFacts.has(fact.id)}
          onReview={onReview}
        />
      ))}
    </div>
  </section>
)
```

- [ ] **Step 3: Add `EvidenceStage` and derive urgency from facts**

Create `evidence-stage.tsx`:

```tsx
import type { components } from "../../api/generated"
import { ClassificationPanel } from "./classification-panel"
import { VerificationPanel } from "./verification-panel"

type Fact = components["schemas"]["FactRead"]
type FactReview = components["schemas"]["FactReviewRequest"]
type Role = components["schemas"]["UserRole"]

export function riskLabelForFacts(facts: Fact[]) {
  const urgency = facts.find((fact) => fact.label.toLocaleLowerCase("es") === "urgencia")
  const value = String(urgency?.value ?? "").toLocaleLowerCase("es")
  if (value === "high" || value === "alta" || value === "alto") return "Riesgo alto"
  if (value === "medium" || value === "media" || value === "medio") return "Riesgo medio"
  return value ? `Riesgo ${value}` : "Riesgo por confirmar"
}

export function EvidenceStage({
  classification,
  facts,
  role,
  selectedStartMs,
  onReview,
}: {
  classification: Record<string, unknown>
  facts: Fact[]
  role: Role
  selectedStartMs?: number | null
  onReview: (factId: string, payload: FactReview) => Promise<void> | void
}) {
  return (
    <div className="evidence-stage">
      <ClassificationPanel classification={classification} />
      <VerificationPanel
        facts={facts}
        role={role}
        selectedStartMs={selectedStartMs}
        onReview={onReview}
      />
    </div>
  )
}
```

- [ ] **Step 4: Replace drawer and three-column verification CSS**

Remove `.verification-shell`, `.verification-trigger`, and
`.verification-close` drawer behavior. Add:

```css
.evidence-stage { margin-top: 2rem; }
.risk-summary-header {
  flex: 0 0 auto;
  min-height: 44px;
  padding: 0.65rem 0.9rem;
  border: 1px solid var(--rojo);
  border-radius: 0.8rem;
  color: var(--rojo);
  font-weight: 600;
}
.classification-summary {
  display: grid;
  padding: 1rem;
  grid-template-columns: minmax(12rem, 0.7fr) minmax(18rem, 1.3fr);
  gap: 1rem;
  border: 1px solid var(--rule);
  border-radius: 0.9rem;
  background: var(--paper-deep);
}
.classification-summary dl { display: grid; margin: 0; grid-template-columns: repeat(2, 1fr); gap: 0.65rem; }
.classification-summary dl > div { padding: 0.75rem; border-left: 3px solid var(--azul); background: var(--paper-white); }
.classification-summary > p { grid-column: 1 / -1; margin: 0; color: var(--ink-faded); font-size: 0.72rem; }
.verification-panel { margin-top: 1.25rem; }
.stage-section-heading { display: flex; align-items: end; justify-content: space-between; gap: 1rem; }
.stage-section-heading h2 { margin: 0.25rem 0 0; font-family: "Newsreader", serif; font-size: 1.75rem; font-weight: 500; }
.stage-section-heading > p { max-width: 18rem; margin: 0; color: var(--ink-faded); font-size: 0.72rem; text-align: right; }
.evidence-grid { display: grid; margin-top: 1rem; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
.fact-card { min-width: 0; padding: 1rem; border: 1px solid var(--rule); border-radius: 0.9rem; background: var(--paper-white); box-shadow: 0 8px 22px color-mix(in oklch, var(--ink) 5%, transparent); }
.fact-card.is-contextual { border-color: var(--azul); box-shadow: inset 4px 0 0 var(--azul); }
.fact-review-form input,
.fact-review-form textarea { width: 100%; }
.fact-review-form button { min-height: 44px; }
```

- [ ] **Step 5: Perform static review**

```bash
rg -n "EvidenceStage|Riesgo alto|evidence-grid|FactReviewRequest|verification-shell|verification-trigger" frontend/src/components/analysis frontend/src/index.css
git diff --check
```

Expected: evidence is integrated in one sheet; the old drawer selectors no longer have active rules; role-aware review signatures remain.

- [ ] **Step 6: Commit the evidence stage**

```bash
git add frontend/src/components/analysis/evidence-stage.tsx frontend/src/components/analysis/classification-panel.tsx frontend/src/components/analysis/verification-panel.tsx
git add -p frontend/src/index.css
git diff --cached -- frontend/src/index.css frontend/src/components/analysis/evidence-stage.tsx frontend/src/components/analysis/classification-panel.tsx frontend/src/components/analysis/verification-panel.tsx
git commit -m "feat: integrate evidence review into narrative sheet"
```

---

### Task 5: Combine timeline, routes, sources, and approval in the route chapter

**Files:**
- Create: `frontend/src/components/analysis/route-stage.tsx`
- Modify: `frontend/src/components/analysis/timeline.tsx`
- Modify: `frontend/src/components/analysis/routes-comparison.tsx`
- Modify: `frontend/src/index.css`

**Interfaces:**
- Consumes: full `CaseRead`, `UserRole`, selected timeline id, timeline selection, and approval callback.
- Produces: `RouteStage`.

- [ ] **Step 1: Add the composition wrapper**

Create `route-stage.tsx`:

```tsx
import type { components } from "../../api/generated"
import { RoutesComparison } from "./routes-comparison"
import { Timeline } from "./timeline"

type CaseData = components["schemas"]["CaseRead"]
type Role = components["schemas"]["UserRole"]
type TimelineEvent = components["schemas"]["TimelineEventRead"]

export function RouteStage({
  caseData,
  role,
  selectedId,
  onTimelineSelect,
  onApprove,
}: {
  caseData: CaseData
  role: Role
  selectedId: string | null
  onTimelineSelect: (event: TimelineEvent) => void
  onApprove: () => Promise<void> | void
}) {
  return (
    <div className="route-stage">
      <Timeline
        events={caseData.timeline}
        selectedId={selectedId}
        onSelect={onTimelineSelect}
      />
      <RoutesComparison caseData={caseData} role={role} onApprove={onApprove} />
    </div>
  )
}
```

- [ ] **Step 2: Make the timeline a compact horizontal reading sequence**

Keep its button semantics, `aria-pressed`, timestamps, `StatusBadge`, and
Framer Motion reduced-motion behavior. Change only the structural class names
so `.timeline-events` can render a horizontal sequence on desktop:

```tsx
<ol className="timeline-events" aria-label="Momentos vinculados al video">
  {events.map((event, index) => (
    <motion.li
      key={event.id}
      initial={reduceMotion ? false : { y: 12 }}
      animate={{ y: 0 }}
      transition={{
        delay: reduceMotion ? 0 : index * 0.08,
        duration: reduceMotion ? 0.01 : 0.32,
      }}
    >
      <button
        type="button"
        className={selectedId === event.id ? "timeline-node is-selected" : "timeline-node"}
        onClick={() => onSelect(event)}
        aria-pressed={selectedId === event.id}
      >
        <span className="timeline-time">{timestamp(event.start_ms)}</span>
        <span className="timeline-copy">
          <span className="timeline-kicker">Momento {index + 1}</span>
          <strong>{event.title}</strong>
          <span>{event.description}</span>
          <StatusBadge status={event.verification_status} confidence={event.confidence_band} origin={event.origin} />
        </span>
      </button>
    </motion.li>
  ))}
</ol>
```

- [ ] **Step 3: Retain route and approval rules while simplifying presentation**

In `routes-comparison.tsx`, do not change:

```tsx
const canValidate = role === "validador" || role === "admin"
const isFinal = caseData.recommendation_status === "final"
const canApprove = canValidate && caseData.critical_inconsistencies === 0 && !isFinal
```

Retain source URLs, `verified_at`, disclaimers, empty routes, and the final
approval button. Change the introductory copy to:

```tsx
<div className="stage-section-heading routes-heading">
  <div>
    <p className="eyebrow">Tres recorridos comparables</p>
    <h2 id="routes-title">Rutas institucionales</h2>
  </div>
  <span className={isFinal ? "recommendation-label is-final" : "recommendation-label"}>
    {isFinal ? "Orientación final aprobada" : "Recomendación preliminar"}
  </span>
</div>
```

- [ ] **Step 4: Add route-chapter CSS**

```css
.route-stage { margin-top: 2rem; }
.timeline-section { padding: 0; }
.timeline-track { position: relative; padding: 1rem 0 0; }
.timeline-events {
  display: grid;
  grid-auto-columns: minmax(15rem, 1fr);
  grid-auto-flow: column;
  gap: 0.8rem;
  margin: 0;
  padding: 0 0 0.75rem;
  overflow-x: auto;
  list-style: none;
  scroll-snap-type: x proximity;
}
.timeline-events > li { scroll-snap-align: start; }
.timeline-node { display: grid; width: 100%; min-height: 100%; padding: 0; grid-template-rows: auto 1fr; border: 0; background: transparent; text-align: left; }
.timeline-time { width: fit-content; margin-left: 0.8rem; padding: 0.35rem 0.55rem; border: 1px solid var(--ink); border-radius: 999px; background: var(--paper-white); }
.timeline-copy { display: grid; min-height: 11rem; padding: 1rem; border: 1px solid var(--rule); border-radius: 0.85rem; background: var(--paper-white); }
.timeline-node.is-selected .timeline-copy { border-color: var(--azul); box-shadow: inset 0 4px 0 var(--azul); }
.routes-section { margin-top: 2rem; padding-top: 2rem; border-top: 1px solid var(--rule); }
.route-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.8rem; }
.route-journey { border: 1px solid var(--rule); border-radius: 0.9rem; background: var(--paper-white); }
.approval-bar button { min-height: 44px; border-radius: 0.65rem; background: var(--azul); color: white; }
```

- [ ] **Step 5: Perform static review**

```bash
rg -n "RouteStage|canApprove|critical_inconsistencies|verified_at|source.url|onTimelineSelect|onApprove" frontend/src/components/analysis
git diff --check
```

Expected: the route chapter composes existing data, the approval gate is unchanged, source grounding remains, and whitespace validation is clean.

- [ ] **Step 6: Commit the route chapter**

```bash
git add frontend/src/components/analysis/route-stage.tsx frontend/src/components/analysis/timeline.tsx frontend/src/components/analysis/routes-comparison.tsx
git add -p frontend/src/index.css
git diff --cached -- frontend/src/index.css frontend/src/components/analysis/route-stage.tsx frontend/src/components/analysis/timeline.tsx frontend/src/components/analysis/routes-comparison.tsx
git commit -m "feat: narrate timeline and institutional routes"
```

---

### Task 6: Recompose `AnalysisWorkspace`, refine the page header, and finish responsive behavior

**Files:**
- Modify: `frontend/src/components/analysis/analysis-workspace.tsx`
- Modify: `frontend/src/pages/conversation-page.tsx`
- Modify: `frontend/src/index.css`

**Interfaces:**
- Consumes: Tasks 1–5 public exports.
- Produces: the complete approved two-column authenticated experience.

- [ ] **Step 1: Add local presentation-stage state**

In `analysis-workspace.tsx`, replace the old presentation imports with:

```tsx
import { DocumentaryVideoRail } from "./video-panel"
import { EvidenceStage, riskLabelForFacts } from "./evidence-stage"
import { ListeningStage } from "./listening-stage"
import { NarrativeStageHeader, type NarrativeStage } from "./narrative-stage"
import { RouteStage } from "./route-stage"
```

Add:

```tsx
const [narrativeStage, setNarrativeStage] = useState<NarrativeStage>("listening")
```

Reset it in `useDemo` and `upload` before starting analysis:

```tsx
setNarrativeStage("listening")
```

- [ ] **Step 2: Preserve API state and replace only the result composition**

Do not change `useAnalysisEvents`, remote video loading, `startAnalysis`,
`useDemo`, `upload`, `seekTo`, `selectEvent`, `selectSegment`, `review`, or
`approve`.

Replace the final result return with:

```tsx
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
              ? <span className="risk-summary-header">{riskLabel}</span>
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
              selectedStartMs={selectedEvent?.start_ms}
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
          <button
            type="button"
            disabled={narrativeStage === "route"}
            onClick={() => setNarrativeStage(
              narrativeStage === "listening" ? "evidence" : "route",
            )}
          >
            {narrativeStage === "listening" ? "Revisar señales" : "Continuar a la ruta"} <span aria-hidden="true">→</span>
          </button>
        </footer>
      </main>
    </div>
  </div>
)
```

Do not nest this result `<main>` inside another `<main>`. Change
`conversation-page.tsx` outer element to `<div className="analysis-app">`.

- [ ] **Step 3: Refine the authenticated header**

Replace the square SIAD mark with the implementable tricolor mark used by the
book:

```tsx
<header className="workspace-header">
  <Link to="/" className="workspace-brand" aria-label="Volver al libro">
    <span className="workspace-mark" aria-hidden="true">
      <i /><i /><i />
    </span>
    <span>
      <strong>SIAD</strong>
      <small>Constructor de ruta de acción</small>
    </span>
  </Link>
  <div className="workspace-identity">
    <span><strong>{user?.email}</strong><small>{user?.role}</small></span>
    <button type="button" onClick={() => void logout()}>Cerrar sesión <span aria-hidden="true">→</span></button>
  </div>
</header>
```

Retain the existing `user ? <AnalysisWorkspace role={user.role} /> : null`.

- [ ] **Step 4: Add stage transitions, actions, focus, and responsive CSS**

```css
.workspace-header {
  position: sticky;
  z-index: 40;
  top: 0;
  display: flex;
  min-height: 68px;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.65rem clamp(1rem, 3vw, 3rem);
  border-bottom: 1px solid var(--rule);
  background: color-mix(in oklch, var(--paper) 94%, transparent);
  backdrop-filter: blur(14px);
}
.workspace-brand {
  display: flex;
  width: auto;
  height: auto;
  align-items: center;
  gap: 0.8rem;
  border: 0;
  color: var(--ink);
  text-decoration: none;
}
.workspace-brand::after { display: none; }
.workspace-mark {
  display: grid;
  width: 36px;
  height: 24px;
  grid-template-columns: 2fr 1fr 1fr;
  grid-template-rows: 1fr;
  transform: skewX(-12deg) rotate(-4deg);
}
.workspace-mark i:nth-child(1) { background: var(--amarillo); }
.workspace-mark i:nth-child(2) { background: var(--azul); }
.workspace-mark i:nth-child(3) { background: var(--rojo); }
.workspace-brand > span:last-child,
.workspace-identity > span { display: grid; gap: 0.15rem; }
.workspace-brand strong {
  font-family: "Newsreader", "Libre Caslon Text", Georgia, serif;
  font-size: 1.25rem;
}
.workspace-brand small,
.workspace-identity small { color: var(--ink-faded); font-size: 0.66rem; }
.workspace-identity { display: flex; align-items: center; gap: 1rem; }
.workspace-identity > span { text-align: right; }
.workspace-identity button {
  min-height: 44px;
  padding-inline: 0.9rem;
  border: 0;
  border-left: 1px solid var(--rule);
  background: transparent;
}
@keyframes narrative-stage-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes narrative-rule-in {
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
}
.narrative-stage-content { animation: narrative-stage-in 420ms cubic-bezier(0.16, 1, 0.3, 1) both; }
.narrative-stage-actions { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--rule); }
.narrative-stage-actions p { color: var(--ink-faded); font-size: 0.72rem; }
.narrative-stage-actions button {
  min-height: 48px;
  padding: 0.75rem 1.1rem;
  border: 1px solid var(--azul);
  border-radius: 0.65rem;
  background: var(--azul);
  color: white;
  font-weight: 700;
}
.narrative-stage-actions button:disabled { display: none; }
.analysis-app :is(button, a, input, textarea):focus-visible {
  outline: 3px solid color-mix(in oklch, var(--azul) 36%, transparent);
  outline-offset: 3px;
}

@media (max-width: 960px) {
  .analysis-prelude,
  .narrative-workspace-grid { grid-template-columns: 1fr; }
  .documentary-rail { position: static; }
  .documentary-fragments {
    grid-auto-columns: minmax(16rem, 72vw);
    grid-auto-flow: column;
    padding: 0 0 0.6rem;
    overflow-x: auto;
  }
  .documentary-fragments::before,
  .documentary-fragments button::before { display: none; }
  .classification-summary { grid-template-columns: 1fr; }
  .evidence-grid { grid-template-columns: 1fr; }
  .route-grid { grid-template-columns: 1fr; }
  .narrative-stage-title-row { flex-direction: column; }
  .risk-summary-header { order: -1; }
}

@media (max-width: 600px) {
  .workspace-header { min-height: 60px; padding: 0.5rem 0.75rem; }
  .workspace-brand small,
  .workspace-identity > span { display: none; }
  .analysis-prelude,
  .narrative-workspace-grid { width: min(100% - 1rem, 1500px); padding-top: 0.75rem; }
  .narrative-sheet { padding: 1rem; border-radius: 1rem; }
  .narrative-stage-meta p span { display: none; }
  .narrative-stage-title-row h1 { font-size: clamp(2.35rem, 14vw, 3.4rem); }
  .stage-section-heading,
  .narrative-stage-actions { align-items: stretch; flex-direction: column; }
  .stage-section-heading > p { max-width: none; text-align: left; }
  .narrative-stage-actions button { width: 100%; }
  .listening-stage button { grid-template-columns: 34px 1fr; }
  .listening-stage time { grid-column: 2; }
}

@media (prefers-reduced-motion: reduce) {
  .narrative-stage-content,
  .narrative-title-rule { animation: none; }
}
```

- [ ] **Step 5: Remove obsolete presentation paths**

Delete unused imports and obsolete markup for:

- `.workspace-header > a` square-logo rules and its `::after`;
- `.workspace-columns`;
- `.analysis-narrative`;
- `.verification-shell`;
- `.verification-close`;
- `.verification-trigger`;
- the old three-column media query.

Do not delete `StatusBadge`, backend operations, route approval, or source
grounding.

- [ ] **Step 6: Perform final static verification**

Run only:

```bash
rg -n "workspace-columns|verification-shell|verification-trigger|analysis-narrative" frontend/src
rg -n "NarrativeStageHeader|DocumentaryVideoRail|ListeningStage|EvidenceStage|RouteStage" frontend/src/components/analysis
rg -n "apiClient|useAnalysisEvents|video_stream_url|facts/\\$\\{factId\\}|/approve|critical_inconsistencies" frontend/src/components/analysis/analysis-workspace.tsx frontend/src/components/analysis/routes-comparison.tsx
git diff --check
git status --short
```

Expected:

- the first search has no active JSX references;
- all five narrative components are imported or rendered;
- all backend operations and approval gates remain;
- `git diff --check` prints nothing;
- only intended frontend files plus pre-existing dirty files are listed.

Do not run tests, `npm run build`, `make frontend`, Vite, Playwright, or the
backend server.

- [ ] **Step 7: Commit the completed narrative workspace**

```bash
git add frontend/src/components/analysis/analysis-workspace.tsx frontend/src/pages/conversation-page.tsx
git add -p frontend/src/index.css
git diff --cached -- frontend/src/index.css frontend/src/components/analysis/analysis-workspace.tsx frontend/src/pages/conversation-page.tsx
git commit -m "feat: rebuild conversation as narrative workspace"
```
