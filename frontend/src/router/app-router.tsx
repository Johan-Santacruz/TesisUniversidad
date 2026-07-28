import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom"
import { ProtectedRoute } from "../auth/protected-route"
import BookPage from "../pages/book-page"
import ConversationPage from "../pages/conversation-page"
import LoginPage from "../pages/login-page"

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper">
      {children}
    </div>
  )
}

export function AppRoutes() {
  return (
      <Routes>
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
  )
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
