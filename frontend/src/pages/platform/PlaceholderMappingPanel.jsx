import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Modal,
  Select,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import { ArrowLeftOutlined, PlayCircleOutlined, SaveOutlined } from '@ant-design/icons'
import {
  buildResolvableFieldKeyOptions,
  generateFieldsFromPlaceholders,
  listFieldDefinitions,
  listFlowSteps,
  listPlaceholderMappings,
  readPlatformErrorDetail,
  resolvePublishedFlowForTemplate,
  savePlaceholderMappings,
} from '../../api/platformClient'
import { usePlatformAuth } from '../../context/PlatformAuthContext'
import { useAppMessage } from '../../hooks/useAppMessage'
import {
  buildInitialMappingSelections,
  suggestFieldKeyForPlaceholder,
} from './mappingSuggestions'

const { Text, Title } = Typography

function basename(path) {
  if (!path) return 'template.docx'
  const parts = String(path).split(/[/\\]/)
  return parts[parts.length - 1] || path
}

export default function PlaceholderMappingPanel({
  documentTypeId,
  template,
  onBack,
  onCompletenessChange,
  hasDraftFlow = false,
  onGoToFlow,
  onDraftFieldsGenerated,
}) {
  const message = useAppMessage()
  const { isOrgAdmin } = usePlatformAuth()
  /** POST /mappings and generate-fields require org_admin — staff view is read-only. */
  const canEditMappings = isOrgAdmin
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generatingFields, setGeneratingFields] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [publishGuard, setPublishGuard] = useState(false)
  const [fieldOptions, setFieldOptions] = useState([])
  const [detected, setDetected] = useState([])
  const [unmapped, setUnmapped] = useState([])
  const [isComplete, setIsComplete] = useState(false)
  const [duplicateReview, setDuplicateReview] = useState(null)
  const [duplicateSelections, setDuplicateSelections] = useState({})
  const [confirmingDuplicates, setConfirmingDuplicates] = useState(false)
  const [selections, setSelections] = useState({})
  /** Placeholder keys pre-filled by auto-suggest; not yet saved. */
  const [suggestedKeys, setSuggestedKeys] = useState(() => new Set())
  const [saveError, setSaveError] = useState(null)
  const [invalidKeys, setInvalidKeys] = useState([])
  const [bulkSummary, setBulkSummary] = useState(null)

  // Keep parent callback out of load()'s dependency list — an unstable
  // onCompletenessChange (recreated each parent render) was retriggering
  // GET .../flow/published in a loop after every completeness setState.
  const onCompletenessChangeRef = useRef(onCompletenessChange)
  onCompletenessChangeRef.current = onCompletenessChange

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    setSaveError(null)
    setInvalidKeys([])
    setPublishGuard(false)
    try {
      let published = null
      let options = []
      const [publishedSettled, mappings] = await Promise.all([
        resolvePublishedFlowForTemplate(template.id, documentTypeId)
          .then((value) => ({ ok: true, value: value.flow }))
          .catch((error) => ({ ok: false, error })),
        listPlaceholderMappings(template.id),
      ])

      if (!publishedSettled.ok) {
        if (publishedSettled.error?.response?.status === 404) {
          setPublishGuard(true)
          setFieldOptions([])
        } else {
          throw publishedSettled.error
        }
      } else {
        published = publishedSettled.value
      }

      if (published) {
        const steps = await listFlowSteps(published.id)
        const stepsWithFields = await Promise.all(
          steps.map(async (step) => ({
            ...step,
            fields: await listFieldDefinitions(step.id),
          }))
        )
        options = buildResolvableFieldKeyOptions(stepsWithFields)
        setFieldOptions(options)
      }

      setDetected(mappings.detected_placeholders || [])
      setUnmapped(mappings.unmapped_placeholders || [])
      setIsComplete(!!mappings.is_complete)
      onCompletenessChangeRef.current?.(template.id, !!mappings.is_complete)

      const resolvableKeys = options.map((opt) => opt.value)
      if (canEditMappings) {
        const { selections: next, suggestedKeys: suggested } =
          buildInitialMappingSelections({
            detected: mappings.detected_placeholders || [],
            persistedMappings: mappings.mappings || [],
            resolvableKeys,
          })
        setSelections(next)
        setSuggestedKeys(new Set(suggested))
      } else {
        // Read-only: show persisted mappings only (no unsaved auto-suggest).
        const next = {}
        for (const key of mappings.detected_placeholders || []) {
          next[key] = ''
        }
        for (const row of mappings.mappings || []) {
          if (row.is_mapped && row.placeholder_key && row.field_key) {
            next[row.placeholder_key] = row.field_key
          }
        }
        setSelections(next)
        setSuggestedKeys(new Set())
      }
    } catch (error) {
      setLoadError(
        (await readPlatformErrorDetail(error)) || 'Could not load placeholder mappings'
      )
    } finally {
      setLoading(false)
    }
  }, [canEditMappings, documentTypeId, template.id])

  useEffect(() => {
    load()
  }, [load])

  const mappedCount = useMemo(() => {
    return detected.filter((key) => Boolean(selections[key])).length
  }, [detected, selections])

  const suggestedCount = suggestedKeys.size

  const missingFieldPlaceholders = useMemo(() => {
    const keys = fieldOptions.map((opt) => opt.value)
    return detected.filter((ph) => !suggestFieldKeyForPlaceholder(ph, keys))
  }, [detected, fieldOptions])

  const onSelectChange = (placeholderKey, value) => {
    const nextValue = value || ''
    setSelections((current) => ({
      ...current,
      [placeholderKey]: nextValue,
    }))
    // Any manual edit clears the "suggested" badge for that row.
    setSuggestedKeys((current) => {
      if (!current.has(placeholderKey)) return current
      const next = new Set(current)
      next.delete(placeholderKey)
      return next
    })
  }

  const generateMissingFields = async () => {
    if (!canEditMappings || !hasDraftFlow) return
    setGeneratingFields(true)
    setBulkSummary(null)
    setDuplicateReview(null)
    try {
      const result = await generateFieldsFromPlaceholders(template.id)
      const created = result.created?.length || 0
      const skipped = result.skipped_placeholders?.length || 0
      const possibles = result.possible_duplicates || []
      setBulkSummary({ created, skipped, possibles: possibles.length })
      if (created || skipped || possibles.length) {
        message.success(
          `Created ${created} new field${created === 1 ? '' : 's'}` +
            (skipped ? `, ${skipped} already matched` : '') +
            (possibles.length
              ? `, ${possibles.length} possible duplicate${possibles.length === 1 ? '' : 's'} need review`
              : '')
        )
      }
      // Hold parent refresh (loadBuilder unmounts this panel) until duplicate
      // review is finished — otherwise the modal never appears.
      if (possibles.length) {
        const initial = {}
        for (const row of possibles) {
          // Default: skip (do not create) — admin must opt in per item.
          initial[row.placeholder] = false
        }
        setDuplicateSelections(initial)
        setDuplicateReview(possibles)
        await load()
      } else {
        onDraftFieldsGenerated?.()
        await load()
        if (!created && !skipped) {
          message.info('No new fields to create')
        }
      }
    } catch (error) {
      message.error(
        (await readPlatformErrorDetail(error)) ||
          'Could not generate fields from placeholders'
      )
    } finally {
      setGeneratingFields(false)
    }
  }

  const finishDuplicateReview = async ({ createdCount = 0, skippedAll = false } = {}) => {
    setDuplicateReview(null)
    setDuplicateSelections({})
    if (skippedAll) {
      message.info('Skipped all possible duplicates')
    } else if (createdCount) {
      message.success(
        `Created ${createdCount} reviewed field${createdCount === 1 ? '' : 's'}`
      )
    }
    onDraftFieldsGenerated?.()
    await load()
  }

  const confirmDuplicateReview = async () => {
    if (!duplicateReview?.length) {
      await finishDuplicateReview({ skippedAll: true })
      return
    }
    const toCreate = duplicateReview
      .filter((row) => duplicateSelections[row.placeholder])
      .map((row) => row.placeholder)
    setConfirmingDuplicates(true)
    try {
      if (toCreate.length) {
        const result = await generateFieldsFromPlaceholders(template.id, {
          createPlaceholders: toCreate,
        })
        await finishDuplicateReview({
          createdCount: result.created?.length || 0,
        })
      } else {
        await finishDuplicateReview({ skippedAll: true })
      }
    } catch (error) {
      message.error(
        (await readPlatformErrorDetail(error)) ||
          'Could not create reviewed fields'
      )
    } finally {
      setConfirmingDuplicates(false)
    }
  }

  const save = async () => {
    if (!canEditMappings) return
    setSaving(true)
    setSaveError(null)
    setInvalidKeys([])
    try {
      const payload = detected
        .filter((key) => selections[key])
        .map((placeholder_key) => ({
          placeholder_key,
          field_key: selections[placeholder_key],
        }))
      const result = await savePlaceholderMappings(template.id, payload)
      setDetected(result.detected_placeholders || [])
      setUnmapped(result.unmapped_placeholders || [])
      setIsComplete(!!result.is_complete)
      onCompletenessChange?.(template.id, !!result.is_complete)

      // After save, everything in selections that is mapped is persisted —
      // clear suggested badges.
      const next = {}
      for (const key of result.detected_placeholders || []) {
        next[key] = ''
      }
      for (const row of result.mappings || []) {
        if (row.is_mapped) next[row.placeholder_key] = row.field_key
      }
      setSelections(next)
      setSuggestedKeys(new Set())

      message.success(
        result.is_complete
          ? 'Mappings saved — template is complete'
          : 'Mappings saved'
      )
    } catch (error) {
      const detail = error.response?.data?.detail
      const invalid = Array.isArray(detail?.invalid_field_keys)
        ? detail.invalid_field_keys
        : []
      setInvalidKeys(invalid)
      setSaveError(
        (await readPlatformErrorDetail(error)) ||
          'Could not save mappings (backend rejected the batch)'
      )
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: 240 }}>
        <Spin description="Loading mappings..." />
      </div>
    )
  }

  return (
    <div>
      <Button
        type="text"
        icon={<ArrowLeftOutlined />}
        onClick={onBack}
        style={{ marginBottom: 12 }}
      >
        Back to documents
      </Button>

      <Space align="center" style={{ marginBottom: 8 }} wrap>
        <Title level={4} style={{ margin: 0 }}>
          {canEditMappings ? 'Map placeholders' : 'Document'}
        </Title>
        <Tag color={isComplete ? 'green' : 'orange'}>
          {canEditMappings
            ? isComplete
              ? 'Complete'
              : 'Incomplete'
            : isComplete
              ? 'Ready'
              : 'Not ready'}
        </Tag>
      </Space>
      <Text strong style={{ display: 'block' }}>
        {String(template.display_name || '').trim() || basename(template.docx_filename)}
      </Text>
      <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
        {basename(template.docx_filename)}
      </Text>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        {canEditMappings
          ? `${mappedCount} of ${detected.length} placeholders mapped${
              unmapped.length ? ` · ${unmapped.length} still unmapped` : ''
            }${
              suggestedCount
                ? ` · ${suggestedCount} suggested (unsaved — review and Save)`
                : ''
            }`
          : isComplete
            ? 'This document is ready to generate.'
            : 'This document isn’t ready to generate yet.'}
      </Text>

      {!canEditMappings && !loadError && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="View only"
          description="Ask an organization admin if something looks wrong or isn’t ready."
        />
      )}

      {loadError && (
        <Alert type="error" showIcon message={loadError} style={{ marginBottom: 16 }} />
      )}

      {publishGuard && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Publish a flow first before mapping placeholders"
          description={
            canEditMappings
              ? 'Mapping options come from the published flow’s field definitions and fixed step outputs (country.*, party.*). Create and publish this document’s Flow (or the shared flow if it has none yet), then return here.'
              : 'Mapping options come from the published flow. Ask an organization admin to publish a flow before mapping can be completed.'
          }
        />
      )}

      {!publishGuard && !loadError && !fieldOptions.length && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Published flow has no mappable field keys"
          description={
            canEditMappings
              ? 'Open this document’s Flow, click Edit (opens a draft). On each text/number/date/dropdown/rich-text/custom-fields step, use Add field and set a field_key (lowercase, e.g. company_name). Or add a Country / Party selector. Then Publish and return here.'
              : 'Ask an organization admin to add field keys on this document’s Flow and publish before mapping can be completed.'
          }
        />
      )}

      {canEditMappings && !loadError && missingFieldPlaceholders.length > 0 && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={`${missingFieldPlaceholders.length} placeholder${
            missingFieldPlaceholders.length === 1 ? '' : 's'
          } have no matching flow field`}
          description={
            <Space direction="vertical" size={10} style={{ width: '100%' }}>
              <Text type="secondary">
                Generate draft FieldDefinitions from this template’s placeholders
                (review in Flow Builder, then Publish — mapping is not auto-saved).
              </Text>
              <Space wrap>
                <Tooltip
                  title={
                    hasDraftFlow
                      ? ''
                      : 'Create or edit a draft flow on the Flow tab first'
                  }
                >
                  <Button
                    icon={<PlayCircleOutlined />}
                    loading={generatingFields}
                    disabled={!hasDraftFlow}
                    onClick={generateMissingFields}
                  >
                    Generate missing fields from this template
                  </Button>
                </Tooltip>
                {typeof onGoToFlow === 'function' && (
                  <Button type="link" onClick={onGoToFlow} style={{ paddingInline: 0 }}>
                    Go to Flow Builder to review
                  </Button>
                )}
              </Space>
            </Space>
          }
        />
      )}

      {canEditMappings && bulkSummary && (
        <Alert
          type="success"
          showIcon
          style={{ marginBottom: 16 }}
          closable
          onClose={() => setBulkSummary(null)}
          message={`Created ${bulkSummary.created} new fields${
            bulkSummary.skipped
              ? `, ${bulkSummary.skipped} already existed`
              : ''
          }${
            bulkSummary.possibles
              ? `, ${bulkSummary.possibles} possible duplicate${
                  bulkSummary.possibles === 1 ? '' : 's'
                } held for review`
              : ''
          }`}
          description={
            <Space direction="vertical" size={6}>
              <Text>
                Review the new fields on the Flow tab, then Publish. Return here so
                auto-suggest can pre-fill matches — then click Save mappings.
              </Text>
              {typeof onGoToFlow === 'function' && (
                <Button type="primary" size="small" onClick={onGoToFlow}>
                  Go to Flow Builder to review
                </Button>
              )}
            </Space>
          }
        />
      )}

      {canEditMappings && suggestedCount > 0 && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Auto-suggested matches are pre-selected but not saved"
          description="Placeholders that exactly match a flow field key (case-insensitive) are filled in with a Suggested tag. Review them, then click Save mappings to persist."
        />
      )}

      {saveError && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message={saveError}
          description={
            invalidKeys.length
              ? `Invalid field keys rejected by the server: ${invalidKeys.join(', ')}`
              : undefined
          }
        />
      )}

      {!loadError && !detected.length && (
        <Alert
          type="info"
          showIcon
          message="No placeholders detected in this template"
          style={{ marginBottom: 16 }}
        />
      )}

      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        {detected.map((placeholderKey) => {
          const value = selections[placeholderKey]
          const isSuggested = suggestedKeys.has(placeholderKey)
          const stillOpen = !value

          return (
            <Card key={placeholderKey} size="small" style={{ borderRadius: 12 }}>
              <div
                style={{
                  display: 'flex',
                  gap: 16,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ minWidth: 0, flex: '1 1 160px' }}>
                  <Text code style={{ wordBreak: 'break-all' }}>{`{{${placeholderKey}}}`}</Text>
                  <div>
                    {stillOpen ? (
                      <Tag color="orange" style={{ marginTop: 6 }}>
                        Unmapped
                      </Tag>
                    ) : isSuggested ? (
                      <Tag color="blue" style={{ marginTop: 6 }}>
                        Suggested
                      </Tag>
                    ) : (
                      <Tag color="green" style={{ marginTop: 6 }}>
                        Mapped
                      </Tag>
                    )}
                  </div>
                </div>
                <Select
                  style={{ flex: '1 1 200px', minWidth: 0, width: '100%' }}
                  placeholder={
                    publishGuard
                      ? 'Publish a flow first'
                      : fieldOptions.length
                        ? 'Select field key'
                        : 'No resolvable keys on published flow'
                  }
                  disabled={
                    !canEditMappings || publishGuard || !fieldOptions.length
                  }
                  allowClear={canEditMappings}
                  showSearch
                  optionFilterProp="label"
                  value={value || undefined}
                  onChange={(next) => onSelectChange(placeholderKey, next)}
                  options={fieldOptions}
                />
              </div>
            </Card>
          )
        })}
      </Space>

      {canEditMappings && (
        <Button
          type="primary"
          icon={<SaveOutlined />}
          loading={saving}
          disabled={publishGuard || !detected.length}
          onClick={save}
          style={{ marginTop: 16 }}
        >
          Save mappings
        </Button>
      )}

      <Modal
        title="Possible duplicate fields"
        open={Boolean(duplicateReview?.length)}
        onCancel={() => {
          if (!confirmingDuplicates) {
            void finishDuplicateReview({ skippedAll: true })
          }
        }}
        okText="Create selected"
        cancelText="Skip all"
        confirmLoading={confirmingDuplicates}
        onOk={confirmDuplicateReview}
        destroyOnHidden
        width={560}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          These placeholders look similar to fields already on the draft flow.
          Clear matches were created already. Check only the ones you still want
          as separate fields.
        </Text>
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          {(duplicateReview || []).map((row) => (
            <Card key={row.placeholder} size="small" style={{ borderRadius: 10 }}>
              <Checkbox
                checked={!!duplicateSelections[row.placeholder]}
                onChange={(e) =>
                  setDuplicateSelections((current) => ({
                    ...current,
                    [row.placeholder]: e.target.checked,
                  }))
                }
              >
                <Text>
                  Create <Text code>{row.proposed_field_key}</Text>
                  {' from '}
                  <Text code>{`{{${row.placeholder}}}`}</Text>
                </Text>
              </Checkbox>
              <div style={{ marginTop: 6, marginLeft: 24 }}>
                <Text type="secondary">
                  Looks similar to:{' '}
                  {(row.similar_field_keys || []).map((k) => (
                    <Tag key={k} style={{ marginInlineEnd: 4 }}>
                      {k}
                    </Tag>
                  ))}
                </Text>
              </div>
            </Card>
          ))}
        </Space>
      </Modal>
    </div>
  )
}
