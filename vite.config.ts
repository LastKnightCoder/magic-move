/// <reference types="node" />
import { defineConfig } from 'vite'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

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
