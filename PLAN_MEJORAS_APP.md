# Plan integral de mejoras de TMPOS

Este documento se actualiza conforme cada cambio se implementa y verifica. Una tarea solo pasa a `[x]` después de completar su validación técnica.

## P0 — Integridad de datos

- [x] Aislar completamente Recibidos por almacén en todas sus lecturas y escrituras.
- [x] Filtrar Cotizaciones por el almacén activo y conservar soporte administrativo para ver todas.
- [x] Auditar y corregir todas las escrituras operativas que no asignan `almacen_id` y `almacen_uid`.
- [x] Crear una operación transaccional para completar ventas (factura, inventario, caja, banco y cuenta por cobrar).
- [x] Evitar notas de crédito duplicadas de equipos recibidos mediante referencia e índice únicos.
- [x] Migrar registros históricos sin almacén de forma segura y auditable.

## P1 — País, moneda y fiscalidad

- [x] Eliminar referencias operativas restantes a `RD$`, `DOP`, `USD`, `es-DO` y `en-US` escritos directamente.
- [x] Centralizar moneda, fechas y números en helpers del perfil regional.
- [x] Adaptar documentos y terminología fiscal por país (Argentina vs. República Dominicana).
- [x] Ocultar Alanube/e-CF/NCF fuera de República Dominicana.
- [x] Unificar moneda y fiscalidad en UI, PDF, tickets, reportes, exportaciones, WhatsApp y asistente.

## P1 — Inventario, ventas y documentos

- [x] Consolidar la creación automática y manual de notas de crédito de Recibidos.
- [x] Centralizar la preparación de datos de factura, cotización, ticket y PDF.
- [x] Verificar refresco automático de todos los inventarios después de altas, edición, traslado y venta.
- [x] Revisar conversión de cotización, apartados, devoluciones y ventas a crédito por almacén.
- [x] Añadir validaciones de stock y concurrencia antes de cerrar una venta.

## P2 — Búsqueda y experiencia de usuario

- [x] Crear un composable común de búsqueda con debounce y normalización.
- [x] Migrar búsquedas principales de POS, inventario, ventas, contactos y contabilidad.
- [x] Unificar búsqueda por producto, IMEI, serial, código de barras, cliente y documento.
- [x] Sustituir errores silenciosos por estados visibles, reintentos y mensajes útiles.
- [x] Revisar listeners, intervalos y componentes con `KeepAlive` para evitar bloqueos o fugas.

## P2 — Seguridad y permisos

- [x] Sanitizar HTML generado para tickets, etiquetas, pantalla del cliente y vistas previas.
- [x] Revisar permisos de acciones sensibles además de permisos de navegación.
- [x] Restringir consultas SQL de soporte y registrar toda ejecución en auditoría.
- [x] Evitar exposición accidental de datos sensibles en logs.

## P2 — Calidad técnica

- [x] Corregir la configuración de TypeScript 6 y todos los errores de `tsc --noEmit`.
- [x] Añadir ESLint y comandos de verificación reproducibles.
- [x] Añadir pruebas de ventas, recibidos, apartados, traslados y aislamiento por almacén.
- [x] Añadir pruebas de moneda/fiscalidad para cada país soportado.
- [x] Reducir duplicación y dividir componentes excesivamente grandes, especialmente `PosComp.vue`.

## Registro de avances

- 2026-08-02: creado el plan a partir de la auditoría integral.
- 2026-08-02: Recibidos aislado por almacén en IMEI, modelos, clientes, notas de crédito y órdenes de taller; compilación de producción verificada.
- 2026-08-02: Cotizaciones filtradas por almacén activo, con selector global restringido a administración/soporte; compilación de producción verificada.
- 2026-08-02: auditadas las altas directas; corregidos Recibidos, reclamaciones, notas administrativas y cuotas de financiamiento. Se verificaron las altas dinámicas de Jarvis, POS, caja y conversiones; configuración, usuarios y catálogos maestros permanecen globales intencionalmente.
- 2026-08-02: nuevas ventas POS guardadas mediante transacción SQLite única: factura, cuenta por cobrar, secuencia fiscal, IMEI/serial/accesorios y bancos se confirman o revierten juntos; incluye validación concurrente de disponibilidad y stock.
- 2026-08-02: notas de crédito de Recibidos protegidas por `referencia_origen` e índice único parcial en SQLite, cubriendo ambas entradas de recepción.
- 2026-08-02: migración histórica de almacenes registrada sin sobrescribir su fecha; se guarda una auditoría por tabla con total y registros pendientes de almacén.
- 2026-08-02: eliminados los locales y monedas fijos de componentes operativos; los códigos restantes pertenecen exclusivamente al catálogo regional o a configuración de voz.
- 2026-08-02: añadidos helpers únicos para moneda, número, fecha y fecha/hora, disponibles en composables y plantillas; Caja, reportes, inventario, ventas, taller y documentos migrados y compilados.
- 2026-08-02: centralizada la terminología fiscal y de identificación por país; Argentina usa CUIT/DNI/CAE/ARCA y República Dominicana RNC/Cédula/NCF/DGII en empresa, contactos, tickets y facturas PDF.
- 2026-08-02: Alanube, e-CF y sus acciones operativas quedan disponibles solo con el perfil fiscal de República Dominicana; se ocultaron configuración, reenvío y activación POS en los demás países.
- 2026-08-02: asistente, CSV de ventas, tickets y facturas PDF usan moneda, impuesto e identificadores del perfil regional; reportes fiscales 606/607 se restringieron al perfil dominicano.
- 2026-08-02: creación manual y automática de notas de crédito de Recibidos unificada en un servicio idempotente, con recuperación ante concurrencia por `referencia_origen` y vinculación al equipo.
- 2026-08-02: creado composable común de búsqueda con debounce, normalización de acentos y comparación compacta; clientes y proveedores migrados como primeras pantallas.
- 2026-08-02: HTML activo bloqueado centralmente antes de imprimir en Electron/Capacitor y antes de renderizar vistas previas o la pantalla del cliente; datos variables de productos se escapan.
- 2026-08-02: configuración migrada a TypeScript 6 sin `baseUrl` obsoleto; corregidos los tipos detectados y `tsc --noEmit` queda limpio mediante `npm run typecheck`.
- 2026-08-02: añadido ESLint flat para Vue/TypeScript y comandos `lint` y `verify`; corregidos atributos Vue duplicados y la verificación reproducible pasa completa.
- 2026-08-02: datos comunes de factura/cotización centralizados para PDF y ticket; moneda, impuesto, identificadores y exportaciones consumen el perfil regional también en WhatsApp y asistente.
- 2026-08-02: búsqueda normalizada migrada a POS, facturas, IMEI, seriales, clientes, proveedores y cuentas por cobrar, cubriendo producto, código de barras, documento, IMEI y serial.
- 2026-08-02: permisos de eliminación, precios, usuarios, traslados y facturas aplicados en IPC/SQLite; consola SQL limitada a administración/soporte con auditoría sin texto sensible y logs de licencia/nube redactados.
- 2026-08-02: cierre de venta confirmado con revalidación transaccional de almacén, disponibilidad individual y stock antes de descontar inventario.
- 2026-08-02: eventos locales de inventario conectados al refresco `KeepAlive` tras ventas y traslados; refrescos fallidos muestran error y realizan un reintento automático controlado.
- 2026-08-02: conversiones de cotización, apartados, devoluciones, crédito y traslados verificadas con reglas compartidas de pertenencia al almacén.
- 2026-08-02: listeners e intervalos auditados; corregido intervalo huérfano de alertas, limpieza de arrastre/redimensión de etiquetas y limpieza final de listeners/timers de refresco.
- 2026-08-02: Vitest integrado a `verify` con 23 pruebas de venta/stock, recibidos idempotentes, apartados/conversiones/traslados, aislamiento y perfiles monetarios/fiscales de todos los países.
- 2026-08-02: lógica de `PosComp.vue` separada en servicios de documentos, catálogo/búsqueda POS y reglas de inventario; eliminada duplicación compartida con tickets, PDF y cierre transaccional.
