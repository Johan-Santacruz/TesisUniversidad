import { Link } from "react-router-dom"
import { useAuth } from "../auth/auth-context"
import { AnalysisWorkspace } from "../components/analysis/analysis-workspace"

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
      {user ? <AnalysisWorkspace role={user.role} /> : null}
    </main>
  )
}
