import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import { AuthProvider } from './context/AuthContext'
import { DataProvider } from './context/DataContext'
import RequireAuth from './components/auth/RequireAuth'
import AppLayout from './components/layout/AppLayout'
import DashboardPage from './pages/DashboardPage'
import ShipmentsPage from './pages/ShipmentsPage'
import ShipmentDetailPage from './pages/ShipmentDetailPage'
import BookingPage from './pages/BookingPage'
import TrackTracePage from './pages/TrackTracePage'
import DocumentsPage from './pages/DocumentsPage'
import InvoicesPage from './pages/InvoicesPage'
import DeckhandPage from './pages/DeckhandPage'
import AnalyticsPage from './pages/AnalyticsPage'
import LoginPage from './pages/LoginPage'
import SettingsPage from './pages/SettingsPage'
import GuidePage from './pages/GuidePage'

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/guide', element: <GuidePage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        path: '/',
        element: <AppLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'shipments', element: <ShipmentsPage /> },
          { path: 'shipments/:id', element: <ShipmentDetailPage /> },
          { path: 'booking', element: <BookingPage /> },
          { path: 'tracking', element: <TrackTracePage /> },
          { path: 'documents', element: <DocumentsPage /> },
          { path: 'invoices', element: <InvoicesPage /> },
          { path: 'deckhand', element: <DeckhandPage /> },
          { path: 'analytics', element: <AnalyticsPage /> },
          { path: 'settings', element: <SettingsPage /> },
        ],
      },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <DataProvider>
        <RouterProvider router={router} />
      </DataProvider>
    </AuthProvider>
  </StrictMode>,
)
