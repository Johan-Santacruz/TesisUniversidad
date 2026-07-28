import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

import { apiClient, type SessionUser } from "../api/client"


type AuthStatus = "loading" | "authenticated" | "anonymous"

interface AuthValue {
  status: AuthStatus
  user: SessionUser | null
  login: (email: string, password: string) => Promise<SessionUser>
  logout: () => Promise<void>
}


const AuthContext = createContext<AuthValue | null>(null)


export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading")
  const [user, setUser] = useState<SessionUser | null>(null)

  useEffect(() => {
    let active = true
    apiClient.refresh().then(
      (session) => {
        if (!active) return
        setUser(session.user)
        setStatus("authenticated")
      },
      () => {
        if (!active) return
        setUser(null)
        setStatus("anonymous")
      },
    )
    return () => {
      active = false
    }
  }, [])

  const value = useMemo<AuthValue>(
    () => ({
      status,
      user,
      async login(email, password) {
        const session = await apiClient.login(email, password)
        setUser(session.user)
        setStatus("authenticated")
        return session.user
      },
      async logout() {
        await apiClient.logout()
        setUser(null)
        setStatus("anonymous")
      },
    }),
    [status, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}


export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (value === null) {
    throw new Error("useAuth must be used inside AuthProvider")
  }
  return value
}
