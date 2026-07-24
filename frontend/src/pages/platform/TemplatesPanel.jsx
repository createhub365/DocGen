import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Empty,
  List,
  Space,
  Spin,
  Tag,
  Typography,
  Upload,
} from 'antd'
import {
  FileWordOutlined,
  LinkOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import {
  listOrgTemplates,
  listPlaceholderMappings,
  readPlatformErrorDetail,
  uploadOrgTemplate,
} from '../../api/platformClient'
import { useAppMessage } from '../../hooks/useAppMessage'
import PlaceholderMappingPanel from './PlaceholderMappingPanel'

const { Text, Paragraph } = Typography

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

export default function TemplatesPanel({
  documentTypeId,
  hasDraftFlow = false,
  onGoToFlow,
  onDraftFieldsGenerated,
}) {
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

  const loadTemplates = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const rows = await listOrgTemplates(documentTypeId)
      setTemplates(rows)
      const statuses = await Promise.all(
        rows.map(async (row) => {
          try {
            const mappings = await listPlaceholderMappings(row.id)
            return [row.id, !!mappings.is_complete]
          } catch {
            return [row.id, null]
          }
        })
      )
      setCompleteness(Object.fromEntries(statuses))
    } catch (error) {
      setLoadError((await readPlatformErrorDetail(error)) || 'Could not load templates')
    } finally {
      setLoading(false)
    }
  }, [documentTypeId])

  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

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

  const onUpload = async () => {
    const file = fileList[0]
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
      const result = await uploadOrgTemplate(documentTypeId, file)
      const ids = placeholderIds(result.placeholders)
      setLastUpload({
        id: result.id,
        docx_filename: result.docx_filename,
        placeholders: ids,
      })
      setFileList([])
      message.success('Template uploaded')
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
        <Spin description="Loading templates..." />
      </div>
    )
  }

  return (
    <div>
      <Paragraph type="secondary" style={{ marginTop: 0 }}>
        Upload Word templates for this document type, then map detected placeholders to
        published flow fields.
      </Paragraph>

      {loadError && (
        <Alert type="error" showIcon message={loadError} style={{ marginBottom: 16 }} />
      )}

      <Card title="Upload template" style={{ borderRadius: 16, marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Upload
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            beforeUpload={beforeUpload}
            fileList={fileList}
            onRemove={() => setFileList([])}
            maxCount={1}
          >
            <Button icon={<UploadOutlined />}>Choose .docx</Button>
          </Upload>
          <Button type="primary" loading={uploading} onClick={onUpload}>
            Upload
          </Button>
          {uploadError && <Alert type="error" showIcon message={uploadError} />}
          {lastUpload && (
            <Alert
              type="success"
              showIcon
              message={`Detected ${lastUpload.placeholders.length} placeholder${
                lastUpload.placeholders.length === 1 ? '' : 's'
              }`}
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
            />
          )}
        </Space>
      </Card>

      <Card title="Templates" style={{ borderRadius: 16 }}>
        {!templates.length ? (
          <Empty description="No templates uploaded yet." />
        ) : (
          <List
            dataSource={templates}
            renderItem={(item) => {
              const status = completeness[item.id]
              return (
                <List.Item
                  actions={[
                    <Button
                      key="map"
                      type="link"
                      icon={<LinkOutlined />}
                      onClick={() => setMappingTemplate(item)}
                    >
                      Map placeholders
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    avatar={<FileWordOutlined style={{ fontSize: 22, color: '#8B1A1A' }} />}
                    title={
                      <Space wrap>
                        <Text strong>{basename(item.docx_filename)}</Text>
                        {status === true && <Tag color="green">Complete</Tag>}
                        {status === false && <Tag color="orange">Incomplete</Tag>}
                        {status === null && <Tag>Status unknown</Tag>}
                      </Space>
                    }
                    description={`Uploaded ${formatDate(item.created_at)} · id ${item.id}`}
                  />
                </List.Item>
              )
            }}
          />
        )}
      </Card>
    </div>
  )
}
