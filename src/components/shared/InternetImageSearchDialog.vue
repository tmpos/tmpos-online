<script setup lang="ts">
import { ref, watch } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import InputText from 'primevue/inputtext'
import { useToast } from 'primevue/usetoast'

const props = withDefaults(defineProps<{
  visible: boolean
  initialQuery?: string
  importing?: boolean
}>(), {
  initialQuery: '',
  importing: false,
})

const emit = defineEmits<{
  'update:visible': [value: boolean]
  select: [image: any]
}>()

const toast = useToast()
const consulta = ref('')
const resultados = ref<any[]>([])
const buscando = ref(false)

watch(() => props.visible, visible => {
  if (!visible) return
  consulta.value = String(props.initialQuery || '').trim()
  resultados.value = []
  if (consulta.value) buscar()
})

function textoPlano(value: unknown): string {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

async function buscar() {
  const termino = consulta.value.trim()
  if (!termino || buscando.value) return
  buscando.value = true
  resultados.value = []
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), 15000)
  try {
    const openverseParams = new URLSearchParams({ q: termino, page_size: '30', mature: 'false' })
    const commonsParams = new URLSearchParams({
      action: 'query',
      format: 'json',
      origin: '*',
      generator: 'search',
      gsrsearch: termino,
      gsrnamespace: '6',
      gsrlimit: '24',
      prop: 'imageinfo',
      iiprop: 'url|mime|extmetadata',
      iiurlwidth: '640',
    })

    const [openverseResult, commonsResult] = await Promise.allSettled([
      fetch(`https://api.openverse.org/v1/images/?${openverseParams.toString()}`, { signal: controller.signal }).then(async response => {
        if (!response.ok) throw new Error(`Openverse respondió HTTP ${response.status}`)
        return response.json()
      }),
      fetch(`https://commons.wikimedia.org/w/api.php?${commonsParams.toString()}`, { signal: controller.signal }).then(async response => {
        if (!response.ok) throw new Error(`Wikimedia respondió HTTP ${response.status}`)
        return response.json()
      }),
    ])

    const openverseData: any = openverseResult.status === 'fulfilled' ? openverseResult.value : null
    const commonsData: any = commonsResult.status === 'fulfilled' ? commonsResult.value : null
    if (!openverseData && !commonsData) {
      const error = openverseResult.status === 'rejected' ? openverseResult.reason : commonsResult.status === 'rejected' ? commonsResult.reason : null
      throw error || new Error('Los proveedores de imágenes no respondieron')
    }

    const openverse = (openverseData?.results || []).map((image: any) => ({
      id: `openverse-${image?.id}`,
      titulo: textoPlano(image?.title) || 'Imagen sin título',
      miniatura: image?.thumbnail || '',
      url: image?.thumbnail || '',
      fuente: image?.foreign_landing_url || image?.detail_url || '',
      autor: textoPlano(image?.creator),
      licencia: [image?.license, image?.license_version].filter(Boolean).join(' ').toUpperCase(),
      proveedor: `Openverse · ${textoPlano(image?.source || image?.provider || 'fuente abierta')}`,
    })).filter((image: any) => image.url)

    const commons = (Object.values(commonsData?.query?.pages || {}) as any[]).map((page: any) => {
      const info = page?.imageinfo?.[0]
      const metadata = info?.extmetadata || {}
      return {
        id: `commons-${page?.pageid}`,
        titulo: String(page?.title || '').replace(/^File:/i, ''),
        miniatura: info?.thumburl || info?.url || '',
        url: info?.thumburl || info?.url || '',
        fuente: info?.descriptionurl || '',
        autor: textoPlano(metadata?.Artist?.value),
        licencia: textoPlano(metadata?.LicenseShortName?.value || metadata?.UsageTerms?.value),
        proveedor: 'Wikimedia Commons',
        mime: info?.thumbmime || info?.mime || '',
      }
    }).filter((image: any) => image.url && (!image.mime || /^image\/(jpeg|png|webp)$/i.test(image.mime)))

    const seen = new Set<string>()
    resultados.value = [...openverse, ...commons].filter((image: any) => {
      const key = String(image.fuente || image.titulo || image.url).toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }).slice(0, 42)

    if (!resultados.value.length) {
      toast.add({ severity: 'info', summary: 'Sin resultados', detail: 'Prueba con una descripción más específica', life: 3500 })
    }
  } catch (error: any) {
    const message = error?.name === 'AbortError' ? 'La búsqueda tardó demasiado. Intenta de nuevo.' : (error?.message || 'No se pudieron buscar imágenes')
    toast.add({ severity: 'error', summary: 'Búsqueda no disponible', detail: message, life: 4500 })
  } finally {
    window.clearTimeout(timeoutId)
    buscando.value = false
  }
}
</script>

<template>
  <Dialog :visible="visible" header="Buscar imagen en internet" modal :style="{ width: 'min(58rem, 96vw)' }" :draggable="false" @update:visible="emit('update:visible', $event)">
    <div class="space-y-4 pt-1">
      <form class="flex flex-col sm:flex-row gap-2" @submit.prevent="buscar">
        <IconField class="flex-1"><InputIcon class="pi pi-search" /><InputText v-model="consulta" placeholder="Escribe el nombre exacto del producto..." fluid autofocus /></IconField>
        <Button type="submit" label="Buscar" icon="pi pi-search" :loading="buscando" :disabled="!consulta.trim()" />
      </form>

      <div v-if="buscando" class="py-12 text-center text-surface-500"><i class="pi pi-spin pi-spinner text-3xl block mb-3"></i>Buscando imágenes...</div>
      <div v-else-if="resultados.length" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[60vh] overflow-y-auto pr-1">
        <div v-for="image in resultados" :key="image.id || image.url" class="group text-left rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 overflow-hidden hover:border-primary-400 hover:ring-2 hover:ring-primary-200 dark:hover:ring-primary-900 transition-all">
          <button type="button" class="w-full text-left disabled:opacity-60" :disabled="importing" @click="emit('select', image)">
            <div class="aspect-square bg-surface-100 dark:bg-surface-900 flex items-center justify-center overflow-hidden"><img :src="image.miniatura" :alt="image.titulo" loading="lazy" referrerpolicy="no-referrer" class="w-full h-full object-contain group-hover:scale-105 transition-transform" /></div>
            <div class="px-2.5 pt-2.5"><p class="text-xs font-semibold line-clamp-2" :title="image.titulo">{{ image.titulo }}</p><p class="text-[10px] text-surface-500 mt-1 truncate">{{ image.proveedor }}</p><p v-if="image.licencia" class="text-[10px] text-surface-500 mt-0.5 truncate">{{ image.licencia }}<span v-if="image.autor"> · {{ image.autor }}</span></p></div>
          </button>
          <a v-if="image.fuente" :href="image.fuente" target="_blank" rel="noopener noreferrer" class="text-[10px] text-primary hover:underline px-2.5 pb-2.5 pt-1 inline-block">Ver fuente</a>
        </div>
      </div>
      <div v-else class="py-12 text-center text-surface-500"><i class="pi pi-images text-3xl block mb-3 text-surface-400"></i>Escribe el nombre para buscar imágenes.</div>
      <p class="text-xs text-surface-500 border-t border-surface-200 dark:border-surface-700 pt-3">Resultados combinados de Openverse y Wikimedia Commons. Revisa la fuente y la licencia antes de usar una imagen.</p>
    </div>
    <template #footer><Button label="Cerrar" severity="secondary" text :disabled="importing" @click="emit('update:visible', false)" /></template>
  </Dialog>
</template>
