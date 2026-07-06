import { useEffect, useState } from 'react'
import { Upload, Typography } from 'antd'
import LogoPreview from '../LogoPreview'
import { InboxOutlined } from '@ant-design/icons'
import { getLogos, uploadLogo } from '../../api/client'
import { useAppMessage } from '../../hooks/useAppMessage'

const { Dragger } = Upload
const { Text } = Typography

const MAX_BYTES = 2 * 1024 * 1024
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg']

async function urlToBase64(url) {
  const response = await fetch(url, { credentials: 'include' })
  const blob = await response.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export default function CompanyLogoField({ value, onChange, companyName }) {
  const [preview, setPreview] = useState(value || null)
  const [gallery, setGallery] = useState([])
  const [selectedGalleryId, setSelectedGalleryId] = useState(null)
  const message = useAppMessage()

  const loadGallery = async () => {
    if (!companyName) return
    try {
      const data = await getLogos(companyName)
      setGallery(data.logos || [])
    } catch {
      setGallery([])
    }
  }

  useEffect(() => {
    loadGallery()
  }, [companyName])

  useEffect(() => {
    if (value) {
      setPreview(value)
    }
  }, [value])

  const handleBeforeUpload = (file) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      message.error('Only PNG and JPG files are allowed')
      return Upload.LIST_IGNORE
    }
    if (file.size > MAX_BYTES) {
      message.error('File exceeds 2MB limit')
      return Upload.LIST_IGNORE
    }

    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = reader.result
      setPreview(base64)
      setSelectedGalleryId(null)
      onChange?.(base64)

      if (companyName) {
        try {
          const formData = new FormData()
          formData.append('file', file)
          formData.append('company_name', companyName)
          await uploadLogo(formData)
          await loadGallery()
        } catch {
          message.warning('Logo selected but could not be saved for reuse')
        }
      }
    }
    reader.readAsDataURL(file)
    return false
  }

  const handleGallerySelect = async (logo) => {
    try {
      const base64 = await urlToBase64(logo.url)
      setPreview(base64)
      setSelectedGalleryId(logo.logo_id)
      onChange?.(base64)
    } catch {
      message.error('Could not load selected logo')
    }
  }

  return (
    <div>
      <Dragger
        accept=".png,.jpg,.jpeg"
        showUploadList={false}
        beforeUpload={handleBeforeUpload}
        multiple={false}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">Click or drag logo file to upload</p>
        <p className="ant-upload-hint">PNG or JPG, max 2MB</p>
      </Dragger>

      {preview && (
        <div style={{ marginTop: 12 }}>
          <LogoPreview src={preview} maxWidth={220} maxHeight={110} />
        </div>
      )}

      {gallery.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
            Previously Used Logos
          </Text>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {gallery.map((logo) => (
              <div
                key={logo.logo_id}
                role="button"
                tabIndex={0}
                onClick={() => handleGallerySelect(logo)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') handleGallerySelect(logo)
                }}
                style={{
                  border:
                    selectedGalleryId === logo.logo_id
                      ? '2px solid #1677ff'
                      : '1px solid #d9d9d9',
                  borderRadius: 4,
                  padding: 4,
                  cursor: 'pointer',
                }}
              >
                <LogoPreview src={logo.url} maxWidth={120} maxHeight={60} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
