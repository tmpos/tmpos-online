<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import Button from 'primevue/button'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import ToggleSwitch from 'primevue/toggleswitch'
import Dialog from 'primevue/dialog'
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'

type PrinterSource = 'installed' | 'bluetooth' | 'bluetooth-printer' | 'bluetooth-direct' | 'saved'

type PrinterDevice = {
  name: string
  model?: string
  deviceId?: string
  address?: string
  source?: PrinterSource
  portName?: string
}

const toast = useToast()
const loading = ref(false)
const escaneando = ref(false)
const escaneandoBT = ref(false)
const dialogBluetooth = ref(false)
const bluetoothTarget = ref<'ticket' | 'label'>('ticket')
const bluetoothDevices = ref<PrinterDevice[]>([])
const guardando = ref(false)

const printers = ref<PrinterDevice[]>([])
const labelPrinter = ref('')
const config = ref({
  id: 1,
  printer_name: '',
  printer_model: '',
  paper_width: 80,
  copies: 1,
  show_logo: 1,
  show_company_name: 1,
  show_legal: 1,
  show_phone: 1,
  show_address: 1,
  show_email: 1,
  show_cliente: 1,
  show_items: 1,
  show_totals: 1,
  show_barcode: 1,
  show_footer: 1,
  show_qr: 0,
  show_nota: 1,
  footer_text: 'Gracias por su compra',
  factura_logo_ancho: 150,
  factura_logo_alto: 90,
})

const selectedPrinter = ref<any>(null)

function normalizeName(value: unknown) {
  return String(value || '').trim()
}

function printerKey(printer: PrinterDevice) {
  return `${normalizeName(printer.name).toLowerCase()}|${normalizeName(printer.deviceId || printer.address).toLowerCase()}`
}

function mergePrinters(items: PrinterDevice[]) {
  const current = new Map(printers.value.map(printer => [printerKey(printer), printer]))
  for (const item of items) {
    const name = normalizeName(item.name)
    if (!name) continue
    const normalized = { ...item, name }
    const key = printerKey(normalized)
    const previous = current.get(key)
    current.set(key, { ...previous, ...normalized })
  }
  printers.value = Array.from(current.values()).sort((a, b) => a.name.localeCompare(b.name))
}

const printerOptions = computed(() =>
  printers.value.map(p => ({
    label: `${p.name}${p.model ? ` (${p.model})` : ''}${p.source?.includes('bluetooth') ? ' - Bluetooth' : ''}`,
    value: p.name,
  }))
)

const toggleItems = computed(() => [
  { key: 'show_logo', label: 'Logo', icon: 'pi pi-image' },
  { key: 'show_company_name', label: 'Nombre Empresa', icon: 'pi pi-building' },
  { key: 'show_legal', label: 'RNC / Legal', icon: 'pi pi-id-card' },
  { key: 'show_phone', label: 'Telefono', icon: 'pi pi-phone' },
  { key: 'show_address', label: 'Direccion', icon: 'pi pi-map-marker' },
  { key: 'show_email', label: 'Email', icon: 'pi pi-envelope' },
  { key: 'show_cliente', label: 'Cliente', icon: 'pi pi-user' },
  { key: 'show_items', label: 'Tabla Productos', icon: 'pi pi-table' },
  { key: 'show_totals', label: 'Totales', icon: 'pi pi-calculator' },
  { key: 'show_barcode', label: 'Codigo de Barras', icon: 'pi pi-qrcode' },
  { key: 'show_qr', label: 'Codigo QR', icon: 'pi pi-qrcode' },
  { key: 'show_nota', label: 'Nota', icon: 'pi pi-pencil' },
  { key: 'show_footer', label: 'Pie de Ticket', icon: 'pi pi-file' },
])

async function escanearImpresoras() {
  escaneando.value = true
  try {
    const res = await window.electron.invoke('getPrinters') as { success: boolean; data?: PrinterDevice[]; error?: string }
    if (res.success) {
      mergePrinters((res.data || []).map(printer => ({ ...printer, source: printer.source || 'installed' })))
      const installedCount = (res.data || []).length
      if (installedCount === 0) {
        toast.add({ severity: 'info', summary: 'Sin impresoras', detail: 'No se encontraron impresoras instaladas', life: 3000 })
      } else {
        toast.add({ severity: 'success', summary: 'Impresoras encontradas', detail: `${installedCount} impresora(s) instalada(s)`, life: 2000 })
      }
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudieron escanear impresoras', life: 3000 })
    }
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Error al escanear impresoras', life: 3000 })
  } finally {
    escaneando.value = false
  }
}

async function escanearBluetooth(target: 'ticket' | 'label' = 'ticket') {
  bluetoothTarget.value = target
  escaneandoBT.value = true
  try {
    const res = await window.electron.invoke('scan:bluetooth') as { success: boolean; data?: PrinterDevice[]; error?: string }
    if (res.success && res.data?.length > 0) {
      bluetoothDevices.value = res.data
      mergePrinters(res.data)
      dialogBluetooth.value = true
    } else {
      toast.add({ severity: 'info', summary: 'Bluetooth', detail: 'No se encontraron dispositivos Bluetooth', life: 3000 })
    }
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message || 'Error al buscar Bluetooth', life: 3000 })
  } finally {
    escaneandoBT.value = false
  }
}

function seleccionarBluetooth(device: PrinterDevice) {
  mergePrinters([{ ...device, model: device.model || 'Bluetooth', deviceId: device.deviceId || device.address }])
  if (bluetoothTarget.value === 'label' && device.source === 'bluetooth-direct' && device.portName) {
    setLabelPrinterDirect(device)
    dialogBluetooth.value = false
    toast.add({ severity: 'success', summary: 'Bluetooth directo guardado', detail: `${device.name} (${device.portName})`, life: 3000 })
    return
  }

  if (device.source !== 'bluetooth-printer') {
    toast.add({
      severity: 'warn',
      summary: 'Bluetooth detectado',
      detail: 'Este dispositivo no aparece como impresora instalada en Windows. Para imprimir, selecciona una impresora de la lista instalada.',
      life: 6000,
    })
    dialogBluetooth.value = false
    return
  }

  if (bluetoothTarget.value === 'label') {
    setLabelPrinter(device.name)
  } else {
    selectedPrinter.value = device.name
    onPrinterChange(device.name)
  }
  dialogBluetooth.value = false
  toast.add({ severity: 'success', summary: 'Seleccionado', detail: device.name, life: 2000 })
}

function onPrinterChange(name: string) {
  config.value.printer_name = name
  const found = printers.value.find(p => p.name === name)
  config.value.printer_model = found?.model || found?.name || name
}

async function cargarConfig() {
  loading.value = true
  labelPrinter.value = localStorage.getItem('etiquetas_printer') || ''
  try {
    const res = await window.db.getAll('impresoras_config')
    if (res.success && res.data?.length > 0) {
      const row = res.data[0]
      config.value = { ...config.value, ...row }
      if (row.printer_name) {
        selectedPrinter.value = row.printer_name
        mergePrinters([{
          name: row.printer_name,
          model: row.printer_model || row.printer_name,
          source: 'saved',
        }])
      }
    }
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
  }
}

async function guardar() {
  guardando.value = true
  try {
    const data: any = {}
    for (const key of Object.keys(config.value)) {
      if (key !== 'id' && key !== 'created_at' && key !== 'updated_at') {
        data[key] = (config.value as any)[key]
      }
    }
    const existing = await window.db.getAll('impresoras_config')
    const existe = existing.success && existing.data?.length > 0
    const res = existe
      ? await window.db.update('impresoras_config', existing.data[0].id, data)
      : await window.db.insert('impresoras_config', data)
    if (res.success) {
      toast.add({ severity: 'success', summary: 'Exito', detail: 'Configuracion guardada', life: 2000 })
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo guardar', life: 3000 })
    }
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Error al guardar', life: 3000 })
  } finally {
    guardando.value = false
  }
}

function setLabelPrinter(name: string) {
  labelPrinter.value = name
  localStorage.setItem('etiquetas_printer', name)
  localStorage.removeItem('etiquetas_printer_direct')
  toast.add({ severity: 'success', summary: 'Impresora de etiquetas guardada', life: 2000 })
}

function setLabelPrinterDirect(device: PrinterDevice) {
  labelPrinter.value = device.name
  localStorage.setItem('etiquetas_printer', device.name)
  localStorage.setItem('etiquetas_printer_direct', JSON.stringify({
    name: device.name,
    portName: device.portName,
    protocol: 'TSPL',
  }))
}

onMounted(async () => {
  await cargarConfig()
  escanearImpresoras()
})
</script>

<template>
  <div>
    <Toast />

    <div v-if="loading" class="text-center py-10 text-surface-500">Cargando configuracion...</div>

    <div v-else class="space-y-6">
      <div class="flex items-center gap-3 pb-2 border-b border-surface-200 dark:border-surface-700">
        <div class="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
          <i class="pi pi-print text-primary text-lg"></i>
        </div>
        <div>
          <h2 class="text-xl font-bold">Impresoras</h2>
          <p class="text-sm text-surface-500">Configuracion de impresora termica para tickets</p>
        </div>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div class="space-y-5">
          <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-5 space-y-4">
            <h3 class="font-semibold flex items-center gap-2">
              <i class="pi pi-search text-primary"></i>
              Seleccionar Impresora
            </h3>

            <div class="flex items-center gap-2 flex-wrap">
              <Button label="Buscar Impresoras" icon="pi pi-search" :loading="escaneando" @click="escanearImpresoras" />
              <Button label="Bluetooth" icon="pi pi-bluetooth" severity="info" :loading="escaneandoBT" @click="escanearBluetooth('ticket')" />
              <span v-if="printers.length > 0" class="text-sm text-surface-400">{{ printers.length }} encontrada(s)</span>
            </div>

            <div>
              <label class="text-sm font-semibold block mb-1.5">Impresora seleccionada</label>
              <Select
                v-model="selectedPrinter"
                :options="printerOptions"
                optionLabel="label"
                optionValue="value"
                :placeholder="escaneando ? 'Buscando impresoras instaladas...' : 'Selecciona una impresora instalada...'"
                :disabled="escaneando && printerOptions.length === 0"
                fluid
                @update:model-value="onPrinterChange"
              />
              <p v-if="!escaneando && printerOptions.length === 0" class="text-xs text-surface-400 mt-1.5">
                No se encontraron impresoras instaladas en Windows.
              </p>
            </div>

            <div v-if="config.printer_name" class="flex items-center gap-2 text-sm p-2.5 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <i class="pi pi-check-circle text-green-600"></i>
              <span class="text-green-700 dark:text-green-300 font-medium truncate">{{ config.printer_name }}</span>
            </div>

            <div class="space-y-1.5">
              <label class="text-sm font-semibold block">Ancho del papel (mm)</label>
              <div class="flex items-center gap-3">
                <InputNumber v-model="config.paper_width" :min="40" :max="120" class="w-24" fluid />
                <div class="flex gap-1">
                  <Button size="small" severity="secondary" text :class="config.paper_width === 58 ? 'font-bold text-primary' : ''" @click="config.paper_width = 58">58mm</Button>
                  <Button size="small" severity="secondary" text :class="config.paper_width === 80 ? 'font-bold text-primary' : ''" @click="config.paper_width = 80">80mm</Button>
                </div>
              </div>
            </div>

            <div class="space-y-1.5">
              <label class="text-sm font-semibold block">Copias</label>
              <div class="flex items-center gap-2">
                <InputNumber v-model="config.copies" :min="1" :max="10" class="w-20" fluid />
                <span class="text-xs text-surface-400">Cantidad de copias por ticket</span>
              </div>
            </div>
          </div>

          <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-5 space-y-4">
            <h3 class="font-semibold flex items-center gap-2">
              <i class="pi pi-file-pdf text-primary"></i>
              Logo en factura PDF
            </h3>
            <p class="text-sm text-surface-500">Define el espacio maximo que usara el logo de la empresa en las facturas.</p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div class="space-y-1.5">
                <label class="text-sm font-semibold block">Ancho (px)</label>
                <InputNumber v-model="config.factura_logo_ancho" :min="30" :max="400" :useGrouping="false" fluid />
              </div>
              <div class="space-y-1.5">
                <label class="text-sm font-semibold block">Alto (px)</label>
                <InputNumber v-model="config.factura_logo_alto" :min="20" :max="250" :useGrouping="false" fluid />
              </div>
            </div>
          </div>

          <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-5 space-y-4">
            <h3 class="font-semibold flex items-center gap-2">
              <i class="pi pi-qrcode text-primary"></i>
              Impresora de Etiquetas
            </h3>

            <div class="flex gap-2 items-center">
              <Select
                v-model="labelPrinter"
                :options="printerOptions"
                optionLabel="label"
                optionValue="value"
                placeholder="Seleccionar impresora de etiquetas..."
                class="flex-1"
                fluid
                @update:model-value="setLabelPrinter"
              />
              <Button icon="pi pi-search" severity="secondary" text rounded size="small" :loading="escaneando" @click="escanearImpresoras" v-tooltip="'Buscar impresoras'" />
              <Button icon="pi pi-bluetooth" severity="info" text rounded size="small" :loading="escaneandoBT" @click="escanearBluetooth('label')" v-tooltip="'Buscar Bluetooth'" />
            </div>

            <div v-if="labelPrinter" class="flex items-center gap-2 text-sm p-2.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <i class="pi pi-check-circle text-blue-600"></i>
              <span class="text-blue-700 dark:text-blue-300 font-medium truncate">{{ labelPrinter }}</span>
            </div>
              <p class="text-xs text-surface-400">Usada para imprimir etiquetas desde el inventario y el Disenador de Etiquetas</p>
          </div>

          <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-5 space-y-4">
            <h3 class="font-semibold flex items-center gap-2">
              <i class="pi pi-sliders-v text-primary"></i>
              Elementos del Ticket
            </h3>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div
                v-for="item in toggleItems"
                :key="item.key"
                class="flex items-center justify-between p-2.5 rounded-lg border border-surface-200 dark:border-surface-700 hover:border-primary-200 dark:hover:border-primary-700 transition-colors"
              >
                <div class="flex items-center gap-2.5 min-w-0">
                  <i :class="item.icon" class="text-surface-400 text-sm"></i>
                  <span class="text-sm font-medium truncate">{{ item.label }}</span>
                </div>
                <ToggleSwitch
                  v-model="(config as any)[item.key]"
                  :trueValue="1"
                  :falseValue="0"
                  class="flex-shrink-0"
                />
              </div>
            </div>

            <div v-if="config.show_footer" class="space-y-1.5 pt-2">
              <label class="text-sm font-semibold block">Texto del pie</label>
              <InputText v-model="config.footer_text" placeholder="Gracias por su compra" fluid />
            </div>
          </div>

          <div class="flex justify-end">
            <Button label="Guardar Configuracion" icon="pi pi-check" :loading="guardando" @click="guardar" />
          </div>
        </div>

        <div class="xl:sticky xl:top-4 self-start">
          <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-5 space-y-4">
            <h3 class="font-semibold flex items-center gap-2">
              <i class="pi pi-eye text-primary"></i>
              Vista Previa del Ticket
            </h3>

            <div
              class="mx-auto bg-white text-black text-[10px] leading-tight overflow-hidden rounded-lg shadow-lg"
              :style="{ width: config.paper_width === 58 ? '230px' : '280px', padding: config.paper_width === 58 ? '8px 6px' : '10px 8px', fontFamily: 'Arial, Helvetica, sans-serif' }"
            >
              <div class="w-full">
                <center id="top">
                  <div v-if="config.show_logo" class="flex justify-center mb-1">
                    <div class="w-16 h-10 bg-gray-100 flex items-center justify-center text-gray-400 border border-gray-200">
                      <i class="pi pi-image text-lg"></i>
                    </div>
                  </div>
                  <div v-else-if="config.show_company_name" class="font-bold text-lg leading-tight">MI EMPRESA SRL</div>

                  <div class="flex justify-between items-start text-center">
                    <p class="w-full m-0 leading-snug">
                      <template v-if="config.show_company_name && config.show_logo">
                        <span class="font-bold text-sm">MI EMPRESA SRL</span><br>
                      </template>
                      <template v-if="config.show_address">Calle Principal #123, Santo Domingo<br></template>
                      <template v-if="config.show_phone">Tel: (809) 000-0000</template>
                      <template v-if="config.show_email"> / correo de empresa</template>
                      <template v-if="config.show_legal"><br>RNC: 000000000</template>
                    </p>
                  </div>
                </center>

                <div class="border border-black rounded-[5px] pl-[5px] mt-1 text-left">
                  <div class="flex justify-between items-start">
                    <div>
                      <p class="m-0 py-1 leading-snug">
                        Fecha: 16/05/2026 02:30 PM<br>
                        DOC: <b style="font-size:16px">#F-20260516-1234</b><br>
                        NCF: B0200000001<br>
                        <template v-if="config.show_cliente">
                          CLIENTE: JUAN PEREZ<br>
                          CEDULA/RNC: 000000000<br>
                          TELEFONO: (809) 555-1234<br>
                        </template>
                        METODO DE PAGO: EFECTIVO
                      </p>
                    </div>
                  </div>
                </div>

                <div class="border border-black rounded-[5px] pl-[5px] mt-1 text-center py-1">
                  FACTURA DE VENTA
                </div>

                <table v-if="config.show_items" class="w-full border-separate border-spacing-0 mt-1 text-[10px]">
                  <thead>
                    <tr class="border-b-2 border-black">
                      <th class="text-left font-semibold py-1 border-b border-black">CANT.</th>
                      <th class="text-left font-semibold py-1 border-b border-black">EMPAQ.</th>
                      <th class="text-left font-semibold py-1 border-b border-black">PRECIO</th>
                      <th class="text-right font-semibold py-1 border-b border-black">TOTAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colspan="4" class="font-bold pt-1 break-words">iPhone 15 Pro</td>
                    </tr>
                    <tr>
                      <td class="pl-5 py-0.5">1 x</td>
                      <td class="py-0.5"></td>
                      <td class="py-0.5">RD$45000.00</td>
                      <td class="text-right py-0.5 font-bold">RD$45000.00</td>
                    </tr>
                    <tr>
                      <td colspan="4" class="font-bold pt-1 break-words">Case Silicon</td>
                    </tr>
                    <tr>
                      <td class="pl-5 py-0.5">2 x</td>
                      <td class="py-0.5"></td>
                      <td class="py-0.5">RD$250.00</td>
                      <td class="text-right py-0.5 font-bold">RD$500.00</td>
                    </tr>
                  </tbody>
                </table>

                <div v-if="config.show_totals" class="w-full border-t border-black pt-1 pb-1 mt-6 mb-1"></div>

                <div v-if="config.show_totals" class="font-bold">
                  <table class="w-full border-collapse">
                    <tbody>
                      <tr>
                        <td>SUBTOTAL:</td>
                        <td class="text-right"><span style="font-size:1.5em !important;">RD$45500.00</span></td>
                      </tr>
                      <tr>
                        <td>DESCUENTO:</td>
                        <td class="text-right"><span style="font-size:1.5em !important;">RD$0.00</span></td>
                      </tr>
                      <tr>
                        <td>ITBIS:</td>
                        <td class="text-right"><span style="font-size:1.5em !important;">RD$0.00</span></td>
                      </tr>
                      <tr>
                        <td>TOTAL:</td>
                        <td class="text-right"><span style="font-size:1.5em !important;">RD$45500.00</span></td>
                      </tr>
                      <tr>
                        <td>PAGO CON:</td>
                        <td class="text-right"><span style="font-size:1.5em !important;">RD$45500.00</span></td>
                      </tr>
                      <tr>
                        <td>SU CAMBIO:</td>
                        <td class="text-right"><span style="font-size:1.5em !important;">RD$0.00</span></td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div v-if="config.show_nota" class="border border-black rounded-[5px] p-2 mt-1 text-[9px]">
                  <p class="m-0 leading-snug">NOTA DEL CLIENTE: FAVOR DE ENTREGAR ANTES DE LAS 6PM</p>
                </div>

                <div v-if="config.show_barcode" class="flex justify-center my-2">
                  <div class="border border-black rounded-[5px] p-1 max-w-[150px]">
                    <div style="height:28px;width:140px;background:repeating-linear-gradient(90deg,#000 0,#000 2px,#fff 2px,#fff 4px,#000 4px,#000 5px,#fff 5px,#fff 8px);"></div>
                    <div class="text-[8px] text-center mt-0.5">F-20260516-1234</div>
                  </div>
                </div>

                <div v-if="config.show_qr" class="flex justify-center my-2">
                  <div class="border border-black rounded-[5px] p-1 max-w-[150px]">
                    <div class="grid grid-cols-5 grid-rows-5 gap-[2px] w-[70px] h-[70px] bg-white p-1">
                      <span class="bg-black"></span><span class="bg-black"></span><span></span><span class="bg-black"></span><span class="bg-black"></span>
                      <span class="bg-black"></span><span></span><span class="bg-black"></span><span></span><span class="bg-black"></span>
                      <span></span><span class="bg-black"></span><span class="bg-black"></span><span class="bg-black"></span><span></span>
                      <span class="bg-black"></span><span></span><span></span><span class="bg-black"></span><span class="bg-black"></span>
                      <span class="bg-black"></span><span class="bg-black"></span><span></span><span></span><span class="bg-black"></span>
                    </div>
                  </div>
                </div>

                <div v-if="config.show_footer" class="border-t border-black my-2"></div>

                <div v-if="config.show_footer" class="text-[10px] text-center">
                  {{ config.footer_text }}
                </div>
              </div>
            </div>

            <p class="text-xs text-center text-surface-400">Vista previa basada en el ticket real</p>
          </div>
        </div>
      </div>
    </div>
  </div>

    <Dialog v-model:visible="dialogBluetooth" :header="bluetoothTarget === 'label' ? 'Bluetooth para etiquetas' : 'Bluetooth para tickets'" modal :style="{ width: '32rem' }">
      <div class="space-y-3 pt-2">
        <p class="text-sm text-surface-500">Selecciona una impresora o dispositivo Bluetooth emparejado:</p>
        <div v-if="bluetoothDevices.length === 0" class="text-center py-6 text-surface-400 text-sm">No se encontraron dispositivos Bluetooth.</div>
        <div v-else class="flex flex-col gap-2 max-h-60 overflow-y-auto">
          <div
            v-for="d in bluetoothDevices" :key="d.deviceId || d.address || d.name"
            class="flex items-center justify-between p-3 rounded-lg border border-surface-200 dark:border-surface-700 hover:border-primary-300 hover:bg-surface-50 dark:hover:bg-surface-700/30 transition-all cursor-pointer"
            @click="seleccionarBluetooth(d)"
          >
            <div class="flex items-center gap-3">
              <i class="pi pi-bluetooth text-blue-500 text-lg"></i>
              <div>
                <p class="font-medium text-sm">{{ d.name }}</p>
                <p class="text-xs text-surface-400">
                  {{ d.source === 'bluetooth-printer' ? 'Impresora Bluetooth instalada' : d.source === 'bluetooth-direct' ? `Bluetooth directo ${d.portName}` : 'Dispositivo Bluetooth emparejado' }}
                </p>
                <p v-if="d.address || d.deviceId" class="text-xs text-surface-400 font-mono truncate max-w-72">{{ d.address || d.deviceId }}</p>
              </div>
            </div>
            <i class="pi pi-chevron-right text-surface-300"></i>
          </div>
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogBluetooth = false" />
        <Button label="Buscar de nuevo" icon="pi pi-refresh" severity="info" :loading="escaneandoBT" @click="escanearBluetooth(bluetoothTarget)" />
      </template>
    </Dialog>
</template>
