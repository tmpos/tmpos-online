# Roadmap - Sistema de Gestion para Tiendas de Celulares

> **Ultima version:** [v2.13.10](https://github.com/tmpos/tmpos-online/releases/tag/v2.13.10)
> **Descargar:** [TMPOS Setup 2.13.10.exe](https://github.com/tmpos/tmpos-online/releases/download/v2.13.10/TMPOS.Setup.2.13.10.exe)

## Estado actual del proyecto

### ✅ Implementado
- POS completo con metodos de pago, comision, comprobantes fiscales
- Inventario: Telefonos, Accesorios, Electrodomesticos, IMEI, Serial, Piezas
- CRM basico: Clientes, Proveedores
- Taller/Reparaciones: Ordenes de taller, Tecnicos
- Caja: Turnos, apertura/cierre, gastos, resumen de ventas
- Multi-almacen con datos segmentados
- Facturacion con comprobantes fiscales, NCF, tickets termicos, PDF
- Sincronizacion TM Cloud / Supabase
- Roles: Admin, Cajero, Vendedor, Soporte, Taller
- Impresion de etiquetas con codigo de barras y QR
- Composicion de precios por comision de metodo de pago
- Tema oscuro/claro
- Licencias y configuracion remota

---

## Pendiente por prioridad

### 🔴 PRIORIDAD INMEDIATA

#### 1. Dashboard / KPI ✅
- [x] Tarjetero con ventas del dia, mes y año
- [x] Productos mas vendidos (top 10)
- [x] Alertas de stock bajo visibles en dashboard
- [x] Resumen de caja del turno activo

#### 2. Reportes ✅
- [x] Reporte general con graficos (Chart.js)
- [x] Filtro por rango de fechas (hoy, ayer, semana, mes, año, personalizado)
- [x] Filtro por almacen
- [x] Exportar a PDF con graficos y tablas
- [x] Reportes DGII (606, 607), Gastos, Ventas, Ganancias

#### 3. Compras / Ordenes de Compra ✅
- [x] Tabla `ordenes_compra` en base de datos
- [x] Crear orden de compra con productos y proveedor
- [x] Recepcion de mercancia (marcar como RECIBIDA)
- [x] Detalle de orden

---

### 🟡 PRIORIDAD ALTA

#### 4. Transferencias entre Almacenes
- [ ] Mover inventario de un almacen a otro
- [ ] Registrar entrada/salida por transferencia
- [ ] Historial de transferencias

#### 5. Ajustes de Inventario
- [ ] Ajustar stock por perdida, robo, daño
- [ ] Justificacion del ajuste
- [ ] Aprobacion requerida (admin)

#### 6. Notificaciones y Alertas
- [ ] Alerta de stock bajo en dashboard y topbar
- [ ] Notificacion de cuentas por cobrar vencidas
- [ ] Alerta de garantias proximas a vencer

#### 7. Gestion de Garantias
- [ ] Registrar garantia al vender (IMEI/Serial)
- [ ] Seguimiento de reclamos de garantia
- [ ] Tiempo restante de garantia visible
- [ ] Historial de reclamos por cliente/producto

---

### 🟢 PRIORIDAD MEDIA

#### 8. Comisiones de Vendedores
- [ ] Registrar comision por venta (% o fijo)
- [ ] Reporte de comisiones por empleado
- [ ] Liquidacion de comisiones

#### 9. Cuentas por Cobrar / Pagar
- [ ] Gestion de cuentas por cobrar (tabla ya existe)
- [ ] Gestion de cuentas por pagar (tabla ya existe)
- [ ] Historial de pagos de clientes
- [ ] Recordatorios de pago automaticos

#### 10. Historial de Precios
- [ ] Tracking de cambios de precio por producto
- [ ] Precio anterior vs nuevo con fecha
- [ ] Quien realizo el cambio

#### 11. Tickets de Soporte al Cliente
- [ ] Ticket de reparacion con comunicacion al cliente
- [ ] Notificaciones de estado via WhatsApp
- [ ] Galeria de fotos del equipo (antes/despues)

---

### 🔵 PRIORIDAD FUTURA

#### 12. Facturacion Electronica (e-NCF) para RD
- [ ] Envio de comprobantes fiscales electronicos a la DGII
- [ ] Timbre fiscal / Codigo de validacion
- [ ] Reporte de comprobantes enviados vs pendientes

#### 13. Backup / Restore de Base de Datos
- [ ] Respaldar base de datos SQLite
- [ ] Restaurar desde backup
- [ ] Backup automatico programado (diario/semanal)

#### 14. Integracion con Pasarela de Pago
- [ ] Pagos con tarjeta en linea (Tpaga, APAP, Popular)
- [ ] QR de pago generado en factura
- [ ] Conciliacion automatica de pagos

#### 15. Programa de Lealtad / Puntos
- [ ] Puntos por compras
- [ ] Canje de puntos
- [ ] Historial de puntos por cliente

#### 16. Aplicacion Movil (Capacitor)
- [ ] Companion app para escanear IMEIs/Seriales
- [ ] Consulta de precios desde el movil
- [ ] Notificaciones push

---

# Roadmap Profesional - Manteniendo el sistema simple

Este bloque organiza las mejoras que harian el sistema mas profesional sin cambiar su filosofia principal: vender rapido, cobrar facil, imprimir claro y administrar sin complicaciones.

## Principios

- Mantener el POS rapido y directo.
- Ocultar opciones tecnicas al cajero.
- Registrar todo lo importante sin pedir pasos innecesarios.
- Proteger la informacion fiscal, inventario y caja.
- Facilitar soporte, diagnostico y recuperacion.

---

## Fase 1 - Base profesional obligatoria

### 1. Facturacion electronica robusta
- [x] Crear tabla propia para datos e-CF / Alanube.
- [x] Guardar `factura_id`, `alanube_id`, `document_number`, `document_stamp_url`, `security_code`, `legal_status`, `status`, `pdf_url`, `xml_url`, `payload`, `response` y fechas.
- [x] Bloquear edicion de facturas electronicas aceptadas por DGII.
- [x] Permitir reimpresion sin modificar QR, codigo de seguridad ni datos fiscales.
- [x] Agregar boton para reintentar envio a Alanube cuando falle.
- [x] Manejar estados: pendiente, enviada, aceptada, rechazada y error.

### 2. Impresion unificada
- [ ] Centralizar la preparacion de datos para ticket y PDF.
- [ ] Usar la misma fuente para QR, e-CF, codigo de seguridad y URL de timbre.
- [ ] Evitar logica duplicada entre POS, Facturas, ticket termico y PDF.
- [ ] Garantizar que una factura reimpresa conserve el mismo QR fiscal.

### 3. Auditoria de acciones
- [ ] Registrar anulaciones.
- [x] Registrar edicion de facturas.
- [ ] Registrar cambios de precios.
- [ ] Registrar ajustes de inventario.
- [x] Registrar cambios de configuracion fiscal.
- [x] Guardar usuario, fecha, accion y datos relevantes.

### 4. Permisos por accion
- [ ] Permiso para vender.
- [ ] Permiso para aplicar descuento.
- [ ] Permiso para cambiar precio en POS.
- [ ] Permiso para anular factura.
- [ ] Permiso para editar factura.
- [ ] Permiso para abrir y cerrar caja.
- [ ] Permiso para cambiar configuracion.
- [ ] Validar permisos tambien en procesos internos, no solo en pantalla.

### 5. Kardex de inventario
- [ ] Registrar entradas.
- [ ] Registrar salidas.
- [ ] Registrar ajustes.
- [ ] Registrar devoluciones.
- [ ] Registrar transferencias.
- [ ] Guardar existencia antes y despues del movimiento.
- [ ] Mostrar historial por producto.

---

## Fase 2 - Control operativo

### 6. Cierre de caja formal
- [ ] Apertura de caja con monto inicial.
- [ ] Registro de ingresos y egresos.
- [ ] Arqueo por metodo de pago.
- [ ] Diferencia esperada vs contada.
- [ ] Firma o confirmacion del usuario responsable.
- [ ] Impresion o PDF del cierre.

### 7. Devoluciones y notas de credito
- [ ] Crear flujo formal de devolucion.
- [ ] Devolver inventario cuando aplique.
- [ ] Generar nota de credito para facturas fiscales.
- [ ] Relacionar nota de credito con factura original.
- [ ] Registrar motivo de devolucion.

### 8. Alertas inteligentes
- [ ] Productos bajo minimo.
- [ ] Comprobantes proximos a agotarse.
- [ ] Facturas electronicas pendientes de envio.
- [ ] Facturas rechazadas por DGII.
- [ ] Cuentas por cobrar vencidas.
- [ ] Backups atrasados.

### 9. Centro de diagnostico
- [ ] Mostrar version del sistema.
- [ ] Mostrar estado de base de datos.
- [ ] Mostrar estado de Alanube.
- [ ] Mostrar estado de impresora configurada.
- [ ] Mostrar ultimo backup.
- [ ] Exportar paquete de soporte con errores recientes y configuracion segura.

### 10. Backup y recuperacion
- [ ] Backup manual.
- [ ] Backup automatico.
- [ ] Verificar que el backup sea legible.
- [ ] Restaurar desde backup.
- [ ] Mostrar fecha del ultimo backup correcto.

---

## Fase 3 - Reportes y administracion

### 11. Dashboard diario
- [ ] Ventas del dia.
- [ ] Ventas por metodo de pago.
- [ ] Facturas pendientes.
- [ ] Cuentas por cobrar vencidas.
- [ ] Productos bajos.
- [ ] Ganancia estimada del dia.

### 12. Reporte de rentabilidad
- [ ] Ganancia por producto.
- [ ] Ganancia por categoria.
- [ ] Ganancia por vendedor.
- [ ] Ganancia por cliente.
- [ ] Productos con mejor margen.
- [ ] Productos sin movimiento.

### 13. Reporte fiscal
- [ ] ITBIS cobrado.
- [ ] Ventas gravadas.
- [ ] Ventas exentas.
- [ ] Comprobantes emitidos.
- [ ] Comprobantes anulados.
- [ ] Facturas electronicas aceptadas/rechazadas.

### 14. Clientes profesionales
- [ ] Historial de compras.
- [ ] Balance pendiente.
- [ ] Limite de credito.
- [ ] Dias de credito.
- [ ] Ultima compra.
- [ ] Estado del cliente.

### 15. Compras y proveedores
- [ ] Orden de compra.
- [ ] Recepcion de mercancia.
- [ ] Actualizacion de costo.
- [ ] Cuenta por pagar.
- [ ] Historial por proveedor.

---

## Fase 4 - Experiencia y soporte

### 16. Busqueda global
- [ ] Buscar factura.
- [ ] Buscar cliente.
- [ ] Buscar producto.
- [ ] Buscar IMEI o serial.
- [ ] Buscar comprobante.

### 17. Atajos de teclado en POS
- [ ] Buscar producto.
- [ ] Cobrar.
- [ ] Imprimir.
- [ ] Cambiar cantidad.
- [ ] Aplicar descuento.
- [ ] Seleccionar cliente.

### 18. Pantallas por rol
- [ ] Vista simple para cajero.
- [ ] Vista administrativa para dueno/admin.
- [ ] Vista tecnica para soporte.
- [ ] Ocultar configuraciones avanzadas al usuario normal.

### 19. Seguridad de datos sensibles
- [ ] Enmascarar token de Alanube.
- [ ] Proteger configuracion fiscal.
- [ ] Proteger secuencias.
- [ ] Bloquear sesion por inactividad.
- [ ] Pedir PIN para acciones sensibles.

### 20. Consistencia visual y textos
- [ ] Unificar nombres: factura, comprobante, e-CF, NCF, sin comprobante.
- [ ] Usar estados visuales claros.
- [ ] Mejorar mensajes de error para usuarios no tecnicos.
- [ ] Mantener pantallas limpias y directas.

---

## Orden recomendado de implementacion

1. Tabla propia para e-CF / Alanube.
2. Bloqueo de edicion fiscal aceptada.
3. Impresion unificada de ticket/PDF/QR.
4. Auditoria de acciones.
5. Kardex de inventario.
6. Cierre de caja formal.
7. Reintentos y estados de facturacion electronica.
8. Centro de diagnostico.
9. Backup automatico verificable.
10. Reportes de rentabilidad y fiscal.
