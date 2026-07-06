import { useEffect, useState } from 'react'
import { Typography, message } from 'antd'
import {
  SolutionOutlined,
  FileTextOutlined,
  FileProtectOutlined,
  CalendarOutlined,
  CheckCircleFilled,
} from '@ant-design/icons'
import { getDocumentTypes } from '../api/client'
import { useDocStore } from '../store/useDocStore'

const { Title, Text } = Typography

const DOC_META = {
  offer_letter: {
    icon: SolutionOutlined,
    color: '#8B1A1A',
    desc: 'Job offers & compensation details',
  },
  demand_letter: {
    icon: FileTextOutlined,
    color: '#0D7C4A',
    desc: 'Labour & recruitment demand',
  },
  employment_contract: {
    icon: FileProtectOutlined,
    color: '#D97706',
    desc: 'Terms & conditions of employment',
  },
  appointment_letter: {
    icon: CalendarOutlined,
    color: '#6366F1',
    desc: 'Official role confirmation',
  },
}

function DocTypeCardSkeleton() {
  return (
    <div className="doc-select-card doc-select-card--skeleton">
      <div className="doc-select-card__icon animate-shimmer" />
      <div style={{ flex: 1 }}>
        <div className="animate-shimmer" style={{ width: '70%', height: 14, borderRadius: 4, marginBottom: 6 }} />
        <div className="animate-shimmer" style={{ width: '90%', height: 11, borderRadius: 4 }} />
      </div>
    </div>
  )
}

export default function StepSelectDoc({ onContinue, onRegisterNav }) {
  const { docType, setDocType } = useDocStore()
  const [types, setTypes] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getDocumentTypes()
      .then(setTypes)
      .catch(() => message.error('Failed to load document types'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    onRegisterNav?.({
      hidden: false,
      backHidden: true,
      onNext: onContinue,
      nextLabel: 'Continue',
      nextDisabled: !docType,
    })
  }, [docType, onContinue, onRegisterNav])

  if (loading) {
    return (
      <div className="doc-select-grid">
        <DocTypeCardSkeleton />
        <DocTypeCardSkeleton />
        <DocTypeCardSkeleton />
        <DocTypeCardSkeleton />
      </div>
    )
  }

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <Title level={5} style={{ margin: 0, color: 'var(--primary)' }}>
          Select document type
        </Title>
        <Text type="secondary" style={{ fontSize: 13 }}>
          Choose the document you want to generate
        </Text>
      </div>
      <div className="doc-select-grid stagger-fade">
        {types.map((dt) => {
          const meta = DOC_META[dt.slug] || {
            icon: FileTextOutlined,
            color: '#1A3C5E',
            desc: `Generate ${dt.name.toLowerCase()} documents`,
          }
          const Icon = meta.icon
          const selected = docType?.id === dt.id
          return (
            <div
              key={dt.id}
              className={`doc-select-card ${selected ? 'selected' : ''}`}
              onClick={() => setDocType(dt)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setDocType(dt)}
              style={{ '--doc-accent': meta.color }}
            >
              <div
                className="doc-select-card__icon"
                style={{
                  background: `${meta.color}14`,
                  color: meta.color,
                }}
              >
                <Icon />
              </div>
              <div className="doc-select-card__body">
                <div className="doc-select-card__title">{dt.name}</div>
                <div className="doc-select-card__desc">{meta.desc}</div>
              </div>
              {selected && (
                <CheckCircleFilled className="doc-select-card__check" />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
