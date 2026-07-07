import { Button } from 'antd'
import useBreakpoint from '../../hooks/useBreakpoint'

export default function WizardBottomBar({
  onBack,
  onNext,
  backLabel = 'Back',
  nextLabel = 'Continue',
  nextDisabled = false,
  backHidden = false,
  nextLoading = false,
  center = null,
}) {
  const { isMobile } = useBreakpoint()

  if (isMobile) {
    return (
      <div className="wizard-bottom-bar">
        <div style={{ display: 'flex', width: '100%', gap: 8, alignItems: 'center' }}>
          {!backHidden && (
            <button type="button" className="wizard-btn-back" onClick={onBack} style={{ flex: '0 0 auto' }}>
              {backLabel}
            </button>
          )}
          {center && (
            <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'center' }}>
              {center}
            </div>
          )}
          <Button
            type="primary"
            onClick={onNext}
            disabled={nextDisabled}
            loading={nextLoading}
            style={{ flex: backHidden ? 1 : '1 1 auto', minHeight: 44 }}
          >
            {nextLabel}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="wizard-bottom-bar">
      <div style={{ flex: '0 0 120px', display: 'flex', justifyContent: 'flex-start' }}>
        {!backHidden && (
          <button type="button" className="wizard-btn-back" onClick={onBack}>
            {backLabel}
          </button>
        )}
      </div>

      <div
        style={{
          flex: 1,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minWidth: 0,
        }}
      >
        {center}
      </div>

      <div style={{ flex: '0 0 120px', display: 'flex', justifyContent: 'flex-end' }}>
        <Button type="primary" onClick={onNext} disabled={nextDisabled} loading={nextLoading}>
          {nextLabel}
        </Button>
      </div>
    </div>
  )
}
