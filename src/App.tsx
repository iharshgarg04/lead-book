import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { Gate } from '@/components/layout/Gate'
import OverviewPage from '@/features/overview/OverviewPage'
import LeadsPage from '@/features/leads/LeadsPage'

// Invoices pull in the PDF engine, so they load on demand.
const InvoicesListPage = lazy(() => import('@/features/invoices/InvoicesListPage'))
const InvoiceEditorPage = lazy(() => import('@/features/invoices/InvoiceEditorPage'))
const InvoiceDetailPage = lazy(() => import('@/features/invoices/InvoiceDetailPage'))
const InvoiceBulkPage = lazy(() => import('@/features/invoices/InvoiceBulkPage'))
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'))

const Loading = () => <div className="mt-6 h-32 animate-pulse rounded-xl bg-card" />

export default function App() {
  return (
    <Gate>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/overview" replace />} />
            <Route path="overview" element={<OverviewPage />} />
            <Route path="leads" element={<LeadsPage />} />
            <Route path="leads/:view" element={<LeadsPage />} />
            <Route path="invoices" element={<InvoicesListPage />} />
            <Route path="invoices/new" element={<InvoiceEditorPage />} />
            <Route path="invoices/bulk" element={<InvoiceBulkPage />} />
            <Route path="invoices/:id" element={<InvoiceDetailPage />} />
            <Route path="invoices/:id/edit" element={<InvoiceEditorPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/overview" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </Gate>
  )
}
