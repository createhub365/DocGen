import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Spin,
  Table,
  Typography,
} from 'antd'
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ImportOutlined,
} from '@ant-design/icons'
import {
  createOrgTrade,
  deleteOrgTrade,
  listOrgTrades,
  readPlatformErrorDetail,
  seedOrgTradesFromLegacy,
  updateOrgTrade,
} from '../../api/platformClient'
import { usePlatformAuth } from '../../context/PlatformAuthContext'
import { useAppMessage } from '../../hooks/useAppMessage'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { usePlatformPageChrome } from '../../components/PlatformLayout'

const { Title, Paragraph, Text } = Typography
const { TextArea } = Input

export default function TradesPage() {
  const message = useAppMessage()
  const { isOrgAdmin } = usePlatformAuth()
  const { isMobile } = useBreakpoint()
  const isAdmin = isOrgAdmin

  const [loading, setLoading] = useState(true)
  const [trades, setTrades] = useState([])
  const [loadError, setLoadError] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [form] = Form.useForm()

  const loadTrades = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const rows = await listOrgTrades()
      setTrades(rows || [])
    } catch (error) {
      setLoadError((await readPlatformErrorDetail(error)) || 'Could not load trades')
      setTrades([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTrades()
  }, [loadTrades])

  const openCreate = () => {
    setEditing(null)
    form.setFieldsValue({ name: '', duties_text: '' })
    setModalOpen(true)
  }

  const openEdit = (row) => {
    setEditing(row)
    form.setFieldsValue({
      name: row.name,
      duties_text: row.duties_text || '',
    })
    setModalOpen(true)
  }

  const saveTrade = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      const payload = {
        name: String(values.name || '').trim(),
        duties_text: values.duties_text ?? '',
      }
      if (editing) {
        await updateOrgTrade(editing.id, payload)
        message.success('Trade updated')
      } else {
        await createOrgTrade(payload)
        message.success('Trade created')
      }
      setModalOpen(false)
      await loadTrades()
    } catch (error) {
      if (error?.errorFields) return
      message.error((await readPlatformErrorDetail(error)) || 'Could not save trade')
    } finally {
      setSaving(false)
    }
  }

  const removeTrade = async (row) => {
    try {
      await deleteOrgTrade(row.id)
      message.success(`Deleted “${row.name}”`)
      await loadTrades()
    } catch (error) {
      message.error((await readPlatformErrorDetail(error)) || 'Could not delete trade')
    }
  }

  const seedFromLegacy = async () => {
    setSeeding(true)
    try {
      const result = await seedOrgTradesFromLegacy()
      message.success(
        `Seeded ${result.created} trade${result.created === 1 ? '' : 's'}` +
          (result.skipped ? ` (${result.skipped} already present)` : '')
      )
      await loadTrades()
    } catch (error) {
      message.error(
        (await readPlatformErrorDetail(error)) || 'Could not seed from legacy trade bank'
      )
    } finally {
      setSeeding(false)
    }
  }

  const header = useMemo(
    () => (
      <>
        <Title level={isMobile ? 4 : 3} style={{ margin: 0 }}>
          Trade Bank
        </Title>
        <Paragraph type="secondary" style={{ margin: 0 }}>
          Occupations and duties text for trade-linked Generate fields. One bank per
          organization.
        </Paragraph>
      </>
    ),
    [isMobile]
  )

  usePlatformPageChrome({ header })

  const columns = [
    {
      title: 'Trade',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
    },
    {
      title: 'Duties',
      dataIndex: 'duties_text',
      key: 'duties_text',
      ellipsis: true,
      render: (text) => (
        <Text type="secondary" style={{ whiteSpace: 'pre-wrap' }}>
          {String(text || '').slice(0, 120)}
          {String(text || '').length > 120 ? '…' : ''}
        </Text>
      ),
    },
    ...(isAdmin
      ? [
          {
            title: '',
            key: 'actions',
            width: 100,
            render: (_, row) => (
              <Space>
                <Button
                  type="text"
                  icon={<EditOutlined />}
                  aria-label="Edit trade"
                  onClick={() => openEdit(row)}
                />
                <Popconfirm
                  title="Delete this trade?"
                  okText="Delete"
                  okType="danger"
                  onConfirm={() => removeTrade(row)}
                >
                  <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    aria-label="Delete trade"
                  />
                </Popconfirm>
              </Space>
            ),
          },
        ]
      : []),
  ]

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: 280 }}>
        <Spin description="Loading trades..." />
      </div>
    )
  }

  return (
    <div>
      {loadError && (
        <Alert type="error" showIcon message={loadError} style={{ marginBottom: 16 }} />
      )}

      {isAdmin ? (
        <Space wrap style={{ marginBottom: 16 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Add trade
          </Button>
          <Popconfirm
            title="Seed from legacy trade bank?"
            description="Copies occupations and duties into this org. Existing names are skipped."
            okText="Seed"
            onConfirm={seedFromLegacy}
          >
            <Button icon={<ImportOutlined />} loading={seeding}>
              Seed from legacy trade bank
            </Button>
          </Popconfirm>
        </Space>
      ) : null}

      <Card style={{ borderRadius: 16 }}>
        {!trades.length ? (
          <Empty description="No trades yet. Seed from legacy or add one." />
        ) : (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={trades}
            pagination={{ pageSize: 20, showSizeChanger: true }}
            size={isMobile ? 'small' : 'middle'}
          />
        )}
      </Card>

      <Modal
        title={editing ? 'Edit trade' : 'Add trade'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={saveTrade}
        confirmLoading={saving}
        okText="Save"
        destroyOnHidden
        width={560}
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item
            name="name"
            label="Trade name"
            rules={[{ required: true, message: 'Name is required' }]}
          >
            <Input placeholder="Building Inspector / Certifier" />
          </Form.Item>
          <Form.Item name="duties_text" label="Duties / job responsibilities">
            <TextArea rows={8} placeholder="One duty per line" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
