import { Link, NavLink } from "react-router-dom"

import { useAuth } from "../auth/auth-context"


/* Barra flotante, igual que la del libro. Sin marca ni logotipo: la identidad
 * todavía no está cerrada y no conviene fijarla aquí.
 *
 * El centro dice en qué parte del módulo se está y lleva a la otra. Antes era
 * un rótulo fijo, "Constructor de ruta de acción", y con el historial el
 * módulo dejó de tener una sola pantalla. */
export function WorkspaceHeader() {
  const { user, logout } = useAuth()

  return (
    <header className="workspace-header">
      <div className="workspace-bar">
        <Link to="/" className="workspace-back">
          <span aria-hidden="true">←</span>
          <span className="workspace-back-label">Volver al inicio</span>
        </Link>
        <span aria-hidden="true" className="workspace-bar-rule" />
        <nav className="workspace-nav" aria-label="Secciones del módulo">
          <NavLink to="/subir-video" end>
            {/* El espacio va fuera del span: dentro, el nombre accesible
                salía "Nuevoanálisis". */}
            Nuevo{" "}<span className="workspace-nav-long">análisis</span>
          </NavLink>
          {/* Sin `end`: un caso abierto desde el historial sigue dentro de él. */}
          <NavLink to="/historial">Historial</NavLink>
        </nav>
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
  )
}
