<script setup lang="ts">
import { getSystemLocale } from '@/i18n/localeProfiles'
import { ref, computed, onMounted } from 'vue'
import Button from 'primevue/button'
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'
import { useAlmacenFilter } from '@/composables/useAlmacenFilter'

const toast = useToast()
const { filterByAlmacen } = useAlmacenFilter()
const loading = ref(false)

const resumen = ref({
  cobrar: { total: 0, abonado: 0, saldo: 0, cantidad: 0 },
  pagar: { total: 0, abonado: 0, saldo: 0, cantidad: 0 },
})

const totalActivo = computed(() => resumen.value.cobrar.saldo)
const totalPasivo = computed(() => resumen.value.pagar.saldo)
const capital = computed(() => totalActivo.value - totalPasivo.value)

function formatCurrency(n: number): string {
  return Number(n || 0).toLocaleString(getSystemLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

async function cargarDatos() {
  loading.value = true
  try {
    const [cobrarRes, pagarRes] = await Promise.all([
      window.db.getAll('cuentas_cobrar'),
      window.db.getAll('cuentas_pagar'),
    ])

    if (cobrarRes.success && cobrarRes.data) {
      const activas = filterByAlmacen(cobrarRes.data).filter((c: any) => c.estado !== 'PAGADA')
      resumen.value.cobrar = {
        total: activas.reduce((s: number, c: any) => s + Number(c.total || 0), 0),
        abonado: activas.reduce((s: number, c: any) => s + Number(c.abonado || 0), 0),
        saldo: activas.reduce((s: number, c: any) => s + Number(c.saldo || 0), 0),
        cantidad: activas.length,
      }
    }
    if (pagarRes.success && pagarRes.data) {
      const activas = filterByAlmacen(pagarRes.data).filter((c: any) => c.estado !== 'PAGADA')
      resumen.value.pagar = {
        total: activas.reduce((s: number, c: any) => s + Number(c.total || 0), 0),
        abonado: activas.reduce((s: number, c: any) => s + Number(c.abonado || 0), 0),
        saldo: activas.reduce((s: number, c: any) => s + Number(c.saldo || 0), 0),
        cantidad: activas.length,
      }
    }
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

onMounted(cargarDatos)
</script>

<template>
  <div>
    <Toast />
    <div class="space-y-5">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-xl font-bold">Balance General</h3>
          <p class="text-sm text-surface-500">Resumen financiero del negocio</p>
        </div>
        <Button icon="pi pi-refresh" severity="secondary" @click="cargarDatos" :loading="loading" />
      </div>

      <div v-if="loading" class="text-center py-10 text-surface-500">Cargando...</div>

      <div v-else class="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <!-- Activos -->
        <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-5 space-y-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600"><i class="pi pi-arrow-down-left"></i></div>
            <div>
              <h4 class="font-bold">Activos</h4>
              <p class="text-xs text-surface-500">Cuentas por Cobrar ({{ resumen.cobrar.cantidad }})</p>
            </div>
          </div>

          <div class="space-y-2 text-sm">
            <div class="flex justify-between py-2 border-b border-surface-100 dark:border-surface-700">
              <span class="text-surface-500">Total cuentas</span>
              <span class="font-semibold">${{ formatCurrency(resumen.cobrar.total) }}</span>
            </div>
            <div class="flex justify-between py-2 border-b border-surface-100 dark:border-surface-700">
              <span class="text-surface-500">Abonado</span>
              <span class="font-semibold text-green-600">${{ formatCurrency(resumen.cobrar.abonado) }}</span>
            </div>
            <div class="flex justify-between py-2 text-lg font-bold">
              <span>Saldo por cobrar</span>
              <span class="text-green-700 dark:text-green-400">${{ formatCurrency(resumen.cobrar.saldo) }}</span>
            </div>
          </div>
        </div>

        <!-- Pasivos -->
        <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-5 space-y-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600"><i class="pi pi-arrow-up-right"></i></div>
            <div>
              <h4 class="font-bold">Pasivos</h4>
              <p class="text-xs text-surface-500">Cuentas por Pagar ({{ resumen.pagar.cantidad }})</p>
            </div>
          </div>

          <div class="space-y-2 text-sm">
            <div class="flex justify-between py-2 border-b border-surface-100 dark:border-surface-700">
              <span class="text-surface-500">Total cuentas</span>
              <span class="font-semibold">${{ formatCurrency(resumen.pagar.total) }}</span>
            </div>
            <div class="flex justify-between py-2 border-b border-surface-100 dark:border-surface-700">
              <span class="text-surface-500">Pagado</span>
              <span class="font-semibold text-green-600">${{ formatCurrency(resumen.pagar.abonado) }}</span>
            </div>
            <div class="flex justify-between py-2 text-lg font-bold">
              <span>Saldo por pagar</span>
              <span class="text-red-700 dark:text-red-400">${{ formatCurrency(resumen.pagar.saldo) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Resumen final -->
      <div v-if="!loading" class="rounded-xl border-2 border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/10 p-5">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
          <div>
            <div class="text-xs text-surface-500 uppercase tracking-wider">Total Activos</div>
            <div class="text-2xl font-bold text-green-700 dark:text-green-400">${{ formatCurrency(totalActivo) }}</div>
          </div>
          <div>
            <div class="text-xs text-surface-500 uppercase tracking-wider">Total Pasivos</div>
            <div class="text-2xl font-bold text-red-700 dark:text-red-400">${{ formatCurrency(totalPasivo) }}</div>
          </div>
          <div>
            <div class="text-xs text-surface-500 uppercase tracking-wider">Capital</div>
            <div class="text-2xl font-bold" :class="capital >= 0 ? 'text-blue-700 dark:text-blue-400' : 'text-red-700 dark:text-red-400'">${{ formatCurrency(capital) }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
