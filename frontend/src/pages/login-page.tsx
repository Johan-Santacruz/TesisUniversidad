import { useState, type FormEvent } from "react"
import { Navigate, useLocation, useNavigate } from "react-router-dom"

import { ApiError } from "../api/client"
import { DISPLACEMENT_MOSAIC, PhotoMosaic } from "../components/photo-mosaic"
import { useAuth } from "../auth/auth-context"


interface RedirectState {
  from?: { pathname?: string }
}


/* La cuenta que el backend siembra al arrancar cuando SENDA_DEMO_USERS_ENABLED
 * esta en true. No es un secreto —existe para que cualquiera pueda probar el
 * sistema sin pedir acceso—, pero tiene que coincidir con SENDA_DEMO_ADMIN_EMAIL
 * y SENDA_DEMO_ADMIN_PASSWORD de Backend/.env: si alli se cambia una, aqui se
 * cambia la otra.
 */
const DEMO_ADMIN = {
  email: "camilobalanta1@gmail.com",
  password: "dios#12Admin",
}


export default function LoginPage() {
  const { status, login } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [demoLoaded, setDemoLoaded] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [passwordVisible, setPasswordVisible] = useState(false)
  const target = (location.state as RedirectState | null)?.from?.pathname
    ?? "/subir-video"

  if (status === "authenticated") {
    return <Navigate to={target} replace />
  }

  const fillDemoAdmin = () => {
    setEmail(DEMO_ADMIN.email)
    setPassword(DEMO_ADMIN.password)
    // Se descubre la clave: es de prueba, no hay nada que ocultar, y ver el
    // campo llenarse es lo que confirma que el boton hizo algo. Con puntos
    // parecia no haber pasado nada.
    setPasswordVisible(true)
    setDemoLoaded(true)
    setError("")
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return // evita doble submit si llega un segundo Enter antes del re-render

    setSubmitting(true)
    setError("")
    try {
      await login(email, password)
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
        <PhotoMosaic columns={DISPLACEMENT_MOSAIC} />
        <span className="login-mosaic-fade login-mosaic-fade--top" />
        <span className="login-mosaic-fade login-mosaic-fade--bottom" />
      </section>

      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-form-shell">
          <button
            type="button"
            className="login-back"
            onClick={() => navigate("/")}
          >
            <span aria-hidden="true">←</span>
            Volver al inicio
          </button>
          <div className="login-form-heading">
            <p className="login-eyebrow">
              <span className="login-brand-mark" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span>SENDA · Acceso institucional</span>
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
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
                setDemoLoaded(false)
              }}
              required
            />

            <label htmlFor="login-password">Contraseña</label>
            <div className="login-password-field">
              <input
                id="login-password"
                name="password"
                type={passwordVisible ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value)
                  setDemoLoaded(false)
                }}
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

            {/* El navegador bloquea el envío si no está marcado (required),
                así el mensaje nativo explica por qué en vez de dejar un botón
                deshabilitado sin motivo visible. */}
            <label className="login-terms" htmlFor="login-terms">
              <input id="login-terms" name="terms" type="checkbox" required />
              <span>
                Acepto los términos y condiciones y la política de privacidad
              </span>
            </label>

            <button
              className="login-submit"
              type="submit"
              disabled={submitting}
            >
              {submitting ? "Ingresando…" : "Ingresar"}
            </button>

            {/* type="button" explícito: dentro de un form, un botón sin type
                envía el formulario, y este solo llena los campos. */}
            <div className="login-demo">
              <button
                type="button"
                className="login-demo-fill"
                onClick={fillDemoAdmin}
                disabled={submitting}
              >
                Probar administrador de prueba
              </button>
              {/* Siempre montado, como .form-error: los lectores de pantalla
                  anuncian el cambio de texto, no la aparición del nodo. */}
              <p className="login-demo-hint" role="status" aria-live="polite">
                {demoLoaded
                  ? "Credenciales cargadas. Acepta los términos e ingresa."
                  : "Llena el correo y la contraseña de la cuenta de demostración."}
              </p>
            </div>
          </form>
        </div>
      </section>
    </main>
  )
}
