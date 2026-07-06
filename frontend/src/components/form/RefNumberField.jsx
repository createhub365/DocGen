import { useState } from 'react'
import { Input, Button } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { incrementRefCounter } from '../../api/client'
import { useAppMessage } from '../../hooks/useAppMessage'

export default function RefNumberField({ value, onChange }) {
  const [loading, setLoading] = useState(false)
  const message = useAppMessage()

  const fetchNumber = async () => {
    setLoading(true)
    try {
      const data = await incrementRefCounter()
      onChange?.(data.formatted)
    } catch {
      message.error('Could not generate reference number')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Input
      readOnly
      value={value || ''}
      suffix={
        <Button
          type="text"
          size="small"
          icon={<ReloadOutlined />}
          loading={loading}
          onClick={fetchNumber}
          aria-label="Regenerate reference number"
        />
      }
    />
  )
}
