<script setup lang="ts">
import { useLocaleProfile } from '@/composables/useLocaleProfile'

const { currency: systemCurrency, locale: systemLocale } = useLocaleProfile()
import { computed, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import Textarea from 'primevue/textarea'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'

const toast = useToast()
const cuentas = ref<any[]>([])
const cargando = ref(false)
const busqueda = ref('')
const tipoFiltro = ref('')
const dialogVisible = ref(false)
const confirmarEliminar = ref(false)
const editando = ref(false)
const cuentaSeleccionada = ref<any>(null)

const tipos = ['ACTIVO', 'PASIVO', 'PATRIMONIO', 'INGRESOS', 'GASTOS']
const naturalezas = ['DEUDORA', 'ACREEDORA']
const estados = ['ACTIVA', 'INACTIVA']
const formVacio = () => ({ codigo: '', nombre: '', tipo: 'ACTIVO', subtipo: 'CORRIENTE', naturaleza: 'DEUDORA', saldo_inicial: 0, estado: 'ACTIVA', descripcion: '' })
const form = ref(formVacio())

const cuentasFiltradas = computed(() => {
  const texto = busqueda.value.toLowerCase().trim()
  return cuentas.value.filter((cuenta: any) =>
    (!tipoFiltro.value || cuenta.tipo === tipoFiltro.value) &&
    (!texto || [cuenta.codigo, cuenta.nombre, cuenta.subtipo, cuenta.descripcion].some(valor => String(valor || '').toLowerCase().includes(texto)))
  )
})

const resumen = computed(() => tipos.map(tipo => ({ tipo, cantidad: cuentas.value.filter((cuenta: any) => cuenta.tipo === tipo && cuenta.estado === 'ACTIVA').length })))

function severidadTipo(tipo: string) {
  return ({ ACTIVO: 'success', PASIVO: 'danger', PATRIMONIO: 'info', INGRESOS: 'warn', GASTOS: 'secondary' } as Record<string, any>)[tipo] || 'secondary'
}

async function cargarCuentas() {
  cargando.value = true
  try {
    const res = await window.db.getAll('catalogo_cuentas')
    if (res.success) cuentas.value = (res.data || []).sort((a: any, b: any) => String(a.codigo).localeCompare(String(b.codigo), undefined, { numeric: true }))
    else throw new Error(res.error)
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudo cargar el catálogo', life: 3000 })
  } finally { cargando.value = false }
}

function abrirCrear() {
  editando.value = false
  cuentaSeleccionada.value = null
  form.value = formVacio()
  dialogVisible.value = true
}

function abrirEditar(cuenta: any) {
  editando.value = true
  cuentaSeleccionada.value = cuenta
  form.value = { codigo: cuenta.codigo || '', nombre: cuenta.nombre || '', tipo: cuenta.tipo || 'ACTIVO', subtipo: cuenta.subtipo || '', naturaleza: cuenta.naturaleza || 'DEUDORA', saldo_inicial: Number(cuenta.saldo_inicial || 0), estado: cuenta.estado || 'ACTIVA', descripcion: cuenta.descripcion || '' }
  dialogVisible.value = true
}

async function guardar() {
  const data = { ...form.value, codigo: form.value.codigo.trim(), nombre: form.value.nombre.trim().toUpperCase(), subtipo: form.value.subtipo.trim().toUpperCase(), descripcion: form.value.descripcion.trim().toUpperCase() }
  if (!data.codigo || !data.nombre) {
    toast.add({ severity: 'warn', summary: 'Datos requeridos', detail: 'El código y nombre son obligatorios', life: 3000 })
    return
  }
  const repetida = cuentas.value.find((cuenta: any) => String(cuenta.codigo) === data.codigo && cuenta.id !== cuentaSeleccionada.value?.id)
  if (repetida) {
    toast.add({ severity: 'warn', summary: 'Código duplicado', detail: 'Ya existe una cuenta con este código', life: 3000 })
    return
  }
  try {
    const res = editando.value ? await window.db.update('catalogo_cuentas', cuentaSeleccionada.value.id, data) : await window.db.insert('catalogo_cuentas', data)
    if (!res.success) throw new Error(res.error)
    dialogVisible.value = false
    toast.add({ severity: 'success', summary: editando.value ? 'Actualizada' : 'Creada', detail: data.nombre, life: 2500 })
    await cargarCuentas()
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudo guardar la cuenta', life: 3000 })
  }
}

async function eliminar() {
  if (!cuentaSeleccionada.value) return
  try {
    const res = await window.db.delete('catalogo_cuentas', cuentaSeleccionada.value.id)
    if (!res.success) throw new Error(res.error)
    confirmarEliminar.value = false
    toast.add({ severity: 'success', summary: 'Eliminada', detail: 'Cuenta eliminada del catálogo', life: 2500 })
    await cargarCuentas()
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudo eliminar la cuenta', life: 3000 })
  }
}

onMounted(cargarCuentas)
</script>

<template>
  <div class="p-3 sm:p-5">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
      <div><h2 class="text-xl font-bold">Catálogo de Cuentas</h2><p class="text-sm text-surface-500">Organiza las cuentas contables de tu negocio.</p></div>
      <Button label="Nueva cuenta" icon="pi pi-plus" @click="abrirCrear" />
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
      <button v-for="item in resumen" :key="item.tipo" type="button" class="text-left rounded-xl border p-3 transition-colors" :class="tipoFiltro === item.tipo ? 'border-primary bg-primary-50 dark:bg-primary-900/20' : 'border-surface-200 dark:border-surface-700 hover:border-primary-300'" @click="tipoFiltro = tipoFiltro === item.tipo ? '' : item.tipo">
        <p class="text-xs text-surface-500">{{ item.tipo }}</p><p class="text-xl font-bold">{{ item.cantidad }}</p>
      </button>
    </div>

    <div class="rounded-xl border border-surface-200 dark:border-surface-700 p-4">
      <div class="flex flex-col sm:flex-row gap-2 mb-4"><InputText v-model="busqueda" placeholder="Buscar por código, nombre o subtipo..." fluid /><Select v-model="tipoFiltro" :options="tipos" placeholder="Todos los tipos" showClear class="sm:w-52" /></div>
      <DataTable :value="cuentasFiltradas" :loading="cargando" paginator :rows="12" :rowsPerPageOptions="[12, 25, 50]" dataKey="id" stripedRows responsiveLayout="scroll">
        <Column field="codigo" header="Código" sortable style="width: 8rem"><template #body="{ data }"><span class="font-mono font-semibold">{{ data.codigo }}</span></template></Column>
        <Column field="nombre" header="Cuenta" sortable><template #body="{ data }"><p class="font-semibold">{{ data.nombre }}</p><p v-if="data.descripcion" class="text-xs text-surface-400">{{ data.descripcion }}</p></template></Column>
        <Column field="tipo" header="Tipo" sortable style="width: 9rem"><template #body="{ data }"><Tag :value="data.tipo" :severity="severidadTipo(data.tipo)" /></template></Column>
        <Column field="subtipo" header="Subtipo" sortable style="width: 10rem" />
        <Column field="naturaleza" header="Naturaleza" style="width: 9rem" />
        <Column field="saldo_inicial" header="Saldo inicial" sortable style="width: 10rem"><template #body="{ data }">{{ $formatMoney(data.saldo_inicial) }}</template></Column>
        <Column field="estado" header="Estado" style="width: 8rem"><template #body="{ data }"><Tag :value="data.estado" :severity="data.estado === 'ACTIVA' ? 'success' : 'secondary'" /></template></Column>
        <Column header="Acciones" style="width: 8rem"><template #body="{ data }"><Button icon="pi pi-pencil" severity="info" text rounded @click="abrirEditar(data)" /><Button icon="pi pi-trash" severity="danger" text rounded @click="cuentaSeleccionada = data; confirmarEliminar = true" /></template></Column>
        <template #empty><div class="text-center py-8 text-surface-400">No hay cuentas para mostrar.</div></template>
      </DataTable>
    </div>

    <Dialog v-model:visible="dialogVisible" :header="editando ? 'Editar cuenta' : 'Nueva cuenta'" modal :style="{ width: 'min(38rem, 95vw)' }">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
        <div class="flex flex-col gap-1"><label class="text-sm font-semibold">Código *</label><InputText v-model="form.codigo" placeholder="Ej.: 1101" fluid /></div>
        <div class="flex flex-col gap-1"><label class="text-sm font-semibold">Nombre *</label><InputText v-model="form.nombre" placeholder="Nombre de la cuenta" fluid /></div>
        <div class="flex flex-col gap-1"><label class="text-sm font-semibold">Tipo</label><Select v-model="form.tipo" :options="tipos" fluid /></div>
        <div class="flex flex-col gap-1"><label class="text-sm font-semibold">Subtipo</label><InputText v-model="form.subtipo" placeholder="Ej.: CORRIENTE" fluid /></div>
        <div class="flex flex-col gap-1"><label class="text-sm font-semibold">Naturaleza</label><Select v-model="form.naturaleza" :options="naturalezas" fluid /></div>
        <div class="flex flex-col gap-1"><label class="text-sm font-semibold">Estado</label><Select v-model="form.estado" :options="estados" fluid /></div>
        <div class="flex flex-col gap-1 sm:col-span-2"><label class="text-sm font-semibold">Saldo inicial</label><InputNumber v-model="form.saldo_inicial" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid /></div>
        <div class="flex flex-col gap-1 sm:col-span-2"><label class="text-sm font-semibold">Descripción</label><Textarea v-model="form.descripcion" rows="3" fluid /></div>
      </div>
      <template #footer><Button label="Cancelar" severity="secondary" text @click="dialogVisible = false" /><Button label="Guardar" icon="pi pi-check" @click="guardar" /></template>
    </Dialog>

    <Dialog v-model:visible="confirmarEliminar" header="Eliminar cuenta" modal :style="{ width: 'min(26rem, 95vw)' }"><p>¿Deseas eliminar la cuenta <strong>{{ cuentaSeleccionada?.nombre }}</strong>?</p><template #footer><Button label="Cancelar" severity="secondary" text @click="confirmarEliminar = false" /><Button label="Eliminar" icon="pi pi-trash" severity="danger" @click="eliminar" /></template></Dialog>
  </div>
</template>
