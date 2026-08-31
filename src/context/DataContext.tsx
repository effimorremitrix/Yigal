import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Shipment, ShipmentComment, ShipmentDocument } from '../types'
import { apiFetch } from '../lib/api'
import { useAuth } from './AuthContext'

export interface BookingPayload {
  originCode: string
  destinationCode: string
  incoterm: string
  commodity: string
  weightKg: number
  containers: Record<string, number>
  schedule: {
    carrier: string
    scac: string
    vesselName: string
    voyage: string
    etd: string
    eta: string
    transitDays: number
    co2PerTeuTons: number
    costPerTeuUsd: number
  }
}

interface DataContextValue {
  shipments: Shipment[]
  loading: boolean
  getShipment: (id: string) => Shipment | undefined
  createBooking: (payload: BookingPayload) => Promise<Shipment>
  approveDocument: (shipmentId: string, docId: string) => Promise<void>
  addComment: (shipmentId: string, text: string) => Promise<void>
}

const DataContext = createContext<DataContextValue | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status !== 'authed') {
      setShipments([])
      setLoading(status === 'loading')
      return
    }
    let cancelled = false
    setLoading(true)
    apiFetch<Shipment[]>('/api/shipments')
      .then((data) => {
        if (!cancelled) setShipments(data)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [status])

  const createBooking = useCallback(async (payload: BookingPayload) => {
    const created = await apiFetch<Shipment>('/api/shipments', { method: 'POST', json: payload })
    setShipments((prev) => [created, ...prev])
    return created
  }, [])

  const approveDocument = useCallback(async (shipmentId: string, docId: string) => {
    const doc = await apiFetch<ShipmentDocument>(`/api/shipments/${shipmentId}/documents/${docId}/approve`, {
      method: 'POST',
    })
    setShipments((prev) =>
      prev.map((s) => (s.id === shipmentId ? { ...s, documents: s.documents.map((d) => (d.id === docId ? doc : d)) } : s)),
    )
  }, [])

  const addComment = useCallback(async (shipmentId: string, text: string) => {
    const comment = await apiFetch<ShipmentComment>(`/api/shipments/${shipmentId}/comments`, {
      method: 'POST',
      json: { text },
    })
    setShipments((prev) => prev.map((s) => (s.id === shipmentId ? { ...s, comments: [...s.comments, comment] } : s)))
  }, [])

  const value = useMemo<DataContextValue>(
    () => ({
      shipments,
      loading,
      getShipment: (id) => shipments.find((s) => s.id === id),
      createBooking,
      approveDocument,
      addComment,
    }),
    [shipments, loading, createBooking, approveDocument, addComment],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataProvider')
  return ctx
}
