let audioCtx: AudioContext | null = null
let ultimaReproduccion = 0

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
  }
  return audioCtx
}

export function reproducirNotificacion() {
  const ahora = Date.now()
  if (ahora - ultimaReproduccion < 2000) return
  ultimaReproduccion = ahora

  try {
    const ctx = getCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1)
    osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.2)

    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.4)
  } catch {}
}
