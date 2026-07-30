import { useCallback, useEffect, useMemo, useState } from 'react'
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
import {
  DownloadOutlined,
  EyeOutlined,
  FileWordOutlined,
  ShareAltOutlined,
} from '@ant-design/icons'
import {
  downloadGeneratedDocument,
  fetchGeneratedDocumentBlob,
  listGeneratedDocuments,
  readPlatformErrorDetail,
} from '../../api/platformClient'
import { useAppMessage } from '../../hooks/useAppMessage'
import { usePlatformPageChrome } from '../../components/PlatformLayout'
import InAppPdfViewerModal from './InAppPdfViewerModal'
import ShareGeneratedDocumentModal from './ShareGeneratedDocumentModal'

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
  const [previewDocId, setPreviewDocId] = useState(null)
  const [shareDocId, setShareDocId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const docs = await listGeneratedDocuments()
      setRows(
        (docs || []).map((doc) => ({
          ...doc,
          document_type_name:
            doc.document_type_name || `Template #${doc.template_id}`,
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

  const onDownload = async (docId, format = 'docx') => {
    setDownloadingId(docId)
    try {
      await downloadGeneratedDocument(docId, format)
    } catch (error) {
      message.error((await readPlatformErrorDetail(error)) || 'Download failed')
    } finally {
      setDownloadingId(null)
    }
  }

  const loadPreviewPdf = useCallback(async () => {
    if (!previewDocId) throw new Error('No document')
    return fetchGeneratedDocumentBlob(previewDocId, 'pdf')
  }, [previewDocId])

  const header = useMemo(
    () => (
      <>
        <Title level={3} style={{ margin: 0 }}>
          Generated documents
        </Title>
        <Paragraph type="secondary" style={{ margin: 0 }}>
          Preview in-app, download, or share. Viewing never opens a new browser tab.
        </Paragraph>
      </>
    ),
    []
  )
  usePlatformPageChrome({ header })

  return (
    <div>
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
            renderItem={(item) => {
              const hasPdf = Boolean(item.pdf_filename)
              return (
                <List.Item
                  className="platform-generated-list-item"
                  actions={[
                    hasPdf ? (
                      <Button
                        key="view"
                        type="link"
                        className="platform-touch-target"
                        icon={<EyeOutlined />}
                        onClick={() => setPreviewDocId(item.id)}
                      >
                        View
                      </Button>
                    ) : null,
                    <Button
                      key="dl"
                      type="link"
                      className="platform-touch-target"
                      icon={<DownloadOutlined />}
                      loading={downloadingId === item.id}
                      onClick={() => onDownload(item.id, 'docx')}
                    >
                      Download
                    </Button>,
                    hasPdf ? (
                      <Button
                        key="share"
                        type="link"
                        className="platform-touch-target"
                        icon={<ShareAltOutlined />}
                        onClick={() => setShareDocId(item.id)}
                      >
                        Share
                      </Button>
                    ) : null,
                  ].filter(Boolean)}
                >
                  <List.Item.Meta
                    avatar={<FileWordOutlined style={{ fontSize: 22, color: 'var(--primary)' }} />}
                    title={
                      <Space wrap>
                        <Text strong>{item.document_type_name}</Text>
                        <Text type="secondary">#{item.id}</Text>
                      </Space>
                    }
                    description={`${formatDate(item.created_at)} · ${basename(item.docx_filename || item.pdf_filename)}`}
                  />
                </List.Item>
              )
            }}
          />
        )}
      </Card>

      <InAppPdfViewerModal
        open={previewDocId != null}
        onClose={() => setPreviewDocId(null)}
        title={previewDocId != null ? `Document #${previewDocId}` : 'Document preview'}
        loadPdf={loadPreviewPdf}
      />
      <ShareGeneratedDocumentModal
        open={shareDocId != null}
        onClose={() => setShareDocId(null)}
        documentId={shareDocId}
      />
    </div>
  )
}
