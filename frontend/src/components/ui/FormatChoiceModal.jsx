import { Modal, Button, Space, Typography } from 'antd'
import { FilePdfOutlined, FileWordOutlined } from '@ant-design/icons'

const { Text } = Typography

export default function FormatChoiceModal({
  open,
  onCancel,
  onSelect,
  loadingFormat = null,
  title = 'Choose document format',
}) {
  const isBusy = loadingFormat === 'pdf' || loadingFormat === 'docx'

  return (
    <Modal
      open={open}
      onCancel={isBusy ? undefined : onCancel}
      footer={null}
      title={title}
      centered
      width={400}
      destroyOnHidden
      closable={!isBusy}
      maskClosable={!isBusy}
    >
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        Select the format for your generated document.
      </Text>
      <Space direction="vertical" style={{ width: '100%' }} size={12}>
        <Button
          block
          size="large"
          icon={<FilePdfOutlined />}
          loading={loadingFormat === 'pdf'}
          disabled={isBusy && loadingFormat !== 'pdf'}
          onClick={() => onSelect('pdf')}
        >
          PDF (.pdf)
        </Button>
        <Button
          block
          size="large"
          icon={<FileWordOutlined />}
          loading={loadingFormat === 'docx'}
          disabled={isBusy && loadingFormat !== 'docx'}
          onClick={() => onSelect('docx')}
        >
          Word (.docx)
        </Button>
      </Space>
    </Modal>
  )
}
