import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Table, Input, Button, DatePicker, Switch, Empty } from 'antd'
import { DownloadOutlined, FileWordOutlined, SearchOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { getDocuments, downloadDoc } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useAppMessage } from '../hooks/useAppMessage'

const { RangePicker } = DatePicker

export default function DocumentsPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const message = useAppMessage()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit] = useState(20)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [dateRange, setDateRange] = useState(null)
  const [allUsers, setAllUsers] = useState(false)

  const employerId = searchParams.get('employer')

  const loadDocuments = useCallback(async () => {
    setLoading(true)
    try {
      const params = {
        page,
        limit,
        search: search || undefined,
        employer_id: employerId ? Number(employerId) : undefined,
        date_from: dateRange?.[0]?.format('YYYY-MM-DD'),
        date_to: dateRange?.[1]?.format('YYYY-MM-DD'),
        all_users: isAdmin && allUsers ? true : undefined,
      }
      const result = await getDocuments(params)
      setData(result.items || [])
      setTotal(result.total || 0)
    } catch {
      message.error('Failed to load documents')
    } finally {
      setLoading(false)
    }
  }, [page, limit, search, employerId, dateRange, allUsers, isAdmin, message])

  useEffect(() => {
    loadDocuments()
  }, [loadDocuments])

  const handleDownload = async (docId, type) => {
    try {
      await downloadDoc(docId, type)
    } catch {
      message.error(`Failed to download ${type.toUpperCase()}`)
    }
  }

  const columns = [
    {
      title: 'Date',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (val) => dayjs(val).format('MMM D, YYYY HH:mm'),
      sorter: (a, b) => dayjs(a.created_at).unix() - dayjs(b.created_at).unix(),
    },
    {
      title: 'Document Type',
      dataIndex: 'doc_type_name',
      key: 'doc_type_name',
    },
    {
      title: 'Company',
      dataIndex: 'company_name',
      key: 'company_name',
    },
    {
      title: 'Country',
      dataIndex: 'country_name',
      key: 'country_name',
      responsive: ['md'],
    },
    {
      title: 'Trade',
      dataIndex: 'trade_name',
      key: 'trade_name',
      responsive: ['lg'],
    },
    ...(isAdmin
      ? [{
          title: 'Staff',
          dataIndex: 'username',
          key: 'username',
          responsive: ['md'],
        }]
      : []),
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <div className="flex gap-2 flex-wrap">
          {record.pdf_url && (
            <Button
              size="small"
              icon={<DownloadOutlined />}
              onClick={() => handleDownload(record.id, 'pdf')}
            >
              PDF
            </Button>
          )}
          <Button
            size="small"
            icon={<FileWordOutlined />}
            onClick={() => handleDownload(record.id, 'docx')}
          >
            DOCX
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="max-w-7xl mx-auto page-enter">
      <div className="page-header animate-fade-in-down" style={{ marginBottom: 24 }}>
        <div className="page-header-accent" />
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>
            Document History
          </h1>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
            {employerId ? 'Filtered by employer' : 'All generated documents'}
          </p>
        </div>
      </div>

      <div
        className="flex flex-col md:flex-row gap-3 mb-4 flex-wrap"
        style={{ alignItems: 'flex-start' }}
      >
        <Input
          prefix={<SearchOutlined style={{ color: 'var(--text-muted)' }} />}
          placeholder="Search company or document type"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onPressEnter={() => {
            setSearch(searchInput)
            setPage(1)
          }}
          allowClear
          style={{ maxWidth: 320, borderRadius: 'var(--radius-md)' }}
        />
        <RangePicker
          value={dateRange}
          onChange={(vals) => {
            setDateRange(vals)
            setPage(1)
          }}
        />
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Switch checked={allUsers} onChange={(v) => { setAllUsers(v); setPage(1) }} />
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>All users</span>
          </div>
        )}
        <Button
          type="primary"
          onClick={() => {
            setSearch(searchInput)
            setPage(1)
          }}
        >
          Search
        </Button>
        {employerId && (
          <Button onClick={() => navigate('/documents')}>Clear employer filter</Button>
        )}
      </div>

      <div
        className="content-panel content-panel--shadow animate-fade-in-up"
        style={{ animationDelay: '80ms' }}
      >
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          pagination={{
            current: page,
            pageSize: limit,
            total,
            onChange: setPage,
            showSizeChanger: false,
            showTotal: (t) => `${t} documents`,
          }}
          locale={{
            emptyText: (
              <Empty
                description="No documents found"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              >
                <Button type="primary" onClick={() => navigate('/create')}>
                  Generate document
                </Button>
              </Empty>
            ),
          }}
          scroll={{ x: 800 }}
        />
      </div>
    </div>
  )
}
