<script setup lang="ts">
import { ref, onMounted } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'

import { envioElectron } from '@/funciones/funciones.js'
import { useAlmacenFilter } from '@/composables/useAlmacenFilter'

const toast = useToast()
const { addAlmacenId } = useAlmacenFilter()
const dialogVisible = ref(false)

const camposArray = [
  'nombre', 'cedula', 'telefono', 'email',
  'equipo', 'imei', 'serial', 'marca_modelo', 'clave',
  'accesorios', 'fallas', 'piezas',
  'tecnico', 'metodo_pago', 'fecha_entrada', 'fecha_entrega', 'estado',
  'precio_pieza', 'mano_obra', 'abono', 'pendiente', 'total', 'pagos',
  'beneficio_empresa', 'beneficio_tecnico', 'porcentaje_tecnico', 'estado_pago_tecnico',
]

const form = ref({
  nombre: '',
  equipo: '',
  fallas: '',
})

function abrir() {
  form.value = { nombre: '', equipo: '', fallas: '' }
  dialogVisible.value = true
}

async function guardar() {
  if (!form.value.nombre.trim()) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'El nombre es requerido', life: 3000 })
    return
  }

  try {
    const data: any = {
      nombre: form.value.nombre.trim().toUpperCase(),
      equipo: form.value.equipo.trim().toUpperCase(),
      fallas: form.value.fallas.trim().toUpperCase(),
      estado: 'RECIBIDO',
      fecha_entrada: new Date().toISOString().split('T')[0],
    }

    const res = await window.db.insert('ordenes_taller', addAlmacenId(data))
    if (res.success) {
      toast.add({ severity: 'success', summary: 'Exito', detail: 'Orden creada correctamente', life: 3000 })
      dialogVisible.value = false
      form.value = { nombre: '', equipo: '', fallas: '' }
    }
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Error al crear la orden', life: 3000 })
  }
}

onMounted(async () => {
  try {
    await envioElectron('datosarchivo')
  } catch (error) {
    console.error('Error cargando configuracion:', error)
  }
})
</script>

<template>
  <div>
    <Toast />

    <div class="flex flex-col items-center justify-center py-10 gap-4">
      <i class="pi pi-bolt text-5xl text-primary"></i>
      <h3 class="text-xl font-bold">Orden Express</h3>
      <p class="text-surface-500 dark:text-surface-400 text-center">Crea una orden de taller rapida con solo los datos esenciales.</p>
      <Button label="Crear Orden Rapida" icon="pi pi-bolt" size="large" @click="abrir" />
    </div>

    <!-- Modal Orden Express -->
    <Dialog
      v-model:visible="dialogVisible"
      header="Nueva Orden Express"
      modal
      :style="{ width: '28rem' }"
    >
      <div class="flex flex-col gap-4 pt-2">
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Nombre <span class="text-red-500">*</span></label>
          <InputText v-model="form.nombre" placeholder="Nombre del cliente" fluid class="uppercase" style="text-transform: uppercase;" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Equipo</label>
          <InputText v-model="form.equipo" placeholder="Equipo" fluid class="uppercase" style="text-transform: uppercase;" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Fallas</label>
          <Textarea v-model="form.fallas" placeholder="Fallas reportadas" rows="3" fluid class="uppercase" style="text-transform: uppercase;" />
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogVisible = false" />
        <Button label="Guardar" icon="pi pi-check" @click="guardar" />
      </template>
    </Dialog>
  </div>
</template>
