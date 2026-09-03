import { Link } from "react-router-dom"
import { useAuth } from "../auth/auth-context"
import { AnalysisWorkspace } from "../components/analysis/analysis-workspace"

export default function ConversationPage() {
  const { user, logout } = useAuth()

  return (
    <div className="analysis-app" data-testid="video-analysis-workspace">
      {/* Barra flotante, igual que la del libro. Sin marca ni logotipo: la
          identidad todavía no está cerrada y no conviene fijarla aquí. */}
      <header className="workspace-header">
        <div className="workspace-bar">
          <Link to="/" className="workspace-back">
            <span aria-hidden="true">←</span>
            Volver al inicio
          </Link>
          <span aria-hidden="true" className="workspace-bar-rule" />
          <span className="workspace-context">Constructor de ruta de acción</span>
          {/* El rol va delante del correo: dice qué puede hacer quien está
              dentro, que es lo que importa mirar. El correo queda detrás, al
              peso del contexto, porque sólo sirve para comprobar la cuenta. */}
          <div className="workspace-identity">
            <span className="workspace-account">
              <small>{user?.role}</small>
              <span aria-hidden="true">·</span>
              <span className="workspace-account-email">{user?.email}</span>
            </span>
            <button type="button" onClick={() => void logout()}>
              Cerrar sesión <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      </header>
      {user ? <AnalysisWorkspace role={user.role} /> : null}
    </div>
  )
}
