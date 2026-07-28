import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Space,
  Spin,
  Switch,
  Table,
  Typography,
} from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import {
  addOptionListItem,
  createOptionList,
  deleteOptionList,
  deleteOptionListItem,
  getOptionList,
  listOptionLists,
  readPlatformErrorDetail,
  updateOptionList,
  updateOptionListItem,
} from '../../api/platformClient'
import { usePlatformAuth } from '../../context/PlatformAuthContext'
import { useAppMessage } from '../../hooks/useAppMessage'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { usePlatformPageChrome } from '../../components/PlatformLayout'

const { Title, Paragraph, Text } = Typography

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

export default function OptionListsPage() {
  const message = useAppMessage()
  const { isOrgAdmin } = usePlatformAuth()
  const { isMobile } = useBreakpoint()
  const isAdmin = isOrgAdmin

  const [loading, setLoading] = useState(true)
  const [lists, setLists] = useState([])
  const [loadError, setLoadError] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [listModalOpen, setListModalOpen] = useState(false)
  const [editingList, setEditingList] = useState(null)
  const [listSaving, setListSaving] = useState(false)
  const [listForm] = Form.useForm()

  const [itemModalOpen, setItemModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [itemSaving, setItemSaving] = useState(false)
  const [itemForm] = Form.useForm()

  const loadLists = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const rows = await listOptionLists()
      setLists(rows || [])
    } catch (error) {
      setLoadError((await readPlatformErrorDetail(error)) || 'Could not load option lists')
      setLists([])
    } finally {
      setLoading(false)
    }
  }, [])

  const loadDetail = useCallback(async (listId) => {
    if (!listId) {
      setDetail(null)
      return
    }
    setDetailLoading(true)
    try {
      const row = await getOptionList(listId)
      setDetail(row)
    } catch (error) {
      message.error((await readPlatformErrorDetail(error)) || 'Could not load list')
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }, [message])

  useEffect(() => {
    loadLists()
  }, [loadLists])

  useEffect(() => {
    loadDetail(selectedId)
  }, [selectedId, loadDetail])

  const openCreateList = () => {
    setEditingList(null)
    listForm.setFieldsValue({ name: '', slug: '' })
    setListModalOpen(true)
  }

  const openEditList = (row) => {
    setEditingList(row)
    listForm.setFieldsValue({ name: row.name, slug: row.slug })
    setListModalOpen(true)
  }

  const saveList = async (values) => {
    setListSaving(true)
    try {
      if (editingList) {
        await updateOptionList(editingList.id, {
          name: values.name.trim(),
          slug: values.slug.trim(),
        })
        message.success('List updated')
      } else {
        const created = await createOptionList({
          name: values.name.trim(),
          slug: values.slug.trim(),
        })
        message.success('List created')
        setSelectedId(created.id)
      }
      setListModalOpen(false)
      await loadLists()
      if (selectedId) await loadDetail(selectedId)
    } catch (error) {
      message.error((await readPlatformErrorDetail(error)) || 'Could not save list')
    } finally {
      setListSaving(false)
    }
  }

  const removeList = async (listId) => {
    try {
      await deleteOptionList(listId)
      message.success('List deleted')
      if (selectedId === listId) setSelectedId(null)
      await loadLists()
    } catch (error) {
      message.error((await readPlatformErrorDetail(error)) || 'Could not delete list')
    }
  }

  const openAddItem = () => {
    setEditingItem(null)
    itemForm.setFieldsValue({
      value: '',
      label: '',
      sort_order: (detail?.items?.length || 0),
      is_active: true,
    })
    setItemModalOpen(true)
  }

  const openEditItem = (item) => {
    setEditingItem(item)
    itemForm.setFieldsValue({
      value: item.value,
      label: item.label,
      sort_order: item.sort_order,
      is_active: item.is_active,
    })
    setItemModalOpen(true)
  }

  const saveItem = async (values) => {
    if (!selectedId) return
    setItemSaving(true)
    try {
      const payload = {
        value: values.value.trim(),
        label: values.label.trim(),
        sort_order: Number(values.sort_order) || 0,
        is_active: !!values.is_active,
      }
      if (editingItem) await updateOptionListItem(editingItem.id, payload)
      else await addOptionListItem(selectedId, payload)
      message.success(editingItem ? 'Item updated' : 'Item added')
      setItemModalOpen(false)
      await loadDetail(selectedId)
      await loadLists()
    } catch (error) {
      message.error((await readPlatformErrorDetail(error)) || 'Could not save item')
    } finally {
      setItemSaving(false)
    }
  }

  const removeItem = async (itemId) => {
    try {
      await deleteOptionListItem(itemId)
      message.success('Item deleted')
      await loadDetail(selectedId)
      await loadLists()
    } catch (error) {
      message.error((await readPlatformErrorDetail(error)) || 'Could not delete item')
    }
  }

  const header = useMemo(
    () => (
      <>
        <Title level={3} style={{ margin: 0 }}>
          Option lists
        </Title>
        <Paragraph type="secondary" style={{ margin: 0 }}>
          Reusable dropdown choices for flow fields. Staff can view; only org admins can edit.
        </Paragraph>
      </>
    ),
    []
  )

  const footer = useMemo(
    () =>
      isAdmin ? (
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreateList} size="large">
          New list
        </Button>
      ) : null,
    [isAdmin]
  )
  usePlatformPageChrome({ header, footer })

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: 280 }}>
        <Spin description="Loading option lists..." />
      </div>
    )
  }

  return (
    <div>
      {loadError && (
        <Alert type="error" showIcon message={loadError} style={{ marginBottom: 16 }} />
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'minmax(260px, 340px) 1fr',
          gap: 16,
        }}
      >
        <Card title="Lists" styles={{ body: { padding: 0 } }}>
          {lists.length ? (
            <div>
              {lists.map((row) => {
                const active = row.id === selectedId
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => setSelectedId(row.id)}
                    className="platform-touch-target"
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      border: 'none',
                      borderBottom: '1px solid #f0e4e4',
                      background: active ? '#faf3f3' : 'transparent',
                      padding: '12px 14px',
                      minHeight: 44,
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{row.name}</div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {row.slug} · {row.item_count} item{row.item_count === 1 ? '' : 's'}
                    </Text>
                  </button>
                )
              })}
            </div>
          ) : (
            <Empty style={{ padding: 24 }} description="No option lists yet" />
          )}
        </Card>

        <Card
          title={detail?.name || 'Select a list'}
          extra={
            detail && isAdmin ? (
              <Space wrap size={[4, 8]}>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEditList(detail)}>
                  Edit
                </Button>
                <Popconfirm
                  title="Delete this list?"
                  description="Blocked if any field still references it."
                  onConfirm={() => removeList(detail.id)}
                >
                  <Button size="small" danger icon={<DeleteOutlined />}>
                    Delete
                  </Button>
                </Popconfirm>
                <Button size="small" type="primary" icon={<PlusOutlined />} onClick={openAddItem}>
                  Add item
                </Button>
              </Space>
            ) : null
          }
        >
          {detailLoading ? (
            <Spin />
          ) : detail ? (
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              scroll={isMobile ? { x: 560 } : undefined}
              dataSource={detail.items || []}
              columns={[
                { title: 'Label', dataIndex: 'label' },
                { title: 'Value', dataIndex: 'value' },
                { title: 'Order', dataIndex: 'sort_order', width: 80 },
                {
                  title: 'Active',
                  dataIndex: 'is_active',
                  width: 80,
                  render: (v) => (v ? 'Yes' : 'No'),
                },
                ...(isAdmin
                  ? [
                      {
                        title: '',
                        key: 'actions',
                        width: 100,
                        fixed: isMobile ? 'right' : undefined,
                        render: (_, item) => (
                          <Space>
                            <Button
                              className="platform-touch-target"
                              icon={<EditOutlined />}
                              onClick={() => openEditItem(item)}
                              aria-label="Edit item"
                            />
                            <Popconfirm
                              title="Delete this item?"
                              onConfirm={() => removeItem(item.id)}
                            >
                              <Button
                                className="platform-touch-target"
                                danger
                                icon={<DeleteOutlined />}
                                aria-label="Delete item"
                              />
                            </Popconfirm>
                          </Space>
                        ),
                      },
                    ]
                  : []),
              ]}
            />
          ) : (
            <Empty description="Choose a list to view its items" />
          )}
        </Card>
      </div>

      <Modal
        title={editingList ? 'Edit list' : 'New list'}
        open={listModalOpen}
        onCancel={() => setListModalOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <Form
          form={listForm}
          layout="vertical"
          onFinish={saveList}
          onValuesChange={(changed) => {
            if ('name' in changed && !editingList) {
              listForm.setFieldValue('slug', slugify(changed.name))
            }
          }}
        >
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input placeholder="Employment status" />
          </Form.Item>
          <Form.Item
            name="slug"
            label="Slug"
            rules={[
              { required: true },
              {
                pattern: /^[a-z][a-z0-9_-]*$/,
                message: 'Lowercase letters, numbers, hyphens, underscores',
              },
            ]}
          >
            <Input placeholder="employment-status" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={listSaving} block>
            Save
          </Button>
        </Form>
      </Modal>

      <Modal
        title={editingItem ? 'Edit item' : 'Add item'}
        open={itemModalOpen}
        onCancel={() => setItemModalOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <Form form={itemForm} layout="vertical" onFinish={saveItem}>
          <Form.Item name="label" label="Label" rules={[{ required: true }]}>
            <Input placeholder="Permanent" />
          </Form.Item>
          <Form.Item name="value" label="Value" rules={[{ required: true }]}>
            <Input placeholder="permanent" />
          </Form.Item>
          <Form.Item name="sort_order" label="Sort order">
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="is_active" label="Active" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={itemSaving} block>
            Save
          </Button>
        </Form>
      </Modal>
    </div>
  )
}
