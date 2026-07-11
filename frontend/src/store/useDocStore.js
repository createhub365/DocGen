import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

const STORAGE_KEY = 'docgen-wizard-v1'

const initialWizardState = {
  docType: null,
  templateMeta: null,
  templateId: null,
  employer: null,
  tradeCategory: null,
  selectedTrade: null,
  tradeDetails: null,
  placeholders: [],
  formData: {},
  generated: false,
  wizardStep: 0,
  fillSubStep: 0,
  fillMaxCompleted: 0,
  locationView: 'country',
  draftCountry: null,
  draftCategory: null,
  draftFormatSlug: null,
}

const persistedKeys = [
  'docType',
  'templateMeta',
  'templateId',
  'employer',
  'tradeCategory',
  'selectedTrade',
  'tradeDetails',
  'placeholders',
  'formData',
  'wizardStep',
  'fillSubStep',
  'fillMaxCompleted',
  'locationView',
  'draftCountry',
  'draftCategory',
  'draftFormatSlug',
]

export const useDocStore = create(
  persist(
    (set) => ({
      ...initialWizardState,

      setDocType: (docType) => set({ docType }),
      setWizardStep: (wizardStep) => set({ wizardStep }),
      setFillSubStep: (fillSubStep) => set({ fillSubStep }),
      setFillMaxCompleted: (fillMaxCompleted) => set({ fillMaxCompleted }),
      setLocationDraft: (partial) => set((state) => ({ ...state, ...partial })),
      setLocationMeta: (country, category, docTypeSlug) =>
        set({
          templateMeta: {
            country,
            category,
            doc_type: docTypeSlug,
          },
          draftCountry: country,
          draftCategory: category,
          locationView: 'category',
          templateId: null,
          employer: null,
          tradeCategory: null,
          selectedTrade: null,
          tradeDetails: null,
        }),
      setTemplateMeta: (templateMeta, templateId) =>
        set({
          templateMeta,
          templateId,
          placeholders: [],
          formData: {},
        }),
      setEmployer: (employer) => set({ employer }),
      setTradeCategory: (tradeCategory) =>
        set({ tradeCategory, selectedTrade: null, tradeDetails: null }),
      setSelectedTrade: (selectedTrade, tradeDetails) => set({ selectedTrade, tradeDetails }),
      setTemplate: (templateId, placeholders) =>
        set((state) => ({
          templateId,
          placeholders,
          formData: state.templateId === templateId ? state.formData : {},
        })),
      setFormData: (key, value) =>
        set((state) => ({
          formData: { ...state.formData, [key]: value },
        })),
      setFormDataBulk: (formData) => set({ formData }),
      mergeFormData: (partial) =>
        set((state) => ({ formData: { ...state.formData, ...partial } })),
      setGenerated: (generated) => set({ generated }),
      resetWizard: () => set({ ...initialWizardState }),
      resetFormForSameEmployer: () =>
        set((state) => ({
          formData: {},
          generated: false,
          placeholders: [],
          fillSubStep: 0,
          fillMaxCompleted: 0,
        })),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) =>
        Object.fromEntries(persistedKeys.map((key) => [key, state[key]])),
    }
  )
)

export function clearWizardSession() {
  useDocStore.persist.clearStorage()
  useDocStore.setState({ ...initialWizardState })
}

export function getClampedWizardStep(state) {
  let step = state.wizardStep || 0
  if (step >= 1 && !state.docType) step = 0
  if (step >= 2 && !(state.templateMeta?.country && state.templateMeta?.category)) step = 1
  if (step >= 3 && !(state.employer && state.selectedTrade)) step = 2
  if (step >= 4 && !state.templateId) step = 3
  return step
}

export function getMaxWizardStep(state) {
  return getClampedWizardStep(state)
}
