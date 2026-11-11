export const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api'
export const WEBSITE_TOKEN_KEY = 'faithstream.website-token'
export const WEBSITE_USER_KEY = 'faithstream.website-user'
export const WEBSITE_ACCOUNT_EVENT = 'faithstream:website-account-changed'
export const PAYMENT_STATUS_EVENT = 'faithstream:payment-status-updated'

export interface WebsiteUser {
  id: number
  name: string
  email_address: string
  role: string
}

export function getWebsiteToken(): string | null {
  return sessionStorage.getItem(WEBSITE_TOKEN_KEY)
}

export function getWebsiteUser(): WebsiteUser | null {
  const storedUser = sessionStorage.getItem(WEBSITE_USER_KEY)
  if (!storedUser) return null
  try {
    return JSON.parse(storedUser) as WebsiteUser
  } catch {
    sessionStorage.removeItem(WEBSITE_USER_KEY)
    return null
  }
}

export function saveWebsiteSession(token: string, user: WebsiteUser): void {
  sessionStorage.setItem(WEBSITE_TOKEN_KEY, token)
  sessionStorage.setItem(WEBSITE_USER_KEY, JSON.stringify(user))
  window.dispatchEvent(new Event(WEBSITE_ACCOUNT_EVENT))
}

export function clearWebsiteSession(): void {
  sessionStorage.removeItem(WEBSITE_TOKEN_KEY)
  sessionStorage.removeItem(WEBSITE_USER_KEY)
  window.dispatchEvent(new Event(WEBSITE_ACCOUNT_EVENT))
}
