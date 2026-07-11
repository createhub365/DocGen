import { useEffect, useMemo } from 'react'

import { Modal, Form, Input, Select, Button, Space, Divider } from 'antd'

import { PlusOutlined, MinusCircleOutlined } from '@ant-design/icons'

import CountrySelect from '../ui/CountrySelect'

import { getCountryCode, getCountryByCode } from '../../data/countries'

import {

  getRequiredCodeSystems,

  getOccupationCodesFromTrade,

} from '../../data/occupationCodes'



const NEW_INDUSTRY = '__new__'



function OccupationCodeFields({ systems, tradeName }) {

  if (!systems.length) {

    return (

      <div style={{ fontSize: 12, color: '#9AA3B0', marginBottom: 12 }}>

        Select applicable countries to see required occupation code systems.

      </div>

    )

  }



  return (

    <div style={{ marginBottom: 8 }}>

      {systems.map((sys) => (

        <div

          key={sys.system}

          style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-start' }}

        >

          <div

            style={{

              padding: '4px 10px',

              background: '#1A3C5E',

              color: 'white',

              borderRadius: 6,

              fontSize: 11,

              fontWeight: 700,

              whiteSpace: 'nowrap',

              alignSelf: 'center',

              minWidth: 70,

              textAlign: 'center',

            }}

          >

            {sys.system}

          </div>

          <Form.Item

            name={['occupation_codes', sys.system, 'code']}

            rules={[{ required: true, message: `${sys.system} code required` }]}

            style={{ flex: 1, marginBottom: 0 }}

          >

            <Input

              placeholder={`${sys.label} — e.g. ${sys.example}`}

              style={{ fontFamily: 'monospace' }}

            />

          </Form.Item>

          <Form.Item

            name={['occupation_codes', sys.system, 'title']}

            initialValue={tradeName || undefined}

            style={{ flex: 1.5, marginBottom: 0 }}

          >

            <Input placeholder="Official title..." />

          </Form.Item>

        </div>

      ))}

    </div>

  )

}



export default function AddTradeModal({

  open,

  onClose,

  onSave,

  industries = [],

  editingTrade = null,

  defaultIndustry = null,

}) {

  const [form] = Form.useForm()

  const isEdit = Boolean(editingTrade?.id)

  const industryMode = Form.useWatch('industry_mode', form)

  const selectedCountries = Form.useWatch('countries', form) || []

  const tradeName = Form.useWatch('trade', form) || ''



  const requiredSystems = useMemo(

    () => getRequiredCodeSystems(selectedCountries),

    [selectedCountries]

  )



  useEffect(() => {

    if (!open) return

    if (editingTrade) {

      const codes = getOccupationCodesFromTrade(editingTrade)

      const countryCodes = (editingTrade.countries || ['NZ']).map(

        (c) => getCountryCode(c) || c

      )

      form.setFieldsValue({

        industry_mode: editingTrade.industryName,

        new_industry: '',

        category: editingTrade.categoryName || 'General',

        trade: editingTrade.trade,

        occupation_codes: codes,

        responsibilities: editingTrade.responsibilities?.length

          ? editingTrade.responsibilities

          : [''],

        duties_generic: editingTrade.duties_generic?.length
          ? editingTrade.duties_generic
          : editingTrade.duties?.length
            ? editingTrade.duties
            : [''],

        countries: countryCodes,

      })

    } else {

      form.setFieldsValue({

        industry_mode: defaultIndustry?.industry || industries[0]?.industry || NEW_INDUSTRY,

        new_industry: '',

        category: 'General',

        trade: '',

        occupation_codes: {},

        responsibilities: [''],

        duties_generic: [''],

        countries: ['NZ'],

      })

    }

  }, [open, editingTrade, defaultIndustry, industries, form])



  const handleSubmit = async () => {

    const values = await form.validateFields()

    const industry =

      values.industry_mode === NEW_INDUSTRY

        ? values.new_industry?.trim()

        : values.industry_mode

    if (!industry) return



    const occupation_codes = {}

    Object.entries(values.occupation_codes || {}).forEach(([system, info]) => {

      const code = info?.code?.trim()

      if (!code) return

      occupation_codes[system] = {

        code,

        title: (info?.title || values.trade).trim() || values.trade.trim(),

      }

    })



    const selectedInd = industries.find((i) => i.industry === values.industry_mode)

    const genericDuties = values.duties_generic.filter((d) => d?.trim())
    if (!genericDuties.length) return

    const payload = {

      industry,

      industry_icon: selectedInd?.icon,

      industry_color: selectedInd?.color,

      category: values.category?.trim() || 'General',

      trade: values.trade.trim(),

      occupation_codes,

      anzsco_code: occupation_codes.ANZSCO?.code || '',

      anzsco_title: occupation_codes.ANZSCO?.title || values.trade.trim(),

      responsibilities: values.responsibilities.filter((r) => r?.trim()),

      duties_generic: genericDuties,
      duties: genericDuties,

      countries: (values.countries || ['NZ']).map(

        (code) => getCountryByCode(code)?.name || code

      ),

    }

    await onSave(payload, editingTrade?.id)

    form.resetFields()

    onClose()

  }



  const industryOptions = [

    ...industries.map((ind) => ({

      value: ind.industry,

      label: `${ind.icon} ${ind.industry}`,

    })),

    { value: NEW_INDUSTRY, label: '✨ Create new industry...' },

  ]



  return (

    <Modal

      title={isEdit ? 'Edit Custom Trade' : 'Add Trade'}

      open={open}

      onCancel={onClose}

      onOk={handleSubmit}

      okText={isEdit ? 'Save Changes' : 'Save Trade'}

      width={720}

      destroyOnHidden

    >

      <Form form={form} layout="vertical" style={{ marginTop: 8 }}>

        <Divider orientation="left" plain style={{ margin: '0 0 12px', fontSize: 12 }}>

          📁 Industry

        </Divider>

        <Form.Item

          name="industry_mode"

          label="Select or create industry"

          rules={[{ required: true, message: 'Select an industry' }]}

        >

          <Select options={industryOptions} placeholder="Choose industry" />

        </Form.Item>

        {industryMode === NEW_INDUSTRY && (

          <Form.Item

            name="new_industry"

            label="New industry name"

            rules={[{ required: true, message: 'Enter industry name' }]}

          >

            <Input placeholder="e.g. Renewable Energy" />

          </Form.Item>

        )}

        <Form.Item name="category" label="Trade category (optional)">

          <Input placeholder="General" />

        </Form.Item>



        <Form.Item

          name="countries"

          label="Applicable countries"

          rules={[{ required: true, message: 'Select at least one country' }]}

        >

          <CountrySelect

            mode="multiple"

            placeholder="Select applicable countries..."

            size="middle"

            grouped={false}

          />

        </Form.Item>



        <Divider orientation="left" plain style={{ margin: '8px 0 12px', fontSize: 12 }}>

          🔨 Trade details

        </Divider>

        <Form.Item

          name="trade"

          label="Trade name"

          rules={[{ required: true, message: 'Enter trade name' }]}

        >

          <Input placeholder="e.g. Carpenter" />

        </Form.Item>



        <div style={{ marginBottom: 16 }}>

          <div

            style={{

              fontSize: 12,

              fontWeight: 600,

              color: '#5A6478',

              marginBottom: 8,

            }}

          >

            Occupation codes

          </div>

          <OccupationCodeFields systems={requiredSystems} tradeName={tradeName} />

        </div>



        <Divider orientation="left" plain style={{ margin: '8px 0 12px', fontSize: 12 }}>

          📌 Responsibilities

        </Divider>

        <Form.List name="responsibilities">

          {(fields, { add, remove }) => (

            <>

              {fields.map((field) => (

                <Space key={field.key} style={{ display: 'flex', marginBottom: 8 }} align="start">

                  <Form.Item

                    {...field}

                    style={{ flex: 1, marginBottom: 0 }}

                    rules={[{ required: true, message: 'Required' }]}

                  >

                    <Input.TextArea rows={2} placeholder="High-level responsibility" />

                  </Form.Item>

                  {fields.length > 1 && (

                    <MinusCircleOutlined

                      onClick={() => remove(field.name)}

                      style={{ color: '#999', marginTop: 8 }}

                    />

                  )}

                </Space>

              ))}

              <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>

                Add responsibility

              </Button>

            </>

          )}

        </Form.List>



        <Divider orientation="left" plain style={{ margin: '16px 0 12px', fontSize: 12 }}>
          📋 Duties
        </Divider>

        <div
          style={{
            fontSize: 12,
            color: '#9AA3B0',
            marginBottom: 12,
            lineHeight: 1.5,
          }}
        >
          Use internationally neutral wording — e.g. &quot;applicable legislation&quot; instead of
          country-specific laws, &quot;local authority&quot; instead of named regulators.
        </div>
        <Form.List name="duties_generic">
          {(fields, { add, remove }) => (
            <>
              {fields.map((field) => (
                <Space key={field.key} style={{ display: 'flex', marginBottom: 8 }} align="start">
                  <Form.Item
                    {...field}
                    style={{ flex: 1, marginBottom: 0 }}
                    rules={[{ required: true, message: 'Required' }]}
                  >
                    <Input.TextArea rows={2} placeholder="Generic duty (no country-specific refs)" />
                  </Form.Item>
                  {fields.length > 1 && (
                    <MinusCircleOutlined
                      onClick={() => remove(field.name)}
                      style={{ color: '#999', marginTop: 8 }}
                    />
                  )}
                </Space>
              ))}
              <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                Add duty
              </Button>
            </>
          )}
        </Form.List>

      </Form>

    </Modal>

  )

}


