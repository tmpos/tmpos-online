<script setup lang="ts">
import { getSystemLocale } from '@/i18n/localeProfiles'
import { ref, onMounted } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'

const toast = useToast()
const cuentas = ref<any[]>([])
const loading = ref(false)

const dialogVisible = ref(false)
const isEditing = ref(false)
const form = ref({ nombre: '', numero_cuenta: '', moneda: 'PESOS', saldo: 0 })
const selectedId = ref<number | null>(null)
const guardando = ref(false)
const dialogTransacciones = ref(false)
const bancoTransacciones = ref<any>(null)
const transacciones = ref<any[]>([])
const cargandoTransacciones = ref(false)
const eliminandoTransaccionId = ref<number | null>(null)

const monedas = [
  { label: 'PESOS', value: 'PESOS' },
  { label: 'DOLARES', value: 'DOLARES' },
  { label: 'EUROS', value: 'EUROS' },
]

function formatCurrency(n: number): string {
  return Number(n || 0).toLocaleString(getSystemLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

async function ensureTable() {
  try {
    const res = await window.db.getAll('banco_transacciones')
    if (!res.success) throw new Error(res.error || 'No se pudo preparar la tabla de transacciones bancarias')
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudo preparar la tabla de transacciones bancarias', life: 3500 })
  }
}

async function cargarCuentas() {
  loading.value = true
  try {
    const res = await window.db.getAll('bancos')
    if (res.success) cuentas.value = res.data || []
  } catch (_) {}
  loading.value = false
}

function abrirNueva() {
  isEditing.value = false
  selectedId.value = null
  form.value = { nombre: '', numero_cuenta: '', moneda: 'PESOS', saldo: 0 }
  dialogVisible.value = true
}

function abrirEditar(cuenta: any) {
  isEditing.value = true
  selectedId.value = cuenta.id
  form.value = {
    nombre: cuenta.nombre || '',
    numero_cuenta: cuenta.numero_cuenta || '',
    moneda: cuenta.moneda || 'PESOS',
    saldo: cuenta.saldo || 0,
  }
  dialogVisible.value = true
}

async function guardar() {
  if (!form.value.nombre.trim()) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'El nombre es requerido', life: 3000 })
    return
  }
  guardando.value = true
  try {
    const data = {
      nombre: form.value.nombre.trim().toUpperCase(),
      numero_cuenta: form.value.numero_cuenta.trim(),
      moneda: form.value.moneda,
      saldo: Number(form.value.saldo),
      updated_at: new Date().toISOString(),
    }
    let res
    if (isEditing.value && selectedId.value) {
      res = await window.db.update('bancos', selectedId.value, data)
    } else {
      data.created_at = new Date().toISOString()
      res = await window.db.insert('bancos', data)
    }
    if (res.success) {
      toast.add({ severity: 'success', summary: isEditing.value ? 'Actualizada' : 'Creada', detail: 'Cuenta bancaria guardada', life: 3000 })
      dialogVisible.value = false
      await cargarCuentas()
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error, life: 3000 })
    }
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.message, life: 3000 })
  } finally {
    guardando.value = false
  }
}

async function eliminar(cuenta: any) {
  if (!confirm(`Eliminar cuenta "${cuenta.nombre}"?`)) return
  try {
    await window.db.delete('bancos', cuenta.id)
    toast.add({ severity: 'info', summary: 'Eliminada', detail: 'Cuenta bancaria eliminada', life: 3000 })
    await cargarCuentas()
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.message, life: 3000 })
  }
}

function formatFechaHora(value: any): string {
  const fecha = new Date(String(value || ''))
  return Number.isNaN(fecha.getTime()) ? String(value || '-') : fecha.toLocaleString(getSystemLocale())
}

function tipoSeverity(tipo: string): 'success' | 'danger' | 'info' {
  if (tipo === 'ENTRADA') return 'success'
  if (tipo === 'SALIDA') return 'danger'
  return 'info'
}

async function cargarTransacciones() {
  if (!bancoTransacciones.value?.id) return
  cargandoTransacciones.value = true
  try {
    const res = await window.db.getAll('banco_transacciones') as any
    if (!res?.success) throw new Error(res?.error || 'No se pudieron cargar las transacciones')
    const bancoId = Number(bancoTransacciones.value.id)
    const bancoUid = String(bancoTransacciones.value.uid || '').trim()
    transacciones.value = (res.data || [])
      .filter((transaccion: any) => {
        const transaccionBancoUid = String(transaccion.banco_uid || '').trim()
        if (bancoUid && transaccionBancoUid) return transaccionBancoUid === bancoUid
        return Number(transaccion.banco_id) === bancoId
      })
      .sort((a: any, b: any) => {
        const fechaA = new Date(String(a.created_at || '')).getTime() || 0
        const fechaB = new Date(String(b.created_at || '')).getTime() || 0
        return fechaB - fechaA || Number(b.id || 0) - Number(a.id || 0)
      })
  } catch (error: any) {
    transacciones.value = []
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudieron cargar las transacciones', life: 3000 })
  } finally {
    cargandoTransacciones.value = false
  }
}

async function abrirTransacciones(cuenta: any) {
  bancoTransacciones.value = cuenta
  transacciones.value = []
  dialogTransacciones.value = true
  await cargarTransacciones()
}

async function eliminarTransaccion(transaccion: any) {
  const signo = transaccion.tipo === 'SALIDA' ? '-' : '+'
  if (!confirm(`Eliminar esta transaccion de ${signo}${formatCurrency(transaccion.monto)}? El saldo del banco sera recalculado.`)) return
  eliminandoTransaccionId.value = Number(transaccion.id)
  try {
    const bancosRes = await window.db.getAll('bancos') as any
    if (!bancosRes?.success) throw new Error(bancosRes?.error || 'No se pudo consultar la cuenta bancaria')

    const bancoUid = String(transaccion.banco_uid || bancoTransacciones.value?.uid || '').trim()
    const bancoId = Number(transaccion.banco_id || bancoTransacciones.value?.id)
    const banco = (bancosRes.data || []).find((item: any) => {
      if (bancoUid && String(item.uid || '').trim()) return String(item.uid).trim() === bancoUid
      return Number(item.id) === bancoId
    })
    if (!banco) throw new Error('No se encontro la cuenta bancaria asociada')

    const saldoActual = Number(banco.saldo || 0)
    const efectoTransaccion = Number(transaccion.saldo_nuevo || 0) - Number(transaccion.saldo_anterior || 0)
    const saldoNuevo = saldoActual - efectoTransaccion
    const ahora = new Date().toISOString()
    const actualizarRes = await window.db.update('bancos', banco.id, {
      saldo: saldoNuevo,
      fecha_transaccion: ahora,
      updated_at: ahora,
    }) as any
    if (!actualizarRes?.success) throw new Error(actualizarRes?.error || 'No se pudo revertir el saldo bancario')

    const eliminarRes = await window.db.delete('banco_transacciones', transaccion.id) as any
    if (!eliminarRes?.success) {
      await window.db.update('bancos', banco.id, {
        saldo: saldoActual,
        fecha_transaccion: banco.fecha_transaccion || '',
        updated_at: banco.updated_at || ahora,
      })
      throw new Error(eliminarRes?.error || 'No se pudo eliminar la transaccion')
    }

    toast.add({ severity: 'success', summary: 'Transaccion eliminada', detail: `Nuevo saldo: ${formatCurrency(saldoNuevo)}`, life: 3000 })
    await Promise.all([cargarCuentas(), cargarTransacciones()])
    bancoTransacciones.value = cuentas.value.find((item: any) => Number(item.id) === Number(bancoTransacciones.value?.id)) || bancoTransacciones.value
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudo eliminar la transaccion', life: 3500 })
  } finally {
    eliminandoTransaccionId.value = null
  }
}

onMounted(async () => {
  await ensureTable()
  await cargarCuentas()
})
</script>

<template>
  <div>
    <Toast />

    <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-5">
      <div class="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h3 class="text-xl font-bold">Bancos</h3>
          <p class="text-sm text-surface-500">Cuentas bancarias y saldos</p>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <Button label="Nueva Cuenta" icon="pi pi-plus" @click="abrirNueva" />
        </div>
      </div>

      <DataTable :value="cuentas" :loading="loading" stripedRows paginator :rows="10" dataKey="id" responsiveLayout="scroll">
        <Column header="Acciones" style="width: 7rem">
          <template #body="{ data }">
            <div class="flex gap-1">
              <Button icon="pi pi-list" severity="secondary" text rounded size="small" @click="abrirTransacciones(data)" v-tooltip="'Ver transacciones'" />
              <Button icon="pi pi-pencil" severity="info" text rounded size="small" @click="abrirEditar(data)" v-tooltip="'Editar'" />
              <Button icon="pi pi-trash" severity="danger" text rounded size="small" @click="eliminar(data)" v-tooltip="'Eliminar'" />
            </div>
          </template>
        </Column>
        <Column field="nombre" header="Nombre" sortable />
        <Column field="numero_cuenta" header="No. Cuenta" sortable />
        <Column field="moneda" header="Moneda" sortable style="width: 7rem">
          <template #body="{ data }">
            <Tag :value="data.moneda" :severity="data.moneda === 'PESOS' ? 'info' : data.moneda === 'DOLARES' ? 'success' : 'warn'" />
          </template>
        </Column>
        <Column field="saldo" header="Saldo" sortable style="width: 10rem">
          <template #body="{ data }">
            <span :class="data.saldo >= 0 ? 'text-green-600 font-bold' : 'text-red-600 font-bold'">{{ $formatMoney(data.saldo) }}</span>
          </template>
        </Column>
        <template #empty>
          <div class="text-center py-6 text-surface-500">No hay cuentas bancarias.</div>
        </template>
      </DataTable>

      <div v-if="cuentas.length" class="flex justify-end mt-4 pt-4 border-t border-surface-200 dark:border-surface-700">
        <div class="text-right">
          <div class="text-xs text-surface-500 uppercase tracking-wider">Saldo Total</div>
          <div class="text-2xl font-bold text-primary-600">{{ $formatMoney(cuentas.reduce((s, c) => s + Number(c.saldo || 0), 0)) }}</div>
        </div>
      </div>
    </div>

    <Dialog v-model:visible="dialogVisible" :header="isEditing ? 'Editar Cuenta Bancaria' : 'Nueva Cuenta Bancaria'" modal :style="{ width: 'min(22rem, calc(100vw - 2rem))' }" :draggable="false">
      <div class="space-y-4 pt-2">
        <div class="flex flex-col gap-1">
          <label class="text-sm font-semibold">Nombre <span class="text-red-500">*</span></label>
          <InputText v-model="form.nombre" placeholder="Nombre del banco" fluid class="uppercase" style="text-transform: uppercase" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-semibold">No. Cuenta</label>
          <InputText v-model="form.numero_cuenta" placeholder="Numero de cuenta" fluid />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-semibold">Moneda</label>
          <Select v-model="form.moneda" :options="monedas" optionLabel="label" optionValue="value" fluid />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-semibold">Saldo inicial</label>
          <InputNumber v-model="form.saldo" fluid @focus="(e: any) => e.target.select()" />
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogVisible = false" />
        <Button label="Guardar" icon="pi pi-check" :loading="guardando" @click="guardar" />
      </template>
    </Dialog>

    <Dialog v-model:visible="dialogTransacciones" :header="`Transacciones · ${bancoTransacciones?.nombre || ''}`" modal :style="{ width: 'min(68rem, calc(100vw - 2rem))' }" :draggable="false">
      <div class="space-y-4 pt-1">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div class="rounded-xl bg-surface-100 dark:bg-surface-800 p-3"><div class="text-xs text-surface-500">Cuenta</div><div class="font-semibold">{{ bancoTransacciones?.numero_cuenta || 'Sin numero' }}</div></div>
          <div class="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 p-3"><div class="text-xs text-surface-500">Saldo actual</div><div class="font-bold text-emerald-600">{{ $formatMoney(bancoTransacciones?.saldo || 0) }}</div></div>
          <div class="rounded-xl bg-blue-50 dark:bg-blue-950/30 p-3"><div class="text-xs text-surface-500">Movimientos</div><div class="font-bold text-blue-600">{{ transacciones.length }}</div></div>
        </div>

        <DataTable :value="transacciones" :loading="cargandoTransacciones" stripedRows paginator :rows="10" dataKey="id" responsiveLayout="scroll">
          <Column field="created_at" header="Fecha" sortable style="min-width: 11rem"><template #body="{ data }">{{ formatFechaHora(data.created_at) }}</template></Column>
          <Column field="tipo" header="Tipo" sortable style="width: 7rem"><template #body="{ data }"><Tag :value="data.tipo" :severity="tipoSeverity(data.tipo)" /></template></Column>
          <Column field="concepto" header="Concepto" style="min-width: 14rem"><template #body="{ data }"><div class="font-medium">{{ data.concepto || 'Movimiento bancario' }}</div><div v-if="data.referencia" class="text-xs text-surface-500">{{ data.referencia_tipo || 'Ref.' }}: {{ data.referencia }}</div></template></Column>
          <Column field="usuario" header="Usuario" style="min-width: 8rem" />
          <Column field="monto" header="Monto" sortable style="min-width: 9rem"><template #body="{ data }"><span class="font-bold" :class="data.tipo === 'SALIDA' ? 'text-red-600' : 'text-emerald-600'">{{ data.tipo === 'SALIDA' ? '-' : '+' }}{{ $formatMoney(data.monto) }}</span></template></Column>
          <Column field="saldo_nuevo" header="Saldo resultante" style="min-width: 10rem"><template #body="{ data }">{{ $formatMoney(data.saldo_nuevo) }}</template></Column>
          <Column header="Accion" style="width: 5rem"><template #body="{ data }"><Button icon="pi pi-trash" severity="danger" text rounded size="small" :loading="eliminandoTransaccionId === Number(data.id)" @click="eliminarTransaccion(data)" v-tooltip="'Eliminar y revertir saldo'" /></template></Column>
          <template #empty><div class="text-center py-8 text-surface-500">No hay transacciones registradas para esta cuenta.</div></template>
        </DataTable>
        <p class="text-xs text-amber-600 dark:text-amber-400"><i class="pi pi-info-circle mr-1"></i>Eliminar una transaccion revierte su efecto sobre el saldo actual del banco.</p>
      </div>
      <template #footer><Button label="Cerrar" severity="secondary" text @click="dialogTransacciones = false" /></template>
    </Dialog>
  </div>
</template>
