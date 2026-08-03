import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import FullPageSpinner from './components/ui/FullPageSpinner'
import { AuthProvider, useAuth } from './context/AuthContext'
import { PlatformAuthProvider, usePlatformAuth } from './context/PlatformAuthContext'
import PlatformLayout, { ProtectedPlatformRoute } from './components/PlatformLayout'
import PlatformThemeProvider from './components/PlatformThemeProvider'
import RequireOrgAdmin from './components/RequireOrgAdmin'
import AppLayout from './components/AppLayout'

const LoginPage = lazy(() => import('./pages/LoginPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const CreateDocPage = lazy(() => import('./pages/CreateDocPage'))
const EmployersPage = lazy(() => import('./pages/EmployersPage'))
const DocumentsPage = lazy(() => import('./pages/DocumentsPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))
const AdminPanel = lazy(() => import('./components/AdminPanel'))
const PlatformLoginPage = lazy(() => import('./pages/platform/LoginPage'))
const PlatformSignupPage = lazy(() => import('./pages/platform/SignupPage'))
const PlatformDashboard = lazy(() => import('./pages/platform/PlatformDashboard'))
const DocumentTypesPage = lazy(() => import('./pages/platform/DocumentTypesPage'))
const FlowBuilderPage = lazy(() => import('./pages/platform/FlowBuilderPage'))
const TemplateWorkspacePage = lazy(() => import('./pages/platform/TemplateWorkspacePage'))
const GenerateDocumentPage = lazy(() => import('./pages/platform/GenerateDocumentPage'))
const GeneratedDocumentsPage = lazy(() => import('./pages/platform/GeneratedDocumentsPage'))
const OptionListsPage = lazy(() => import('./pages/platform/OptionListsPage'))
const SettingsPage = lazy(() => import('./pages/platform/SettingsPage'))
const PlatformPlaceholderPage = lazy(() => import('./pages/platform/PlatformPlaceholderPage'))
const UsersPage = lazy(() => import('./pages/platform/UsersPage'))

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
    <Suspense fallback={<FullPageSpinner tip="Loading…" />}>
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
          <Route path="/platform/document-types" element={<DocumentTypesPage />} />
          <Route path="/platform/document-types/:id" element={<FlowBuilderPage />} />
          <Route
            path="/platform/document-types/:id/templates/:templateId"
            element={<TemplateWorkspacePage />}
          />
          <Route
            path="/platform/document-types/:id/templates/:templateId/flow"
            element={<FlowBuilderPage />}
          />
          <Route
            path="/platform/document-types/:id/generate/:templateId"
            element={<GenerateDocumentPage />}
          />
          <Route
            path="/platform/document-types/:id/generate"
            element={<GenerateDocumentPage />}
          />
          <Route path="/platform/generated" element={<GeneratedDocumentsPage />} />
          <Route
            path="/platform/option-lists"
            element={
              <RequireOrgAdmin>
                <OptionListsPage />
              </RequireOrgAdmin>
            }
          />
          <Route
            path="/platform/settings"
            element={
              <RequireOrgAdmin>
                <SettingsPage />
              </RequireOrgAdmin>
            }
          />
          <Route
            path="/platform/users"
            element={
              <RequireOrgAdmin>
                <UsersPage />
              </RequireOrgAdmin>
            }
          />
          <Route
            path="/platform/audit-log"
            element={
              <RequireOrgAdmin>
                <PlatformPlaceholderPage
                  title="Audit log"
                  blurb="Coming in a later phase."
                />
              </RequireOrgAdmin>
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
    </Suspense>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <PlatformAuthProvider>
        <PlatformThemeProvider>
          <AppRoutes />
        </PlatformThemeProvider>
      </PlatformAuthProvider>
    </AuthProvider>
  )
}
