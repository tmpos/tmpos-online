import { defineStore } from 'pinia';
import router from '@/router';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
  }),
  actions: {
    login(user) {
      this.user = user;
    },
    logout() {
      this.user = null;
      router.push({ name: 'login' });
    },
  },
  getters: {
    isAuthenticated: (state) => !!state.user,
  },
});
