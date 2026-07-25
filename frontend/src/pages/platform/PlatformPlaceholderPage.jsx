import { useMemo } from 'react'
import { Typography } from 'antd'
import { usePlatformPageChrome } from '../../components/PlatformLayout'

const { Title, Paragraph } = Typography

export default function PlatformPlaceholderPage({ title, blurb }) {
  const header = useMemo(
    () => (
      <>
        <Title level={3} style={{ margin: 0 }}>
          {title}
        </Title>
        <Paragraph type="secondary" style={{ margin: 0 }}>
          {blurb || 'Coming in a later phase.'}
        </Paragraph>
      </>
    ),
    [blurb, title]
  )
  usePlatformPageChrome({ header })

  // Title/blurb live in the fixed shell header; no body content yet.
  return <div aria-hidden="true" />
}
