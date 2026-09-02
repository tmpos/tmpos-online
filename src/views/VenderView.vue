<script setup lang="ts">
import { onMounted } from 'vue'
import PosComp from '@/components/ventas/PosComp.vue'

console.log('[VenderView] Montando VenderView...')
onMounted(() => console.log('[VenderView] Montado'))
</script>

<template>
  <div class="h-full min-h-0 overflow-hidden">
    <p class="text-xs text-green-500" style="display:none">VenderView cargado</p>
    <PosComp />
  </div>
</template>
