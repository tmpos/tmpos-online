import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.mrcutti.technology',
  appName: 'MR Cutti Technology',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
}

export default config
