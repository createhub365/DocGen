import { App } from 'antd'

/** Use instead of static `message` from antd (works with ConfigProvider theme). */
export function useAppMessage() {
  const { message } = App.useApp()
  return message
}
