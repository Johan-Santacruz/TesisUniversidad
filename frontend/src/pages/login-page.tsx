import { useState, type FormEvent } from "react"
import { Navigate, useLocation, useNavigate } from "react-router-dom"

import { ApiError } from "../api/client"
import { useAuth } from "../auth/auth-context"


interface RedirectState {
  from?: { pathname?: string }
}

const COLLAGE_PHOTOS = [
  {
    src: "/images/cover-andes.jpg",
    caption: "territorio",
    position: "login-photo--1",
  },
  {
    src: "/images/tecnologia.jpg",
    caption: "comunidad",
    position: "login-photo--2",
  },
  {
    src: "/images/hero-esperanza.jpg",
    caption: "escucha",
    position: "login-photo--3",
  },
  {
    src: "/images/archivo.jpg",
    caption: "memoria",
    position: "login-photo--4",
  },
  {
    src: "/images/justicia.jpg",
    caption: "garantías",
    position: "login-photo--5",
  },
  {
    src: "/images/manos-documento.jpg",
    caption: "identidad",
    position: "login-photo--6",
  },
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
      <section className="login-collage" aria-hidden="true">
        {COLLAGE_PHOTOS.map((photo) => (
          <figure
            className={`login-photo ${photo.position}`}
            key={photo.src}
          >
            <span className="login-tape" />
            <img src={photo.src} alt="" />
            <figcaption>{photo.caption}</figcaption>
          </figure>
        ))}
        <div className="login-color-rule">
          <i />
          <i />
          <i />
        </div>
      </section>

      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-brand" aria-label="SIAD">
          <span className="login-ribbon" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <strong>SIAD</strong>
        </div>

        <div className="login-form-shell">
          <p className="login-eyebrow">Acceso al sistema</p>
          <h1 id="login-title">Bienvenido.</h1>
          <p className="login-intro">
            Ingrese para analizar casos ficticios y validar rutas de atención.
          </p>

          <form onSubmit={submit}>
            <label htmlFor="login-email">Correo institucional</label>
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="username"
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

            {error ? <p className="form-error" role="alert">{error}</p> : null}
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
