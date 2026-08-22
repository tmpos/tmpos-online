<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppLayout from '@/layouts/AppLayout.vue'
import { checkOnlineDataConnection, onlineDataStatus } from '@/services/onlineDataService'

const route = useRoute()
const router = useRouter()
const { installed, reachable, checking, lastError } = onlineDataStatus
const setupRoute = computed(() => ['/login', '/license', '/configuracion'].includes(route.path))
const showOfflineBlock = computed(() => installed.value && !reachable.value && !setupRoute.value)
</script>

<template>
  <AppLayout />
  <div v-if="showOfflineBlock" class="online-required">
    <div class="online-required__card">
      <i class="pi pi-cloud text-5xl text-blue-400"></i>
      <h1>Conexion requerida</h1>
      <p>TM POS funciona exclusivamente online. Tus operaciones no se guardaran localmente ni quedaran pendientes.</p>
      <p v-if="lastError" class="online-required__error">{{ lastError }}</p>
      <div class="online-required__actions">
        <button type="button" :disabled="checking" @click="checkOnlineDataConnection">
          {{ checking ? 'Comprobando...' : 'Reintentar' }}
        </button>
        <button type="button" class="secondary" @click="router.push('/configuracion')">Configurar TM Cloud</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.online-required { position: fixed; inset: 0; z-index: 99999; display: grid; place-items: center; padding: 1.5rem; background: rgba(2, 6, 23, .94); }
.online-required__card { width: min(30rem, 100%); padding: 2rem; text-align: center; color: #e2e8f0; background: #0f172a; border: 1px solid #334155; border-radius: 1rem; box-shadow: 0 24px 80px rgba(0,0,0,.5); }
.online-required h1 { margin: 1rem 0 .5rem; font-size: 1.5rem; font-weight: 700; }
.online-required p { margin: .5rem 0; color: #cbd5e1; }
.online-required__error { color: #fca5a5 !important; font-size: .875rem; }
.online-required__actions { display: flex; gap: .75rem; justify-content: center; margin-top: 1.5rem; flex-wrap: wrap; }
.online-required button { padding: .7rem 1rem; color: white; background: #2563eb; border: 0; border-radius: .6rem; font-weight: 600; cursor: pointer; }
.online-required button.secondary { background: #334155; }
.online-required button:disabled { opacity: .6; cursor: wait; }
</style>
