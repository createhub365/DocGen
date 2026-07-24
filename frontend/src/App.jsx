import { Navigate, Route, Routes } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import CreateDocPage from './pages/CreateDocPage'
import EmployersPage from './pages/EmployersPage'
import DocumentsPage from './pages/DocumentsPage'
import NotFoundPage from './pages/NotFoundPage'
import AdminPanel from './components/AdminPanel'
import AppLayout from './components/AppLayout'
import PlatformLayout, { ProtectedPlatformRoute } from './components/PlatformLayout'
import FullPageSpinner from './components/ui/FullPageSpinner'
import { AuthProvider, useAuth } from './context/AuthContext'
import { PlatformAuthProvider, usePlatformAuth } from './context/PlatformAuthContext'
import PlatformLoginPage from './pages/platform/LoginPage'
import PlatformSignupPage from './pages/platform/SignupPage'
import PlatformDashboard from './pages/platform/PlatformDashboard'
import FlowBuilderPage from './pages/platform/FlowBuilderPage'
import GenerateDocumentPage from './pages/platform/GenerateDocumentPage'
import GeneratedDocumentsPage from './pages/platform/GeneratedDocumentsPage'
import PlatformPlaceholderPage from './pages/platform/PlatformPlaceholderPage'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <FullPageSpinner tip="Loading..." />
  if (!user) return <Navigate to="/login" replace />
  return children
}

function AdminRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return <FullPageSpinner tip="Verifying access..." />
  }

  if (!user || user.role !== 'admin') {
    return <Navigate to="/dashboard" replace />
  }

  return children
}

function LegacyLoginGate() {
  const { loading, user } = useAuth()
  if (loading) return <FullPageSpinner tip="Loading..." />
  if (user) return <Navigate to="/dashboard" replace />
  return <LoginPage />
}

function PlatformPublicGate({ children }) {
  const { isLoading, authed } = usePlatformAuth()
  if (isLoading) return <FullPageSpinner tip="Loading platform..." />
  if (authed) return <Navigate to="/platform" replace />
  return children
}

function AppRoutes() {
  return (
    <Routes>
      {/* Platform area — parallel to legacy; independent auth */}
      <Route
        path="/platform/signup"
        element={
          <PlatformPublicGate>
            <PlatformSignupPage />
          </PlatformPublicGate>
        }
      />
      <Route
        path="/platform/login"
        element={
          <PlatformPublicGate>
            <PlatformLoginPage />
          </PlatformPublicGate>
        }
      />
      <Route
        element={
          <ProtectedPlatformRoute>
            <PlatformLayout />
          </ProtectedPlatformRoute>
        }
      >
        <Route path="/platform" element={<PlatformDashboard />} />
        <Route path="/platform/dashboard" element={<Navigate to="/platform" replace />} />
        <Route path="/platform/document-types" element={<PlatformDashboard />} />
        <Route path="/platform/document-types/:id" element={<FlowBuilderPage />} />
        <Route
          path="/platform/document-types/:id/generate"
          element={<GenerateDocumentPage />}
        />
        <Route path="/platform/generated" element={<GeneratedDocumentsPage />} />
        <Route
          path="/platform/users"
          element={
            <PlatformPlaceholderPage
              title="Users"
              blurb="Org user management UI coming in a later phase."
            />
          }
        />
        <Route
          path="/platform/audit-log"
          element={
            <PlatformPlaceholderPage
              title="Audit log"
              blurb="Audit log viewer coming in a later phase."
            />
          }
        />
      </Route>

      {/* Legacy immigration app */}
      <Route path="/login" element={<LegacyLoginGate />} />
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/create" element={<CreateDocPage />} />
        <Route path="/employers" element={<EmployersPage />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AdminPanel />
            </AdminRoute>
          }
        />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <PlatformAuthProvider>
        <AppRoutes />
      </PlatformAuthProvider>
    </AuthProvider>
  )
}
