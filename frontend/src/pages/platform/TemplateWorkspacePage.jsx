import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Button,
  Space,
  Spin,
  Tabs,
  Tooltip,
  Typography,
} from 'antd'
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons'
import {
  getDocumentType,
  listOrgTemplates,
  readPlatformErrorDetail,
} from '../../api/platformClient'
import { usePlatformAuth } from '../../context/PlatformAuthContext'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { usePlatformPageChrome } from '../../components/PlatformLayout'
import PlaceholderMappingPanel from './PlaceholderMappingPanel'
import FlowBuilderPage from './FlowBuilderPage'

const { Title, Paragraph, Text } = Typography

function basename(path) {
  if (!path) return 'Document'
  const parts = String(path).split(/[/\\]/)
  return parts[parts.length - 1] || path
}

/**
 * Combined per-template workspace: Mapping (default) + Flow (admin only).
 * Staff see Mapping only — no Flow tab.
 */
export default function TemplateWorkspacePage() {
  const { id, templateId: templateIdParam } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { isOrgAdmin } = usePlatformAuth()
  const { isMobile } = useBreakpoint()

  const documentTypeId = Number(id)
  const templateId = Number(templateIdParam)

  const requestedTab = searchParams.get('tab')
  const activeTab =
    isOrgAdmin && requestedTab === 'flow' ? 'flow' : 'mapping'

  const setActiveTab = useCallback(
    (key) => {
      if (key === 'flow' && isOrgAdmin) {
        setSearchParams({ tab: 'flow' }, { replace: true })
      } else {
        setSearchParams({}, { replace: true })
      }
    },
    [isOrgAdmin, setSearchParams]
  )

  const [template, setTemplate] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [flowChrome, setFlowChrome] = useState({
    editable: false,
    busy: false,
    status: null,
    onPublish: null,
  })

  useEffect(() => {
    // Staff (or anyone) hitting ?tab=flow without access → Mapping
    if (!isOrgAdmin && requestedTab === 'flow') {
      setSearchParams({}, { replace: true })
    }
  }, [isOrgAdmin, requestedTab, setSearchParams])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setLoadError(null)
      try {
        await getDocumentType(documentTypeId)
        const templates = await listOrgTemplates(documentTypeId)
        const match = (templates || []).find((t) => t.id === templateId)
        if (!match) {
          if (!cancelled) {
            setTemplate(null)
            setLoadError('That document was not found for this type.')
          }
          return
        }
        if (!cancelled) setTemplate(match)
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            (await readPlatformErrorDetail(error)) || 'Could not load document'
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [documentTypeId, templateId])

  const documentsPath = `/platform/document-types/${documentTypeId}`
  const chromeTitle =
    template?.display_name?.trim() ||
    basename(template?.docx_filename) ||
    'Document'

  const header = useMemo(
    () => (
      <>
        <Button
          type="text"
          className="platform-back-btn"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate(documentsPath)}
          style={{
            alignSelf: 'flex-start',
            marginLeft: -8,
            height: isMobile ? 44 : 28,
            minWidth: isMobile ? 44 : undefined,
            paddingInline: 8,
          }}
        >
          {isMobile ? 'Back' : 'Documents'}
        </Button>
        <Space align="center" wrap style={{ maxWidth: '100%' }} size={10}>
          <Title
            level={isMobile ? 4 : 3}
            style={{
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: isMobile ? 'min(100%, 70vw)' : undefined,
            }}
          >
            {chromeTitle}
          </Title>
          {isOrgAdmin && activeTab === 'flow' && flowChrome.status ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 10px',
                borderRadius: 999,
                background: '#faf3f3',
                border: '1px solid #f0e4e4',
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: flowChrome.status.dot || '#8c8c8c',
                  flexShrink: 0,
                }}
              />
              <Text style={{ fontSize: 13, fontWeight: 600, color: '#434343' }}>
                Flow: {flowChrome.status.text}
              </Text>
            </span>
          ) : null}
        </Space>
        {!isMobile ? (
          <Paragraph type="secondary" style={{ margin: 0 }}>
            {isOrgAdmin
              ? 'Map placeholders and configure this document’s generation flow.'
              : 'View placeholder mapping for this document.'}
          </Paragraph>
        ) : null}
      </>
    ),
    [
      chromeTitle,
      documentsPath,
      navigate,
      isMobile,
      isOrgAdmin,
      activeTab,
      flowChrome.status,
    ]
  )

  const footer = useMemo(() => {
    if (activeTab !== 'flow' || !flowChrome.onPublish) return null
    return (
      <Tooltip
        title={
          !flowChrome.editable
            ? 'Create or open a draft before publishing'
            : ''
        }
      >
        <span
          style={{
            display: isMobile ? 'block' : undefined,
            width: isMobile ? '100%' : undefined,
          }}
        >
          <Button
            type="primary"
            icon={<CheckCircleOutlined />}
            disabled={!flowChrome.editable}
            loading={flowChrome.busy}
            onClick={flowChrome.onPublish}
            size="large"
            className="platform-touch-target"
            block={isMobile}
          >
            Publish
          </Button>
        </span>
      </Tooltip>
    )
  }, [activeTab, flowChrome, isMobile])

  usePlatformPageChrome({ header, footer })

  if (!Number.isFinite(documentTypeId) || !Number.isFinite(templateId) || templateId <= 0) {
    return <Navigate to="/platform/document-types" replace />
  }

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: 360 }}>
        <Spin size="large" description="Loading document..." />
      </div>
    )
  }

  if (loadError || !template) {
    return (
      <div style={{ padding: 24 }}>
        <Paragraph type="danger">{loadError || 'Document not found'}</Paragraph>
        <Button type="primary" onClick={() => navigate(documentsPath)}>
          Back to Documents
        </Button>
      </div>
    )
  }

  const mappingPanel = (
    <PlaceholderMappingPanel
      documentTypeId={documentTypeId}
      template={template}
      onBack={() => navigate(documentsPath)}
      hideBack
      onGoToFlow={
        isOrgAdmin
          ? () => setActiveTab('flow')
          : undefined
      }
    />
  )

  // Staff: Mapping alone — no Flow tab chrome at all
  if (!isOrgAdmin) {
    return <div className="platform-template-workspace">{mappingPanel}</div>
  }

  const tabItems = [
    {
      key: 'mapping',
      label: 'Mapping',
      children: mappingPanel,
    },
    {
      key: 'flow',
      label: 'Flow',
      children: (
        <FlowBuilderPage
          embedded
          onChromeChange={setFlowChrome}
        />
      ),
    },
  ]

  return (
    <div className="platform-template-workspace">
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
        size={isMobile ? 'large' : 'middle'}
        tabBarStyle={{
          marginBottom: 16,
          // Comfortable tap targets on narrow screens
          ...(isMobile ? { paddingInline: 0 } : null),
        }}
        destroyInactiveTabPane={false}
      />
    </div>
  )
}
