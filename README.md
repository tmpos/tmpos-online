# TMPOS Desktop

[![Versión](https://img.shields.io/badge/versión-2.13.13-2563eb)](https://github.com/tmpos/tmpos-online/releases/tag/v2.13.13)
[![Descargas](https://img.shields.io/github/downloads/tmpos/tmpos-online/v2.13.13/total)](https://github.com/tmpos/tmpos-online/releases/tag/v2.13.13)
[![Windows](https://img.shields.io/badge/Windows-10%20%7C%2011-0078d4?logo=windows)](https://github.com/tmpos/tmpos-online/releases/latest)

Sistema profesional de punto de venta, inventario, facturación, taller y administración comercial, con funcionamiento offline y sincronización mediante TMCloud.

## Descargar TMPOS para Windows

[![Descargar la última release](https://img.shields.io/badge/Descargar_ultima_release-v2.13.13-16a34a?style=for-the-badge&logo=windows)](https://github.com/tmpos/tmpos-online/releases/latest/download/TMPOS.Setup.2.13.13.exe)

El instalador es compatible con Windows 10 y Windows 11 de 64 bits. Los datos existentes se conservan durante la actualización.

## Descargar TMPOS para macOS

[![Descargar TMPOS v2.13.13 para macOS](https://img.shields.io/badge/Descargar_TMPOS-v2.13.13_macOS-111827?style=for-the-badge&logo=apple)](https://github.com/tmpos/tmpos-online/releases/download/v2.13.13/TMPOS-2.13.13-x64.dmg)

Compatible con Macs Intel de 64 bits. Al no estar notarizada esta compilación, la primera apertura puede requerir clic derecho sobre TMPOS, seleccionar **Abrir** y confirmar.

También está disponible el archivo [ZIP para macOS](https://github.com/tmpos/tmpos-online/releases/download/v2.13.13/TMPOS-2.13.13-x64.zip).

## Novedades de v2.13.13

- Inventario online ampliado con colores, capacidades, electrónicos y ajustes masivos de precios para accesorios, IMEI y seriales.
- Órdenes de taller renovadas con acciones compactas, piezas facturables, precio técnico y pagos individuales o múltiples.
- Historial de técnicos con órdenes pagadas y pendientes, filtros por fecha, totales y PDF integrado.
- Cambio de licencia reforzado para limpiar los datos anteriores y cargar inmediatamente la nueva empresa.
- Usuarios sincronizados desde TM Cloud y protección contra PIN duplicados.
- Mejoras en recibidos, búsqueda global, PDF profesional, caja, cuadres y reportes.

## Novedades de v2.13.12

- Nuevo icono oficial generado desde `build/LogoTM3.jpeg`.
- Iconos unificados para Windows, instalador, navegador, macOS y Android.
- Generación reproducible de todos los formatos mediante `npm run icons`.

## Novedades de v2.13.11

- Datos operativos en TM Cloud con creación automática de tablas faltantes.
- Correcciones en facturación, eliminación con OTP, cuadres, bancos, backups y correo.
- Configuración de correo restringida al usuario de soporte.
- Nuevo actualizador conectado a los releases oficiales de tmpos/tmpos-online.

## Novedades de v2.13.10

- Inicio de sesión y verificación de licencia más rápidos, usando la vigencia local y una comprobación remota ligera para bloqueos administrativos.
- Sincronización protegida contra eliminaciones remotas accidentales al instalar o registrar una computadora nueva.
- Carga inicial de imágenes de TM Cloud corregida para logos, productos y documentos impresos.
- Detección clara de respuestas HTML y desafíos de Cloudflare durante el registro de licencias.
- Cuadres de caja ampliados con filtros por fecha, tarjetas de resumen y PDF profesional descargable.
- Gastos mejorados con filtro por rango de fechas y totales por efectivo, transferencia y tarjeta.
- Facturas y Reporte General renovados con indicadores minimalistas de colores suaves y cifras vinculadas a sus filtros.
- Actualizaciones automáticas y Jarvis desactivados por defecto para nuevas instalaciones.

## Novedades de v2.13.9

- Empresa vuelve a guardarse correctamente en SQLite y se actualiza de inmediato en TM Cloud, respetando los permisos de Administrador y Soporte.
- Cuadres sincronizados con TM Cloud para consultarlos desde otras computadoras del mismo almacén.
- Cuentas por cobrar mejoradas con selección de banco para transferencias, también durante la edición.
- Historial de transacciones bancarias con opción de eliminar movimientos.
- Reportes corregidos para incluir ventas a crédito y separar efectivo, tarjetas y transferencias, incluyendo abonos y taller.
- Eliminación relacionada entre facturas y cuentas por cobrar para evitar registros huérfanos.
- Tickets de facturas, cuentas por cobrar y taller mejorados para impresoras térmicas de 72 mm, incluyendo logos correctamente.
- Estado de conexión visible en el pie de la aplicación y encabezado principal más limpio.

## Novedades de v2.13.8

- Apariencia independiente por almacén, sincronizada con TM Cloud, incluyendo color principal, fondo y texto de la barra superior.
- Registro de licencia y descarga inicial restaurados mediante el proxy seguro de Electron, sin errores CORS `Failed to fetch`.
- Sincronización inicial reforzada para empresa, usuarios, clientes, productos, IMEI, accesorios y relaciones entre tablas.
- Reintentos y control de límites del servidor durante la descarga del esquema y las tablas de TM Cloud.
- Factura PDF y ticket térmico rediseñados con una presentación profesional y mejor aprovechamiento del papel.
- Pagos mixtos desglosados por tarjeta, transferencia, banco, efectivo y cheque en facturas y tickets.
- Mayor estabilidad del proceso principal de Electron al ejecutar la aplicación en modo de desarrollo.

## Novedades de v2.13.7

- Ventas pausadas guardadas en TM Cloud y disponibles para continuar desde otra PC del mismo almacén.
- Creación automática de la tabla remota `ventas_pausadas`, con migración segura de las pausas locales anteriores.
- Bancos compartidos globalmente por toda la tienda, sin separación por almacén.
- Eliminación de métodos de pago desde Configuración.
- Selección de la tarjeta específica y su porcentaje al distribuir un pago mixto en el POS.
- Mejoras en las tarjetas del catálogo, modo oscuro y visualización del precio más alto disponible por equipo.

## Novedades de v2.13.6

- Configuración y datos de Empresa restringidos a Administrador y Soporte, incluso en los accesos directos de Electron.
- Costos y ganancias ocultos en todas las ventanas sensibles del POS para usuarios sin privilegios.
- Herramientas de desarrollo protegidas por rol y eliminación del acceso directo inseguro mediante F12.
- Rutas cargadas bajo demanda para reducir el paquete inicial y acelerar el inicio de la aplicación.
- Verificación restaurada con typecheck, lint y pruebas automatizadas.

## Novedades de v2.13.5

- Usuarios globales disponibles en todos los almacenes y guardado inmediato en la API.
- Caja aislada estrictamente por almacén, con correcciones en totales, gastos y movimientos del turno.
- Eliminación de facturas pendientes protegida mediante OTP.
- Catálogo del POS renovado con tarjetas visuales, scroll interno y botón para regresar al inicio.
- Selector persistente de 2 a 5 tarjetas por fila, almacenado en la tabla de configuración.
- Consulta completa de IMEI desde el selector de precio, disponible únicamente para Administrador y Soporte.

## Novedades de v2.13.4

- Correcciones del cambio de almacén en Órdenes de Taller, incluyendo órdenes antiguas sin UID.
- Herramientas para registrar la empresa actual como almacén y asignar los datos existentes a su UID.
- Nuevo filtro **Mes Pasado** en el Reporte General, desde el primer hasta el último día del mes anterior.
- Limpieza automática del formulario al agregar IMEI por lote a teléfonos diferentes.
- Nueva opción para eliminar un IMEI desde la modal de acciones, protegida mediante OTP.
- Mejoras de estabilidad en TM Cloud, inventario de teléfonos y flujo del POS.

## Novedades de v2.13.3

- Gestión multi-almacén ampliada en ventas, inventario, taller, compras, transferencias y contabilidad.
- Vista individual por almacén y vista consolidada de todos los almacenes en los reportes principales.
- Traslado múltiple de registros entre almacenes desde tablas y tarjetas.
- Filtros por almacén en los reportes General, Inventario, Taller, Ventas, Gastos, Ganancias, 606 y 607.
- Búsqueda de IMEI por modelo de teléfono y mejoras en la consulta de productos de facturas pendientes.

## Novedades de v2.13.2

- Botón para consultar los productos incluidos en las facturas pendientes desde Caja.
- Búsqueda de imágenes en internet desde la edición de teléfonos, accesorios y electrodomésticos.
- Resultados combinados de Openverse y Wikimedia Commons con autor, licencia y enlace a la fuente.
- Descarga y almacenamiento automático de la imagen seleccionada en TM Cloud.
- Mejoras de adaptación visual para las acciones de imágenes en pantallas pequeñas.

## Novedades de v2.13.1

- Acceso por red más rápido, estable y compatible con imágenes de TM Cloud.
- Inicio de sesión y permisos corregidos para vendedores, cajeros y administradores.
- Ventas atómicas y cobro de facturas pendientes disponibles desde equipos en red.
- Alertas sonoras en Caja cuando llegan facturas pendientes de vendedores.
- Nuevas opciones para imprimir, generar PDF, enviar por correo y compartir facturas cobradas.
- Impresión y reimpresión de comprobantes de gastos con logo de la empresa.
- Mejoras visuales y de tamaño en las modales de Caja.

## Novedades de v2.13.0

- Nueva compilación para macOS Intel en formatos DMG y ZIP.
- Configuración de país, idioma, moneda, formatos regionales e impuesto local.
- Traducción dinámica de la interfaz al inglés de Estados Unidos.
- Corrección del cálculo fiscal del POS y de la configuración por almacén activo.
- IMEI asociados automáticamente al UID del almacén activo.
- Icono renovado para la aplicación de macOS.

## Novedades de v2.12.16

- Nuevo contador visual de billetes y monedas para el cierre de caja.
- Mejoras de diseño, claridad y distribución en la modal de cierre.
- Corrección del enfoque en los campos del contador de efectivo.
- Corrección de la activación del botón para agregar stock en accesorios.

## Actualización

1. Descarga `TMPOS.Setup.2.13.13.exe`.
2. Cierra TMPOS si está abierto.
3. Ejecuta el instalador y conserva la ubicación actual.
4. Abre TMPOS normalmente; tus datos locales permanecerán disponibles.

Consulta todos los archivos y notas en la página del [release más reciente](https://github.com/tmpos/tmpos-online/releases/latest).
