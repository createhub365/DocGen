import { Button, Result } from 'antd'
import { useNavigate } from 'react-router-dom'
import { usePlatformAuth } from '../context/PlatformAuthContext'
import FullPageSpinner from './ui/FullPageSpinner'

/**
 * Blocks staff from admin-only platform routes (nav may already hide the link).
 * Uses context.isOrgAdmin from platformRoles — same gate as the sidebar.
 */
export default function RequireOrgAdmin({ children }) {
  const { isOrgAdmin, isLoading } = usePlatformAuth()
  const navigate = useNavigate()

  if (isLoading) {
    return <FullPageSpinner tip="Loading platform..." />
  }

  if (!isOrgAdmin) {
    return (
      <Result
        status="403"
        title="Not available for your role"
        subTitle="This section is only available to organization admins."
        extra={
          <Button type="primary" onClick={() => navigate('/platform', { replace: true })}>
            Back to Dashboard
          </Button>
        }
      />
    )
  }

  return children
}
