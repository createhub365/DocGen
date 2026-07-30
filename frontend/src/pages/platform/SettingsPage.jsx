import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Collapse,
  Space,
  Typography,
  Upload,
} from 'antd'
import {
  CheckOutlined,
  DeleteOutlined,
  PictureOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import {
  deleteOrgLogo,
  fetchOrgLogoUrl,
  readPlatformErrorDetail,
  regenerateOrgThumbnails,
  updateOrgTheme,
  uploadOrgLogo,
} from '../../api/platformClient'
import {
  THEME_PRESETS,
  applyThemeCssVariables,
  resolveThemeKey,
} from '../../design/themes'
import { useAppMessage } from '../../hooks/useAppMessage'
import { useAsyncAction } from '../../hooks/useAsyncAction'
import { usePlatformAuth } from '../../context/PlatformAuthContext'
import { usePlatformPageChrome } from '../../components/PlatformLayout'
import AsyncBusyBar from '../../components/ui/AsyncBusyBar'

const { Title, Text } = Typography

const LOGO_ACCEPT = '.png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml'
const LOGO_MAX_BYTES = 2 * 1024 * 1024

function ThemeSwatch({ colors }) {
  return (
    <div style={{ display: 'flex', gap: 6 }} aria-hidden="true">
      {colors.map((c) => (
        <span
          key={c}
          style={{
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: c,
            border: '1px solid rgba(0,0,0,0.08)',
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.25)',
          }}
        />
      ))}
    </div>
  )
}

export default function SettingsPage() {
  const message = useAppMessage()
  const { currentOrg, refreshMe } = usePlatformAuth()
  const { runNamed, isLoading } = useAsyncAction()

  const [summary, setSummary] = useState(null)
  const [error, setError] = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)
  const [logoError, setLogoError] = useState(null)
  const [themeError, setThemeError] = useState(null)
  const [pendingTheme, setPendingTheme] = useState(null)

  const regenBusy = isLoading('regen')
  const logoBusy = isLoading('logo')
  const themeBusy = isLoading('theme')

  const selectedTheme = resolveThemeKey(
    pendingTheme !== null ? pendingTheme : currentOrg?.theme_key
  )

  const header = useMemo(
    () => (
      <Title level={3} style={{ margin: 0 }}>
        Settings
      </Title>
    ),
    []
  )
  usePlatformPageChrome({ header })

  useEffect(() => {
    let revoked = null
    let cancelled = false
    setLogoPreview(null)
    if (!currentOrg?.has_logo) return undefined

    fetchOrgLogoUrl().then((url) => {
      if (cancelled) {
        if (url) URL.revokeObjectURL(url)
        return
      }
      revoked = url
      setLogoPreview(url)
    })
    return () => {
      cancelled = true
      if (revoked) URL.revokeObjectURL(revoked)
    }
  }, [currentOrg?.id, currentOrg?.has_logo, currentOrg?.logo_url])

  const onRegenerate = () =>
    runNamed('regen', async () => {
      setError(null)
      setSummary(null)
      try {
        const result = await regenerateOrgThumbnails()
        setSummary(result)
        message.success('Thumbnail check finished')
      } catch (err) {
        const detail =
          (await readPlatformErrorDetail(err)) ||
          'Could not regenerate thumbnails'
        setError(detail)
        message.error(detail)
      }
    })

  const onUploadLogo = async (file) => {
    setLogoError(null)
    if (file.size > LOGO_MAX_BYTES) {
      setLogoError('Logo must be 2MB or smaller')
      return false
    }
    await runNamed('logo', async () => {
      try {
        await uploadOrgLogo(file)
        await refreshMe()
        message.success('Organization logo updated')
      } catch (err) {
        const detail =
          (await readPlatformErrorDetail(err)) || 'Could not upload logo'
        setLogoError(detail)
        message.error(detail)
      }
    })
    return false
  }

  const onRemoveLogo = () =>
    runNamed('logo', async () => {
      setLogoError(null)
      try {
        await deleteOrgLogo()
        await refreshMe()
        message.success('Organization logo removed')
      } catch (err) {
        const detail =
          (await readPlatformErrorDetail(err)) || 'Could not remove logo'
        setLogoError(detail)
        message.error(detail)
      }
    })

  const onSelectTheme = (key) => {
    if (themeBusy || key === selectedTheme) return
    const previous = resolveThemeKey(currentOrg?.theme_key)
    setThemeError(null)
    setPendingTheme(key)
    applyThemeCssVariables(key)
    runNamed('theme', async () => {
      try {
        await updateOrgTheme(key)
        await refreshMe()
        setPendingTheme(null)
        message.success(`Theme updated to ${THEME_PRESETS.find((p) => p.key === key)?.name || key}`)
      } catch (err) {
        applyThemeCssVariables(previous)
        setPendingTheme(null)
        const detail =
          (await readPlatformErrorDetail(err)) || 'Could not update theme'
        setThemeError(detail)
        message.error(detail)
      }
    })
  }

  const initial = (currentOrg?.name || '?').trim().charAt(0).toUpperCase() || '?'

  return (
    <div
      className="platform-page-enter"
      style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      <Card
        title="Theme"
        style={{ borderRadius: 12, borderColor: 'var(--border)' }}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          Choose a color theme for your organization. Everyone in your org sees
          the same theme on every device.
        </Text>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: 12,
          }}
        >
          {THEME_PRESETS.map((preset) => {
            const selected = preset.key === selectedTheme
            return (
              <button
                key={preset.key}
                type="button"
                disabled={themeBusy}
                onClick={() => onSelectTheme(preset.key)}
                aria-pressed={selected}
                style={{
                  textAlign: 'left',
                  cursor: themeBusy ? 'wait' : 'pointer',
                  borderRadius: 12,
                  border: selected
                    ? '2px solid var(--primary)'
                    : '1px solid var(--border)',
                  background: 'var(--surface)',
                  padding: 12,
                  boxShadow: selected ? 'var(--shadow-sm)' : 'none',
                  position: 'relative',
                }}
              >
                {selected ? (
                  <CheckOutlined
                    style={{
                      position: 'absolute',
                      top: 10,
                      right: 10,
                      color: 'var(--primary)',
                      fontSize: 14,
                    }}
                  />
                ) : null}
                <ThemeSwatch colors={preset.swatch} />
                <Text strong style={{ display: 'block', marginTop: 10 }}>
                  {preset.name}
                </Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {preset.description}
                </Text>
              </button>
            )
          })}
        </div>

        <AsyncBusyBar active={themeBusy} label="Saving theme…" />

        {themeError && (
          <Alert
            type="error"
            showIcon
            message={themeError}
            style={{ marginTop: 16 }}
          />
        )}
      </Card>

      <Card
        title="Organization logo"
        style={{ borderRadius: 12, borderColor: 'var(--border)' }}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          PNG, JPG, or SVG · up to 2MB
        </Text>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            marginBottom: 16,
          }}
        >
          {logoPreview ? (
            <img
              src={logoPreview}
              alt="Organization logo"
              width={64}
              height={64}
              style={{
                width: 64,
                height: 64,
                borderRadius: 12,
                objectFit: 'contain',
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
              }}
            />
          ) : (
            <div
              aria-hidden="true"
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: 'color-mix(in srgb, var(--primary) 10%, transparent)',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 26,
                fontWeight: 800,
                color: 'var(--primary)',
              }}
            >
              {initial}
            </div>
          )}
          <Text strong style={{ display: 'block' }}>
            {currentOrg?.name || 'Organization'}
          </Text>
        </div>

        <Space wrap>
          <Upload
            accept={LOGO_ACCEPT}
            showUploadList={false}
            beforeUpload={onUploadLogo}
            disabled={logoBusy}
          >
            <Button icon={<UploadOutlined />} loading={logoBusy}>
              {currentOrg?.has_logo ? 'Change logo' : 'Upload logo'}
            </Button>
          </Upload>
          {currentOrg?.has_logo ? (
            <Button
              danger
              icon={<DeleteOutlined />}
              loading={logoBusy}
              onClick={onRemoveLogo}
            >
              Remove
            </Button>
          ) : null}
        </Space>

        {logoError && (
          <Alert
            type="error"
            showIcon
            message={logoError}
            style={{ marginTop: 16 }}
          />
        )}
      </Card>

      <Card
        title="Document previews"
        style={{ borderRadius: 12, borderColor: 'var(--border)' }}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          Create or refresh missing thumbnails for uploaded documents.
        </Text>
        <Button
          type="primary"
          icon={<PictureOutlined />}
          loading={regenBusy}
          onClick={onRegenerate}
        >
          Generate missing thumbnails
        </Button>
        <AsyncBusyBar
          active={regenBusy}
          label="Checking templates…"
        />

        {error && (
          <Alert
            type="error"
            showIcon
            message={error}
            style={{ marginTop: 16 }}
          />
        )}

        {summary && !regenBusy && (
          <Alert
            type={summary.failed ? 'warning' : 'success'}
            showIcon
            style={{ marginTop: 16 }}
            className="platform-fade-in"
            message={
              <span>
                Checked <Text strong>{summary.total}</Text> templates —{' '}
                <Text strong>{summary.created}</Text> created,{' '}
                <Text strong>{summary.updated}</Text> updated,{' '}
                <Text strong>{summary.unchanged}</Text> already up to date
                {summary.failed ? (
                  <>
                    , <Text strong>{summary.failed}</Text> failed
                  </>
                ) : null}
              </span>
            }
            description={
              summary.failed_details?.length ? (
                <Collapse
                  size="small"
                  style={{ marginTop: 8, background: 'transparent' }}
                  items={[
                    {
                      key: 'failures',
                      label: `View ${summary.failed_details.length} failure detail(s)`,
                      children: (
                        <Space
                          direction="vertical"
                          size={6}
                          style={{ width: '100%' }}
                        >
                          {summary.failed_details.map((row) => (
                            <Text
                              key={row.template_id}
                              type="secondary"
                              style={{ fontSize: 12 }}
                            >
                              #{row.template_id} {row.filename}: {row.error}
                            </Text>
                          ))}
                        </Space>
                      ),
                    },
                  ]}
                />
              ) : null
            }
          />
        )}
      </Card>
    </div>
  )
}
