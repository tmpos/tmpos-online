import { ref, onMounted, onUnmounted } from 'vue'

export function useConexion() {
  const isOnline = ref(navigator.onLine)
  const lastSync = ref('')
  const syncStatus = ref<'idle' | 'syncing' | 'error' | 'success'>('idle')

  function updateOnlineStatus() {
    isOnline.value = navigator.onLine
  }

  let interval: ReturnType<typeof setInterval> | null = null

  onMounted(() => {
    window.addEventListener('online', updateOnlineStatus)
    window.addEventListener('offline', updateOnlineStatus)
  })

  onUnmounted(() => {
    window.removeEventListener('online', updateOnlineStatus)
    window.removeEventListener('offline', updateOnlineStatus)
    if (interval) clearInterval(interval)
  })

  return {
    isOnline,
    lastSync,
    syncStatus,
  }
}
