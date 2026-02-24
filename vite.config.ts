import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  root: 'demo',
  resolve: {
    alias: {
      '../../src': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    open: true,
  },
})
