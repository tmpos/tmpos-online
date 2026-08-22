# Plan de funciones avanzadas de TMPOS

Este documento controla la implementación solicitada. Las funciones se desarrollan por dependencias para evitar duplicar datos y mantener compatibilidad con escritorio, Android y TM Cloud.

## 1. Jarvis operativo y preventivo

- [x] Consultar y administrar módulos operativos con confirmación.
- [x] Preparar facturas sin cobrarlas automáticamente.
- [x] Analizar inventario bajo, productos inmóviles, márgenes, clientes inactivos y taller atrasado.
- [x] Recomendar compras, precios y campañas usando datos locales reales.
- [ ] Crear recordatorios y tareas operativas.
- [x] Registrar en auditoría cada acción ejecutada.

## 2. Cierre de caja ciego

- [x] El cajero cuenta y declara el efectivo sin ver el esperado.
- [x] Después de declarar se muestra la diferencia.
- [x] Guardar efectivo esperado, contado, diferencia y si fue cierre ciego.
- [x] Aplicar tanto en Caja como en el cierre rápido del POS.
- [ ] Supervisores pueden consultar el resultado en Cuadres.

## 3. Taller

- [x] Reservar automáticamente piezas al asignarlas a una orden.
- [ ] Liberar la reserva al cancelar o cambiar la orden.
- [x] Descontar existencia al consumir/facturar la pieza.
- [x] Comisión por porcentaje de reparación, porcentaje de piezas o monto fijo.
- [ ] Historial de liquidaciones por técnico.

## 4. Financiamiento

- [x] Plan semanal, quincenal o mensual.
- [x] Inicial, interés, mora y número de cuotas.
- [x] Garantes y documentos adjuntos en el modelo.
- [x] Calendario automático de vencimientos.
- [ ] Recordatorios automáticos.
- [x] Cálculo de capacidad de pago y nivel de riesgo.

## 5. Promociones y fidelización

- [ ] Combos y promociones 2x1.
- [ ] Precios por volumen.
- [ ] Listas de precios minorista y mayorista.
- [ ] Puntos configurables.
- [ ] Niveles de cliente.
- [ ] Tarjetas de regalo con saldo y vencimiento.

## 6. Variantes para tienda general

- [ ] Disponible únicamente cuando el modo de tienda sea `general`.
- [ ] Atributos configurables: talla, color, capacidad, sabor y presentación.
- [ ] Código de barras, costo, precio y existencia por variante.
- [ ] Selección de variante desde el POS.

## 7. Portal del cliente

- [ ] Acceso seguro mediante enlace o QR.
- [ ] Consultar y descargar factura/garantía.
- [ ] Consultar reparación y aprobar presupuesto.
- [ ] Realizar abonos.
- [ ] Consultar puntos.
- [ ] Comunicarse con la tienda.

## 8. Tienda en línea

- [ ] Catálogo público sincronizado.
- [ ] Existencia por almacén.
- [ ] Carrito y pedido.
- [ ] Reserva temporal de inventario.
- [ ] Recogida o entrega.
- [ ] Estado del pedido y vínculo con el portal.

## Criterios globales

- Toda acción financiera o destructiva requiere confirmación y auditoría.
- Las tablas nuevas deben existir en Electron, Capacitor y TM Cloud.
- Los módulos deben respetar almacén, usuario y permisos.
- Las operaciones offline deben sincronizarse sin duplicar registros.
- Cada fase debe compilar antes de continuar.
