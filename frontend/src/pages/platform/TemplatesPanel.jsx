import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert,
  Button,
  Card,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
  Upload,
} from 'antd'
import {
  DeleteOutlined,
  EditOutlined,
  FileWordOutlined,
  InboxOutlined,
  LinkOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import {
  deleteOrgTemplate,
  fetchOrgTemplateThumbnailUrl,
  listOrgTemplates,
  readPlatformErrorDetail,
  renameOrgTemplate,
  uploadOrgTemplate,
} from '../../api/platformClient'
import { useAppMessage } from '../../hooks/useAppMessage'
import PlaceholderMappingPanel from './PlaceholderMappingPanel'

const { Text, Paragraph } = Typography
const { Dragger } = Upload

const THUMB_W = 72
const THUMB_H = 96

function basename(path) {
  if (!path) return 'template.docx'
  const parts = String(path).split(/[/\\]/)
  return parts[parts.length - 1] || path
}

function formatDate(value) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString()
  } catch {
    return String(value)
  }
}

function placeholderIds(placeholders) {
  if (!Array.isArray(placeholders)) return []
  return placeholders
    .map((item) => (typeof item === 'string' ? item : item?.id))
    .filter(Boolean)
}

function documentTitle(item) {
  const name = String(item?.display_name || '').trim()
  if (name) return name
  return basename(item?.docx_filename)
}

function DocumentThumbFallback() {
  return (
    <div
      aria-hidden
      style={{
        width: THUMB_W,
        height: THUMB_H,
        borderRadius: 8,
        background: '#f5eded',
        border: '1px solid #f0e4e4',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        color: '#8B1A1A',
      }}
    >
      <FileWordOutlined style={{ fontSize: 22 }} />
    </div>
  )
}

function DocumentThumbPreview({ documentTypeId, templateId, hasThumbnail }) {
  const [url, setUrl] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let objectUrl = null
    let cancelled = false
    setUrl(null)
    setFailed(false)
    if (!hasThumbnail) return undefined

    ;(async () => {
      const blobUrl = await fetchOrgTemplateThumbnailUrl(documentTypeId, templateId)
      if (cancelled) {
        if (blobUrl) URL.revokeObjectURL(blobUrl)
        return
      }
      if (!blobUrl) {
        setFailed(true)
        return
      }
      objectUrl = blobUrl
      setUrl(blobUrl)
    })()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [documentTypeId, templateId, hasThumbnail])

  if (!hasThumbnail || failed || !url) {
    return <DocumentThumbFallback />
  }

  return (
    <div
      style={{
        width: THUMB_W,
        height: THUMB_H,
        borderRadius: 8,
        overflow: 'hidden',
        border: '1px solid #f0e4e4',
        background: '#fff',
        flexShrink: 0,
        boxShadow: '0 1px 2px rgba(107, 15, 15, 0.06)',
      }}
    >
      <img
        src={url}
        alt=""
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'top center',
          display: 'block',
        }}
        onError={() => setFailed(true)}
      />
    </div>
  )
}

export default function TemplatesPanel({
  documentTypeId,
  documentTypeName = 'this document type',
  hasDraftFlow = false,
  hasPublishedFlow = false,
  onGoToFlow,
  onDraftFieldsGenerated,
}) {
  const navigate = useNavigate()
  const message = useAppMessage()
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [templates, setTemplates] = useState([])
  const [completeness, setCompleteness] = useState({})
  const [loadError, setLoadError] = useState(null)
  const [uploadError, setUploadError] = useState(null)
  const [fileList, setFileList] = useState([])
  const [lastUpload, setLastUpload] = useState(null)
  const [mappingTemplate, setMappingTemplate] = useState(null)
  const [addOpen, setAddOpen] = useState(false)
  const [addForm] = Form.useForm()
  const watchedName = Form.useWatch('display_name', addForm)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState(null)
  const [renameLoading, setRenameLoading] = useState(false)
  const [renameForm] = Form.useForm()

  const loadTemplates = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const rows = await listOrgTemplates(documentTypeId)
      setTemplates(rows)
      setCompleteness(
        Object.fromEntries(
          (rows || []).map((row) => [row.id, !!row.is_complete])
        )
      )
    } catch (error) {
      setLoadError((await readPlatformErrorDetail(error)) || 'Could not load templates')
    } finally {
      setLoading(false)
    }
  }, [documentTypeId])

  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

  const closeAddModal = () => {
    setAddOpen(false)
    setUploadError(null)
    setFileList([])
    addForm.resetFields()
  }

  const openAddModal = () => {
    setUploadError(null)
    setFileList([])
    addForm.resetFields()
    setAddOpen(true)
  }

  const beforeUpload = (file) => {
    setUploadError(null)
    const name = file.name || ''
    if (!name.toLowerCase().endsWith('.docx')) {
      setUploadError('Only .docx files are accepted (client check).')
      setFileList([])
      return Upload.LIST_IGNORE
    }
    setFileList([file])
    return false
  }

  const onAddSubmit = async (values) => {
    const file = fileList[0]
    const displayName = String(values.display_name || '').trim()
    if (!displayName) {
      setUploadError('Document name is required.')
      return
    }
    if (!file) {
      setUploadError('Choose a .docx file before uploading.')
      return
    }
    if (!String(file.name || '').toLowerCase().endsWith('.docx')) {
      setUploadError('Only .docx files are accepted.')
      return
    }

    setUploading(true)
    setUploadError(null)
    setLastUpload(null)
    try {
      const result = await uploadOrgTemplate(documentTypeId, file, displayName)
      const ids = placeholderIds(result.placeholders)
      setLastUpload({
        id: result.id,
        display_name: result.display_name || displayName,
        docx_filename: result.docx_filename,
        placeholders: ids,
      })
      closeAddModal()
      message.success('Document uploaded')
      await loadTemplates()
    } catch (error) {
      setUploadError(
        (await readPlatformErrorDetail(error)) ||
          'Upload failed. Check file type and that this document type still exists.'
      )
    } finally {
      setUploading(false)
    }
  }

  const openRename = (item) => {
    setRenameTarget(item)
    renameForm.setFieldsValue({ display_name: documentTitle(item) })
    setRenameOpen(true)
  }

  const onRename = async (values) => {
    if (!renameTarget) return
    const next = String(values.display_name || '').trim()
    if (!next) return
    setRenameLoading(true)
    try {
      await renameOrgTemplate(renameTarget.id, next)
      message.success('Document renamed')
      setRenameOpen(false)
      setRenameTarget(null)
      renameForm.resetFields()
      await loadTemplates()
    } catch (error) {
      message.error((await readPlatformErrorDetail(error)) || 'Could not rename')
    } finally {
      setRenameLoading(false)
    }
  }

  const confirmDelete = (item) => {
    const title = documentTitle(item)
    const genCount = Number(item.generated_document_count || 0)
    Modal.confirm({
      title: `Delete “${title}”?`,
      content: (
        <div>
          <p style={{ marginBottom: genCount ? 8 : 0 }}>This cannot be undone.</p>
          {genCount > 0 && (
            <p style={{ marginBottom: 0 }}>
              {genCount} document{genCount === 1 ? ' was' : 's were'} generated from this
              template and will remain available for download, but this template file will
              be removed.
            </p>
          )}
        </div>
      ),
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await deleteOrgTemplate(documentTypeId, item.id)
          message.success(`Deleted “${title}”`)
          if (lastUpload?.id === item.id) setLastUpload(null)
          await loadTemplates()
        } catch (error) {
          message.error(
            (await readPlatformErrorDetail(error)) || 'Could not delete document'
          )
          throw error
        }
      },
    })
  }

  const onCompletenessChange = useCallback((templateId, isComplete) => {
    setCompleteness((current) => {
      if (current[templateId] === isComplete) return current
      return { ...current, [templateId]: isComplete }
    })
  }, [])

  if (mappingTemplate) {
    return (
      <PlaceholderMappingPanel
        documentTypeId={documentTypeId}
        template={mappingTemplate}
        onBack={() => {
          setMappingTemplate(null)
          loadTemplates()
        }}
        onCompletenessChange={onCompletenessChange}
        hasDraftFlow={hasDraftFlow}
        onGoToFlow={onGoToFlow}
        onDraftFieldsGenerated={onDraftFieldsGenerated}
      />
    )
  }

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: 240 }}>
        <Spin description="Loading documents..." />
      </div>
    )
  }

  const addLabel =
    templates.length >= 1
      ? `Add another document (template) to ${documentTypeName}`
      : `Add a document (template) to ${documentTypeName}`

  const canSubmitAdd =
    !!String(watchedName || '').trim() && fileList.length > 0 && !uploading

  return (
    <div>
      <Paragraph type="secondary" style={{ marginTop: 0 }}>
        Each uploaded Word file is a document under this type. Map its placeholders, then
        generate from that specific document.
      </Paragraph>

      {templates.length >= 1 && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Multiple templates can share this same set of fields — upload another file here instead of creating a new document type, unless this new document needs different fields."
        />
      )}

      {loadError && (
        <Alert type="error" showIcon message={loadError} style={{ marginBottom: 16 }} />
      )}

      <Card style={{ borderRadius: 16, marginBottom: 16 }}>
        <Button type="primary" onClick={openAddModal}>
          {addLabel}
        </Button>
      </Card>

      {lastUpload && (
        <Alert
          type="success"
          showIcon
          style={{ marginBottom: 16 }}
          message={`Uploaded “${lastUpload.display_name}” — detected ${
            lastUpload.placeholders.length
          } placeholder${lastUpload.placeholders.length === 1 ? '' : 's'}`}
          description={
            lastUpload.placeholders.length
              ? lastUpload.placeholders.map((id) => `{{${id}}}`).join(', ')
              : 'No {{placeholders}} were found in this file.'
          }
          action={
            <Button size="small" onClick={() => setMappingTemplate(lastUpload)}>
              Map now
            </Button>
          }
          closable
          onClose={() => setLastUpload(null)}
        />
      )}

      <Card title="Documents" style={{ borderRadius: 16 }}>
        {!templates.length ? (
          <Empty description="No documents uploaded yet." />
        ) : (
          <List
            grid={{ gutter: 16, column: 1 }}
            dataSource={templates}
            renderItem={(item) => {
              const isComplete = completeness[item.id] === true
              const canGenerate = isComplete && hasPublishedFlow
              let generateTip = 'Generate this document'
              if (!hasPublishedFlow) {
                generateTip = 'Publish a flow first, then generate'
              } else if (!isComplete) {
                generateTip = 'Open this document and finish mapping before generating'
              }
              const title = documentTitle(item)
              const fileLabel = basename(item.docx_filename)

              return (
                <List.Item>
                  <Card size="small" style={{ borderRadius: 12, width: '100%' }}>
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                      }}
                    >
                      <Space align="start" size={12} style={{ minWidth: 0, flex: 1 }}>
                        <DocumentThumbPreview
                          documentTypeId={documentTypeId}
                          templateId={item.id}
                          hasThumbnail={!!item.has_thumbnail}
                        />
                        <div style={{ minWidth: 0 }}>
                          <Space wrap size={4}>
                            <Text strong style={{ fontSize: 15 }}>
                              {title}
                            </Text>
                            <Tooltip title="Rename">
                              <Button
                                type="text"
                                size="small"
                                icon={<EditOutlined />}
                                aria-label="Rename document"
                                onClick={() => openRename(item)}
                              />
                            </Tooltip>
                            {isComplete ? (
                              <Tag color="green">Complete</Tag>
                            ) : (
                              <Tag color="orange">Incomplete</Tag>
                            )}
                          </Space>
                          <div>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {fileLabel} · Uploaded {formatDate(item.created_at)} · id{' '}
                              {item.id}
                            </Text>
                          </div>
                        </div>
                      </Space>
                      <Space wrap className="platform-doc-card-actions">
                        <Button
                          className="platform-touch-target"
                          icon={<LinkOutlined />}
                          onClick={() => setMappingTemplate(item)}
                        >
                          Open
                        </Button>
                        <Tooltip title={generateTip}>
                          <span>
                            <Button
                              type="primary"
                              className="platform-touch-target"
                              icon={<ThunderboltOutlined />}
                              disabled={!canGenerate}
                              onClick={() =>
                                navigate(
                                  `/platform/document-types/${documentTypeId}/generate/${item.id}`
                                )
                              }
                            >
                              Generate
                            </Button>
                          </span>
                        </Tooltip>
                        <Tooltip title="Delete document">
                          <Button
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            aria-label="Delete document"
                            onClick={() => confirmDelete(item)}
                          />
                        </Tooltip>
                      </Space>
                    </div>
                  </Card>
                </List.Item>
              )
            }}
          />
        )}
      </Card>

      <Modal
        title={addLabel}
        open={addOpen}
        onCancel={closeAddModal}
        footer={null}
        destroyOnHidden
        maskClosable={!uploading}
      >
        <Form
          form={addForm}
          layout="vertical"
          requiredMark={false}
          onFinish={onAddSubmit}
        >
          <Form.Item
            name="display_name"
            label="Document name"
            rules={[{ required: true, message: 'Document name is required' }]}
          >
            <Input placeholder="e.g. Standard Offer Letter" disabled={uploading} />
          </Form.Item>

          <Form.Item label="Word file (.docx)" required>
            <Dragger
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              beforeUpload={beforeUpload}
              fileList={fileList}
              onRemove={() => setFileList([])}
              maxCount={1}
              disabled={uploading}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">Click or drag a .docx file here</p>
              <p className="ant-upload-hint">Only Word (.docx) templates are accepted.</p>
            </Dragger>
            {fileList[0] && (
              <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
                Selected: {fileList[0].name}
              </Text>
            )}
          </Form.Item>

          {uploadError && (
            <Alert type="error" showIcon message={uploadError} style={{ marginBottom: 12 }} />
          )}

          <Button type="primary" htmlType="submit" loading={uploading} disabled={!canSubmitAdd} block>
            Upload document
          </Button>
        </Form>
      </Modal>

      <Modal
        title="Rename document"
        open={renameOpen}
        onCancel={() => {
          setRenameOpen(false)
          setRenameTarget(null)
          renameForm.resetFields()
        }}
        footer={null}
        destroyOnHidden
      >
        <Form form={renameForm} layout="vertical" onFinish={onRename} requiredMark={false}>
          <Form.Item
            name="display_name"
            label="Document name"
            rules={[{ required: true, message: 'Document name is required' }]}
          >
            <Input placeholder="e.g. Standard Offer Letter" />
          </Form.Item>
          {renameTarget && (
            <Paragraph type="secondary" style={{ marginTop: 0 }}>
              File: {basename(renameTarget.docx_filename)}
            </Paragraph>
          )}
          <Button type="primary" htmlType="submit" loading={renameLoading} block>
            Save name
          </Button>
        </Form>
      </Modal>
    </div>
  )
}
