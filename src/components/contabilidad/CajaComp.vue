<template>
  <div class="p-4 sm:p-6 max-w-7xl mx-auto">
    <div v-if="loading" class="text-center py-16 text-surface-500"><i class="pi pi-spin pi-spinner text-2xl mb-2 block"></i>Cargando caja...</div>

    <div v-else-if="!turnoActual" class="text-center py-16 max-w-md mx-auto">
      <div class="w-20 h-20 mx-auto mb-4 rounded-2xl bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center text-yellow-600"><i class="pi pi-calculator text-3xl"></i></div>
      <h2 class="text-xl font-bold mb-1">No hay turno abierto</h2>
      <p class="text-sm text-surface-500 mb-6">Debes abrir un turno de caja para registrar movimientos</p>
      <button @click="abrirTurnoModal = true" class="px-6 py-3 rounded-xl text-white font-semibold shadow-lg transition-all hover:opacity-90 flex items-center gap-2 mx-auto" :style="{ background: 'var(--p-primary-500)' }"><i class="pi pi-plus"></i>Abrir Turno de Caja</button>
    </div>

    <div v-else>
      <div class="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div class="flex items-center gap-3">
          <div>
            <div class="flex items-center gap-3">
              <h1 class="text-2xl font-bold">Control de Caja</h1>
              <span class="flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-semibold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"><span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>Turno Abierto</span>
              <span class="flex items-center gap-1 text-xs text-surface-500"><i class="pi pi-clock"></i>{{ horasAbiertas }}</span>
            </div>
          </div>
        </div>
        <div class="flex gap-2">
          <button @click="cargarDatos" :disabled="refreshing" class="w-10 h-10 flex items-center justify-center rounded-lg border border-surface-300 dark:border-surface-600 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"><i class="pi pi-refresh" :class="{ 'pi-spin': refreshing }"></i></button>
          <button @click="abrirCierreTurno" :disabled="cerrandoTurno" class="flex items-center gap-2 px-4 py-2.5 rounded-lg text-white text-sm font-semibold bg-red-500 hover:bg-red-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"><i class="pi pi-times-circle"></i>Cerrar Turno</button>
        </div>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div class="xl:col-span-2 space-y-4">
          <div class="p-5 rounded-xl text-white" :style="{ background: 'linear-gradient(135deg, #065f46, #047857)' }">
            <div class="flex items-center gap-2 text-sm opacity-90 mb-1"><i class="pi pi-money-bill"></i>Efectivo en Caja</div>
            <div v-if="!auth.isCajero" class="text-3xl font-extrabold mb-3">{{ formatMoney(efectivoEsperado) }}</div>
            <div v-else class="text-lg font-bold mb-3 flex items-center gap-2"><i class="pi pi-eye-slash"></i>Oculto hasta declarar el conteo</div>
            <div v-if="!auth.isCajero" class="border-t border-white/20 pt-3 space-y-1 text-sm opacity-90">
              <div class="flex justify-between"><span>Inicial:</span><span>{{ formatMoney(turnoActual.monto_inicial) }}</span></div>
              <div class="flex justify-between"><span>+ Ingresos en efectivo:</span><span class="text-green-300">{{ formatMoney(resumenVentas.efectivo) }}</span></div>
              <div class="flex justify-between"><span>+ Entradas:</span><span class="text-green-300">{{ formatMoney(turnoActual.entradas || 0) }}</span></div>
              <div class="flex justify-between"><span>- Gastos efectivo:</span><span class="text-red-300">{{ formatMoney(gastosEfectivoTurno) }}</span></div>
              <div class="flex justify-between"><span>- Retiros:</span><span class="text-red-300">{{ formatMoney(turnoActual.retiros || 0) }}</span></div>
            </div>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div class="p-4 rounded-xl bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 flex items-center gap-3">
              <div class="w-11 h-11 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600"><i class="pi pi-money-bill"></i></div>
              <div><div class="text-xs text-surface-500 uppercase">Efectivo</div><div class="font-bold">{{ formatMoney(resumenVentas.efectivo) }}</div></div>
            </div>
            <div class="p-4 rounded-xl bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 flex items-center gap-3">
              <div class="w-11 h-11 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600"><i class="pi pi-credit-card"></i></div>
              <div><div class="text-xs text-surface-500 uppercase">Tarjeta</div><div class="font-bold">{{ formatMoney(resumenVentas.tarjeta) }}</div></div>
            </div>
            <div class="p-4 rounded-xl bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 flex items-center gap-3">
              <div class="w-11 h-11 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600"><i class="pi pi-send"></i></div>
              <div><div class="text-xs text-surface-500 uppercase">Transferencia</div><div class="font-bold">{{ formatMoney(resumenVentas.transferencia) }}</div></div>
            </div>
            <div class="p-4 rounded-xl bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 flex items-center gap-3">
              <div class="w-11 h-11 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600"><i class="pi pi-receipt"></i></div>
              <div><div class="text-xs text-surface-500 uppercase">Gastos</div><div class="font-bold">{{ formatMoney(gastosTurno) }}</div></div>
            </div>
          </div>

          <div class="p-5 rounded-xl border border-orange-200 dark:border-orange-900/50 bg-orange-50 dark:bg-orange-900/10">
            <div class="flex items-center gap-2 text-sm text-orange-800 dark:text-orange-300 mb-1"><i class="pi pi-chart-line"></i>Total cobrado en el turno</div>
            <div class="text-2xl font-extrabold text-orange-600 dark:text-orange-400">{{ formatMoney(resumenVentas.total) }}</div>
            <div class="text-sm text-orange-700 dark:text-orange-500">{{ resumenVentas.cantidadVentas }} venta(s) · {{ resumenVentas.cantidadAbonosCxc }} abono(s) CxC · {{ resumenVentas.cantidadCobrosTaller }} cobro(s) de taller</div>
          </div>

          <div v-if="abonosTurno.length" class="rounded-xl border border-cyan-200 dark:border-cyan-900/50 bg-surface-0 dark:bg-surface-800 overflow-hidden">
            <div class="flex justify-between items-center px-4 py-3 bg-cyan-50 dark:bg-cyan-900/20 font-bold text-sm text-cyan-800 dark:text-cyan-300">
              <span>Abonos de cuentas por cobrar ({{ abonosTurno.length }})</span><span>{{ formatMoney(resumenVentas.abonosCxc) }}</span>
            </div>
            <div class="divide-y divide-cyan-100 dark:divide-cyan-900/20 max-h-52 overflow-auto">
              <div v-for="p in abonosTurno" :key="`${p.cuenta_id}-${p.id}`" class="flex justify-between items-center px-4 py-2.5 text-sm">
                <div><div class="font-medium">Factura #{{ p.no_factura }} · {{ p.nombre_cliente }}</div><div class="text-[10px] text-surface-400">{{ p.metodo }} · {{ formatTime(p.fecha || p.created_at) }}</div></div>
                <span class="font-bold text-cyan-600 dark:text-cyan-400">+{{ formatMoney(p.monto) }}</span>
              </div>
            </div>
          </div>

          <div v-if="cobrosTallerTurno.length" class="rounded-xl border border-violet-200 dark:border-violet-900/50 bg-surface-0 dark:bg-surface-800 overflow-hidden">
            <div class="flex justify-between items-center px-4 py-3 bg-violet-50 dark:bg-violet-900/20 font-bold text-sm text-violet-800 dark:text-violet-300"><span>Cobros de taller ({{ cobrosTallerTurno.length }})</span><span>{{ formatMoney(resumenVentas.cobrosTaller) }}</span></div>
            <div class="divide-y divide-violet-100 dark:divide-violet-900/20 max-h-52 overflow-auto"><div v-for="p in cobrosTallerTurno" :key="`${p.orden_id}-${p.id}`" class="flex justify-between items-center px-4 py-2.5 text-sm"><div><div class="font-medium">Orden #{{ p.no_orden }} · {{ p.cliente }}</div><div class="text-[10px] text-surface-400">{{ p.metodo }} · {{ formatTime(p.fecha || p.created_at) }}</div></div><span class="font-bold text-violet-600 dark:text-violet-400">+{{ formatMoney(p.monto) }}</span></div></div>
          </div>

          <div v-if="gastosLista.length" class="rounded-xl border border-red-200 dark:border-red-900/50 bg-surface-0 dark:bg-surface-800 overflow-hidden">
            <div class="flex justify-between items-center px-4 py-3 bg-red-50 dark:bg-red-900/20 font-bold text-sm text-red-800 dark:text-red-300">
              <span>Gastos del turno ({{ gastosLista.length }})</span>
              <span>-{{ formatMoney(gastosTurno) }}</span>
            </div>
            <div class="divide-y divide-red-100 dark:divide-red-900/20 max-h-52 overflow-auto">
              <div v-for="g in gastosLista" :key="g.id" class="flex justify-between items-center px-4 py-2.5 text-sm">
                <div class="min-w-0"><div class="font-medium truncate">{{ g.comentario }}</div><div class="text-[10px] text-surface-400">{{ g.metodo_pago || 'EFECTIVO' }}<span v-if="g.banco_nombre"> · {{ g.banco_nombre }}</span></div></div>
                <div class="flex items-center gap-2 shrink-0 ml-3">
                  <span class="font-bold text-red-600 dark:text-red-400">-{{ formatMoney(g.cantidad || g.monto) }}</span>
                  <button type="button" class="w-8 h-8 rounded-lg inline-flex items-center justify-center text-orange-600 hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors" title="Imprimir gasto" @click="imprimirGastoRegistrado(g)"><i class="pi pi-print"></i></button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="xl:col-span-1 space-y-4 xl:sticky xl:top-4 xl:self-start">
          <div v-if="facturasPendientes.length" class="rounded-xl border-2 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 overflow-hidden shadow-sm">
            <div class="flex items-center justify-between px-4 py-3 border-b border-amber-200 dark:border-amber-800"><div><h3 class="font-bold text-amber-800 dark:text-amber-300 flex items-center gap-2"><i class="pi pi-clock"></i>Facturas pendientes</h3><p class="text-[11px] text-amber-700 dark:text-amber-400">Enviadas por vendedores para cobrar</p></div><span class="px-2.5 py-1 rounded-full bg-amber-500 text-white text-xs font-bold">{{ facturasPendientes.length }}</span></div>
            <div class="divide-y divide-amber-200 dark:divide-amber-800 max-h-64 overflow-auto">
              <div v-for="factura in facturasPendientes" :key="factura.id" class="p-3">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="font-bold text-sm">#{{ factura.no_factura }}</p>
                    <p class="text-xs text-surface-600 dark:text-surface-300 truncate">{{ factura.nombre_cliente || 'CONSUMIDOR FINAL' }}</p>
                    <p class="text-[10px] text-surface-500">Vendedor: {{ factura.vendedor || factura.usuario || '-' }}</p>
                  </div>
                  <div class="text-right shrink-0">
                    <p class="font-extrabold text-amber-700 dark:text-amber-300">{{ formatMoney(factura.total) }}</p>
                    <div class="mt-1.5 flex items-center justify-end gap-1.5">
                      <button type="button" @click="abrirEliminarFacturaPendiente(factura)" class="w-8 h-8 rounded-lg border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 inline-flex items-center justify-center transition-colors" title="Eliminar factura pendiente con OTP"><i class="pi pi-trash"></i></button>
                      <button type="button" @click="verProductosFacturaPendiente(factura)" class="px-2.5 py-1.5 rounded-lg border border-amber-400 dark:border-amber-600 bg-white/70 dark:bg-surface-800 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-amber-800 dark:text-amber-300 text-xs font-bold flex items-center gap-1.5 transition-colors" title="Ver productos de la factura"><i class="pi pi-shopping-bag"></i>Productos</button>
                      <button type="button" @click="cobrarFacturaPendiente(factura)" class="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-bold flex items-center gap-1.5"><i class="pi pi-dollar"></i>Cobrar</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="grid grid-cols-3 gap-2">
            <button @click="abrirMovimiento('entrada')" class="px-2 py-3 rounded-xl font-semibold text-sm border border-green-200 dark:border-green-800 transition-all bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50 flex flex-col sm:flex-row items-center justify-center gap-1.5"><i class="pi pi-plus-circle"></i>Entrada</button>
            <button @click="abrirMovimiento('retiro')" class="px-2 py-3 rounded-xl font-semibold text-sm border border-red-200 dark:border-red-800 transition-all bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 flex flex-col sm:flex-row items-center justify-center gap-1.5"><i class="pi pi-minus-circle"></i>Retiro</button>
            <button @click="agregarGasto" class="px-2 py-3 rounded-xl font-semibold text-sm border border-orange-200 dark:border-orange-800 transition-all bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 hover:bg-orange-200 dark:hover:bg-orange-900/50 flex flex-col sm:flex-row items-center justify-center gap-1.5"><i class="pi pi-receipt"></i>Gasto</button>
          </div>
          <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 overflow-hidden max-h-[calc(100vh-190px)] flex flex-col">
            <div class="flex items-center justify-between px-4 py-3 border-b border-surface-100 dark:border-surface-700">
              <h3 class="font-semibold flex items-center gap-2"><i class="pi pi-receipt text-primary-500"></i>Ultimas Ventas</h3>
              <span class="px-2 py-0.5 rounded-full text-xs font-medium bg-surface-100 dark:bg-surface-700">{{ ultimasVentas.length }}</span>
            </div>
            <div v-if="ultimasVentas.length" class="flex-1 overflow-y-auto p-2 space-y-1">
              <div v-for="v in ultimasVentas" :key="v.id" class="flex items-center gap-3 p-2.5 rounded-lg hover:bg-surface-50 dark:hover:bg-surface-700/50 transition-colors cursor-pointer" @click="verDetalleVenta(v)">
                <div class="w-9 h-9 rounded-lg flex items-center justify-center text-sm" :class="v.metodo_pago === 'efectivo' ? 'bg-green-100 text-green-600' : v.metodo_pago === 'tarjeta' || v.metodo_pago?.includes('tarjeta') ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'"><i :class="v.metodo_pago === 'efectivo' ? 'pi pi-money-bill' : v.metodo_pago === 'tarjeta' || v.metodo_pago?.includes('tarjeta') ? 'pi pi-credit-card' : 'pi pi-send'" class="text-xs"></i></div>
                <div class="flex-1 min-w-0"><div class="text-sm font-medium">{{ v.nombre_cliente || 'Cliente General' }}</div><div class="text-xs text-surface-500">{{ formatTime(v.created_at) }}</div></div>
                <div class="text-right"><div class="font-bold text-sm">{{ formatMoney(v.total) }}</div></div>
              </div>
            </div>
            <div v-else class="flex-1 flex flex-col items-center justify-center p-8 text-surface-400"><i class="pi pi-receipt text-3xl mb-2"></i><p class="text-sm">No hay ventas en este turno</p></div>
          </div>
        </div>
      </div>
    </div>

    <Dialog v-model:visible="abrirTurnoModal" header="Abrir Turno de Caja" modal :style="{ width: 'min(24rem, 92vw)' }" :closable="false">
      <div class="space-y-4">
        <div>
          <label class="text-xs font-semibold mb-1.5 block">Monto Inicial</label>
          <div class="flex items-center rounded-lg border border-surface-300 dark:border-surface-600 bg-surface-0 dark:bg-surface-700 overflow-hidden focus-within:ring-2 focus-within:ring-primary-500">
            <span class="px-3 py-2.5 text-sm font-semibold bg-surface-100 dark:bg-surface-800 border-r border-surface-300 dark:border-surface-600">RD$</span>
            <input v-model.number="montoInicial" type="number" step="0.01" min="0" class="flex-1 px-3 py-2.5 text-sm font-bold outline-none bg-transparent" placeholder="0.00" />
          </div>
        </div>
        <div>
          <label class="text-xs font-semibold mb-1.5 block">Observacion</label>
          <input v-model="observacionApertura" class="w-full px-3 py-2.5 rounded-lg border border-surface-300 dark:border-surface-600 bg-surface-0 dark:bg-surface-700 text-sm outline-none focus:ring-2 focus:ring-primary-500" placeholder="Opcional" />
        </div>
      </div>
      <template #footer>
        <div class="flex gap-2 justify-end">
          <button @click="abrirTurnoModal = false" class="px-4 py-2 rounded-lg text-sm font-medium border border-surface-300 dark:border-surface-600 hover:bg-surface-100 dark:hover:bg-surface-700">Cancelar</button>
          <button @click="guardarApertura" :disabled="abriendoTurno" class="px-5 py-2 rounded-lg text-white text-sm font-medium flex items-center gap-2" :style="{ backgroundColor: 'var(--p-primary-500)' }"><i v-if="abriendoTurno" class="pi pi-spin pi-spinner"></i><i v-else class="pi pi-check"></i>Abrir Turno</button>
        </div>
      </template>
    </Dialog>

    <Dialog v-model:visible="showCobroPendienteModal" header="Cobrar factura pendiente" modal :style="{ width: 'min(30rem, 94vw)' }" :draggable="false">
      <div v-if="facturaPendienteCobro" class="space-y-5">
        <div class="rounded-xl bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 p-4 flex justify-between gap-4"><div><p class="text-xs text-surface-500 uppercase">Factura</p><p class="font-bold">#{{ facturaPendienteCobro.no_factura }}</p><p class="text-sm text-surface-500">{{ facturaPendienteCobro.nombre_cliente || 'CONSUMIDOR FINAL' }}</p></div><div class="text-right"><p class="text-xs text-surface-500 uppercase">Total a cobrar</p><p class="text-2xl font-extrabold text-primary">{{ formatMoney(facturaPendienteCobro.total) }}</p></div></div>
        <div><label class="text-xs font-bold uppercase text-surface-500 mb-2 block">Método de pago</label><div class="grid grid-cols-2 gap-2"><button v-for="metodo in metodosCobroPendiente" :key="metodo.value" type="button" class="p-3 rounded-xl border-2 font-bold text-sm flex items-center justify-center gap-2 transition-all" :class="metodoCobroPendiente === metodo.value ? metodo.activeClass : 'border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 hover:border-primary-300'" @click="seleccionarMetodoCobroPendiente(metodo.value)"><i :class="metodo.icon"></i>{{ metodo.label }}</button></div></div>
        <div v-if="metodoCobroPendiente === 'MIXTO'" class="rounded-xl border border-surface-200 dark:border-surface-700 p-4 space-y-3"><div><label class="text-xs font-semibold block mb-1">Efectivo</label><input v-model.number="cobroMixto.efectivo" type="number" min="0" step="0.01" class="w-full px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-transparent text-right font-bold" /></div><div><label class="text-xs font-semibold block mb-1">Transferencia</label><input v-model.number="cobroMixto.transferencia" type="number" min="0" step="0.01" class="w-full px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-transparent text-right font-bold" /></div><div><label class="text-xs font-semibold block mb-1">Tarjeta</label><input v-model.number="cobroMixto.tarjeta" type="number" min="0" step="0.01" class="w-full px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-transparent text-right font-bold" /></div><div class="flex justify-between font-bold border-t border-surface-200 dark:border-surface-700 pt-3"><span>Total distribuido</span><span :class="cobroMixtoValido ? 'text-green-600' : 'text-red-500'">{{ formatMoney(totalCobroMixto) }}</span></div><p v-if="!cobroMixtoValido" class="text-xs text-red-500">La distribución debe coincidir con {{ formatMoney(facturaPendienteCobro.total) }}.</p></div>
        <div v-if="cobroPendienteRequiereBanco" class="flex flex-col gap-1"><label class="text-xs font-bold uppercase text-surface-500">Banco destino <span class="text-red-500">*</span></label><select v-model.number="bancoCobroPendienteId" class="w-full px-3 py-2.5 rounded-lg border border-surface-300 dark:border-surface-600 bg-surface-0 dark:bg-surface-800"><option :value="0">Seleccionar banco...</option><option v-for="banco in bancosCobroPendiente" :key="banco.id" :value="banco.id">{{ banco.nombre }}{{ banco.numero_cuenta ? ` · ${banco.numero_cuenta}` : '' }}</option></select><p v-if="!bancosCobroPendiente.length" class="text-xs text-amber-600">No hay bancos configurados.</p></div>
        <div class="flex flex-col gap-1"><label class="text-xs font-bold uppercase text-surface-500">Observación</label><textarea v-model="observacionCobroPendiente" rows="3" maxlength="500" placeholder="Referencia, autorización o detalle del cobro..." class="w-full px-3 py-2.5 rounded-lg border border-surface-300 dark:border-surface-600 bg-surface-0 dark:bg-surface-800 resize-none"></textarea></div>
      </div>
      <template #footer><button @click="showCobroPendienteModal = false" class="px-4 py-2 rounded-lg text-sm font-semibold hover:bg-surface-100 dark:hover:bg-surface-800">Cancelar</button><button @click="confirmarCobroPendiente" :disabled="procesandoCobroPendiente || (metodoCobroPendiente === 'MIXTO' && !cobroMixtoValido) || (cobroPendienteRequiereBanco && !bancoCobroPendienteId)" class="px-5 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-bold disabled:opacity-50 flex items-center gap-2"><i class="pi" :class="procesandoCobroPendiente ? 'pi-spin pi-spinner' : 'pi-check'"></i>{{ procesandoCobroPendiente ? 'Cobrando...' : 'Confirmar cobro' }}</button></template>
    </Dialog>

    <Dialog v-model:visible="showProductosPendienteModal" :header="`Productos · Factura ${facturaProductosPendiente?.no_factura || ''}`" modal :style="{ width: 'min(48rem, 96vw)' }" :draggable="false">
      <div v-if="facturaProductosPendiente" class="space-y-4 pt-1">
        <div class="flex flex-wrap items-center justify-between gap-2 text-sm text-surface-500">
          <span>{{ facturaProductosPendiente.nombre_cliente || 'CONSUMIDOR FINAL' }}</span>
          <strong class="text-surface-900 dark:text-surface-0">Total: {{ formatMoney(facturaProductosPendiente.total || 0) }}</strong>
        </div>
        <div class="relative">
          <i class="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-surface-400"></i>
          <input v-model="busquedaProductosPendiente" type="search" placeholder="Buscar por producto, código, IMEI o serial..." class="w-full rounded-lg border border-surface-300 dark:border-surface-600 bg-surface-0 dark:bg-surface-800 py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
        <div v-if="productosFacturaPendiente.length" class="overflow-x-auto rounded-xl border border-surface-200 dark:border-surface-700">
          <table class="w-full min-w-[38rem] text-sm border-collapse">
            <thead class="bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-300">
              <tr><th class="text-left px-3 py-2.5 font-semibold">Producto</th><th class="text-center px-3 py-2.5 font-semibold">Cant.</th><th class="text-right px-3 py-2.5 font-semibold">Precio</th><th class="text-right px-3 py-2.5 font-semibold">Total</th></tr>
            </thead>
            <tbody>
              <tr v-for="(producto, index) in productosPendientesFiltrados" :key="producto.uid || producto.id || producto.imei || producto.serial || index" class="border-t border-surface-200 dark:border-surface-700">
                <td class="px-3 py-3"><p class="font-medium text-surface-900 dark:text-surface-0">{{ nombreProductoPendiente(producto) }}</p><p v-if="producto.codigo || producto.codigo_barra" class="text-xs text-surface-500 mt-0.5">Código: {{ producto.codigo || producto.codigo_barra }}</p><p v-if="producto.imei || producto.serial" class="text-xs text-surface-500 mt-0.5">{{ producto.imei ? `IMEI: ${producto.imei}` : `Serial: ${producto.serial}` }}</p></td>
                <td class="px-3 py-3 text-center">{{ cantidadProductoPendiente(producto) }}</td>
                <td class="px-3 py-3 text-right">{{ formatMoney(precioProductoPendiente(producto)) }}</td>
                <td class="px-3 py-3 text-right font-semibold">{{ formatMoney(totalProductoPendiente(producto)) }}</td>
              </tr>
            </tbody>
          </table>
          <div v-if="productosPendientesFiltrados.length === 0" class="py-8 text-center text-surface-500">No hay productos que coincidan con la búsqueda.</div>
        </div>
        <div v-else class="py-10 text-center text-surface-500"><i class="pi pi-shopping-bag text-3xl block mb-3 text-surface-400"></i>Esta factura no tiene productos registrados.</div>
      </div>
      <template #footer><button type="button" @click="showProductosPendienteModal = false" class="px-4 py-2 rounded-lg text-sm font-medium border border-surface-300 dark:border-surface-600 hover:bg-surface-100 dark:hover:bg-surface-700">Cerrar</button></template>
    </Dialog>

    <TicketFacturaPrint ref="ticketFacturaRef" />
    <FacturaPdfPrint ref="facturaPdfRef" />
    <TicketGastoPrint ref="ticketGastoRef" />
    <Dialog v-model:visible="showEntregaFacturaModal" header="Imprimir" modal :style="{ width: 'min(24rem, 95vw)' }" :closable="true">
      <div class="flex flex-col gap-3 pt-2">
        <div class="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3 mb-1">
          <p class="font-semibold text-green-700 dark:text-green-300">Factura {{ facturaEntrega?.no_factura }} cobrada</p>
          <p class="text-xs text-green-600 dark:text-green-400">Selecciona como deseas entregar el comprobante.</p>
        </div>
        <Button label="Ticket Termico" icon="pi pi-print" severity="info" outlined class="w-full justify-start" @click="imprimirTicketCobrado" />
        <Button label="PDF" icon="pi pi-file-pdf" severity="danger" outlined class="w-full justify-start" @click="imprimirPdfCobrado" />
        <Button label="Enviar por Correo" icon="pi pi-envelope" severity="help" outlined class="w-full justify-start" @click="enviarCorreoCobrado" />
        <Button label="Compartir por WhatsApp" icon="pi pi-whatsapp" severity="success" outlined class="w-full justify-start" @click="compartirWhatsAppCobrado" />
        <Button label="Compartir" icon="pi pi-share-alt" severity="info" outlined class="w-full justify-start" @click="compartirFacturaCobrada" />
        <Button label="Ninguno" icon="pi pi-times" severity="secondary" text class="w-full justify-start" @click="showEntregaFacturaModal = false" />
      </div>
    </Dialog>

    <Dialog v-model:visible="showImprimirGastoModal" header="Gasto registrado" modal :style="{ width: 'min(24rem, 95vw)' }">
      <div class="space-y-4 pt-2">
        <div class="rounded-xl border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20 p-4">
          <p class="text-xs uppercase text-orange-600 dark:text-orange-400">Comprobante de gasto</p>
          <p class="font-semibold mt-1">{{ gastoParaImprimir?.comentario }}</p>
          <p class="text-2xl font-extrabold text-orange-700 dark:text-orange-300 mt-2">{{ formatMoney(gastoParaImprimir?.cantidad) }}</p>
          <p class="text-xs text-surface-500 mt-1">{{ gastoParaImprimir?.metodo_pago }}<span v-if="gastoParaImprimir?.banco_nombre"> · {{ gastoParaImprimir.banco_nombre }}</span></p>
        </div>
        <p class="text-sm text-surface-500">¿Deseas imprimir el comprobante?</p>
      </div>
      <template #footer>
        <Button label="No imprimir" icon="pi pi-times" severity="secondary" text @click="showImprimirGastoModal = false" />
        <Button label="Imprimir ticket" icon="pi pi-print" severity="warning" @click="imprimirGastoCreado" />
      </template>
    </Dialog>

    <Dialog v-model:visible="showMovimientoModal" :header="tipoMovimiento === 'entrada' ? 'Entrada de Efectivo' : 'Retiro de Efectivo'" modal :style="{ width: '90%', maxWidth: '400px' }" :closable="false">
      <div class="space-y-4">
        <div>
          <label class="text-xs font-semibold mb-1.5 block">Monto</label>
          <div class="flex items-center rounded-lg border border-surface-300 dark:border-surface-600 bg-surface-0 dark:bg-surface-700 overflow-hidden focus-within:ring-2 focus-within:ring-primary-500">
            <span class="px-3 py-2.5 text-sm font-semibold bg-surface-100 dark:bg-surface-800 border-r border-surface-300 dark:border-surface-600">RD$</span>
            <input v-model.number="montoMovimiento" type="number" step="0.01" min="0" class="flex-1 px-3 py-2.5 text-sm font-bold outline-none bg-transparent" placeholder="0.00" />
          </div>
        </div>
        <div>
          <label class="text-xs font-semibold mb-1.5 block">Descripcion (opcional)</label>
          <input v-model="descripcionMovimiento" class="w-full px-3 py-2.5 rounded-lg border border-surface-300 dark:border-surface-600 bg-surface-0 dark:bg-surface-700 text-sm outline-none focus:ring-2 focus:ring-primary-500" placeholder="Ej: Cambio para cliente" />
        </div>
      </div>
      <template #footer>
        <div class="flex gap-2 justify-end">
          <button @click="showMovimientoModal = false" class="px-4 py-2 rounded-lg text-sm font-medium border border-surface-300 dark:border-surface-600 hover:bg-surface-100 dark:hover:bg-surface-700">Cancelar</button>
          <button @click="guardarMovimiento" :disabled="procesandoMovimiento || !montoMovimiento" class="px-5 py-2 rounded-lg text-white text-sm font-medium flex items-center gap-2" :class="tipoMovimiento === 'entrada' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-500 hover:bg-red-600'"><i v-if="procesandoMovimiento" class="pi pi-spin pi-spinner"></i><i v-else class="pi pi-check"></i>Registrar</button>
        </div>
      </template>
    </Dialog>

    <Dialog v-model:visible="showGastoModal" header="Registrar Gasto" modal :style="{ width: 'min(24rem, 92vw)' }" :closable="false">
      <div class="space-y-4">
        <div>
          <label class="text-xs font-semibold mb-1.5 block">Categoria</label>
          <select v-model="gastoForm.categoria" class="w-full px-3 py-2.5 rounded-lg border border-surface-300 dark:border-surface-600 bg-surface-0 dark:bg-surface-700 text-sm outline-none focus:ring-2 focus:ring-primary-500">
            <option value="">Seleccionar</option>
            <option v-for="cat in categoriasGasto" :key="cat" :value="cat">{{ cat }}</option>
          </select>
        </div>
        <div>
          <label class="text-xs font-semibold mb-1.5 block">Descripcion <span class="text-red-500">*</span></label>
          <input v-model="gastoForm.descripcion" class="w-full px-3 py-2.5 rounded-lg border border-surface-300 dark:border-surface-600 bg-surface-0 dark:bg-surface-700 text-sm outline-none focus:ring-2 focus:ring-primary-500" placeholder="Ej: Compra de hielo" />
        </div>
        <div>
          <label class="text-xs font-semibold mb-1.5 block">Monto <span class="text-red-500">*</span></label>
          <div class="flex items-center rounded-lg border border-surface-300 dark:border-surface-600 bg-surface-0 dark:bg-surface-700 overflow-hidden focus-within:ring-2 focus-within:ring-primary-500">
            <span class="px-3 py-2.5 text-sm font-semibold bg-surface-100 dark:bg-surface-800 border-r border-surface-300 dark:border-surface-600">RD$</span>
            <input v-model.number="gastoForm.monto" type="number" step="0.01" min="0" class="flex-1 px-3 py-2.5 text-sm font-bold outline-none bg-transparent" placeholder="0.00" />
          </div>
        </div>
        <div>
          <label class="text-xs font-semibold mb-1.5 block">Metodo de pago</label>
          <select v-model="gastoForm.metodo_pago" class="w-full px-3 py-2.5 rounded-lg border border-surface-300 dark:border-surface-600 bg-surface-0 dark:bg-surface-700 text-sm outline-none focus:ring-2 focus:ring-primary-500" @change="cambiarMetodoGasto">
            <option value="EFECTIVO">Efectivo</option>
            <option value="TRANSFERENCIA">Transferencia</option>
            <option value="MIXTO">Mixto (efectivo + transferencia)</option>
          </select>
        </div>
        <div v-if="gastoForm.metodo_pago === 'MIXTO'" class="grid grid-cols-2 gap-3 rounded-xl border border-orange-200 dark:border-orange-900/60 bg-orange-50/70 dark:bg-orange-950/20 p-3">
          <div>
            <label class="text-xs font-semibold mb-1.5 block">Parte en efectivo <span class="text-red-500">*</span></label>
            <input v-model.number="gastoForm.efectivo" type="number" step="0.01" min="0" :max="gastoForm.monto" class="w-full px-3 py-2.5 rounded-lg border border-surface-300 dark:border-surface-600 bg-surface-0 dark:bg-surface-700 text-sm font-bold outline-none focus:ring-2 focus:ring-primary-500" placeholder="0.00" @input="ajustarMixtoDesdeEfectivo(Number($event.target.value))" />
          </div>
          <div>
            <label class="text-xs font-semibold mb-1.5 block">Parte transferida <span class="text-red-500">*</span></label>
            <input v-model.number="gastoForm.transferencia" type="number" step="0.01" min="0" :max="gastoForm.monto" class="w-full px-3 py-2.5 rounded-lg border border-surface-300 dark:border-surface-600 bg-surface-0 dark:bg-surface-700 text-sm font-bold outline-none focus:ring-2 focus:ring-primary-500" placeholder="0.00" @input="ajustarMixtoDesdeTransferencia(Number($event.target.value))" />
          </div>
          <p class="col-span-2 text-xs" :class="distribucionGastoValida ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
            Efectivo {{ formatMoney(gastoForm.efectivo || 0) }} + transferencia {{ formatMoney(gastoForm.transferencia || 0) }} = {{ formatMoney(Number(gastoForm.efectivo || 0) + Number(gastoForm.transferencia || 0)) }}
          </p>
        </div>
        <div v-if="gastoForm.metodo_pago === 'TRANSFERENCIA' || gastoForm.metodo_pago === 'MIXTO'">
          <label class="text-xs font-semibold mb-1.5 block">Banco de origen <span class="text-red-500">*</span></label>
          <select v-model="gastoForm.banco_id" :disabled="cargandoBancosGasto" class="w-full px-3 py-2.5 rounded-lg border border-surface-300 dark:border-surface-600 bg-surface-0 dark:bg-surface-700 text-sm outline-none focus:ring-2 focus:ring-primary-500">
            <option :value="null">{{ cargandoBancosGasto ? 'Cargando bancos...' : 'Seleccionar banco' }}</option>
            <option v-for="banco in bancosGasto" :key="banco.uid || banco.id" :value="banco.id">{{ banco.nombre }} · {{ formatMoney(Number(banco.saldo || 0)) }}</option>
          </select>
          <p v-if="!cargandoBancosGasto && bancosGasto.length === 0" class="text-xs text-amber-500 mt-1">No hay bancos configurados.</p>
        </div>
      </div>
      <template #footer>
        <div class="flex gap-2 justify-end">
          <button @click="showGastoModal = false" class="px-4 py-2 rounded-lg text-sm font-medium border border-surface-300 dark:border-surface-600 hover:bg-surface-100 dark:hover:bg-surface-700">Cancelar</button>
          <button @click="guardarGasto" :disabled="procesandoGasto || gastoInvalido" class="px-5 py-2 rounded-lg text-white text-sm font-medium flex items-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50"><i v-if="procesandoGasto" class="pi pi-spin pi-spinner"></i><i v-else class="pi pi-check"></i>Guardar Gasto</button>
        </div>
      </template>
    </Dialog>

    <Dialog v-model:visible="showDetalleVenta" :header="'Venta #' + (ventaSeleccionada?.id || '')" modal :style="{ width: 'min(24rem, 92vw)' }" :closable="false">
      <div v-if="ventaSeleccionada" class="space-y-3">
        <div class="grid grid-cols-2 gap-3 text-sm">
          <div><span class="text-surface-500 text-xs">Cliente</span><p class="font-medium">{{ ventaSeleccionada.nombre_cliente || 'Cliente General' }}</p></div>
          <div><span class="text-surface-500 text-xs">Metodo Pago</span><p class="font-medium">{{ ventaSeleccionada.metodo_pago || '—' }}</p></div>
          <div><span class="text-surface-500 text-xs">Fecha</span><p>{{ formatDate(ventaSeleccionada.created_at) }}</p></div>
          <div><span class="text-surface-500 text-xs">Vendedor</span><p>{{ ventaSeleccionada.vendedor || '—' }}</p></div>
        </div>
        <div class="border-t border-surface-200 dark:border-surface-700 pt-3">
          <div class="flex justify-between text-lg font-bold"><span>Total</span><span>{{ formatMoney(ventaSeleccionada.total) }}</span></div>
        </div>
        <button type="button" @click="reimprimirVentaSeleccionada" class="w-full px-4 py-3 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-2 shadow-sm transition-all hover:brightness-90" style="background-color: var(--p-primary-600, #2563eb); color: #ffffff; border: 1px solid var(--p-primary-700, #1d4ed8);">
          <i class="pi pi-print"></i>Reimprimir factura
        </button>
      </div>
      <template #footer>
        <button @click="showDetalleVenta = false" class="px-4 py-2 rounded-lg text-sm font-medium border border-surface-300 dark:border-surface-600 hover:bg-surface-100 dark:hover:bg-surface-700">Cerrar</button>
      </template>
    </Dialog>

    <Dialog v-model:visible="showCierreModal" modal :style="{ width: 'min(54rem, 94vw)' }" :closable="!cerrandoTurno" :draggable="false">
      <template #header>
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-primary-600 text-white shadow-sm flex items-center justify-center">
            <i class="pi pi-calculator text-lg"></i>
          </div>
          <div>
            <h2 class="text-base font-bold text-surface-900 dark:text-surface-0">Cierre de caja</h2>
            <p class="text-xs text-surface-500 mt-0.5">Registra la cantidad de piezas por denominación</p>
          </div>
        </div>
      </template>

      <div class="flex flex-col gap-4">
        <div v-if="!esCierreCiego || cierreRevelado" class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div class="rounded-xl bg-surface-50 dark:bg-surface-800/70 px-3.5 py-3 shadow-sm ring-1 ring-surface-200/60 dark:ring-surface-700">
            <div class="flex items-center gap-2 text-xs font-medium text-surface-500 mb-1"><i class="pi pi-wallet"></i>Efectivo esperado</div>
            <p class="text-lg font-bold text-surface-900 dark:text-surface-0 tabular-nums">{{ formatMoney(efectivoEsperado) }}</p>
          </div>
          <div class="rounded-xl bg-primary-50 dark:bg-primary-950/30 px-3.5 py-3 shadow-sm ring-1 ring-primary-100/80 dark:ring-primary-900/60">
            <div class="flex items-center gap-2 text-xs font-medium text-primary-700 dark:text-primary-300 mb-1"><i class="pi pi-check-circle"></i>Total contado</div>
            <p class="text-lg font-bold text-primary-700 dark:text-primary-300 tabular-nums">{{ formatMoney(totalConteo) }}</p>
          </div>
          <div class="rounded-xl px-3.5 py-3 shadow-sm ring-1" :class="totalConteo === efectivoEsperado ? 'bg-green-50 ring-green-100/80 dark:bg-green-950/30 dark:ring-green-900/60' : 'bg-amber-50 ring-amber-100/80 dark:bg-amber-950/30 dark:ring-amber-900/60'">
            <div class="flex items-center gap-2 text-xs font-medium mb-1" :class="totalConteo === efectivoEsperado ? 'text-green-700 dark:text-green-300' : 'text-amber-700 dark:text-amber-300'">
              <i class="pi" :class="totalConteo === efectivoEsperado ? 'pi-verified' : 'pi-exclamation-circle'"></i>Diferencia
            </div>
            <p class="text-lg font-bold tabular-nums" :class="totalConteo === efectivoEsperado ? 'text-green-700 dark:text-green-300' : 'text-amber-700 dark:text-amber-300'">
              {{ totalConteo - efectivoEsperado > 0 ? '+' : totalConteo - efectivoEsperado < 0 ? '-' : '' }}{{ formatMoney(Math.abs(totalConteo - efectivoEsperado)) }}
            </p>
          </div>
        </div>
        <div v-else class="rounded-xl bg-blue-50 dark:bg-blue-950/30 p-4">
          <div class="flex gap-3">
            <div class="w-9 h-9 shrink-0 rounded-lg bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300 flex items-center justify-center"><i class="pi pi-shield"></i></div>
            <div>
              <p class="font-semibold text-blue-900 dark:text-blue-100">Cierre ciego activado</p>
              <p class="text-sm text-blue-700 dark:text-blue-300">Cuenta todo el efectivo y declara el resultado. El monto esperado y la diferencia se mostrarán después.</p>
              <p class="text-lg font-bold text-blue-900 dark:text-blue-100 mt-2">Declarado: {{ formatMoney(totalConteo) }}</p>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-3">
        <section class="rounded-2xl bg-surface-50/80 dark:bg-surface-900/30 p-3.5">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-primary-500"></span>
              <h3 class="text-sm font-bold text-surface-800 dark:text-surface-100">Billetes</h3>
              <p class="text-xs text-surface-400">Cantidad por denominación</p>
            </div>
          </div>
          <div class="space-y-2">
            <label v-for="d in denominaciones.filter(d => d.tipo === 'billete')" :key="d.valor" class="group grid grid-cols-[3.25rem_1fr_auto_4rem_auto_6rem] items-center gap-2 rounded-xl bg-surface-0 dark:bg-surface-800 px-2.5 py-2 shadow-sm ring-1 ring-surface-200/60 dark:ring-surface-700 transition-all focus-within:ring-2 focus-within:ring-primary-300 dark:focus-within:ring-primary-700">
              <span class="relative w-[3.25rem] h-8 rounded-md overflow-hidden text-white shadow-sm flex items-center justify-center" :style="{ background: d.color }">
                <span class="absolute -right-1 -bottom-2 w-7 h-7 rounded-full border border-white/25"></span>
                <span class="text-[10px] font-black tracking-tight">{{ d.valor.toLocaleString() }}</span>
              </span>
              <span class="text-xs font-bold text-surface-700 dark:text-surface-200">{{ d.label }}</span>
              <span class="text-xs font-semibold text-surface-300">×</span>
              <input
                v-model.number="conteo[d.valor]"
                type="number"
                inputmode="numeric"
                min="0"
                :disabled="esCierreCiego && cierreRevelado"
                placeholder="0"
                class="w-16 h-9 px-2 rounded-lg border-0 bg-surface-50 dark:bg-surface-900 text-sm text-center font-bold tabular-nums outline-none ring-1 ring-surface-200/70 dark:ring-surface-700 transition-all focus:ring-2 focus:ring-primary-400 disabled:opacity-60"
                @focus="$event.target.select()"
              />
              <span class="text-xs font-semibold text-surface-300">=</span>
              <span class="text-xs text-right font-bold text-surface-600 dark:text-surface-300 tabular-nums">{{ formatMoney(d.valor * (conteo[d.valor] || 0)) }}</span>
            </label>
          </div>
        </section>

        <section class="rounded-2xl bg-surface-50/80 dark:bg-surface-900/30 p-3.5">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-amber-400"></span>
              <h3 class="text-sm font-bold text-surface-800 dark:text-surface-100">Monedas</h3>
              <p class="text-xs text-surface-400">Cantidad por denominación</p>
            </div>
          </div>
          <div class="space-y-2">
            <label v-for="d in denominaciones.filter(d => d.tipo === 'moneda')" :key="d.valor" class="group grid grid-cols-[2.25rem_1fr_auto_3.5rem_auto_5.25rem] items-center gap-2 rounded-xl bg-surface-0 dark:bg-surface-800 px-2.5 py-2 shadow-sm ring-1 ring-surface-200/60 dark:ring-surface-700 transition-all focus-within:ring-2 focus-within:ring-primary-300 dark:focus-within:ring-primary-700">
              <span class="w-8 h-8 rounded-full text-white shadow-sm ring-2 ring-white/50 flex items-center justify-center" :style="{ background: d.color }">
                <span class="text-[10px] font-black">{{ d.valor }}</span>
              </span>
              <span class="text-xs font-bold text-surface-700 dark:text-surface-200">{{ d.label }}</span>
              <span class="text-xs font-semibold text-surface-300">×</span>
              <input
                v-model.number="conteo[d.valor]"
                type="number"
                inputmode="numeric"
                min="0"
                :disabled="esCierreCiego && cierreRevelado"
                placeholder="0"
                class="w-14 h-9 px-2 rounded-lg border-0 bg-surface-50 dark:bg-surface-900 text-sm text-center font-bold tabular-nums outline-none ring-1 ring-surface-200/70 dark:ring-surface-700 transition-all focus:ring-2 focus:ring-primary-400 disabled:opacity-60"
                @focus="$event.target.select()"
              />
              <span class="text-xs font-semibold text-surface-300">=</span>
              <span class="text-[11px] text-right font-bold text-surface-600 dark:text-surface-300 tabular-nums">{{ formatMoney(d.valor * (conteo[d.valor] || 0)) }}</span>
            </label>
            <div class="mt-3 rounded-xl bg-surface-900 dark:bg-surface-100 px-3.5 py-3 text-white dark:text-surface-900 shadow-sm">
              <div class="flex items-center justify-between text-xs opacity-70"><span>Piezas contadas</span><strong>{{ totalPiezas }}</strong></div>
              <div class="flex items-end justify-between mt-2"><span class="text-xs font-medium opacity-70">Total efectivo</span><strong class="text-lg tabular-nums">{{ formatMoney(totalConteo) }}</strong></div>
            </div>
          </div>
        </section>
        </div>
      </div>
      <template #footer>
        <div class="w-full flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
          <p class="hidden sm:block text-xs text-surface-400"><i class="pi pi-info-circle mr-1"></i>Verifica el conteo antes de confirmar</p>
          <div class="flex justify-end gap-2">
            <button @click="showCierreModal = false" :disabled="cerrandoTurno" class="px-4 py-2.5 rounded-lg text-sm font-semibold text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 disabled:opacity-50 transition-colors">Cancelar</button>
            <button v-if="esCierreCiego && !cierreRevelado" @click="declararConteo" :disabled="cerrandoTurno" class="px-5 py-2.5 rounded-lg text-white text-sm font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 shadow-sm transition-colors">
              <i class="pi pi-lock"></i>Declarar conteo
            </button>
            <button v-else @click="showCierreModal = false; cerrarTurno()" :disabled="cerrandoTurno" class="px-5 py-2.5 rounded-lg text-white text-sm font-semibold bg-red-500 hover:bg-red-600 disabled:opacity-50 flex items-center gap-2 shadow-sm transition-colors">
              <i class="pi" :class="cerrandoTurno ? 'pi-spin pi-spinner' : 'pi-check'"></i>
              {{ cerrandoTurno ? 'Cerrando...' : 'Confirmar cierre' }}
            </button>
          </div>
        </div>
      </template>
    </Dialog>

    <Dialog v-model:visible="showEliminarPendienteModal" header="Eliminar factura pendiente" modal :style="{ width: 'min(27rem, 94vw)' }" :draggable="false">
      <div class="space-y-4 pt-1">
        <div class="flex items-start gap-3 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3">
          <i class="pi pi-exclamation-triangle text-red-500 text-xl mt-0.5"></i>
          <div class="text-sm">
            <p>Se eliminara la factura <strong>#{{ facturaPendienteEliminar?.no_factura || facturaPendienteEliminar?.id }}</strong>.</p>
            <p class="text-xs text-surface-500 mt-1">{{ facturaPendienteEliminar?.nombre_cliente || 'CONSUMIDOR FINAL' }} · {{ formatMoney(facturaPendienteEliminar?.total || 0) }}</p>
          </div>
        </div>
        <p class="text-xs text-surface-500">Esta accion requiere el codigo OTP de 4 digitos.</p>
        <div v-if="eliminarPendienteOtpEnviado" class="flex flex-col items-center gap-3 rounded-xl border border-surface-200 dark:border-surface-700 p-3">
          <p class="text-xs text-surface-500 text-center">Consulta el codigo en el Centro OTP: {{ eliminarPendienteOtpUrl || 'Configuracion > OTP Local' }}.</p>
          <InputOtp v-model="eliminarPendienteOtp" :length="4" integerOnly mask />
        </div>
        <p v-if="eliminarPendienteError" class="text-sm text-red-500 text-center">{{ eliminarPendienteError }}</p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text :disabled="eliminandoPendiente" @click="showEliminarPendienteModal = false" />
        <Button v-if="!eliminarPendienteOtpEnviado" label="Solicitar OTP" icon="pi pi-envelope" severity="danger" :loading="solicitandoEliminarPendienteOtp" @click="solicitarOtpEliminarPendiente" />
        <Button v-else label="Confirmar y eliminar" icon="pi pi-trash" severity="danger" :loading="eliminandoPendiente" :disabled="String(eliminarPendienteOtp || '').length !== 4" @click="eliminarFacturaPendiente" />
      </template>
    </Dialog>
  </div>
</template>

<script setup>
import { formatSystemCurrency, formatSystemDate, formatSystemDateTime, formatSystemNumber, getSystemCurrencyCode } from '@/i18n/localeProfiles'
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'
import { useAlmacenStore } from '@/stores/almacen.store'
import { useSonidos } from '@/composables/useSonidos'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputOtp from 'primevue/inputotp'
import TicketFacturaPrint from '@/components/ventas/TicketFacturaPrint.vue'
import FacturaPdfPrint from '@/components/ventas/FacturaPdfPrint.vue'
import TicketGastoPrint from '@/components/contabilidad/TicketGastoPrint.vue'
import { reintegrarInventarioFactura } from '@/composables/useDevoluciones'
import { guardarGastoOnline } from '@/services/gastosOnlineService'
import { isCollectablePendingInvoice } from '@/domain/pendingInvoiceRules'

const router = useRouter()
const auth = useAuthStore()
const almacenStore = useAlmacenStore()
const sonidos = useSonidos()
const loading = ref(true)
const refreshing = ref(false)
const turnoActual = ref(null)
const resumenVentas = ref({ efectivo: 0, tarjeta: 0, transferencia: 0, total: 0, cantidad: 0, cantidadVentas: 0, cantidadAbonosCxc: 0, abonosCxc: 0, cantidadCobrosTaller: 0, cobrosTaller: 0 })
const abonosTurno = ref([])
const cobrosTallerTurno = ref([])
const gastosTurno = ref(0)
const gastosEfectivoTurno = ref(0)
const gastosLista = ref([])
const ultimasVentas = ref([])
const facturasPendientes = ref([])
const showEliminarPendienteModal = ref(false)
const facturaPendienteEliminar = ref(null)
const eliminarPendienteOtpEnviado = ref(false)
const eliminarPendienteOtp = ref('')
const eliminarPendienteOtpUrl = ref('')
const eliminarPendienteError = ref('')
const solicitandoEliminarPendienteOtp = ref(false)
const eliminandoPendiente = ref(false)
const showProductosPendienteModal = ref(false)
const facturaProductosPendiente = ref(null)
const busquedaProductosPendiente = ref('')
const showCobroPendienteModal = ref(false)
const facturaPendienteCobro = ref(null)
const metodoCobroPendiente = ref('EFECTIVO')
const procesandoCobroPendiente = ref(false)
const cobroMixto = ref({ efectivo: 0, transferencia: 0, tarjeta: 0 })
const bancosCobroPendiente = ref([])
const bancoCobroPendienteId = ref(0)
const observacionCobroPendiente = ref('')
const showEntregaFacturaModal = ref(false)
const facturaEntrega = ref(null)
const ticketFacturaRef = ref(null)
const facturaPdfRef = ref(null)
const ticketGastoRef = ref(null)
const showImprimirGastoModal = ref(false)
const gastoParaImprimir = ref(null)
const metodosCobroPendiente = [
  { label: 'Efectivo', value: 'EFECTIVO', icon: 'pi pi-money-bill', activeClass: 'border-green-500 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300' },
  { label: 'Transferencia', value: 'TRANSFERENCIA', icon: 'pi pi-send', activeClass: 'border-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' },
  { label: 'Tarjeta', value: 'TARJETA', icon: 'pi pi-credit-card', activeClass: 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' },
  { label: 'Mixto', value: 'MIXTO', icon: 'pi pi-sliders-h', activeClass: 'border-orange-500 bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300' },
]
const totalCobroMixto = computed(() => Number(cobroMixto.value.efectivo || 0) + Number(cobroMixto.value.transferencia || 0) + Number(cobroMixto.value.tarjeta || 0))
const cobroMixtoValido = computed(() => Math.abs(totalCobroMixto.value - Number(facturaPendienteCobro.value?.total || 0)) < 0.01)
const cobroPendienteRequiereBanco = computed(() => metodoCobroPendiente.value === 'TRANSFERENCIA' || metodoCobroPendiente.value === 'TARJETA' || (metodoCobroPendiente.value === 'MIXTO' && (Number(cobroMixto.value.transferencia || 0) > 0 || Number(cobroMixto.value.tarjeta || 0) > 0)))
const cerrandoTurno = ref(false)

const showCierreModal = ref(false)
const cierreRevelado = ref(false)
const esCierreCiego = computed(() => Boolean(auth.isCajero))
const denominaciones = [
  { valor: 2000, label: '$2,000', tipo: 'billete', color: 'linear-gradient(135deg, #7c3aed, #a78bfa)' },
  { valor: 1000, label: '$1,000', tipo: 'billete', color: 'linear-gradient(135deg, #dc2626, #fb7185)' },
  { valor: 500, label: '$500', tipo: 'billete', color: 'linear-gradient(135deg, #2563eb, #60a5fa)' },
  { valor: 200, label: '$200', tipo: 'billete', color: 'linear-gradient(135deg, #d97706, #fbbf24)' },
  { valor: 100, label: '$100', tipo: 'billete', color: 'linear-gradient(135deg, #059669, #34d399)' },
  { valor: 50, label: '$50', tipo: 'billete', color: 'linear-gradient(135deg, #475569, #94a3b8)' },
  { valor: 25, label: '$25', tipo: 'moneda', color: 'linear-gradient(135deg, #b7791f, #f6c453)' },
  { valor: 10, label: '$10', tipo: 'moneda', color: 'linear-gradient(135deg, #64748b, #cbd5e1)' },
  { valor: 5, label: '$5', tipo: 'moneda', color: 'linear-gradient(135deg, #a16207, #eab308)' },
  { valor: 1, label: '$1', tipo: 'moneda', color: 'linear-gradient(135deg, #64748b, #94a3b8)' },
]
const conteo = ref({})

const abrirTurnoModal = ref(false)
const montoInicial = ref(0)
const observacionApertura = ref('')
const abriendoTurno = ref(false)

const showMovimientoModal = ref(false)
const tipoMovimiento = ref('entrada')
const montoMovimiento = ref(0)
const descripcionMovimiento = ref('')
const procesandoMovimiento = ref(false)

const showGastoModal = ref(false)
const gastoForm = ref({ categoria: '', descripcion: '', monto: 0, metodo_pago: 'EFECTIVO', banco_id: null, efectivo: 0, transferencia: 0 })
const procesandoGasto = ref(false)
const categoriasGasto = ['Alimentos', 'Servicios', 'Suministros', 'Nomina', 'Mantenimiento', 'Transporte', 'Gasto de taller', 'Otros']
const bancosGasto = ref([])
const cargandoBancosGasto = ref(false)

const distribucionGastoValida = computed(() => {
  if (gastoForm.value.metodo_pago !== 'MIXTO') return true
  const monto = Number(gastoForm.value.monto || 0)
  const efectivo = Number(gastoForm.value.efectivo || 0)
  const transferencia = Number(gastoForm.value.transferencia || 0)
  return efectivo > 0 && transferencia > 0 && Math.abs((efectivo + transferencia) - monto) < 0.01
})

const gastoInvalido = computed(() => {
  const metodo = gastoForm.value.metodo_pago
  return !gastoForm.value.descripcion.trim()
    || !(Number(gastoForm.value.monto) > 0)
    || ((metodo === 'TRANSFERENCIA' || metodo === 'MIXTO') && !gastoForm.value.banco_id)
    || !distribucionGastoValida.value
})

function cambiarMetodoGasto() {
  const monto = Number(gastoForm.value.monto || 0)
  gastoForm.value.banco_id = null
  gastoForm.value.efectivo = gastoForm.value.metodo_pago === 'EFECTIVO' ? monto : 0
  gastoForm.value.transferencia = gastoForm.value.metodo_pago === 'TRANSFERENCIA' ? monto : 0
}

function ajustarMixtoDesdeEfectivo(valor = Number(gastoForm.value.efectivo || 0)) {
  if (gastoForm.value.metodo_pago !== 'MIXTO') return
  gastoForm.value.transferencia = Math.max(0, Number((Number(gastoForm.value.monto || 0) - valor).toFixed(2)))
}

function ajustarMixtoDesdeTransferencia(valor = Number(gastoForm.value.transferencia || 0)) {
  if (gastoForm.value.metodo_pago !== 'MIXTO') return
  gastoForm.value.efectivo = Math.max(0, Number((Number(gastoForm.value.monto || 0) - valor).toFixed(2)))
}

const showDetalleVenta = ref(false)
const ventaSeleccionada = ref(null)

let refreshInterval = null
let pendientesInterval = null
let pendientesInicializados = false
let consultandoPendientes = false
let idsPendientesConocidos = new Set()

function parseProductosFactura(factura) {
  const productos = factura?.productos
  if (Array.isArray(productos)) return productos
  if (typeof productos !== 'string') return []
  try {
    const parsed = JSON.parse(productos)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const productosFacturaPendiente = computed(() => parseProductosFactura(facturaProductosPendiente.value))

const productosPendientesFiltrados = computed(() => {
  const texto = busquedaProductosPendiente.value.trim().toLowerCase()
  if (!texto) return productosFacturaPendiente.value
  return productosFacturaPendiente.value.filter(producto => [
    producto?.nombre,
    producto?.descripcion,
    producto?.producto,
    producto?.codigo,
    producto?.codigo_barra,
    producto?.imei,
    producto?.serial,
  ].some(valor => String(valor || '').toLowerCase().includes(texto)))
})

function verProductosFacturaPendiente(factura) {
  if (!factura) return
  facturaProductosPendiente.value = factura
  busquedaProductosPendiente.value = ''
  showProductosPendienteModal.value = true
}

function nombreProductoPendiente(producto) {
  return String(producto?.nombre || producto?.descripcion || producto?.producto || 'Producto sin nombre')
}

function cantidadProductoPendiente(producto) {
  return Number(producto?.cantidad ?? producto?.quantity ?? 1) || 1
}

function precioProductoPendiente(producto) {
  return Number(producto?.precio_final ?? producto?.precio_venta ?? producto?.precio_unitario ?? producto?.precio ?? producto?.price ?? 0) || 0
}

function totalProductoPendiente(producto) {
  return Number(producto?.total ?? (cantidadProductoPendiente(producto) * precioProductoPendiente(producto))) || 0
}

function perteneceAlmacenActual(registro) {
  const uidActivo = String(almacenStore.activeUid || '')
  const idActivo = Number(almacenStore.activeId || 0)
  const uidRegistro = String(registro?.almacen_uid || '')
  const idRegistro = Number(registro?.almacen_id || 0)
  if (uidActivo && uidRegistro) return uidRegistro === uidActivo
  if (idActivo && idRegistro) return idRegistro === idActivo
  // Registros antiguos pueden no tener almacen asignado. En una instalacion
  // de una sola empresa pertenecen al unico almacen y no deben desaparecer.
  return !uidRegistro && !idRegistro && almacenStore.almacenes.length <= 1
}

function actualizarFacturasPendientes(facturas) {
  const pendientes = (facturas || [])
    .filter(factura => isCollectablePendingInvoice(factura) && perteneceAlmacenActual(factura))
    .sort((a, b) => parseDbDate(b.created_at) - parseDbDate(a.created_at))
  const idsActuales = new Set(pendientes.map(factura => String(factura.id)))
  if (pendientesInicializados && pendientes.some(factura => !idsPendientesConocidos.has(String(factura.id)))) {
    sonidos.playNewInvoice()
  }
  facturasPendientes.value = pendientes
  idsPendientesConocidos = idsActuales
  pendientesInicializados = true
}

async function revisarNuevasFacturas() {
  if (!turnoActual.value || consultandoPendientes) return
  consultandoPendientes = true
  try {
    const res = await window.db.getAll('facturas')
    if (res.success && Array.isArray(res.data)) actualizarFacturasPendientes(res.data)
  } catch (error) {
    console.error('Error revisando facturas pendientes:', error)
  } finally {
    consultandoPendientes = false
  }
}

function abrirEliminarFacturaPendiente(factura) {
  if (!factura || !isCollectablePendingInvoice(factura) || !perteneceAlmacenActual(factura)) return
  facturaPendienteEliminar.value = factura
  eliminarPendienteOtpEnviado.value = false
  eliminarPendienteOtp.value = ''
  eliminarPendienteOtpUrl.value = ''
  eliminarPendienteError.value = ''
  solicitandoEliminarPendienteOtp.value = false
  eliminandoPendiente.value = false
  showEliminarPendienteModal.value = true
}

async function solicitarOtpEliminarPendiente() {
  const factura = facturaPendienteEliminar.value
  if (!factura?.id || solicitandoEliminarPendienteOtp.value) return
  solicitandoEliminarPendienteOtp.value = true
  eliminarPendienteError.value = ''
  eliminarPendienteOtp.value = ''
  try {
    const actual = await window.db.getById('facturas', factura.id)
    if (!actual.success || !actual.data) throw new Error('La factura ya no existe')
    if (!isCollectablePendingInvoice(actual.data)) throw new Error('El documento no es una factura de venta pendiente cobrable')
    if (!perteneceAlmacenActual(actual.data)) throw new Error('La factura pertenece a otro almacen')
    facturaPendienteEliminar.value = actual.data

    const res = await window.electron.invoke('facturas:solicitarOtpEliminar', {
      id: actual.data.id,
      facturaIds: [actual.data.id],
      no_factura: actual.data.no_factura || '',
      nombre_cliente: actual.data.nombre_cliente || '',
      cantidad: 1,
      total: Number(actual.data.total || 0),
    })
    if (!res?.success) throw new Error(res?.error || 'No se pudo solicitar el codigo OTP')
    eliminarPendienteOtpUrl.value = res.data?.networkUrl || ''
    eliminarPendienteOtpEnviado.value = true
  } catch (error) {
    eliminarPendienteError.value = error?.message || 'No se pudo solicitar el codigo OTP'
  } finally {
    solicitandoEliminarPendienteOtp.value = false
  }
}

async function eliminarFacturaPendiente() {
  const factura = facturaPendienteEliminar.value
  if (!factura?.id || eliminandoPendiente.value) return
  const codigo = String(eliminarPendienteOtp.value || '').replace(/\D/g, '')
  if (!/^\d{4}$/.test(codigo)) {
    eliminarPendienteError.value = 'Introduce el codigo OTP de 4 digitos'
    return
  }
  eliminandoPendiente.value = true
  eliminarPendienteError.value = ''
  try {
    const actual = await window.db.getById('facturas', factura.id)
    if (!actual.success || !actual.data) throw new Error('La factura ya no existe')
    if (!isCollectablePendingInvoice(actual.data)) throw new Error('Solo se pueden eliminar facturas de venta pendientes desde Caja')
    if (!perteneceAlmacenActual(actual.data)) throw new Error('La factura pertenece a otro almacen')

    const otp = await window.electron.invoke('facturas:confirmarOtpEliminar', {
      facturaId: actual.data.id,
      facturaIds: [actual.data.id],
      codigo,
    })
    if (!otp?.success) throw new Error(otp?.error || 'Codigo OTP no valido')

    const eliminado = await window.db.delete('facturas', actual.data.id)
    if (!eliminado.success) throw new Error(eliminado.error || 'No se pudo eliminar la factura')
    const verificacion = await window.db.getById('facturas', actual.data.id)
    if (!verificacion.success || verificacion.data) throw new Error(verificacion.error || 'No se pudo confirmar la eliminacion')

    let avisoInventario = ''
    if (String(actual.data.tipo_factura || '').toUpperCase() === 'FACTURA_VENTA') {
      try {
        await reintegrarInventarioFactura(actual.data.productos)
      } catch (error) {
        avisoInventario = `\nRevisa el inventario: ${error?.message || 'no se pudo restaurar automaticamente'}`
      }
    }

    showEliminarPendienteModal.value = false
    facturaPendienteEliminar.value = null
    facturasPendientes.value = facturasPendientes.value.filter(item => Number(item.id) !== Number(actual.data.id))
    await cargarDatos()
    alert(`Factura pendiente eliminada correctamente.${avisoInventario}`)
  } catch (error) {
    eliminarPendienteError.value = error?.message || 'No se pudo eliminar la factura pendiente'
  } finally {
    eliminandoPendiente.value = false
  }
}

const efectivoEsperado = computed(() => {
  if (!turnoActual.value) return 0
  const inicial = turnoActual.value.monto_inicial || 0
  const ventas = resumenVentas.value.efectivo || 0
  const gastos = gastosEfectivoTurno.value || 0
  const entradas = turnoActual.value.entradas || 0
  const retiros = turnoActual.value.retiros || 0
  return inicial + ventas + entradas - gastos - retiros
})

const horasAbiertas = computed(() => {
  if (!turnoActual.value?.created_at) return '0h 0m'
  const inicio = new Date(turnoActual.value.created_at)
  const ahora = new Date()
  const diff = ahora - inicio
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  return `${h}h ${m}m`
})

function formatMoney(val) {
  return formatSystemCurrency(val)
}

function formatDate(d) {
  if (!d) return '-'
  return formatSystemDateTime(d)
}

function formatTime(d) {
  if (!d) return ''
  return formatSystemDate(d, { hour: '2-digit', minute: '2-digit' })
}

async function ensureTables() {
  // En modo online las tablas ya se administran mediante el esquema de la API.
  // Ejecutar SQL remoto en cada refresco solo agrega carga y posibles carreras.
  if (window.__onlineOnly) return
  const sql = `
    CREATE TABLE IF NOT EXISTS caja_turnos (
      id INTEGER PRIMARY KEY AUTOINCREMENT, monto_inicial REAL DEFAULT 0, entradas REAL DEFAULT 0,
      retiros REAL DEFAULT 0, estado TEXT DEFAULT 'abierto', observacion TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS caja_movimientos (
      id INTEGER PRIMARY KEY AUTOINCREMENT, turno_id INTEGER, tipo TEXT,
      monto REAL DEFAULT 0, descripcion TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `
  try {
    await window.electron.invoke('consultaservidor', 'executeSQL', sql)
  } catch (e) {
    await window.electron.invoke('consultaservidor', 'rawQuery', 'CREATE TABLE IF NOT EXISTS caja_turnos (id INTEGER PRIMARY KEY AUTOINCREMENT, monto_inicial REAL DEFAULT 0, entradas REAL DEFAULT 0, retiros REAL DEFAULT 0, estado TEXT DEFAULT "abierto", observacion TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)')
    await window.electron.invoke('consultaservidor', 'rawQuery', 'CREATE TABLE IF NOT EXISTS caja_movimientos (id INTEGER PRIMARY KEY AUTOINCREMENT, turno_id INTEGER, tipo TEXT, monto REAL DEFAULT 0, descripcion TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)')
  }
}

async function cargarDatos() {
  refreshing.value = true
  try {
    await ensureTables()
    const res = await window.db.getAll('caja_turnos')
    if (!res.success || !Array.isArray(res.data)) {
      console.error('No se pudo consultar el turno directamente en TM Cloud:', res.error || 'Respuesta invalida')
      return
    }
    if (res.data.length) {
      const abierto = res.data.find(r => String(r.estado || '').toLowerCase() === 'abierto' && perteneceAlmacenActual(r))
      if (abierto) {
        turnoActual.value = abierto
        await cargarVentas()
        await cargarGastos()
        await cargarUltimasVentas()
      } else {
        turnoActual.value = null
      }
    } else {
      turnoActual.value = null
    }
  } catch (e) {
    console.error('Error cargando caja:', e)
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

async function cargarVentas() {
  if (!turnoActual.value) return
  try {
    const [res, cuentasRes, tallerRes] = await Promise.all([window.db.getAll('facturas'), window.db.getAll('cuentas_cobrar'), window.db.getAll('ordenes_taller')])
    if (!res.success || !res.data) return
    const ventas = res.data.filter(v =>
      perteneceAlmacenActual(v) &&
      Number(v.turno_id) === Number(turnoActual.value.id) &&
      v.estado_factura === 'PAGADA'
    )
    actualizarFacturasPendientes(res.data)
    const cuentasAlmacen = (cuentasRes.success ? cuentasRes.data || [] : []).filter(perteneceAlmacenActual)
    const ordenesAlmacen = (tallerRes.success ? tallerRes.data || [] : []).filter(perteneceAlmacenActual)
    abonosTurno.value = obtenerAbonosTurno(cuentasAlmacen, turnoActual.value.id)
    cobrosTallerTurno.value = obtenerCobrosTaller(ordenesAlmacen, turnoActual.value.id, turnoActual.value.created_at)
    resumenVentas.value = resumirVentas(ventas, abonosTurno.value, cobrosTallerTurno.value)
  } catch (e) {
    console.error('Error cargando ventas:', e)
  }
}

async function cobrarFacturaPendiente(factura) {
  if (!factura?.id || !isCollectablePendingInvoice(factura)) return
  facturaPendienteCobro.value = factura
  metodoCobroPendiente.value = 'EFECTIVO'
  cobroMixto.value = { efectivo: 0, transferencia: 0, tarjeta: 0 }
  bancoCobroPendienteId.value = 0
  observacionCobroPendiente.value = ''
  try {
    const bancosRes = await window.db.getAll('bancos')
    bancosCobroPendiente.value = bancosRes.success ? (bancosRes.data || []) : []
  } catch { bancosCobroPendiente.value = [] }
  showCobroPendienteModal.value = true
}

function seleccionarMetodoCobroPendiente(metodo) {
  metodoCobroPendiente.value = metodo
  bancoCobroPendienteId.value = 0
  if (metodo === 'MIXTO') cobroMixto.value = { efectivo: Number(facturaPendienteCobro.value?.total || 0), transferencia: 0, tarjeta: 0 }
}

async function confirmarCobroPendiente() {
  const factura = facturaPendienteCobro.value
  if (!factura?.id || !turnoActual.value?.id || !isCollectablePendingInvoice(factura)) return
  const totalFactura = Number(factura.total || 0)
  let efectivo = 0, transferencia = 0, tarjeta = 0
  if (metodoCobroPendiente.value === 'MIXTO') {
    if (!cobroMixtoValido.value) return
    efectivo = Number(cobroMixto.value.efectivo || 0); transferencia = Number(cobroMixto.value.transferencia || 0); tarjeta = Number(cobroMixto.value.tarjeta || 0)
  } else if (metodoCobroPendiente.value === 'TRANSFERENCIA') transferencia = totalFactura
  else if (metodoCobroPendiente.value === 'TARJETA') tarjeta = totalFactura
  else efectivo = totalFactura
  procesandoCobroPendiente.value = true
  try {
    const res = await window.electron.invoke('ventas:cobrarPendiente', { factura_id: factura.id, turno_id: Number(turnoActual.value.id), metodo_pago: metodoCobroPendiente.value, efectivo, transferencia, tarjeta, banco_id: cobroPendienteRequiereBanco.value ? Number(bancoCobroPendienteId.value) : 0, observacion: observacionCobroPendiente.value.trim(), cajero: auth.user?.nombre || auth.user?.usuario || '' })
    if (!res.success) throw new Error(res.error || 'No se pudo cobrar la factura')
    showCobroPendienteModal.value = false
    const actualizada = await window.db.getById('facturas', factura.id)
    facturaEntrega.value = actualizada.success && actualizada.data
      ? actualizada.data
      : { ...factura, estado_factura: 'PAGADA', metodo_pago: metodoCobroPendiente.value, efectivo, transferencia, tarjeta }
    try {
      const clientes = await window.db.getAll('clientes')
      const cliente = clientes.success ? (clientes.data || []).find(item => String(item.id) === String(facturaEntrega.value.cod_cliente)) : null
      if (cliente) facturaEntrega.value = { ...facturaEntrega.value, cliente_email: cliente.email || '', telefono_cliente: facturaEntrega.value.telefono_cliente || cliente.whatsapp || cliente.telefono || '' }
    } catch {}
    await cargarVentas(); await cargarUltimasVentas()
    sonidos.playCashRegister()
    showEntregaFacturaModal.value = true
  } catch (error) { alert('Error al cobrar: ' + (error?.message || 'Error desconocido')) }
  finally { procesandoCobroPendiente.value = false }
}

async function imprimirTicketCobrado() {
  if (!facturaEntrega.value) return
  showEntregaFacturaModal.value = false
  await ticketFacturaRef.value?.printTicket(facturaEntrega.value)
}

async function imprimirPdfCobrado() {
  if (!facturaEntrega.value) return
  showEntregaFacturaModal.value = false
  await facturaPdfRef.value?.printFactura(facturaEntrega.value)
}

function compartirWhatsAppCobrado() {
  const factura = facturaEntrega.value
  if (!factura) return
  const telefono = String(factura.telefono_cliente || factura.whatsapp || '').replace(/[^0-9]/g, '')
  if (!telefono) { alert('El cliente no tiene WhatsApp registrado'); return }
  const mensaje = encodeURIComponent(`Factura ${factura.no_factura}\nCliente: ${factura.nombre_cliente || 'CONSUMIDOR FINAL'}\nTotal: ${formatMoney(factura.total)}\nMetodo: ${factura.metodo_pago || ''}`)
  window.open(`https://wa.me/${telefono}?text=${mensaje}`, '_blank')
  showEntregaFacturaModal.value = false
}

function enviarCorreoCobrado() {
  const factura = facturaEntrega.value
  if (!factura) return
  const email = String(factura.cliente_email || factura.email_cliente || '')
  const asunto = encodeURIComponent(`Factura ${factura.no_factura}`)
  const cuerpo = encodeURIComponent(`Factura: ${factura.no_factura}\nCliente: ${factura.nombre_cliente || 'CONSUMIDOR FINAL'}\nTotal: ${formatMoney(factura.total)}\nMetodo: ${factura.metodo_pago || ''}\n\nGracias por su compra.`)
  window.open(`mailto:${email}?subject=${asunto}&body=${cuerpo}`, '_blank')
  showEntregaFacturaModal.value = false
}

async function compartirFacturaCobrada() {
  const factura = facturaEntrega.value
  if (!factura) return
  const texto = `Factura ${factura.no_factura} - ${factura.nombre_cliente || 'CONSUMIDOR FINAL'} - ${formatMoney(factura.total)}`
  try {
    if (navigator.share) await navigator.share({ title: `Factura ${factura.no_factura}`, text: texto })
    else await navigator.clipboard.writeText(texto)
    showEntregaFacturaModal.value = false
  } catch (error) {
    if (error?.name !== 'AbortError') alert('No se pudo compartir la factura')
  }
}

async function cargarGastos() {
  if (!turnoActual.value) return
  try {
    const res = await window.db.getAll('gastos')
    if (!res.success || !res.data) return
    const gastos = res.data.filter(g =>
      perteneceAlmacenActual(g) &&
      Number(g.turno_id || 0) === Number(turnoActual.value.id)
    )
    gastosLista.value = gastos
    gastosTurno.value = gastos.reduce((s, g) => s + Number(g.cantidad || g.monto || 0), 0)
    gastosEfectivoTurno.value = gastos.reduce((total, gasto) => {
      const metodo = String(gasto.metodo_pago || 'EFECTIVO').toUpperCase()
      if (metodo === 'TRANSFERENCIA') return total
      if (metodo === 'MIXTO') return total + Number(gasto.efectivo || 0)
      return total + Number(gasto.cantidad || gasto.monto || 0)
    }, 0)
  } catch (e) {
    console.error('Error cargando gastos:', e)
  }
}

async function cargarUltimasVentas() {
  if (!turnoActual.value) return
  try {
    const res = await window.db.getAll('facturas')
    if (!res.success || !res.data) return
    const turnoInicio = new Date(turnoActual.value.created_at).getTime()
    ultimasVentas.value = res.data
      .filter(v => perteneceAlmacenActual(v) && Number(v.turno_id) === Number(turnoActual.value.id) && v.estado_factura === 'PAGADA')
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 20)
  } catch (e) {
    console.error('Error cargando ultimas ventas:', e)
  }
}

async function guardarApertura() {
  if (abriendoTurno.value) return
  abriendoTurno.value = true
  try {
    const user = localStorage.getItem('mr_user_usuario') || ''
    const resultado = await window.db.insert('caja_turnos', {
      monto_inicial: montoInicial.value || 0,
      entradas: 0, retiros: 0, estado: 'abierto',
      observacion: observacionApertura.value || '',
      usuario_id: Number(localStorage.getItem('mr_user_id') || 0),
      usuario_nombre: user,
      almacen_id: almacenStore.activeId || 0,
      almacen_uid: almacenStore.activeUid || '',
    })
    if (!resultado.success) throw new Error(resultado.error || 'No se pudo abrir el turno')
    abrirTurnoModal.value = false
    await cargarDatos()
  } catch (e) {
    console.error('Error abriendo turno:', e)
    alert(`No se pudo abrir el turno: ${e?.message || 'Error desconocido'}`)
  } finally {
    abriendoTurno.value = false
  }
}

function abrirMovimiento(tipo) {
  tipoMovimiento.value = tipo
  montoMovimiento.value = 0
  descripcionMovimiento.value = ''
  showMovimientoModal.value = true
}

async function guardarMovimiento() {
  if (procesandoMovimiento.value || !montoMovimiento.value || montoMovimiento.value <= 0) return
  procesandoMovimiento.value = true
  try {
    const monto = Number(montoMovimiento.value)
    await window.db.insert('caja_movimientos', {
      turno_id: turnoActual.value.id,
      tipo: tipoMovimiento.value,
      monto,
      descripcion: descripcionMovimiento.value || '',
      almacen_id: almacenStore.activeId || 0,
      almacen_uid: almacenStore.activeUid || '',
    })
    const campo = tipoMovimiento.value === 'entrada' ? 'entradas' : 'retiros'
    const valorActual = turnoActual.value[campo] || 0
    await window.db.update('caja_turnos', turnoActual.value.id, { [campo]: valorActual + monto })
    showMovimientoModal.value = false
    await cargarDatos()
  } catch (e) {
    console.error('Error guardando movimiento:', e)
  } finally {
    procesandoMovimiento.value = false
  }
}

async function cargarBancosGasto() {
  cargandoBancosGasto.value = true
  try {
    const res = await window.db.getAll('bancos')
    bancosGasto.value = res.success ? (res.data || []) : []
  } catch (_) {
    bancosGasto.value = []
  } finally {
    cargandoBancosGasto.value = false
  }
}

async function agregarGasto() {
  gastoForm.value = { categoria: '', descripcion: '', monto: 0, metodo_pago: 'EFECTIVO', banco_id: null, efectivo: 0, transferencia: 0 }
  showGastoModal.value = true
  await cargarBancosGasto()
}

async function guardarGasto() {
  if (procesandoGasto.value || gastoInvalido.value) return
  procesandoGasto.value = true
  try {
    const ahora = new Date()
    const fechaLocal = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`
    const banco = bancosGasto.value.find(item => Number(item.id) === Number(gastoForm.value.banco_id || 0))
    const comentario = gastoForm.value.categoria ? `${gastoForm.value.categoria}: ${gastoForm.value.descripcion.trim()}` : gastoForm.value.descripcion.trim()
    const result = await guardarGastoOnline({
      cantidad: Number(gastoForm.value.monto),
      comentario,
      metodo_pago: gastoForm.value.metodo_pago,
      efectivo: gastoForm.value.metodo_pago === 'EFECTIVO' ? Number(gastoForm.value.monto) : Number(gastoForm.value.efectivo || 0),
      transferencia: gastoForm.value.metodo_pago === 'TRANSFERENCIA' ? Number(gastoForm.value.monto) : Number(gastoForm.value.transferencia || 0),
      banco_id: banco?.id || 0,
      banco_uid: banco?.uid || '',
      turno_id: turnoActual.value.id,
      fecha: fechaLocal,
      hora: `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`,
      almacen_id: almacenStore.activeId || 0,
      almacen_uid: almacenStore.activeUid || '',
      usuario: auth.user?.usuario || auth.user?.nombre || '',
    })
    console.log('[Caja] Resultado insert gasto:', JSON.stringify(result))
    if (!result.success) {
      alert('Error al guardar gasto: ' + (result.error || 'Error desconocido'))
      return
    }
    showGastoModal.value = false
    gastoParaImprimir.value = {
      id: result.data?.id || '',
      cantidad: Number(gastoForm.value.monto),
      comentario,
      metodo_pago: gastoForm.value.metodo_pago,
      efectivo: gastoForm.value.metodo_pago === 'EFECTIVO' ? Number(gastoForm.value.monto) : Number(gastoForm.value.efectivo || 0),
      transferencia: gastoForm.value.metodo_pago === 'TRANSFERENCIA' ? Number(gastoForm.value.monto) : Number(gastoForm.value.transferencia || 0),
      banco_id: banco?.id || 0,
      banco_nombre: banco?.nombre || '',
      turno_id: turnoActual.value.id,
      fecha: fechaLocal,
      hora: `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`,
      usuario: auth.user?.nombre || auth.user?.usuario || '',
      almacen_id: almacenStore.activeId || 0,
      almacen_uid: almacenStore.activeUid || '',
    }
    await cargarGastos()
    showImprimirGastoModal.value = true
  } catch (e) {
    console.error('[Caja] Error guardando gasto:', e)
    alert('Error al guardar gasto: ' + (e.message || 'Error desconocido'))
  } finally {
    procesandoGasto.value = false
  }
}

async function imprimirGastoCreado() {
  if (!gastoParaImprimir.value) return
  showImprimirGastoModal.value = false
  await ticketGastoRef.value?.printTicket(gastoParaImprimir.value)
}

async function imprimirGastoRegistrado(gasto) {
  if (!gasto) return
  await ticketGastoRef.value?.printTicket(gasto)
}

function parseDbDate(value) {
  if (!value) return 0
  const normalized = String(value).trim().replace(' ', 'T')
  const timestamp = new Date(normalized).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

function obtenerAbonosTurno(cuentas, turnoId, turnoInicio = turnoActual.value?.created_at) {
  return cuentas.flatMap(cuenta => {
    let pagos = []
    try { pagos = Array.isArray(cuenta.pagos) ? cuenta.pagos : JSON.parse(cuenta.pagos || '[]') } catch { pagos = [] }
    return pagos.filter(p => Number(p.turno_id || 0) === Number(turnoId)).map((p, index) => ({
      ...p, id: p.id || index, cuenta_id: cuenta.id, no_factura: cuenta.no_factura || cuenta.id,
      nombre_cliente: cuenta.nombre_cliente || 'Cliente General', monto: Number(p.monto || p.cantidad || 0),
      metodo: String(p.metodo || p.metodo_pago || 'EFECTIVO').toUpperCase(),
    }))
  }).sort((a, b) => parseDbDate(a.fecha || a.created_at) - parseDbDate(b.fecha || b.created_at))
}

function obtenerCobrosTaller(ordenes, turnoId, turnoInicio) {
  return ordenes.flatMap(orden => {
    let pagos = []
    try { pagos = Array.isArray(orden.pagos) ? orden.pagos : JSON.parse(orden.pagos || '[]') } catch { pagos = [] }
    return pagos
      .filter(p => Number(p.turno_id || 0) === Number(turnoId))
      .map((p, index) => ({ ...p, id: p.id || index, orden_id: orden.id, no_orden: orden.no_orden || orden.id, cliente: orden.nombre || 'Cliente General', monto: Number(p.monto || p.cantidad || 0), metodo: String(p.metodo || p.metodo_pago || orden.metodo_pago || 'EFECTIVO').toUpperCase() }))
  }).sort((a, b) => parseDbDate(a.created_at || `${a.fecha || ''} ${a.hora || ''}`) - parseDbDate(b.created_at || `${b.fecha || ''} ${b.hora || ''}`))
}

function resumirVentas(ventas, abonos = [], cobrosTaller = []) {
  let efectivo = 0
  let tarjeta = 0
  let transferencia = 0
  let total = 0
  let cantidadVentas = 0
  for (const venta of ventas) {
    const metodoVenta = String(venta.metodo_pago || '').toUpperCase()
    if (metodoVenta.includes('CREDITO') || metodoVenta.includes('CRÉDITO')) continue
    const ventaTotal = Number(venta.total || 0)
    let ventaEfectivo = Number(venta.efectivo || 0)
    let ventaTarjeta = Number(venta.tarjeta || 0)
    let ventaTransferencia = Number(venta.transferencia || 0)
    if (ventaEfectivo + ventaTarjeta + ventaTransferencia === 0) {
      const metodo = String(venta.metodo_pago || '').toLowerCase()
      if (metodo.includes('tarjeta')) ventaTarjeta = ventaTotal
      else if (metodo.includes('transferencia')) ventaTransferencia = ventaTotal
      else ventaEfectivo = ventaTotal
    }
    efectivo += ventaEfectivo
    tarjeta += ventaTarjeta
    transferencia += ventaTransferencia
    total += ventaTotal
    cantidadVentas++
  }
  let abonosCxc = 0
  for (const pago of abonos) {
    const monto = Number(pago.monto || pago.cantidad || 0)
    const metodo = String(pago.metodo || pago.metodo_pago || 'EFECTIVO').toUpperCase()
    if (metodo.includes('TARJETA')) tarjeta += monto
    else if (metodo.includes('TRANSFERENCIA')) transferencia += monto
    else efectivo += monto
    abonosCxc += monto
    total += monto
  }
  let totalTaller = 0
  for (const pago of cobrosTaller) {
    const monto = Number(pago.monto || pago.cantidad || 0)
    const metodo = String(pago.metodo || pago.metodo_pago || 'EFECTIVO').toUpperCase()
    if (metodo.includes('TARJETA')) tarjeta += monto
    else if (metodo.includes('TRANSFERENCIA')) transferencia += monto
    else efectivo += monto
    totalTaller += monto
    total += monto
  }
  return { efectivo, tarjeta, transferencia, total, cantidad: cantidadVentas + abonos.length + cobrosTaller.length, cantidadVentas, cantidadAbonosCxc: abonos.length, abonosCxc, cantidadCobrosTaller: cobrosTaller.length, cobrosTaller: totalTaller }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function moneyHtml(value) {
  return formatSystemCurrency(value)
}

function dateHtml(value) {
  if (!value) return '-'
  const date = new Date(String(value).replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return escapeHtml(value)
  return formatSystemDateTime(date, { dateStyle: 'medium', timeStyle: 'short' })
}

function calcularDuracion(inicio, fin) {
  const diff = Math.max(0, new Date(fin).getTime() - new Date(String(inicio).replace(' ', 'T')).getTime())
  const horas = Math.floor(diff / 3600000)
  const minutos = Math.floor((diff % 3600000) / 60000)
  return `${horas}h ${minutos}m`
}

async function obtenerResumenCierre() {
  await Promise.all([cargarVentas(), cargarGastos(), cargarUltimasVentas()])
  const turno = { ...turnoActual.value }
  const [empresaRes, impresoraRes, correoRes, movimientosRes, ventasRes, cuentasRes, tallerRes] = await Promise.all([
    window.db.getAll('empresa'),
    window.db.getAll('impresoras_config'),
    window.db.getAll('correo'),
    window.db.getAll('caja_movimientos'),
    window.db.getAll('facturas'),
    window.db.getAll('cuentas_cobrar'),
    window.db.getAll('ordenes_taller'),
  ])
  const ventas = (ventasRes.success ? ventasRes.data || [] : [])
    .filter(v => perteneceAlmacenActual(v) && Number(v.turno_id) === Number(turno.id) && v.estado_factura === 'PAGADA')
    .sort((a, b) => parseDbDate(a.created_at) - parseDbDate(b.created_at))
  const movimientos = (movimientosRes.success ? movimientosRes.data || [] : [])
    .filter(m => perteneceAlmacenActual(m) && Number(m.turno_id) === Number(turno.id))
    .sort((a, b) => parseDbDate(a.created_at) - parseDbDate(b.created_at))
  const entradas = movimientos.filter(m => m.tipo === 'entrada')
  const retiros = movimientos.filter(m => m.tipo === 'retiro')
  const cuentasAlmacen = (cuentasRes.success ? cuentasRes.data || [] : []).filter(perteneceAlmacenActual)
  const ordenesAlmacen = (tallerRes.success ? tallerRes.data || [] : []).filter(perteneceAlmacenActual)
  const abonosCxc = obtenerAbonosTurno(cuentasAlmacen, turno.id, turno.created_at)
  const cobrosTaller = obtenerCobrosTaller(ordenesAlmacen, turno.id, turno.created_at)
  const facturasCredito = new Set(ventas
    .filter(v => String(v.metodo_pago || '').toUpperCase().includes('CREDITO') || String(v.metodo_pago || '').toUpperCase().includes('CRÉDITO'))
    .map(v => String(v.no_factura || '')))
  const cuentasCobrar = (cuentasRes.success ? cuentasRes.data || [] : [])
    .filter(cuenta => facturasCredito.has(String(cuenta.no_factura || '')))
    .map(cuenta => ({
      id: cuenta.id,
      no_factura: cuenta.no_factura || cuenta.id,
      nombre_cliente: cuenta.nombre_cliente || 'Cliente General',
      total: Number(cuenta.total || 0),
      abonado: Number(cuenta.abonado || 0),
      saldo: Number(cuenta.saldo || 0),
      estado: cuenta.estado || 'ACTIVA',
      fecha_vencimiento: cuenta.fecha_vencimiento || '',
    }))
  const resumen = resumirVentas(ventas, abonosCxc, cobrosTaller)
  const totalEntradas = entradas.reduce((sum, item) => sum + Number(item.monto || 0), 0)
  const totalRetiros = retiros.reduce((sum, item) => sum + Number(item.monto || 0), 0)
  const totalGastos = gastosLista.value.reduce((sum, item) => sum + Number(item.cantidad || item.monto || 0), 0)
  const totalGastosEfectivo = gastosLista.value
    .filter(item => String(item.metodo_pago || 'EFECTIVO').toUpperCase() !== 'TRANSFERENCIA')
    .reduce((sum, item) => sum + Number(item.cantidad || item.monto || 0), 0)
  const cerradoEn = new Date().toISOString()

  return {
    turno,
    empresa: empresaRes.success ? empresaRes.data?.[0] || {} : {},
    impresora: impresoraRes.success ? impresoraRes.data?.[0] || {} : {},
    correo: correoRes.success ? correoRes.data?.[0] || {} : {},
    ventas,
    abonosCxc,
    cuentasCobrar,
    cobrosTaller,
    gastos: [...gastosLista.value].sort((a, b) => parseDbDate(a.created_at) - parseDbDate(b.created_at)),
    entradas,
    retiros,
    resumen,
    totalEntradas,
    totalRetiros,
    totalGastos,
    totalGastosEfectivo,
    efectivoEsperado: Number(turno.monto_inicial || 0) + resumen.efectivo + totalEntradas - totalGastosEfectivo - totalRetiros,
    cerradoEn,
    duracion: calcularDuracion(turno.created_at, cerradoEn),
    conteo: { ...conteo.value },
  }
}

function filasDetalle(items, render, emptyText) {
  return items.length ? items.map(render).join('') : `<tr><td colspan="4" class="empty">${emptyText}</td></tr>`
}

function construirTicketCierre(data) {
  const empresaNombre = escapeHtml(data.empresa.nombre || data.empresa.legal || 'TMPOS SRL')
  const ventas = filasDetalle(data.ventas, venta => `
    <tr><td>${escapeHtml(venta.no_factura || venta.id)}</td><td>${escapeHtml(venta.metodo_pago || 'Efectivo')}</td><td>${dateHtml(venta.created_at)}</td><td class="right">${moneyHtml(venta.total)}</td></tr>`, 'Sin ventas')
  const abonos = filasDetalle(data.abonosCxc, pago => `
    <tr><td>${escapeHtml(pago.no_factura)}</td><td>${escapeHtml(pago.metodo)}</td><td>${dateHtml(pago.fecha || pago.created_at)}</td><td class="right">${moneyHtml(pago.monto)}</td></tr>`, 'Sin abonos')
  const cobrosTaller = filasDetalle(data.cobrosTaller, pago => `
    <tr><td>${escapeHtml(pago.no_orden)}</td><td>${escapeHtml(pago.metodo)}</td><td>${dateHtml(pago.fecha || pago.created_at)}</td><td class="right">${moneyHtml(pago.monto)}</td></tr>`, 'Sin cobros de taller')
  const gastos = filasDetalle(data.gastos, gasto => `
    <tr><td colspan="2">${escapeHtml(gasto.comentario || gasto.descripcion || 'Gasto')}</td><td>${dateHtml(gasto.created_at)}</td><td class="right">-${moneyHtml(gasto.cantidad || gasto.monto)}</td></tr>`, 'Sin gastos')
  const movimientos = filasDetalle([...data.entradas, ...data.retiros].sort((a, b) => parseDbDate(a.created_at) - parseDbDate(b.created_at)), item => `
    <tr><td>${escapeHtml(String(item.tipo || '').toUpperCase())}</td><td>${escapeHtml(item.descripcion || '-')}</td><td>${dateHtml(item.created_at)}</td><td class="right">${item.tipo === 'retiro' ? '-' : '+'}${moneyHtml(item.monto)}</td></tr>`, 'Sin movimientos')
  const denominacionesRows = data.conteo ? Object.entries(data.conteo)
    .filter(([, cant]) => Number(cant) > 0)
    .sort(([a], [b]) => Number(b) - Number(a))
    .map(([valor, cant]) => `<div class="row"><span>${getSystemCurrencyCode()} ${formatSystemNumber(valor)} x ${cant}</span><span>${moneyHtml(Number(valor) * Number(cant))}</span></div>`)
    .join('') : ''
  const denominacionesHtml = denominacionesRows ? `<h2>CONTEO DE EFECTIVO</h2>${denominacionesRows}<div class="row total"><span>TOTAL CONTADO</span><span>${moneyHtml(totalConteo.value)}</span></div>` : ''
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @page{size:72mm auto;margin:0}*{box-sizing:border-box}html,body{width:72mm;margin:0;padding:0}body{font-family:Arial,Helvetica,sans-serif;padding:2.5mm;color:#000;font-size:10.5px;font-weight:500;line-height:1.35;-webkit-font-smoothing:none;text-rendering:geometricPrecision;overflow:hidden}
    h1{font-size:17px;margin:0;text-align:center;font-weight:800}h2{font-size:12px;margin:10px 0 4px;padding-bottom:3px;border-bottom:1.5px dashed #222;font-weight:800}
    .center{text-align:center}.muted{color:#222}.meta{margin-top:7px;line-height:1.5}.row{display:flex;justify-content:space-between;gap:8px;padding:2.5px 0}.row span:last-child,.row strong:last-child{text-align:right}
    .total{font-size:14px;font-weight:700;border-top:2px solid #111;border-bottom:2px solid #111;margin-top:4px;padding:6px 0}
    table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:9.4px;line-height:1.3}th,td{padding:4px 2px;border-bottom:1px solid #555;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{font-size:9px;font-weight:800;border-bottom:1.5px solid #111}.right{text-align:right;white-space:nowrap;overflow-wrap:normal}.empty{text-align:center;color:#333;padding:7px}
    table th:nth-child(1),table td:nth-child(1){width:21%}table th:nth-child(2),table td:nth-child(2){width:24%}table th:nth-child(3),table td:nth-child(3){width:33%}table th:nth-child(4),table td:nth-child(4){width:22%}
    .footer{text-align:center;margin-top:12px;border-top:1px dashed #222;padding-top:8px;font-size:9px}
  </style></head><body>
    <h1>${empresaNombre}</h1>
    <div class="center muted">${escapeHtml(data.empresa.legal || '')}</div>
    <div class="center">${escapeHtml(data.empresa.direccion || '')}</div>
    <div class="center">${escapeHtml(data.empresa.telefono || '')}</div>
    <h2>CIERRE DE CAJA</h2>
    <div class="meta">
      <div class="row"><span>Turno</span><strong>#${escapeHtml(data.turno.id)}</strong></div>
      <div class="row"><span>Cajero</span><strong>${escapeHtml(data.turno.usuario_nombre || localStorage.getItem('mr_user_usuario') || 'Usuario')}</strong></div>
      <div class="row"><span>Apertura</span><span>${dateHtml(data.turno.created_at)}</span></div>
      <div class="row"><span>Cierre</span><span>${dateHtml(data.cerradoEn)}</span></div>
      <div class="row"><span>Duracion</span><span>${escapeHtml(data.duracion)}</span></div>
    </div>
    <h2>RESUMEN</h2>
    <div class="row"><span>Fondo inicial</span><span>${moneyHtml(data.turno.monto_inicial)}</span></div>
    <div class="row"><span>Total cobrado (${data.resumen.cantidad})</span><span>${moneyHtml(data.resumen.total)}</span></div>
    <div class="row"><span>Abonos CxC (${data.resumen.cantidadAbonosCxc})</span><span>${moneyHtml(data.resumen.abonosCxc)}</span></div>
    <div class="row"><span>Cobros taller (${data.resumen.cantidadCobrosTaller})</span><span>${moneyHtml(data.resumen.cobrosTaller)}</span></div>
    <div class="row"><span>Efectivo</span><span>${moneyHtml(data.resumen.efectivo)}</span></div>
    <div class="row"><span>Tarjeta</span><span>${moneyHtml(data.resumen.tarjeta)}</span></div>
    <div class="row"><span>Transferencia</span><span>${moneyHtml(data.resumen.transferencia)}</span></div>
    <div class="row"><span>Entradas</span><span>+${moneyHtml(data.totalEntradas)}</span></div>
    <div class="row"><span>Gastos</span><span>-${moneyHtml(data.totalGastos)}</span></div>
    <div class="row"><span>Retiros</span><span>-${moneyHtml(data.totalRetiros)}</span></div>
    <div class="row total"><span>EFECTIVO ESPERADO</span><span>${moneyHtml(data.efectivoEsperado)}</span></div>
    ${denominacionesHtml}
    <h2>VENTAS</h2><table><thead><tr><th>No.</th><th>Metodo</th><th>Fecha</th><th class="right">Total</th></tr></thead><tbody>${ventas}</tbody></table>
    <h2>ABONOS CUENTAS POR COBRAR</h2><table><thead><tr><th>Factura</th><th>Metodo</th><th>Fecha</th><th class="right">Monto</th></tr></thead><tbody>${abonos}</tbody></table>
    <h2>COBROS DE TALLER</h2><table><thead><tr><th>Orden</th><th>Metodo</th><th>Fecha</th><th class="right">Monto</th></tr></thead><tbody>${cobrosTaller}</tbody></table>
    <h2>GASTOS</h2><table><tbody>${gastos}</tbody></table>
    <h2>MOVIMIENTOS</h2><table><tbody>${movimientos}</tbody></table>
    ${data.turno.observacion ? `<h2>OBSERVACION</h2><div>${escapeHtml(data.turno.observacion)}</div>` : ''}
    <div class="footer">Documento generado por TMPOS SRL<br>Conserve este comprobante para fines de auditoria.</div>
  </body></html>`
}

function construirEmailCierre(data) {
  const empresaNombre = escapeHtml(data.empresa.nombre || data.empresa.legal || 'TMPOS SRL')
  const ventas = filasDetalle(data.ventas, venta => `
    <tr><td>${escapeHtml(venta.no_factura || venta.id)}</td><td>${escapeHtml(venta.nombre_cliente || 'Cliente General')}</td><td>${escapeHtml(venta.metodo_pago || 'Efectivo')}</td><td style="text-align:right">${moneyHtml(venta.total)}</td></tr>`, 'Sin ventas registradas')
  const abonosCxc = filasDetalle(data.abonosCxc, pago => `
    <tr><td style="padding:9px">${escapeHtml(pago.no_factura || pago.cuenta_id)}</td><td style="padding:9px">${escapeHtml(pago.nombre_cliente || 'Cliente General')}</td><td style="padding:9px">${dateHtml(pago.fecha || pago.created_at)}</td><td style="padding:9px">${escapeHtml(pago.metodo || 'EFECTIVO')}</td><td style="padding:9px;text-align:right;font-weight:bold;color:#0891b2">${moneyHtml(pago.monto)}</td></tr>`, 'Sin abonos de cuentas por cobrar')
  const cuentasCobrar = filasDetalle(data.cuentasCobrar, cuenta => `
    <tr><td style="padding:9px">${escapeHtml(cuenta.no_factura)}</td><td style="padding:9px">${escapeHtml(cuenta.nombre_cliente)}</td><td style="padding:9px;text-align:right">${moneyHtml(cuenta.total)}</td><td style="padding:9px;text-align:right;color:#047857">${moneyHtml(cuenta.abonado)}</td><td style="padding:9px;text-align:right;font-weight:bold;color:#b45309">${moneyHtml(cuenta.saldo)}</td></tr>`, 'No se generaron cuentas por cobrar en este turno')
  const cobrosTaller = filasDetalle(data.cobrosTaller, pago => `
    <tr><td style="padding:9px">${escapeHtml(pago.no_orden || pago.orden_id)}</td><td style="padding:9px">${escapeHtml(pago.cliente || 'Cliente General')}</td><td style="padding:9px">${dateHtml(pago.fecha || pago.created_at)}</td><td style="padding:9px">${escapeHtml(pago.metodo || 'EFECTIVO')}</td><td style="padding:9px;text-align:right;font-weight:bold;color:#7c3aed">${moneyHtml(pago.monto)}</td></tr>`, 'Sin cobros de taller')
  const gastos = filasDetalle(data.gastos, gasto => `
    <tr><td>${dateHtml(gasto.created_at)}</td><td>${escapeHtml(gasto.comentario || gasto.descripcion || 'Gasto')}</td><td style="text-align:right;color:#b91c1c">${moneyHtml(gasto.cantidad || gasto.monto)}</td><td></td></tr>`, 'Sin gastos registrados')
  const movimientos = filasDetalle([...data.entradas, ...data.retiros].sort((a, b) => parseDbDate(a.created_at) - parseDbDate(b.created_at)), item => `
    <tr><td>${dateHtml(item.created_at)}</td><td>${escapeHtml(String(item.tipo || '').toUpperCase())}</td><td>${escapeHtml(item.descripcion || '-')}</td><td style="text-align:right">${moneyHtml(item.monto)}</td></tr>`, 'Sin movimientos registrados')
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827">
    <div style="max-width:760px;margin:0 auto;padding:24px">
      <div style="background:#064e3b;color:#fff;padding:28px;border-radius:14px 14px 0 0">
        <div style="font-size:13px;opacity:.8;letter-spacing:1px">REPORTE OFICIAL</div>
        <h1 style="margin:6px 0 4px;font-size:28px">Cierre de caja #${escapeHtml(data.turno.id)}</h1>
        <div>${empresaNombre} &bull; ${dateHtml(data.cerradoEn)}</div>
      </div>
      <div style="background:#fff;padding:26px;border-radius:0 0 14px 14px;box-shadow:0 8px 25px rgba(0,0,0,.08)">
        <table style="width:100%;margin-bottom:20px"><tr>
          <td><div style="color:#6b7280;font-size:12px">CAJERO</div><strong>${escapeHtml(data.turno.usuario_nombre || localStorage.getItem('mr_user_usuario') || 'Usuario')}</strong></td>
          <td><div style="color:#6b7280;font-size:12px">APERTURA</div><strong>${dateHtml(data.turno.created_at)}</strong></td>
          <td><div style="color:#6b7280;font-size:12px">DURACION</div><strong>${escapeHtml(data.duracion)}</strong></td>
        </tr></table>
        <table style="width:100%;border-spacing:8px"><tr>
          <td style="background:#ecfdf5;padding:16px;border-radius:10px"><div style="font-size:12px;color:#047857">TOTAL COBRADO</div><strong style="font-size:20px">${moneyHtml(data.resumen.total)}</strong><div>${data.resumen.cantidad} transacciones</div></td>
          <td style="background:#eff6ff;padding:16px;border-radius:10px"><div style="font-size:12px;color:#1d4ed8">EFECTIVO ESPERADO</div><strong style="font-size:20px">${moneyHtml(data.efectivoEsperado)}</strong></td>
        </tr></table>
        <h2 style="font-size:17px;border-bottom:2px solid #e5e7eb;padding-bottom:8px">Resumen financiero</h2>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:7px">Fondo inicial</td><td style="text-align:right">${moneyHtml(data.turno.monto_inicial)}</td><td style="padding:7px">Ingresos en efectivo</td><td style="text-align:right">${moneyHtml(data.resumen.efectivo)}</td></tr>
          <tr><td style="padding:7px">Tarjeta</td><td style="text-align:right">${moneyHtml(data.resumen.tarjeta)}</td><td style="padding:7px">Transferencia</td><td style="text-align:right">${moneyHtml(data.resumen.transferencia)}</td></tr>
          <tr><td style="padding:7px;color:#0e7490;font-weight:bold">Abonos CxC (${data.resumen.cantidadAbonosCxc})</td><td style="text-align:right;color:#0e7490;font-weight:bold">${moneyHtml(data.resumen.abonosCxc)}</td><td style="padding:7px">Ventas de contado</td><td style="text-align:right">${moneyHtml(data.resumen.total - data.resumen.abonosCxc - data.resumen.cobrosTaller)}</td></tr>
          <tr><td style="padding:7px;color:#6d28d9;font-weight:bold">Cobros de taller (${data.resumen.cantidadCobrosTaller})</td><td style="text-align:right;color:#6d28d9;font-weight:bold">${moneyHtml(data.resumen.cobrosTaller)}</td><td style="padding:7px">Total de operaciones</td><td style="text-align:right">${data.resumen.cantidad}</td></tr>
          <tr><td style="padding:7px">Entradas</td><td style="text-align:right;color:#047857">+${moneyHtml(data.totalEntradas)}</td><td style="padding:7px">Gastos</td><td style="text-align:right;color:#b91c1c">-${moneyHtml(data.totalGastos)}</td></tr>
          <tr><td style="padding:7px">Retiros</td><td style="text-align:right;color:#b91c1c">-${moneyHtml(data.totalRetiros)}</td><td style="padding:7px;font-weight:bold">Efectivo esperado</td><td style="text-align:right;font-weight:bold">${moneyHtml(data.efectivoEsperado)}</td></tr>
        </table>
        <h2 style="font-size:17px;border-bottom:2px solid #e5e7eb;padding-bottom:8px">Ventas del turno</h2>
        <table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:#f9fafb"><th style="padding:9px;text-align:left">Factura</th><th style="text-align:left">Cliente</th><th style="text-align:left">Metodo</th><th style="text-align:right">Total</th></tr></thead><tbody>${ventas}</tbody></table>
        <h2 style="font-size:17px;border-bottom:2px solid #d97706;padding-bottom:8px;color:#92400e">Cuentas por cobrar generadas</h2>
        <table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:#fffbeb"><th style="padding:9px;text-align:left">Factura</th><th style="padding:9px;text-align:left">Cliente</th><th style="padding:9px;text-align:right">Total</th><th style="padding:9px;text-align:right">Abonado</th><th style="padding:9px;text-align:right">Saldo</th></tr></thead><tbody>${cuentasCobrar}</tbody></table>
        <h2 style="font-size:17px;border-bottom:2px solid #0891b2;padding-bottom:8px;color:#0e7490">Abonos de cuentas por cobrar</h2>
        <div style="margin:-2px 0 10px;color:#64748b;font-size:12px">${data.resumen.cantidadAbonosCxc} abono(s) recibido(s) · Total ${moneyHtml(data.resumen.abonosCxc)}</div>
        <table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:#ecfeff"><th style="padding:9px;text-align:left">Factura</th><th style="padding:9px;text-align:left">Cliente</th><th style="padding:9px;text-align:left">Fecha</th><th style="padding:9px;text-align:left">Metodo</th><th style="padding:9px;text-align:right">Monto</th></tr></thead><tbody>${abonosCxc}</tbody></table>
        <h2 style="font-size:17px;border-bottom:2px solid #7c3aed;padding-bottom:8px;color:#6d28d9">Cobros de taller</h2>
        <div style="margin:-2px 0 10px;color:#64748b;font-size:12px">${data.resumen.cantidadCobrosTaller} cobro(s) · Total ${moneyHtml(data.resumen.cobrosTaller)}</div>
        <table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:#f5f3ff"><th style="padding:9px;text-align:left">Orden</th><th style="padding:9px;text-align:left">Cliente</th><th style="padding:9px;text-align:left">Fecha</th><th style="padding:9px;text-align:left">Metodo</th><th style="padding:9px;text-align:right">Monto</th></tr></thead><tbody>${cobrosTaller}</tbody></table>
        <h2 style="font-size:17px;border-bottom:2px solid #e5e7eb;padding-bottom:8px">Gastos</h2>
        <table style="width:100%;border-collapse:collapse;font-size:13px"><tbody>${gastos}</tbody></table>
        <h2 style="font-size:17px;border-bottom:2px solid #e5e7eb;padding-bottom:8px">Entradas y retiros</h2>
        <table style="width:100%;border-collapse:collapse;font-size:13px"><tbody>${movimientos}</tbody></table>
        ${data.turno.observacion ? `<div style="margin-top:20px;padding:14px;background:#fffbeb;border-left:4px solid #f59e0b"><strong>Observacion:</strong> ${escapeHtml(data.turno.observacion)}</div>` : ''}
        <div style="margin-top:28px;padding-top:18px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;text-align:center">Reporte generado automaticamente por TMPOS SRL.</div>
      </div>
    </div>
  </body></html>`
}

function construirDatosApiCierre(data) {
  const texto = (value, limite = 160) => String(value || '').trim().slice(0, limite)
  const totalContado = Object.entries(data.conteo || {})
    .reduce((sum, [valor, cantidad]) => sum + (Number(valor) * Number(cantidad || 0)), 0)
  const mapVenta = venta => ({
    numero: texto(venta.no_factura || venta.id, 60),
    cliente: texto(venta.nombre_cliente || 'Cliente General'),
    metodo_pago: texto(venta.metodo_pago || 'EFECTIVO', 60),
    total: Number(venta.total || 0),
    fecha: texto(venta.created_at, 40),
  })
  const mapGasto = gasto => ({
    descripcion: texto(gasto.comentario || gasto.descripcion || 'Gasto'),
    metodo_pago: texto(gasto.metodo_pago || 'EFECTIVO', 60),
    monto: Number(gasto.cantidad || gasto.monto || 0),
    fecha: texto(gasto.created_at, 40),
  })
  const mapMovimiento = movimiento => ({
    tipo: texto(movimiento.tipo, 40).toUpperCase(),
    descripcion: texto(movimiento.descripcion),
    monto: Number(movimiento.monto || 0),
    fecha: texto(movimiento.created_at, 40),
  })
  const mapAbonoCxc = pago => ({
    factura: texto(pago.no_factura || pago.cuenta_id, 60),
    cliente: texto(pago.nombre_cliente || 'Cliente General'),
    metodo_pago: texto(pago.metodo || pago.metodo_pago || 'EFECTIVO', 60),
    monto: Number(pago.monto || pago.cantidad || 0),
    fecha: texto(pago.fecha || pago.created_at, 40),
    hora: texto(pago.hora, 20),
    nota: texto(pago.nota, 240),
  })
  const mapCuentaCobrar = cuenta => ({
    factura: texto(cuenta.no_factura || cuenta.id, 60),
    cliente: texto(cuenta.nombre_cliente || 'Cliente General'),
    total: Number(cuenta.total || 0),
    abonado: Number(cuenta.abonado || 0),
    saldo: Number(cuenta.saldo || 0),
    estado: texto(cuenta.estado || 'ACTIVA', 30),
    fecha_vencimiento: texto(cuenta.fecha_vencimiento, 40),
  })
  const mapCobroTaller = pago => ({
    orden: texto(pago.no_orden || pago.orden_id, 60),
    cliente: texto(pago.cliente || 'Cliente General'),
    metodo_pago: texto(pago.metodo || pago.metodo_pago || 'EFECTIVO', 60),
    monto: Number(pago.monto || pago.cantidad || 0),
    fecha: texto(pago.fecha || pago.created_at, 40),
    hora: texto(pago.hora, 20),
  })

  return {
    company_name: texto(data.empresa.nombre || data.empresa.legal || 'TMPOS SRL'),
    company_legal_name: texto(data.empresa.legal),
    company_rnc: texto(data.empresa.rnc, 40),
    company_phone: texto(data.empresa.telefono, 60),
    company_address: texto(data.empresa.direccion, 240),
    shift_id: Number(data.turno.id || 0),
    cashier: texto(data.turno.usuario_nombre || localStorage.getItem('mr_user_usuario') || 'Usuario'),
    opened_at: texto(data.turno.created_at, 40),
    closed_at: texto(data.cerradoEn, 40),
    duration: texto(data.duracion, 40),
    opening_amount: Number(data.turno.monto_inicial || 0),
    sales_count: Number(data.resumen.cantidad || data.ventas.length || 0),
    sales_total: Number(data.resumen.total || 0),
    cash_sales: Number(data.resumen.efectivo || 0),
    card_sales: Number(data.resumen.tarjeta || 0),
    transfer_sales: Number(data.resumen.transferencia || 0),
    receivables_payments_count: Number(data.resumen.cantidadAbonosCxc || 0),
    receivables_payments_total: Number(data.resumen.abonosCxc || 0),
    credit_payments_count: Number(data.resumen.cantidadAbonosCxc || 0),
    credit_payments_total: Number(data.resumen.abonosCxc || 0),
    receivables_count: Number(data.cuentasCobrar.length || 0),
    receivables_total: data.cuentasCobrar.reduce((sum, cuenta) => sum + Number(cuenta.total || 0), 0),
    receivables_balance: data.cuentasCobrar.reduce((sum, cuenta) => sum + Number(cuenta.saldo || 0), 0),
    workshop_payments_count: Number(data.resumen.cantidadCobrosTaller || 0),
    workshop_payments_total: Number(data.resumen.cobrosTaller || 0),
    entries_total: Number(data.totalEntradas || 0),
    expenses_total: Number(data.totalGastos || 0),
    withdrawals_total: Number(data.totalRetiros || 0),
    expected_cash: Number(data.efectivoEsperado || 0),
    counted_cash: totalContado,
    difference: totalContado - Number(data.efectivoEsperado || 0),
    observation: texto(data.turno.observacion, 500),
    details_truncated: data.ventas.length > 50 || data.cuentasCobrar.length > 50 || data.abonosCxc.length > 50 || data.cobrosTaller.length > 50 || data.gastos.length > 50 || (data.entradas.length + data.retiros.length) > 50,
    sales: data.ventas.slice(0, 50).map(mapVenta),
    receivables: data.cuentasCobrar.slice(0, 50).map(mapCuentaCobrar),
    receivables_payments: data.abonosCxc.slice(0, 50).map(mapAbonoCxc),
    credit_payments: data.abonosCxc.slice(0, 50).map(mapAbonoCxc),
    workshop_payments: data.cobrosTaller.slice(0, 50).map(mapCobroTaller),
    expenses: data.gastos.slice(0, 50).map(mapGasto),
    movements: [
      ...data.entradas,
      ...data.retiros,
      ...data.cuentasCobrar.map(cuenta => ({ tipo: 'CUENTA POR COBRAR', descripcion: `Factura ${cuenta.no_factura} · ${cuenta.nombre_cliente} · Saldo ${moneyHtml(cuenta.saldo)}`, monto: cuenta.total, created_at: cuenta.fecha_vencimiento || data.cerradoEn })),
      ...data.abonosCxc.map(pago => ({ tipo: 'ABONO CXC', descripcion: `Factura ${pago.no_factura} · ${pago.nombre_cliente} · ${pago.metodo}`, monto: pago.monto, created_at: pago.fecha || pago.created_at })),
      ...data.cobrosTaller.map(pago => ({ tipo: 'COBRO TALLER', descripcion: `Orden ${pago.no_orden} · ${pago.cliente} · ${pago.metodo}`, monto: pago.monto, created_at: pago.fecha || pago.created_at })),
    ]
      .sort((a, b) => parseDbDate(a.created_at) - parseDbDate(b.created_at))
      .slice(0, 50)
      .map(mapMovimiento),
    cash_count: Object.entries(data.conteo || {})
      .filter(([, cantidad]) => Number(cantidad) > 0)
      .map(([denomination, quantity]) => ({
        denomination: Number(denomination),
        quantity: Number(quantity),
        total: Number(denomination) * Number(quantity),
      })),
  }
}

const totalConteo = computed(() => {
  let total = 0
  for (const d of denominaciones) {
    const cant = Number(conteo.value[d.valor]) || 0
    total += d.valor * cant
  }
  return total
})

const totalPiezas = computed(() => denominaciones.reduce(
  (total, d) => total + (Number(conteo.value[d.valor]) || 0),
  0,
))

function abrirCierreTurno() {
  if (!turnoActual.value) return
  conteo.value = {}
  cierreRevelado.value = !esCierreCiego.value
  showCierreModal.value = true
}

function declararConteo() {
  cierreRevelado.value = true
}

async function cerrarTurno() {
  if (cerrandoTurno.value || !turnoActual.value) return
  if (esCierreCiego.value && !cierreRevelado.value) return
  cerrandoTurno.value = true
  try {
    const cierre = await obtenerResumenCierre()
    const diferencia = totalConteo.value - cierre.efectivoEsperado
    const resultadoCierre = await window.db.update('caja_turnos', cierre.turno.id, {
      estado: 'cerrado',
      monto_final: totalConteo.value,
      efectivo_esperado: cierre.efectivoEsperado,
      diferencia,
      cierre_ciego: esCierreCiego.value ? 1 : 0,
    })
    if (!resultadoCierre.success) throw new Error(resultadoCierre.error || 'No se pudo cerrar el turno')

    const resultadoCuadre = await window.db.insert('cuadres', {
      turno_id: cierre.turno.id,
      turno_usuario: cierre.turno.usuario_nombre || '',
      fecha: new Date().toISOString().split('T')[0],
      monto_inicial: cierre.turno.monto_inicial || 0,
      total_ventas: cierre.resumen.total,
      efectivo: cierre.resumen.efectivo,
      tarjeta: cierre.resumen.tarjeta,
      transferencia: cierre.resumen.transferencia,
      abonos_cxc: cierre.resumen.abonosCxc,
      cantidad_abonos_cxc: cierre.resumen.cantidadAbonosCxc,
      total_gastos: cierre.totalGastos,
      saldo_final: cierre.efectivoEsperado,
      efectivo_esperado: cierre.efectivoEsperado,
      efectivo_contado: totalConteo.value,
      diferencia,
      cierre_ciego: esCierreCiego.value ? 1 : 0,
      observacion: '',
      almacen_id: cierre.turno.almacen_id || almacenStore.activeId || 0,
      almacen_uid: cierre.turno.almacen_uid || almacenStore.activeUid || '',
    })
    if (!resultadoCuadre.success) throw new Error(resultadoCuadre.error || 'No se pudo guardar el cuadre')

    const ticketHtml = construirTicketCierre(cierre)
    const emailHtml = construirEmailCierre(cierre)
    const apiData = construirDatosApiCierre(cierre)
    const [impresionResult, correoResult] = await Promise.allSettled([
      window.electron.invoke('print:ticket', ticketHtml, cierre.impresora.printer_name || undefined),
      window.electron.invoke('enviar:cierreCaja', {
        toEmail: cierre.empresa.email || cierre.correo.email || '',
        subject: `Cierre de caja #${cierre.turno.id} - ${cierre.empresa.nombre || 'TMPOS SRL'}`,
        html: emailHtml,
        data: apiData,
      }),
    ])
    const impresion = impresionResult.status === 'fulfilled'
      ? impresionResult.value
      : { success: false, error: impresionResult.reason?.message || String(impresionResult.reason) }
    const correo = correoResult.status === 'fulfilled'
      ? correoResult.value
      : { success: false, error: correoResult.reason?.message || String(correoResult.reason) }

    turnoActual.value = null
    await cargarDatos()
    const mensajes = ['Turno cerrado correctamente.']
    mensajes.push(impresion?.success ? 'Ticket enviado a la impresora.' : `No se pudo imprimir: ${impresion?.error || 'Error desconocido'}`)
    mensajes.push(correo?.success
      ? `${correo.queued ? 'Reporte encolado' : 'Reporte enviado'} a ${correo.toEmail || cierre.empresa.email || cierre.correo.email} mediante ${correo.provider || 'correo'}.`
      : `No se pudo enviar el correo: ${correo?.error || 'Error desconocido'}`)
    alert(mensajes.join('\n'))
    auth.logout()
    await router.replace('/login')
  } catch (e) {
    console.error('Error cerrando turno:', e)
    alert('Error al cerrar el turno: ' + (e.message || 'Error desconocido'))
  } finally {
    cerrandoTurno.value = false
  }
}

function verDetalleVenta(v) {
  ventaSeleccionada.value = v
  showDetalleVenta.value = true
}

async function reimprimirVentaSeleccionada() {
  if (!ventaSeleccionada.value) return
  await ticketFacturaRef.value?.printTicket(ventaSeleccionada.value)
}

onMounted(async () => {
  await almacenStore.load()
  await cargarDatos()
  refreshInterval = setInterval(cargarDatos, 30000)
  pendientesInterval = setInterval(revisarNuevasFacturas, 5000)
})

watch(
  () => [almacenStore.activeUid, almacenStore.activeId],
  () => {
    turnoActual.value = null
    facturasPendientes.value = []
    loading.value = true
    cargarDatos()
  },
)

onUnmounted(() => {
  if (refreshInterval) clearInterval(refreshInterval)
  if (pendientesInterval) clearInterval(pendientesInterval)
})
</script>
