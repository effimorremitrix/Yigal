import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { DocStatus, Shipment } from '../types'
import { generateShipments } from '../data/generator'

interface DataContextValue {
  shipments: Shipment[]
  getShipment: (id: string) => Shipment | undefined
  addShipment: (s: Shipment) => void
  setDocumentStatus: (shipmentId: string, docId: string, status: DocStatus) => void
  addComment: (shipmentId: string, author: string, text: string) => void
}

const DataContext = createContext<DataContextValue | null>(null)

const seeded = generateShipments()

export function DataProvider({ children }: { children: ReactNode }) {
  const [shipments, setShipments] = useState<Shipment[]>(seeded)

  const value = useMemo<DataContextValue>(
    () => ({
      shipments,
      getShipment: (id) => shipments.find((s) => s.id === id),
      addShipment: (s) => setShipments((prev) => [s, ...prev]),
      setDocumentStatus: (shipmentId, docId, status) =>
        setShipments((prev) =>
          prev.map((s) =>
            s.id === shipmentId
              ? { ...s, documents: s.documents.map((d) => (d.id === docId ? { ...d, status } : d)) }
              : s,
          ),
        ),
      addComment: (shipmentId, author, text) =>
        setShipments((prev) =>
          prev.map((s) =>
            s.id === shipmentId
              ? {
                  ...s,
                  comments: [
                    ...s.comments,
                    { id: `c-${Date.now()}`, author, role: 'you', text, at: new Date().toISOString() },
                  ],
                }
              : s,
          ),
        ),
    }),
    [shipments],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataProvider')
  return ctx
}
