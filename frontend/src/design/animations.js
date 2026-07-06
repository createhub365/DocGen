export const easing = {
  easeOutExpo: 'cubic-bezier(0.16, 1, 0.3, 1)',
  easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  smooth: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
}

export const durations = {
  fast: '150ms',
  normal: '250ms',
  medium: '350ms',
  slow: '400ms',
  counter: 1200,
}

export const keyframesCss = `
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes fadeInDown {
  from { opacity: 0; transform: translateY(-12px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes scaleIn {
  from { opacity: 0; transform: scale(0.94); }
  to { opacity: 1; transform: scale(1); }
}

@keyframes slideInRight {
  from { opacity: 0; transform: translateX(24px); }
  to { opacity: 1; transform: translateX(0); }
}

@keyframes slideInLeft {
  from { opacity: 0; transform: translateX(-24px); }
  to { opacity: 1; transform: translateX(0); }
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}

@keyframes progressBar {
  from { width: 0%; }
  to { width: var(--progress, 100%); }
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  15% { transform: translateX(-6px); }
  30% { transform: translateX(6px); }
  45% { transform: translateX(-4px); }
  60% { transform: translateX(4px); }
  75% { transform: translateX(-2px); }
  90% { transform: translateX(2px); }
}

@keyframes fadeOut {
  from { opacity: 1; }
  to { opacity: 0; }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideOutLeft {
  from { opacity: 1; transform: translateX(0); }
  to { opacity: 0; transform: translateX(-30px); }
}

@keyframes slideInFromRight {
  from { opacity: 0; transform: translateX(30px); }
  to { opacity: 1; transform: translateX(0); }
}

@keyframes toastIn {
  from { opacity: 0; transform: translateX(120%); }
  to { opacity: 1; transform: translateX(0); }
}

@keyframes toastOut {
  from { opacity: 1; transform: translateX(0); }
  to { opacity: 0; transform: translateX(120%); }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes connectorFill {
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
}

@keyframes btnSuccess {
  0% { transform: scale(1); }
  30% { transform: scale(0.96); }
  60% { transform: scale(1.04); }
  100% { transform: scale(1); }
}
`

export const utilityClassesCss = `
.animate-fade-in-up {
  animation: fadeInUp 400ms ${easing.easeOutExpo} both;
}
.animate-fade-in-down {
  animation: fadeInDown 350ms ${easing.easeOutExpo} both;
}
.animate-scale-in {
  animation: scaleIn 300ms ${easing.spring} both;
}
.animate-slide-in-right {
  animation: slideInRight 400ms ${easing.easeOutExpo} both;
}
.animate-slide-in-left {
  animation: slideInLeft 400ms ${easing.easeOutExpo} both;
}
.animate-shimmer {
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e8f0 50%, #f0f0f0 75%);
  background-size: 400% 100%;
  animation: shimmer 1.6s ${easing.easeInOut} infinite;
}
.animate-pulse-soft {
  animation: pulse 2s ${easing.easeInOut} infinite;
}
.animate-float {
  animation: float 3s ${easing.easeInOut} infinite;
}
.animate-shake {
  animation: shake 400ms ${easing.easeInOut};
}
.animate-slide-out-left {
  animation: slideOutLeft 350ms ${easing.easeOutExpo} both;
}
.animate-slide-in-step {
  animation: slideInFromRight 350ms ${easing.easeOutExpo} both;
}
.stagger-children > *:nth-child(1) { animation-delay: 0ms; }
.stagger-children > *:nth-child(2) { animation-delay: 60ms; }
.stagger-children > *:nth-child(3) { animation-delay: 120ms; }
.stagger-children > *:nth-child(4) { animation-delay: 180ms; }
.stagger-children > *:nth-child(5) { animation-delay: 240ms; }
.stagger-children > *:nth-child(6) { animation-delay: 300ms; }
.stagger-children > *:nth-child(7) { animation-delay: 360ms; }
.stagger-children > *:nth-child(8) { animation-delay: 420ms; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
`

export function easeOutExpo(t) {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
}

export function animateCounter(target, duration, onUpdate, onComplete) {
  const start = performance.now()
  const from = 0

  function tick(now) {
    const elapsed = now - start
    const progress = Math.min(elapsed / duration, 1)
    const eased = easeOutExpo(progress)
    const value = Math.round(from + (target - from) * eased)
    onUpdate(value)
    if (progress < 1) {
      requestAnimationFrame(tick)
    } else {
      onComplete?.()
    }
  }

  requestAnimationFrame(tick)
}
