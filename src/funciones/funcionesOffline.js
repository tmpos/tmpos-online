/**************************************************************************/
import bcrypt from 'bcryptjs';
/**************************************************************************/
export async function encryptarPassword(password, saltRounds = 10) {
  return await window.electron.ipcRenderer.invoke("encrypt-password", password, saltRounds);
}

export async function comparePassword(plainPassword, hashedPassword) {
  return await window.electron.ipcRenderer.invoke("compare-password", plainPassword, hashedPassword);
}
/**************************************************************************/
export async function peticionesFetchOffline(peticion,parametros,...datos){
    try {
    const datosRetorno = await window.electron.ipcRenderer.invoke('consultaservidor',peticion,parametros,...datos);
    return datosRetorno
  } catch (error) {
    console.error("Error al enviar datos:", error);
   return error
  }
}
/**************************************************************************/
export async function verificaTablaOffline(tabla){
    try {
    const datos = await window.electron.ipcRenderer.invoke('consultaservidor','tableExists',tabla);
    return datos
  } catch (error) {
    console.error("Error al enviar datos:", error);
   return error
  }
}
/**************************************************************************/
export async function agregarTablaOffline(tabla, campos) {
    try {
    const datos = await window.electron.ipcRenderer.invoke('consultaservidor','crearTabla',tabla,campos.join(','));
    return datos
  } catch (error) {
    console.error("Error al enviar datos:", error);
   return error
  } 
}
/**************************************************************************/
  export async function camposTablaOffline(tabla){
    try {
    const datos = await window.electron.ipcRenderer.invoke('consultaservidor','getTableColumns',tabla);
    return datos
  } catch (error) {
    console.error("Error al enviar datos:", error);
   return error
  }}
/**************************************************************************/
export async function agregarCamposTablaOffline(tabla, campos) {
  let todosExitosos = true; 
  for (let campo of campos) {
    try {
      const datos = await window.electron.ipcRenderer.invoke('consultaservidor', 'addColumnToTable', tabla, campo);
      if (datos[0] !== 'ok') { // Cambia según lo que devuelva tu invocación si falla
        todosExitosos = false;
        console.error(`Error al agregar el campo "${campo}": Respuesta inesperada`, datos);
      }
    } catch (error) {
      console.error(`Error al agregar el campo "${campo}":`, error);
      todosExitosos = false;
    }
  }

  return todosExitosos; 
}
/**************************************************************************/
export async function crearTablaSiNoExisteOffline(tabla, campos = null, toast = null) {
  const datos = await verificaTabla(tabla);
  if (datos[0] === 'ok') {
    const camposT = await camposTabla(tabla); 
    if (campos) {
      const camposFaltantes = campos.filter(campo => !camposT.includes(campo));
      if (camposFaltantes.length > 0) {
        if (toast) {
          toast.add({ severity: 'warn', summary: 'Upps', detail: `Agregando Campos faltantes: ${camposFaltantes.join(', ')} ...`, life: 3000 });
        }
           const agregarCampo = await agregarCamposTabla(tabla,camposFaltantes)
           if(agregarCampo){
             toast.add({ severity: 'success', summary: 'Genial', detail: 'Campos agregados con éxito', life: 3000 });
           }
      } else {
        console.log('Todos los campos están presentes');
      }
    }
  }else{
      const createtable = await agregarTabla(tabla,campos)
      if(createtable.success){
        toast.add({ severity: 'success', summary: 'Genial', detail: 'Tabla creada con éxito', life: 3000 });
      }
  }
  return datos;
}

/**************************************************************************/
export async function arrayToObjetoFromTablaOffline(
  tabla,
  quitarPrimero = true,
) {
  try {
    // Obtener los datos de la tabla
    const array = await peticionesFetchOffline('getTableColumns', `${tabla}`);

    // Quitar el primer elemento si quitarPrimero es verdadero
    if (quitarPrimero) {
      array.shift();
    }

    // Convertir el array en un objeto
    const miObjeto = array.reduce((obj, elemento) => {
      obj[elemento] = "";
      return obj;
    }, {});

    return miObjeto;
  } catch (error) {
    console.error("Error in arrayToObjetoFromTabla:", error);
    if (toast) {
      toast.error(`Error: ${error.message}`);
    }
    throw error; // Rethrow the error after logging it
  }
}

/**************************************************************************/
export function buscadorArrayObjeto(campo,valor,array,retorno = null){
    const datos = array.find(dato=>dato[campo] === valor)
    if(retorno){
      return datos[retorno];
    }else{
      return datos;
    }
}
/**************************************************************************/