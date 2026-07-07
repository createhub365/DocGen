import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },

  build: {
    chunkSizeWarningLimit: 800,

    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/scheduler/')
          ) {
            return 'vendor-react'
          }

          if (id.includes('node_modules/react-router')) {
            return 'vendor-router'
          }

          if (
            id.includes('node_modules/antd') ||
            id.includes('node_modules/@ant-design') ||
            id.includes('node_modules/rc-')
          ) {
            return 'vendor-antd'
          }

          if (
            id.includes('pdfjs-dist') ||
            id.includes('docx-preview') ||
            id.includes('html2canvas')
          ) {
            return 'vendor-preview'
          }

          if (
            id.includes('node_modules/axios') ||
            id.includes('node_modules/zustand') ||
            id.includes('node_modules/dayjs') ||
            id.includes('node_modules/flag-icons')
          ) {
            return 'vendor-utils'
          }
        },
      },
    },
  },
})
