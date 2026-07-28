import { AuthProvider } from "./auth/auth-context"
import { AppRouter } from "./router/app-router"

export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  )
}
