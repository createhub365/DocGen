import { Typography } from 'antd'

const { Title, Paragraph } = Typography

export default function PlatformPlaceholderPage({ title, blurb }) {
  return (
    <div>
      <Title level={3} style={{ marginTop: 0 }}>
        {title}
      </Title>
      <Paragraph type="secondary">{blurb || 'Coming in a later phase.'}</Paragraph>
    </div>
  )
}
