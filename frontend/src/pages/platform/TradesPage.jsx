import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Collapse,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
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
  checkOrgTradeName,
  createOrgTrade,
  createOrgTradeIndustry,
  deleteOrgTrade,
  deleteOrgTradeIndustry,
  generateNewOrgTrade,
  generateOrgTradeSynonyms,
  listOrgTradeIndustries,
  listOrgTrades,
  readPlatformErrorDetail,
  seedOrgTradesFromLegacy,
  updateOrgTrade,
  updateOrgTradeIndustry,
} from '../../api/platformClient'
import { usePlatformAuth } from '../../context/PlatformAuthContext'
import { useAppMessage } from '../../hooks/useAppMessage'
import { useAsyncAction } from '../../hooks/useAsyncAction'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { usePlatformPageChrome } from '../../components/PlatformLayout'
import AsyncBusyBar from '../../components/ui/AsyncBusyBar'

const { Title, Paragraph, Text } = Typography
const { TextArea } = Input

function synonymsToText(synonyms) {
  if (!Array.isArray(synonyms) || !synonyms.length) return ''
  return synonyms.join(', ')
}

function textToSynonyms(text) {
  return String(text || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export default function TradesPage() {
  const message = useAppMessage()
  const { isOrgAdmin } = usePlatformAuth()
  const { isMobile } = useBreakpoint()
  const isAdmin = isOrgAdmin

  const [loading, setLoading] = useState(true)
  const [trades, setTrades] = useState([])
  const [industries, setIndustries] = useState([])
  const [loadError, setLoadError] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [industryModalOpen, setIndustryModalOpen] = useState(false)
  const [editingIndustry, setEditingIndustry] = useState(null)
  const [savingIndustry, setSavingIndustry] = useState(false)
  const [synonymSummary, setSynonymSummary] = useState(null)
  const [synonymMaxTrades, setSynonymMaxTrades] = useState(20)
  const [nameCheck, setNameCheck] = useState(null)
  const [nameCheckLoading, setNameCheckLoading] = useState(false)
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiDraftReady, setAiDraftReady] = useState(false)
  const [confirmDifferent, setConfirmDifferent] = useState(false)
  const checkTimerRef = useRef(null)
  const [form] = Form.useForm()
  const [industryForm] = Form.useForm()
  const watchedName = Form.useWatch('name', form)
  const watchedIndustryId = Form.useWatch('industry_id', form)
  const { runNamed, isLoading } = useAsyncAction()
  const generatingSynonyms = isLoading('generateSynonyms')

  const loadAll = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [tradeRows, industryRows] = await Promise.all([
        listOrgTrades(),
        listOrgTradeIndustries(),
      ])
      setTrades(tradeRows || [])
      setIndustries(industryRows || [])
    } catch (error) {
      setLoadError((await readPlatformErrorDetail(error)) || 'Could not load trades')
      setTrades([])
      setIndustries([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const industryOptions = useMemo(
    () =>
      (industries || []).map((row) => ({
        value: row.id,
        label: row.name,
      })),
    [industries]
  )

  const groupedSections = useMemo(() => {
    const byId = new Map((industries || []).map((i) => [i.id, i.name]))
    const groups = new Map()
    for (const trade of trades || []) {
      const key =
        trade.industry_id != null && byId.has(trade.industry_id)
          ? String(trade.industry_id)
          : 'ungrouped'
      const title =
        key === 'ungrouped'
          ? 'Ungrouped'
          : byId.get(trade.industry_id) || 'Ungrouped'
      if (!groups.has(key)) {
        groups.set(key, { key, title, trades: [] })
      }
      groups.get(key).trades.push(trade)
    }
    const ordered = []
    for (const ind of industries || []) {
      const g = groups.get(String(ind.id))
      if (g) ordered.push(g)
    }
    if (groups.has('ungrouped')) ordered.push(groups.get('ungrouped'))
    return ordered
  }, [trades, industries])

  const openCreate = () => {
    setEditing(null)
    setNameCheck(null)
    setAiDraftReady(false)
    setConfirmDifferent(false)
    setAiGenerating(false)
    form.setFieldsValue({
      name: '',
      duties_text: '',
      industry_id: undefined,
      synonyms_text: '',
    })
    setModalOpen(true)
  }

  const openEdit = (row) => {
    setEditing(row)
    setNameCheck(null)
    setAiDraftReady(false)
    setConfirmDifferent(false)
    form.setFieldsValue({
      name: row.name,
      duties_text: row.duties_text || '',
      industry_id: row.industry_id ?? undefined,
      synonyms_text: synonymsToText(row.synonyms),
    })
    setModalOpen(true)
  }

  // Debounced existence check while adding a trade
  useEffect(() => {
    if (!modalOpen || editing) {
      setNameCheck(null)
      setNameCheckLoading(false)
      return undefined
    }
    const name = String(watchedName || '').trim()
    const industryId = watchedIndustryId
    if (checkTimerRef.current) clearTimeout(checkTimerRef.current)
    if (!name || industryId == null) {
      setNameCheck(null)
      setNameCheckLoading(false)
      return undefined
    }
    setNameCheckLoading(true)
    checkTimerRef.current = setTimeout(async () => {
      try {
        const result = await checkOrgTradeName({
          industry_id: industryId,
          name,
        })
        setNameCheck(result)
        setConfirmDifferent(false)
      } catch {
        setNameCheck(null)
      } finally {
        setNameCheckLoading(false)
      }
    }, 350)
    return () => {
      if (checkTimerRef.current) clearTimeout(checkTimerRef.current)
    }
  }, [modalOpen, editing, watchedName, watchedIndustryId])

  const generateTradeWithAi = async () => {
    try {
      const values = await form.validateFields(['name', 'industry_id'])
      setAiGenerating(true)
      const draft = await generateNewOrgTrade({
        industry_id: values.industry_id,
        name: String(values.name || '').trim(),
      })
      form.setFieldsValue({
        name: draft.name,
        industry_id: draft.industry_id,
        duties_text: draft.duties_text || '',
        synonyms_text: synonymsToText(draft.synonyms),
      })
      setAiDraftReady(true)
      message.success('AI draft ready — review and edit before saving')
    } catch (error) {
      if (error?.errorFields) return
      message.error(
        (await readPlatformErrorDetail(error)) || 'Could not generate trade with AI'
      )
    } finally {
      setAiGenerating(false)
    }
  }

  const saveTrade = async () => {
    try {
      const values = await form.validateFields()
      if (!editing && nameCheck?.exact_match) {
        message.warning('This trade already exists — open it instead of creating a duplicate')
        return
      }
      if (
        !editing &&
        nameCheck?.similar_matches?.length &&
        !confirmDifferent &&
        !aiDraftReady
      ) {
        message.warning(
          'Similar trades found — confirm this is a different trade, or open a suggestion'
        )
        return
      }
      setSaving(true)
      const payload = {
        name: String(values.name || '').trim(),
        duties_text: values.duties_text ?? '',
        industry_id: values.industry_id ?? null,
        synonyms: textToSynonyms(values.synonyms_text),
      }
      if (editing) {
        await updateOrgTrade(editing.id, payload)
        message.success('Trade updated')
      } else {
        await createOrgTrade(payload)
        message.success('Trade created')
      }
      setModalOpen(false)
      await loadAll()
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
      await loadAll()
    } catch (error) {
      message.error((await readPlatformErrorDetail(error)) || 'Could not delete trade')
    }
  }

  const openCreateIndustry = () => {
    setEditingIndustry(null)
    industryForm.setFieldsValue({ name: '' })
    setIndustryModalOpen(true)
  }

  const openEditIndustry = (row) => {
    setEditingIndustry(row)
    industryForm.setFieldsValue({ name: row.name })
    setIndustryModalOpen(true)
  }

  const saveIndustry = async () => {
    try {
      const values = await industryForm.validateFields()
      setSavingIndustry(true)
      const payload = { name: String(values.name || '').trim() }
      if (editingIndustry) {
        await updateOrgTradeIndustry(editingIndustry.id, payload)
        message.success('Industry updated')
      } else {
        await createOrgTradeIndustry(payload)
        message.success('Industry created')
      }
      setIndustryModalOpen(false)
      await loadAll()
    } catch (error) {
      if (error?.errorFields) return
      message.error(
        (await readPlatformErrorDetail(error)) || 'Could not save industry'
      )
    } finally {
      setSavingIndustry(false)
    }
  }

  const removeIndustry = async (row) => {
    try {
      await deleteOrgTradeIndustry(row.id)
      message.success(`Deleted industry “${row.name}” (trades kept, ungrouped)`)
      await loadAll()
    } catch (error) {
      message.error(
        (await readPlatformErrorDetail(error)) || 'Could not delete industry'
      )
    }
  }

  const seedFromLegacy = async () => {
    setSeeding(true)
    try {
      const result = await seedOrgTradesFromLegacy()
      message.success(
        `Seeded ${result.created} trade${result.created === 1 ? '' : 's'}` +
          (result.industries_created
            ? `, ${result.industries_created} industr${
                result.industries_created === 1 ? 'y' : 'ies'
              }`
            : '') +
          (result.skipped ? ` (${result.skipped} trades already present)` : '')
      )
      await loadAll()
    } catch (error) {
      message.error(
        (await readPlatformErrorDetail(error)) || 'Could not seed from legacy trade bank'
      )
    } finally {
      setSeeding(false)
    }
  }

  const generateSynonyms = async () => {
    setSynonymSummary(null)
    try {
      const max =
        synonymMaxTrades != null && synonymMaxTrades !== ''
          ? Number(synonymMaxTrades)
          : null
      const result = await runNamed('generateSynonyms', () =>
        generateOrgTradeSynonyms({ max_trades: max })
      )
      setSynonymSummary(result)
      if (result.updated > 0) {
        const rem = result.remaining_without_synonyms || 0
        message.success(
          rem > 0
            ? `Generated synonyms for ${result.updated} trade${
                result.updated === 1 ? '' : 's'
              } (${rem} still empty — run again to continue)`
            : `Generated synonyms for ${result.updated} trade${
                result.updated === 1 ? '' : 's'
              }`
        )
        await loadAll()
      } else if (result.skipped_already_had === result.total_checked) {
        message.info('All trades already have synonyms')
      } else {
        message.warning('No synonyms were generated')
      }
    } catch (error) {
      const detail =
        (await readPlatformErrorDetail(error)) ||
        'Could not generate synonyms with AI'
      message.error(detail)
    }
  }

  const header = useMemo(
    () => (
      <>
        <Title level={isMobile ? 4 : 3} style={{ margin: 0 }}>
          Trade Bank
        </Title>
        <Paragraph type="secondary" style={{ margin: 0 }}>
          Occupations grouped by industry, with optional synonyms for Generate
          search. One bank per organization.
        </Paragraph>
      </>
    ),
    [isMobile]
  )

  usePlatformPageChrome({ header })

  const tradeColumns = [
    {
      title: 'Trade',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
    },
    {
      title: 'Synonyms',
      dataIndex: 'synonyms',
      key: 'synonyms',
      ellipsis: true,
      width: isMobile ? 100 : 180,
      render: (synonyms) => (
        <Text type="secondary">{synonymsToText(synonyms) || '—'}</Text>
      ),
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
          <Button icon={<PlusOutlined />} onClick={openCreateIndustry}>
            Add industry
          </Button>
          <Popconfirm
            title="Seed from legacy trade bank?"
            description="Copies industries, occupations, and duties. Existing names are skipped."
            okText="Seed"
            onConfirm={seedFromLegacy}
          >
            <Button icon={<ImportOutlined />} loading={seeding}>
              Seed from legacy trade bank
            </Button>
          </Popconfirm>
          <Space wrap align="center">
            <Text type="secondary">Max trades / run</Text>
            <InputNumber
              min={1}
              max={500}
              value={synonymMaxTrades}
              onChange={setSynonymMaxTrades}
              disabled={generatingSynonyms}
              style={{ width: 88 }}
            />
            <Popconfirm
              title="Generate synonyms with AI?"
              description="Fills empty synonyms via Groq (chunked by Max trades / run). Already-filled trades are skipped."
              okText="Generate"
              onConfirm={generateSynonyms}
            >
              <Button loading={generatingSynonyms} disabled={generatingSynonyms}>
                Generate synonyms with AI
              </Button>
            </Popconfirm>
          </Space>
        </Space>
      ) : null}

      <AsyncBusyBar
        active={generatingSynonyms}
        label="Generating synonyms with AI… stay on this page until it finishes."
      />

      {synonymSummary ? (
        <Alert
          type={synonymSummary.failed?.length ? 'warning' : 'success'}
          showIcon
          closable
          onClose={() => setSynonymSummary(null)}
          style={{ marginBottom: 16 }}
          message="Synonym generation finished"
          description={
            <div>
              <div>
                Checked {synonymSummary.total_checked}, updated{' '}
                {synonymSummary.updated}, skipped (already had){' '}
                {synonymSummary.skipped_already_had}, failed{' '}
                {synonymSummary.failed?.length || 0}
                {synonymSummary.remaining_without_synonyms
                  ? `, remaining empty ${synonymSummary.remaining_without_synonyms}`
                  : ''}
                .
              </div>
              {synonymSummary.failed?.length ? (
                <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                  {synonymSummary.failed.slice(0, 8).map((row) => (
                    <li key={row.trade_id}>
                      {row.name}: {row.reason}
                    </li>
                  ))}
                  {synonymSummary.failed.length > 8 ? (
                    <li>…and {synonymSummary.failed.length - 8} more</li>
                  ) : null}
                </ul>
              ) : null}
            </div>
          }
        />
      ) : null}

      {isAdmin && industries.length ? (
        <Card
          size="small"
          title="Industries"
          style={{ borderRadius: 16, marginBottom: 16 }}
        >
          <Space wrap>
            {industries.map((ind) => (
              <Space key={ind.id} size={4}>
                <Text>{ind.name}</Text>
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  aria-label={`Rename ${ind.name}`}
                  onClick={() => openEditIndustry(ind)}
                />
                <Popconfirm
                  title="Delete this industry?"
                  description="Trades stay; they become ungrouped."
                  okText="Delete"
                  okType="danger"
                  onConfirm={() => removeIndustry(ind)}
                >
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    aria-label={`Delete ${ind.name}`}
                  />
                </Popconfirm>
              </Space>
            ))}
          </Space>
        </Card>
      ) : null}

      <Card style={{ borderRadius: 16 }}>
        {!trades.length ? (
          <Empty description="No trades yet. Seed from legacy or add one." />
        ) : (
          <Collapse
            defaultActiveKey={groupedSections.map((g) => g.key)}
            items={groupedSections.map((group) => ({
              key: group.key,
              label: `${group.title} (${group.trades.length})`,
              children: (
                <Table
                  rowKey="id"
                  columns={tradeColumns}
                  dataSource={group.trades}
                  pagination={
                    group.trades.length > 20
                      ? { pageSize: 20, showSizeChanger: true }
                      : false
                  }
                  size={isMobile ? 'small' : 'middle'}
                />
              ),
            }))}
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
        okButtonProps={{
          disabled: Boolean(!editing && nameCheck?.exact_match) || aiGenerating,
        }}
        destroyOnHidden
        width={560}
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item
            name="industry_id"
            label="Industry"
            rules={
              editing
                ? []
                : [{ required: true, message: 'Select an industry first' }]
            }
          >
            <Select
              allowClear={Boolean(editing)}
              placeholder="Select industry"
              options={industryOptions}
              disabled={aiGenerating}
            />
          </Form.Item>
          <Form.Item
            name="name"
            label="Trade name"
            rules={[{ required: true, message: 'Name is required' }]}
            extra={
              !editing && nameCheckLoading ? (
                <Text type="secondary">Checking for existing trades…</Text>
              ) : null
            }
          >
            <Input
              placeholder="Building Inspector / Certifier"
              disabled={aiGenerating}
            />
          </Form.Item>

          {!editing && nameCheck?.exact_match ? (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              message={`This trade already exists in ${
                nameCheck.exact_match.industry_name || 'this industry'
              }: ${nameCheck.exact_match.name}`}
              action={
                <Button
                  size="small"
                  type="primary"
                  onClick={() => openEdit(nameCheck.exact_match)}
                >
                  Open existing
                </Button>
              }
            />
          ) : null}

          {!editing &&
          !nameCheck?.exact_match &&
          nameCheck?.similar_matches?.length ? (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message="Did you mean one of these?"
              description={
                <div>
                  <ul style={{ margin: '8px 0', paddingLeft: 18 }}>
                    {nameCheck.similar_matches.slice(0, 5).map((row) => (
                      <li key={row.trade.id}>
                        <Button
                          type="link"
                          size="small"
                          style={{ padding: 0, height: 'auto' }}
                          onClick={() => openEdit(row.trade)}
                        >
                          {row.trade.name}
                        </Button>
                        <Text type="secondary">
                          {' '}
                          (matched on {row.matched_on})
                        </Text>
                      </li>
                    ))}
                  </ul>
                  <Button
                    size="small"
                    type={confirmDifferent ? 'primary' : 'default'}
                    onClick={() => setConfirmDifferent(true)}
                  >
                    {confirmDifferent
                      ? 'Confirmed — different trade'
                      : 'This is a different trade'}
                  </Button>
                </div>
              }
            />
          ) : null}

          {!editing &&
          !nameCheck?.exact_match &&
          String(watchedName || '').trim() &&
          watchedIndustryId != null &&
          !nameCheckLoading ? (
            <Space style={{ marginBottom: 16 }} wrap>
              <Button
                onClick={generateTradeWithAi}
                loading={aiGenerating}
                disabled={
                  aiGenerating ||
                  (nameCheck?.similar_matches?.length && !confirmDifferent)
                }
              >
                Generate this trade with AI
              </Button>
              {aiDraftReady ? (
                <Text type="success">Draft ready — review below, then Save</Text>
              ) : (
                <Text type="secondary">
                  Or fill duties and synonyms yourself
                </Text>
              )}
            </Space>
          ) : null}

          {aiGenerating ? (
            <div style={{ marginBottom: 16, textAlign: 'center' }}>
              <Spin tip="Generating duties and synonyms…" />
            </div>
          ) : null}

          <Form.Item
            name="synonyms_text"
            label="Synonyms"
            extra="Comma-separated alternate names (matched in Generate search)."
          >
            <Input placeholder="Builder, Site inspector" disabled={aiGenerating} />
          </Form.Item>
          <Form.Item name="duties_text" label="Duties / job responsibilities">
            <TextArea
              rows={8}
              placeholder="One duty per line"
              disabled={aiGenerating}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingIndustry ? 'Rename industry' : 'Add industry'}
        open={industryModalOpen}
        onCancel={() => setIndustryModalOpen(false)}
        onOk={saveIndustry}
        confirmLoading={savingIndustry}
        okText="Save"
        destroyOnHidden
      >
        <Form form={industryForm} layout="vertical" requiredMark={false}>
          <Form.Item
            name="name"
            label="Industry name"
            rules={[{ required: true, message: 'Name is required' }]}
          >
            <Input placeholder="Construction" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
