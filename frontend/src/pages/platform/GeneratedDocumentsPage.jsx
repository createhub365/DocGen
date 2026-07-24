import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert,
  Button,
  Card,
  Empty,
  List,
  Space,
  Spin,
  Typography,
} from 'antd'
import { DownloadOutlined, FileWordOutlined } from '@ant-design/icons'
import {
  downloadGeneratedDocument,
  listDocumentTypes,
  listGeneratedDocuments,
  listOrgTemplates,
  readPlatformErrorDetail,
} from '../../api/platformClient'
import { useAppMessage } from '../../hooks/useAppMessage'

const { Title, Paragraph, Text } = Typography

function basename(path) {
  if (!path) return 'document.docx'
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

export default function GeneratedDocumentsPage() {
  const navigate = useNavigate()
  const message = useAppMessage()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [loadError, setLoadError] = useState(null)
  const [downloadingId, setDownloadingId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [docs, types] = await Promise.all([
        listGeneratedDocuments(),
        listDocumentTypes(),
      ])
      const templateToType = {}
      await Promise.all(
        (types || []).map(async (type) => {
          try {
            const templates = await listOrgTemplates(type.id)
            for (const template of templates) {
              templateToType[template.id] = type.name
            }
          } catch {
            /* ignore */
          }
        })
      )
      setRows(
        (docs || []).map((doc) => ({
          ...doc,
          document_type_name: templateToType[doc.template_id] || `Template #${doc.template_id}`,
        }))
      )
    } catch (error) {
      setLoadError(
        (await readPlatformErrorDetail(error)) || 'Could not load generated documents'
      )
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const onDownload = async (docId) => {
    setDownloadingId(docId)
    try {
      await downloadGeneratedDocument(docId, 'docx')
    } catch (error) {
      message.error((await readPlatformErrorDetail(error)) || 'Download failed')
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <div>
      <Title level={3} style={{ marginTop: 0 }}>
        Generated documents
      </Title>
      <Paragraph type="secondary">
        Documents created from platform flows. Download the DOCX for each run.
      </Paragraph>

      {loadError && (
        <Alert type="error" showIcon message={loadError} style={{ marginBottom: 16 }} />
      )}

      <Card style={{ borderRadius: 16 }}>
        {loading ? (
          <div style={{ display: 'grid', placeItems: 'center', minHeight: 200 }}>
            <Spin description="Loading..." />
          </div>
        ) : !rows.length ? (
          <Empty
            description="No generated documents yet."
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          >
            <Button type="primary" onClick={() => navigate('/platform/document-types')}>
              Go to document types
            </Button>
          </Empty>
        ) : (
          <List
            dataSource={rows}
            renderItem={(item) => (
              <List.Item
                actions={[
                  <Button
                    key="dl"
                    type="link"
                    icon={<DownloadOutlined />}
                    loading={downloadingId === item.id}
                    onClick={() => onDownload(item.id)}
                  >
                    Download
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  avatar={<FileWordOutlined style={{ fontSize: 22, color: '#8B1A1A' }} />}
                  title={
                    <Space wrap>
                      <Text strong>{item.document_type_name}</Text>
                      <Text type="secondary">#{item.id}</Text>
                    </Space>
                  }
                  description={`${formatDate(item.created_at)} · ${basename(item.docx_filename)}`}
                />
              </List.Item>
            )}
          />
        )}
      </Card>
    </div>
  )
}
