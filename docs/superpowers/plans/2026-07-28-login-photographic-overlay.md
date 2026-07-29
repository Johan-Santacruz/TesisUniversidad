# Photographic Login Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `/login` as a photo-dominant composition with a compact translucent form overlaid on the mosaic.

**Architecture:** Preserve the existing authentication and navigation logic in `LoginPage`. Update only its semantic presentation, isolate the complete visual treatment under `login-*` selectors, and load the new fonts globally while applying them only to the login.

**Tech Stack:** React 19, TypeScript 5.7, React Router 7, CSS, Google Fonts.

## Global Constraints

- Modify only frontend files and documentation.
- Do not modify authentication, API contracts, protected routes, or backend.
- Preserve all pre-existing uncommitted changes in the worktree.
- Do not create or execute tests, build commands, browser checks, or other verification commands, per the user's explicit request.
- Keep the six existing photographs on desktop and four on mobile.
- Use `Newsreader` for display copy and `Manrope` for interface copy, scoped to `.login-page`.
- Keep labels, password visibility control, live error message, loading state, and security notice accessible.

---

### Task 1: Load and scope the new typography

**Files:**
- Modify: `frontend/index.html`
- Modify: `frontend/src/index.css`

**Interfaces:**
- Consumes: Google Fonts stylesheet loading in `frontend/index.html`.
- Produces: `Newsreader` and `Manrope` font families available to `.login-page`.

- [ ] **Step 1: Update the Google Fonts request**

Add `Newsreader` weights 400, 500, 600 with italics and `Manrope` weights 400,
500, 600, 700 to the existing stylesheet URL. Keep all fonts already used by
the rest of the application.

- [ ] **Step 2: Scope the pair to the login**

Add these font anchors to the login CSS:

```css
.login-page {
  font-family: "Manrope", "Public Sans", Inter, system-ui, sans-serif;
}

.login-form-shell h1 {
  font-family: "Newsreader", "Libre Caslon Text", Georgia, serif;
}
```

Do not change the global `body` or Tailwind theme font mappings.

### Task 2: Restore a clear compact form hierarchy

**Files:**
- Modify: `frontend/src/pages/login-page.tsx`

**Interfaces:**
- Consumes: `useAuth()`, `ApiError`, `useLocation()`, and `useNavigate()` exactly as currently implemented.
- Produces: the existing `LoginPage` export plus `.login-mosaic-heading`, `.login-photo-index`, and a complete heading hierarchy.

- [ ] **Step 1: Enrich the photo data without changing sources**

Add a two-digit index to each `COLLAGE_PHOTOS` entry and render it as a
decorative `.login-photo-index` span inside each figure.

- [ ] **Step 2: Add the photographic context block**

Inside `.login-collage`, before the figures, render:

```tsx
<div className="login-mosaic-heading">
  <span>SIAD · Archivo visual</span>
  <strong>Territorio, memoria y acceso a derechos.</strong>
</div>
```

The collage remains `aria-hidden="true"`.

- [ ] **Step 3: Restore the form heading**

Inside `.login-form-shell`, before `<form>`, render:

```tsx
<p className="login-eyebrow">SIAD · Acceso institucional</p>
<h1 id="login-title">Bienvenido de nuevo.</h1>
<p className="login-intro">
  Ingresa para analizar casos ficticios y validar rutas de atención.
</p>
```

Keep `handleSubmit`, password visibility, error handling, loading copy, and
redirect behavior unchanged.

### Task 3: Replace the equal collage with the photographic overlay

**Files:**
- Modify: `frontend/src/index.css`

**Interfaces:**
- Consumes: the class names rendered by `LoginPage`.
- Produces: a transparent full-screen page, asymmetric mosaic, translucent form panel, and responsive form-first composition.

- [ ] **Step 1: Set the page and desktop overlap**

Use a transparent page with a photo-dominant grid:

```css
.login-page {
  display: grid;
  min-height: 100svh;
  grid-template-columns: minmax(0, 1fr) minmax(22rem, 28rem);
  align-items: center;
  padding: clamp(1rem, 2.5vw, 2.5rem);
  background: transparent;
}

.login-collage {
  display: grid;
  min-height: calc(100svh - clamp(2rem, 5vw, 5rem));
  grid-template-columns: repeat(12, 1fr);
  grid-template-rows: repeat(10, 1fr);
  gap: clamp(0.55rem, 1vw, 0.9rem);
}

.login-panel {
  z-index: 10;
  margin-left: clamp(-6rem, -5vw, -3.5rem);
  background: color-mix(in srgb, white 78%, transparent);
  backdrop-filter: blur(24px) saturate(1.15);
}
```

- [ ] **Step 2: Assign asymmetric photo spans**

Make the first image the hero, distribute the five supporting images across
the remaining rows and columns, remove strong rotations, and use consistent
gaps, 18–26 px radii, subtle inset borders, tonal overlays, and brief shadows.

- [ ] **Step 3: Refine form controls**

Use compact spacing, 14 px field radii, a visible blue focus state, a dark-blue
primary button, and a password toggle contained inside the input without
overlap.

- [ ] **Step 4: Implement tablet and mobile layout**

At widths below 1080 px, reduce the overlap and panel width. Below 768 px,
render the collage as the photographic header, place the panel over its lower
edge while keeping it in document flow, hide photos five and six, and prevent
horizontal overflow.

- [ ] **Step 5: Preserve reduced-motion behavior**

Keep the existing `prefers-reduced-motion` block covering all login entrance
animations.

## Completion

Do not run tests, builds, browser checks, lint commands, or visual validation.
Report the three modified frontend files and disclose that verification was
intentionally omitted at the user's request.
