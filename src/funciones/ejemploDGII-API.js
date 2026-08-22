const makeApiRequest = async () => {
  var environment = "TesteCF"; // Cambiar a "TesteCF" o "CerteCF" ó "eCF"
  const host = `https://ecf.api.mseller.app/${environment}`;
  const loginUrl = `${host}/customer/authentication`;
  const apiUrl = `${host}/documentos-ecf`;

  const loginData = {
    email: process.env.DGII_EMAIL || '',
    password: process.env.DGII_PASSWORD || ''
  };

  try {
    const loginResponse = await fetch(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(loginData)
    });

    if (!loginResponse.ok) {
      throw new Error('Error al iniciar sesión');
    }

    const loginResult = await loginResponse.json();
    const idToken = loginResult.idToken;

    const apiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
        'x-api-key': '9c4ca845-26c2-400e-af37-ee1eb7432000'
      },
      body: JSON.stringify({
        "ECF": {
          "Encabezado": {
            "Version": "1.0",
            "IdDoc": {
              "TipoeCF": "31",
              "eNCF": "E310000087249",
              "FechaVencimientoSecuencia": "31-12-2028",
              "IndicadorEnvioDiferido": "1",
              "IndicadorMontoGravado": "0",
              "TipoIngresos": "05",
              "TipoPago": "2",
              "FechaLimitePago": "07-08-2028",
              "TotalPaginas": 1
            },
            "Emisor": {
              "RNCEmisor": "133023539",
              "RazonSocialEmisor": "TM POS SRL",
              "DireccionEmisor": "DireccionEmisor1",
              "FechaEmision": "25-03-2026"
            },
            "Comprador": {
              "RNCComprador": "101023122",
              "RazonSocialComprador": "Cliente Prueba SRL"
            },
            "Totales": {
              "MontoGravadoTotal": 540.0,
              "MontoGravadoI1": 540.0,
              "MontoExento": 0,
              "ITBIS1": 18,
              "TotalITBIS": 97.20,
              "TotalITBIS1": 97.20,
              "MontoTotal": 637.20,
              "MontoNoFacturable": 0
            }
          },
          "DetallesItems": {
            "Item": [{
              "NumeroLinea": "1",
              "IndicadorFacturacion": "1",
              "NombreItem": "Producto 1",
              "IndicadorBienoServicio": "1",
              "CantidadItem": 24,
              "UnidadMedida": "43",
              "PrecioUnitarioItem": 25.0,
              "DescuentoMonto": 60.0,
              "TablaSubDescuento": {
                "SubDescuento": [{
                  "TipoSubDescuento": "%",
                  "SubDescuentoPorcentaje": 10.0,
                  "MontoSubDescuento": 60.0
      }]
              },
              "MontoItem": 540.0
            }]
          },
          "Paginacion": {
            "Pagina": [{
              "PaginaNo": 1,
              "NoLineaDesde": 1,
              "NoLineaHasta": 1,
              "SubtotalMontoGravadoPagina": 540.0,
              "SubtotalMontoGravado1Pagina": 540.0,
              "SubtotalExentoPagina": 0,
              "SubtotalItbisPagina": 97.20,
              "SubtotalItbis1Pagina": 97.20,
              "MontoSubtotalPagina": 637.2,
              "SubtotalMontoNoFacturablePagina": 0
         }]
          },
          "FechaHoraFirma": ""
        }
      })
    });

    if (!apiResponse.ok) {
      throw new Error('Error en la solicitud a la API');
    }

    const apiResult = await apiResponse.json();
    console.log('Respuesta de la API:', apiResult);
  } catch (error) {
    console.error('Error:', error);
  }
};

makeApiRequest();
