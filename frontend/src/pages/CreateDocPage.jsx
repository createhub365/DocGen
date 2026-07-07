import { useState, useEffect, useRef, useCallback } from 'react'
import { useDocStore, getClampedWizardStep } from '../store/useDocStore'
import StepIndicator, { WIZARD_STEP_LABELS } from '../components/ui/StepIndicator'
import WizardBottomBar from '../components/wizard/WizardBottomBar'
import StepSelectDoc from '../components/StepSelectDoc'
import StepTemplateSelect from '../components/wizard/StepTemplateSelect'
import StepEmployerTrade from '../components/wizard/StepEmployerTrade'
import StepSmartFillForm from '../components/wizard/StepSmartFillForm'
import FullPageSpinner from '../components/ui/FullPageSpinner'
import useBreakpoint from '../hooks/useBreakpoint'

const STEP_LABELS = WIZARD_STEP_LABELS

const HIDDEN_NAV = { hidden: true }

function navEquals(a, b) {
  if (!!a.hidden !== !!b.hidden) return false
  if (a.hidden) return true
  return (
    a.onBack === b.onBack &&
    a.onNext === b.onNext &&
    a.backLabel === b.backLabel &&
    a.nextLabel === b.nextLabel &&
    a.nextDisabled === b.nextDisabled &&
    a.backHidden === b.backHidden &&
    a.nextLoading === b.nextLoading &&
    a.center === b.center
  )
}

export default function CreateDocPage() {
  const { isMobile } = useBreakpoint()
  const [hydrated, setHydrated] = useState(() => useDocStore.persist.hasHydrated())
  const [nav, setNav] = useState(HIDDEN_NAV)
  const [animKey, setAnimKey] = useState(0)
  const [animClass, setAnimClass] = useState('animate-slide-in-step')
  const prevStep = useRef(0)
  const {
    docType,
    templateMeta,
    employer,
    selectedTrade,
    wizardStep,
    setWizardStep,
    resetWizard,
  } = useDocStore()

  const currentStep = wizardStep

  useEffect(() => {
    if (useDocStore.persist.hasHydrated()) {
      setHydrated(true)
      return undefined
    }
    return useDocStore.persist.onFinishHydration(() => setHydrated(true))
  }, [])

  useEffect(() => {
    if (!hydrated) return
    const state = useDocStore.getState()
    const clamped = getClampedWizardStep(state)
    if (state.wizardStep !== clamped) {
      setWizardStep(clamped)
    }
  }, [hydrated, setWizardStep])

  const stepTips = [
    docType?.name || 'Document Type',
    templateMeta?.country && templateMeta?.category
      ? `${templateMeta.country} · ${templateMeta.category}`
      : 'Country & Industry',
    employer && selectedTrade ? `${employer.company_name} · ${selectedTrade}` : 'Employer & Trade',
    templateMeta?.format_label || 'Template',
    'Fill & Generate',
  ]

  const onFillStep = currentStep === 4

  useEffect(() => {
    setNav(HIDDEN_NAV)
  }, [currentStep])

  useEffect(() => {
    if (currentStep !== prevStep.current) {
      setAnimClass(
        currentStep > prevStep.current ? 'animate-slide-in-step' : 'animate-slide-in-left'
      )
      setAnimKey((k) => k + 1)
      prevStep.current = currentStep
    }
  }, [currentStep])

  const goToStep = useCallback((step) => {
    const current = useDocStore.getState().wizardStep
    if (step <= current) setWizardStep(step)
  }, [setWizardStep])

  const registerNav = useCallback((config) => {
    setNav((prev) => (navEquals(prev, config) ? prev : config))
  }, [])

  const goToStep1 = useCallback(() => setWizardStep(1), [setWizardStep])
  const goToStep0 = useCallback(() => setWizardStep(0), [setWizardStep])
  const goToStep2 = useCallback(() => setWizardStep(2), [setWizardStep])
  const goToStep3 = useCallback(() => setWizardStep(3), [setWizardStep])
  const goToStep4 = useCallback(() => setWizardStep(4), [setWizardStep])

  const handleStartFresh = useCallback(() => {
    resetWizard()
  }, [resetWizard])

  if (!hydrated) {
    return <FullPageSpinner tip="Restoring your progress..." />
  }

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return <StepSelectDoc onContinue={goToStep1} onRegisterNav={registerNav} />
      case 1:
        return (
          <StepTemplateSelect
            phase="location"
            onContinue={goToStep2}
            onBack={goToStep0}
            onRegisterNav={registerNav}
          />
        )
      case 2:
        return (
          <StepEmployerTrade
            onContinue={goToStep3}
            onBack={goToStep1}
            onRegisterNav={registerNav}
          />
        )
      case 3:
        return (
          <StepTemplateSelect
            phase="template"
            onContinue={goToStep4}
            onBack={goToStep2}
            onRegisterNav={registerNav}
          />
        )
      case 4:
        return (
          <StepSmartFillForm
            mainStepCurrent={currentStep}
            mainStepContext={stepTips[currentStep]}
            onGoToMainStep={goToStep}
            onBack={goToStep3}
            onEditEmployer={goToStep2}
            onStartFresh={handleStartFresh}
            onRegisterNav={registerNav}
          />
        )
      default:
        return null
    }
  }

  return (
    <div className="wizard-shell">
      {!onFillStep && (
        <div className="wizard-shell-header">
          {!isMobile && (
            <h1
              style={{
                margin: '0 0 16px',
                fontSize: 18,
                fontWeight: 700,
                color: 'var(--primary)',
              }}
            >
              Generate Document
            </h1>
          )}
          <StepIndicator
            current={currentStep}
            labels={STEP_LABELS}
            onSelect={goToStep}
            maxReachable={currentStep}
            variant={isMobile ? 'compact' : 'default'}
          />
        </div>
      )}

      <div
        key={animKey}
        className={`${animClass} ${onFillStep ? 'wizard-shell-body wizard-shell-body--flush' : 'wizard-shell-body'}`}
      >
        {renderStep()}
      </div>

      {!nav.hidden && (
        <WizardBottomBar
          onBack={nav.onBack}
          onNext={nav.onNext}
          backLabel={nav.backLabel}
          nextLabel={nav.nextLabel}
          nextDisabled={nav.nextDisabled}
          backHidden={nav.backHidden}
          nextLoading={nav.nextLoading}
          center={nav.center}
        />
      )}
    </div>
  )
}
