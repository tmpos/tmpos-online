import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import electron from 'vite-plugin-electron'
import tailwindcss from '@tailwindcss/vite'
import postcss from 'postcss'
import { resolve } from 'path'

export default defineConfig(({ mode }) => {
const isElectron = mode === 'electron'
const isAndroid = mode === 'android'

// Android 8.1 on the ELO uses WebView 85, which does not understand CSS
// cascade layers. Tailwind 4 emits its base/components/utilities inside
// @layer blocks, so unwrap them only in the Android bundle.
const androidCssCompatibility = {
  name: 'android-css-compatibility',
  apply: 'build' as const,
  generateBundle(_options: unknown, bundle: Record<string, any>) {
    if (!isAndroid) return

    for (const output of Object.values(bundle)) {
      if (output.type !== 'asset' || !output.fileName.endsWith('.css')) continue

      const root = postcss.parse(String(output.source))
      root.walkAtRules('layer', (rule) => {
        if (rule.nodes?.length) rule.replaceWith(...rule.nodes)
        else rule.remove()
      })
      output.source = root.toString()
    }
  },
}

return {
  base: './',
  plugins: [
    vue(),
    tailwindcss(),
    androidCssCompatibility,
    ...(isElectron ? [
      electron([
        {
          entry: 'electron/main.ts',
          vite: {
            build: {
              outDir: 'dist-electron',
              rollupOptions: {
                external: ['better-sqlite3'],
              },
            },
          },
        },
        {
          entry: 'electron/preload.ts',
          onstart(args) {
            args.reload()
          },
          vite: {
            build: {
              outDir: 'dist-electron',
            },
          },
        },
      ]),
    ] : []),
  ],
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
    },
  },
  optimizeDeps: {
    exclude: isElectron ? [] : ['sql.js'],
  },
  build: isAndroid ? {
    target: 'chrome85',
    cssTarget: 'chrome85',
    chunkSizeWarningLimit: 1000,
  } : {
    // Platform-specific and reporting views are loaded on demand. Their
    // isolated chunks can be large without delaying the initial application.
    chunkSizeWarningLimit: 1000,
  },
  server: {
    host: true,
  },
}
})
