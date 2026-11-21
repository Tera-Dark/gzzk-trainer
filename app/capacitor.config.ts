import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.teradark.gzzk',
  appName: '真题训练台',
  webDir: 'dist',
  backgroundColor: '#f7f7f5',
  android: {
    backgroundColor: '#f7f7f5',
    allowMixedContent: false,
  },
}

export default config
