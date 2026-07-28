import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
} from 'antd'
import {
  CopyOutlined,
  DeleteOutlined,
  PlusOutlined,
  UserOutlined,
} from '@ant-design/icons'
import {
  inviteOrgUser,
  listOrgUsers,
  readPlatformErrorDetail,
  removeOrgUser,
  updateOrgUserRole,
} from '../../api/platformClient'
import { usePlatformAuth } from '../../context/PlatformAuthContext'
import { useAppMessage } from '../../hooks/useAppMessage'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { usePlatformPageChrome } from '../../components/PlatformLayout'
import { ORG_ADMIN_ROLE } from '../../utils/platformRoles'

const { Title, Paragraph, Text } = Typography

const ROLE_OPTIONS = [
  { value: 'staff', label: 'Staff' },
  { value: ORG_ADMIN_ROLE, label: 'Org admin' },
]

function roleLabel(role) {
  if (role === ORG_ADMIN_ROLE) return 'Org admin'
  if (role === 'staff') return 'Staff'
  return role || '—'
}

function formatJoined(value) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return String(value)
  }
}

export default function UsersPage() {
  const message = useAppMessage()
  const { isOrgAdmin, currentUser } = usePlatformAuth()
  const { isMobile } = useBreakpoint()
  const isAdmin = isOrgAdmin
  const myUserId = currentUser?.user_id

  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [loadError, setLoadError] = useState(null)

  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteSaving, setInviteSaving] = useState(false)
  const [inviteFormError, setInviteFormError] = useState(null)
  const [inviteForm] = Form.useForm()
  const [inviteResult, setInviteResult] = useState(null)

  const [roleModalRow, setRoleModalRow] = useState(null)
  const [roleSaving, setRoleSaving] = useState(false)
  const [roleForm] = Form.useForm()

  const adminCount = useMemo(
    () => rows.filter((r) => r.role === ORG_ADMIN_ROLE).length,
    [rows]
  )

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const data = await listOrgUsers()
      setRows(Array.isArray(data) ? data : [])
    } catch (error) {
      setLoadError((await readPlatformErrorDetail(error)) || 'Could not load users')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  const openInvite = () => {
    setInviteResult(null)
    setInviteFormError(null)
    inviteForm.setFieldsValue({ email: '', role: 'staff' })
    setInviteOpen(true)
  }

  const submitInvite = async () => {
    try {
      const values = await inviteForm.validateFields()
      setInviteSaving(true)
      setInviteFormError(null)
      const result = await inviteOrgUser({
        email: String(values.email || '').trim().toLowerCase(),
        role: values.role,
      })
      setInviteResult(result)
      message.success('User invited')
      await loadUsers()
    } catch (error) {
      if (error?.errorFields) return
      const detail =
        (await readPlatformErrorDetail(error)) || 'Could not invite user'
      const status = error.response?.status
      if (status === 409) {
        setInviteFormError(
          detail ||
            'This email already has membership in an organization and cannot be invited again.'
        )
      } else {
        setInviteFormError(detail)
      }
    } finally {
      setInviteSaving(false)
    }
  }

  const copyTempPassword = async (password) => {
    try {
      await navigator.clipboard.writeText(password)
      message.success('Temporary password copied')
    } catch {
      message.error('Could not copy — select and copy manually')
    }
  }

  const openRoleModal = (row) => {
    setRoleModalRow(row)
    roleForm.setFieldsValue({ role: row.role })
  }

  const submitRoleChange = async () => {
    if (!roleModalRow) return
    try {
      const values = await roleForm.validateFields()
      if (values.role === roleModalRow.role) {
        setRoleModalRow(null)
        return
      }
      setRoleSaving(true)
      const updated = await updateOrgUserRole(roleModalRow.id, { role: values.role })
      setRows((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)))
      message.success('Role updated')
      setRoleModalRow(null)
    } catch (error) {
      if (error?.errorFields) return
      const detail =
        (await readPlatformErrorDetail(error)) ||
        'Cannot change role — this may be the only admin in the organization'
      message.error(detail)
    } finally {
      setRoleSaving(false)
    }
  }

  const confirmRemove = async (row) => {
    try {
      await removeOrgUser(row.id)
      setRows((prev) => prev.filter((r) => r.id !== row.id))
      message.success('Membership removed')
    } catch (error) {
      const detail =
        (await readPlatformErrorDetail(error)) ||
        'Cannot remove — this may be the only admin in the organization'
      message.error(detail)
    }
  }

  const header = useMemo(
    () => (
      <>
        <Title level={3} style={{ margin: 0 }}>
          Users
        </Title>
        <Paragraph type="secondary" style={{ margin: 0 }}>
          {isAdmin
            ? 'Invite teammates and manage organization roles.'
            : 'Organization members (view only).'}
        </Paragraph>
      </>
    ),
    [isAdmin]
  )

  const footer = useMemo(
    () =>
      isAdmin ? (
        <Button type="primary" icon={<PlusOutlined />} onClick={openInvite} size="large">
          Invite user
        </Button>
      ) : null,
    [isAdmin]
  )
  usePlatformPageChrome({ header, footer })

  const columns = useMemo(() => {
    const cols = [
      {
        title: 'Email / username',
        key: 'identity',
        ellipsis: true,
        render: (_, row) => {
          const label = row.email || row.username || `User #${row.user_id}`
          const isMe = row.user_id === myUserId
          return (
            <Space direction="vertical" size={0}>
              <Text strong>
                {label}
                {isMe ? (
                  <Text type="secondary" style={{ fontWeight: 400, marginLeft: 6 }}>
                    (you)
                  </Text>
                ) : null}
              </Text>
              {row.username && row.email && row.username !== row.email ? (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {row.username}
                </Text>
              ) : null}
            </Space>
          )
        },
      },
      {
        title: 'Role',
        dataIndex: 'role',
        key: 'role',
        width: 130,
        render: (value) => (
          <Tag color={value === ORG_ADMIN_ROLE ? 'gold' : 'default'}>{roleLabel(value)}</Tag>
        ),
      },
      {
        title: 'Joined',
        dataIndex: 'created_at',
        key: 'created_at',
        width: 140,
        render: formatJoined,
      },
    ]

    if (isAdmin) {
      cols.push({
        title: 'Actions',
        key: 'actions',
        width: isMobile ? 120 : 200,
        fixed: isMobile ? 'right' : undefined,
        render: (_, row) => {
          const isMe = row.user_id === myUserId
          const isSoleAdmin = row.role === ORG_ADMIN_ROLE && adminCount <= 1
          const hideDestructive = isMe && isSoleAdmin

          return (
            <Space wrap size={[4, 4]}>
              <Button
                type="link"
                size="small"
                disabled={hideDestructive && row.role === ORG_ADMIN_ROLE}
                onClick={() => openRoleModal(row)}
              >
                Change role
              </Button>
              {!hideDestructive ? (
                <Popconfirm
                  title="Remove from organization?"
                  description={
                    <div style={{ maxWidth: 280 }}>
                      This removes their membership in this organization. Their account is
                      not deleted — they just lose access to this org.
                    </div>
                  }
                  okText="Remove"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => confirmRemove(row)}
                >
                  <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                    {isMobile ? '' : 'Remove'}
                  </Button>
                </Popconfirm>
              ) : null}
            </Space>
          )
        },
      })
    }

    return cols
  }, [isAdmin, isMobile, myUserId, adminCount])

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: 280 }}>
        <Spin description="Loading users..." />
      </div>
    )
  }

  return (
    <div>
      {loadError && (
        <Alert type="error" showIcon message={loadError} style={{ marginBottom: 16 }} />
      )}

      {!isAdmin && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="View only"
          description="Only organization admins can invite users or change roles."
        />
      )}

      <Table
        rowKey="id"
        columns={columns}
        dataSource={rows}
        pagination={rows.length > 10 ? { pageSize: 10 } : false}
        scroll={{ x: isMobile ? 640 : undefined }}
        locale={{ emptyText: 'No members yet' }}
        size={isMobile ? 'middle' : 'large'}
      />

      <Modal
        title={inviteResult ? 'Invite created' : 'Invite user'}
        open={inviteOpen}
        onCancel={() => {
          setInviteOpen(false)
          setInviteResult(null)
          setInviteFormError(null)
        }}
        footer={
          inviteResult
            ? [
                <Button
                  key="done"
                  type="primary"
                  onClick={() => {
                    setInviteOpen(false)
                    setInviteResult(null)
                  }}
                >
                  Done
                </Button>,
              ]
            : [
                <Button key="cancel" onClick={() => setInviteOpen(false)}>
                  Cancel
                </Button>,
                <Button
                  key="ok"
                  type="primary"
                  loading={inviteSaving}
                  onClick={submitInvite}
                >
                  Send invite
                </Button>,
              ]
        }
        destroyOnHidden
      >
        {inviteResult ? (
          <div>
            <Alert
              type="success"
              showIcon
              style={{ marginBottom: 12 }}
              message={`${inviteResult.username} was added as ${roleLabel(
                inviteResult.membership?.role
              )}.`}
            />
            {inviteResult.temporary_password ? (
              <div>
                <Paragraph style={{ marginBottom: 8 }}>
                  A temporary password was generated. Share it securely — it will not be
                  shown again. (Email delivery may be unavailable, so copy it now.)
                </Paragraph>
                <Space.Compact style={{ width: '100%' }}>
                  <Input
                    readOnly
                    value={inviteResult.temporary_password}
                    prefix={<UserOutlined />}
                  />
                  <Button
                    icon={<CopyOutlined />}
                    onClick={() => copyTempPassword(inviteResult.temporary_password)}
                  >
                    Copy
                  </Button>
                </Space.Compact>
              </div>
            ) : (
              <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                No new password was created — they can sign in with their existing account
                password.
              </Paragraph>
            )}
          </div>
        ) : (
          <>
            {inviteFormError && (
              <Alert
                type="error"
                showIcon
                message={inviteFormError}
                style={{ marginBottom: 12 }}
                closable
                onClose={() => setInviteFormError(null)}
              />
            )}
            <Form form={inviteForm} layout="vertical" requiredMark={false}>
              <Form.Item
                name="email"
                label="Email"
                rules={[
                  { required: true, message: 'Email is required' },
                  { type: 'email', message: 'Enter a valid email' },
                ]}
              >
                <Input placeholder="teammate@example.com" autoComplete="off" />
              </Form.Item>
              <Form.Item
                name="role"
                label="Role"
                rules={[{ required: true, message: 'Role is required' }]}
              >
                <Select options={ROLE_OPTIONS} />
              </Form.Item>
            </Form>
          </>
        )}
      </Modal>

      <Modal
        title="Change role"
        open={!!roleModalRow}
        onCancel={() => setRoleModalRow(null)}
        onOk={submitRoleChange}
        confirmLoading={roleSaving}
        okText="Save"
        destroyOnHidden
      >
        {roleModalRow ? (
          <Form form={roleForm} layout="vertical" requiredMark={false}>
            <Paragraph type="secondary">
              {roleModalRow.email || roleModalRow.username || `User #${roleModalRow.user_id}`}
            </Paragraph>
            <Form.Item
              name="role"
              label="Role"
              rules={[{ required: true, message: 'Role is required' }]}
            >
              <Select options={ROLE_OPTIONS} />
            </Form.Item>
          </Form>
        ) : null}
      </Modal>
    </div>
  )
}
