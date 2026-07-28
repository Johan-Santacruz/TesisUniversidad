import { Link } from "react-router-dom"
import { NarrativeCanvas } from "../components/route-builder/narrative-canvas"

export default function ConversationPage() {
  return (
    <main className="action-path-builder min-h-screen">
      <header className="border-b border-foreground/20">
        <div className="mx-auto flex max-w-7xl flex-wrap items-baseline justify-between gap-2 px-4 py-3.5 sm:px-6">
          <Link to="/" className="group flex items-baseline gap-3" aria-label="Volver al libro">
            <span aria-hidden="true" className="flex h-3 w-6 flex-col self-center overflow-hidden rounded-[1px] transition-transform group-hover:-translate-x-0.5">
              <span className="h-1/2 w-full bg-amarillo" />
              <span className="flex h-1/2 w-full">
                <span className="h-full w-1/2 bg-azul" />
                <span className="h-full w-1/2 bg-rojo" />
              </span>
            </span>
            <h1 className="font-serif text-lg font-bold text-foreground">Constructor de ruta de acción</h1>
          </Link>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Acompañamiento para víctimas de desplazamiento forzado</p>
        </div>
      </header>

      <NarrativeCanvas />
    </main>
  )
}
