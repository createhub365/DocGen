import { useEffect, useMemo, useState } from 'react'
import { DatePicker, Form, Typography } from 'antd'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import {
  DISPLAY_DATE_FORMAT,
  STORE_DATE_FORMAT,
  getDateStoreFormat,
} from './formFieldConfig'

dayjs.extend(customParseFormat)

const { Text } = Typography

function parseStoredDate(value, storeFormat) {
  if (!value) return null
  const parsed = dayjs(value, storeFormat)
  return parsed.isValid() ? parsed : null
}

export default function DateField({ value, onChange, fieldId, form }) {
  const [manualExpiry, setManualExpiry] = useState(false)
  const storeFormat = getDateStoreFormat(fieldId)
  const issueDate = Form.useWatch('issue_date', form)
  const validityDays = Form.useWatch('validity_days', form)

  useEffect(() => {
    if (fieldId !== 'validity_expiry_date') return
    setManualExpiry(false)
  }, [issueDate, validityDays, fieldId])

  useEffect(() => {
    if (fieldId !== 'validity_expiry_date' || manualExpiry) return
    if (!issueDate || validityDays === undefined || validityDays === '') return

    const parsed = dayjs(issueDate, STORE_DATE_FORMAT)
    const days = parseInt(String(validityDays), 10)
    if (!parsed.isValid() || Number.isNaN(days)) return

    const expiry = parsed.add(days, 'day').format(STORE_DATE_FORMAT)
    onChange?.(expiry)
    form.setFieldValue('validity_expiry_date', expiry)
  }, [issueDate, validityDays, fieldId, manualExpiry, onChange, form])

  const showPassportWarning = useMemo(() => {
    if (fieldId !== 'passport_expiry_date' || !value) return false
    const parsed = parseStoredDate(value, storeFormat)
    if (!parsed) return false
    return parsed.isBefore(dayjs().add(18, 'month'))
  }, [fieldId, value, storeFormat])

  const handleChange = (date) => {
    if (fieldId === 'validity_expiry_date') {
      setManualExpiry(true)
    }
    const formatted = date ? date.format(storeFormat) : ''
    onChange?.(formatted)
  }

  return (
    <div>
      <DatePicker
        style={{ width: '100%' }}
        format={DISPLAY_DATE_FORMAT}
        value={parseStoredDate(value, storeFormat)}
        onChange={handleChange}
      />
      {showPassportWarning && (
        <Text type="warning" style={{ display: 'block', marginTop: 4, color: '#d48806' }}>
          ⚠️ Passport may expire before visa period ends
        </Text>
      )}
    </div>
  )
}
