import { useEffect, useState } from 'react'
import { animateCounter, durations } from '../../design/animations'

export default function CounterUp({ value, duration = durations.counter, className = '' }) {
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    const target = typeof value === 'number' ? value : parseInt(String(value), 10) || 0
    animateCounter(target, duration, setDisplay)
  }, [value, duration])

  return <span className={className}>{display.toLocaleString()}</span>
}
