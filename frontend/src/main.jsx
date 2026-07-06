import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App as AntApp, ConfigProvider } from 'antd'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { antTheme } from './design/tokens'
import 'antd/dist/reset.css'
import 'flag-icons/css/flag-icons.min.css'
import './styles/global.css'
import './styles/docx-preview.css'

// StrictMode is intentionally omitted — Ant Design v5 Tooltip/Dropdown
// internally use findDOMNode which React StrictMode deprecates, causing
// noisy console warnings with no functional impact on production builds.
ReactDOM.createRoot(document.getElementById('root')).render(
  <ConfigProvider theme={antTheme}>
    <AntApp
      message={{
        top: 24,
        duration: 4,
      }}
    >
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </BrowserRouter>
    </AntApp>
  </ConfigProvider>
)
