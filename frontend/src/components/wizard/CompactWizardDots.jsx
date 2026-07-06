import { Tooltip } from 'antd'

export default function CompactWizardDots({
  current,
  tips,
  onSelect,
  maxReachable = current,
}) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 8px',
        borderRadius: 999,
        background: '#fafafa',
        border: '1px solid #f0f0f0',
        flexShrink: 0,
      }}
    >
      {tips.map((tip, index) => {
        const done = index < current
        const active = index === current
        const reachable = index <= maxReachable
        const clickable = Boolean(onSelect) && reachable

        return (
          <Tooltip key={`${tip}-${index}`} title={tip}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {index > 0 && (
                <span
                  style={{
                    width: 10,
                    height: 1,
                    background: done || active ? '#1677ff' : '#d9d9d9',
                  }}
                />
              )}
              <span
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
                onClick={clickable ? () => onSelect(index) : undefined}
                onKeyDown={
                  clickable
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') onSelect(index)
                      }
                    : undefined
                }
                style={{
                  width: active ? 8 : 6,
                  height: active ? 8 : 6,
                  borderRadius: '50%',
                  background: done || active ? '#1677ff' : '#d9d9d9',
                  boxShadow: active ? '0 0 0 2px rgba(22, 119, 255, 0.2)' : 'none',
                  opacity: reachable ? 1 : 0.45,
                  transition: 'all 0.2s ease',
                  cursor: clickable ? 'pointer' : 'default',
                }}
              />
            </span>
          </Tooltip>
        )
      })}
    </div>
  )
}
