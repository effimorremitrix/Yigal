import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import { DataProvider } from './context/DataContext'
import AppLayout from './components/layout/AppLayout'
import DashboardPage from './pages/DashboardPage'
import ShipmentsPage from './pages/ShipmentsPage'
import ShipmentDetailPage from './pages/ShipmentDetailPage'
import BookingPage from './pages/BookingPage'
import TrackTracePage from './pages/TrackTracePage'
import DocumentsPage from './pages/DocumentsPage'
import AnalyticsPage from './pages/AnalyticsPage'

const router = createBrowserRouter([
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
      { path: 'analytics', element: <AnalyticsPage /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DataProvider>
      <RouterProvider router={router} />
    </DataProvider>
  </StrictMode>,
)
