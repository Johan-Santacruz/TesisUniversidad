import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom"
import { ProtectedRoute } from "../auth/protected-route"
import { useAuth } from "../auth/auth-context"
import BookPage from "../features/book/book-page"
import { OpeningCurtain } from "../components/opening-curtain"
import ConversationPage from "../pages/conversation-page"
import LoginPage from "../pages/login-page"

const PROTECTED_PATHS = ["/conversar", "/subir-video"]

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper">
      {children}
    </div>
  )
}

function LoginWithBookBackdrop() {
  return (
    <div className="login-route">
      <div
        className="login-book-layer"
        aria-hidden="true"
        inert
      >
        <BookPage backgroundMode />
      </div>
      <LoginPage />
    </div>
  )
}

// Sólo se anima la opacidad. Un transform aquí convertiría el envoltorio en
// bloque contenedor de los `position: fixed` de adentro —la barra del libro,
// la capa de fondo del login— y se desanclarían del viewport.
function RouteStage({ children }: { children: React.ReactNode }) {
  const prefersReducedMotion = useReducedMotion()

  if (prefersReducedMotion) {
    return <div className="page-route-stage">{children}</div>
  }

  return (
    <motion.div
      className="page-route-stage"
      initial={{ opacity: 0 }}
      animate={{
        opacity: 1,
        transition: { duration: 0.62, ease: [0.22, 1, 0.36, 1] },
      }}
      exit={{
        opacity: 0,
        transition: { duration: 0.46, ease: [0.4, 0, 1, 1] },
      }}
    >
      {children}
    </motion.div>
  )
}

// "Crear ruta" no salta directo al login: encadena /conversar → /subir-video
// → /login, y esos saltos intermedios renderizan null. Si la transición se
// llavease con el pathname crudo, cada salto dispararía su propio fundido y
// se verían dos pantallas en blanco encadenadas. Con la sesión a la vista se
// sabe desde el primer salto dónde termina la cadena, así que todo el trayecto
// comparte una sola llave y ocurre un único fundido.
function useStageKey() {
  const { pathname } = useLocation()
  const { status } = useAuth()

  if (pathname === "/") return "libro"
  if (pathname === "/login") return "login"
  if (PROTECTED_PATHS.includes(pathname)) {
    return status === "authenticated" ? "app" : "login"
  }

  return "app"
}

export function AppRoutes() {
  const location = useLocation()
  const stageKey = useStageKey()

  return (
    // initial={false} evita que la primera carga se funda: ahí el libro ya
    // trae su propia entrada y se verían dos animaciones encimadas.
    <AnimatePresence mode="wait" initial={false}>
      <Routes location={location} key={stageKey}>
        <Route
          path="/"
          element={
            <RouteStage>
              <PageShell>
                <BookPage />
                <OpeningCurtain />
              </PageShell>
            </RouteStage>
          }
        />
        <Route
          path="/login"
          element={
            <RouteStage>
              <LoginWithBookBackdrop />
            </RouteStage>
          }
        />
        <Route element={<ProtectedRoute />}>
          <Route
            path="/subir-video"
            element={
              <RouteStage>
                <PageShell>
                  <ConversationPage />
                </PageShell>
              </RouteStage>
            }
          />
          <Route path="/conversar" element={<Navigate to="/subir-video" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  )
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
