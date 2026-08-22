import { defineStore } from 'pinia';
import { verificaLocalStorage } from '../funciones/funciones.js';

export const useDatosEmpresa = defineStore('datosEmpresa', {
  state: () => ({
    empresa: {},
    usuario: {},
    datosjson: {},
  }),
  getters: {
    datosEmpresa: (state) => {
      return state.empresa;
    },
    datosUsuario: (state) => {
      return state.usuario;
    },
    datosJSON: (state) => {
      return state.datosjson;
    },
  },
  actions: {
    async inicializarDatosEmpresa(link) {
      //const empresa = await verificaLocalStorage(link, 'empresa', false, 'empresa', 1);
      //this.$patch(empresa);
    },
    setDatosEmpresa(nuevosDatos) {
      this.$patch({ empresa: nuevosDatos });
    },
    setDatosUsuario(nuevosDatosUsuario) {
      this.$patch({ usuario: nuevosDatosUsuario });
    },
    setDatosJSON(nuevosDatosJSON) {
      // Corrección: Cambiar `usuario` a `datosjson`
      this.$patch({ datosjson: nuevosDatosJSON });
    },
    resetStore() {
      this.$reset();
    },
  },
});
