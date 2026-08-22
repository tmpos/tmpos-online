<script setup lang="ts">
import { formatSystemDateTime } from '@/i18n/localeProfiles'
import { ref, onMounted } from 'vue'
import Button from 'primevue/button'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Fieldset from 'primevue/fieldset'
import Tag from 'primevue/tag'
import Toast from 'primevue/toast'
import { useToast } from 'primevue/usetoast'

type BackupItem = {
  nombre: string
  tamano: number
  fecha: string
}

const toast = useToast()
const backups = ref<BackupItem[]>([])
const loading = ref(false)
const creando = ref(false)
const restaurando = ref('')
const eliminando = ref('')
const descargando = ref('')

function formatSize(bytes: number) {
  if (!bytes) return '0 KB'
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  return `${(kb / 1024).toFixed(2)} MB`
}

function formatDate(value: string) {
  return formatSystemDateTime(value, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function cargarBackups() {
  loading.value = true
  try {
    const res = await window.electron.invoke('backup:list') as { success: boolean; data?: BackupItem[]; error?: string }
    if (res.success) {
      backups.value = res.data || []
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudieron listar los backups', life: 3000 })
    }
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 })
  } finally {
    loading.value = false
  }
}

async function crearBackup() {
  creando.value = true
  try {
    const res = await window.electron.invoke('backup:create') as { success: boolean; error?: string }
    if (res.success) {
      toast.add({ severity: 'success', summary: 'Backup creado', detail: 'La copia de seguridad fue creada', life: 2500 })
      await cargarBackups()
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo crear el backup', life: 3000 })
    }
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 })
  } finally {
    creando.value = false
  }
}

async function descargarBackup(backup: BackupItem) {
  descargando.value = backup.nombre
  try {
    const res = await window.electron.invoke('backup:download', backup.nombre) as { success: boolean; error?: string }
    if (res.success) {
      toast.add({ severity: 'success', summary: 'Descargado', detail: 'Backup guardado correctamente', life: 2500 })
    } else if (res.error) {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error, life: 3000 })
    }
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 })
  } finally {
    descargando.value = ''
  }
}

async function restaurarBackup(backup: BackupItem) {
  const ok = window.confirm(`Restaurar el backup "${backup.nombre}" reemplazara la base de datos actual. Deseas continuar?`)
  if (!ok) return

  restaurando.value = backup.nombre
  try {
    const res = await window.electron.invoke('backup:restore', backup.nombre) as { success: boolean; error?: string }
    if (res.success) {
      toast.add({ severity: 'success', summary: 'Restaurado', detail: 'Backup restaurado. La app se recargara.', life: 2500 })
      setTimeout(() => window.location.reload(), 1200)
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo restaurar', life: 3000 })
    }
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 })
  } finally {
    restaurando.value = ''
  }
}

async function eliminarBackup(backup: BackupItem) {
  const ok = window.confirm(`Eliminar el backup "${backup.nombre}"?`)
  if (!ok) return

  eliminando.value = backup.nombre
  try {
    const res = await window.electron.invoke('backup:delete', backup.nombre) as { success: boolean; error?: string }
    if (res.success) {
      toast.add({ severity: 'success', summary: 'Eliminado', detail: 'Backup eliminado', life: 2500 })
      await cargarBackups()
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo eliminar', life: 3000 })
    }
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 })
  } finally {
    eliminando.value = ''
  }
}

onMounted(cargarBackups)
</script>

<template>
  <div>
    <Toast />

    <Fieldset legend="Backups">
      <div class="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h3 class="font-semibold text-lg">Copias de seguridad</h3>
          <p class="text-sm text-surface-500">Crea, descarga, restaura o elimina backups de la base de datos local.</p>
        </div>
        <div class="flex items-center gap-2">
          <Button icon="pi pi-refresh" severity="secondary" outlined @click="cargarBackups" />
          <Button label="Crear Backup" icon="pi pi-save" :loading="creando" @click="crearBackup" />
        </div>
      </div>

      <DataTable
        :value="backups"
        :loading="loading"
        stripedRows
        paginator
        :rows="10"
        :rowsPerPageOptions="[10, 25, 50]"
        dataKey="nombre"
        responsiveLayout="scroll"
      >
        <Column header="Acciones" style="width: 12rem">
          <template #body="{ data }">
            <div class="flex gap-1">
              <Button
                icon="pi pi-download"
                severity="info"
                text
                rounded
                :loading="descargando === data.nombre"
                @click="descargarBackup(data)"
                v-tooltip="'Descargar'"
              />
              <Button
                icon="pi pi-history"
                severity="warn"
                text
                rounded
                :loading="restaurando === data.nombre"
                @click="restaurarBackup(data)"
                v-tooltip="'Restaurar'"
              />
              <Button
                icon="pi pi-trash"
                severity="danger"
                text
                rounded
                :loading="eliminando === data.nombre"
                @click="eliminarBackup(data)"
                v-tooltip="'Eliminar'"
              />
            </div>
          </template>
        </Column>
        <Column field="nombre" header="Archivo" sortable>
          <template #body="{ data }">
            <div class="flex items-center gap-2 min-w-0">
              <i class="pi pi-database text-primary"></i>
              <span class="font-mono text-sm truncate">{{ data.nombre }}</span>
            </div>
          </template>
        </Column>
        <Column field="fecha" header="Fecha" sortable style="width: 13rem">
          <template #body="{ data }">{{ formatDate(data.fecha) }}</template>
        </Column>
        <Column field="tamano" header="Tamano" sortable style="width: 8rem">
          <template #body="{ data }">
            <Tag :value="formatSize(data.tamano)" severity="secondary" />
          </template>
        </Column>

        <template #empty>
          <div class="text-center py-8 text-surface-500">
            No hay backups creados.
          </div>
        </template>
      </DataTable>
    </Fieldset>
  </div>
</template>
