<template>
  <div class="ejemplo-supabase">
    <h1>Ejemplo de Uso de Supabase - TMPOS</h1>

    <!-- Estado de conexión -->
    <div class="connection-status" :class="{ connected: isConnected, error: !isConfigured }">
      <span v-if="isConnected && isConfigured">✅ Conectado a Supabase</span>
      <span v-else-if="!isConfigured">⚠️ Configuración incompleta - Revisa .env</span>
      <span v-else>❌ No conectado</span>
    </div>

    <!-- Tabs de ejemplo -->
    <div class="tabs">
      <button
        v-for="tab in tabs"
        :key="tab"
        @click="currentTab = tab"
        :class="{ active: currentTab === tab }"
      >
        {{ tab }}
      </button>
    </div>

    <!-- Loading y Error global -->
    <div v-if="loading" class="loading">Cargando...</div>
    <div v-if="error" class="error">Error: {{ error }}</div>

    <!-- Tab: Productos -->
    <div v-show="currentTab === 'Productos'" class="tab-content">
      <h2>Gestión de Productos</h2>

      <div class="actions">
        <button @click="cargarProductos">Cargar Productos</button>
        <input
          v-model="busquedaProducto"
          placeholder="Buscar producto..."
          @input="buscarProductos"
        />
      </div>

      <div class="products-list">
        <div v-for="producto in productos" :key="producto.id" class="product-card">
          <h3>{{ producto.nombre }}</h3>
          <p><strong>Código:</strong> {{ producto.codigo }}</p>
          <p><strong>Precio:</strong> ${{ producto.precio_venta.toFixed(2) }}</p>
          <p><strong>Stock:</strong> {{ producto.stock }}</p>
          <span v-if="producto.stock <= producto.stock_minimo" class="badge danger">
            Bajo Stock
          </span>
        </div>
      </div>

      <h3>Productos con Bajo Stock</h3>
      <button @click="cargarProductosBajoStock">Ver Productos Bajo Stock</button>
      <div class="low-stock-list">
        <div v-for="item in productosBajoStock" :key="item.id" class="low-stock-item">
          {{ item.nombre }} - Stock: {{ item.stock }} / Mínimo: {{ item.stock_minimo }}
        </div>
      </div>
    </div>

    <!-- Tab: Ventas -->
    <div v-show="currentTab === 'Ventas'" class="tab-content">
      <h2>Gestión de Ventas</h2>

      <button @click="cargarVentasHoy">Cargar Ventas de Hoy</button>

      <div class="stats">
        <div class="stat-card">
          <h3>Total Ventas Hoy</h3>
          <p class="stat-value">${{ totalVentasHoy.toFixed(2) }}</p>
        </div>
        <div class="stat-card">
          <h3>Cantidad de Ventas</h3>
          <p class="stat-value">{{ ventasHoy.length }}</p>
        </div>
      </div>

      <div class="sales-list">
        <div v-for="venta in ventasHoy" :key="venta.id" class="sale-card">
          <h4>{{ venta.numero_factura }}</h4>
          <p><strong>Cliente:</strong> {{ venta.cliente || 'Consumidor Final' }}</p>
          <p><strong>Total:</strong> ${{ venta.total }}</p>
          <p><strong>Tipo:</strong> {{ venta.tipo_pago }}</p>
          <p><strong>Estado:</strong>
            <span :class="`badge ${venta.estado}`">{{ venta.estado }}</span>
          </p>
          <button @click="verDetallesVenta(venta.id)">Ver Detalles</button>
        </div>
      </div>

      <h3>Crear Venta de Ejemplo</h3>
      <button @click="crearVentaEjemplo" :disabled="loading">
        Crear Venta de Prueba
      </button>
    </div>

    <!-- Tab: Clientes -->
    <div v-show="currentTab === 'Clientes'" class="tab-content">
      <h2>Gestión de Clientes</h2>

      <div class="actions">
        <button @click="cargarClientes">Cargar Clientes</button>
        <input
          v-model="busquedaCliente"
          placeholder="Buscar cliente..."
          @input="buscarClientesAction"
        />
      </div>

      <div class="clients-list">
        <div v-for="cliente in clientes" :key="cliente.id" class="client-card">
          <h3>{{ cliente.nombre }}</h3>
          <p><strong>{{ cliente.tipo_documento }}:</strong> {{ cliente.cedula_rnc || 'N/A' }}</p>
          <p><strong>Teléfono:</strong> {{ cliente.telefono || 'N/A' }}</p>
          <p><strong>Límite Crédito:</strong> ${{ cliente.limite_credito.toFixed(2) }}</p>
        </div>
      </div>
    </div>

    <!-- Tab: Caja -->
    <div v-show="currentTab === 'Caja'" class="tab-content">
      <h2>Control de Caja</h2>

      <div v-if="cajaActual && cajaActual.estado === 'abierto'" class="current-cash">
        <h3>Caja Abierta</h3>
        <p><strong>Fecha Apertura:</strong> {{ formatDate(cajaActual.fecha_apertura) }}</p>
        <p><strong>Monto Inicial:</strong> ${{ cajaActual.monto_inicial.toFixed(2) }}</p>
        <p><strong>Total Ventas:</strong> ${{ cajaActual.total_ventas.toFixed(2) }}</p>

        <div class="cash-actions">
          <input
            v-model.number="montoCierre"
            type="number"
            placeholder="Monto final en caja"
            step="0.01"
          />
          <button @click="cerrarCajaActual">Cerrar Caja</button>
        </div>
      </div>

      <div v-else class="no-cash-open">
        <h3>No hay caja abierta</h3>
        <div class="open-cash-form">
          <input
            v-model.number="montoInicial"
            type="number"
            placeholder="Monto inicial"
            step="0.01"
          />
          <button @click="abrirCajaNueva">Abrir Caja</button>
        </div>
      </div>
    </div>

    <!-- Detalles de Venta Modal (simplificado) -->
    <div v-if="ventaDetalles" class="modal" @click.self="ventaDetalles = null">
      <div class="modal-content">
        <h2>Detalles de Venta</h2>
        <button class="close" @click="ventaDetalles = null">×</button>

        <div v-for="detalle in ventaDetalles" :key="detalle.id" class="detail-item">
          <p><strong>Producto:</strong> {{ detalle.productos?.nombre }}</p>
          <p><strong>Cantidad:</strong> {{ detalle.cantidad }}</p>
          <p><strong>Precio:</strong> ${{ detalle.precio_unitario.toFixed(2) }}</p>
          <p><strong>Subtotal:</strong> ${{ detalle.subtotal.toFixed(2) }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useSupabase } from '@/composables/useSupabase';

// Composable
const {
  loading,
  error,
  isConnected,
  isConfigured,
  obtenerProductos,
  buscarProducto,
  productosaBajoStock,
  crearVenta,
  obtenerVentasHoy,
  obtenerDetallesVenta,
  obtenerClientes,
  buscarCliente,
  abrirCaja,
  cerrarCaja,
  obtenerCajaAbierta
} = useSupabase();

// Estado
const currentTab = ref('Productos');
const tabs = ['Productos', 'Ventas', 'Clientes', 'Caja'];

// Productos
const productos = ref<any[]>([]);
const productosBajoStock = ref<any[]>([]);
const busquedaProducto = ref('');

// Ventas
const ventasHoy = ref<any[]>([]);
const ventaDetalles = ref<any[] | null>(null);

// Clientes
const clientes = ref<any[]>([]);
const busquedaCliente = ref('');

// Caja
const cajaActual = ref<any>(null);
const montoInicial = ref(0);
const montoCierre = ref(0);

// Computed
const totalVentasHoy = computed(() => {
  return ventasHoy.value.reduce((sum, v) => sum + v.total, 0);
});

// Métodos - Productos
async function cargarProductos() {
  productos.value = await obtenerProductos();
}

async function buscarProductos() {
  if (busquedaProducto.value.trim()) {
    productos.value = await buscarProducto(busquedaProducto.value);
  } else {
    await cargarProductos();
  }
}

async function cargarProductosBajoStock() {
  productosBajoStock.value = await productosaBajoStock();
}

// Métodos - Ventas
async function cargarVentasHoy() {
  ventasHoy.value = await obtenerVentasHoy();
}

async function verDetallesVenta(ventaId: string) {
  ventaDetalles.value = await obtenerDetallesVenta(ventaId);
}

async function crearVentaEjemplo() {
  if (productos.value.length === 0) {
    alert('Primero carga productos');
    return;
  }

  const productoEjemplo = productos.value[0];

  const venta = {
    numero_factura: `B01-${Date.now()}`,
    subtotal: productoEjemplo.precio_venta,
    itbis: productoEjemplo.precio_venta * 0.18,
    total: productoEjemplo.precio_venta * 1.18,
    tipo_pago: 'efectivo' as const,
    estado: 'completada' as const
  };

  const detalles = [{
    producto_id: productoEjemplo.id,
    cantidad: 1,
    precio_unitario: productoEjemplo.precio_venta,
    subtotal: productoEjemplo.precio_venta
  }];

  const ventaCreada = await crearVenta(venta, detalles);

  if (ventaCreada) {
    alert('Venta creada exitosamente!');
    await cargarVentasHoy();
  }
}

// Métodos - Clientes
async function cargarClientes() {
  clientes.value = await obtenerClientes();
}

async function buscarClientesAction() {
  if (busquedaCliente.value.trim()) {
    clientes.value = await buscarCliente(busquedaCliente.value);
  } else {
    await cargarClientes();
  }
}

// Métodos - Caja
async function cargarCajaAbierta() {
  cajaActual.value = await obtenerCajaAbierta();
}

async function abrirCajaNueva() {
  if (montoInicial.value <= 0) {
    alert('Ingresa un monto inicial válido');
    return;
  }

  const caja = await abrirCaja(montoInicial.value);
  if (caja) {
    cajaActual.value = caja;
    alert('Caja abierta exitosamente!');
  }
}

async function cerrarCajaActual() {
  if (!cajaActual.value || montoCierre.value <= 0) {
    alert('Ingresa el monto final de caja');
    return;
  }

  const cajaCerrada = await cerrarCaja(cajaActual.value.id, montoCierre.value);
  if (cajaCerrada) {
    const diferencia = cajaCerrada.diferencia;
    alert(`Caja cerrada! Diferencia: $${diferencia.toFixed(2)}`);
    cajaActual.value = null;
    montoCierre.value = 0;
  }
}

// Utilidades
function formatDate(dateString: string) {
  return new Date(dateString).toLocaleString(localStorage.getItem('sistema_locale') || navigator.language);
}

// Lifecycle
onMounted(async () => {
  await cargarProductos();
  await cargarCajaAbierta();
});
</script>

<style scoped>
.ejemplo-supabase {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.connection-status {
  padding: 10px;
  margin-bottom: 20px;
  border-radius: 5px;
  text-align: center;
  font-weight: bold;
}

.connection-status.connected {
  background: #d4edda;
  color: #155724;
}

.connection-status.error {
  background: #f8d7da;
  color: #721c24;
}

.tabs {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
  border-bottom: 2px solid #ddd;
}

.tabs button {
  padding: 10px 20px;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 16px;
}

.tabs button.active {
  border-bottom: 3px solid #007bff;
  color: #007bff;
  font-weight: bold;
}

.loading {
  padding: 20px;
  text-align: center;
  color: #007bff;
}

.error {
  padding: 15px;
  background: #f8d7da;
  color: #721c24;
  border-radius: 5px;
  margin-bottom: 20px;
}

.tab-content {
  padding: 20px;
}

.actions {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.actions input {
  flex: 1;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 5px;
}

.actions button,
button {
  padding: 10px 20px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
}

button:hover {
  background: #0056b3;
}

button:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.products-list,
.sales-list,
.clients-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 15px;
  margin-top: 20px;
}

.product-card,
.sale-card,
.client-card {
  padding: 15px;
  border: 1px solid #ddd;
  border-radius: 5px;
  background: white;
}

.product-card h3,
.sale-card h4,
.client-card h3 {
  margin-top: 0;
  color: #333;
}

.badge {
  display: inline-block;
  padding: 3px 8px;
  border-radius: 3px;
  font-size: 12px;
  font-weight: bold;
}

.badge.danger {
  background: #f8d7da;
  color: #721c24;
}

.badge.completada {
  background: #d4edda;
  color: #155724;
}

.stats {
  display: flex;
  gap: 20px;
  margin: 20px 0;
}

.stat-card {
  flex: 1;
  padding: 20px;
  background: #f8f9fa;
  border-radius: 5px;
  text-align: center;
}

.stat-value {
  font-size: 32px;
  font-weight: bold;
  color: #007bff;
  margin: 10px 0;
}

.low-stock-list {
  margin-top: 10px;
}

.low-stock-item {
  padding: 10px;
  background: #fff3cd;
  border-left: 4px solid #ffc107;
  margin-bottom: 5px;
}

.current-cash,
.no-cash-open {
  padding: 20px;
  background: #f8f9fa;
  border-radius: 5px;
}

.cash-actions,
.open-cash-form {
  display: flex;
  gap: 10px;
  margin-top: 15px;
}

.cash-actions input,
.open-cash-form input {
  flex: 1;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 5px;
}

.modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  padding: 30px;
  border-radius: 10px;
  max-width: 600px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
  position: relative;
}

.modal-content .close {
  position: absolute;
  top: 10px;
  right: 15px;
  font-size: 28px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  width: 30px;
  height: 30px;
}

.detail-item {
  padding: 15px;
  border-bottom: 1px solid #ddd;
}

.detail-item:last-child {
  border-bottom: none;
}
</style>
