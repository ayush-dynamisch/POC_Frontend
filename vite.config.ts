import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const apiProxy = {
  target: 'http://localhost:8000',
  changeOrigin: true,
  bypass: (req: any) => {
    if (req.headers.accept && req.headers.accept.includes('text/html')) {
      return '/index.html';
    }
  }
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  server: {
    port: 5174,
    strictPort: false,
    proxy: {
      '/auth': apiProxy,
      '/chat': apiProxy,
      '/clinicians': apiProxy,
      '/credentials': apiProxy,
      '/documents': apiProxy,
      '/document-checks': apiProxy,
      '/orgs': apiProxy,
      '/organizations': apiProxy,
      '/policies': apiProxy,
      '/reports': apiProxy,
      '/admin': apiProxy,
      '/agent-runs': apiProxy,
      '/api': apiProxy,
      '/health': apiProxy
    }
  }
})
