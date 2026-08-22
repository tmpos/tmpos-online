/**
 * Servicio para interactuar con la API de facturación electrónica de DGII
 *
 * TIPOS DE DOCUMENTOS ELECTRÓNICOS (e-CF) SOPORTADOS:
 * ===================================================
 *
 * e-CF 31 - Factura de Crédito Fiscal
 *   - Otorga derecho a crédito fiscal de ITBIS al comprador
 *   - Formato: E31XXXXXXXXXX (13 caracteres)
 *   - Requiere: FechaVencimientoSecuencia, FechaLimitePago, Paginación
 *   - Soporta múltiples tasas de ITBIS (18% como ITBIS1, 16% como ITBIS2)
 *
 * e-CF 32 - Factura de Consumo
 *   - Emitida a consumidores finales, sin derecho a crédito fiscal
 *   - Formato: E32XXXXXXXXXX
 *   - NO requiere: FechaVencimientoSecuencia, FechaLimitePago, Paginación
 *   - RNCComprador puede ser "00000000000" para consumidores anónimos
 *   - MSeller determina automáticamente formato extendido o resumen (<L 250,000)
 *
 * e-CF 33 - Nota de Débito
 *   - Aumenta el monto de una factura previamente emitida
 *   - Requiere referencia al documento original (NumeroDocumentoModificado)
 *
 * e-CF 34 - Nota de Crédito
 *   - Reduce el monto de una factura previamente emitida
 *   - Requiere referencia al documento original (NumeroDocumentoModificado)
 *
 * TIPOS ADICIONALES (para uso futuro):
 *   - e-CF 41: Comprobante de Compras
 *   - e-CF 43: Gastos Menores
 *   - e-CF 44: Regímenes Especiales
 *   - e-CF 45: Comprobante Gubernamental
 *   - e-CF 46: Pagos al Exterior
 *   - e-CF 47: Comprobantes de Ingresos
 *
 * Documentación completa: https://docs.ecf.mseller.app/docs/integration/documents
 */

/**
 * Autenticarse en la API de DGII
 * @param {string} environment - Entorno (TesteCF, CerteCF o eCF)
 * @returns {Promise<string>} Token de autenticación
 */
const authenticate = async (environment = 'TesteCF', credentials = {}) => {
  const host = `https://ecf.api.mseller.app/${environment}`;
  const loginUrl = `${host}/customer/authentication`;

  const loginData = {
    email: String(credentials.email || '').trim(),
    password: String(credentials.password || '')
  };
  if (!loginData.email || !loginData.password) {
    throw new Error('Configura las credenciales de DGII antes de utilizar el servicio')
  }

  try {
    const loginResponse = await fetch(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(loginData)
    });

    if (!loginResponse.ok) {
      throw new Error('Error al iniciar sesión en DGII');
    }

    const loginResult = await loginResponse.json();
    return loginResult.idToken;
  } catch (error) {
    console.error('Error en autenticación DGII:', error);
    throw error;
  }
};

/**
 * Enviar factura electrónica a DGII
 * @param {Object} datosFactura - Datos de la factura
 * @returns {Promise<Object>} Respuesta de la API con RNC, ECF, código de seguridad, QR URL, etc.
 */
export const enviarFacturaElectronica = async (datosFactura) => {
  const environment = 'TesteCF'; // Cambiar a "CerteCF" o "eCF" en producción
  const host = `https://ecf.api.mseller.app/${environment}`;
  const apiUrl = `${host}/documentos-ecf`;

  try {
    // Autenticarse primero
    const idToken = await authenticate(environment);

    // Determinar el tipo de documento
    const tipoDocumento = datosFactura.tipoNCF || '31';
    const esFacturaConsumo = tipoDocumento === '32';
    const esNotaCredito = tipoDocumento === '34';
    const esNotaDebito = tipoDocumento === '33';

    // Construir IdDoc según el tipo de documento
    const idDoc = {
      TipoeCF: tipoDocumento,
      eNCF: datosFactura.ncf,
      IndicadorEnvioDiferido: '1',
      IndicadorMontoGravado: '0',
      TipoIngresos: datosFactura.tipoIngresos || '05',
      TipoPago: datosFactura.tipoPago || '2'
    };

    // Para e-CF 31 (Factura de Crédito Fiscal) agregar campos de fecha
    if (tipoDocumento === '31') {
      idDoc.FechaVencimientoSecuencia = datosFactura.fechaVencimientoSecuencia || '31-12-2028';
      idDoc.FechaLimitePago = datosFactura.fechaLimitePago;
      idDoc.TotalPaginas = 1;
    }

    // Para e-CF 32 (Factura de Consumo) NO incluir fechas de vencimiento ni límite de pago
    // MSeller maneja automáticamente el formato extendido o resumen

    // Para Notas de Crédito/Débito (33, 34) agregar referencia al documento original
    if (esNotaCredito || esNotaDebito) {
      if (datosFactura.documentoReferencia) {
        idDoc.NumeroDocumentoModificado = datosFactura.documentoReferencia;
        idDoc.FechaEmisionDocumentoModificado = datosFactura.fechaDocumentoReferencia;
      }
    }

    // Construir el objeto ECF según la estructura de DGII
    const ecfData = {
      ECF: {
        Encabezado: {
          Version: '1.0',
          IdDoc: idDoc,
          Emisor: {
            RNCEmisor: datosFactura.rncEmisor,
            RazonSocialEmisor: datosFactura.razonSocialEmisor,
            DireccionEmisor: datosFactura.direccionEmisor,
            FechaEmision: datosFactura.fechaEmision
          },
          Comprador: {
            RNCComprador: datosFactura.rncComprador,
            RazonSocialComprador: datosFactura.razonSocialComprador
          },
          Totales: {
            MontoGravadoTotal: datosFactura.subtotal,
            MontoGravadoI1: datosFactura.subtotal,
            MontoExento: datosFactura.montoExento || 0,
            ITBIS1: datosFactura.tasaItbis || 18,
            TotalITBIS: datosFactura.itbis,
            TotalITBIS1: datosFactura.itbis,
            MontoTotal: datosFactura.total,
            MontoNoFacturable: 0
          }
        },
        DetallesItems: {
          Item: datosFactura.items.map((item, index) => ({
            NumeroLinea: String(index + 1),
            IndicadorFacturacion: '1',
            NombreItem: item.nombre,
            IndicadorBienoServicio: '1',
            CantidadItem: item.cantidad,
            UnidadMedida: '43',
            PrecioUnitarioItem: item.precio,
            DescuentoMonto: item.descuento || 0,
            ...(item.descuento > 0 && {
              TablaSubDescuento: {
                SubDescuento: [{
                  TipoSubDescuento: '%',
                  SubDescuentoPorcentaje: item.porcentajeDescuento || 0,
                  MontoSubDescuento: item.descuento
                }]
              }
            }),
            MontoItem: item.total
          }))
        },
        // Paginación solo para e-CF 31 (Factura de Crédito Fiscal)
        ...(tipoDocumento === '31' && {
          Paginacion: {
            Pagina: [{
              PaginaNo: 1,
              NoLineaDesde: 1,
              NoLineaHasta: datosFactura.items.length,
              SubtotalMontoGravadoPagina: datosFactura.subtotal,
              SubtotalMontoGravado1Pagina: datosFactura.subtotal,
              SubtotalExentoPagina: datosFactura.montoExento || 0,
              SubtotalItbisPagina: datosFactura.itbis,
              SubtotalItbis1Pagina: datosFactura.itbis,
              MontoSubtotalPagina: datosFactura.total,
              SubtotalMontoNoFacturablePagina: 0
            }]
          }
        }),
        FechaHoraFirma: ''
      }
    };

    console.log('📨 Objeto ECF completo a enviar:', JSON.stringify(ecfData, null, 2));

    // Enviar a la API
    const apiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
        'x-api-key': '9c4ca845-26c2-400e-af37-ee1eb7432000'
      },
      body: JSON.stringify(ecfData)
    });

    if (!apiResponse.ok) {
      const errorData = await apiResponse.json();
      throw new Error(`Error en la API de DGII: ${JSON.stringify(errorData)}`);
    }

    const apiResult = await apiResponse.json();

    // Estructura esperada de la respuesta:
    // {
    //   "rnc": "133023539",
    //   "ecf": "E310000087249",
    //   "internalTrackId": "2aaff8dd-c506-4f95-8b36-d5777deda59e",
    //   "securityCode": "wcZ/bS",
    //   "qr_url": "https://ecf.dgii.gov.do/testecf/consultatimbre?...",
    //   "signedDate": "25-03-2026 01:45:29"
    // }

    return apiResult;
  } catch (error) {
    console.error('Error al enviar factura electrónica a DGII:', error);
    throw error;
  }
};
