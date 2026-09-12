import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { apiFetch, setUnauthorizedHandler } from '../lib/api'
import { vocabularyFor, type Vocabulary } from '../lib/vocabulary'
import type { BusinessProfile } from '../types'

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
  // The deployment's business model, and the wording that goes with it. Presentation only:
  // counterparty isolation is decided in the worker and never from anything the client holds.
  business: BusinessProfile | null
  vocabulary: Vocabulary
  saveBusiness: (b: Partial<BusinessProfile>) => Promise<void>
  canWrite: boolean
  isAdmin: boolean
  isInternal: boolean // member of the internal (Tidelane) organization, as opposed to a partner org
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
  const [business, setBusiness] = useState<BusinessProfile | null>(null)

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null)
      setSettings(null)
      setBusiness(null)
      setStatus('anon')
    })
    apiFetch<{ user: AuthUser; settings: UserSettings; business: BusinessProfile }>('/api/auth/me')
      .then((d) => {
        setUser(d.user)
        setSettings(d.settings)
        setBusiness(d.business)
        setStatus('authed')
      })
      .catch(() => setStatus('anon'))
    return () => setUnauthorizedHandler(null)
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    await apiFetch<{ user: AuthUser }>('/api/auth/login', { method: 'POST', json: { email, password } })
    const me = await apiFetch<{ user: AuthUser; settings: UserSettings; business: BusinessProfile }>('/api/auth/me')
    setUser(me.user)
    setSettings(me.settings)
    setBusiness(me.business)
    setStatus('authed')
    return me.user
  }, [])

  const logout = useCallback(async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
    setUser(null)
    setSettings(null)
    setBusiness(null)
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

  const saveBusiness = useCallback(async (patch: Partial<BusinessProfile>) => {
    const updated = await apiFetch<BusinessProfile>('/api/business', { method: 'PUT', json: patch })
    setBusiness(updated)
  }, [])

  const saveProfile = useCallback(async (p: { name: string; title: string }) => {
    const updated = await apiFetch<AuthUser>('/api/me/profile', { method: 'PUT', json: p })
    setUser(updated)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      settings,
      business,
      vocabulary: vocabularyFor(business?.model),
      saveBusiness,
      canWrite: user?.role === 'admin' || user?.role === 'ops',
      isAdmin: user?.role === 'admin',
      isInternal: user?.orgType === 'internal',
      landingPage: settings?.landing_page ?? '/',
      login,
      logout,
      saveSettings,
      saveProfile,
    }),
    [status, user, settings, business, login, logout, saveSettings, saveBusiness, saveProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
