import { useState, type FormEvent } from "react"
import { Navigate, useLocation, useNavigate } from "react-router-dom"

import { ApiError } from "../api/client"
import { useAuth } from "../auth/auth-context"


interface RedirectState {
  from?: { pathname?: string }
}


export default function LoginPage() {
  const { status, login } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const target = (location.state as RedirectState | null)?.from?.pathname
    ?? "/subir-video"

  if (status === "authenticated") {
    return <Navigate to={target} replace />
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSubmitting(true)
    setError("")
    try {
      await login(String(form.get("email")), String(form.get("password")))
      navigate(target, { replace: true })
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "No fue posible iniciar sesión",
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="flag-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <p className="eyebrow">Sistema inteligente de atención</p>
        <h1 id="login-title">Ingresar a SIAD</h1>
        <p className="login-intro">
          Acceso restringido para revisar casos ficticios y validar orientación
          institucional.
        </p>
        <form onSubmit={submit}>
          <label>
            Correo institucional
            <input
              name="email"
              type="email"
              autoComplete="username"
              required
            />
          </label>
          <label>
            Contraseña
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button type="submit" disabled={submitting}>
            {submitting ? "Ingresando…" : "Ingresar"}
          </button>
        </form>
        <p className="privacy-note">
          La sesión de acceso vive solo en esta ventana. Los testimonios reales
          permanecen bloqueados hasta la autorización institucional.
        </p>
      </section>
    </main>
  )
}
