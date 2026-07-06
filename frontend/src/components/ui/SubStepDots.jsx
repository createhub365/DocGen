import { memo } from 'react'
import { CheckOutlined } from '@ant-design/icons'

function SubStepDots({ current = 0, total = 8, maxCompleted = 0, onSelect }) {
  return (
    <div className="flex items-center gap-0">
      {Array.from({ length: total }, (_, i) => {
        const done = i < current
        const active = i === current
        const reachable = i <= maxCompleted

        let dotClass = 'substep-dot'
        if (active) dotClass = 'substep-dot active'
        else if (done) dotClass = 'substep-dot completed'

        return (
          <div key={i} className="flex items-center">
            {i > 0 && (
              <div
                style={{
                  width: 16,
                  height: 1,
                  background: done || active ? 'var(--accent)' : 'var(--border)',
                }}
              />
            )}
            <button
              type="button"
              className={dotClass}
              onClick={reachable && onSelect ? () => onSelect(i) : undefined}
              aria-label={`Sub-step ${i + 1}`}
              style={{
                cursor: reachable && onSelect ? 'pointer' : 'default',
                border: 'none',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {done && !active && (
                <CheckOutlined style={{ fontSize: 4, color: 'white' }} />
              )}
            </button>
          </div>
        )
      })}
    </div>
  )
}

export default memo(SubStepDots)
