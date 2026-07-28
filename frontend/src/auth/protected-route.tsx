import { Navigate, Outlet, useLocation } from "react-router-dom"

import { useAuth } from "./auth-context"


export function ProtectedRoute() {
  const auth = useAuth()
  const location = useLocation()

  if (auth.status === "loading") {
    return (
      <main className="grid min-h-screen place-items-center bg-paper" aria-live="polite">
        <p className="font-sans text-sm text-ink-soft">Verificando sesión segura…</p>
      </main>
    )
  }
  if (auth.status === "anonymous") {
    return <Navigate to="/login" replace state={{ from: location }} />
  }
  return <Outlet />
}
