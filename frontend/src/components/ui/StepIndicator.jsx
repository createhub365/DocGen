import { memo } from 'react'
import { CheckOutlined } from '@ant-design/icons'

export const WIZARD_STEP_LABELS = [
  { label: 'Document Type', short: 'Document' },
  { label: 'Country & Industry', short: 'Location' },
  { label: 'Employer & Trade', short: 'Employer' },
  { label: 'Template', short: 'Template' },
  { label: 'Fill & Generate', short: 'Fill' },
]

function StepIndicator({
  current = 0,
  labels = WIZARD_STEP_LABELS,
  onSelect,
  maxReachable,
  variant = 'default',
}) {
  const reachable = maxReachable ?? current
  const compact = variant === 'compact'

  return (
    <div
      className={compact ? 'wizard-steps-wrap wizard-steps-wrap--compact' : 'wizard-steps-wrap'}
    >
      <div className={`wizard-steps-row${compact ? ' wizard-steps-row--compact' : ''}`}>
        {labels.map((step, index) => {
          const done = index < current
          const active = index === current
          const inactive = index > current
          const clickable = onSelect && index <= reachable
          const labelText = compact ? step.short || step.label : step.label

          let circleClass = 'wizard-step-circle inactive'
          if (active) circleClass = 'wizard-step-circle active'
          if (done) circleClass = 'wizard-step-circle completed'

          return (
            <div key={step.label || index} className="wizard-step-item">
              {index > 0 && (
                <div className="wizard-connector">
                  <div className="wizard-connector-line" />
                  {(done || active) && (
                    <div
                      className="wizard-connector-fill"
                      style={{
                        transform: done ? 'scaleX(1)' : active ? 'scaleX(0.5)' : 'scaleX(0)',
                        animation: done || active ? 'none' : undefined,
                      }}
                    />
                  )}
                </div>
              )}
              <button
                type="button"
                className={circleClass}
                title={step.label}
                onClick={clickable ? () => onSelect(index) : undefined}
                disabled={!clickable}
                aria-current={active ? 'step' : undefined}
                aria-label={`${step.label}${active ? ', current step' : done ? ', completed' : ''}`}
                style={{
                  cursor: clickable ? 'pointer' : 'default',
                  border: inactive ? '2px solid var(--border)' : 'none',
                }}
              >
                {done ? <CheckOutlined style={{ fontSize: compact ? 11 : 14 }} /> : index + 1}
              </button>
              <span
                className="wizard-step-label"
                style={{
                  fontWeight: active ? 600 : 400,
                  color: active ? 'var(--primary)' : 'var(--text-muted)',
                }}
              >
                {labelText}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default memo(StepIndicator)
