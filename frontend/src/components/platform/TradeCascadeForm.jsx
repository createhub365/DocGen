/**
 * 4-column cascading Add/Edit trade editor:
 * Industry → Trade → Synonyms → Duties
 */
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  Alert,
  AutoComplete,
  Button,
  Col,
  Input,
  Radio,
  Row,
  Select,
  Space,
  Spin,
  Typography,
} from 'antd'
import {
  checkOrgTradeName,
  createOrgTradeIndustry,
  generateNewOrgTrade,
  readPlatformErrorDetail,
} from '../../api/platformClient'
import { useAppMessage } from '../../hooks/useAppMessage'

const { Text, Paragraph } = Typography
const { TextArea } = Input

const colStyle = {
  borderRight: '1px solid var(--border)',
  paddingRight: 12,
  paddingLeft: 4,
  minHeight: 280,
}

const TradeCascadeForm = forwardRef(function TradeCascadeForm(
  {
    industries,
    trades,
    initialTrade,
    onIndustriesChanged,
    onGenerateAllTrades,
    disabled,
  },
  ref
) {
  const message = useAppMessage()
  const [industryId, setIndustryId] = useState(undefined)
  const [industrySearch, setIndustrySearch] = useState('')
  const [addingIndustry, setAddingIndustry] = useState(false)

  const [tradeMode, setTradeMode] = useState('existing')
  const [selectedTradeId, setSelectedTradeId] = useState(undefined)
  const [newTradeName, setNewTradeName] = useState('')
  const [tradeSearch, setTradeSearch] = useState('')

  const [synonyms, setSynonyms] = useState([])
  const [dutiesText, setDutiesText] = useState('')

  const [nameCheck, setNameCheck] = useState(null)
  const [nameCheckLoading, setNameCheckLoading] = useState(false)
  const [confirmDifferent, setConfirmDifferent] = useState(false)
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiDraftReady, setAiDraftReady] = useState(false)
  const checkTimerRef = useRef(null)

  useEffect(() => {
    if (initialTrade) {
      setIndustryId(initialTrade.industry_id ?? undefined)
      setIndustrySearch(initialTrade.industry_name || '')
      setTradeMode('existing')
      setSelectedTradeId(initialTrade.id)
      setNewTradeName('')
      setSynonyms(
        Array.isArray(initialTrade.synonyms) ? [...initialTrade.synonyms] : []
      )
      setDutiesText(initialTrade.duties_text || '')
      setNameCheck(null)
      setAiDraftReady(false)
      setConfirmDifferent(false)
    } else {
      setIndustryId(undefined)
      setIndustrySearch('')
      setTradeMode('new')
      setSelectedTradeId(undefined)
      setNewTradeName('')
      setTradeSearch('')
      setSynonyms([])
      setDutiesText('')
      setNameCheck(null)
      setAiDraftReady(false)
      setConfirmDifferent(false)
    }
  }, [initialTrade])

  const industryOptions = useMemo(() => {
    const q = industrySearch.trim().toLowerCase()
    return (industries || [])
      .filter((row) => !q || row.name.toLowerCase().includes(q))
      .map((row) => ({ value: String(row.id), label: row.name }))
  }, [industries, industrySearch])

  const industryExactMatch = useMemo(() => {
    const q = industrySearch.trim().toLowerCase()
    if (!q) return null
    return (industries || []).find((row) => row.name.toLowerCase() === q) || null
  }, [industries, industrySearch])

  const industryHasFilterHit = industryOptions.length > 0
  const showAddIndustry =
    Boolean(industrySearch.trim()) && !industryExactMatch && !industryHasFilterHit

  const tradesInIndustry = useMemo(() => {
    if (industryId == null) return []
    return (trades || []).filter((t) => t.industry_id === industryId)
  }, [trades, industryId])

  const tradeOptions = useMemo(() => {
    const q = tradeSearch.trim().toLowerCase()
    return tradesInIndustry
      .filter((t) => !q || t.name.toLowerCase().includes(q))
      .map((t) => ({ value: t.id, label: t.name }))
  }, [tradesInIndustry, tradeSearch])

  useEffect(() => {
    if (tradeMode !== 'existing' || selectedTradeId == null) return
    const row = tradesInIndustry.find((t) => t.id === selectedTradeId)
    if (!row) return
    setSynonyms(Array.isArray(row.synonyms) ? [...row.synonyms] : [])
    setDutiesText(row.duties_text || '')
    setAiDraftReady(false)
  }, [tradeMode, selectedTradeId, tradesInIndustry])

  useEffect(() => {
    if (tradeMode !== 'new' || industryId == null) {
      setNameCheck(null)
      setNameCheckLoading(false)
      return undefined
    }
    const name = newTradeName.trim()
    if (checkTimerRef.current) clearTimeout(checkTimerRef.current)
    if (!name) {
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
        if (result?.exact_match) {
          setTradeMode('existing')
          setSelectedTradeId(result.exact_match.id)
          setSynonyms(
            Array.isArray(result.exact_match.synonyms)
              ? [...result.exact_match.synonyms]
              : []
          )
          setDutiesText(result.exact_match.duties_text || '')
          message.info(
            `“${result.exact_match.name}” already exists — switched to Existing`
          )
        }
      } catch {
        setNameCheck(null)
      } finally {
        setNameCheckLoading(false)
      }
    }, 350)
    return () => {
      if (checkTimerRef.current) clearTimeout(checkTimerRef.current)
    }
  }, [tradeMode, industryId, newTradeName, message])

  const handleIndustrySelect = (value) => {
    const id = Number(value)
    setIndustryId(id)
    const row = (industries || []).find((i) => i.id === id)
    setIndustrySearch(row?.name || '')
    setSelectedTradeId(undefined)
    setNewTradeName('')
    setSynonyms([])
    setDutiesText('')
    setNameCheck(null)
    setAiDraftReady(false)
    const count = (trades || []).filter((t) => t.industry_id === id).length
    setTradeMode(count ? 'existing' : 'new')
  }

  const addIndustryFromSearch = async () => {
    const name = industrySearch.trim()
    if (!name) return
    setAddingIndustry(true)
    try {
      const created = await createOrgTradeIndustry({ name })
      await onIndustriesChanged?.()
      setIndustryId(created.id)
      setIndustrySearch(created.name)
      setTradeMode('new')
      setSelectedTradeId(undefined)
      setNewTradeName('')
      setSynonyms([])
      setDutiesText('')
      message.success(`Industry “${created.name}” added`)
    } catch (error) {
      message.error(
        (await readPlatformErrorDetail(error)) || 'Could not add industry'
      )
    } finally {
      setAddingIndustry(false)
    }
  }

  const generateWithAi = async () => {
    if (industryId == null || !newTradeName.trim()) {
      message.warning('Choose industry and enter a new trade name first')
      return
    }
    if (nameCheck?.similar_matches?.length && !confirmDifferent) {
      message.warning('Confirm this is a different trade before generating')
      return
    }
    setAiGenerating(true)
    try {
      // REUSE existing generate-new endpoint unmodified (draft-then-save)
      const draft = await generateNewOrgTrade({
        industry_id: industryId,
        name: newTradeName.trim(),
      })
      setSynonyms(Array.isArray(draft.synonyms) ? [...draft.synonyms] : [])
      setDutiesText(draft.duties_text || '')
      setAiDraftReady(true)
      message.success('AI draft ready — review Synonyms and Duties, then Save')
    } catch (error) {
      message.error(
        (await readPlatformErrorDetail(error)) || 'Could not generate with AI'
      )
    } finally {
      setAiGenerating(false)
    }
  }

  useImperativeHandle(ref, () => ({
    getPayload: () => {
      if (industryId == null) {
        return { error: 'Select an industry' }
      }
      if (tradeMode === 'existing') {
        if (selectedTradeId == null) {
          return { error: 'Select an existing trade' }
        }
        const row = tradesInIndustry.find((t) => t.id === selectedTradeId)
        return {
          mode: 'update',
          tradeId: selectedTradeId,
          name: row?.name || '',
          industry_id: industryId,
          synonyms,
          duties_text: dutiesText,
        }
      }
      const name = newTradeName.trim()
      if (!name) return { error: 'Enter a new trade name' }
      if (nameCheck?.exact_match) {
        return { error: 'This trade already exists — use Existing' }
      }
      if (
        nameCheck?.similar_matches?.length &&
        !confirmDifferent &&
        !aiDraftReady
      ) {
        return {
          error:
            'Similar trades found — confirm this is different, or pick an existing one',
        }
      }
      return {
        mode: 'create',
        name,
        industry_id: industryId,
        synonyms,
        duties_text: dutiesText,
      }
    },
    isBusy: () => aiGenerating || addingIndustry,
  }))

  return (
    <Row gutter={[12, 16]} wrap={false} style={{ overflowX: 'auto' }}>
      <Col flex="0 0 22%" style={colStyle}>
        <Text strong>Industry</Text>
        <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
          Search or add
        </Paragraph>
        <AutoComplete
          style={{ width: '100%' }}
          options={industryOptions}
          value={industrySearch}
          disabled={disabled || aiGenerating}
          onSearch={setIndustrySearch}
          onSelect={handleIndustrySelect}
          onChange={(v) => {
            setIndustrySearch(v)
            if (!v) setIndustryId(undefined)
          }}
          placeholder="Type industry…"
          filterOption={false}
        />
        {showAddIndustry ? (
          <Space direction="vertical" style={{ marginTop: 8 }} size={4}>
            <Text type="warning">Not available</Text>
            <Button
              size="small"
              loading={addingIndustry}
              onClick={addIndustryFromSearch}
              disabled={disabled}
            >
              Add Industry
            </Button>
          </Space>
        ) : null}
        {industryId != null ? (
          <Text type="success" style={{ display: 'block', marginTop: 8 }}>
            Selected
          </Text>
        ) : null}
      </Col>

      <Col flex="0 0 22%" style={colStyle}>
        <Text strong>Trade</Text>
        <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
          Existing or New
        </Paragraph>
        <Radio.Group
          value={tradeMode}
          disabled={disabled || industryId == null || aiGenerating}
          onChange={(e) => {
            setTradeMode(e.target.value)
            setNameCheck(null)
            setAiDraftReady(false)
            if (e.target.value === 'new') {
              setSelectedTradeId(undefined)
              setSynonyms([])
              setDutiesText('')
            }
          }}
          style={{ marginBottom: 8 }}
        >
          <Radio.Button value="existing">Existing</Radio.Button>
          <Radio.Button value="new">New</Radio.Button>
        </Radio.Group>
        {tradeMode === 'existing' ? (
          <Select
            showSearch
            style={{ width: '100%' }}
            placeholder="Search trades…"
            disabled={disabled || industryId == null || aiGenerating}
            options={tradeOptions}
            value={selectedTradeId}
            onSearch={setTradeSearch}
            onChange={setSelectedTradeId}
            filterOption={false}
            allowClear
          />
        ) : (
          <>
            <Input
              placeholder="New trade name"
              value={newTradeName}
              disabled={disabled || industryId == null || aiGenerating}
              onChange={(e) => setNewTradeName(e.target.value)}
            />
            {nameCheckLoading ? (
              <Text type="secondary" style={{ fontSize: 12 }}>
                Checking…
              </Text>
            ) : null}
            {nameCheck?.similar_matches?.length && tradeMode === 'new' ? (
              <Alert
                type="info"
                showIcon
                style={{ marginTop: 8 }}
                message="Did you mean?"
                description={
                  <div>
                    <ul style={{ margin: '4px 0', paddingLeft: 16 }}>
                      {nameCheck.similar_matches.slice(0, 4).map((row) => (
                        <li key={row.trade.id}>
                          <Button
                            type="link"
                            size="small"
                            style={{ padding: 0 }}
                            onClick={() => {
                              setTradeMode('existing')
                              setSelectedTradeId(row.trade.id)
                            }}
                          >
                            {row.trade.name}
                          </Button>
                        </li>
                      ))}
                    </ul>
                    <Button
                      size="small"
                      type={confirmDifferent ? 'primary' : 'default'}
                      onClick={() => setConfirmDifferent(true)}
                    >
                      {confirmDifferent
                        ? 'Confirmed different'
                        : 'This is a different trade'}
                    </Button>
                  </div>
                }
              />
            ) : null}
          </>
        )}
        {typeof onGenerateAllTrades === 'function' ? (
          <Button
            size="small"
            style={{ marginTop: 12 }}
            disabled={disabled || industryId == null || aiGenerating}
            onClick={() => onGenerateAllTrades(industryId)}
          >
            Generate all trades for industry
          </Button>
        ) : null}
      </Col>

      <Col flex="0 0 24%" style={colStyle}>
        <Text strong>Synonyms</Text>
        <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
          {tradeMode === 'existing' ? 'Edit tags' : 'Manual or AI'}
        </Paragraph>
        <Select
          mode="tags"
          style={{ width: '100%' }}
          placeholder="Type synonym, Enter"
          value={synonyms}
          disabled={
            disabled ||
            aiGenerating ||
            industryId == null ||
            (tradeMode === 'existing' && selectedTradeId == null) ||
            (tradeMode === 'new' && !newTradeName.trim())
          }
          onChange={setSynonyms}
          tokenSeparators={[',']}
          open={false}
        />
      </Col>

      <Col flex="0 0 32%" style={{ ...colStyle, borderRight: 'none' }}>
        <Text strong>Duties Block</Text>
        <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
          {tradeMode === 'new'
            ? 'Manual or Generate with AI'
            : 'Edit responsibilities'}
        </Paragraph>
        {tradeMode === 'new' ? (
          <Button
            size="small"
            style={{ marginBottom: 8 }}
            loading={aiGenerating}
            disabled={
              disabled ||
              industryId == null ||
              !newTradeName.trim() ||
              (nameCheck?.similar_matches?.length && !confirmDifferent)
            }
            onClick={generateWithAi}
          >
            Generate with AI
          </Button>
        ) : null}
        {aiDraftReady ? (
          <Text type="success" style={{ display: 'block', marginBottom: 6 }}>
            Draft ready — review then Save
          </Text>
        ) : null}
        {aiGenerating ? (
          <div style={{ textAlign: 'center', marginBottom: 8 }}>
            <Spin tip="Generating…" />
          </div>
        ) : null}
        <TextArea
          rows={10}
          placeholder="One duty per line"
          value={dutiesText}
          disabled={
            disabled ||
            aiGenerating ||
            industryId == null ||
            (tradeMode === 'existing' && selectedTradeId == null) ||
            (tradeMode === 'new' && !newTradeName.trim())
          }
          onChange={(e) => setDutiesText(e.target.value)}
        />
      </Col>
    </Row>
  )
})

export default TradeCascadeForm
