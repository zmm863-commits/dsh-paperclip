import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    outDir: 'lib',
    format: 'esm',
    platform: 'node',
    dts: true,
    clean: false,
    outExtensions: () => ({ js: '.js' }),
  },
  {
    entry: { client: 'src/client/index.tsx' },
    outDir: 'lib',
    format: 'esm',
    platform: 'browser',
    jsx: 'automatic',
    dts: true,
    clean: false,
    outExtensions: () => ({ js: '.js' }),
  },
])
