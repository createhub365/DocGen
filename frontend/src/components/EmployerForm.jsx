import { useEffect, useMemo, useState } from 'react'
import {
  Form,
  Input,
  Upload,
  Row,
  Col,
  Select,
  Divider,
  Spin,
  Alert,
} from 'antd'
import { InboxOutlined, GlobalOutlined, AppstoreOutlined } from '@ant-design/icons'
import { useAppMessage } from '../hooks/useAppMessage'
import { useEmployerCountryConfig } from '../hooks/useEmployerCountryConfig'
import { getTradeBankIndustries } from '../api/client'
import LogoPreview from './LogoPreview'
import CountryFlag from './ui/CountryFlag'
import { COUNTRY_NAME_OPTIONS_GROUPED, getCountryByName, getRegField } from '../data/countries'
import { resolveMediaUrl } from '../utils/mediaUrl'

const { Dragger } = Upload

const emailRule = [{ type: 'email', message: 'Valid email required' }]

export default function EmployerForm({ form, initialValues, logoPreviewUrl }) {
  const { getConfig, loading: configLoading } = useEmployerCountryConfig()
  const [selectedCountry, setSelectedCountry] = useState(initialValues?.country || '')
  const [industries, setIndustries] = useState([])
  const [industriesLoading, setIndustriesLoading] = useState(true)
  const [logoPreview, setLogoPreview] = useState(resolveMediaUrl(logoPreviewUrl) || null)
  const message = useAppMessage()

  const countryConfig = getConfig(selectedCountry)
  const countryOptions = useMemo(() => COUNTRY_NAME_OPTIONS_GROUPED, [])

  useEffect(() => {
    getTradeBankIndustries()
      .then((data) => setIndustries(data.industries || []))
      .catch(() => message.error('Failed to load industries'))
      .finally(() => setIndustriesLoading(false))
  }, [message])

  const industryOptions = useMemo(
    () => industries.map((ind) => ({ value: ind.name, label: ind.name })),
    [industries]
  )

  useEffect(() => {
    if (initialValues?.country) {
      const countryValue =
        initialValues.country === 'UAE' ? 'United Arab Emirates' : initialValues.country
      setSelectedCountry(countryValue)
      const cfg = getConfig(countryValue)
      form.setFieldsValue({
        ...initialValues,
        country: countryValue,
        reg_number_label: initialValues.reg_number_label || cfg.reg_number_label,
      })
    } else {
      setSelectedCountry('')
    }
  }, [initialValues, form, getConfig])

  useEffect(() => {
    setLogoPreview(resolveMediaUrl(logoPreviewUrl) || null)
  }, [logoPreviewUrl])

  const handleCountryChange = (value) => {
    setSelectedCountry(value)
    const cfg = getConfig(value)
    form.setFieldsValue({
      reg_number_label: cfg.reg_number_label || 'Registration No.',
      reg_number_value: '',
      employer_accreditation_no: '',
      company_state: undefined,
      company_postcode: '',
    })
  }

  if (configLoading || industriesLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <Spin tip="Loading form..." />
      </div>
    )
  }

  const showState = selectedCountry && countryConfig.has_state !== false
  const countryMeta = selectedCountry ? getCountryByName(selectedCountry) : null

  return (
    <Form form={form} layout="vertical" initialValues={initialValues}>
      <Divider orientation="left">
        <GlobalOutlined /> Country & Company
      </Divider>

      <Form.Item
        name="country"
        label="Country"
        rules={[{ required: true, message: 'Please select a country' }]}
        extra="Registration labels and address fields adapt to the selected country."
      >
        <Select
          showSearch
          placeholder="Select country (195+ supported)"
          options={countryOptions}
          onChange={handleCountryChange}
          optionFilterProp="label"
          listHeight={320}
          getPopupContainer={() => document.body}
          styles={{ popup: { root: { zIndex: 1200 } } }}
          optionRender={(option) => (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CountryFlag name={option.value} size={16} />
              {option.label}
            </span>
          )}
        />
      </Form.Item>

      <Form.Item
        name="industry"
        label="Main Industry"
        rules={[{ required: true, message: 'Please select industry' }]}
        extra="Identifies which industry category this company belongs to."
      >
        <Select
          showSearch
          placeholder="Select industry"
          options={industryOptions}
          optionFilterProp="label"
          listHeight={320}
          getPopupContainer={() => document.body}
          styles={{ popup: { root: { zIndex: 1200 } } }}
          suffixIcon={<AppstoreOutlined />}
          notFoundContent={industryOptions.length ? undefined : 'No industries loaded'}
        />
      </Form.Item>

      {!selectedCountry && (
        <Alert
          type="info"
          showIcon
          size="small"
          message="Select a country — fields below will update automatically."
          style={{ marginBottom: 12 }}
        />
      )}

      {selectedCountry && countryMeta && (
        <Alert
          type="success"
          showIcon
          size="small"
          message={`${countryMeta.name} · ${countryConfig.reg_number_label || 'Registration No.'}${countryMeta.currency ? ` · ${countryMeta.currency}` : ''}`}
          style={{ marginBottom: 12 }}
        />
      )}

      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item
            name="company_name"
            label="Company Legal Name"
            rules={[{ required: true, message: 'Required' }]}
          >
            <Input placeholder="e.g. Example Company Ltd" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="company_trading_name" label="Trading Name / DBA">
            <Input placeholder="If different from legal name" />
          </Form.Item>
        </Col>
      </Row>

      <Form.Item
        name="company_email"
        label="Official Email"
        rules={[{ required: true, type: 'email', message: 'Valid email required' }]}
      >
        <Input placeholder="info@company.com" />
      </Form.Item>

      {selectedCountry && (
        <>
          <Form.Item name="reg_number_label" hidden>
            <Input />
          </Form.Item>

          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                name="reg_number_value"
                label={countryConfig.reg_number_label || 'Registration No.'}
                tooltip={countryConfig.reg_number_help}
                rules={[{ required: true, message: 'Required' }]}
              >
                <Input placeholder={countryConfig.reg_number_placeholder || 'Enter registration number'} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="employer_accreditation_no"
                label={countryConfig.accreditation_label || 'Accreditation / Licence No.'}
              >
                <Input
                  placeholder={
                    countryConfig.accreditation_placeholder || 'Enter accreditation number'
                  }
                />
              </Form.Item>
            </Col>
          </Row>
        </>
      )}

      <Form.Item name="company_website" label="Website URL">
        <Input placeholder="www.company.com" />
      </Form.Item>

      <Form.Item name="_logo_file" hidden>
        <Input type="hidden" />
      </Form.Item>
      <Form.Item label="Company Logo">
        <Dragger
          accept=".png,.jpg,.jpeg,.webp"
          showUploadList={false}
          beforeUpload={(file) => {
            if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type)) {
              message.error('Only PNG, JPG, or WEBP allowed')
              return Upload.LIST_IGNORE
            }
            if (file.size > 5 * 1024 * 1024) {
              message.error('Max 5MB')
              return Upload.LIST_IGNORE
            }
            setLogoPreview(URL.createObjectURL(file))
            form.setFieldValue('_logo_file', file)
            return false
          }}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">PNG, JPG, or WEBP — max 5MB</p>
        </Dragger>
        {logoPreview && (
          <div style={{ marginTop: 8 }}>
            <LogoPreview src={logoPreview} maxWidth={220} maxHeight={110} />
          </div>
        )}
      </Form.Item>

      {selectedCountry && (
        <>
          <Divider orientation="left">Address</Divider>

          <Form.Item
            name="company_address"
            label="Street Address"
            rules={[{ required: true, message: 'Required' }]}
          >
            <Input.TextArea rows={2} placeholder="Street address" />
          </Form.Item>

          <Row gutter={16}>
            <Col xs={24} md={showState ? 8 : 12}>
              <Form.Item
                name="company_city"
                label="City"
                rules={[{ required: true, message: 'Required' }]}
              >
                <Input placeholder="City" />
              </Form.Item>
            </Col>

            {showState && (
              <Col xs={24} md={8}>
                <Form.Item
                  name="company_state"
                  label={countryConfig.state_label || 'State / Province / Region'}
                >
                  {countryConfig.state_options?.length ? (
                    <Select
                      showSearch
                      allowClear
                      placeholder={`Select ${countryConfig.state_label || 'State'}`}
                      options={countryConfig.state_options.map((s) => ({ value: s, label: s }))}
                    />
                  ) : (
                    <Input placeholder="State / Region" />
                  )}
                </Form.Item>
              </Col>
            )}

            <Col xs={24} md={showState ? 8 : 12}>
              <Form.Item
                name="company_postcode"
                label={countryConfig.postcode_label || 'Postal Code'}
              >
                <Input placeholder={countryConfig.postcode_placeholder || 'Postal code'} />
              </Form.Item>
            </Col>
          </Row>
        </>
      )}

      <Divider orientation="left">
        HR Contact <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--text-muted)' }}>(optional)</span>
      </Divider>

      <Row gutter={16}>
        <Col xs={24} md={8}>
          <Form.Item name="hr_contact_name" label="HR Contact Name">
            <Input placeholder="e.g. HR Manager" />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item name="hr_contact_title" label="HR Title / Designation">
            <Input placeholder="e.g. Human Resources Manager" />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item name="hr_email" label="HR Email" rules={emailRule}>
            <Input placeholder="hr@company.com" />
          </Form.Item>
        </Col>
      </Row>

      <Divider orientation="left">
        Authorised Signatory{' '}
        <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--text-muted)' }}>(optional)</span>
      </Divider>

      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item name="signatory_name" label="Signatory Name">
            <Input placeholder="e.g. Managing Director" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="signatory_designation" label="Signatory Designation">
            <Input placeholder="e.g. Director / CEO" />
          </Form.Item>
        </Col>
      </Row>
    </Form>
  )
}

export function buildEmployerFormData(values) {
  const formData = new FormData()
  const { _logo_file, country, ...rest } = values

  const countryMeta = getCountryByName(country)
  const countryName = countryMeta?.name || country

  Object.entries(rest).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== '' && key !== '_logo_file') {
      formData.append(key, val)
    }
  })

  formData.set('country', countryName)

  if (!rest.reg_number_label && countryMeta) {
    const reg = getRegField(countryMeta.code)
    formData.set('reg_number_label', reg.regLabel || reg.label || 'Registration No.')
  }

  if (_logo_file) formData.append('logo', _logo_file)
  return formData
}
