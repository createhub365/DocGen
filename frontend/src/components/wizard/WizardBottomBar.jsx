import { Button } from 'antd'
import useBreakpoint from '../../hooks/useBreakpoint'

export default function WizardBottomBar({
  onBack,
  onNext,
  backLabel = 'Back',
  nextLabel = 'Continue',
  nextDisabled = false,
  backHidden = false,
  nextHidden = false,
  nextLoading = false,
  center = null,
}) {
  const { isMobile } = useBreakpoint()

  if (isMobile) {
    return (
      <div className="wizard-bottom-bar wizard-bottom-bar--mobile">
        {center ? <div className="wizard-bottom-bar__center">{center}</div> : null}
        <div className="wizard-bottom-bar__actions">
          {!backHidden && (
            <button type="button" className="wizard-btn-back" onClick={onBack}>
              {backLabel}
            </button>
          )}
          {!nextHidden && (
            <Button
              type="primary"
              className="wizard-btn-next"
              onClick={onNext}
              disabled={nextDisabled}
              loading={nextLoading}
              block={backHidden}
            >
              {nextLabel}
            </Button>
          )}
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
        {!nextHidden && (
          <Button type="primary" onClick={onNext} disabled={nextDisabled} loading={nextLoading}>
            {nextLabel}
          </Button>
        )}
      </div>
    </div>
  )
}
