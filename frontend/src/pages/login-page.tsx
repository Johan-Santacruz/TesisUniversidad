import { useState, type FormEvent } from "react"
import { Navigate, useLocation, useNavigate } from "react-router-dom"

import { ApiError } from "../api/client"
import { useAuth } from "../auth/auth-context"


interface RedirectState {
  from?: { pathname?: string }
}

const LOGIN_PHOTOS = [
  "/images/hero-esperanza.jpg",
  "/images/archivo.jpg",
  "/images/justicia.jpg",
  "/images/manos-documento.jpg",
] as const

export default function LoginPage() {
  const { status, login } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [passwordVisible, setPasswordVisible] = useState(false)
  const target = (location.state as RedirectState | null)?.from?.pathname
    ?? "/subir-video"

  if (status === "authenticated") {
    return <Navigate to={target} replace />
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return // evita doble submit si llega un segundo Enter antes del re-render

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
      <section className="login-collage" aria-hidden="true">
        <div className="login-photo-rail">
          {LOGIN_PHOTOS.map((src, index) => (
            <figure
              className={`login-rail-photo login-rail-photo--${index + 1}`}
              key={src}
            >
              <img src={src} alt="" />
            </figure>
          ))}
        </div>
      </section>

      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-form-shell">
          <div className="login-form-heading">
            <p className="login-eyebrow">
              <span className="login-brand-mark" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span>SIAD · Acceso institucional</span>
            </p>
            <h1 id="login-title">Bienvenido de nuevo.</h1>
            <p className="login-intro">
              Ingresa para analizar casos ficticios y validar rutas de atención.
            </p>
          </div>

          <form onSubmit={handleSubmit} aria-busy={submitting}>
            <label htmlFor="login-email">Correo institucional</label>
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
            />

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
                className="login-password-toggle"
                aria-label={
                  passwordVisible ? "Ocultar contraseña" : "Mostrar contraseña"
                }
                aria-pressed={passwordVisible}
                onClick={() => setPasswordVisible((visible) => !visible)}
              >
                {passwordVisible ? "Ocultar" : "Mostrar"}
              </button>
            </div>

            {/* Se mantiene siempre montado (nunca desaparece del DOM) para que
                los lectores de pantalla anuncien el cambio de contenido, no
                la aparición del nodo. Cuando está vacío, .form-error:not(:empty)
                en el CSS lo colapsa a padding/border 0 — no ocupa espacio. */}
            <p className="form-error" role="alert" aria-live="assertive">
              {error}
            </p>

            <button
              className="login-submit"
              type="submit"
              disabled={submitting}
            >
              {submitting ? "Ingresando…" : "Ingresar de forma segura"}
            </button>
          </form>

          <p className="login-security">
            <span aria-hidden="true" />
            Sesión cifrada · datos reales bloqueados
          </p>
        </div>
      </section>
    </main>
  )
}
