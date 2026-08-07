# Route Photographic Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three route pictograms with readable full-bleed photographs on closed route cards while preserving the clean timeline experience when a route opens.

**Architecture:** A closed `ROUTE_ARTWORK` mapping provides one decorative image per route type. React renders the image only while the route is closed; CSS scrim and paper layers control contrast and the transition without changing route data or timeline behavior.

**Tech Stack:** React 19, TypeScript, Framer Motion, CSS, Vitest, Testing Library, Vite, WebP.

## Global Constraints

- Use one horizontal photograph for `emergency`, `housing_stabilization`, and `return_relocation`.
- The photograph covers only the closed route card; the open route and timeline use a clean paper surface.
- Preserve all copy, verification states, warnings, single-open-route behavior, and timeline interactions.
- Images are decorative with `alt=""` and `aria-hidden="true"`; text continues to name each button.
- Maintain AA contrast, visible keyboard focus, responsive cropping, and reduced-motion behavior.
- Do not change the API, backend, route data, verification logic, or timeline implementation.

---

### Task 1: Encode the closed-card artwork contract

**Files:**
- Modify: `frontend/src/components/analysis/analysis-workspace.test.tsx`
- Modify: `frontend/src/components/analysis/routes-comparison.tsx`

**Interfaces:**
- Consumes: `route.route_type`, `isOpen`, and `reduceMotion` in `RoutesComparison`.
- Produces: `ROUTE_ARTWORK: Record<string, { src: string; position: string }>` and `RouteArtwork`.

- [ ] **Step 1: Write the failing closed-card test**

Add to the existing `opens one institutional route at a time` test before opening:

```tsx
const artwork = screen.getByTestId("route-artwork-emergency")
expect(artwork).toHaveAttribute("src", "/images/routes/atencion-inmediata.webp")
expect(artwork).toHaveAttribute("alt", "")
expect(artwork).toHaveAttribute("aria-hidden", "true")
expect(screen.queryByRole("img", { name: "Atención inmediata" })).not.toBeInTheDocument()
```

After opening, assert `queryByTestId("route-artwork-emergency")` is absent. After closing, assert it is present again.

- [ ] **Step 2: Run the focused test and verify RED**

```bash
cd frontend && npm test -- src/components/analysis/analysis-workspace.test.tsx -t "opens one institutional route at a time"
```

Expected: FAIL because the artwork does not exist and the named pictogram is still rendered.

- [ ] **Step 3: Implement the minimal artwork component**

Replace the glyph mapping with:

```tsx
const ROUTE_ARTWORK: Record<string, { src: string; position: string }> = {
  emergency: {
    src: "/images/routes/atencion-inmediata.webp",
    position: "center 48%",
  },
  housing_stabilization: {
    src: "/images/routes/estabilizacion-vivienda.webp",
    position: "center 52%",
  },
  return_relocation: {
    src: "/images/routes/retorno-reubicacion.webp",
    position: "center 50%",
  },
}

function RouteArtwork({ routeType, reduceMotion }: {
  routeType: string
  reduceMotion: boolean
}) {
  const artwork = ROUTE_ARTWORK[routeType]
  if (!artwork) return null
  return (
    <motion.img
      alt=""
      aria-hidden="true"
      className="route-card-artwork"
      data-testid={`route-artwork-${routeType}`}
      src={artwork.src}
      style={{ objectPosition: artwork.position }}
      initial={reduceMotion ? false : { opacity: 0, scale: 1.025 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.01 }}
      transition={{ duration: reduceMotion ? 0.01 : 0.22 }}
    />
  )
}
```

Inside `.route-journey-toggle`, render it only when closed:

```tsx
<AnimatePresence initial={false}>
  {!isOpen ? (
    <RouteArtwork
      key={`${route.id}-artwork`}
      routeType={route.route_type}
      reduceMotion={reduceMotion}
    />
  ) : null}
</AnimatePresence>
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 5: Review the scoped diff**

```bash
git diff -- frontend/src/components/analysis/routes-comparison.tsx frontend/src/components/analysis/analysis-workspace.test.tsx
```

Confirm only the pictogram and closed-card artwork contract changed.

---

### Task 2: Generate and optimize the route photographs

**Files:**
- Create: `frontend/public/images/routes/atencion-inmediata.webp`
- Create: `frontend/public/images/routes/estabilizacion-vivienda.webp`
- Create: `frontend/public/images/routes/retorno-reubicacion.webp`

**Interfaces:**
- Consumes: the public paths introduced in Task 1.
- Produces: three wide WebP photographs, at least 1536 pixels wide and under 500 KB each where quality permits.

- [ ] **Step 1: Generate attention artwork**

```text
Use case: photorealistic-natural
Asset type: full-bleed horizontal institutional route card
Primary request: dignified immediate institutional attention for a Colombian family affected by forced displacement
Scene/backdrop: calm public-service reception in southwestern Colombia, advisor welcoming an adult from a respectful distance
Style/medium: natural-light documentary photography, authentic, sober and humane
Composition/framing: wide scene filling the frame; left third calmer and darker for interface copy; people not looking at camera
Lighting/mood: warm window light, reassurance and urgency without panic
Constraints: anonymous adults, no identifiable faces, text, logos, uniforms, flags, watermark, or explicit violence
```

- [ ] **Step 2: Generate housing artwork**

```text
Use case: photorealistic-natural
Asset type: full-bleed horizontal institutional route card
Primary request: safe temporary housing and stabilization for a Colombian family affected by forced displacement
Scene/backdrop: modest dignified room in the Andean region, prepared beds, folded blankets, a bag placed down, adult from behind entering
Style/medium: natural-light documentary photography, authentic, sober and humane
Composition/framing: wide scene filling the frame; calm left third for interface copy; no staged real-estate appearance
Lighting/mood: soft morning light, shelter, relief and dignity
Constraints: no identifiable faces, text, logos, institutional marks, watermark, or misery imagery
```

- [ ] **Step 3: Generate return or relocation artwork**

```text
Use case: photorealistic-natural
Asset type: full-bleed horizontal institutional route card
Primary request: voluntary and safe decision between return and relocation after forced displacement in Colombia
Scene/backdrop: Andean road and intermunicipal transport setting in Cauca, two anonymous adults from behind, subtle luggage, mountain territory
Style/medium: natural-light documentary photography, realistic geography, sober and humane
Composition/framing: wide scene filling the frame; calm slightly darker left third for interface copy; avoid heroic posing
Lighting/mood: late-afternoon light, thoughtful and cautiously hopeful
Constraints: no identifiable faces, text, logos, flags, military presence, weapons, or watermark
```

- [ ] **Step 4: Save and optimize selected outputs**

Create `frontend/public/images/routes/`, resize sources to 1920 pixels wide when larger, and convert to WebP quality 82 using the available image utility. Example:

```bash
magick source.png -resize '1920x>' -quality 82 frontend/public/images/routes/atencion-inmediata.webp
```

- [ ] **Step 5: Validate dimensions and weight**

```bash
file frontend/public/images/routes/*.webp
du -h frontend/public/images/routes/*.webp
```

Expected: three valid WebP files at least 1536 pixels wide with practical web sizes.

---

### Task 3: Style readable closed and open states

**Files:**
- Modify: `frontend/src/index.css`
- Test: `frontend/src/components/analysis/analysis-workspace.test.tsx`

**Interfaces:**
- Consumes: `.route-card-artwork`, `.route-journey`, `.route-journey-toggle`, `.is-open`, and `--route-accent`.
- Produces: full-bleed closed cards, paper open state, responsive cropping, focus, and reduced-motion safeguards.

- [ ] **Step 1: Add state assertions to the interaction test**

```tsx
const journey = opener.closest("article")
expect(journey).not.toHaveClass("is-open")
fireEvent.click(opener)
expect(journey).toHaveClass("is-open")
```

- [ ] **Step 2: Run the focused test**

Run the Task 1 test command. Expected: PASS because the existing state class is the CSS contract.

- [ ] **Step 3: Implement card layers and layout**

Use a two-column grid without the former glyph column. Add an absolutely positioned `.route-card-artwork` with `object-fit: cover`. Add a dark left-to-right scrim beneath the copy and an opaque paper layer whose opacity becomes `1` in `.is-open`. Set the closed card to about `12rem` tall, use white or ivory copy, preserve the route accent filet, and give warning text its own strongly translucent surface.

Representative layer contract:

```css
.route-journey-toggle { position: relative; isolation: isolate; }
.route-card-artwork { position: absolute; z-index: -3; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.route-journey-toggle::before { background: linear-gradient(90deg, rgb(16 24 31 / 88%), rgb(16 24 31 / 34%)); }
.route-journey-toggle::after { background: var(--paper-white); opacity: 0; }
.route-journey.is-open .route-journey-toggle::before { opacity: 0; }
.route-journey.is-open .route-journey-toggle::after { opacity: 1; }
```

- [ ] **Step 4: Add responsive and reduced-motion rules**

At or below 720 px, reduce closed height to about `10.5rem`, move the hint below the copy, and strengthen the vertical scrim. Under `prefers-reduced-motion: reduce`, remove artwork transforms and reduce transition duration to `0.01ms`.

- [ ] **Step 5: Run the full component test file**

```bash
cd frontend && npm test -- src/components/analysis/analysis-workspace.test.tsx
```

Expected: all tests pass.

---

### Task 4: Visual QA and production verification

**Files:**
- Modify only if defects are observed: `frontend/src/index.css`
- Modify only if defects are observed: `frontend/src/components/analysis/routes-comparison.tsx`

**Interfaces:**
- Consumes: the completed cards and local Vite app.
- Produces: verified desktop, mobile, keyboard, and production behavior.

- [ ] **Step 1: Inspect all card states in the local app**

```bash
cd frontend && npm run dev
```

Inspect all three closed cards at desktop width. Open each route and confirm the photograph is absent from the expanded timeline state.

- [ ] **Step 2: Inspect keyboard and mobile behavior**

Tab through each route button and confirm visible focus over every photograph. Repeat near 390 by 844 pixels and confirm no clipped copy, image-induced layout shift, or horizontal page overflow.

- [ ] **Step 3: Correct only observed defects**

Adjust only route crop positions or route-card CSS when QA reveals a contrast, focus, crop, or responsive issue; then repeat Steps 1-2.

- [ ] **Step 4: Run complete frontend tests**

```bash
cd frontend && npm test
```

Expected: zero failures.

- [ ] **Step 5: Run the production build**

```bash
cd frontend && npm run build
```

Expected: TypeScript and Vite exit with code 0.

- [ ] **Step 6: Review the final scoped diff**

```bash
git diff --check
git diff -- frontend/src/components/analysis/routes-comparison.tsx frontend/src/components/analysis/analysis-workspace.test.tsx frontend/src/index.css
git status --short -- frontend/public/images/routes docs/superpowers
```

Confirm the final changes match the approved design and contain no unrelated edits.
