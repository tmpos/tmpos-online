interface Window {
  Capacitor?: {
    isNativePlatform: () => boolean
    platform: string
  }
  __isElectron?: boolean
  __isCapacitor?: boolean
  db?: any
  electron?: {
    invoke: (channel: string, ...args: any[]) => Promise<any>
    send: (channel: string, ...args: any[]) => void
    on: (channel: string, callback: (...args: any[]) => void) => void
  }
}
