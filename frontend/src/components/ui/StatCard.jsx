import { memo } from 'react'
import CounterUp from './CounterUp'

const iconColors = {
  navy:   { bg: 'rgba(139,26,26,0.10)',  color: '#8B1A1A' },
  maroon: { bg: 'rgba(139,26,26,0.10)',  color: '#8B1A1A' },
  gold:   { bg: 'rgba(212,160,23,0.15)', color: '#C08800' },
  purple: { bg: 'rgba(74,25,66,0.12)',   color: '#4A1942' },
  green:  { bg: 'rgba(27,67,50,0.12)',   color: '#1B4332' },
}

function StatCard({ icon, color = 'maroon', value, subtitle, trend, delay = 0 }) {
  const palette = iconColors[color] || iconColors.maroon

  return (
    <div
      className="stat-card animate-fade-in-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between mb-4">
        <div
          className="flex items-center justify-center rounded-xl"
          style={{
            width: 48,
            height: 48,
            background: palette.bg,
            color: palette.color,
            fontSize: 22,
          }}
        >
          {icon}
        </div>
        {trend && (
          <span
            className="text-xs font-semibold flex items-center gap-1 px-2 py-1 rounded-full"
            style={{ color: '#0D7C4A', background: 'rgba(13,124,74,0.08)' }}
          >
            ↑ {trend}
          </span>
        )}
      </div>
      <div
        className="text-3xl font-bold mb-1"
        style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}
      >
        {typeof value === 'number' ? <CounterUp value={value} /> : value}
      </div>
      {subtitle && (
        <p className="text-xs m-0 font-medium" style={{ color: 'var(--text-muted)' }}>
          {subtitle}
        </p>
      )}
    </div>
  )
}

export default memo(StatCard)
