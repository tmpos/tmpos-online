<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'
import { useSystemModeStore } from '@/stores/systemMode'
import { useAlmacenFilter } from '@/composables/useAlmacenFilter'

type SearchItem = {
  id: string
  type: 'module' | 'record'
  category: string
  title: string
  subtitle: string
  searchText: string
  icon: string
  color: string
  route: string
  permission: string
}

const router = useRouter()
const auth = useAuthStore()
const systemMode = useSystemModeStore()
const { filterByAlmacen, store: warehouseStore } = useAlmacenFilter()
const visible = ref(false)
const query = ref('')
const loading = ref(false)
const activeIndex = ref(0)
const input = ref<HTMLInputElement | null>(null)
const records = ref<SearchItem[]>([])
let loadedAt = 0

const modules: SearchItem[] = [
  { id: 'module-home', type: 'module', category: 'Módulos', title: 'Inicio', subtitle: 'Panel principal', searchText: 'inicio home panel dashboard', icon: 'pi-home', color: 'blue', route: '/', permission: 'home' },
  { id: 'module-sell', type: 'module', category: 'Acciones rápidas', title: 'Nueva venta', subtitle: 'Abrir punto de venta', searchText: 'nueva venta vender pos caja', icon: 'pi-shopping-cart', color: 'emerald', route: '/vender', permission: 'vender' },
  { id: 'module-phones', type: 'module', category: 'Módulos', title: 'Teléfonos', subtitle: 'Inventario de teléfonos', searchText: 'telefonos celulares inventario', icon: 'pi-mobile', color: 'indigo', route: '/inventario?tab=telefonos', permission: 'telefonos' },
  { id: 'module-imei', type: 'module', category: 'Módulos', title: 'IMEI', subtitle: 'Consultar inventario por IMEI', searchText: 'imei serial buscar', icon: 'pi-barcode', color: 'violet', route: '/inventario?tab=imei', permission: 'imei' },
  { id: 'module-products', type: 'module', category: 'Módulos', title: 'Productos y accesorios', subtitle: 'Inventario general', searchText: 'productos accesorios inventario', icon: 'pi-box', color: 'sky', route: '/inventario?tab=accesorios', permission: 'accesorios' },
  { id: 'module-clients', type: 'module', category: 'Módulos', title: 'Clientes', subtitle: 'Directorio de clientes', searchText: 'clientes contactos personas', icon: 'pi-users', color: 'cyan', route: '/contactos?tab=clientes', permission: 'clientes' },
  { id: 'module-invoices', type: 'module', category: 'Módulos', title: 'Facturas', subtitle: 'Historial de facturación', searchText: 'facturas ventas recibos', icon: 'pi-file', color: 'orange', route: '/ventas?tab=facturas', permission: 'facturas' },
  { id: 'module-workshop', type: 'module', category: 'Módulos', title: 'Órdenes de taller', subtitle: 'Reparaciones y servicio', searchText: 'taller ordenes reparaciones', icon: 'pi-wrench', color: 'rose', route: '/taller?tab=ordenes', permission: 'ordenes' },
  { id: 'module-accounting', type: 'module', category: 'Módulos', title: 'Contabilidad', subtitle: 'Caja, cuentas y gastos', searchText: 'contabilidad caja cuentas gastos', icon: 'pi-calculator', color: 'amber', route: '/contabilidad', permission: 'contabilidad' },
  { id: 'module-reports', type: 'module', category: 'Módulos', title: 'Reportes', subtitle: 'Métricas del negocio', searchText: 'reportes informes metricas', icon: 'pi-chart-bar', color: 'green', route: '/reportes', permission: 'reportes' },
  { id: 'module-settings', type: 'module', category: 'Módulos', title: 'Configuración', subtitle: 'Preferencias del sistema', searchText: 'configuracion ajustes sistema', icon: 'pi-cog', color: 'slate', route: '/configuracion', permission: 'configuracion' },
]

const normalize = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

const availableModules = computed(() => modules.filter(item => {
  if (item.permission === 'configuracion' && !auth.isAdmin && !auth.isSoporte) return false
  if (systemMode.isGeneralStore && ['module-phones', 'module-imei', 'module-workshop'].includes(item.id)) return false
  return auth.tienePermiso(item.permission)
}))
const results = computed(() => {
  const term = normalize(query.value)
  const source = [...availableModules.value, ...records.value]
  if (!term) return availableModules.value.slice(0, 9)
  const terms = term.split(/\s+/).filter(Boolean)
  return source
    .map(item => {
      const haystack = normalize(`${item.title} ${item.subtitle} ${item.searchText}`)
      if (!terms.every(part => haystack.includes(part))) return null
      const title = normalize(item.title)
      const score = title === term ? 0 : title.startsWith(term) ? 1 : item.type === 'record' ? 2 : 3
      return { item, score }
    })
    .filter(Boolean)
    .sort((a: any, b: any) => a.score - b.score || a.item.title.localeCompare(b.item.title))
    .slice(0, 24)
    .map((entry: any) => entry.item as SearchItem)
})

const groupedResults = computed(() => {
  const groups: { category: string; items: { item: SearchItem; index: number }[] }[] = []
  results.value.forEach((item, index) => {
    let group = groups.find(entry => entry.category === item.category)
    if (!group) {
      group = { category: item.category, items: [] }
      groups.push(group)
    }
    group.items.push({ item, index })
  })
  return groups
})

function record(item: Partial<SearchItem> & Pick<SearchItem, 'id' | 'category' | 'title' | 'route' | 'permission'>): SearchItem {
  return {
    type: 'record', subtitle: '', searchText: '', icon: 'pi-file', color: 'blue',
    ...item,
  }
}

async function readTable(name: string): Promise<any[]> {
  try {
    const result = await window.db.getAll(name)
    return result?.success && Array.isArray(result.data) ? result.data : []
  } catch {
    return []
  }
}

async function loadRecords(force = false) {
  if (!force && records.value.length && Date.now() - loadedAt < 60_000) return
  loading.value = true
  await warehouseStore.load()
  const allowed = (module: string, permission: string) => auth.tienePermiso(module) && auth.tienePermiso(permission)
  const tableNames = [
    !systemMode.isGeneralStore && allowed('inventario', 'telefonos') && 'telefonos',
    !systemMode.isGeneralStore && allowed('inventario', 'imei') && 'imei',
    allowed('inventario', 'accesorios') && 'accesorios', allowed('inventario', 'electrodomesticos') && 'electrodomesticos',
    allowed('contactos', 'clientes') && 'clientes', allowed('contactos', 'proveedores') && 'proveedores',
    allowed('ventas', 'facturas') && 'facturas', !systemMode.isGeneralStore && allowed('taller', 'ordenes') && 'ordenes_taller',
  ].filter(Boolean) as string[]
  const data = Object.fromEntries(await Promise.all(tableNames.map(async table => [table, await readTable(table)])))
  const items: SearchItem[] = []
  const scoped = (rows: any[] | undefined) => filterByAlmacen(rows || [])
  for (const row of scoped(data.telefonos)) items.push(record({ id: `telefono-${row.id}`, category: 'Teléfonos', title: row.nombre || `Teléfono #${row.id}`, subtitle: `Teléfono · #${row.id}`, searchText: `${row.id} ${row.marca_nombre || ''}`, icon: 'pi-mobile', color: 'indigo', route: '/inventario?tab=telefonos', permission: 'telefonos' }))
  for (const row of scoped(data.imei)) items.push(record({ id: `imei-${row.id}`, category: 'IMEI', title: row.nombre || row.imei || `IMEI #${row.id}`, subtitle: [row.color, row.capacidad, row.estado].filter(Boolean).join(' · ') || 'Inventario IMEI', searchText: `${row.id} ${row.id_equi || ''} ${row.telefono_nombre || ''}`, icon: 'pi-barcode', color: 'violet', route: '/inventario?tab=imei', permission: 'imei' }))
  for (const row of scoped(data.accesorios)) items.push(record({ id: `accesorio-${row.id}`, category: 'Productos', title: row.nombre || `Producto #${row.id}`, subtitle: `Stock: ${row.cantidad ?? 0}${row.marca_nombre ? ` · ${row.marca_nombre}` : ''}`, searchText: `${row.id} ${row.codigo || ''} ${row.codigo_barra || ''}`, icon: 'pi-box', color: 'sky', route: '/inventario?tab=accesorios', permission: 'accesorios' }))
  for (const row of scoped(data.electrodomesticos)) items.push(record({ id: `electronico-${row.id}`, category: 'Productos', title: row.nombre || `Electrónico #${row.id}`, subtitle: `Stock: ${row.cantidad ?? 0}${row.marca_nombre ? ` · ${row.marca_nombre}` : ''}`, searchText: `${row.id} ${row.serial || ''} ${row.codigo_barra || ''}`, icon: 'pi-sitemap', color: 'cyan', route: '/inventario?tab=electrodomesticos', permission: 'electrodomesticos' }))
  for (const row of scoped(data.clientes)) items.push(record({ id: `cliente-${row.id}`, category: 'Clientes', title: row.nombre || `Cliente #${row.id}`, subtitle: row.telefono || row.email || row.rnc || 'Cliente', searchText: `${row.id} ${row.telefono || ''} ${row.email || ''} ${row.rnc || ''} ${row.cedula || ''}`, icon: 'pi-user', color: 'cyan', route: '/contactos?tab=clientes', permission: 'clientes' }))
  for (const row of scoped(data.proveedores)) items.push(record({ id: `proveedor-${row.id}`, category: 'Proveedores', title: row.nombre || `Proveedor #${row.id}`, subtitle: row.telefono || row.email || 'Proveedor', searchText: `${row.id} ${row.telefono || ''} ${row.email || ''} ${row.rnc || ''}`, icon: 'pi-truck', color: 'amber', route: '/contactos?tab=proveedores', permission: 'proveedores' }))
  for (const row of scoped(data.facturas)) items.push(record({ id: `factura-${row.id}`, category: 'Facturas', title: `Factura ${row.no_factura || row.nofactura || row.numero || `#${row.id}`}`, subtitle: row.nombre_cliente || row.cliente_nombre || row.cliente || `Registro #${row.id}`, searchText: `${row.id} ${row.no_factura || ''} ${row.nofactura || ''} ${row.numero || ''} ${row.rnc || ''} ${row.ncf || ''} ${row.comprobante || ''} ${row.telefono_cliente || row.telefono || ''}`, icon: 'pi-file', color: 'orange', route: `/ventas/editar/${row.id}`, permission: 'facturas' }))
  for (const row of scoped(data.ordenes_taller)) items.push(record({ id: `orden-${row.id}`, category: 'Taller', title: row.no_orden || row.codigo || row.numero_orden || `Orden #${row.id}`, subtitle: row.nombre || row.cliente_nombre || row.cliente || row.equipo || 'Orden de taller', searchText: `${row.id} ${row.telefono || ''} ${row.imei || ''} ${row.serial || ''} ${row.marca_modelo || ''} ${row.estado || ''}`, icon: 'pi-wrench', color: 'rose', route: `/taller?tab=ordenes&search=${encodeURIComponent(row.no_orden || row.imei || row.telefono || row.nombre || '')}`, permission: 'ordenes' }))
  records.value = items
  loadedAt = Date.now()
  loading.value = false
}

async function open() {
  visible.value = true
  query.value = ''
  activeIndex.value = 0
  await nextTick()
  input.value?.focus()
  void loadRecords()
}

function close() {
  visible.value = false
}

async function select(item: SearchItem) {
  close()
  await router.push(item.route)
}

function onKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    visible.value ? close() : void open()
    return
  }
  if (!visible.value) return
  if (event.key === 'Escape') close()
  if (event.key === 'ArrowDown') { event.preventDefault(); activeIndex.value = Math.min(activeIndex.value + 1, results.value.length - 1) }
  if (event.key === 'ArrowUp') { event.preventDefault(); activeIndex.value = Math.max(activeIndex.value - 1, 0) }
  if (event.key === 'Enter' && results.value[activeIndex.value]) { event.preventDefault(); void select(results.value[activeIndex.value]) }
}

function onOpenEvent() { void open() }
function invalidateRecords() { records.value = []; loadedAt = 0 }

watch(query, () => { activeIndex.value = 0 })
watch(results, value => { if (activeIndex.value >= value.length) activeIndex.value = Math.max(0, value.length - 1) })
watch([() => warehouseStore.activeId, () => warehouseStore.activeUid], invalidateRecords)
onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('global-search:open', onOpenEvent)
  window.addEventListener('tmcloud:local-change', invalidateRecords)
  window.addEventListener('jarvis:data-change', invalidateRecords)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('global-search:open', onOpenEvent)
  window.removeEventListener('tmcloud:local-change', invalidateRecords)
  window.removeEventListener('jarvis:data-change', invalidateRecords)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="palette-fade">
      <div v-if="visible" class="global-search-backdrop" role="presentation" @mousedown.self="close">
        <section class="global-search-panel" role="dialog" aria-modal="true" aria-label="Búsqueda universal">
          <div class="global-search-input-wrap">
            <i class="pi pi-search"></i>
            <input ref="input" v-model="query" type="search" autocomplete="off" spellcheck="false" placeholder="Buscar teléfonos, IMEI, clientes, facturas…" aria-label="Buscar en TMPOS" />
            <span v-if="loading" class="global-search-loading"><i class="pi pi-spin pi-spinner"></i></span>
            <kbd>ESC</kbd>
          </div>

          <div class="global-search-results" role="listbox">
            <template v-if="results.length">
              <div v-for="group in groupedResults" :key="group.category" class="global-search-group">
                <p>{{ group.category }}</p>
                <button
                  v-for="entry in group.items"
                  :key="entry.item.id"
                  type="button"
                  class="global-search-result"
                  :class="{ 'global-search-result--active': activeIndex === entry.index }"
                  role="option"
                  :aria-selected="activeIndex === entry.index"
                  @mouseenter="activeIndex = entry.index"
                  @click="select(entry.item)"
                >
                  <span class="global-search-icon" :data-color="entry.item.color"><i class="pi" :class="entry.item.icon"></i></span>
                  <span class="global-search-copy"><strong>{{ entry.item.title }}</strong><small>{{ entry.item.subtitle }}</small></span>
                  <span class="global-search-kind">{{ entry.item.type === 'module' ? 'Abrir' : entry.item.category }}</span>
                  <i class="pi pi-arrow-right global-search-arrow"></i>
                </button>
              </div>
            </template>
            <div v-else-if="!loading" class="global-search-empty">
              <span><i class="pi pi-search"></i></span>
              <strong>Sin resultados</strong>
              <small>Prueba con un nombre, teléfono, número de factura o IMEI.</small>
            </div>
          </div>

          <footer class="global-search-footer">
            <span><kbd>↑</kbd><kbd>↓</kbd> Navegar</span>
            <span><kbd>↵</kbd> Abrir</span>
            <span class="global-search-footer-brand"><i class="pi pi-sparkles"></i> Búsqueda TMPOS</span>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.global-search-backdrop { position: fixed; inset: 0; z-index: 10000; display: flex; align-items: flex-start; justify-content: center; padding: min(13vh, 7rem) 1rem 1rem; background: rgb(2 6 23 / 0.46); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); }
.global-search-panel { width: min(44rem, 100%); max-height: min(72vh, 42rem); overflow: hidden; border: 1px solid var(--app-border); border-radius: 1.25rem; background: var(--app-surface-solid); color: var(--color-surface-900); box-shadow: 0 36px 100px -28px rgb(2 6 23 / 0.72), inset 0 1px 0 rgb(255 255 255 / 0.72); -webkit-backdrop-filter: saturate(170%) blur(32px); backdrop-filter: saturate(170%) blur(32px); }
:global(.dark) .global-search-panel { color: #f8fafc; }
:global(.glass) .global-search-panel { background: var(--app-surface-solid); }
.global-search-input-wrap { display: flex; align-items: center; gap: 0.8rem; padding: 1rem 1.1rem; border-bottom: 1px solid var(--app-border); }
.global-search-input-wrap > .pi-search { color: var(--p-primary-500); font-size: 1.1rem; }
.global-search-input-wrap input { min-width: 0; flex: 1; border: 0; outline: 0; background: transparent; color: inherit; font-size: 1rem; font-weight: 550; }
.global-search-input-wrap input::placeholder { color: var(--color-surface-400); font-weight: 450; }
.global-search-input-wrap input::-webkit-search-cancel-button { display: none; }
.global-search-input-wrap kbd, .global-search-footer kbd { border: 1px solid var(--app-border); border-radius: 0.38rem; background: var(--app-surface-muted); box-shadow: inset 0 -1px 0 var(--app-border); color: var(--color-surface-500); font-size: 0.62rem; font-weight: 700; padding: 0.2rem 0.38rem; }
.global-search-loading { color: var(--p-primary-500); }
.global-search-results { max-height: calc(min(72vh, 42rem) - 7.5rem); overflow-y: auto; padding: 0.55rem; }
.global-search-group > p { padding: 0.55rem 0.65rem 0.35rem; color: var(--color-surface-400); font-size: 0.65rem; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; }
.global-search-result { display: flex; width: 100%; align-items: center; gap: 0.75rem; padding: 0.62rem 0.7rem; border: 1px solid transparent; border-radius: 0.8rem; background: transparent; color: inherit; text-align: left; transition: background 120ms ease, border-color 120ms ease, transform 120ms ease; }
.global-search-result--active { border-color: color-mix(in srgb, var(--p-primary-500) 25%, transparent); background: color-mix(in srgb, var(--p-primary-500) 9%, transparent); }
.global-search-icon { display: flex; width: 2.25rem; height: 2.25rem; flex: 0 0 auto; align-items: center; justify-content: center; border: 1px solid color-mix(in srgb, var(--p-primary-500) 22%, transparent); border-radius: 0.7rem; background: color-mix(in srgb, var(--p-primary-500) 11%, transparent); color: var(--p-primary-600); }
.global-search-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 0.1rem; }
.global-search-copy strong { overflow: hidden; font-size: 0.82rem; font-weight: 680; text-overflow: ellipsis; white-space: nowrap; }
.global-search-copy small { overflow: hidden; color: var(--color-surface-500); font-size: 0.7rem; text-overflow: ellipsis; white-space: nowrap; }
.global-search-kind { color: var(--color-surface-400); font-size: 0.62rem; }
.global-search-arrow { color: var(--color-surface-400); font-size: 0.7rem; opacity: 0; transform: translateX(-3px); transition: opacity 120ms ease, transform 120ms ease; }
.global-search-result--active .global-search-arrow { opacity: 1; transform: none; }
.global-search-empty { display: flex; min-height: 15rem; flex-direction: column; align-items: center; justify-content: center; gap: 0.35rem; padding: 2rem; text-align: center; }
.global-search-empty > span { display: flex; width: 3rem; height: 3rem; align-items: center; justify-content: center; border-radius: 1rem; background: var(--app-surface-muted); color: var(--color-surface-400); }
.global-search-empty strong { margin-top: 0.45rem; font-size: 0.9rem; }
.global-search-empty small { color: var(--color-surface-500); font-size: 0.72rem; }
.global-search-footer { display: flex; align-items: center; gap: 1rem; padding: 0.65rem 1rem; border-top: 1px solid var(--app-border); background: var(--app-surface-muted); color: var(--color-surface-500); font-size: 0.65rem; }
.global-search-footer span { display: flex; align-items: center; gap: 0.28rem; }
.global-search-footer-brand { margin-left: auto; color: var(--p-primary-500); font-weight: 650; }
.palette-fade-enter-active, .palette-fade-leave-active { transition: opacity 160ms ease; }
.palette-fade-enter-active .global-search-panel, .palette-fade-leave-active .global-search-panel { transition: transform 180ms ease, opacity 160ms ease; }
.palette-fade-enter-from, .palette-fade-leave-to { opacity: 0; }
.palette-fade-enter-from .global-search-panel, .palette-fade-leave-to .global-search-panel { opacity: 0; transform: translateY(-10px) scale(0.98); }
@media (max-width: 640px) { .global-search-backdrop { padding: 0.6rem; align-items: center; } .global-search-panel { max-height: 88vh; } .global-search-results { max-height: calc(88vh - 7.5rem); } .global-search-kind { display: none; } .global-search-footer { gap: 0.65rem; } .global-search-footer-brand { display: none !important; } }
</style>
