import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom"
import { AnimatePresence, motion } from "framer-motion"
import BookPage from "../pages/book-page"
import ConversationPage from "../pages/conversation-page"

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      className="min-h-screen bg-paper"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

function AnimatedRoutes() {
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
        <Route
          path="/conversar"
          element={
            <PageShell>
              <ConversationPage />
            </PageShell>
          }
        />
      </Routes>
    </AnimatePresence>
  )
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <AnimatedRoutes />
    </BrowserRouter>
  )
}
