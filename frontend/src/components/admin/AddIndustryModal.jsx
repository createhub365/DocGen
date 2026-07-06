import { useEffect } from 'react'
import { Modal, Form, Input, ColorPicker } from 'antd'

const ICON_OPTIONS = ['✨', '🏗️', '🏥', '🌾', '🍽️', '🚛', '🏭', '⚡', '💻', '👴', '🏫', '🔒', '🛒']

export default function AddIndustryModal({ open, onClose, onSave }) {
  const [form] = Form.useForm()

  useEffect(() => {
    if (!open) return
    form.setFieldsValue({
      industry: '',
      icon: '✨',
      color: '#7D6608',
    })
  }, [open, form])

  const handleSubmit = async () => {
    const values = await form.validateFields()
    const color =
      typeof values.color === 'string'
        ? values.color
        : values.color?.toHexString?.() || '#7D6608'
    await onSave({
      industry: values.industry.trim(),
      icon: values.icon || '✨',
      color,
    })
    form.resetFields()
    onClose()
  }

  return (
    <Modal
      title="Add Industry"
      open={open}
      onCancel={onClose}
      onOk={handleSubmit}
      okText="Save Industry"
      width={480}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
        <Form.Item
          name="industry"
          label="Industry name"
          rules={[{ required: true, message: 'Enter industry name' }]}
        >
          <Input placeholder="e.g. Renewable Energy" />
        </Form.Item>
        <Form.Item name="icon" label="Icon">
          <Input placeholder="✨" maxLength={4} />
        </Form.Item>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          {ICON_OPTIONS.map((icon) => (
            <button
              key={icon}
              type="button"
              onClick={() => form.setFieldValue('icon', icon)}
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                border: '1px solid #DDE3EC',
                background: '#F7F9FC',
                cursor: 'pointer',
                fontSize: 18,
              }}
            >
              {icon}
            </button>
          ))}
        </div>
        <Form.Item name="color" label="Theme color">
          <ColorPicker showText format="hex" />
        </Form.Item>
      </Form>
    </Modal>
  )
}
