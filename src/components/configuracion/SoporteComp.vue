<script setup lang="ts">
import { ref, onMounted } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import Textarea from 'primevue/textarea'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import TabView from 'primevue/tabview'
import TabPanel from 'primevue/tabpanel'
import ToggleSwitch from 'primevue/toggleswitch'
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'

import { useAlmacenStore } from '@/stores/almacen.store'
import { useAuthStore } from '@/stores/auth.store'
const toast = useToast()
const almacenStore = useAlmacenStore()
const auth = useAuthStore()

const tablas = ref<string[]>([])
const tablaActiva = ref('')
const columnas = ref<any[]>([])
const columnasInfo = ref<any[]>([])
const filas = ref<any[]>([])
const cargando = ref(false)
const limite = ref(100)
const formNuevoCampo = ref({ nombre: '', tipo: 'TEXT', nulo: true, defecto: '' })
const camposNuevos = ref<{ nombre: string; tipo: string; requerido: boolean; defecto: string }[]>([])
const nombreNuevaTabla = ref('')
const incluirTimestamps = ref(true)

const dialogEditar = ref(false)
const editarFila = ref<any>(null)
const editForm = ref<Record<string, any>>({})
const dialogNuevo = ref(false)
const nuevoForm = ref<Record<string, any>>({})
const dialogDelete = ref(false)
const eliminarFila = ref<any>(null)
const dialogVaciar = ref(false)
const vaciando = ref(false)
const dialogEliminarTabla = ref(false)
const eliminandoTabla = ref(false)

const tiposColumna = ['TEXT', 'INTEGER', 'REAL', 'NUMERIC', 'BLOB']

const sqlInput = ref('')
const sqlRows = ref<any[]>([])
const sqlColumns = ref<string[]>([])
const sqlResultado = ref<number | string | null>(null)
const sqlError = ref('')
const sqlEjecutando = ref(false)
const sqlTiempo = ref<number | null>(null)

const utilTablaReset = ref('')
const utilTablaDatos = ref('')
const utilTablaInfo = ref('')
const utilTablaExport = ref('')
const utilCantidad = ref(10)
const utilTipoDatos = ref('generico')
const utilCargando = ref(false)
const utilInfoResultado = ref<Record<string, any> | null>(null)
const utilColumnaTabla = ref('')
const utilColumnaNombre = ref('')
const utilColumnaValor = ref('')
const utilColumnaColumnas = ref<string[]>([])
const configPortable = ref<any>(null)
const configPortableRuta = ref('')
const configPortableResultado = ref('')
const configPortableCargando = ref(false)
const utilAlmacenUidTabla = ref('')
const utilAlmacenUidCargando = ref(false)

const adminTabla = ref('')
const adminTablaInfo = ref<Record<string, any> | null>(null)
const adminTablaCargando = ref(false)
const adminTablaDialog = ref(false)
const adminTablaAccion = ref<'empty' | 'drop' | ''>('')
const adminTablaConfirmacion = ref('')

const extAbierta = ref(false)
const extRuta = ref('')
const extTablas = ref<string[]>([])
const extTablaActiva = ref('')
const extColumnas = ref<string[]>([])
const extFilas = ref<any[]>([])
const extTotalRegistros = ref(0)
const extCargando = ref(false)
const extCopiando = ref(false)

const permUsuarios = ref<any[]>([])
const permGuardando = ref(false)

const modulosPermisos = [
  { key: 'inicio', label: 'Inicio', icon: 'pi pi-home' },
  { key: 'inventario', label: 'Inventario', icon: 'pi pi-box' },
  { key: 'contactos', label: 'Contactos', icon: 'pi pi-address-book' },
  { key: 'ventas', label: 'Ventas', icon: 'pi pi-shopping-cart' },
  { key: 'reportes', label: 'Reportes', icon: 'pi pi-chart-bar' },
  { key: 'contabilidad', label: 'Contabilidad', icon: 'pi pi-calculator' },
  { key: 'taller', label: 'Taller', icon: 'pi pi-wrench' },
  { key: 'configuracion', label: 'Configuracion', icon: 'pi pi-cog' },
  { key: 'soporte', label: 'Soporte', icon: 'pi pi-shield' },
]

const tiposDatosFicticios = [
  { label: 'Generico (item 1, item 2...)', value: 'generico' },
  { label: 'Nombres de personas', value: 'nombres' },
  { label: 'Productos', value: 'productos' },
  { label: 'Direcciones', value: 'direcciones' },
  { label: 'Fechas aleatorias', value: 'fechas' },
]

async function exportarConfiguracionPortable() {
  configPortableCargando.value = true
  try {
    const res = await (window as any).electron.invoke('portable-config:export')
    if (res?.canceled) return
    if (!res?.success) throw new Error(res?.error || 'No se pudo exportar')
    configPortable.value = res.data
    configPortableRuta.value = res.path || ''
    configPortableResultado.value = `${res.data.schema.tables.length} tablas y ${res.data.settings?.length || 0} configuraciones exportadas.`
    toast.add({ severity: 'success', summary: 'JSON exportado', detail: configPortableResultado.value, life: 4000 })
  } catch (e: any) { toast.add({ severity: 'error', summary: 'Error', detail: e.message, life: 5000 }) }
  finally { configPortableCargando.value = false }
}

async function importarConfiguracionPortable() {
  configPortableCargando.value = true
  try {
    const res = await (window as any).electron.invoke('portable-config:import')
    if (res?.canceled) return
    if (!res?.success) throw new Error(res?.error || 'No se pudo importar')
    configPortable.value = res.data
    configPortableRuta.value = res.path || ''
    configPortableResultado.value = `Archivo cargado: ${res.data.schema.tables.length} tablas. Pulsa Aplicar para actualizar este sistema.`
    toast.add({ severity: 'info', summary: 'Configuracion cargada', detail: 'Revisa el resumen y pulsa Aplicar JSON.', life: 4500 })
  } catch (e: any) { toast.add({ severity: 'error', summary: 'JSON no valido', detail: e.message, life: 5500 }) }
  finally { configPortableCargando.value = false }
}

async function aplicarConfiguracionPortable() {
  if (!configPortable.value) return
  configPortableCargando.value = true
  try {
    const configuracionPlana = JSON.parse(JSON.stringify(configPortable.value))
    const res = await (window as any).electron.invoke('portable-config:apply', configuracionPlana)
    if (!res?.success) throw new Error(res?.error || 'No se pudo aplicar')
    configPortableResultado.value = `${res.data.tablesCreated.length} tablas creadas, ${res.data.columnsAdded.length} campos agregados y ${res.data.tablesUnchanged.length} tablas sin cambios.`
    await cargarTablas()
    toast.add({ severity: 'success', summary: 'JSON aplicado', detail: configPortableResultado.value, life: 5000 })
  } catch (e: any) { toast.add({ severity: 'error', summary: 'Error', detail: e.message, life: 5500 }) }
  finally { configPortableCargando.value = false }
}

async function aplicarDatosPortable() {
  configPortableCargando.value = true
  try {
    const defaultsPlanos = configPortable.value?.defaults ? JSON.parse(JSON.stringify(configPortable.value.defaults)) : undefined
    const res = await (window as any).electron.invoke('portable-config:seed-defaults', defaultsPlanos)
    if (!res?.success) throw new Error(res?.error || 'No se pudieron crear los datos')
    configPortableResultado.value = `${res.data.inserted.length} datos creados y ${res.data.existing.length} ya existentes.`
    toast.add({ severity: 'success', summary: 'Datos iniciales listos', detail: configPortableResultado.value, life: 4500 })
  } catch (e: any) { toast.add({ severity: 'error', summary: 'Error', detail: e.message, life: 5500 }) }
  finally { configPortableCargando.value = false }
}

const abrirDevTools = () => {
  const usuario = auth.user?.usuario || auth.user?.email || auth.user?.nombre || ''
  try { (window as any).electron.invoke('open:devtools', usuario) } catch (_) {}
}

const licenciaDialogVisible = ref(false)
const licenciaDias = ref(30)
const licenciaNombre = ref('')
const licenciaEncargado = ref('')
const licenciaTelefono = ref('')
const licenciaEmail = ref('')
const licenciaDireccion = ref('')
const licenciaGuardando = ref(false)
const licenciaError = ref('')

async function abrirDialogoLicencia() {
  licenciaDias.value = 30
  licenciaNombre.value = ''
  licenciaEncargado.value = ''
  licenciaTelefono.value = ''
  licenciaEmail.value = ''
  licenciaDireccion.value = ''
  licenciaError.value = ''
  licenciaDialogVisible.value = true
}

function generarLink(nombre: string) {
  return (nombre || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50)
}

function generarToken(equipo: string) {
  return Date.now().toString() + '-' + (equipo || 'XXXXXXXXXXXX')
}

function generarLicenciaNumerica() {
  const n = () => Math.floor(Math.random() * 100000).toString().padStart(5, '0')
  return `${n()}-${n()}`
}

async function registrarLicenciaSoporte() {
  licenciaError.value = ''
  if (!licenciaNombre.value.trim()) { licenciaError.value = 'El nombre de la empresa es requerido'; return }
  if (!licenciaDias.value || licenciaDias.value < 1) { licenciaError.value = 'Los dias deben ser mayor a 0'; return }
  licenciaGuardando.value = true
  try {
    const macRes = await (window as any).electron.invoke('licencia:getMacAddress')
    if (!macRes.success) { licenciaError.value = macRes.error || 'No se pudo obtener el codigo del equipo'; return }
    const equipo = macRes.data.mac
    const cifrada = macRes.data.cifrada
    const codigo = generarLicenciaNumerica()
    const now = new Date().toISOString().replace('T', ' ').split('.')[0]
    const fechaVenc = new Date(Date.now() + licenciaDias.value * 86400000).toISOString().replace('T', ' ').split('.')[0]
    const payload = {
      nombre: licenciaNombre.value.trim(),
      link: generarLink(licenciaNombre.value.trim()),
      token: generarToken(equipo),
      licencia: codigo,
      estado: 'PENDIENTE',
      tipo: 'UN_EQUIPO',
      dispositivos: JSON.stringify([equipo]),
      ultimopago: now,
      proximopago: fechaVenc,
      precio: '0.00',
      encargado: licenciaEncargado.value.trim(),
      telefono: licenciaTelefono.value.trim(),
      email: licenciaEmail.value.trim(),
      direccion: licenciaDireccion.value.trim(),
      usuario: '',
      identificadordb: equipo || cifrada,
      created_at: now,
      updated_at: now,
    }
    console.log('[Soporte] Consulta de licencia preparada', { campos: Object.keys(payload || {}) })
    const result = await (window as any).electron.invoke('licencia:registrar', payload)
    console.log('[Soporte] Result:', JSON.stringify(result))
    if (!result.success) { licenciaError.value = result.error || 'Error al registrar la licencia'; return }
    const info = await (window as any).electron.invoke('licencia:getInfo')
    console.log('[Soporte] Licencia local:', JSON.stringify(info))
    const dbRows = await (window as any).db.getAll('licencia')
    console.log('[Soporte] Consulta de licencia completada', { filas: Array.isArray(dbRows) ? dbRows.length : 0 })
    toast.add({ severity: 'success', summary: 'Licencia registrada', detail: `${licenciaDias.value} dia(s) - ${codigo}`, life: 4000 })
    licenciaDialogVisible.value = false
  } catch (e: any) { licenciaError.value = e.message || 'Error al registrar la licencia' }
  finally { licenciaGuardando.value = false }
}

async function cargarTablas() {
  try {
    const raw = await window.electron.invoke('consultaservidor', 'getAllTables', '')
    if (raw?.data?.length) { tablas.value = raw.data; return }
  } catch (_) {}
  try {
    const raw = await window.electron.invoke('consultaservidor', 'getAllTables')
    if (raw?.data?.length) { tablas.value = raw.data; return }
  } catch (_) {}
}

async function seleccionarTabla(tabla: string) {
  tablaActiva.value = tabla
  cargando.value = true
  try {
    const rawInfo = await window.electron.invoke('consultaservidor', 'getTableColumns', tabla)
    columnasInfo.value = Array.isArray(rawInfo) ? rawInfo : []
    const cols = await window.electron.invoke('consultaservidor', 'getTableColumns', tabla, 'names')
    columnas.value = Array.isArray(cols) ? cols.map((c: string) => ({ name: c })) : []
    const filasRes = await window.db.getAll(tabla)
    if (filasRes.success) filas.value = (filasRes.data || []).slice(0, limite.value)
    else filas.value = []
  } catch (error) {
    console.error(error)
    filas.value = []
  }
  cargando.value = false
}

function abrirEditar(fila: any) {
  editarFila.value = fila
  editForm.value = { ...fila }
  dialogEditar.value = true
}

async function guardarEdicion() {
  if (!tablaActiva.value || !editarFila.value) return
  try {
    const id = editarFila.value.id
    const data: any = {}
    for (const col of columnas.value) {
      const key = typeof col === 'string' ? col : col.name
      if (key !== 'id' && key !== 'created_at' && key !== 'updated_at') data[key] = editForm.value[key]
    }
    const res = await window.db.update(tablaActiva.value, id, data)
    if (res.success) {
      toast.add({ severity: 'success', summary: 'Actualizado', detail: 'Registro actualizado', life: 2000 })
      dialogEditar.value = false
      await seleccionarTabla(tablaActiva.value)
    } else toast.add({ severity: 'error', summary: 'Error', detail: res.error, life: 3000 })
  } catch (error: any) { toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 }) }
}

async function agregarColumna() {
  if (!tablaActiva.value || !formNuevoCampo.value.nombre.trim()) return
  const nombre = formNuevoCampo.value.nombre.trim()
  const tipo = formNuevoCampo.value.tipo
  try {
    const sql = `ALTER TABLE "${tablaActiva.value}" ADD COLUMN "${nombre}" ${tipo}${formNuevoCampo.value.nulo ? '' : ' NOT NULL'}${formNuevoCampo.value.defecto ? ` DEFAULT '${formNuevoCampo.value.defecto}'` : ''}`
    await window.electron.invoke('consultaservidor', 'rawQuery', sql)
    toast.add({ severity: 'success', summary: 'Columna agregada', detail: `${nombre} ${tipo}`, life: 2000 })
    formNuevoCampo.value = { nombre: '', tipo: 'TEXT', nulo: true, defecto: '' }
    await seleccionarTabla(tablaActiva.value)
  } catch (error: any) { toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 }) }
}

function agregarCampoNuevo() { camposNuevos.value.push({ nombre: '', tipo: 'TEXT', requerido: false, defecto: '' }) }
function quitarCampoNuevo(index: number) { camposNuevos.value.splice(index, 1) }

async function crearTabla() {
  if (!nombreNuevaTabla.value.trim()) { toast.add({ severity: 'warn', summary: 'Atencion', detail: 'Nombre de tabla requerido', life: 3000 }); return }
  const nombre = nombreNuevaTabla.value.trim()
  const campos = camposNuevos.value.filter(c => c.nombre.trim())
  if (campos.length === 0) { toast.add({ severity: 'warn', summary: 'Atencion', detail: 'Agrega al menos un campo', life: 3000 }); return }
  try {
    let sql = `CREATE TABLE "${nombre}" (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n`
    for (const c of campos) sql += `  "${c.nombre.trim()}" ${c.tipo}${c.requerido ? ' NOT NULL' : ''}${c.defecto ? ` DEFAULT '${c.defecto}'` : ''},\n`
    if (incluirTimestamps.value) sql += `  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n`
    else sql = sql.replace(/,\n$/, '\n')
    sql += ')'
    await window.electron.invoke('consultaservidor', 'rawQuery', sql)
    toast.add({ severity: 'success', summary: 'Tabla creada', detail: nombre, life: 2000 })
    nombreNuevaTabla.value = ''
    camposNuevos.value = []
    await cargarTablas()
  } catch (error: any) { toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 }) }
}

function abrirNuevo() {
  nuevoForm.value = {}
  for (const col of columnas.value) {
    const key = typeof col === 'string' ? col : col.name
    if (key !== 'id' && key !== 'created_at' && key !== 'updated_at') nuevoForm.value[key] = ''
  }
  dialogNuevo.value = true
}

async function guardarNuevo() {
  if (!tablaActiva.value) return
  try {
    const data: any = {}
    for (const col of columnas.value) {
      const key = typeof col === 'string' ? col : col.name
      if (key !== 'id' && key !== 'created_at' && key !== 'updated_at') data[key] = nuevoForm.value[key] ?? ''
    }
    const res = await window.db.insert(tablaActiva.value, data)
    if (res.success) { toast.add({ severity: 'success', summary: 'Creado', detail: 'Registro agregado', life: 2000 }); dialogNuevo.value = false; await seleccionarTabla(tablaActiva.value) }
    else toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo crear', life: 3000 })
  } catch (error: any) { toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 }) }
}

function confirmarBorrar(fila: any) { eliminarFila.value = fila; dialogDelete.value = true }

async function borrar() {
  if (!tablaActiva.value || !eliminarFila.value?.id) return
  try {
    const res = await window.db.delete(tablaActiva.value, eliminarFila.value.id)
    if (res.success) { toast.add({ severity: 'success', summary: 'Eliminado', detail: 'Registro eliminado', life: 2000 }); dialogDelete.value = false; await seleccionarTabla(tablaActiva.value) }
    else toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo eliminar', life: 3000 })
  } catch (error: any) { toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 }) }
}

async function exportarCSV() {
  if (!tablaActiva.value || filas.value.length === 0) return
  const cols = Object.keys(filas.value[0])
  let csv = cols.join(',') + '\n'
  for (const f of filas.value) csv += cols.map(c => { const v = f[c]; return v === null || v === undefined ? '' : `"${String(v).replace(/"/g, '""')}"` }).join(',') + '\n'
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `${tablaActiva.value}.csv`; a.click()
  URL.revokeObjectURL(url)
  toast.add({ severity: 'success', summary: 'Exportado', detail: `${tablaActiva.value}.csv`, life: 2000 })
}

async function exportarSQL() {
  const tablaExportar = tablaActiva.value === '__utilidades__' ? utilTablaExport.value : tablaActiva.value
  if (!tablaExportar) return
  try {
    const createRes = await window.electron.invoke('consultaservidor', 'getCreateTableSQL', tablaExportar) as any
    const dataRes = await window.db.getAll(tablaExportar)
    if (!dataRes.success || !dataRes.data) { toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudieron obtener los datos', life: 3000 }); return }
    const columnRes = await window.electron.invoke('consultaservidor', 'getTableColumns', tablaExportar, 'names') as any
    const cols = Array.isArray(columnRes) ? columnRes : []
    let sql = (createRes?.sql || `CREATE TABLE "${tablaExportar}"`) + ';\n\n'
    for (const row of dataRes.data) {
      const values = cols.map(c => {
        const v = row[c]
        if (v === null || v === undefined) return 'NULL'
        if (typeof v === 'number') return String(v)
        return `'${String(v).replace(/'/g, "''")}'`
      })
      sql += `INSERT INTO "${tablaExportar}" (${cols.join(', ')}) VALUES (${values.join(', ')});\n`
    }
    const blob = new Blob([sql], { type: 'text/sql' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${tablaExportar}.sql`; a.click()
    URL.revokeObjectURL(url)
    toast.add({ severity: 'success', summary: 'Exportado', detail: `${tablaExportar}.sql`, life: 2000 })
  } catch (error: any) { toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 }) }
}

async function ejecutarSQL() {
  if (!sqlInput.value.trim()) return
  sqlEjecutando.value = true
  sqlError.value = ''
  sqlRows.value = []
  sqlColumns.value = []
  sqlResultado.value = null
  sqlTiempo.value = null
  const inicio = performance.now()
  try {
    const res = await window.electron.invoke('consultaservidor', 'executeSQL', sqlInput.value.trim()) as any
    const fin = performance.now()
    sqlTiempo.value = Math.round(fin - inicio)
    if (!res.success) { sqlError.value = res.error; toast.add({ severity: 'error', summary: 'Error SQL', detail: res.error, life: 5000 }); return }
    if (res.type === 'select') {
      sqlRows.value = res.rows
      sqlColumns.value = res.columns
      sqlResultado.value = res.count
    } else {
      sqlResultado.value = `${res.changes} fila(s) afectadas`
    }
  } catch (e: any) { sqlError.value = e.message || 'Error al ejecutar SQL'; toast.add({ severity: 'error', summary: 'Error SQL', detail: e.message || 'Error al ejecutar SQL', life: 5000 }) }
  finally { sqlEjecutando.value = false }
}

function valorFicticio(colName: string, colType: string, tipoGeneracion: string) {
  const rng = () => Math.floor(Math.random() * 1000) + 1
  const nom = ['Juan', 'Maria', 'Carlos', 'Ana', 'Pedro', 'Laura', 'Jose', 'Sofia', 'Luis', 'Carmen', 'Miguel', 'Elena', 'Jorge', 'Rosa', 'David', 'Isabel']
  const ape = ['Garcia', 'Martinez', 'Lopez', 'Rodriguez', 'Fernandez', 'Gonzalez', 'Perez', 'Sanchez', 'Ramirez', 'Torres', 'Flores', 'Rivera', 'Morales', 'Ortiz', 'Cruz', 'Reyes']
  const prods = ['Arroz', 'Frijoles', 'Aceite', 'Azucar', 'Sal', 'Harina', 'Leche', 'Pan', 'Huevos', 'Cafe', 'Queso', 'Jabon', 'Detergente', 'Cloro', 'Papel', 'Velas']
  const dirs = ['Calle Principal 123', 'Av. Independencia 45', 'Calle Duarte 67', 'Av. Lincoln 89', 'Calle Conde 12', 'Av. Churchill 34', 'Calle Del Sol 56', 'Av. Sarasota 78']

  const lowerName = colName.toLowerCase()
  if (lowerName === 'id' || lowerName.includes('codigo')) return `'${colName.toUpperCase()}-${rng()}'`
  if (lowerName.includes('nombre') || lowerName.includes('descripcion')) {
    if (tipoGeneracion === 'productos') return `'${prods[rng() % prods.length]} ${rng()}'`
    if (tipoGeneracion === 'nombres') return `'${nom[rng() % nom.length]} ${ape[rng() % ape.length]}'`
    return `'${nom[rng() % nom.length]} ${ape[rng() % ape.length]}'`
  }
  if (lowerName.includes('email') || lowerName.includes('correo')) return `'${nom[rng() % nom.length].toLowerCase()}.${ape[rng() % ape.length].toLowerCase()}${rng()}@mail.com'`
  if (lowerName.includes('telefono') || lowerName.includes('celular') || lowerName.includes('tel')) return `'809-${String(rng()).padStart(3, '0')}-${String(rng()).padStart(4, '0')}'`
  if (lowerName.includes('direccion') || lowerName.includes('direccion')) return `'${dirs[rng() % dirs.length]}'`
  if (lowerName.includes('precio') || lowerName.includes('costo') || lowerName.includes('monto')) return (Math.random() * 1000 + 10).toFixed(2)
  if (lowerName.includes('stock') || lowerName.includes('cantidad') || lowerName.includes('existencia')) return String(rng() % 200)
  if (lowerName.includes('fecha') || lowerName.includes('date') || lowerName.includes('created') || lowerName.includes('updated')) return `'${new Date(Date.now() - Math.random() * 365 * 86400000).toISOString().split('T')[0]}'`
  if (lowerName.includes('hora')) return `'${String(rng() % 24).padStart(2, '0')}:${String(rng() % 60).padStart(2, '0')}:${String(rng() % 60).padStart(2, '0')}'`
  if (lowerName.includes('activo') || lowerName.includes('estado') || lowerName.includes('status')) return Math.random() > 0.3 ? "'Activo'" : "'Inactivo'"
  if (colType === 'INTEGER' || colType === 'INT') return String(rng())
  if (colType === 'REAL' || colType === 'NUMERIC' || colType === 'FLOAT' || colType === 'DOUBLE') return (Math.random() * 1000).toFixed(2)
  return `'${colName}-${rng()}'`
}

async function resetearID() {
  if (!utilTablaReset.value) return
  if (!window.confirm(`Se conservaran todos los registros de ${utilTablaReset.value}; solo se renumeraran sus IDs desde 1. Deseas continuar?`)) return
  utilCargando.value = true
  try {
    const res = await window.electron.invoke('consultaservidor', 'resetTableIds', utilTablaReset.value)
    if (!res?.success) throw new Error(res?.error || 'No se pudo resetear la tabla')
    toast.add({ severity: 'success', summary: 'IDs renumerados', detail: `${res.renumbered || 0} registros conservados. El proximo ID sera ${Number(res.renumbered || 0) + 1}.`, life: 3500 })
  } catch (e: any) { toast.add({ severity: 'error', summary: 'Error', detail: e.message, life: 4000 }) }
  finally { utilCargando.value = false }
}

async function generarDatosFicticios() {
  if (!utilTablaDatos.value || !utilCantidad.value) return
  utilCargando.value = true
  try {
    const cols = await window.electron.invoke('consultaservidor', 'getTableColumns', utilTablaDatos.value) as any[]
    const columnas = cols.filter((c: any) => c.name !== 'id' && c.name !== 'created_at' && c.name !== 'updated_at')
    if (columnas.length === 0) { toast.add({ severity: 'warn', summary: 'Atencion', detail: 'La tabla no tiene columnas editables', life: 3000 }); return }
    let sql = `INSERT INTO "${utilTablaDatos.value}" (${columnas.map((c: any) => c.name).join(', ')}) VALUES `
    const values: string[] = []
    for (let i = 0; i < utilCantidad.value; i++) {
      values.push(`(${columnas.map((c: any) => valorFicticio(c.name, c.type || 'TEXT', utilTipoDatos.value)).join(', ')})`)
    }
    sql += values.join(', ')
    await window.electron.invoke('consultaservidor', 'rawQuery', sql)
    toast.add({ severity: 'success', summary: 'Datos generados', detail: `${utilCantidad.value} registro(s) insertados en ${utilTablaDatos.value}`, life: 3000 })
  } catch (e: any) { toast.add({ severity: 'error', summary: 'Error', detail: e.message, life: 4000 }) }
  finally { utilCargando.value = false }
}

async function cargarColumnasUtil() {
  if (!utilColumnaTabla.value) { utilColumnaColumnas.value = []; return }
  try {
    const cols = await window.electron.invoke('consultaservidor', 'getTableColumns', utilColumnaTabla.value, 'names') as any
    utilColumnaColumnas.value = Array.isArray(cols) ? cols.filter((c: string) => c !== 'id' && c !== 'created_at' && c !== 'updated_at') : []
  } catch { utilColumnaColumnas.value = [] }
}

async function aplicarValorColumna() {
  if (!utilColumnaTabla.value || !utilColumnaNombre.value || utilColumnaValor.value === undefined) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'Selecciona tabla, columna y valor', life: 3000 }); return
  }
  utilCargando.value = true
  try {
    const valor = utilColumnaValor.value
    const sql = `UPDATE "${utilColumnaTabla.value}" SET "${utilColumnaNombre.value}" = ${isNaN(Number(valor)) ? `'${String(valor).replace(/'/g, "''")}'` : valor}`
    await window.electron.invoke('consultaservidor', 'rawQuery', sql)
    toast.add({ severity: 'success', summary: 'Columna actualizada', detail: `${utilColumnaNombre.value} = ${valor} en ${utilColumnaTabla.value}`, life: 3000 })
  } catch (e: any) { toast.add({ severity: 'error', summary: 'Error', detail: e.message, life: 4000 }) }
  finally { utilCargando.value = false }
}

async function verInfoTabla() {
  if (!utilTablaInfo.value) return
  utilCargando.value = true
  try {
    const [colRes, countRes, createRes] = await Promise.all([
      window.electron.invoke('consultaservidor', 'getTableColumns', utilTablaInfo.value),
      window.electron.invoke('consultaservidor', 'getTableRowCount', utilTablaInfo.value),
      window.electron.invoke('consultaservidor', 'getCreateTableSQL', utilTablaInfo.value),
    ]) as any
    const cols: any[] = Array.isArray(colRes) ? colRes : []
    utilInfoResultado.value = {
      'Nombre': utilTablaInfo.value,
      'Columnas': cols.length,
      'Registros': countRes?.count ?? '?',
      'SQL': (createRes?.sql || '').slice(0, 200) + '...',
    }
  } catch (e: any) { toast.add({ severity: 'error', summary: 'Error', detail: e.message, life: 4000 }) }
  finally { utilCargando.value = false }
}

async function aplicarAlmacenUidATabla(tabla: string) {
  try {
    const cols = await window.electron.invoke('consultaservidor', 'getTableColumns', tabla, 'names') as any
    const columnas: string[] = Array.isArray(cols) ? cols : []
    const tieneAlmacenUid = columnas.includes('almacen_uid')
    const almacenUid = String(almacenStore.activeUid || '')

    if (!tieneAlmacenUid) {
      await window.electron.invoke('consultaservidor', 'rawQuery', `ALTER TABLE "${tabla}" ADD COLUMN almacen_uid TEXT DEFAULT ''`)
      if (almacenUid) {
        await window.electron.invoke('consultaservidor', 'rawQuery', `UPDATE "${tabla}" SET almacen_uid = '${almacenUid.replace(/'/g, "''")}' WHERE almacen_uid IS NULL OR almacen_uid = ''`)
      }
      return { ok: true, accion: 'creada' }
    }
    if (!almacenUid) return { ok: false, error: 'Sin almacen activo' }
    const res = await window.electron.invoke('consultaservidor', 'rawQuery', `UPDATE "${tabla}" SET almacen_uid = '${almacenUid.replace(/'/g, "''")}' WHERE almacen_uid IS NULL OR almacen_uid = ''`)
    const afectados = res?.changes ?? res?.affected ?? 0
    return { ok: true, accion: 'actualizada', afectados }
  } catch (e: any) {
    return { ok: false, error: e.message }
  }
}

async function aplicarAlmacenUid() {
  const tabla = utilAlmacenUidTabla.value
  if (!tabla) return
  utilAlmacenUidCargando.value = true
  try {
    const result = await aplicarAlmacenUidATabla(tabla)
    if (result.ok) {
      const msg = result.accion === 'creada'
        ? `almacen_uid agregada a ${tabla}${almacenStore.activeUid ? ' y asignado el almacen actual' : ''}`
        : `${result.afectados} registro(s) actualizados en ${tabla}`
      toast.add({ severity: 'success', summary: 'Almacen UID', detail: msg, life: 3000 })
    } else {
      toast.add({ severity: 'warn', summary: 'Atencion', detail: result.error || 'Error al aplicar', life: 3000 })
    }
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.message || 'Error al aplicar almacen_uid', life: 4000 })
  } finally {
    utilAlmacenUidCargando.value = false
  }
}

async function aplicarAlmacenUidTodas() {
  if (!almacenStore.activeUid) {
    toast.add({ severity: 'warn', summary: 'Sin almacen', detail: 'Selecciona un almacen primero', life: 3000 })
    return
  }
  utilAlmacenUidCargando.value = true
  const resultados = { creadas: 0, actualizadas: 0, errores: 0, total: 0 }
  for (const tabla of tablas.value) {
    const result = await aplicarAlmacenUidATabla(tabla)
    resultados.total++
    if (result.ok) {
      if (result.accion === 'creada') resultados.creadas++
      else resultados.actualizadas++
    } else {
      resultados.errores++
    }
  }
  toast.add({
    severity: resultados.errores > 0 ? 'warn' : 'success',
    summary: 'Almacen UID en todas',
    detail: `${resultados.total} tablas: ${resultados.creadas} columna creada, ${resultados.actualizadas} actualizadas, ${resultados.errores} errores`,
    life: 4000,
  })
  utilAlmacenUidCargando.value = false
}

async function cargarAdminTablaInfo() {
  adminTablaInfo.value = null
  if (!adminTabla.value) return
  adminTablaCargando.value = true
  try {
    const res = await window.electron.invoke('consultaservidor', 'tableAdminInfo', adminTabla.value) as any
    if (!res?.success) throw new Error(res?.error || 'No se pudo consultar la tabla')
    adminTablaInfo.value = res.data
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.message || 'No se pudo consultar la tabla', life: 4000 })
  } finally { adminTablaCargando.value = false }
}

function confirmarAccionAdminTabla(action: 'empty' | 'drop') {
  if (!adminTabla.value) return
  adminTablaAccion.value = action
  adminTablaConfirmacion.value = ''
  adminTablaDialog.value = true
}

function ejecutarAccionAdminConfirmada() {
  if (adminTablaAccion.value === 'empty' || adminTablaAccion.value === 'drop') ejecutarAdminTabla(adminTablaAccion.value)
}

async function ejecutarAdminTabla(action: 'empty' | 'drop' | 'optimize' | 'integrity') {
  if (!adminTabla.value) return
  if ((action === 'empty' || action === 'drop') && adminTablaConfirmacion.value !== adminTabla.value) return
  adminTablaCargando.value = true
  try {
    const tabla = adminTabla.value
    const res = await window.electron.invoke('consultaservidor', 'tableAdminAction', tabla, action) as any
    if (!res?.success) throw new Error(res?.error || 'No se pudo ejecutar la accion')
    if (action === 'integrity') {
      toast.add({ severity: res.ok ? 'success' : 'warn', summary: res.ok ? 'Integridad correcta' : 'Problemas encontrados', detail: (res.messages || []).join(' | ') || 'Sin resultado', life: 5000 })
    } else if (action === 'optimize') {
      toast.add({ severity: 'success', summary: 'Tabla optimizada', detail: `Indices y estadisticas de ${tabla} actualizados`, life: 3000 })
    } else if (action === 'empty') {
      toast.add({ severity: 'success', summary: 'Tabla vaciada', detail: `${res.deleted || 0} registros eliminados; el proximo ID sera 1`, life: 3500 })
      adminTablaDialog.value = false
    } else {
      toast.add({ severity: 'success', summary: 'Tabla eliminada', detail: `${tabla} fue eliminada`, life: 3500 })
      adminTablaDialog.value = false
      adminTabla.value = ''
      adminTablaInfo.value = null
      await cargarTablas()
      return
    }
    await cargarAdminTablaInfo()
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'No se pudo completar', detail: e.message || 'Error administrando la tabla', life: 5000 })
  } finally { adminTablaCargando.value = false }
}

async function vaciarTabla() {
  if (!tablaActiva.value) return
  vaciando.value = true
  try {
    const res = await window.electron.invoke('consultaservidor', 'vaciarTabla', tablaActiva.value) as any
    if (!res?.success) throw new Error(res?.error || 'No se pudo vaciar la tabla')
    toast.add({ severity: 'success', summary: 'Tabla vaciada', detail: `Todos los registros de ${tablaActiva.value} eliminados y ID reseteado`, life: 3000 })
    dialogVaciar.value = false
    await seleccionarTabla(tablaActiva.value)
  } catch (e: any) { toast.add({ severity: 'error', summary: 'Error', detail: e.message, life: 4000 }) }
  finally { vaciando.value = false }
}

async function eliminarTabla() {
  if (!tablaActiva.value) return
  eliminandoTabla.value = true
  try {
    const res = await window.electron.invoke('consultaservidor', 'eliminarTabla', tablaActiva.value) as any
    if (!res?.success) throw new Error(res?.error || 'No se pudo eliminar la tabla')
    toast.add({ severity: 'success', summary: 'Tabla eliminada', detail: `${tablaActiva.value} eliminada correctamente`, life: 3000 })
    dialogEliminarTabla.value = false
    tablaActiva.value = ''
    await cargarTablas()
  } catch (e: any) { toast.add({ severity: 'error', summary: 'Error', detail: e.message, life: 4000 }) }
  finally { eliminandoTabla.value = false }
}

async function cargarPermisos() {
  try {
    const res = await window.db.getAll('usuarios')
    if (res.success) {
      permUsuarios.value = (res.data || []).map((u: any) => {
        let perms = {}
        try { perms = JSON.parse(u.permisos || '{}') } catch {}
        return { ...u, _editando: false, _permisos: { ...modulosPermisos.reduce((a, m) => ({ ...a, [m.key]: perms[m.key] ?? true }), {}) }, nivel: u.nivel_seguridad || 'Usuario' }
      })
    }
  } catch (e) { console.error(e) }
}

function togglePermEdit(user: any) { user._editando = !user._editando; if (user._editando) user._permisos = { ...user._permisos } }

function resetPermisos(user: any) {
  for (const m of modulosPermisos) user._permisos[m.key] = true
}

async function guardarPermisos(user: any) {
  permGuardando.value = true
  try {
    await window.db.update('usuarios', user.id, { permisos: JSON.stringify(user._permisos) })
    toast.add({ severity: 'success', summary: 'Permisos guardados', detail: `Permisos de ${user.nombre} actualizados`, life: 2000 })
    user._editando = false
  } catch (e: any) { toast.add({ severity: 'error', summary: 'Error', detail: e.message, life: 4000 }) }
  finally { permGuardando.value = false }
}

const dbPath = ref('')

async function cargarRutaDb() {
  try {
    const res = await (window as any).db.getPath()
    if (res.success) dbPath.value = res.data
  } catch (_) {}
}

function copiarTextoFallback(texto: string): boolean {
  const area = document.createElement('textarea')
  area.value = texto
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  const copiado = document.execCommand('copy')
  area.remove()
  return copiado
}

async function copiarRutaDb() {
  if (!dbPath.value) return
  try {
    try {
      await navigator.clipboard.writeText(dbPath.value)
    } catch (_) {
      if (!copiarTextoFallback(dbPath.value)) throw new Error('El portapapeles no esta disponible')
    }
    toast.add({ severity: 'success', summary: 'Copiado', detail: 'Ruta de la base de datos copiada', life: 2000 })
  } catch (_) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo copiar la ruta', life: 3000 })
  }
}

onMounted(async () => { await cargarTablas(); await cargarRutaDb() })
</script>

<template>
  <div>
    <Toast />

      <div class="flex items-center justify-between gap-2 mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-700 dark:text-amber-400">
        <div class="flex items-center gap-2">
          <i class="pi pi-exclamation-triangle"></i>
          <span><strong>Modulo restringido:</strong> Los cambios se aplican directamente sobre la base de datos.</span>
        </div>
        <div class="flex items-center gap-2">
          <Button label="Registrar Licencia" icon="pi pi-shield" severity="warn" size="small" @click="abrirDialogoLicencia" />
          <Button label="DevTools" icon="pi pi-code" severity="info" size="small" @click="abrirDevTools" />
        </div>
      </div>

      <div class="flex items-center justify-between gap-2 mb-4 p-3 rounded-lg bg-surface-50 dark:bg-surface-800/50 border border-surface-200 dark:border-surface-700 text-sm">
        <div class="flex items-center gap-2 min-w-0">
          <i class="pi pi-database text-surface-400"></i>
          <span class="font-semibold whitespace-nowrap">Ruta de la base de datos:</span>
          <span class="font-mono text-xs text-surface-500 truncate">{{ dbPath || 'Cargando...' }}</span>
        </div>
        <Button icon="pi pi-copy" label="Copiar" severity="secondary" text size="small" :disabled="!dbPath" @click="copiarRutaDb" />
      </div>

    <div class="flex flex-col lg:flex-row gap-4">
      <div class="w-full lg:w-56 flex-shrink-0">
        <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-3">
          <h4 class="text-xs font-semibold uppercase tracking-wide text-surface-500 mb-2 px-1">Explorador</h4>
          <div class="flex flex-col gap-0.5 max-h-[60vh] overflow-y-auto">
            <button
              class="text-left px-2.5 py-1.5 rounded-lg text-sm transition-colors cursor-pointer"
              :class="tablaActiva === '__sql__' ? 'bg-primary text-primary-contrast font-medium' : 'text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700'"
              @click="tablaActiva = '__sql__'"
            >
              <i class="pi pi-code mr-1.5 text-xs"></i> SQL
            </button>
            <button
              class="text-left px-2.5 py-1.5 rounded-lg text-sm transition-colors cursor-pointer"
              :class="tablaActiva === '__utilidades__' ? 'bg-primary text-primary-contrast font-medium' : 'text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700'"
              @click="tablaActiva = '__utilidades__'"
            >
              <i class="pi pi-wrench mr-1.5 text-xs"></i> Utilidades
            </button>
            <button
              class="text-left px-2.5 py-1.5 rounded-lg text-sm transition-colors cursor-pointer"
              :class="tablaActiva === '__permisos__' ? 'bg-primary text-primary-contrast font-medium' : 'text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700'"
              @click="tablaActiva = '__permisos__'; cargarPermisos()"
            >
              <i class="pi pi-shield mr-1.5 text-xs"></i> Permisos
            </button>
            <div class="text-xs font-semibold uppercase tracking-wide text-surface-400 mt-2 mb-1 px-1">Tablas ({{ tablas.length }})</div>
            <button
              v-for="t in tablas" :key="t"
              class="text-left px-2.5 py-1.5 rounded-lg text-sm transition-colors cursor-pointer"
              :class="tablaActiva === t ? 'bg-primary text-primary-contrast font-medium' : 'text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700'"
              @click="seleccionarTabla(t)"
            >
              <i class="pi pi-table mr-1.5 text-xs"></i> {{ t }}
            </button>
          </div>
        </div>
      </div>

      <div class="flex-1 min-w-0">
        <div v-if="tablaActiva === '__sql__'" class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-4">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-bold text-lg flex items-center gap-2">
              <i class="pi pi-code text-primary"></i> SQL Console
            </h3>
            <div class="flex items-center gap-2 text-xs text-surface-400">
              <span v-if="sqlTiempo">{{ sqlTiempo }}ms</span>
              <span v-if="sqlResultado !== null" :class="sqlError ? 'text-red-500' : 'text-green-500'">{{ sqlError || sqlResultado }}</span>
            </div>
          </div>
          <Textarea v-model="sqlInput" placeholder="Escribe tu consulta SQL aqui..." class="w-full h-32 !text-sm font-mono resize-y" @keydown.meta.enter="ejecutarSQL" @keydown.ctrl.enter="ejecutarSQL" />
          <div class="flex justify-between items-center mt-2">
            <p class="text-xs text-surface-400">Presiona Ctrl+Enter o Cmd+Enter para ejecutar</p>
            <div class="flex gap-2">
              <Button label="Limpiar" severity="secondary" text size="small" @click="sqlInput = ''; sqlRows = []; sqlColumns = []; sqlResultado = null; sqlError = ''" />
              <Button label="Ejecutar" icon="pi pi-play" size="small" :loading="sqlEjecutando" @click="ejecutarSQL" />
            </div>
          </div>
          <div v-if="sqlError" class="mt-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
            <i class="pi pi-exclamation-circle mr-1"></i> {{ sqlError }}
          </div>
          <div v-if="sqlColumns.length > 0" class="mt-3 rounded-lg border border-surface-200 dark:border-surface-700 overflow-hidden">
            <DataTable :value="sqlRows" stripedRows paginator :rows="15" :rowsPerPageOptions="[15, 25, 50]" dataKey="__index" responsiveLayout="scroll" scrollable scrollHeight="50vh" class="text-xs">
              <Column v-for="col in sqlColumns.filter(c => c !== '__index')" :key="col" :field="col" :header="col" sortable>
                <template #body="{ data }"><span class="truncate block max-w-[250px]" :title="data[col]">{{ data[col] }}</span></template>
              </Column>
              <template #empty><div class="text-center py-6 text-surface-400">Sin resultados</div></template>
            </DataTable>
          </div>
        </div>

        <div v-else-if="tablaActiva === '__utilidades__'" class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-4">
          <h3 class="font-bold text-lg flex items-center gap-2 mb-4">
            <i class="pi pi-wrench text-primary"></i> Utilidades
          </h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
            <div class="rounded-lg border border-surface-200 dark:border-surface-700 p-4 space-y-3">
              <h4 class="font-semibold text-sm flex items-center gap-2"><i class="pi pi-sync text-blue-500"></i> Resetear ID de tabla</h4>
              <p class="text-xs text-surface-400">Conserva los datos y renumera los IDs consecutivamente desde 1.</p>
              <div class="flex gap-2">
                <Select v-model="utilTablaReset" :options="tablas" placeholder="Seleccionar tabla" class="flex-1" fluid />
                <Button label="Resetear" severity="warn" :disabled="!utilTablaReset" @click="resetearID" :loading="utilCargando" />
              </div>
            </div>
            <div class="rounded-lg border border-surface-200 dark:border-surface-700 p-4 space-y-3">
              <h4 class="font-semibold text-sm flex items-center gap-2"><i class="pi pi-database text-green-500"></i> Datos ficticios</h4>
              <p class="text-xs text-surface-400">Inserta registros de prueba en una tabla.</p>
              <div class="flex gap-2">
                <Select v-model="utilTablaDatos" :options="tablas" placeholder="Seleccionar tabla" class="flex-1" fluid />
                <InputNumber v-model="utilCantidad" :min="1" :max="100" class="w-20" fluid />
              </div>
              <div class="flex gap-2">
                <Select v-model="utilTipoDatos" :options="tiposDatosFicticios" optionLabel="label" optionValue="value" placeholder="Tipo de datos" class="flex-1" fluid />
                <Button label="Generar" severity="success" :disabled="!utilTablaDatos || !utilCantidad" @click="generarDatosFicticios" :loading="utilCargando" />
              </div>
            </div>
            <div class="rounded-lg border border-surface-200 dark:border-surface-700 p-4 space-y-3">
              <h4 class="font-semibold text-sm flex items-center gap-2"><i class="pi pi-info-circle text-purple-500"></i> Info de la tabla</h4>
              <p class="text-xs text-surface-400">Muestra estructura y cantidad de registros.</p>
              <div class="flex gap-2">
                <Select v-model="utilTablaInfo" :options="tablas" placeholder="Seleccionar tabla" class="flex-1" fluid />
                <Button label="Ver info" severity="info" :disabled="!utilTablaInfo" @click="verInfoTabla" :loading="utilCargando" />
              </div>
              <div v-if="utilInfoResultado" class="text-xs space-y-1 p-2 rounded bg-surface-50 dark:bg-surface-900">
                <div v-for="(v, k) in utilInfoResultado" :key="k" class="flex justify-between"><span class="text-surface-400">{{ k }}:</span><span class="font-medium">{{ v }}</span></div>
              </div>
            </div>
            <div class="rounded-lg border border-surface-200 dark:border-surface-700 p-4 space-y-3">
              <h4 class="font-semibold text-sm flex items-center gap-2"><i class="pi pi-pen-to-square text-cyan-500"></i> Actualizar columna completa</h4>
              <p class="text-xs text-surface-400">Establece un valor fijo en todos los registros de una columna.</p>
              <div class="flex gap-2">
                <Select v-model="utilColumnaTabla" :options="tablas" placeholder="Tabla" class="flex-1" fluid @change="cargarColumnasUtil" />
                <Select v-model="utilColumnaNombre" :options="utilColumnaColumnas" placeholder="Columna" class="flex-1" fluid />
              </div>
              <div class="flex gap-2">
                <InputText v-model="utilColumnaValor" placeholder="Valor a establecer" class="flex-1" fluid />
                <Button label="Aplicar" severity="info" :disabled="!utilColumnaTabla || !utilColumnaNombre || utilColumnaValor === ''" @click="aplicarValorColumna" :loading="utilCargando" />
              </div>
            </div>
            <div class="rounded-lg border border-surface-200 dark:border-surface-700 p-4 space-y-3">
              <h4 class="font-semibold text-sm flex items-center gap-2"><i class="pi pi-file-export text-orange-500"></i> Exportar tabla como SQL</h4>
              <p class="text-xs text-surface-400">Descarga toda la tabla como sentencias SQL.</p>
              <div class="flex gap-2">
                <Select v-model="utilTablaExport" :options="tablas" placeholder="Seleccionar tabla" class="flex-1" fluid />
                <Button label="Exportar" severity="info" :disabled="!utilTablaExport" @click="exportarSQL" :loading="utilCargando" />
              </div>
            </div>
            <div class="md:col-span-2 rounded-lg border border-sky-200 dark:border-sky-900 bg-sky-50/40 dark:bg-sky-950/10 p-4 space-y-3">
              <h4 class="font-semibold text-sm flex items-center gap-2"><i class="pi pi-warehouse text-sky-600"></i> Asignar almacen_uid a tabla</h4>
              <p class="text-xs text-surface-500">Agrega la columna <code>almacen_uid</code> si no existe y asigna el almacen actual a los registros sin almacen.</p>
              <div class="flex gap-2">
                <Select v-model="utilAlmacenUidTabla" :options="tablas" placeholder="Seleccionar tabla" filter filterPlaceholder="Buscar tabla..." class="flex-1" fluid />
                <Button label="Aplicar" icon="pi pi-check" severity="info" :disabled="!utilAlmacenUidTabla" :loading="utilAlmacenUidCargando" @click="aplicarAlmacenUid" />
                <Button label="Todas" icon="pi pi-warehouse" severity="warn" :loading="utilAlmacenUidCargando" @click="aplicarAlmacenUidTodas" />
              </div>
            </div>
            <div class="md:col-span-2 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50/40 dark:bg-emerald-950/10 p-4 space-y-3">
              <div>
                <h4 class="font-semibold text-sm flex items-center gap-2"><i class="pi pi-file text-emerald-600"></i> Configuracion portable JSON</h4>
                <p class="text-xs text-surface-500 mt-1">Exporta o importa exactamente la estructura de tablas/campos, preferencias no sensibles y datos iniciales. Al aplicar, solo crea lo faltante y conserva los registros actuales.</p>
              </div>
              <div class="flex flex-wrap gap-2">
                <Button label="Exportar configuracion JSON" icon="pi pi-file-export" severity="success" :loading="configPortableCargando" @click="exportarConfiguracionPortable" />
                <Button label="Importar JSON" icon="pi pi-file-import" severity="info" outlined :loading="configPortableCargando" @click="importarConfiguracionPortable" />
                <Button label="Aplicar JSON" icon="pi pi-wrench" severity="warn" :disabled="!configPortable" :loading="configPortableCargando" @click="aplicarConfiguracionPortable" />
                <Button label="Instalar datos por default" icon="pi pi-sparkles" severity="secondary" :loading="configPortableCargando" @click="aplicarDatosPortable" />
              </div>
              <div v-if="configPortableResultado" class="rounded-md bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 p-3 text-xs">
                <div class="font-medium text-surface-700 dark:text-surface-200">{{ configPortableResultado }}</div>
                <div v-if="configPortableRuta" class="text-surface-400 mt-1 break-all">{{ configPortableRuta }}</div>
              </div>
              <p class="text-[11px] text-amber-600 dark:text-amber-400"><i class="pi pi-shield mr-1"></i>No incluye claves, tokens, contraseñas, licencias ni datos reales de clientes o inventario.</p>
            </div>
            <div class="md:col-span-2 rounded-lg border border-red-200 dark:border-red-900 bg-red-50/40 dark:bg-red-950/10 p-4 space-y-4">
              <div>
                <h4 class="font-semibold text-sm flex items-center gap-2"><i class="pi pi-server text-red-500"></i> Administrar tabla</h4>
                <p class="text-xs text-surface-500 mt-1">Consulta, verifica, optimiza, vacia o elimina una tabla completa.</p>
              </div>
              <div class="flex flex-col sm:flex-row gap-2">
                <Select v-model="adminTabla" :options="tablas" placeholder="Seleccionar tabla" class="flex-1" fluid @change="cargarAdminTablaInfo" />
                <Button label="Actualizar" icon="pi pi-refresh" severity="secondary" outlined :disabled="!adminTabla" :loading="adminTablaCargando" @click="cargarAdminTablaInfo" />
              </div>
              <div v-if="adminTablaInfo" class="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <div class="rounded-md bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 p-2 text-center"><div class="text-lg font-bold">{{ adminTablaInfo.rows }}</div><div class="text-[11px] text-surface-400">Registros</div></div>
                <div class="rounded-md bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 p-2 text-center"><div class="text-lg font-bold">{{ adminTablaInfo.columns }}</div><div class="text-[11px] text-surface-400">Columnas</div></div>
                <div class="rounded-md bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 p-2 text-center"><div class="text-lg font-bold">{{ adminTablaInfo.indexes }}</div><div class="text-[11px] text-surface-400">Indices</div></div>
                <div class="rounded-md bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 p-2 text-center"><div class="text-lg font-bold">{{ adminTablaInfo.foreignKeys }}</div><div class="text-[11px] text-surface-400">Relaciones</div></div>
                <div class="rounded-md bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 p-2 text-center"><div class="text-lg font-bold">{{ adminTablaInfo.nextId }}</div><div class="text-[11px] text-surface-400">Proximo ID</div></div>
              </div>
              <div class="flex flex-wrap gap-2">
                <Button label="Verificar integridad" icon="pi pi-check-circle" severity="info" outlined size="small" :disabled="!adminTabla" :loading="adminTablaCargando" @click="ejecutarAdminTabla('integrity')" />
                <Button label="Optimizar" icon="pi pi-bolt" severity="success" outlined size="small" :disabled="!adminTabla" :loading="adminTablaCargando" @click="ejecutarAdminTabla('optimize')" />
                <Button label="Vaciar y resetear ID" icon="pi pi-trash" severity="warn" size="small" :disabled="!adminTabla" @click="confirmarAccionAdminTabla('empty')" />
                <Button label="Eliminar tabla" icon="pi pi-times-circle" severity="danger" size="small" :disabled="!adminTabla" @click="confirmarAccionAdminTabla('drop')" />
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="tablaActiva === '__permisos__'" class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-4">
          <div class="flex items-center gap-2 mb-4"><i class="pi pi-shield text-lg text-primary"></i><h3 class="font-bold text-lg">Permisos de usuarios</h3></div>
          <div v-if="permUsuarios.length === 0" class="text-center py-8 text-surface-400"><i class="pi pi-users text-4xl mb-2 block"></i><span class="text-sm">No hay usuarios</span></div>
          <div v-for="user in permUsuarios" :key="user.id" class="mb-4 rounded-lg border border-surface-200 dark:border-surface-700 overflow-hidden">
            <div class="flex items-center justify-between px-4 py-3 bg-surface-50 dark:bg-surface-800/50 border-b border-surface-200 dark:border-surface-700">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold" style="background-color:var(--p-primary-500)">{{ (user.nombre || '?')[0] }}</div>
                <div>
                  <span class="font-medium text-sm">{{ user.nombre }}</span>
                  <span class="text-xs text-surface-400 ml-2">@{{ user.usuario }}</span>
                  <span class="inline-flex items-center ml-2 px-2 py-0.5 rounded-full text-[10px] font-medium"
                    :class="user.nivel === 'Soporte' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : user.nivel === 'Administrador' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'"
                  >{{ user.nivel }}</span>
                </div>
              </div>
              <Button :label="user._editando ? 'Cerrar' : 'Editar permisos'" :severity="user._editando ? 'secondary' : 'info'" size="small" text @click="togglePermEdit(user)" />
            </div>
            <div v-if="user._editando" class="p-4">
              <div class="text-xs text-surface-400 mb-2">Activar o desactivar modulos para este usuario:</div>
              <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                <label v-for="mod in modulosPermisos" :key="mod.key" class="flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm transition-colors"
                  :class="(user._permisos[mod.key] ?? true) ? 'border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-900/20' : 'border-surface-200 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-800'"
                >
                  <input type="checkbox" v-model="user._permisos[mod.key]" class="rounded" />
                  <i :class="[mod.icon, 'text-xs']"></i>
                  <span>{{ mod.label }}</span>
                </label>
              </div>
              <div class="flex justify-end mt-3 gap-2">
                <Button label="Restablecer" severity="secondary" text size="small" @click="resetPermisos(user)" />
                <Button label="Guardar permisos" severity="success" size="small" :loading="permGuardando" @click="guardarPermisos(user)" />
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="!tablaActiva" class="flex flex-col items-center justify-center py-20 text-surface-400 gap-3">
          <i class="pi pi-database text-4xl"></i>
          <span>Selecciona una tabla del panel izquierdo</span>
        </div>

        <div v-else>
          <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div class="flex items-center gap-2">
              <i class="pi pi-table text-primary"></i>
              <h3 class="font-bold text-lg">{{ tablaActiva }}</h3>
              <span class="text-xs text-surface-400">{{ columnas.length }} campos | {{ filas.length }} registros</span>
            </div>
            <div class="flex items-center gap-2">
              <div class="flex items-center gap-1 text-sm">
                <span class="text-surface-400 text-xs">Limite:</span>
                <InputNumber v-model="limite" :min="10" :max="500" class="w-20" fluid @focus="(e) => e.target.select()" />
              </div>
              <Button icon="pi pi-plus" severity="success" text rounded size="small" @click="abrirNuevo" v-tooltip="'Nuevo registro'" />
              <Button icon="pi pi-refresh" severity="secondary" text rounded size="small" @click="seleccionarTabla(tablaActiva)" v-tooltip="'Recargar'" />
              <Button icon="pi pi-file-export" severity="info" text rounded size="small" @click="exportarSQL" v-tooltip="'Exportar SQL'" :disabled="filas.length === 0 && columnas.length === 0" />
              <Button icon="pi pi-download" severity="secondary" text rounded size="small" @click="exportarCSV" v-tooltip="'Exportar CSV'" :disabled="filas.length === 0" />
              <Button icon="pi pi-trash" severity="danger" text rounded size="small" @click="dialogVaciar = true" v-tooltip="'Vaciar tabla y resetear ID'" :disabled="filas.length === 0" />
              <Button icon="pi pi-times-circle" severity="danger" text rounded size="small" @click="dialogEliminarTabla = true" v-tooltip="'Eliminar tabla'" />
            </div>
          </div>

          <TabView>
            <TabPanel header="Datos">
              <DataTable :value="filas" :loading="cargando" stripedRows paginator :rows="15" :rowsPerPageOptions="[15, 25, 50]" dataKey="id" responsiveLayout="scroll" scrollable scrollHeight="60vh" @rowClick="abrirEditar($event.data)" class="text-xs">
                <Column header="" style="width: 3rem">
                  <template #body="{ data }"><Button icon="pi pi-trash" severity="danger" text rounded size="small" @click.stop="confirmarBorrar(data)" v-tooltip="'Eliminar'" /></template>
                </Column>
                <Column v-for="col in columnas" :key="typeof col === 'string' ? col : col.name" :field="typeof col === 'string' ? col : col.name" :header="typeof col === 'string' ? col : col.name" sortable>
                  <template #body="{ data }"><span class="truncate block max-w-[200px]" :title="data[typeof col === 'string' ? col : col.name]">{{ data[typeof col === 'string' ? col : col.name] }}</span></template>
                </Column>
                <template #empty><div class="text-center py-6 text-surface-400">Sin registros</div></template>
              </DataTable>
            </TabPanel>

            <TabPanel header="Estructura">
              <div v-if="columnasInfo.length > 0" class="space-y-4">
                <div class="rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800/50 p-3">
                  <h4 class="text-sm font-semibold mb-2">Columnas ({{ columnasInfo.length }})</h4>
                  <table class="w-full text-xs">
                    <thead>
                      <tr class="border-b border-surface-200 dark:border-surface-700">
                        <th class="text-left py-1 px-2 font-medium">#</th>
                        <th class="text-left py-1 px-2 font-medium">Nombre</th>
                        <th class="text-left py-1 px-2 font-medium">Tipo</th>
                        <th class="text-center py-1 px-2 font-medium">PK</th>
                        <th class="text-center py-1 px-2 font-medium">NOT NULL</th>
                        <th class="text-left py-1 px-2 font-medium">Default</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="col in columnasInfo" :key="col.cid" class="border-b border-surface-100 dark:border-surface-800 hover:bg-surface-100 dark:hover:bg-surface-700/30">
                        <td class="py-1 px-2 text-surface-400">{{ col.cid }}</td>
                        <td class="py-1 px-2 font-mono font-medium">{{ col.name }}</td>
                        <td class="py-1 px-2 text-surface-500">{{ col.type || 'TEXT' }}</td>
                        <td class="py-1 px-2 text-center"><i v-if="col.pk" class="pi pi-check text-green-500 text-xs"></i><span v-else class="text-surface-300">—</span></td>
                        <td class="py-1 px-2 text-center"><i v-if="col.notnull" class="pi pi-check text-amber-500 text-xs"></i><span v-else class="text-surface-300">—</span></td>
                        <td class="py-1 px-2 font-mono text-surface-500">{{ col.dflt_value || '—' }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div class="rounded-lg border border-surface-200 dark:border-surface-700 p-3">
                  <h4 class="text-sm font-semibold mb-2">Agregar Columna</h4>
                  <div class="grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <InputText v-model="formNuevoCampo.nombre" placeholder="Nombre" fluid />
                    <Select v-model="formNuevoCampo.tipo" :options="tiposColumna" placeholder="Tipo" fluid />
                    <InputText v-model="formNuevoCampo.defecto" placeholder="Default (opcional)" fluid />
                    <Button label="Agregar" icon="pi pi-plus" @click="agregarColumna" />
                  </div>
                </div>
              </div>
            </TabPanel>

            <TabPanel header="Crear Tabla">
              <div class="space-y-4 max-w-lg">
                <div class="space-y-1.5">
                  <label class="text-sm font-medium">Nombre de la tabla</label>
                  <InputText v-model="nombreNuevaTabla" placeholder="ej: categorias" fluid />
                </div>
                <div class="flex items-center gap-2">
                  <ToggleSwitch v-model="incluirTimestamps" />
                  <label class="text-sm">Incluir created_at / updated_at</label>
                </div>
                <div class="space-y-2">
                  <div class="flex items-center justify-between">
                    <label class="text-sm font-medium">Campos</label>
                    <Button icon="pi pi-plus" size="small" severity="secondary" text @click="agregarCampoNuevo">Agregar Campo</Button>
                  </div>
                  <div v-for="(campo, i) in camposNuevos" :key="i" class="flex items-center gap-2">
                    <InputText v-model="campo.nombre" placeholder="Nombre" class="flex-1" fluid />
                    <Select v-model="campo.tipo" :options="tiposColumna" class="w-24" fluid />
                    <ToggleSwitch v-model="campo.requerido" />
                    <span class="text-xs text-surface-400 w-12">Requerido</span>
                    <Button icon="pi pi-trash" severity="danger" text rounded size="small" @click="quitarCampoNuevo(i)" />
                  </div>
                </div>
                <Button label="Crear Tabla" icon="pi pi-check" @click="crearTabla" :disabled="!nombreNuevaTabla.trim() || camposNuevos.length === 0" />
              </div>
            </TabPanel>

            <TabPanel header="Importar">
              <div class="space-y-4 max-w-lg">
                <p class="text-sm text-surface-500">Importar tablas desde archivos SQLite externos.</p>
                <div class="flex items-center gap-2"><span class="text-sm text-surface-400">Proximamente</span></div>
              </div>
            </TabPanel>
          </TabView>
        </div>
      </div>
    </div>

    <Dialog v-model:visible="dialogEditar" :header="`Editar registro #${editarFila?.id || ''}`" modal :style="{ width: '35rem' }">
      <div class="grid grid-cols-2 gap-3 pt-2 max-h-[60vh] overflow-y-auto pr-1">
        <div v-for="col in columnas" :key="typeof col === 'string' ? col : col.name" class="flex flex-col gap-1" :class="(typeof col === 'string' ? col : col.name) === 'id' ? 'col-span-2' : ''">
          <label class="text-xs font-medium text-surface-500">{{ typeof col === 'string' ? col : col.name }}</label>
          <InputText v-if="(typeof col === 'string' ? col : col.name) !== 'id'" v-model="editForm[typeof col === 'string' ? col : col.name]" fluid />
          <InputText v-else :modelValue="editForm.id" disabled fluid />
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogEditar = false" />
        <Button label="Eliminar" icon="pi pi-trash" severity="danger" @click="confirmarBorrar(editarFila)" />
        <Button label="Guardar" icon="pi pi-check" @click="guardarEdicion" />
      </template>
    </Dialog>

    <Dialog v-model:visible="dialogNuevo" header="Nuevo Registro" modal :style="{ width: '35rem' }">
      <div class="grid grid-cols-2 gap-3 pt-2 max-h-[60vh] overflow-y-auto pr-1">
        <div v-for="col in columnas" :key="typeof col === 'string' ? col : col.name" class="flex flex-col gap-1" :class="(typeof col === 'string' ? col : col.name) === 'id' ? 'col-span-2' : ''">
          <label v-if="(typeof col === 'string' ? col : col.name) !== 'id'" class="text-xs font-medium text-surface-500">{{ typeof col === 'string' ? col : col.name }}</label>
          <InputText v-if="(typeof col === 'string' ? col : col.name) !== 'id' && (typeof col === 'string' ? col : col.name) !== 'created_at' && (typeof col === 'string' ? col : col.name) !== 'updated_at'" v-model="nuevoForm[typeof col === 'string' ? col : col.name]" fluid />
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogNuevo = false" />
        <Button label="Guardar" icon="pi pi-check" @click="guardarNuevo" />
      </template>
    </Dialog>

    <Dialog v-model:visible="dialogDelete" header="Confirmar Eliminacion" modal :style="{ width: '24rem' }">
      <div class="flex items-center gap-3"><i class="pi pi-exclamation-triangle text-3xl text-red-500"></i><span>Seguro que deseas eliminar este registro?</span></div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogDelete = false" />
        <Button label="Eliminar" icon="pi pi-trash" severity="danger" @click="borrar" />
      </template>
    </Dialog>

    <Dialog v-model:visible="dialogVaciar" header="Vaciar tabla" modal :style="{ width: '28rem' }">
      <div class="flex items-start gap-3">
        <i class="pi pi-exclamation-triangle text-3xl text-red-500 mt-1"></i>
        <div>
          <p class="font-medium">Vaciar completamente <strong>{{ tablaActiva }}</strong>?</p>
          <p class="text-sm text-surface-500 mt-2">Se eliminaran todos los registros ({{ filas.length }}) y se reseteara el contador ID.</p>
          <p class="text-sm text-red-500 mt-1">Esta accion no se puede deshacer.</p>
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogVaciar = false" />
        <Button label="Vaciar y resetear ID" icon="pi pi-trash" severity="danger" @click="vaciarTabla" :loading="vaciando" />
      </template>
    </Dialog>

    <Dialog v-model:visible="dialogEliminarTabla" header="Eliminar tabla" modal :style="{ width: '28rem' }">
      <div class="flex items-start gap-3">
        <i class="pi pi-exclamation-triangle text-3xl text-red-500 mt-1"></i>
        <div>
          <p class="font-medium">Eliminar la tabla <strong>{{ tablaActiva }}</strong>?</p>
          <p class="text-sm text-surface-500 mt-2">Se borrara la tabla completa con todos sus registros y estructura.</p>
          <p class="text-sm text-red-500 mt-1">Esta accion no se puede deshacer.</p>
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogEliminarTabla = false" />
        <Button label="Eliminar tabla" icon="pi pi-trash" severity="danger" @click="eliminarTabla" :loading="eliminandoTabla" />
      </template>
    </Dialog>

    <Dialog v-model:visible="adminTablaDialog" :header="adminTablaAccion === 'drop' ? 'Eliminar tabla' : 'Vaciar tabla'" modal :style="{ width: '30rem' }" :draggable="false">
      <div class="space-y-4">
        <div class="flex items-start gap-3">
          <i class="pi pi-exclamation-triangle text-3xl text-red-500 mt-1"></i>
          <div>
            <p class="font-semibold">{{ adminTablaAccion === 'drop' ? 'Se eliminara la estructura y todos sus datos.' : 'Se eliminaran todos los registros y el proximo ID sera 1.' }}</p>
            <p class="text-sm text-surface-500 mt-1">Esta accion no se puede deshacer y puede fallar si otras tablas dependen de <strong>{{ adminTabla }}</strong>.</p>
          </div>
        </div>
        <div>
          <label class="text-xs font-medium text-surface-500 mb-1 block">Escribe <strong>{{ adminTabla }}</strong> para confirmar</label>
          <InputText v-model="adminTablaConfirmacion" :placeholder="adminTabla" autocomplete="off" fluid />
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="adminTablaDialog = false" />
        <Button
          :label="adminTablaAccion === 'drop' ? 'Eliminar definitivamente' : 'Vaciar y resetear ID'"
          icon="pi pi-trash"
          :severity="adminTablaAccion === 'drop' ? 'danger' : 'warn'"
          :disabled="adminTablaConfirmacion !== adminTabla"
          :loading="adminTablaCargando"
          @click="ejecutarAccionAdminConfirmada"
        />
      </template>
    </Dialog>

    <Dialog v-model:visible="licenciaDialogVisible" header="Registrar Licencia" modal :style="{ width: 'min(26rem, 92vw)' }" :draggable="false">
      <div class="flex flex-col gap-4 pt-2">
        <div class="flex items-center gap-3 p-3 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
          <i class="pi pi-shield text-xl text-primary"></i>
          <div class="text-sm text-surface-600 dark:text-surface-300">
            <span class="font-medium">Dias de licencia:</span>
            <span class="ml-2 font-bold text-lg text-primary">{{ licenciaDias }}</span>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="col-span-2">
            <label class="text-xs font-medium text-surface-500 mb-1 block">Nombre de la empresa *</label>
            <InputText v-model="licenciaNombre" placeholder="Nombre de la empresa" class="w-full" fluid />
          </div>
          <div class="col-span-2 sm:col-span-1">
            <label class="text-xs font-medium text-surface-500 mb-1 block">Encargado</label>
            <InputText v-model="licenciaEncargado" placeholder="Encargado" class="w-full" fluid />
          </div>
          <div class="col-span-2 sm:col-span-1">
            <label class="text-xs font-medium text-surface-500 mb-1 block">Telefono</label>
            <InputText v-model="licenciaTelefono" placeholder="Telefono" class="w-full" fluid />
          </div>
          <div class="col-span-2 sm:col-span-1">
            <label class="text-xs font-medium text-surface-500 mb-1 block">Email</label>
            <InputText v-model="licenciaEmail" placeholder="Email" class="w-full" fluid />
          </div>
          <div class="col-span-2 sm:col-span-1">
            <label class="text-xs font-medium text-surface-500 mb-1 block">Dias</label>
            <InputNumber v-model="licenciaDias" :min="1" :max="3650" class="w-full" fluid />
          </div>
          <div class="col-span-2">
            <label class="text-xs font-medium text-surface-500 mb-1 block">Direccion</label>
            <InputText v-model="licenciaDireccion" placeholder="Direccion" class="w-full" fluid />
          </div>
        </div>
        <p v-if="licenciaError" class="text-red-500 text-xs text-center">{{ licenciaError }}</p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="licenciaDialogVisible = false" />
        <Button label="Registrar Licencia" icon="pi pi-shield" :loading="licenciaGuardando" @click="registrarLicenciaSoporte" />
      </template>
    </Dialog>
  </div>
</template>
