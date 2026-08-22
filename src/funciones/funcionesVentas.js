import {peticiones,nfecha,generarCodigoUnico,arrayToObjetoFromTabla,envioElectron,enviarDatosPorPost,peticionesFetch,peticionesFetchOffline} from './funciones.js';

const productosArray = await peticionesFetchOffline('getDataAsArray', 'productos')
/********************************************************************/
const generarGanancias = (productos, productosArray = []) => {
  let gananciaPura = 0;

  for (let prod of productos) {
    // Ignorar productos con nombre "DESCUENTO", "DELIVERY", etc.
    if (/descuento|delivery/i.test(prod.nombre || '')) continue;

    const datosProd = productosArray.find(product => product.codigo === prod.codigo);
    const precioVenta = parseFloat(prod.precio_venta) || 0;
    const cantidad = parseFloat(prod.cantidad) || 0;

    let precioCompra = 0;
    if (datosProd) {
      precioCompra = parseFloat(datosProd.precio_compra) || 0;
    } else {
      precioCompra = parseFloat(prod.costo) || 0;
    }

    gananciaPura += (precioVenta - precioCompra) * cantidad;
  }

  return gananciaPura.toFixed(2);
}
/********************************************************************/



function quitarBarraFinal(str) {
    // Verifica si el string termina con una barra diagonal
    if (str.endsWith('/')) {
        // Si termina con una barra, la elimina
        return str.slice(0, -1);
    }
    // Si no termina con una barra, devuelve el string original
    return str;
}
/******************************************************************/
export async function facturaNueva(url,data,metodo,token){

  const datosJSON = await envioElectron('datosarchivo');

	const datosUsuarioLocal = JSON.parse(window.localStorage.getItem('usuarioLocal')) || [];
	if (!datosUsuarioLocal) {
		return ['error'];
	}

 const copiaData = JSON.parse(JSON.stringify(data))

/*  const verificaFactura = await peticionesFetch(
	`${datosJSON.VITE_LINKURL}${datosJSON.VITE_LINK_API}`,
   `datoscampo/facturas/no_factura/${data.nofactura}`, {}, token, 'GET');*/
  const verificaFactura = await peticionesFetchOffline('getDataByField', 'facturas','no_factura',data.nofactura);

	if(verificaFactura){
		const returno = ['ok','Ya Existe'];
		return returno;
	}

/* const camposFactura = await peticionesFetch(
      `${datosJSON.VITE_LINKURL}${datosJSON.VITE_LINK_API}`,`campos/facturas`,
      {},
      token,
      "GET"
    );*/
 const camposFactura = await arrayToObjetoFromTabla('facturas');

const listadoImei = [];
const productos = data.productosArray.map(prods => {

    let costoProdObj = productosArray.find(prod => prod.codigo === prods.codigo);
    let costoProd = costoProdObj ? parseFloat(costoProdObj.precio_compra) : parseFloat(prods.precio_compra);

    const impuesto = Number(prods.precio_venta) * (prods.impuestos / 100);
    const ganancia = ((parseFloat(prods.precio_venta) - parseFloat(costoProd)) * parseFloat(prods.cantidad))
    const total = parseFloat(prods.total).toFixed(2) || (parseFloat(prods.precio_venta)  * parseFloat(prods.cantidad)).toFixed(2)
    const producto = {
        "id": prods.id,
        "codigo": prods.codigo,
        "nombre": prods.nombre,
        "categoria": prods.categoria,
        "cantidad": prods.cantidad,
        "precio": prods.precio_venta,
        "precio_venta": prods.precio_venta,
        "descuento": prods.descuento,
        "impuesto_venta": prods.impuesto_venta,
        "impuestos": prods.impuestos,
        "precio_final": prods.precio_final,
        "no_compra": prods.no_compra,
        "costo": prods.precio_compra,
        "total": total,
        //"impuesto": impuesto,
        "impuesto": prods.impuesto_venta,
        "ganancia": ganancia,
        "ganancia_pura": ganancia

    };

    if (prods.categoria === 'CELULARES') {

producto.lista_imei = Array.isArray(prods.lista_imei)
  ? prods.lista_imei.join(',')
  : prods.lista_imei;

        const imeisList = Array.isArray(prods.lista_imei) ? prods.lista_imei : prods.lista_imei.split(',');
        if(imeisList.length > 0){
        	for(let imei of imeisList){
                 if (imei.trim() !== '') { 
                listadoImei.push({ imei: imei.trim(), precio_venta: prods.precio_final });
            }
        	}
        }

    }

    return producto;
});


const ganancia = generarGanancias(productos,productosArray);

var datos = {
'no_factura':data.nofactura,
'identificadordb':generarCodigoUnico(),
'tipo_factura':data.tipocomprobanteFN,
'comprobante':data.comprobanteFN,
'cod_cliente':data.cliente.codigo,
'nombre_cliente':data.cliente.nombre,
'telefono_cliente':data.cliente.telefono,
'productos':JSON.stringify(productos),
'vendedor':data.vendedorFN,
'metodo_pago':data.metodoPagoFN,
'fecha_emision':nfecha('fecha'),
'impuesto':data.impuesto,
'descuento':data.descuento,
'subtotal':data.subtotal,
'total':data.total,
'ganancia': ganancia,
'estado_factura':data.estadoFN,
'efectivo':data.efectivoFN,
'canal_venta':data.canalventa,
'transferencia':data.transferenciaFN,
'tarjeta':data.tarjetaFN,
'cheque':data.chequeFN,
'fecha_estado':nfecha('fecha'),
'financiera':data.entidad_financiera,//cajero vendedor instalador
'nota':data.nota,
'almacen':data.almacen,
'otro':JSON.stringify([
    {'delivery':data.deliveryFN,
    'mesero':data.meseroFN,
    'mesa':data.mesaFN,
    'vendedor':data.vendedorFN,
    'instalador':data.instaladorFN,
    'pagocon':parseFloat(data.pagaCon).toFixed(2),
    'sucambio':parseFloat(data.suCambio).toFixed(2),
    'cajero':data.cajeroFN,
    'noCheque':data.noCheque,
    'bancoCheque':data.bancoCheque,
    'token':datosUsuarioLocal[0].token}
    ]),
'mes':nfecha('mes'),
'cajero':data.cajeroFN,
'token':datosUsuarioLocal[0].token,
'year':nfecha('year'),
'hora':nfecha('hora'),
'created_at':nfecha('timestamp'),
'updated_at':nfecha('timestamp'),
'usuario':data.vendedorFN

};

   //const respuestaServer = await peticiones(url,datos,metodo,token)
   const respuestaServer = await peticionesFetchOffline('insertData', 'facturas',JSON.stringify(datos));
     if(respuestaServer[0] == 'ok'){

/****************************************************************************/
/*     const camposSubirData = await arrayToObjetoFromTabla('subir_data');
     camposSubirData.tabla = 'facturas'
     camposSubirData.accion = 'crear'
     camposSubirData.estado = 'PENDIENTE'
     camposSubirData.data = JSON.stringify(datos)
    const enviarData = await peticionesFetchOffline('insertData', 'subir_data',JSON.stringify(camposSubirData));*/
/****************************************************************************/

     	if (listadoImei.length > 0) {

    		for(let imeiVendido of listadoImei){
                const copiaImei = JSON.parse(JSON.stringify(imeiVendido))
 /*              const datosImei = await peticionesFetch(
							      `${datosJSON.VITE_LINKURL}${datosJSON.VITE_LINK_API}`,
							      'datoscampo/imei/imei/'+imeiVendido.imei,
							      {},
							      token,
							      'GET'
							    );*/
               const datosImei = await peticionesFetchOffline('getDataByField', 'imei','imei',imeiVendido.imei);

                if(datosImei){


				  const urlImei = datosJSON.VITE_LINKURL+datosJSON.VITE_LINK_API+"/actualizarcampos/imei";

				  if (datosImei.hasOwnProperty('created_at')) {
				    datosImei.updated_at = nfecha('timestamp');
				  }
				  datosImei.estado = 'VENDIDO'
				  datosImei.fecha_venta = nfecha('fecha')
				  datosImei.hora_venta = nfecha('hora')
				  datosImei.comprador = datos.nombre_cliente
				  datosImei.factura = datos.no_factura
				  datosImei.precio_venta = copiaImei.precio_venta
				 // const envioDatos = await enviarDatosPorPost(urlImei, datosImei, token);
                  const envioDatos = await peticionesFetchOffline('updateData', 'imei',JSON.stringify(datosImei));

                }


    		}
    	}
    }
   return respuestaServer;
/*  try {
    // Realiza la llamada a Electron y espera la respuesta
    const envioDatosJSON = await window.electron.ipcRenderer.invoke('consultaservidor', 'insertData','facturas', datos);
    return envioDatosJSON;
  } catch (error) {
    console.error("Error al enviar datos:", error);
    return ['error'];
  }*/
}

/*********************************************************/
export async function facturaActualizar(url,data,metodo,token){
const datosJSON = await envioElectron('datosarchivo');
//console.log("datosJSON", datosJSON);
const listadoImei = [];
const productos = data.productosArray.map(prods => {
    const impuesto = Number(prods.precio_venta) * (prods.impuestos / 100);

    let costoProdObj = productosArray.find(prod => prod.codigo === prods.codigo);
    let costoProd = costoProdObj ? parseFloat(costoProdObj.precio_compra) : parseFloat(prods.costo);


     const ganancia = ((parseFloat(prods.precio_venta) - parseFloat(costoProd)) * parseFloat(prods.cantidad)).toFixed(2)
     const total = (parseFloat(prods.precio_venta)  * parseFloat(prods.cantidad)).toFixed(2)
    const producto = {
        "id": prods.id,
        "codigo": prods.codigo,
        "nombre": prods.nombre,
        "categoria": prods.categoria,
        "empaque": prods.empaque,
        "cantidad": prods.cantidad,
        "precio": prods.precio_venta,
        "precio_venta": prods.precio_venta,
        "descuento": prods.descuento,
        "impuesto_venta": prods.impuesto_venta,
        "impuestos": prods.impuestos,
        "precio_final": prods.precio_final,
        "no_compra": prods.no_compra,
        "costo": costoProd,
        "total": total,
        //"impuesto": impuesto,
        "impuesto": prods.impuesto_venta,
        "ganancia": ganancia,
        "ganancia_pura": ganancia,
        "stock": prods.stock,
        "imagen": prods.imagen
    };

    if (prods.categoria === 'CELULARES') {
        producto.lista_imei = prods.lista_imei;
        const imeisList = Array.isArray(prods.lista_imei) ? prods.lista_imei : prods.lista_imei.split(',');
        if(imeisList.length > 0){
            for(let imei of imeisList){
                 if (imei.trim() !== '') { // Evita agregar valores vacíos
                listadoImei.push({ imei: imei.trim(), precio_venta: prods.precio_venta });
            }
            }
        }

    }

    return producto;
});

const ganancia = generarGanancias(productos,productosArray);

var datos = {
'id':data.id,
'no_factura':data.nofactura,
//'tipo_factura':data.tipocomprobanteFN,
//'comprobante':data.comprobanteFN,
/*'cod_cliente':data.cliente.codigo,
'nombre_cliente':data.cliente.nombre,
'telefono_cliente':data.cliente.telefono,*/
'productos':JSON.stringify(productos),
'vendedor':data.vendedorFN,
'metodo_pago':data.metodoPagoFN,
'fecha_emision':nfecha('fecha'),
'impuesto':data.impuesto,
'descuento':data.descuento,
'subtotal':data.subtotal,
'total':data.total,
'ganancia': ganancia,
'estado_factura':data.estadoFN,
'efectivo':data.efectivoFN,
'canal_venta':data.canalventa,
'transferencia':data.transferenciaFN,
'tarjeta':data.tarjetaFN,
'fecha_estado':nfecha('fecha'),
//'financiera':data.entidad_financiera,//cajero vendedor instalador
'nota':data.nota,
'otro':JSON.stringify([{'delivery':data.deliveryFN,'mesero':data.meseroFN,'mesa':data.mesaFN,'vendedor':data.vendedorFN,'instalador':data.instaladorFN,'pagocon':data.total,'sucambio':'0.00','cajero':data.cajeroFN,'token':generarCodigoUnico()}]),
'mes':nfecha('mes'),
'year':nfecha('year'),
'hora':nfecha('hora'),
'created_at':data.created_at,
'updated_at':nfecha('timestamp'),
'usuario':data.vendedorFN

};
/*   const respuestaServer = await peticiones(url,datos,metodo,token)*/
 const respuestaServer = await peticionesFetchOffline('updateData', 'facturas',JSON.stringify(datos));
     if(respuestaServer[0] == 'ok'){

/******************************************************************************/
/*     const camposSubirData = await arrayToObjetoFromTabla('subir_data');
     camposSubirData.tabla = 'facturas'
     camposSubirData.accion = 'actualizar'
     camposSubirData.estado = 'PENDIENTE'
     camposSubirData.data = JSON.stringify(datos)
     const enviarData = await peticionesFetchOffline('insertData', 'subir_data',JSON.stringify(camposSubirData));*/
/******************************************************************************/


        if (listadoImei.length > 0) {

            for(let imei of listadoImei){
/*               const datosImei = await peticionesFetch(
                                  `${datosJSON.VITE_LINKURL}${datosJSON.VITE_LINK_API}`,
                                  'datoscampo/imei/imei/'+imei.imei,
                                  {},
                                  token,
                                  'GET'
                                );*/

               const datosImei = await peticionesFetchOffline('getDataByField', 'imei','imei',imei.imei);
                if(datosImei){


                  const urlImei = datosJSON.VITE_LINKURL+datosJSON.VITE_LINK_API+"/actualizarcampos/imei";

                  if (datosImei.hasOwnProperty('created_at')) {
                    datosImei.updated_at = nfecha('timestamp');
                  }
                  datosImei.estado = 'VENDIDO'
                  datosImei.fecha_venta = nfecha('fecha')
                  datosImei.hora_venta = nfecha('hora')
                  datosImei.comprador = datos.nombre_cliente
                  datosImei.factura = datos.no_factura
                  datosImei.precio_venta = imei.precio_venta
/*                  const envioDatos = await enviarDatosPorPost(urlImei, datosImei, token);*/
                  const envioDatos = await peticionesFetchOffline('updateData', 'imei',JSON.stringify(datosImei));

                }


            }
        }
    }
   return respuestaServer;
}

/*********************************************************/
export async function cotizacionNueva(url,data,metodo,token){
const listadoImei = [];
const productos = data.productosArray.map(prods => {
    const impuesto = Number(prods.precio_venta) * (prods.impuestos / 100);
    const producto = {
        "id": prods.id,
        "codigo": prods.codigo,
        "nombre": prods.nombre,
        "categoria": prods.categoria,
        "empaque": prods.empaque,
        "cantidad": prods.cantidad,
        "precio": prods.precio_venta,
        "precio_venta": prods.precio_venta,
        "descuento": prods.descuento,
        "impuesto_venta": prods.impuesto_venta,
        "impuestos": prods.impuestos,
        "precio_final": prods.precio_final,
        "no_compra": prods.no_compra,
        "costo": prods.precio_compra,
        "total": prods.total || prods.precio_final,
        //"impuesto": impuesto,
        "impuesto": prods.impuesto_venta,
        "ganancia": prods.ganancia,
        "ganancia_pura": prods.ganancia_pura,
        "stock": prods.stock,
        "imagen": prods.imagen
    };

    if (prods.categoria === 'CELULARES') {
        producto.lista_imei = prods.lista_imei;
        const imeisList = Array.isArray(prods.lista_imei) ? prods.lista_imei : prods.lista_imei.split(',');
        if(imeisList.length > 0){
        	for(let imei of imeisList){
                 if (imei.trim() !== '') { // Evita agregar valores vacíos
                listadoImei.push({ imei: imei.trim(), precio_venta: prods.precio_venta });
            }
        	}
        }

    }

    return producto;
});

 const camposCotizacion = await arrayToObjetoFromTabla('cotizacion');

var datos = {
'no_cotizacion':data.nofactura,
'cod_cliente':data.cliente.codigo,
'nombre_cliente':data.cliente.nombre,
'telefono_cliente':data.cliente.telefono,
'whatsapp_cliente':data.cliente.telefono,
'email_cliente':data.cliente.email,
'direccion_cliente':data.cliente.direccion,
'rnc_cliente':data.cliente.rnc,
'nombre_comercial':data.cliente.n_comercial,
'productos':JSON.stringify(productos),
'vendedor':data.vendedorFN,
'metodo_pago':data.metodoPagoFN,
'fecha_emision':nfecha('fecha'),
'impuesto':data.impuesto,
'descuento':data.descuento,
'subtotal':data.subtotal,
'total':data.total,
'estado_cotizacion':'PENDIENTE',
'no_factura':'',
'fecha_cambio':'',
'entidad_financiera':data.entidad_financiera,
'vencimiento':data.vencimiento,
'nota':data.nota,
'mes':nfecha('mes'),
'year':nfecha('year'),
'hora':nfecha('hora'),
'usuario':data.vendedorFN,
'almacen':data.almacen,
};

   //return peticiones(url,datos,metodo,token)
   const envio = await peticionesFetchOffline('insertData', 'cotizacion',JSON.stringify(datos));
   if(envio[0] === 'ok'){
    /****************************************************************************/
/*       const camposSubirData = await arrayToObjetoFromTabla('subir_data');
       camposSubirData.tabla = 'cotizacion'
       camposSubirData.accion = 'crear'
       camposSubirData.estado = 'PENDIENTE'
       camposSubirData.data = JSON.stringify(datos)
       const enviarData = await peticionesFetchOffline('insertData', 'subir_data',JSON.stringify(camposSubirData));*/
    /****************************************************************************/
   }
   return envio;
}
/*********************************************************/
/*********************************************************/
export async function restarStock(url, prods, metodo, token) {
    try {

       const productos = await peticionesFetchOffline('getDataAsArray', 'productos');

        for(let prod of prods){
          const cantidadVendida = Number(prod.cantidad)
          const datoProdDB = productos.find(producto=>producto.codigo == prod.codigo)
          if(datoProdDB){
            const stockDb = Number(datoProdDB.stock)
            const nuevoStock = (stockDb - cantidadVendida)
            datoProdDB.stock = nuevoStock.toString()
            await peticionesFetchOffline('updateData', 'productos',JSON.stringify(datoProdDB));
          }
        }
/*        // Convertir `prods` a un string JSON
        const resp = await peticiones(url, { productos: JSON.stringify(prods) }, metodo, token);
        return resp;*/
    } catch (error) {
        console.error("Error al restar stock:", error);
        throw error;
    }
}


/*********************************************************/