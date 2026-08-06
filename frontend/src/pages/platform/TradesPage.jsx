import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Checkbox,
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
  createOrgTrade,
  createOrgTradeIndustry,
  deleteOrgTrade,
  deleteOrgTradeIndustry,
  generateIndustryTradeBatch,
  generateOrgTradeSynonyms,
  listOrgTradeIndustries,
  listOrgTrades,
  readPlatformErrorDetail,
  seedOrgTradesFromLegacy,
  suggestIndustryTrades,
  updateOrgTrade,
  updateOrgTradeIndustry,
} from '../../api/platformClient'
import { usePlatformAuth } from '../../context/PlatformAuthContext'
import { useAppMessage } from '../../hooks/useAppMessage'
import { useAsyncAction } from '../../hooks/useAsyncAction'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { usePlatformPageChrome } from '../../components/PlatformLayout'
import AsyncBusyBar from '../../components/ui/AsyncBusyBar'
import TradeCascadeForm from '../../components/platform/TradeCascadeForm'

const { Title, Paragraph, Text } = Typography

function synonymsToText(synonyms) {
  if (!Array.isArray(synonyms) || !synonyms.length) return ''
  return synonyms.join(', ')
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
  const [industryForm] = Form.useForm()
  const cascadeRef = useRef(null)
  const { runNamed, isLoading } = useAsyncAction()
  const generatingSynonyms = isLoading('generateSynonyms')

  // Bulk industry generate
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkIndustryId, setBulkIndustryId] = useState(undefined)
  const [bulkCount, setBulkCount] = useState(30)
  const [bulkSuggesting, setBulkSuggesting] = useState(false)
  const [bulkSuggestions, setBulkSuggestions] = useState(null)
  const [bulkSelected, setBulkSelected] = useState([])
  const [bulkMaxPerRun, setBulkMaxPerRun] = useState(10)
  const [bulkGenerating, setBulkGenerating] = useState(false)
  const [bulkSummary, setBulkSummary] = useState(null)

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
    setModalOpen(true)
  }

  const openEdit = (row) => {
    setEditing(row)
    setModalOpen(true)
  }

  const saveTrade = async () => {
    const payload = cascadeRef.current?.getPayload?.()
    if (!payload) {
      message.error('Form not ready')
      return
    }
    if (payload.error) {
      message.warning(payload.error)
      return
    }
    if (cascadeRef.current?.isBusy?.()) {
      message.warning('Wait for the current AI/industry action to finish')
      return
    }
    try {
      setSaving(true)
      const body = {
        name: payload.name,
        duties_text: payload.duties_text ?? '',
        industry_id: payload.industry_id ?? null,
        synonyms: Array.isArray(payload.synonyms) ? payload.synonyms : [],
      }
      if (payload.mode === 'update') {
        await updateOrgTrade(payload.tradeId, body)
        message.success('Trade updated')
      } else {
        await createOrgTrade(body)
        message.success('Trade created')
      }
      setModalOpen(false)
      setEditing(null)
      await loadAll()
    } catch (error) {
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

  const openBulkGenerate = () => {
    setBulkOpen(true)
    setBulkSuggestions(null)
    setBulkSelected([])
    setBulkSummary(null)
    setBulkIndustryId(industries[0]?.id)
  }

  const runBulkSuggest = async () => {
    if (bulkIndustryId == null) {
      message.warning('Select an industry')
      return
    }
    setBulkSuggesting(true)
    setBulkSummary(null)
    try {
      const result = await suggestIndustryTrades({
        industry_id: bulkIndustryId,
        count: bulkCount,
      })
      setBulkSuggestions(result)
      setBulkSelected(
        (result.suggestions || [])
          .filter((s) => !s.already_exists)
          .map((s) => s.name)
      )
    } catch (error) {
      message.error(
        (await readPlatformErrorDetail(error)) || 'Could not suggest trades'
      )
    } finally {
      setBulkSuggesting(false)
    }
  }

  const runBulkGenerate = async () => {
    if (bulkIndustryId == null || !bulkSelected.length) {
      message.warning('Select at least one new trade name to generate')
      return
    }
    setBulkGenerating(true)
    try {
      const result = await generateIndustryTradeBatch({
        industry_id: bulkIndustryId,
        trade_names: bulkSelected,
        max_trades: bulkMaxPerRun,
      })
      setBulkSummary(result)
      if (result.created > 0) {
        message.success(
          result.remaining_names?.length
            ? `Created ${result.created} trades (${result.remaining_names.length} remaining — run again to continue)`
            : `Created ${result.created} trade${result.created === 1 ? '' : 's'}`
        )
        await loadAll()
        // Drop created names from selection; keep remaining for continue
        if (result.remaining_names?.length) {
          setBulkSelected(result.remaining_names)
          setBulkSuggestions((prev) =>
            prev
              ? {
                  ...prev,
                  suggestions: (prev.suggestions || []).map((s) =>
                    result.remaining_names.includes(s.name)
                      ? s
                      : { ...s, already_exists: true }
                  ),
                }
              : prev
          )
        } else {
          setBulkSelected([])
        }
      } else {
        message.warning('No trades were created')
      }
    } catch (error) {
      message.error(
        (await readPlatformErrorDetail(error)) || 'Could not generate industry trades'
      )
    } finally {
      setBulkGenerating(false)
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
          <Button onClick={openBulkGenerate} disabled={!industries.length}>
            Generate all trades for industry
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
        active={generatingSynonyms || bulkGenerating}
        label={
          bulkGenerating
            ? 'Generating industry trades with AI… stay on this page.'
            : 'Generating synonyms with AI… stay on this page until it finishes.'
        }
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
              Checked {synonymSummary.total_checked}, updated{' '}
              {synonymSummary.updated}, skipped (already had){' '}
              {synonymSummary.skipped_already_had}, failed{' '}
              {synonymSummary.failed?.length || 0}
              {synonymSummary.remaining_without_synonyms
                ? `, remaining empty ${synonymSummary.remaining_without_synonyms}`
                : ''}
              .
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
        onCancel={() => {
          setModalOpen(false)
          setEditing(null)
        }}
        onOk={saveTrade}
        confirmLoading={saving}
        okText="Save"
        destroyOnHidden
        width={isMobile ? '100%' : 980}
      >
        <Paragraph type="secondary" style={{ marginTop: 0 }}>
          Industry → Trade → Synonyms → Duties. For a new trade, Generate with AI
          fills synonyms and duties for review before Save.
        </Paragraph>
        <TradeCascadeForm
          key={editing ? `edit-${editing.id}` : 'create'}
          ref={cascadeRef}
          industries={industries}
          trades={trades}
          initialTrade={editing}
          onIndustriesChanged={loadAll}
          disabled={saving}
        />
      </Modal>

      <Modal
        title="Generate all trades for an industry"
        open={bulkOpen}
        onCancel={() => setBulkOpen(false)}
        footer={null}
        destroyOnHidden
        width={640}
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="AI best-effort list"
          description="Suggestions are a common-title shortlist — not an authoritative worldwide registry. Review and deselect before generating."
        />
        <Space wrap style={{ marginBottom: 12 }}>
          <Select
            style={{ minWidth: 200 }}
            placeholder="Industry"
            options={industryOptions}
            value={bulkIndustryId}
            onChange={(v) => {
              setBulkIndustryId(v)
              setBulkSuggestions(null)
              setBulkSelected([])
              setBulkSummary(null)
            }}
            disabled={bulkSuggesting || bulkGenerating}
          />
          <InputNumber
            min={5}
            max={50}
            value={bulkCount}
            onChange={setBulkCount}
            disabled={bulkSuggesting || bulkGenerating}
          />
          <Button
            type="primary"
            loading={bulkSuggesting}
            disabled={bulkGenerating || bulkIndustryId == null}
            onClick={runBulkSuggest}
          >
            Suggest trades
          </Button>
        </Space>

        {bulkSuggestions ? (
          <div>
            <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
              {bulkSuggestions.disclaimer ||
                'AI best-effort common list — not an authoritative registry.'}
            </Text>
            <Checkbox.Group
              style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
              value={bulkSelected}
              onChange={setBulkSelected}
              disabled={bulkGenerating}
              options={(bulkSuggestions.suggestions || []).map((s) => ({
                value: s.name,
                label: s.already_exists
                  ? `${s.name} (already have this)`
                  : s.name,
                disabled: s.already_exists,
              }))}
            />
            <Space wrap style={{ marginTop: 16 }} align="center">
              <Text type="secondary">Max per run</Text>
              <InputNumber
                min={1}
                max={30}
                value={bulkMaxPerRun}
                onChange={setBulkMaxPerRun}
                disabled={bulkGenerating}
                style={{ width: 72 }}
              />
              <Button
                type="primary"
                loading={bulkGenerating}
                disabled={!bulkSelected.length || bulkGenerating}
                onClick={runBulkGenerate}
              >
                Generate selected ({bulkSelected.length})
              </Button>
            </Space>
          </div>
        ) : null}

        {bulkSummary ? (
          <Alert
            style={{ marginTop: 16 }}
            type={bulkSummary.failed?.length ? 'warning' : 'success'}
            showIcon
            message={`Created ${bulkSummary.created}${
              bulkSummary.remaining_names?.length
                ? `, ${bulkSummary.remaining_names.length} remaining`
                : ''
            }, failed ${bulkSummary.failed?.length || 0}`}
            description={
              bulkSummary.failed?.length ? (
                <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                  {bulkSummary.failed.slice(0, 8).map((row) => (
                    <li key={row.name}>
                      {row.name}: {row.reason}
                    </li>
                  ))}
                </ul>
              ) : null
            }
          />
        ) : null}
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
