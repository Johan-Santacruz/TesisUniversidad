import type { components } from "./generated"


export type SessionUser = components["schemas"]["UserRead"]
export type TokenResponse = components["schemas"]["TokenResponse"]


export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}


function errorMessage(value: unknown): string {
  if (
    typeof value === "object"
    && value !== null
    && "detail" in value
    && typeof value.detail === "string"
  ) {
    return value.detail
  }
  return "No fue posible completar la solicitud"
}


export class ApiClient {
  private accessToken: string | null = null

  constructor(private readonly baseUrl = import.meta.env.VITE_API_URL ?? "") {}

  get hasAccessToken() {
    return this.accessToken !== null
  }

  private async parse<T>(response: Response): Promise<T> {
    const value = response.status === 204
      ? undefined
      : await response.json().catch(() => undefined)
    if (!response.ok) {
      throw new ApiError(errorMessage(value), response.status)
    }
    return value as T
  }

  private async raw<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      credentials: "include",
    })
    return this.parse<T>(response)
  }

  async login(email: string, password: string): Promise<TokenResponse> {
    const body = new URLSearchParams({ username: email, password })
    const session = await this.raw<TokenResponse>("/api/v1/auth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    })
    this.accessToken = session.access_token
    return session
  }

  async refresh(): Promise<TokenResponse> {
    const session = await this.raw<TokenResponse>("/api/v1/auth/refresh", {
      method: "POST",
    })
    this.accessToken = session.access_token
    return session
  }

  async logout(): Promise<void> {
    try {
      await this.raw<void>("/api/v1/auth/logout", { method: "POST" })
    } finally {
      this.accessToken = null
    }
  }

  async request<T>(
    path: string,
    init: RequestInit = {},
    retryAfterRefresh = true,
  ): Promise<T> {
    const headers = new Headers(init.headers)
    if (this.accessToken) {
      headers.set("Authorization", `Bearer ${this.accessToken}`)
    }
    if (
      init.body
      && !(init.body instanceof FormData)
      && !headers.has("Content-Type")
    ) {
      headers.set("Content-Type", "application/json")
    }
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
      credentials: "include",
    })
    if (response.status === 401 && retryAfterRefresh) {
      try {
        await this.refresh()
      } catch {
        this.accessToken = null
        throw new ApiError("La sesión venció", 401)
      }
      return this.request<T>(path, init, false)
    }
    return this.parse<T>(response)
  }
}


export const apiClient = new ApiClient()
