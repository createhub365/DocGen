import { Button } from 'antd'

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
