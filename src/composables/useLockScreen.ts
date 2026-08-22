import { ref } from 'vue'

export function useLockScreen() {
  const isLocked = ref(false)
  const pinLock = ref('')
  const pinError = ref('')
  const lockedAt = ref<Date | null>(null)

  function bloquear() {
    isLocked.value = true
    lockedAt.value = new Date()
    pinLock.value = ''
    pinError.value = ''
  }

  async function desbloquear(pin: string): Promise<boolean> {
    pinError.value = ''
    try {
      const res = await window.db.getAll('usuarios')
      if (res.success) {
        const usuario = (res.data || []).find((u: any) =>
          String(u.pin) === String(pin) && u.estado === 'ACTIVADO'
        )
        if (usuario) {
          isLocked.value = false
          return true
        }
      }
      pinLock.value = ''
      pinError.value = 'PIN incorrecto'
      return false
    } catch {
      pinError.value = 'Error al verificar PIN'
      return false
    }
  }

  return {
    isLocked,
    pinLock,
    pinError,
    lockedAt,
    bloquear,
    desbloquear,
  }
}
