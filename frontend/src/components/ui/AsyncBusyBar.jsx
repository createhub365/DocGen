import { Progress } from 'antd'

/**
 * Indeterminate progress strip for synchronous bulk/long actions.
 * Do not fake determinate % — backends return a single response.
 */
export default function AsyncBusyBar({
  active = false,
  label = null,
  style = undefined,
}) {
  if (!active) return null
  return (
    <div
      className="platform-async-busy"
      style={{ marginTop: 12, marginBottom: 4, ...style }}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      {label ? (
        <div
          style={{
            fontSize: 12,
            color: 'rgba(0,0,0,0.45)',
            marginBottom: 6,
          }}
        >
          {label}
        </div>
      ) : null}
      <Progress
        percent={100}
        showInfo={false}
        status="active"
        strokeColor={{ from: '#8B1A1A', to: '#D4A017' }}
        size="small"
      />
    </div>
  )
}
