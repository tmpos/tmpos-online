<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

onMounted(() => {
  router.replace('/ventas?tab=recibidos')
})
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-3 py-12">
    <i class="pi pi-sync text-4xl text-surface-400"></i>
    <p class="text-surface-500">Redirigiendo a Recibidos...</p>
  </div>
</template>
