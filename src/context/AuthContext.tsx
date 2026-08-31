import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { apiFetch, setUnauthorizedHandler } from '../lib/api'

export type Role = 'admin' | 'ops' | 'viewer'

export interface AuthUser {
  id: number
  email: string
  name: string
  title: string
  role: Role
  orgId: number
  orgName: string
  orgType: string
}

export interface UserSettings {
  timezone: string
  date_format: string
  landing_page: string
  notify_delays: number
  notify_docs: number
  notify_weekly_digest: number
}

interface AuthContextValue {
  status: 'loading' | 'anon' | 'authed'
  user: AuthUser | null
  settings: UserSettings | null
  canWrite: boolean
  isAdmin: boolean
  login: (email: string, password: string) => Promise<AuthUser>
  landingPage: string
  logout: () => Promise<void>
  saveSettings: (s: Partial<UserSettings>) => Promise<void>
  saveProfile: (p: { name: string; title: string }) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'anon' | 'authed'>('loading')
  const [user, setUser] = useState<AuthUser | null>(null)
  const [settings, setSettings] = useState<UserSettings | null>(null)

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null)
      setSettings(null)
      setStatus('anon')
    })
    apiFetch<{ user: AuthUser; settings: UserSettings }>('/api/auth/me')
      .then((d) => {
        setUser(d.user)
        setSettings(d.settings)
        setStatus('authed')
      })
      .catch(() => setStatus('anon'))
    return () => setUnauthorizedHandler(null)
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    await apiFetch<{ user: AuthUser }>('/api/auth/login', { method: 'POST', json: { email, password } })
    const me = await apiFetch<{ user: AuthUser; settings: UserSettings }>('/api/auth/me')
    setUser(me.user)
    setSettings(me.settings)
    setStatus('authed')
    return me.user
  }, [])

  const logout = useCallback(async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
    setUser(null)
    setSettings(null)
    setStatus('anon')
  }, [])

  const saveSettings = useCallback(
    async (patch: Partial<UserSettings>) => {
      const merged = { ...settings, ...patch }
      const updated = await apiFetch<UserSettings>('/api/settings', {
        method: 'PUT',
        json: {
          timezone: merged.timezone,
          date_format: merged.date_format,
          landing_page: merged.landing_page,
          notify_delays: Boolean(merged.notify_delays),
          notify_docs: Boolean(merged.notify_docs),
          notify_weekly_digest: Boolean(merged.notify_weekly_digest),
        },
      })
      setSettings(updated)
    },
    [settings],
  )

  const saveProfile = useCallback(async (p: { name: string; title: string }) => {
    const updated = await apiFetch<AuthUser>('/api/me/profile', { method: 'PUT', json: p })
    setUser(updated)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      settings,
      canWrite: user?.role === 'admin' || user?.role === 'ops',
      isAdmin: user?.role === 'admin',
      landingPage: settings?.landing_page ?? '/',
      login,
      logout,
      saveSettings,
      saveProfile,
    }),
    [status, user, settings, login, logout, saveSettings, saveProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
