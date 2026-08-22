import { ref } from 'vue'

const sonidoHabilitado = ref(localStorage.getItem('pos_sonido') !== 'false')

const audioCtx = ref<AudioContext | null>(null)

function getCtx(): AudioContext {
  if (!audioCtx.value) {
    audioCtx.value = new (window.AudioContext || (window as any).webkitAudioContext)()
  }
  return audioCtx.value
}

function playTone(freq: number, duration: number, type: OscillatorType = 'sine', volume = 0.15) {
  if (!sonidoHabilitado.value) return
  try {
    const ctx = getCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.value = freq
    gain.gain.value = volume
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + duration)
  } catch {}
}

export function useSonidos() {
  function toggleSonido() {
    sonidoHabilitado.value = !sonidoHabilitado.value
    localStorage.setItem('pos_sonido', String(sonidoHabilitado.value))
  }

  function playSuccess() {
    playTone(880, 0.15, 'sine', 0.12)
    setTimeout(() => playTone(1100, 0.2, 'sine', 0.12), 100)
  }

  function playError() {
    playTone(300, 0.25, 'sawtooth', 0.1)
    setTimeout(() => playTone(200, 0.3, 'sawtooth', 0.1), 150)
  }

  function playScan() {
    playTone(1200, 0.08, 'sine', 0.08)
  }

  function playClick() {
    playTone(600, 0.05, 'sine', 0.05)
  }

  function playWarning() {
    for (let i = 0; i < 3; i++) {
      setTimeout(() => playTone(500, 0.1, 'square', 0.06), i * 120)
    }
  }

  function playCashRegister() {
    playTone(440, 0.1, 'sine', 0.1)
    setTimeout(() => playTone(660, 0.1, 'sine', 0.1), 80)
    setTimeout(() => playTone(880, 0.3, 'sine', 0.12), 160)
  }

  function playNewInvoice() {
    playTone(740, 0.16, 'sine', 0.14)
    setTimeout(() => playTone(988, 0.18, 'sine', 0.14), 140)
    setTimeout(() => playTone(1318, 0.3, 'sine', 0.16), 290)
  }

  return {
    sonidoHabilitado,
    toggleSonido,
    playSuccess,
    playError,
    playScan,
    playClick,
    playWarning,
    playCashRegister,
    playNewInvoice,
  }
}
