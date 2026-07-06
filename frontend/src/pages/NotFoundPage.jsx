import { useNavigate } from 'react-router-dom'
import { Result, Button } from 'antd'

export default function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen flex items-center justify-center animate-fade-in-up" style={{ background: 'var(--surface-2)', padding: 24 }}>
      <Result
        status="404"
        title="Page not found"
        subTitle="The page you are looking for does not exist or has been moved."
        extra={
          <Button type="primary" onClick={() => navigate('/dashboard')}>
            Go to Dashboard
          </Button>
        }
      />
    </div>
  )
}
