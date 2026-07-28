import {
  AuditOutlined,
  BankOutlined,
  ContactsOutlined,
  FileDoneOutlined,
  FileTextOutlined,
  FileWordOutlined,
  FormOutlined,
  GlobalOutlined,
  IdcardOutlined,
  ProfileOutlined,
  ReadOutlined,
  SafetyCertificateOutlined,
  ScheduleOutlined,
  SolutionOutlined,
  TeamOutlined,
} from '@ant-design/icons'

/** Default when icon is missing / unknown (matches backend DEFAULT_DOC_TYPE_ICON). */
export const DEFAULT_DOC_TYPE_ICON = 'file-text'

/** Fixed set mirrored by backend ALLOWED_DOC_TYPE_ICONS. */
export const DOC_TYPE_ICONS = [
  { key: 'file-text', label: 'Document', Icon: FileTextOutlined },
  { key: 'file-word', label: 'Word file', Icon: FileWordOutlined },
  { key: 'file-done', label: 'Completed', Icon: FileDoneOutlined },
  { key: 'form', label: 'Form', Icon: FormOutlined },
  { key: 'profile', label: 'Profile', Icon: ProfileOutlined },
  { key: 'idcard', label: 'ID card', Icon: IdcardOutlined },
  { key: 'audit', label: 'Audit', Icon: AuditOutlined },
  { key: 'solution', label: 'Solution', Icon: SolutionOutlined },
  { key: 'team', label: 'Team', Icon: TeamOutlined },
  { key: 'bank', label: 'Bank', Icon: BankOutlined },
  { key: 'schedule', label: 'Schedule', Icon: ScheduleOutlined },
  { key: 'safety', label: 'Certificate', Icon: SafetyCertificateOutlined },
  { key: 'read', label: 'Read', Icon: ReadOutlined },
  { key: 'contacts', label: 'Contacts', Icon: ContactsOutlined },
  { key: 'global', label: 'Global', Icon: GlobalOutlined },
]

const BY_KEY = Object.fromEntries(DOC_TYPE_ICONS.map((item) => [item.key, item]))

export function normalizeDocTypeIcon(key) {
  const k = String(key || '').trim().toLowerCase()
  return BY_KEY[k] ? k : DEFAULT_DOC_TYPE_ICON
}

export function getDocTypeIcon(key) {
  return BY_KEY[normalizeDocTypeIcon(key)] || BY_KEY[DEFAULT_DOC_TYPE_ICON]
}
