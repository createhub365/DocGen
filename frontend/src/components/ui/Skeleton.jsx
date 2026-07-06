import { memo } from 'react'

function SkeletonBlock({ width = '100%', height = 16, circle = false, className = '' }) {
  return (
    <div
      className={`animate-shimmer ${className}`}
      style={{
        width,
        height: circle ? width : height,
        borderRadius: circle ? '50%' : 'var(--radius-sm)',
      }}
    />
  )
}

export function StatCardSkeleton() {
  return (
    <div className="stat-card">
      <SkeletonBlock width={48} height={48} circle className="mb-4" />
      <SkeletonBlock width="40%" height={32} className="mb-2" />
      <SkeletonBlock width="60%" height={14} />
    </div>
  )
}

export function TableRowSkeleton({ cols = 7 }) {
  return (
    <tr>
      {Array.from({ length: cols }, (_, i) => (
        <td key={i} style={{ padding: '12px 16px' }}>
          <SkeletonBlock width={i === 0 ? '60%' : '80%'} height={14} />
        </td>
      ))}
    </tr>
  )
}

export function EmployerCardSkeleton() {
  return (
    <div className="employer-master-card">
      <div className="employer-card-strip" />
      <div style={{ padding: 24, paddingTop: 40 }}>
        <SkeletonBlock width={56} height={56} circle className="mb-4" style={{ marginTop: -48 }} />
        <SkeletonBlock width="70%" height={18} className="mb-2" />
        <SkeletonBlock width="50%" height={14} className="mb-4" />
        <SkeletonBlock width="40%" height={24} />
      </div>
    </div>
  )
}

export default memo(SkeletonBlock)
