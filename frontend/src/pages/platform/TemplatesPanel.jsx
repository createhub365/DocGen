import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Dropdown,
  Empty,
  Form,
  Input,
  Modal,
  Progress,
  Select,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
  Upload,
} from 'antd'
import {
  ArrowLeftOutlined,
  CheckSquareOutlined,
  CloseOutlined,
  DeleteOutlined,
  EditOutlined,
  FileWordOutlined,
  FolderAddOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  InboxOutlined,
  FormOutlined,
  MoreOutlined,
  PartitionOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons'
import {
  bulkDeleteOrgTemplates,
  bulkMoveOrgTemplates,
  createTemplateFolder,
  deleteOrgTemplate,
  deleteTemplateFolder,
  fetchOrgTemplateThumbnailUrl,
  listOrgTemplates,
  listTemplateFolders,
  moveOrgTemplate,
  readPlatformErrorDetail,
  renameOrgTemplate,
  renameTemplateFolder,
  uploadOrgTemplate,
} from '../../api/platformClient'
import { useAppMessage } from '../../hooks/useAppMessage'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { usePlatformAuth } from '../../context/PlatformAuthContext'
import AsyncBusyBar from '../../components/ui/AsyncBusyBar'
import OrgDocumentPreviewModal from './OrgDocumentPreviewModal'
import PlaceholderMappingPanel from './PlaceholderMappingPanel'

const { Text, Paragraph } = Typography
const { Dragger } = Upload

/** Portrait document tile — matches Dashboard auto-fill card rhythm. */
const DOC_CARD_MIN_PX = 180
const DOC_CARD_MAX_PX = 220
const THUMB_W = 200
const THUMB_H = 268

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

function DocumentThumbFallback({ onClick }) {
  const onKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onClick?.(event)
    }
  }
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={onKeyDown}
      aria-label="Preview document"
      style={{
        width: '100%',
        aspectRatio: `${THUMB_W} / ${THUMB_H}`,
        borderRadius: 10,
        background: '#f5eded',
        border: '1px solid #f0e4e4',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#8B1A1A',
        cursor: 'pointer',
        padding: 0,
      }}
    >
      <FileWordOutlined style={{ fontSize: 40 }} />
    </div>
  )
}

function DocumentThumbPreview({
  documentTypeId,
  templateId,
  hasThumbnail,
  onPreview,
}) {
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

  const onKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onPreview?.(event)
    }
  }

  if (!hasThumbnail || failed || !url) {
    return <DocumentThumbFallback onClick={onPreview} />
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onPreview}
      onKeyDown={onKeyDown}
      aria-label="Preview document"
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: `${THUMB_W} / ${THUMB_H}`,
        borderRadius: 10,
        overflow: 'hidden',
        border: '1px solid #f0e4e4',
        background: '#fff',
        boxShadow: '0 1px 3px rgba(107, 15, 15, 0.08)',
        padding: 0,
        cursor: 'zoom-in',
        // Avoid <button> UA compositing quirks that soften nested bitmaps.
        isolation: 'isolate',
      }}
    >
      <img
        src={url}
        alt=""
        decoding="async"
        draggable={false}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          // contain = full page, no cover-zoom; matches A4-ish card better
          objectFit: 'contain',
          objectPosition: 'top center',
          imageRendering: 'auto',
          display: 'block',
          // Keep bitmap on its own layer without filters/transforms
          transform: 'translateZ(0)',
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
  canManage: canManageProp,
  onGoToFlow,
  onDraftFieldsGenerated,
}) {
  const navigate = useNavigate()
  const message = useAppMessage()
  const { isMobile } = useBreakpoint()
  const { isOrgAdmin } = usePlatformAuth()
  const canManage = canManageProp ?? isOrgAdmin
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadPhase, setUploadPhase] = useState('idle') // idle | uploading | processing
  const [uploadPercent, setUploadPercent] = useState(0)
  const [templates, setTemplates] = useState([])
  const [folders, setFolders] = useState([])
  const [activeFolderId, setActiveFolderId] = useState(null) // null = root
  const [completeness, setCompleteness] = useState({})
  const [loadError, setLoadError] = useState(null)
  const [uploadError, setUploadError] = useState(null)
  const [fileList, setFileList] = useState([])
  const [lastUpload, setLastUpload] = useState(null)
  const [mappingTemplate, setMappingTemplate] = useState(null)
  const [previewTemplate, setPreviewTemplate] = useState(null)
  const [addOpen, setAddOpen] = useState(false)
  const [addForm] = Form.useForm()
  const watchedName = Form.useWatch('display_name', addForm)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState(null)
  const [renameLoading, setRenameLoading] = useState(false)
  const [renameForm] = Form.useForm()
  const [folderModalOpen, setFolderModalOpen] = useState(false)
  const [folderModalMode, setFolderModalMode] = useState('create') // create | rename
  const [folderTarget, setFolderTarget] = useState(null)
  const [folderSaving, setFolderSaving] = useState(false)
  const [folderForm] = Form.useForm()
  const [moveOpen, setMoveOpen] = useState(false)
  const [moveTarget, setMoveTarget] = useState(null)
  const [moveFolderId, setMoveFolderId] = useState(null)
  const [moveLoading, setMoveLoading] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [bulkBusy, setBulkBusy] = useState(false)

  const loadTemplates = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [rows, folderRows] = await Promise.all([
        listOrgTemplates(documentTypeId),
        listTemplateFolders(documentTypeId),
      ])
      setTemplates(rows || [])
      setFolders(folderRows || [])
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
    setActiveFolderId(null)
    setSelectMode(false)
    setSelectedIds([])
    loadTemplates()
  }, [loadTemplates])

  const activeFolder = useMemo(
    () => folders.find((f) => f.id === activeFolderId) || null,
    [folders, activeFolderId]
  )

  const rootTemplates = useMemo(
    () => templates.filter((t) => t.folder_id == null),
    [templates]
  )

  const folderTemplates = useMemo(() => {
    if (activeFolderId == null) return []
    return templates.filter((t) => t.folder_id === activeFolderId)
  }, [templates, activeFolderId])

  const visibleTemplates = activeFolderId == null ? rootTemplates : folderTemplates

  const folderCounts = useMemo(() => {
    const counts = {}
    for (const f of folders) counts[f.id] = 0
    for (const t of templates) {
      if (t.folder_id != null) counts[t.folder_id] = (counts[t.folder_id] || 0) + 1
    }
    return counts
  }, [folders, templates])

  const exitSelectMode = () => {
    setSelectMode(false)
    setSelectedIds([])
  }

  const toggleSelectMode = () => {
    if (selectMode) {
      exitSelectMode()
      return
    }
    setSelectMode(true)
    setSelectedIds([])
  }

  const toggleSelected = (id) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    )
  }

  const formatBulkSummary = (result, verb) => {
    const ok = result?.succeeded?.length || 0
    const failed = result?.failed || []
    if (!failed.length) return `${ok} ${verb}`
    const reasons = failed
      .map((f) => `#${f.id}: ${f.reason || 'failed'}`)
      .join('; ')
    return `${ok} ${verb}, ${failed.length} failed: ${reasons}`
  }

  const confirmBulkDelete = () => {
    const count = selectedIds.length
    if (!count) return
    Modal.confirm({
      title: `Delete ${count} selected document${count === 1 ? '' : 's'}?`,
      content:
        'This permanently removes the Word files and placeholder mappings. Generated downloads are kept.',
      okText: 'Delete',
      okButtonProps: { danger: true },
      cancelText: 'Cancel',
      onOk: async () => {
        setBulkBusy(true)
        try {
          const result = await bulkDeleteOrgTemplates(documentTypeId, selectedIds)
          const failed = result?.failed || []
          const msg = formatBulkSummary(result, 'deleted')
          if (failed.length) {
            message.warning(msg)
            setSelectedIds(failed.map((f) => f.id))
          } else {
            message.success(msg)
            exitSelectMode()
          }
          await loadTemplates()
        } catch (error) {
          message.error(
            (await readPlatformErrorDetail(error)) || 'Bulk delete failed'
          )
        } finally {
          setBulkBusy(false)
        }
      },
    })
  }

  const onBulkMove = async (folderId) => {
    if (!selectedIds.length) return
    setBulkBusy(true)
    try {
      const result = await bulkMoveOrgTemplates(
        documentTypeId,
        selectedIds,
        folderId
      )
      const failed = result?.failed || []
      const msg = formatBulkSummary(result, 'moved')
      if (failed.length) {
        message.warning(msg)
        setSelectedIds(failed.map((f) => f.id))
      } else {
        message.success(msg)
        exitSelectMode()
      }
      await loadTemplates()
    } catch (error) {
      message.error((await readPlatformErrorDetail(error)) || 'Bulk move failed')
    } finally {
      setBulkBusy(false)
    }
  }

  const closeAddModal = () => {
    if (uploading) return
    setAddOpen(false)
    setUploadError(null)
    setFileList([])
    setUploadPhase('idle')
    setUploadPercent(0)
    addForm.resetFields()
  }

  const openAddModal = () => {
    setUploadError(null)
    setFileList([])
    setUploadPhase('idle')
    setUploadPercent(0)
    addForm.resetFields()
    if (activeFolderId != null) {
      addForm.setFieldsValue({ folder_id: activeFolderId })
    }
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
    setUploadPhase('uploading')
    setUploadPercent(0)
    setUploadError(null)
    setLastUpload(null)
    try {
      const folderId = values.folder_id ?? null
      const result = await uploadOrgTemplate(
        documentTypeId,
        file,
        displayName,
        folderId,
        {
          onUploadProgress: (percent) => {
            setUploadPercent(percent)
            if (percent >= 100) {
              // Bytes sent; server may still be generating thumbnail / detecting placeholders.
              setUploadPhase('processing')
            }
          },
        }
      )
      // Ensure processing flash even if progress events were sparse/missing.
      setUploadPhase('processing')
      setUploadPercent(100)
      const ids = placeholderIds(result.placeholders)
      setLastUpload({
        id: result.id,
        display_name: result.display_name || displayName,
        docx_filename: result.docx_filename,
        placeholders: ids,
      })
      setUploading(false)
      setUploadPhase('idle')
      setUploadPercent(0)
      setAddOpen(false)
      setUploadError(null)
      setFileList([])
      addForm.resetFields()
      message.success('Document uploaded')
      await loadTemplates()
    } catch (error) {
      setUploadError(
        (await readPlatformErrorDetail(error)) ||
          'Upload failed. Check file type and that this document type still exists.'
      )
      setUploadPhase('idle')
      setUploadPercent(0)
    } finally {
      setUploading(false)
    }
  }

  const openCreateFolder = () => {
    setFolderModalMode('create')
    setFolderTarget(null)
    folderForm.resetFields()
    setFolderModalOpen(true)
  }

  const openRenameFolder = (folder) => {
    setFolderModalMode('rename')
    setFolderTarget(folder)
    folderForm.setFieldsValue({ name: folder.name })
    setFolderModalOpen(true)
  }

  const onFolderSave = async (values) => {
    const name = String(values.name || '').trim()
    if (!name) return
    setFolderSaving(true)
    try {
      if (folderModalMode === 'create') {
        await createTemplateFolder(documentTypeId, name)
        message.success('Folder created')
      } else if (folderTarget) {
        await renameTemplateFolder(folderTarget.id, name)
        message.success('Folder renamed')
      }
      setFolderModalOpen(false)
      setFolderTarget(null)
      folderForm.resetFields()
      await loadTemplates()
    } catch (error) {
      message.error((await readPlatformErrorDetail(error)) || 'Could not save folder')
    } finally {
      setFolderSaving(false)
    }
  }

  const confirmDeleteFolder = (folder) => {
    const count = folderCounts[folder.id] || 0
    Modal.confirm({
      title: `Delete folder “${folder.name}”?`,
      content:
        count > 0
          ? `${count} document${count === 1 ? '' : 's'} inside will move to Uncategorized — they will not be deleted.`
          : 'This folder is empty.',
      okText: 'Delete folder',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await deleteTemplateFolder(folder.id)
          message.success(`Deleted folder “${folder.name}”`)
          if (activeFolderId === folder.id) setActiveFolderId(null)
          await loadTemplates()
        } catch (error) {
          message.error(
            (await readPlatformErrorDetail(error)) || 'Could not delete folder'
          )
          throw error
        }
      },
    })
  }

  const openMove = (item) => {
    setMoveTarget(item)
    setMoveFolderId(item.folder_id ?? null)
    setMoveOpen(true)
  }

  const onMoveSave = async () => {
    if (!moveTarget) return
    setMoveLoading(true)
    try {
      await moveOrgTemplate(moveTarget.id, moveFolderId)
      message.success('Document moved')
      setMoveOpen(false)
      setMoveTarget(null)
      await loadTemplates()
    } catch (error) {
      message.error((await readPlatformErrorDetail(error)) || 'Could not move document')
    } finally {
      setMoveLoading(false)
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

  const renderDocGrid = (items) => (
    <div
      className="platform-doc-card-grid"
      style={{
        display: 'grid',
        gridTemplateColumns: isMobile
          ? `repeat(auto-fill, minmax(min(100%, ${DOC_CARD_MIN_PX}px), 1fr))`
          : `repeat(auto-fill, minmax(${DOC_CARD_MIN_PX}px, ${DOC_CARD_MAX_PX}px))`,
        gap: 16,
        justifyContent: 'start',
      }}
    >
      {items.map((item) => {
        const isComplete = completeness[item.id] === true
        const selected = selectedIds.includes(item.id)
        const canGenerate = isComplete && hasPublishedFlow
        let generateTip = 'Generate this document'
        if (!canGenerate) {
          generateTip = canManage
            ? !hasPublishedFlow
              ? 'Publish a flow first, then generate'
              : 'Open this document and finish mapping before generating'
            : 'This document isn’t ready to generate yet'
        }
        const title = documentTitle(item)
        const fileLabel = basename(item.docx_filename)
        const statusTag = canManage ? (
          isComplete ? (
            <Tag color="green" style={{ margin: 0 }}>
              Complete
            </Tag>
          ) : (
            <Tag color="orange" style={{ margin: 0 }}>
              Incomplete
            </Tag>
          )
        ) : isComplete && hasPublishedFlow ? (
          <Tag color="green" style={{ margin: 0 }}>
            Ready
          </Tag>
        ) : (
          <Tag color="orange" style={{ margin: 0 }}>
            Not ready
          </Tag>
        )

        return (
          <Card
            key={item.id}
            size="small"
            className="platform-lift-card platform-fade-in"
            styles={{ body: { padding: 12 } }}
            style={{
              borderRadius: 14,
              width: '100%',
              maxWidth: isMobile ? undefined : DOC_CARD_MAX_PX,
              outline: selected ? '2px solid #8B1A1A' : undefined,
              outlineOffset: 1,
            }}
          >
            <div style={{ position: 'relative', marginBottom: 10 }}>
              <DocumentThumbPreview
                documentTypeId={documentTypeId}
                templateId={item.id}
                hasThumbnail={!!item.has_thumbnail}
                onPreview={() => setPreviewTemplate(item)}
              />
              <div
                style={{
                  position: 'absolute',
                  top: 8,
                  left: 8,
                  pointerEvents: 'none',
                }}
              >
                {statusTag}
              </div>
              {selectMode && canManage ? (
                <div
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    zIndex: 2,
                    background: 'rgba(255,255,255,0.92)',
                    borderRadius: 6,
                    padding: 2,
                    lineHeight: 1,
                  }}
                  onClick={(event) => event.stopPropagation()}
                  onMouseDown={(event) => event.stopPropagation()}
                >
                  <Checkbox
                    checked={selected}
                    aria-label={`Select ${title}`}
                    onClick={(event) => event.stopPropagation()}
                    onChange={() => toggleSelected(item.id)}
                  />
                </div>
              ) : null}
            </div>

            <div style={{ marginBottom: 10, minWidth: 0 }}>
              <Space wrap size={4} style={{ width: '100%' }}>
                <Text
                  strong
                  style={{
                    fontSize: 14,
                    display: 'block',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: '100%',
                  }}
                  title={title}
                >
                  {title}
                </Text>
                {canManage ? (
                  <Tooltip title="Rename">
                    <Button
                      type="text"
                      size="small"
                      icon={<EditOutlined />}
                      aria-label="Rename document"
                      onClick={() => openRename(item)}
                    />
                  </Tooltip>
                ) : null}
              </Space>
              <Text type="secondary" style={{ fontSize: 11 }}>
                {canManage
                  ? `${fileLabel} · ${formatDate(item.created_at)}`
                  : fileLabel}
              </Text>
            </div>

            <Space wrap size={8} className="platform-doc-card-actions">
              <Button
                className="platform-touch-target"
                size="small"
                icon={<FormOutlined />}
                onClick={() => setMappingTemplate(item)}
              >
                Open
              </Button>
              <Tooltip title={generateTip}>
                <span>
                  <Button
                    type="primary"
                    size="small"
                    className="platform-touch-target"
                    icon={<PlayCircleOutlined />}
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
              {canManage ? (
                <Button
                  className="platform-touch-target"
                  size="small"
                  icon={<PartitionOutlined />}
                  onClick={() =>
                    navigate(
                      `/platform/document-types/${documentTypeId}/templates/${item.id}/flow`
                    )
                  }
                >
                  Flow
                </Button>
              ) : null}
              {canManage ? (
                <Dropdown
                  menu={{
                    items: [
                      {
                        key: 'move',
                        label: 'Move to folder',
                        icon: <FolderOutlined />,
                        onClick: () => openMove(item),
                      },
                      {
                        key: 'delete',
                        label: 'Delete',
                        danger: true,
                        icon: <DeleteOutlined />,
                        onClick: () => confirmDelete(item),
                      },
                    ],
                  }}
                  trigger={['click']}
                >
                  <Button
                    type="text"
                    size="small"
                    icon={<MoreOutlined />}
                    aria-label="More document actions"
                  />
                </Dropdown>
              ) : null}
            </Space>
          </Card>
        )
      })}
    </div>
  )

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
      ? `Add another document to ${documentTypeName}`
      : `Add a document to ${documentTypeName}`

  const canSubmitAdd =
    !!String(watchedName || '').trim() && fileList.length > 0 && !uploading

  return (
    <div>
      <Paragraph type="secondary" style={{ marginTop: 0 }}>
        {canManage
          ? 'Upload Word files, map placeholders, then generate.'
          : 'Pick a document and generate.'}
      </Paragraph>

      {canManage && templates.length >= 1 && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Need another file with the same fields? Upload it here instead of creating a new document type."
        />
      )}

      {loadError && (
        <Alert type="error" showIcon message={loadError} style={{ marginBottom: 16 }} />
      )}

      {canManage ? (
        <Card style={{ borderRadius: 16, marginBottom: 16 }}>
          <Space wrap>
            <Button type="primary" onClick={openAddModal}>
              {addLabel}
            </Button>
            <Button icon={<FolderAddOutlined />} onClick={openCreateFolder}>
              New folder
            </Button>
            {templates.length >= 1 ? (
              <Button
                icon={<CheckSquareOutlined />}
                type={selectMode ? 'default' : 'dashed'}
                onClick={toggleSelectMode}
              >
                {selectMode ? 'Cancel select' : 'Select'}
              </Button>
            ) : null}
          </Space>
        </Card>
      ) : null}

      {canManage && selectMode && selectedIds.length > 0 ? (
        <Card
          size="small"
          style={{
            borderRadius: 12,
            marginBottom: 16,
            background: '#faf7f7',
            borderColor: '#e8d4d4',
          }}
        >
          <Space wrap align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
            <Text strong>
              {selectedIds.length} selected
              {visibleTemplates.length
                ? ` · ${visibleTemplates.filter((t) => selectedIds.includes(t.id)).length} in this view`
                : ''}
            </Text>
            <Space wrap>
              <Dropdown
                menu={{
                  items: [
                    {
                      key: 'uncategorized',
                      label: 'Uncategorized',
                      icon: <InboxOutlined />,
                      onClick: () => onBulkMove(null),
                    },
                    ...folders.map((folder) => ({
                      key: `folder-${folder.id}`,
                      label: folder.name,
                      icon: <FolderOutlined />,
                      onClick: () => onBulkMove(folder.id),
                    })),
                  ],
                }}
                trigger={['click']}
                disabled={bulkBusy}
              >
                <Button icon={<FolderOutlined />} loading={bulkBusy}>
                  Move to folder
                </Button>
              </Dropdown>
              <Button
                danger
                icon={<DeleteOutlined />}
                loading={bulkBusy}
                onClick={confirmBulkDelete}
              >
                Delete
              </Button>
              <Button
                icon={<CloseOutlined />}
                disabled={bulkBusy}
                onClick={() => setSelectedIds([])}
              >
                Clear selection
              </Button>
            </Space>
          </Space>
          <AsyncBusyBar
            active={bulkBusy}
            label={`Working on ${selectedIds.length} document${selectedIds.length === 1 ? '' : 's'}…`}
          />
        </Card>
      ) : null}

      {lastUpload && canManage && (
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

      <Card
        title={
          activeFolder ? (
            <Space>
              <Button
                type="text"
                size="small"
                icon={<ArrowLeftOutlined />}
                onClick={() => setActiveFolderId(null)}
                aria-label="Back to all documents"
              />
              <FolderOpenOutlined />
              <span>{activeFolder.name}</span>
            </Space>
          ) : (
            'Documents'
          )
        }
        style={{ borderRadius: 16 }}
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: 32 }}>
            <Spin />
          </div>
        ) : !templates.length && !folders.length ? (
          <Empty
            description={
              canManage ? 'No documents uploaded yet.' : 'No documents available yet.'
            }
          />
        ) : activeFolderId == null ? (
          <>
            {folders.length > 0 && (
              <div
                className="platform-doc-card-grid"
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile
                    ? `repeat(auto-fill, minmax(min(100%, ${DOC_CARD_MIN_PX}px), 1fr))`
                    : `repeat(auto-fill, minmax(${DOC_CARD_MIN_PX}px, ${DOC_CARD_MAX_PX}px))`,
                  gap: 16,
                  justifyContent: 'start',
                  marginBottom: rootTemplates.length ? 24 : 0,
                }}
              >
                {folders.map((folder) => (
                  <Card
                    key={`folder-${folder.id}`}
                    size="small"
                    hoverable
                    className="platform-folder-tile platform-fade-in"
                    styles={{ body: { padding: 16 } }}
                    style={{ borderRadius: 14, cursor: 'pointer' }}
                    onClick={() => setActiveFolderId(folder.id)}
                  >
                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                        <FolderOutlined style={{ fontSize: 28, color: '#8B1A1A' }} />
                        {canManage ? (
                          <Dropdown
                            menu={{
                              items: [
                                {
                                  key: 'rename',
                                  label: 'Rename',
                                  icon: <EditOutlined />,
                                  onClick: ({ domEvent }) => {
                                    domEvent.stopPropagation()
                                    openRenameFolder(folder)
                                  },
                                },
                                {
                                  key: 'delete',
                                  label: 'Delete',
                                  danger: true,
                                  icon: <DeleteOutlined />,
                                  onClick: ({ domEvent }) => {
                                    domEvent.stopPropagation()
                                    confirmDeleteFolder(folder)
                                  },
                                },
                              ],
                            }}
                            trigger={['click']}
                          >
                            <Button
                              type="text"
                              size="small"
                              icon={<MoreOutlined />}
                              aria-label="Folder actions"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </Dropdown>
                        ) : null}
                      </Space>
                      <Text strong ellipsis style={{ maxWidth: '100%' }} title={folder.name}>
                        {folder.name}
                      </Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {folderCounts[folder.id] || 0} document
                        {(folderCounts[folder.id] || 0) === 1 ? '' : 's'}
                      </Text>
                    </Space>
                  </Card>
                ))}
              </div>
            )}

            {rootTemplates.length > 0 && (
              <>
                {folders.length > 0 && (
                  <Text
                    type="secondary"
                    style={{ display: 'block', marginBottom: 12, fontSize: 12 }}
                  >
                    Uncategorized
                  </Text>
                )}
                {renderDocGrid(rootTemplates)}
              </>
            )}

            {!folders.length && !rootTemplates.length && (
              <Empty description="Nothing here yet." />
            )}
          </>
        ) : (
          <>
            {!folderTemplates.length ? (
              <Empty
                description={
                  canManage
                    ? 'This folder is empty — upload a document or move one here.'
                    : 'This folder is empty.'
                }
              />
            ) : (
              renderDocGrid(folderTemplates)
            )}
          </>
        )}
      </Card>

      <OrgDocumentPreviewModal
        open={!!previewTemplate}
        documentTypeId={documentTypeId}
        templateId={previewTemplate?.id}
        title={previewTemplate ? documentTitle(previewTemplate) : ''}
        hasThumbnail={!!previewTemplate?.has_thumbnail}
        onClose={() => setPreviewTemplate(null)}
      />

      <Modal
        title={addLabel}
        open={addOpen}
        onCancel={closeAddModal}
        footer={null}
        destroyOnHidden
        maskClosable={!uploading}
        keyboard={!uploading}
        closable={!uploading}
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

          {folders.length > 0 && (
            <Form.Item name="folder_id" label="Folder (optional)">
              <Select
                allowClear
                placeholder="Uncategorized"
                disabled={uploading}
                options={folders.map((f) => ({ value: f.id, label: f.name }))}
              />
            </Form.Item>
          )}

          <Form.Item label="Word file (.docx)" required>
            <Dragger
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              beforeUpload={beforeUpload}
              fileList={fileList}
              onRemove={() => {
                if (!uploading) setFileList([])
              }}
              maxCount={1}
              disabled={uploading}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">Click or drag a .docx file here</p>
            </Dragger>
            {fileList[0] && (
              <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
                Selected: {fileList[0].name}
              </Text>
            )}
          </Form.Item>

          {uploading && (
            <div style={{ marginBottom: 16 }}>
              {uploadPhase === 'processing' ? (
                <>
                  <Text style={{ display: 'block', marginBottom: 6 }}>Processing…</Text>
                  <Progress
                    percent={100}
                    status="active"
                    showInfo={false}
                    strokeColor={{ from: '#1677ff', to: '#69b1ff' }}
                  />
                </>
              ) : (
                <>
                  <Text style={{ display: 'block', marginBottom: 6 }}>
                    Uploading… {uploadPercent}%
                  </Text>
                  <Progress percent={uploadPercent} status="active" />
                </>
              )}
            </div>
          )}

          {uploadError && (
            <Alert type="error" showIcon message={uploadError} style={{ marginBottom: 12 }} />
          )}

          <Button
            type="primary"
            htmlType="submit"
            disabled={!canSubmitAdd || uploading}
            block
          >
            {uploading
              ? uploadPhase === 'processing'
                ? 'Processing…'
                : 'Uploading…'
              : 'Upload document'}
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

      <Modal
        title={folderModalMode === 'create' ? 'New folder' : 'Rename folder'}
        open={folderModalOpen}
        onCancel={() => {
          setFolderModalOpen(false)
          setFolderTarget(null)
          folderForm.resetFields()
        }}
        footer={null}
        destroyOnHidden
      >
        <Form form={folderForm} layout="vertical" onFinish={onFolderSave} requiredMark={false}>
          <Form.Item
            name="name"
            label="Folder name"
            rules={[{ required: true, message: 'Folder name is required' }]}
          >
            <Input placeholder="e.g. New Zealand" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={folderSaving} block>
            {folderModalMode === 'create' ? 'Create folder' : 'Save name'}
          </Button>
        </Form>
      </Modal>

      <Modal
        title="Move to folder"
        open={moveOpen}
        onCancel={() => {
          setMoveOpen(false)
          setMoveTarget(null)
        }}
        onOk={onMoveSave}
        confirmLoading={moveLoading}
        okText="Move"
        destroyOnHidden
      >
        <Paragraph type="secondary" style={{ marginTop: 0 }}>
          {moveTarget ? `Move “${documentTitle(moveTarget)}”` : ''}
        </Paragraph>
        <Select
          style={{ width: '100%' }}
          value={moveFolderId ?? undefined}
          onChange={(v) => setMoveFolderId(v ?? null)}
          allowClear
          placeholder="Uncategorized"
          options={folders.map((f) => ({ value: f.id, label: f.name }))}
        />
      </Modal>
    </div>
  )
}
