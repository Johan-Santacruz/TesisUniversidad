import type { CSSProperties } from "react"


function cx(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ")
}


// Generador determinista: si el polvo se sorteara en cada render, las motas
// saltarían de sitio con cualquier cambio de estado del libro.
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const DUST_MOTES = (() => {
  const rand = mulberry32(20260805)

  return Array.from({ length: 74 }, () => {
    // Se reparten en las dos bandas exteriores: sobre el libro quedarían
    // ocultas, y el vacío que hay que poblar es la madera de los costados.
    const side = rand() < 0.5 ? -1 : 1
    const x = 50 + side * (37 + 13 * rand())
    const y = 4 + 92 * rand()
    const duration = 15 + 17 * rand()
    // Desfase negativo: al cargar la página el polvo ya está en el aire, no
    // arranca todo junto desde cero.
    const delay = -duration * rand()
    // El foco de la lámpara cae al 32% de alto; lejos de ahí apenas se ve.
    const glow = Math.max(0, 1 - Math.abs(y - 32) / 82)
    // Una de cada cinco es una mota grande y desenfocada, para dar planos.
    const bokeh = rand() < 0.2

    return {
      x,
      y,
      size: bokeh ? 5 + 4 * rand() : 1.8 + 2.6 * rand(),
      duration,
      delay,
      driftX: -26 + 52 * rand(),
      driftY: -(34 + 68 * rand()),
      peak: bokeh ? 0.06 + 0.12 * glow : 0.14 + 0.34 * glow,
      bokeh,
    }
  })
})()

// Mesa de trabajo: nogal con la veta corriendo a lo ancho, un charco de luz
// cálida donde se apoya el libro y viñeta hacia los bordes. Todo en
// gradientes — sin imágenes que descargar y sin banding en pantallas grandes.
export function DeskSurface() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
    >
      <div
        className="absolute inset-0"
        style={{
          background: `
            repeating-linear-gradient(177deg,
              rgb(255 255 255 / 2.4%) 0 1px,
              transparent 1px 6px,
              rgb(0 0 0 / 2.8%) 6px 8px,
              transparent 8px 17px),
            repeating-linear-gradient(179deg,
              rgb(0 0 0 / 3.4%) 0 2px,
              transparent 2px 29px,
              rgb(255 255 255 / 1.8%) 29px 31px,
              transparent 31px 73px),
            repeating-linear-gradient(180deg,
              transparent 0 214px,
              rgb(0 0 0 / 24%) 214px 216px,
              rgb(255 255 255 / 4.5%) 216px 218px,
              transparent 218px 432px),
            linear-gradient(178deg,
              oklch(0.37 0.048 64),
              oklch(0.31 0.042 60) 46%,
              oklch(0.25 0.036 56))
          `,
        }}
      />
      {/* Charco de luz: cae un poco por encima del libro, como una lámpara
          de escritorio fuera de cuadro. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 76% 60% at 50% 32%, oklch(0.62 0.07 72 / 34%), oklch(0.55 0.06 70 / 12%) 46%, transparent 74%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 98% 92% at 50% 44%, transparent 38%, oklch(0.14 0.02 48 / 58%))",
        }}
      />

      {/* Va por encima de la viñeta a propósito: debajo, las motas de los
          bordes quedaban tan apagadas que no poblaban nada. */}
      <div className="absolute inset-0 overflow-hidden">
        {DUST_MOTES.map((mote, index) => (
          <span
            key={index}
            className={cx("book-dust", mote.bokeh && "book-dust--bokeh")}
            style={{
              left: `${mote.x}%`,
              top: `${mote.y}%`,
              width: `${mote.size}px`,
              height: `${mote.size}px`,
              animationDuration: `${mote.duration}s`,
              animationDelay: `${mote.delay}s`,
              "--dust-x": `${mote.driftX}px`,
              "--dust-y": `${mote.driftY}px`,
              "--dust-peak": mote.peak,
            } as CSSProperties}
          />
        ))}
      </div>
    </div>
  )
}

// Barra flotante del mismo papel que las hojas: separa el pliego del borde
// superior y le da a la madera algo sobre lo que apoyar la vista.
