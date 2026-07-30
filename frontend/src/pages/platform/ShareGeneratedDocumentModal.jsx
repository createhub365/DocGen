import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Tabs,
  Typography,
} from 'antd'
import {
  createGeneratedShareLink,
  listTelegramContacts,
  readPlatformErrorDetail,
  sendGeneratedDocumentEmail,
  sendGeneratedDocumentTelegram,
} from '../../api/platformClient'
import { useAppMessage } from '../../hooks/useAppMessage'
import { usePlatformAuth } from '../../context/PlatformAuthContext'

const { Text, Paragraph } = Typography

/**
 * Share a generated PDF via Telegram (bot upload), WhatsApp (link only), or Email (attachment).
 */
export default function ShareGeneratedDocumentModal({
  open,
  onClose,
  documentId,
}) {
  const message = useAppMessage()
  const { isOrgAdmin } = usePlatformAuth()
  const [contacts, setContacts] = useState([])
  const [contactsLoading, setContactsLoading] = useState(false)
  const [contactsError, setContactsError] = useState(null)
  const [tgBusy, setTgBusy] = useState(false)
  const [waBusy, setWaBusy] = useState(false)
  const [emailBusy, setEmailBusy] = useState(false)
  const [tgForm] = Form.useForm()
  const [waForm] = Form.useForm()
  const [emailForm] = Form.useForm()

  const loadContacts = useCallback(async () => {
    setContactsLoading(true)
    setContactsError(null)
    try {
      const rows = await listTelegramContacts()
      setContacts(Array.isArray(rows) ? rows : [])
    } catch (err) {
      setContacts([])
      setContactsError(
        (await readPlatformErrorDetail(err)) || 'Could not load Telegram contacts'
      )
    } finally {
      setContactsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    loadContacts()
    tgForm.resetFields()
    waForm.resetFields()
    emailForm.resetFields()
  }, [open, loadContacts, tgForm, waForm, emailForm])

  const onSendTelegram = async (values) => {
    setTgBusy(true)
    try {
      await sendGeneratedDocumentTelegram(documentId, values.telegram_contact_id)
      message.success('Sent via Telegram')
      onClose?.()
    } catch (err) {
      message.error((await readPlatformErrorDetail(err)) || 'Telegram send failed')
    } finally {
      setTgBusy(false)
    }
  }

  const onShareWhatsApp = async (values) => {
    setWaBusy(true)
    try {
      const { share_url } = await createGeneratedShareLink(documentId)
      const digits = String(values.phone || '').replace(/[^\d]/g, '')
      if (!digits) {
        message.error('Enter a phone number with country code')
        return
      }
      const text = [
        'Here is a temporary download link for your document:',
        share_url,
        '',
        '(Link expires in 48 hours. Open it to download the PDF.)',
      ].join('\n')
      const url = `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
      // wa.me must leave the app — platform limitation for WhatsApp compose.
      window.open(url, '_blank', 'noopener,noreferrer')
      message.success('WhatsApp compose opened with share link')
    } catch (err) {
      message.error((await readPlatformErrorDetail(err)) || 'Could not create share link')
    } finally {
      setWaBusy(false)
    }
  }

  const onSendEmail = async (values) => {
    setEmailBusy(true)
    try {
      await sendGeneratedDocumentEmail(documentId, {
        recipient_email: values.recipient_email,
        message: values.message,
      })
      message.success('Email sent with PDF attached')
      onClose?.()
    } catch (err) {
      message.error((await readPlatformErrorDetail(err)) || 'Email send failed')
    } finally {
      setEmailBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="Share document"
      footer={null}
      destroyOnHidden
      width={480}
    >
      <Tabs
        items={[
          {
            key: 'telegram',
            label: 'Telegram',
            children: (
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Paragraph type="secondary" style={{ margin: 0 }}>
                  Sends the PDF file directly via the DocGen bot to a saved contact.
                </Paragraph>
                {contactsError && (
                  <Alert type="error" showIcon message={contactsError} />
                )}
                {!contactsLoading && contacts.length === 0 && !contactsError && (
                  <Alert
                    type="info"
                    showIcon
                    message={
                      isOrgAdmin
                        ? 'No Telegram contacts yet. Add them under Settings.'
                        : 'No Telegram contacts yet. Ask an org admin to add contacts in Settings.'
                    }
                  />
                )}
                <Form form={tgForm} layout="vertical" onFinish={onSendTelegram}>
                  <Form.Item
                    name="telegram_contact_id"
                    label="Contact"
                    rules={[{ required: true, message: 'Select a contact' }]}
                  >
                    <Select
                      loading={contactsLoading}
                      placeholder="Select contact"
                      options={contacts.map((c) => ({
                        value: c.id,
                        label: `${c.label} (${c.chat_id})`,
                      }))}
                    />
                  </Form.Item>
                  <Button
                    type="primary"
                    htmlType="submit"
                    loading={tgBusy}
                    block
                    disabled={!contacts.length}
                  >
                    Send via Telegram
                  </Button>
                </Form>
              </Space>
            ),
          },
          {
            key: 'whatsapp',
            label: 'WhatsApp',
            children: (
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Alert
                  type="info"
                  showIcon
                  message="Share link via WhatsApp"
                  description="Opens WhatsApp with a temporary download link. The recipient downloads the file themselves — this does not attach or auto-send the PDF."
                />
                <Form form={waForm} layout="vertical" onFinish={onShareWhatsApp}>
                  <Form.Item
                    name="phone"
                    label="Phone (with country code)"
                    rules={[{ required: true, message: 'Phone number is required' }]}
                    extra="Digits only after country code, e.g. 971501234567"
                  >
                    <Input placeholder="971501234567" inputMode="tel" />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" loading={waBusy} block>
                    Share link via WhatsApp
                  </Button>
                </Form>
              </Space>
            ),
          },
          {
            key: 'email',
            label: 'Email',
            children: (
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Paragraph type="secondary" style={{ margin: 0 }}>
                  Sends the actual PDF as an email attachment (SMTP).
                </Paragraph>
                <Form form={emailForm} layout="vertical" onFinish={onSendEmail}>
                  <Form.Item
                    name="recipient_email"
                    label="Recipient email"
                    rules={[
                      { required: true, message: 'Email is required' },
                      { type: 'email', message: 'Enter a valid email' },
                    ]}
                  >
                    <Input placeholder="name@company.com" />
                  </Form.Item>
                  <Form.Item name="message" label="Message (optional)">
                    <Input.TextArea rows={3} placeholder="Optional note…" />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" loading={emailBusy} block>
                    Send email with attachment
                  </Button>
                </Form>
              </Space>
            ),
          },
        ]}
      />
      <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
        Document #{documentId}
      </Text>
    </Modal>
  )
}
