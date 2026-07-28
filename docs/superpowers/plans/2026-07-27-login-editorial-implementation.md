# SIAD Editorial Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic centered login card with the approved full-screen editorial collage while preserving authentication and accessibility.

**Architecture:** Keep authentication state and API calls unchanged inside `LoginPage`. Split the rendered page into a decorative collage section and a semantic form section, then isolate the visual system under `login-*` CSS selectors so the workspace is unaffected. Validate behavior in Vitest and layout, accessibility, responsive order, and reduced motion in Playwright.

**Tech Stack:** React 19, TypeScript 5.7, React Router 7, Vitest, Testing Library, Playwright, Axe, CSS.

## Global Constraints

- Scope is limited to `/login`; do not modify the backend, authentication contract, protected routes, upload workspace, or other pages.
- Reuse the six existing files under `frontend/public/images`; do not add real testimony media.
- Desktop uses a full-viewport collage/form split without an outer card or window.
- The strings “Archivo vivo · Cauca”, “Escuchar también es proteger”, “Propuesta refinada · v2”, and “Revista comunitaria, no portal institucional” must not appear.
- Mobile renders the form before a four-image compact collage and never scrolls horizontally.
- Maintain one `h1`, associated labels, keyboard navigation, AA contrast, 44 px targets, `role="alert"`, and `prefers-reduced-motion`.
- Execution is inline with `superpowers:executing-plans`; the user explicitly requested no subagents.

---

## File Map

- `frontend/src/pages/login-page.tsx`: semantic login layout, collage content, password visibility, existing submit behavior.
- `frontend/src/pages/login-page.test.tsx`: focused component tests for approved copy, collage content, password visibility, and API errors.
- `frontend/src/index.css`: isolated full-screen editorial layout, photo positioning, responsive reordering, focus, error, loading, and motion rules.
- `frontend/e2e/login.spec.ts`: viewport geometry, horizontal overflow, keyboard access, Axe, reduced motion, and visual attachments.

### Task 1: Build the semantic editorial login and form states

**Files:**
- Create: `frontend/src/pages/login-page.test.tsx`
- Modify: `frontend/src/pages/login-page.tsx`

**Interfaces:**
- Consumes: `useAuth(): AuthValue`, `ApiError`, `useLocation()`, and `useNavigate()` exactly as the existing page does.
- Produces: `LoginPage`, `.login-page`, `.login-collage`, `.login-photo`, `.login-panel`, and an accessible button named “Mostrar contraseña”/“Ocultar contraseña”.

- [ ] **Step 1: Write the failing component tests**

Create `frontend/src/pages/login-page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AuthProvider } from "../auth/auth-context"
import LoginPage from "./login-page"

function renderLogin() {
  return render(
    <AuthProvider>
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    </AuthProvider>,
  )
}

describe("LoginPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ detail: "Sin sesión" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    )
  })

  it("renders the approved editorial composition without rejected copy", async () => {
    const { container } = renderLogin()

    expect(
      await screen.findByRole("heading", { name: "Bienvenido." }),
    ).toBeVisible()
    expect(container.querySelectorAll(".login-photo")).toHaveLength(6)
    expect(screen.queryByText(/Archivo vivo · Cauca/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Escuchar también es proteger/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Revista comunitaria/i)).not.toBeInTheDocument()
  })

  it("lets a keyboard user reveal and hide the password", async () => {
    const user = userEvent.setup()
    renderLogin()
    const password = await screen.findByLabelText("Contraseña")

    expect(password).toHaveAttribute("type", "password")
    await user.click(screen.getByRole("button", { name: "Mostrar contraseña" }))
    expect(password).toHaveAttribute("type", "text")
    await user.click(screen.getByRole("button", { name: "Ocultar contraseña" }))
    expect(password).toHaveAttribute("type", "password")
  })
})
```

- [ ] **Step 2: Run the tests and confirm the intended failures**

Run:

```bash
cd frontend
npm test -- --run src/pages/login-page.test.tsx
```

Expected: FAIL because the heading remains “Ingresar a SIAD”, there are no
`.login-photo` elements, and the password toggle is absent.

- [ ] **Step 3: Implement the minimal semantic structure**

In `frontend/src/pages/login-page.tsx`, retain the existing `target`, redirect,
`submit`, error, and loading logic. Add password visibility state and these
stable data structures:

```tsx
const collagePhotos = [
  { src: "/images/cover-andes.jpg", caption: "territorio", className: "login-photo--1" },
  { src: "/images/tecnologia.jpg", caption: "comunidad", className: "login-photo--2" },
  { src: "/images/hero-esperanza.jpg", caption: "escucha", className: "login-photo--3" },
  { src: "/images/archivo.jpg", caption: "memoria", className: "login-photo--4" },
  { src: "/images/justicia.jpg", caption: "garantías", className: "login-photo--5" },
  { src: "/images/manos-documento.jpg", caption: "identidad", className: "login-photo--6" },
] as const

const [passwordVisible, setPasswordVisible] = useState(false)
```

Render a full-screen `main.login-page` with:

```tsx
<section className="login-collage" aria-label="Collage editorial de demostración">
  {collagePhotos.map((photo) => (
    <figure className={`login-photo ${photo.className}`} key={photo.src}>
      <span className="login-tape" aria-hidden="true" />
      <img src={photo.src} alt="" />
      <figcaption>{photo.caption}</figcaption>
    </figure>
  ))}
  <div className="login-color-rule" aria-hidden="true">
    <i /><i /><i />
  </div>
</section>
<section className="login-panel" aria-labelledby="login-title">
  <div className="login-brand" aria-label="SIAD">
    <span className="login-ribbon" aria-hidden="true"><i /><i /><i /></span>
    <strong>SIAD</strong>
  </div>
  <div className="login-form-shell">
    <p className="login-eyebrow">Acceso al sistema</p>
    <h1 id="login-title">Bienvenido.</h1>
    <p className="login-intro">
      Ingrese para analizar casos ficticios y validar rutas de atención.
    </p>
    <form onSubmit={submit}>
      <label htmlFor="login-email">Correo institucional</label>
      <input id="login-email" name="email" type="email" autoComplete="username" required />
      <label htmlFor="login-password">Contraseña</label>
      <div className="login-password-field">
        <input
          id="login-password"
          name="password"
          type={passwordVisible ? "text" : "password"}
          autoComplete="current-password"
          required
        />
        <button
          type="button"
          onClick={() => setPasswordVisible((visible) => !visible)}
          aria-label={passwordVisible ? "Ocultar contraseña" : "Mostrar contraseña"}
          aria-pressed={passwordVisible}
        >
          {passwordVisible ? "Ocultar" : "Mostrar"}
        </button>
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button className="login-submit" type="submit" disabled={submitting}>
        {submitting ? "Ingresando…" : "Ingresar de forma segura"}
      </button>
    </form>
    <p className="login-security">
      <span aria-hidden="true" />
      Sesión cifrada · datos reales bloqueados
    </p>
  </div>
</section>
```

- [ ] **Step 4: Run the focused tests and the existing router tests**

Run:

```bash
cd frontend
npm test -- --run src/pages/login-page.test.tsx src/router/app-router.test.tsx
```

Expected: PASS after changing the existing router assertion from
`/ingresar a siad/i` to `/bienvenido/i`.

- [ ] **Step 5: Commit the semantic login**

```bash
git add frontend/src/pages/login-page.tsx frontend/src/pages/login-page.test.tsx frontend/src/router/app-router.test.tsx
git commit -m "feat: build editorial login composition"
```

### Task 2: Implement the full-screen collage and responsive layout

**Files:**
- Create: `frontend/e2e/login.spec.ts`
- Modify: `frontend/src/index.css`
- Modify: `frontend/e2e/smart-video.spec.ts`

**Interfaces:**
- Consumes: the class names produced by Task 1.
- Produces: a 65/35 desktop split, 55/45 tablet split, mobile form-first stack, CSS-only entrance motion, and zero horizontal overflow.

- [ ] **Step 1: Write the failing responsive and accessibility test**

Create `frontend/e2e/login.spec.ts`:

```ts
import AxeBuilder from "@axe-core/playwright"
import { expect, test, type TestInfo } from "@playwright/test"

const viewports = [
  { width: 360, height: 800 },
  { width: 768, height: 1024 },
  { width: 1440, height: 1000 },
]

for (const viewport of viewports) {
  test(`login editorial accesible a ${viewport.width}px`, async ({ page }, testInfo: TestInfo) => {
    await page.setViewportSize(viewport)
    await page.goto("/login")
    await expect(page.getByRole("heading", { name: "Bienvenido." })).toBeVisible()

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)

    const panel = await page.locator(".login-panel").boundingBox()
    const collage = await page.locator(".login-collage").boundingBox()
    expect(panel).not.toBeNull()
    expect(collage).not.toBeNull()

    if (viewport.width >= 1024) {
      expect(collage!.width).toBeGreaterThan(panel!.width)
      expect(Math.abs(collage!.y - panel!.y)).toBeLessThanOrEqual(1)
    }
    if (viewport.width < 768) {
      expect(panel!.y).toBeLessThan(collage!.y)
      await expect(page.locator(".login-photo")).toHaveCount(6)
      await expect(page.locator(".login-photo--5")).toBeHidden()
      await expect(page.locator(".login-photo--6")).toBeHidden()
    }

    const accessibility = await new AxeBuilder({ page }).analyze()
    expect(
      accessibility.violations.filter((violation) =>
        ["serious", "critical"].includes(violation.impact ?? "")),
    ).toEqual([])

    await testInfo.attach(`login-${viewport.width}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    })
  })
}

test("login removes decorative motion when reduced motion is requested", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/login")
  const animation = await page.locator(".login-photo--1").evaluate(
    (element) => getComputedStyle(element).animationName,
  )
  expect(animation).toBe("none")
})
```

- [ ] **Step 2: Run the E2E file and confirm layout failures**

Run:

```bash
cd frontend
npx playwright test e2e/login.spec.ts
```

Expected: FAIL because the old login CSS is a centered card, the collage lacks
full-screen positioning, and mobile ordering/hiding rules do not exist.

- [ ] **Step 3: Replace only the login CSS block**

In `frontend/src/index.css`, replace the rules from `/* Login */` through the
rule immediately before `/* Upload */`. Use isolated selectors and these exact
layout anchors:

```css
.login-page {
  display: grid;
  min-height: 100svh;
  grid-template-columns: minmax(0, 1.62fr) minmax(430px, 0.88fr);
  overflow: clip;
  background: var(--paper);
}

.login-collage {
  position: relative;
  min-height: 100svh;
  overflow: hidden;
  border-right: 1px solid var(--ink);
  background:
    linear-gradient(160deg, rgb(255 255 255 / 46%), transparent 36%),
    linear-gradient(145deg, #dddacd 0 62%, #161a14 62%);
}

.login-panel {
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 100svh;
  align-items: center;
  padding: 6.25rem clamp(2.625rem, 5vw, 5.25rem) 4.375rem;
  background: var(--paper-white);
}

.login-form-shell {
  width: min(100%, 29rem);
}

@media (min-width: 768px) and (max-width: 1023px) {
  .login-page {
    grid-template-columns: minmax(0, 1.1fr) minmax(360px, 0.9fr);
  }
}

@media (max-width: 767px) {
  .login-page {
    display: flex;
    min-height: 100svh;
    flex-direction: column;
    overflow: visible;
  }
  .login-panel {
    order: 1;
    min-height: 100svh;
    padding: 6.5rem 1.5rem 3.5rem;
  }
  .login-collage {
    order: 2;
    min-height: 33rem;
    border-top: 1px solid var(--ink);
    border-right: 0;
  }
  .login-photo--5,
  .login-photo--6 {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .login-photo,
  .login-form-shell {
    animation: none;
  }
}
```

Add the approved fixed positions for `.login-photo--1` through
`.login-photo--6`, the white photo borders and tape pattern, the tricolor bottom
rule, the SIAD ribbon, paper texture, password control, 54 px submit button,
focus-visible states, and `loginPhotoIn`/`loginFormIn` keyframes. Use these
concrete rules as the implementation baseline:

```css
.login-photo {
  position: absolute;
  z-index: 2;
  margin: 0;
  padding: 0.625rem 0.625rem 1.75rem;
  border: 1px solid color-mix(in oklch, var(--ink) 52%, transparent);
  background: var(--paper-white);
  box-shadow: 0 15px 28px color-mix(in oklch, var(--ink) 22%, transparent);
  animation: loginPhotoIn 520ms both;
}
.login-photo img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: saturate(.79) contrast(1.03) sepia(.04);
}
.login-photo figcaption {
  position: absolute;
  right: 0.7rem;
  bottom: 0.45rem;
  color: var(--ink-soft);
  font-family: "Libre Caslon Text", Georgia, serif;
  font-size: 0.58rem;
  font-style: italic;
}
.login-photo--1 { top: 8%; left: 5%; width: 26%; height: 36%; rotate: -5deg; }
.login-photo--2 { top: 4%; left: 29%; width: 29%; height: 39%; rotate: 2.5deg; }
.login-photo--3 { top: 8%; right: 4%; width: 40%; height: 34%; rotate: 4.5deg; }
.login-photo--4 { top: 42%; left: 4%; width: 35%; height: 40%; rotate: 4deg; }
.login-photo--5 { top: 43%; left: 35%; width: 31%; height: 41%; rotate: -3deg; }
.login-photo--6 { top: 40%; right: 4%; width: 31%; height: 42%; rotate: 3deg; }
.login-tape {
  position: absolute;
  z-index: 3;
  top: -0.8rem;
  left: 50%;
  width: 6.4rem;
  height: 1.55rem;
  translate: -50%;
  background:
    linear-gradient(90deg, rgb(255 255 255 / 24%) 50%, transparent 50%),
    #d3b780;
  background-size: 0.5rem 100%;
  box-shadow: 0 1px 2px rgb(0 0 0 / 12%);
  opacity: .88;
}
.login-color-rule,
.login-ribbon {
  display: flex;
}
.login-color-rule {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 0.55rem;
}
.login-color-rule i:nth-child(1),
.login-ribbon i:nth-child(1) { width: 50%; background: var(--amarillo); }
.login-color-rule i:nth-child(2),
.login-ribbon i:nth-child(2) { width: 25%; background: var(--azul); }
.login-color-rule i:nth-child(3),
.login-ribbon i:nth-child(3) { width: 25%; background: var(--rojo); }
.login-brand {
  position: absolute;
  top: 2.4rem;
  right: clamp(2.625rem, 5vw, 5.25rem);
  display: flex;
  align-items: center;
  gap: 0.8rem;
  font-family: "Libre Caslon Text", Georgia, serif;
  font-size: 1.75rem;
}
.login-ribbon { width: 9rem; height: 0.55rem; }
.login-password-field { position: relative; }
.login-password-field input { padding-right: 5.5rem; }
.login-password-field button {
  position: absolute;
  top: 50%;
  right: 0.4rem;
  min-height: 2.5rem;
  padding: 0 0.65rem;
  border: 0;
  background: transparent;
  color: var(--azul);
  translate: 0 -50%;
  font-size: 0.72rem;
  font-weight: 700;
}
.login-submit {
  min-height: 3.375rem;
  border: 1px solid var(--azul);
  background: var(--azul);
  color: white;
  box-shadow: 5px 5px 0 var(--paper-deep);
}
@keyframes loginPhotoIn {
  from { opacity: 0; translate: 0 1rem; }
  to { opacity: 1; translate: 0 0; }
}
@keyframes loginFormIn {
  from { opacity: 0; translate: 1rem 0; }
  to { opacity: 1; translate: 0 0; }
}
```

Keep every selector prefixed with `login-` except the existing reusable
`.form-error`.

- [ ] **Step 4: Update the existing E2E login helper**

In `frontend/e2e/smart-video.spec.ts`, update only the changed accessible names:

```ts
await expect(
  page.getByRole("heading", { name: "Bienvenido." }),
).toBeVisible()
await page.getByRole("button", { name: "Ingresar de forma segura" }).click()
```

- [ ] **Step 5: Run login E2E, frontend tests, and build**

Run:

```bash
cd frontend
npx playwright test e2e/login.spec.ts
npm test -- --run
npm run build
```

Expected: 4 login E2E tests pass, all Vitest files pass, and Vite builds
without TypeScript or CSS errors.

- [ ] **Step 6: Inspect the three attached screenshots**

Open the Playwright HTML report or the PNG attachments for 360, 768, and
1440 px. Confirm:

- desktop has no outer window and the collage is wider than the form;
- tablet keeps all six photos without covering the form;
- mobile shows the form first and only four collage photos;
- labels, inputs, password toggle, button, and security note are not clipped.

If a screenshot violates one item, change only the relevant responsive rule and
rerun `npx playwright test e2e/login.spec.ts`.

- [ ] **Step 7: Commit the responsive design**

```bash
git add frontend/src/index.css frontend/e2e/login.spec.ts frontend/e2e/smart-video.spec.ts
git commit -m "feat: style full-screen editorial login"
```

### Task 3: Verify the complete application contract

**Files:**
- No production files expected.
- Test: all backend, frontend, E2E, and generated-contract checks.

**Interfaces:**
- Consumes: completed Tasks 1 and 2.
- Produces: fresh evidence that the focused login redesign did not regress the SIAD workflow.

- [ ] **Step 1: Run the complete verification gate**

Run from the worktree root:

```bash
make verify
git diff --check
git status --short
```

Expected:

- backend tests pass, except the opt-in real-provider smoke remains skipped;
- all frontend tests pass;
- TypeScript and Vite build pass;
- all Playwright tests pass, including the new login file;
- generated TypeScript contracts remain synchronized;
- `git diff --check` prints no errors;
- `git status --short` contains only the untracked `.superpowers/` visual-companion session.

- [ ] **Step 2: Perform final visual review**

Use the 1440, 768, and 360 px login screenshots generated by Playwright. Compare
them against the approved full-screen mockup and verify that none of the four
rejected strings appear.

- [ ] **Step 3: Stop and remove only the generated visual-companion session**

Stop the session using:

```bash
/Users/johancamilobalantasantacruz/.codex/plugins/cache/superpowers-dev/superpowers/6.2.0/skills/brainstorming/scripts/stop-server.sh \
  /Users/johancamilobalantasantacruz/Documents/TESIS/.worktrees/siad-smart-video/.superpowers/brainstorm/30773-1785213203
```

After confirming that `.superpowers/` contains only this generated session,
remove that session directory and verify `git status --short` is clean.
