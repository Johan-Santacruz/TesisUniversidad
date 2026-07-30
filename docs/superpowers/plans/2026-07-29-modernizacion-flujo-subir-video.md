# Modernización integral del flujo de video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar el sistema visual “Editorial suave” con animaciones visibles a todo `/subir-video` sin alterar contratos, permisos ni estado de negocio.

**Architecture:** `AnalysisWorkspace` conserva el estado y las operaciones actuales. Los componentes de presentación reciben envoltorios de Framer Motion y una jerarquía visual compartida; las animaciones leen el estado existente y nunca crean progreso ficticio ni retrasan acciones.

**Tech Stack:** React 19, TypeScript 5.7, Framer Motion 12, CSS, Vitest, Testing Library, Playwright y Axe.

## Global Constraints

- No modificar backend, OpenAPI, rutas HTTP, autenticación, permisos ni reglas de aprobación.
- Conservar `Newsreader` para títulos y la tipografía sans actual para controles.
- Usar radios de `18px–28px` en superficies principales y `14px–18px` en tarjetas.
- Mantener una sola acción principal por contexto.
- Mantener controles táctiles de al menos `44px`.
- Animaciones visibles: entrada `500–700ms`, etapa `350–500ms`, stagger `45–90ms`, respuesta `160–220ms` y progreso cercano a `450ms`.
- Respetar `prefers-reduced-motion` sin perder funcionalidad.
- Verificar en `360px`, `768px` y `1440px`.
- Preservar el archivo no rastreado `Backend/package-lock.json`.

---

## File map

- Create `frontend/src/components/analysis/motion.ts`: variantes compartidas de entrada, stagger y cambio de etapa.
- Create `frontend/src/components/analysis/analysis-progress.test.tsx`: semántica y porcentaje real del procesamiento.
- Modify `frontend/src/components/analysis/upload-panel.tsx`: composición de carga, jerarquía de acciones y movimiento.
- Modify `frontend/src/components/analysis/analysis-progress.tsx`: indicador circular, capítulos y estados animados.
- Modify `frontend/src/components/analysis/narrative-stage.tsx`: selector segmentado con nombres visibles.
- Modify `frontend/src/components/analysis/analysis-workspace.tsx`: dirección y transición entre etapas.
- Modify `frontend/src/components/analysis/listening-stage.tsx`: entrada escalonada y selección accesible.
- Modify `frontend/src/components/analysis/video-panel.tsx`: rail moderno y fragmento contextual.
- Modify `frontend/src/components/analysis/verification-panel.tsx`: tarjetas y formulario desplegable animado.
- Modify `frontend/src/components/analysis/timeline.tsx`: nodos escalonados y selección visible.
- Modify `frontend/src/components/analysis/routes-comparison.tsx`: rutas y aprobación con jerarquía moderna.
- Modify `frontend/src/components/analysis/analysis-workspace.test.tsx`: comportamiento observable de carga, etapas y selección.
- Modify `frontend/src/index.css`: tokens y estilos responsive del sistema Editorial suave.
- Modify `frontend/e2e/smart-video.spec.ts`: textos actualizados, estados visuales, accesibilidad y viewports.

### Task 1: Base de movimiento y carga editorial suave

**Files:**
- Create: `frontend/src/components/analysis/motion.ts`
- Modify: `frontend/src/components/analysis/upload-panel.tsx`
- Modify: `frontend/src/components/analysis/analysis-workspace.test.tsx`
- Modify: `frontend/src/index.css:1508-1888`

**Interfaces:**
- Produces: `stageVariants`, `staggerContainer`, `staggerItem` y `motionTransition(reduceMotion: boolean)`.
- Consumes: `busy`, `error`, `onUpload` y `onDemo` sin cambiar sus firmas.

- [ ] **Step 1: Escribir la prueba fallida de jerarquía de carga**

Añadir al caso `keeps real testimonies locked and exposes the fictitious demo`:

```tsx
expect(
  screen.getByTestId("soft-editorial-upload"),
).toHaveAttribute("data-visual-state", "ready")
expect(
  screen.getByRole("button", { name: "Elegir archivo" }),
).toBeVisible()
expect(
  screen.getByRole("button", { name: "Probar caso de demostración" }),
).toHaveClass("demo-link")
```

- [ ] **Step 2: Ejecutar la prueba y confirmar el fallo**

Run:

```bash
cd frontend
npm test -- --run src/components/analysis/analysis-workspace.test.tsx
```

Expected: FAIL porque no existen `soft-editorial-upload`, `data-visual-state` ni el nuevo nombre de demostración.

- [ ] **Step 3: Crear las variantes compartidas**

Crear `motion.ts`:

```ts
import type { Transition, Variants } from "framer-motion"

export const stageVariants: Variants = {
  enter: (direction: number) => ({
    opacity: 0,
    x: direction >= 0 ? 54 : -54,
    filter: "blur(10px)",
  }),
  center: { opacity: 1, x: 0, filter: "blur(0px)" },
  exit: (direction: number) => ({
    opacity: 0,
    x: direction >= 0 ? -38 : 38,
    filter: "blur(8px)",
  }),
}

export const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.08 } },
}

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 22, scale: 0.985 },
  visible: { opacity: 1, y: 0, scale: 1 },
}

export function motionTransition(reduceMotion: boolean): Transition {
  return reduceMotion
    ? { duration: 0.01 }
    : { duration: 0.52, ease: [0.16, 1, 0.3, 1] }
}
```

- [ ] **Step 4: Reorganizar `UploadPanel` sin cambiar su lógica**

Usar `motion.section`, `motion.div` y las variantes compartidas. El contenedor
debe incluir:

```tsx
<motion.section
  className="analysis-prelude upload-prelude soft-editorial-shell"
  data-testid="soft-editorial-upload"
  data-visual-state={busy ? "busy" : dragging ? "dragging" : file ? "selected" : "ready"}
  initial={reduceMotion ? false : "hidden"}
  animate="visible"
  variants={staggerContainer}
>
```

Mantener `Elegir archivo` dentro de la zona de arrastre. Cambiar el texto del
botón demo a `Probar caso de demostración`, añadir `className="demo-link"` y
conservar `type="button"` y `onDemo`. Mantener `Analizar video ficticio` como
acción principal después de seleccionar un archivo.

- [ ] **Step 5: Sustituir los estilos rígidos de carga**

En `index.css`, aplicar al inicio:

```css
.soft-editorial-shell {
  border-radius: 28px;
  background:
    radial-gradient(circle at 88% 6%, color-mix(in oklch, var(--amarillo) 18%, transparent), transparent 32%),
    linear-gradient(145deg, var(--paper-white), var(--paper-deep));
  box-shadow: 0 24px 70px color-mix(in oklch, var(--ink) 10%, transparent);
}

.soft-editorial-shell .drop-zone {
  border-radius: 22px;
  background: color-mix(in oklch, var(--paper-white) 76%, transparent);
  backdrop-filter: blur(12px);
}

.soft-editorial-shell .primary-action {
  min-height: 46px;
  border: 0;
  border-radius: 999px;
  background: var(--azul);
  color: white;
}

.soft-editorial-shell .demo-link {
  min-height: 44px;
  border: 0;
  background: transparent;
  color: var(--azul);
  text-decoration: underline;
  text-underline-offset: 0.3em;
}
```

Eliminar o sobreescribir radios de `2px`, bordes negros pesados y botones
secundarios equivalentes a la acción principal.

- [ ] **Step 6: Ejecutar la prueba y revisar el diff**

Run:

```bash
cd frontend
npm test -- --run src/components/analysis/analysis-workspace.test.tsx
cd ..
git diff --check
```

Expected: PASS y sin errores de whitespace.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/analysis/motion.ts \
  frontend/src/components/analysis/upload-panel.tsx \
  frontend/src/components/analysis/analysis-workspace.test.tsx \
  frontend/src/index.css
git commit -m "feat: soften video upload experience"
```

### Task 2: Procesamiento moderno con progreso real

**Files:**
- Create: `frontend/src/components/analysis/analysis-progress.test.tsx`
- Modify: `frontend/src/components/analysis/analysis-progress.tsx`
- Modify: `frontend/src/index.css:1630-1676,1964-2080`

**Interfaces:**
- Consumes: `events: AnalysisEvent[]` y `error: string`.
- Produces: `role="progressbar"` con `aria-valuemin=0`, `aria-valuemax=8`, `aria-valuenow=events.length` y texto porcentual real.

- [ ] **Step 1: Escribir la prueba fallida de progreso**

Crear:

```tsx
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { AnalysisProgress } from "./analysis-progress"

describe("AnalysisProgress", () => {
  it("exposes real persisted progress", () => {
    render(
      <AnalysisProgress
        error=""
        events={[
          { id: 1, stage: "audio", state: "completed", payload: {} },
          { id: 2, stage: "transcription", state: "completed", payload: {} },
        ]}
      />,
    )

    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2")
    expect(screen.getByText("25%")).toBeVisible()
    expect(screen.getByText("2 de 8 etapas persistidas")).toBeVisible()
  })
})
```

- [ ] **Step 2: Ejecutar y confirmar el fallo**

Run:

```bash
cd frontend
npm test -- --run src/components/analysis/analysis-progress.test.tsx
```

Expected: FAIL porque no existe el progressbar ni el porcentaje.

- [ ] **Step 3: Implementar el indicador y los capítulos animados**

Calcular:

```ts
const completedStages = Math.min(events.length, stages.length)
const percent = Math.round((completedStages / stages.length) * 100)
```

Renderizar un bloque:

```tsx
import type { CSSProperties } from "react"

<div
  className="progress-orbit"
  role="progressbar"
  aria-label="Progreso del análisis"
  aria-valuemin={0}
  aria-valuemax={stages.length}
  aria-valuenow={completedStages}
  style={{ "--analysis-progress": `${percent}%` } as CSSProperties}
>
  <motion.strong key={percent}>{percent}%</motion.strong>
  <span>{completedStages} de {stages.length}</span>
</div>
```

Aplicar `motion.li` y `staggerContainer` a los tres capítulos. Los textos
`Persistida`, `En curso` y `En espera` deben seguir dependiendo del stream.

- [ ] **Step 4: Diseñar el círculo y los capítulos**

Usar `conic-gradient` con `--analysis-progress`, superficies redondeadas y un
pulso único al cambiar el porcentaje. El error debe conservar `role="alert"` o
la región accesible existente y no pintar etapas incompletas como listas.

- [ ] **Step 5: Ejecutar pruebas**

Run:

```bash
cd frontend
npm test -- --run src/components/analysis/analysis-progress.test.tsx \
  src/components/analysis/analysis-workspace.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/analysis/analysis-progress.tsx \
  frontend/src/components/analysis/analysis-progress.test.tsx \
  frontend/src/index.css
git commit -m "feat: animate real analysis progress"
```

### Task 3: Selector moderno y transición entre etapas

**Files:**
- Modify: `frontend/src/components/analysis/narrative-stage.tsx`
- Modify: `frontend/src/components/analysis/analysis-workspace.tsx`
- Modify: `frontend/src/components/analysis/analysis-workspace.test.tsx`
- Modify: `frontend/src/index.css:1346-1503,2080-2255`

**Interfaces:**
- `NarrativeStage` continúa siendo `"listening" | "evidence" | "route"`.
- `NarrativeStageHeader` conserva `stage`, `aside` y `onStageChange`.
- `AnalysisWorkspace` conserva sus props y operaciones.

- [ ] **Step 1: Escribir la prueba fallida del selector**

Añadir al primer test de `AnalysisWorkspace`:

```tsx
expect(
  screen.getByRole("button", { name: "Escuchar" }),
).toHaveAttribute("aria-current", "step")
expect(
  screen.getByRole("button", { name: "Señales" }),
).toBeVisible()
expect(
  screen.getByRole("button", { name: "Ruta" }),
).toBeVisible()
```

- [ ] **Step 2: Ejecutar y confirmar el fallo**

Run:

```bash
cd frontend
npm test -- --run src/components/analysis/analysis-workspace.test.tsx
```

Expected: FAIL porque la navegación actual solo muestra puntos con nombres
largos en `aria-label`.

- [ ] **Step 3: Añadir nombres cortos a las etapas**

Extender `NARRATIVE_STAGES` con:

```ts
shortTitle: "Escuchar" | "Señales" | "Ruta"
```

Mostrar `shortTitle` dentro de cada botón y conservar el título completo en la
cabecera. El botón activo llevará `aria-current="step"`.

- [ ] **Step 4: Coordinar dirección y transición**

En `AnalysisWorkspace`, guardar la dirección al cambiar:

```ts
const [stageDirection, setStageDirection] = useState(1)

const changeStage = (next: NarrativeStage) => {
  const currentIndex = NARRATIVE_STAGES.findIndex(({ id }) => id === narrativeStage)
  const nextIndex = NARRATIVE_STAGES.findIndex(({ id }) => id === next)
  setStageDirection(nextIndex >= currentIndex ? 1 : -1)
  setNarrativeStage(next)
}
```

Usar `AnimatePresence mode="wait" initial={false}` y `stageVariants` alrededor
de `.narrative-stage-content`. El pie debe llamar `changeStage`.

- [ ] **Step 5: Convertir la navegación en selector segmentado**

Diseñar el `nav` como cápsula de tres columnas. El elemento activo tendrá fondo
blanco cálido, sombra ligera y desplazamiento visible. La hoja y el rail usarán
radios `20px–24px` y sombras suaves.

- [ ] **Step 6: Ejecutar pruebas y build**

Run:

```bash
cd frontend
npm test -- --run src/components/analysis/analysis-workspace.test.tsx
npm run build
```

Expected: pruebas y build PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/analysis/narrative-stage.tsx \
  frontend/src/components/analysis/analysis-workspace.tsx \
  frontend/src/components/analysis/analysis-workspace.test.tsx \
  frontend/src/index.css
git commit -m "feat: animate narrative stage navigation"
```

### Task 4: Modernizar escucha, señales y rutas

**Files:**
- Modify: `frontend/src/components/analysis/listening-stage.tsx`
- Modify: `frontend/src/components/analysis/video-panel.tsx`
- Modify: `frontend/src/components/analysis/verification-panel.tsx`
- Modify: `frontend/src/components/analysis/timeline.tsx`
- Modify: `frontend/src/components/analysis/routes-comparison.tsx`
- Modify: `frontend/src/components/analysis/analysis-workspace.test.tsx`
- Modify: `frontend/src/index.css:2135-2926`

**Interfaces:**
- Las props públicas de todos los componentes permanecen iguales.
- Los fragmentos seleccionados producirán `aria-current="true"` además de
  `aria-pressed`.

- [ ] **Step 1: Escribir la prueba fallida del contexto activo**

Después de seleccionar el primer fragmento:

```tsx
const activeFragment = screen.getByRole("button", {
  name: /0:00.*salimos de el tambo/i,
})
expect(activeFragment).toHaveAttribute("aria-current", "true")
```

Usar el texto y timestamp exactos de `caseFixture`.

- [ ] **Step 2: Ejecutar y confirmar el fallo**

Run:

```bash
cd frontend
npm test -- --run src/components/analysis/analysis-workspace.test.tsx
```

Expected: FAIL porque el fragmento solo expone `aria-pressed`.

- [ ] **Step 3: Animar escucha y rail documental**

Aplicar `motion.ol` y `motion.li` con stagger en `ListeningStage`. Añadir
`aria-current` a fragmentos activos tanto en `ListeningStage` como en
`DocumentaryVideoRail`. El rail deberá conservar el video, privacidad y
selección temporal.

- [ ] **Step 4: Animar formularios de evidencia**

En `VerificationPanel`, envolver la aparición de `fact-review-form` con:

```tsx
<AnimatePresence initial={false}>
  {reviewMode ? (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
    >
      <form className="fact-review-form">...</form>
    </motion.div>
  ) : null}
</AnimatePresence>
```

No cambiar nombres de campos, payloads ni permisos.

- [ ] **Step 5: Animar cronología y rutas**

Usar stagger en nodos de `Timeline` y tarjetas de `RoutesComparison`. El nodo
seleccionado debe elevarse y conservar `aria-pressed`. Las rutas mantienen
amarillo, azul y rojo, fuentes, fechas y estados de verificación.

- [ ] **Step 6: Aplicar el sistema de superficies**

Actualizar CSS para:

- fragmentos de `14px–16px`;
- hechos de `16px–18px`;
- formularios con inputs suaves y foco azul;
- timeline sin bloques rectangulares pesados;
- rutas de `18px` con sombra al interactuar;
- aprobación final como única acción principal del cierre.

- [ ] **Step 7: Ejecutar las pruebas**

Run:

```bash
cd frontend
npm test -- --run src/components/analysis/analysis-workspace.test.tsx
```

Expected: PASS, incluida revisión de hechos y sincronización de video.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/analysis/listening-stage.tsx \
  frontend/src/components/analysis/video-panel.tsx \
  frontend/src/components/analysis/verification-panel.tsx \
  frontend/src/components/analysis/timeline.tsx \
  frontend/src/components/analysis/routes-comparison.tsx \
  frontend/src/components/analysis/analysis-workspace.test.tsx \
  frontend/src/index.css
git commit -m "feat: modernize video review stages"
```

### Task 5: Responsive, movimiento reducido y verificación integral

**Files:**
- Modify: `frontend/src/index.css:2951-3135`
- Modify: `frontend/e2e/smart-video.spec.ts`

**Interfaces:**
- No produce nuevas APIs.
- Verifica el flujo completo en los viewports acordados.

- [ ] **Step 1: Actualizar el recorrido E2E**

Cambiar el selector demo a:

```ts
page.getByRole("button", { name: "Probar caso de demostración" })
```

Antes de abrir el caso, comprobar:

```ts
await expect(page.getByTestId("soft-editorial-upload")).toHaveAttribute(
  "data-visual-state",
  "ready",
)
```

Durante carga sintética, comprobar:

```ts
await expect(
  page.getByRole("progressbar", { name: "Progreso del análisis" }),
).toBeVisible()
```

- [ ] **Step 2: Ejecutar E2E y capturar fallos responsive**

Run:

```bash
cd frontend
npm run e2e
```

Expected: cualquier fallo inicial debe indicar selectores o desbordamiento
introducido por el rediseño, no cambios de backend.

- [ ] **Step 3: Completar CSS responsive**

En `960px`, convertir la revisión en una columna y los fragmentos en una franja
horizontal. En `600px`, reducir radios y sombras, apilar carga y procesamiento,
mantener acciones a ancho completo y asegurar que el selector segmentado no
desborde.

En `prefers-reduced-motion: reduce`, desactivar transformaciones, blur, stagger y
transiciones largas:

```css
@media (prefers-reduced-motion: reduce) {
  .analysis-app *,
  .analysis-app *::before,
  .analysis-app *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 4: Ejecutar verificación frontend completa**

Run:

```bash
cd frontend
npm test -- --run
npm run build
npm run e2e
cd ..
git diff --check
```

Expected:

- 0 pruebas Vitest fallidas;
- build de Vite exitoso;
- 6 pruebas E2E exitosas;
- 0 violaciones Axe serias o críticas;
- 0 errores de whitespace.

- [ ] **Step 5: Revisar el diff y el alcance**

Run:

```bash
git status --short
git diff --stat HEAD~4..HEAD
git diff --name-only HEAD~4..HEAD
```

Confirmar que no cambien `Backend/`, contratos generados, autenticación ni
archivos ajenos. `Backend/package-lock.json` debe permanecer sin rastrear.

- [ ] **Step 6: Commit final si el ajuste responsive produjo cambios**

```bash
git add frontend/src/index.css frontend/e2e/smart-video.spec.ts
git commit -m "test: verify modern video flow responsively"
```
