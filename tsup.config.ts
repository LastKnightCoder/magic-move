import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'core/index': 'src/core/index.ts',
    'react/index': 'src/react/index.ts',
    'data-structures/index': 'src/data-structures/index.ts',
    'text/index': 'src/text/index.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['leafer-ui', '@leafer-in/animate', 'react', 'react-dom', 'react/jsx-runtime'],
})
