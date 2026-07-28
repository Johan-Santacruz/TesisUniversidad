import { Link } from "react-router-dom"
import { useAuth } from "../auth/auth-context"

export default function ConversationPage() {
  const { user, logout } = useAuth()

  return (
    <main className="analysis-app" data-testid="video-analysis-workspace">
      <header className="workspace-header">
        <Link to="/" aria-label="Volver al libro">SIAD</Link>
        <div>
          <span>{user?.email}</span>
          <span>{user?.role}</span>
          <button type="button" onClick={() => void logout()}>Cerrar sesión</button>
        </div>
      </header>
      <section className="workspace-placeholder">
        <p className="eyebrow">Análisis inteligente</p>
        <h1>Subir video</h1>
        <p>El espacio de análisis está listo para recibir un caso ficticio.</p>
      </section>
    </main>
  )
}
