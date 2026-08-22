<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Textarea from 'primevue/textarea'
import { sendAssistantMessage, type AssistantMessage } from '@/services/aiAssistantService'
import { useAuthStore } from '@/stores/auth.store'

const router = useRouter()
const auth = useAuthStore()
const puedeEntrarConfiguracion = computed(() => Boolean(auth.isAdmin || auth.isSoporte))
const open = ref(false)
const loading = ref(false)
const listening = ref(false)
const transcribing = ref(false)
const recordingSeconds = ref(0)
const enabled = ref(false)
const configured = ref(false)
const voiceEnabled = ref(true)
const voiceLang = ref('es-DO')
const input = ref('')
const voiceTranscriptReady = ref(false)
const messages = ref<AssistantMessage[]>([
  {
    role: 'assistant',
    content: 'Hola. Soy Jarvis. Puedo consultar y administrar inventario, ventas, clientes, proveedores, taller, compras, contabilidad, reportes y los demas modulos de TMPOS.',
  },
])
const messagesEl = ref<HTMLElement | null>(null)
let mediaRecorder: MediaRecorder | null = null
let mediaStream: MediaStream | null = null
let audioChunks: Blob[] = []
let recordingTimer: ReturnType<typeof setInterval> | null = null
let discardRecording = false
let spaceHeld = false

async function loadConfig() {
  try {
    const result = await window.electron.invoke('openai:getConfig') as any
    enabled.value = result?.success ? result.data.enabled === true : false
    configured.value = Boolean(result?.success && result.data.has_api_key)
    voiceEnabled.value = result?.success ? result.data.voice_enabled : true
    voiceLang.value = result?.data?.voice || 'es-DO'
  } catch {
    configured.value = false
  }
}

function scrollToBottom() {
  nextTick(() => {
    if (messagesEl.value) messagesEl.value.scrollTop = messagesEl.value.scrollHeight
  })
}

function speak(text: string) {
  if (!voiceEnabled.value || !('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = voiceLang.value
  utterance.rate = 1.02
  utterance.pitch = 0.96
  window.speechSynthesis.speak(utterance)
}

async function send() {
  const text = input.value.trim()
  if (!text || loading.value) return
  if (!configured.value) {
    messages.value.push({ role: 'assistant', content: 'Necesito que configures la API key en Configuración > OpenAI / Jarvis.' })
    input.value = ''
    scrollToBottom()
    return
  }
  input.value = ''
  voiceTranscriptReady.value = false
  messages.value.push({ role: 'user', content: text })
  loading.value = true
  scrollToBottom()
  try {
    const answer = await sendAssistantMessage(messages.value)
    messages.value.push({ role: 'assistant', content: answer })
    speak(answer)
  } catch (error: any) {
    const message = error?.message || 'No pude procesar la solicitud.'
    messages.value.push({ role: 'assistant', content: `Ocurrió un problema: ${message}` })
  } finally {
    loading.value = false
    scrollToBottom()
  }
}

function stopMediaTracks() {
  mediaStream?.getTracks().forEach(track => track.stop())
  mediaStream = null
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '')
    reader.onerror = () => reject(new Error('No se pudo leer la grabación'))
    reader.readAsDataURL(blob)
  })
}

async function transcribeAudio(blob: Blob) {
  if (blob.size < 500) throw new Error('La grabación quedó vacía. Intenta hablar más cerca del micrófono.')
  transcribing.value = true
  try {
    const audioBase64 = await blobToBase64(blob)
    const result = await window.electron.invoke('openai:transcribe', {
      audio_base64: audioBase64,
      mime_type: blob.type || 'audio/webm',
      language: voiceLang.value.split('-')[0] || 'es',
    }) as any
    if (!result?.success) throw new Error(result?.error || 'No se pudo transcribir el audio')
    input.value = String(result.data?.text || '').trim()
    if (!input.value) throw new Error('No pude entender lo que dijiste. Intenta nuevamente.')
    voiceTranscriptReady.value = true
    messages.value.push({
      role: 'assistant',
      content: `Entendí: “${input.value}”. Revisa el texto y pulsa “Sí, proceder” para enviarlo.`,
    })
    scrollToBottom()
  } finally {
    transcribing.value = false
  }
}

function stopListening(discard = false) {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return
  discardRecording = discard
  mediaRecorder.stop()
}

async function startListening(pushToTalk = false) {
  if (!configured.value) {
    messages.value.push({ role: 'assistant', content: 'Configura primero la API key de OpenAI para poder transcribir tu voz.' })
    scrollToBottom()
    return
  }
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    messages.value.push({ role: 'assistant', content: 'Este dispositivo no permite grabar audio desde la aplicación.' })
    scrollToBottom()
    return
  }
  try {
    discardRecording = false
    audioChunks = []
    voiceTranscriptReady.value = false
    input.value = ''
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })
    if (pushToTalk && !spaceHeld) {
      stopMediaTracks()
      return
    }
    const mimeType = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
    ].find(type => MediaRecorder.isTypeSupported(type))
    mediaRecorder = mimeType
      ? new MediaRecorder(mediaStream, { mimeType })
      : new MediaRecorder(mediaStream)
    mediaRecorder.ondataavailable = event => {
      if (event.data.size > 0) audioChunks.push(event.data)
    }
    mediaRecorder.onerror = () => {
      listening.value = false
      stopMediaTracks()
      messages.value.push({ role: 'assistant', content: 'Ocurrió un error mientras grababa el micrófono.' })
      scrollToBottom()
    }
    mediaRecorder.onstop = async () => {
      listening.value = false
      if (recordingTimer) clearInterval(recordingTimer)
      recordingTimer = null
      const blob = new Blob(audioChunks, { type: mediaRecorder?.mimeType || 'audio/webm' })
      stopMediaTracks()
      if (discardRecording) return
      try {
        await transcribeAudio(blob)
      } catch (error: any) {
        messages.value.push({ role: 'assistant', content: error?.message || 'No pude procesar la grabación.' })
        scrollToBottom()
      }
    }
    mediaRecorder.start(250)
    recordingSeconds.value = 0
    listening.value = true
    recordingTimer = setInterval(() => {
      recordingSeconds.value += 1
      if (recordingSeconds.value >= 60) stopListening()
    }, 1000)
  } catch (error: any) {
    listening.value = false
    stopMediaTracks()
    const denied = error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError'
    messages.value.push({
      role: 'assistant',
      content: denied
        ? 'El permiso del micrófono fue rechazado. Habilítalo para TMPOS en la configuración del sistema.'
        : `No pude abrir el micrófono: ${error?.message || 'error desconocido'}`,
    })
    scrollToBottom()
  }
}

function toggleListening() {
  if (listening.value) {
    stopListening()
    return
  }
  startListening()
}

function isTextInput(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  if (!element) return false
  const tag = element.tagName?.toLowerCase()
  return tag === 'input' || tag === 'textarea' || element.isContentEditable
}

function handlePushToTalkDown(event: KeyboardEvent) {
  if (event.code !== 'Space' || event.repeat || !open.value || isTextInput(event.target)) return
  if (loading.value || transcribing.value || listening.value) return
  event.preventDefault()
  spaceHeld = true
  startListening(true)
}

function handlePushToTalkUp(event: KeyboardEvent) {
  if (event.code !== 'Space' || !spaceHeld) return
  event.preventDefault()
  spaceHeld = false
  if (listening.value) stopListening()
}

function handleWindowBlur() {
  spaceHeld = false
  if (listening.value) stopListening(true)
}

function clearConversation() {
  window.speechSynthesis?.cancel()
  voiceTranscriptReady.value = false
  input.value = ''
  messages.value = [{
    role: 'assistant',
    content: 'Conversación reiniciada. ¿Qué deseas hacer en TMPOS?',
  }]
}

async function openSettings() {
  open.value = false
  await router.push({ path: '/configuracion', query: { section: 'openai' } })
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    send()
  }
}

function handleConfigChange() {
  loadConfig()
}

onMounted(() => {
  loadConfig()
  window.addEventListener('jarvis:config-change', handleConfigChange)
  window.addEventListener('keydown', handlePushToTalkDown)
  window.addEventListener('keyup', handlePushToTalkUp)
  window.addEventListener('blur', handleWindowBlur)
})

onBeforeUnmount(() => {
  stopListening(true)
  if (recordingTimer) clearInterval(recordingTimer)
  stopMediaTracks()
  window.speechSynthesis?.cancel()
  window.removeEventListener('jarvis:config-change', handleConfigChange)
  window.removeEventListener('keydown', handlePushToTalkDown)
  window.removeEventListener('keyup', handlePushToTalkUp)
  window.removeEventListener('blur', handleWindowBlur)
})
</script>

<template>
  <div v-if="enabled" class="jarvis-root">
    <Transition name="jarvis-panel">
      <section v-if="open" class="jarvis-panel" aria-label="Asistente Jarvis">
        <header class="jarvis-header">
          <div class="flex items-center gap-3 min-w-0">
            <div class="jarvis-avatar" :class="{ 'jarvis-avatar--active': listening || transcribing || loading }">
              <i class="pi pi-sparkles"></i>
            </div>
            <div class="min-w-0">
              <h3 class="font-bold leading-tight">Jarvis</h3>
              <p class="text-xs opacity-75 truncate">
                {{ listening ? `Escuchando... ${recordingSeconds}s · suelta Espacio para enviar` : transcribing ? 'Transcribiendo tu voz...' : loading ? 'Pensando y trabajando...' : configured ? 'Conectado · mantén Espacio para hablar' : 'Falta configurar OpenAI' }}
              </p>
            </div>
          </div>
          <div class="flex items-center">
            <Button icon="pi pi-trash" text rounded severity="secondary" size="small" aria-label="Limpiar conversación" @click="clearConversation" />
            <Button icon="pi pi-times" text rounded severity="secondary" size="small" aria-label="Cerrar Jarvis" @click="open = false" />
          </div>
        </header>

        <div ref="messagesEl" class="jarvis-messages">
          <div
            v-for="(message, index) in messages"
            :key="index"
            class="jarvis-message"
            :class="message.role === 'user' ? 'jarvis-message--user' : 'jarvis-message--assistant'"
          >
            <i v-if="message.role === 'assistant'" class="pi pi-sparkles text-[10px] mt-1 shrink-0"></i>
            <p>{{ message.content }}</p>
          </div>
          <div v-if="loading" class="jarvis-typing">
            <span></span><span></span><span></span>
          </div>
        </div>

        <div v-if="!configured" class="mx-3 mb-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm">
          <p class="font-semibold">Conecta OpenAI para comenzar</p>
          <Button v-if="puedeEntrarConfiguracion" label="Ir a configuración" icon="pi pi-cog" size="small" text class="!px-0 mt-1" @click="openSettings" />
          <p v-else class="text-xs text-amber-700 dark:text-amber-300 mt-1">Solicita la configuración a un Administrador o Soporte.</p>
        </div>

        <div v-if="voiceTranscriptReady" class="jarvis-confirm">
          <Button
            label="Sí, proceder"
            icon="pi pi-check"
            class="flex-1"
            :disabled="!input.trim() || loading"
            @click="send"
          />
          <Button
            label="Grabar otra vez"
            icon="pi pi-refresh"
            severity="secondary"
            outlined
            :disabled="loading || transcribing"
            @click="startListening()"
          />
        </div>

        <footer class="jarvis-input-wrap">
          <button
            type="button"
            class="jarvis-mic"
            :class="{ 'jarvis-mic--active': listening }"
            :aria-label="listening ? 'Dejar de escuchar' : 'Hablar con Jarvis'"
            :disabled="transcribing || loading"
            @click="toggleListening"
          >
            <i :class="listening ? 'pi pi-stop-circle' : 'pi pi-microphone'"></i>
          </button>
          <Textarea
            v-model="input"
            rows="1"
            autoResize
            placeholder="Escribe o habla con Jarvis..."
            class="jarvis-textarea"
            :disabled="loading"
            @keydown="handleKeydown"
          />
          <Button icon="pi pi-send" rounded :disabled="!input.trim() || loading" aria-label="Enviar" @click="send" />
        </footer>
      </section>
    </Transition>

    <button
      type="button"
      class="jarvis-orb"
      :class="{ 'jarvis-orb--open': open, 'jarvis-orb--active': listening || transcribing || loading }"
      aria-label="Abrir asistente Jarvis"
      @click="open = !open"
    >
      <span class="jarvis-orb-ring"></span>
      <i :class="open ? 'pi pi-times' : 'pi pi-sparkles'"></i>
    </button>
  </div>
</template>

<style scoped>
.jarvis-root {
  position: fixed;
  right: 1.25rem;
  bottom: 1.25rem;
  z-index: 1100;
}

.jarvis-orb {
  position: relative;
  margin-left: auto;
  width: 3.75rem;
  height: 3.75rem;
  border: 1px solid rgba(96, 165, 250, 0.8);
  border-radius: 999px;
  color: white;
  background: radial-gradient(circle at 35% 30%, #60a5fa, #2563eb 48%, #172554);
  box-shadow: 0 12px 35px rgba(37, 99, 235, 0.45), inset 0 0 16px rgba(255, 255, 255, 0.18);
  cursor: pointer;
  transition: transform 180ms ease, box-shadow 180ms ease;
}

.jarvis-orb:hover {
  transform: translateY(-3px) scale(1.04);
  box-shadow: 0 16px 40px rgba(37, 99, 235, 0.58), inset 0 0 18px rgba(255, 255, 255, 0.25);
}

.jarvis-orb-ring {
  position: absolute;
  inset: -5px;
  border: 1px solid rgba(96, 165, 250, 0.5);
  border-radius: inherit;
}

.jarvis-orb--active .jarvis-orb-ring {
  animation: jarvis-pulse 1.2s ease-out infinite;
}

.jarvis-panel {
  width: min(25rem, calc(100vw - 1.5rem));
  height: min(36rem, calc(100vh - 7rem));
  margin-bottom: 0.8rem;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(96, 165, 250, 0.4);
  border-radius: 1.25rem;
  color: var(--p-surface-900);
  background: rgba(248, 250, 252, 0.96);
  box-shadow: 0 24px 70px rgba(2, 6, 23, 0.35);
  backdrop-filter: blur(24px);
}

:global(.dark) .jarvis-panel {
  color: var(--p-surface-0);
  background: rgba(2, 6, 23, 0.96);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.62), 0 0 35px rgba(37, 99, 235, 0.12);
}

.jarvis-header {
  min-height: 4.5rem;
  padding: 0.8rem 0.9rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(148, 163, 184, 0.22);
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.16), rgba(14, 165, 233, 0.05));
}

.jarvis-avatar {
  width: 2.6rem;
  height: 2.6rem;
  display: grid;
  place-items: center;
  border-radius: 0.9rem;
  color: #dbeafe;
  background: linear-gradient(145deg, #2563eb, #1e3a8a);
  box-shadow: 0 7px 18px rgba(37, 99, 235, 0.3);
}

.jarvis-avatar--active {
  animation: jarvis-glow 1.3s ease-in-out infinite alternate;
}

.jarvis-messages {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}

.jarvis-message {
  max-width: 88%;
  padding: 0.68rem 0.8rem;
  display: flex;
  gap: 0.45rem;
  border-radius: 1rem;
  font-size: 0.875rem;
  line-height: 1.42;
  white-space: pre-wrap;
}

.jarvis-message--assistant {
  align-self: flex-start;
  border: 1px solid rgba(96, 165, 250, 0.22);
  border-bottom-left-radius: 0.3rem;
  background: rgba(59, 130, 246, 0.1);
}

.jarvis-message--user {
  align-self: flex-end;
  border-bottom-right-radius: 0.3rem;
  color: white;
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
}

.jarvis-input-wrap {
  padding: 0.75rem;
  display: flex;
  align-items: flex-end;
  gap: 0.5rem;
  border-top: 1px solid rgba(148, 163, 184, 0.22);
}

.jarvis-confirm {
  padding: 0.65rem 0.75rem 0;
  display: flex;
  gap: 0.5rem;
  border-top: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(59, 130, 246, 0.06);
}

.jarvis-confirm + .jarvis-input-wrap {
  border-top: 0;
}

.jarvis-textarea {
  flex: 1;
  min-height: 2.65rem;
  max-height: 7rem;
  resize: none;
}

.jarvis-mic {
  width: 2.65rem;
  height: 2.65rem;
  flex: 0 0 2.65rem;
  border: 1px solid rgba(59, 130, 246, 0.45);
  border-radius: 999px;
  color: #2563eb;
  background: rgba(59, 130, 246, 0.1);
  cursor: pointer;
}

.jarvis-mic--active {
  color: white;
  border-color: #ef4444;
  background: #ef4444;
  animation: jarvis-glow-red 1s ease-in-out infinite alternate;
}

.jarvis-typing {
  width: fit-content;
  padding: 0.75rem 0.9rem;
  display: flex;
  gap: 0.25rem;
  border-radius: 1rem;
  background: rgba(59, 130, 246, 0.1);
}

.jarvis-typing span {
  width: 0.4rem;
  height: 0.4rem;
  border-radius: 50%;
  background: #60a5fa;
  animation: jarvis-dot 1s infinite ease-in-out;
}

.jarvis-typing span:nth-child(2) { animation-delay: 0.15s; }
.jarvis-typing span:nth-child(3) { animation-delay: 0.3s; }

.jarvis-panel-enter-active,
.jarvis-panel-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
  transform-origin: bottom right;
}

.jarvis-panel-enter-from,
.jarvis-panel-leave-to {
  opacity: 0;
  transform: translateY(12px) scale(0.96);
}

@keyframes jarvis-pulse {
  from { opacity: 0.8; transform: scale(1); }
  to { opacity: 0; transform: scale(1.35); }
}

@keyframes jarvis-glow {
  from { box-shadow: 0 0 8px rgba(59, 130, 246, 0.35); }
  to { box-shadow: 0 0 24px rgba(59, 130, 246, 0.85); }
}

@keyframes jarvis-glow-red {
  from { box-shadow: 0 0 5px rgba(239, 68, 68, 0.35); }
  to { box-shadow: 0 0 20px rgba(239, 68, 68, 0.8); }
}

@keyframes jarvis-dot {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.45; }
  30% { transform: translateY(-4px); opacity: 1; }
}

@media (max-width: 640px) {
  .jarvis-root {
    right: 0.75rem;
    bottom: 0.75rem;
  }

  .jarvis-panel {
    height: min(34rem, calc(100vh - 6rem));
  }
}
</style>
