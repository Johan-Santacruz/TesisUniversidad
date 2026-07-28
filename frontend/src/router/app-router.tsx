import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ProtectedRoute } from "../auth/protected-route"
import BookPage from "../pages/book-page"
import ConversationPage from "../pages/conversation-page"
import LoginPage from "../pages/login-page"

function PageShell({ children }: { children: React.ReactNode }) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.div
      className="min-h-screen bg-paper"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

export function AppRoutes() {
  const location = useLocation()

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route
          path="/"
          element={
            <PageShell>
              <BookPage />
            </PageShell>
          }
        />
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route
            path="/subir-video"
            element={
              <PageShell>
                <ConversationPage />
              </PageShell>
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
