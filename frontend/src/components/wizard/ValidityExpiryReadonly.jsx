import { useEffect } from 'react'
import { Form, Input } from 'antd'
import dayjs from 'dayjs'
import { STORE_DATE_FORMAT } from './smartFormConfig'

export default function ValidityExpiryReadonly({ form }) {
  const issueDate = Form.useWatch('issue_date', form)
  const validityDays = Form.useWatch('validity_days', form)
  const value = Form.useWatch('validity_expiry_date', form)

  useEffect(() => {
    if (!issueDate || validityDays === undefined || validityDays === '') return
    const parsed = dayjs(issueDate, STORE_DATE_FORMAT)
    const days = parseInt(String(validityDays), 10)
    if (!parsed.isValid() || Number.isNaN(days)) return
    const expiry = parsed.add(days, 'day').format(STORE_DATE_FORMAT)
    form.setFieldValue('validity_expiry_date', expiry)
  }, [issueDate, validityDays, form])

  return (
    <Form.Item name="validity_expiry_date" label="Offer Expiry Date">
      <Input readOnly value={value || ''} style={{ background: '#fafafa', color: 'rgba(0,0,0,0.88)' }} />
    </Form.Item>
  )
}
