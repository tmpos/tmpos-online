/**
 * Composable para usar la API de Hostinger en componentes Vue
 */

import { ref, computed } from 'vue';
import { hostingerConfig } from '../config/hostinger';

interface VirtualMachine {
  id: number;
  hostname: string;
  state: string;
  plan: string;
  cpus: number;
  memory: number;
  disk: number;
  ipv4: Array<{ address: string }>;
  ipv6: Array<{ address: string }>;
}

interface Domain {
  id: number;
  domain: string;
  type: string;
  status: string;
  expires_at: string | null;
}

interface Subscription {
  id: string;
  name: string;
  status: string;
  total_price: number;
  currency_code: string;
  is_auto_renewed: boolean;
  next_billing_at: string;
  billing_period_unit?: 'month' | 'year' | string;
}

export function useHostinger() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  // Estado de datos
  const virtualMachines = ref<VirtualMachine[]>([]);
  const domains = ref<Domain[]>([]);
  const subscriptions = ref<Subscription[]>([]);

  /**
   * Realiza una petición a la API de Hostinger
   */
  async function request(endpoint: string, options: RequestInit = {}) {
    const url = `${hostingerConfig.baseUrl}${endpoint}`;

    const config: RequestInit = {
      ...options,
      headers: {
        'Authorization': `Bearer ${hostingerConfig.apiToken}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    };

    try {
      const response = await fetch(url, config);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (err: any) {
      error.value = err.message;
      throw err;
    }
  }

  /**
   * Carga todos los VPS
   */
  async function fetchVirtualMachines() {
    loading.value = true;
    error.value = null;
    try {
      virtualMachines.value = await request('/vps/v1/virtual-machines');
      return virtualMachines.value;
    } catch (err) {
      console.error('Error fetching VPS:', err);
      return [];
    } finally {
      loading.value = false;
    }
  }

  /**
   * Obtiene detalles de un VPS específico
   */
  async function getVirtualMachine(vmId: number) {
    loading.value = true;
    error.value = null;
    try {
      const vm = await request(`/vps/v1/virtual-machines/${vmId}`);
      return vm;
    } catch (err) {
      console.error(`Error fetching VM ${vmId}:`, err);
      return null;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Obtiene métricas de un VPS
   */
  async function getVPSMetrics(vmId: number, period: '1h' | '24h' | '7d' | '30d' = '24h') {
    loading.value = true;
    error.value = null;
    try {
      const metrics = await request(`/vps/v1/virtual-machines/${vmId}/metrics?period=${period}`);
      return metrics;
    } catch (err) {
      console.error(`Error fetching metrics for VM ${vmId}:`, err);
      return null;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Controla un VPS (restart, shutdown, start)
   */
  async function controlVPS(vmId: number, action: 'restart' | 'shutdown' | 'start') {
    loading.value = true;
    error.value = null;
    try {
      const result = await request(`/vps/v1/virtual-machines/${vmId}/${action}`, {
        method: 'POST'
      });
      return result;
    } catch (err) {
      console.error(`Error ${action} VM ${vmId}:`, err);
      return null;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Carga todos los dominios
   */
  async function fetchDomains() {
    loading.value = true;
    error.value = null;
    try {
      domains.value = await request('/domains/v1/portfolio');
      return domains.value;
    } catch (err) {
      console.error('Error fetching domains:', err);
      return [];
    } finally {
      loading.value = false;
    }
  }

  /**
   * Obtiene registros DNS de un dominio
   */
  async function getDNSRecords(domain: string) {
    loading.value = true;
    error.value = null;
    try {
      const records = await request(`/dns/v1/zones/${domain}`);
      return records;
    } catch (err) {
      console.error(`Error fetching DNS for ${domain}:`, err);
      return null;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Actualiza registros DNS
   */
  async function updateDNSRecords(domain: string, records: any[]) {
    loading.value = true;
    error.value = null;
    try {
      const result = await request(`/dns/v1/zones/${domain}`, {
        method: 'PUT',
        body: JSON.stringify({ records })
      });
      return result;
    } catch (err) {
      console.error(`Error updating DNS for ${domain}:`, err);
      return null;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Carga todas las subscripciones
   */
  async function fetchSubscriptions() {
    loading.value = true;
    error.value = null;
    try {
      subscriptions.value = await request('/billing/v1/subscriptions');
      return subscriptions.value;
    } catch (err) {
      console.error('Error fetching subscriptions:', err);
      return [];
    } finally {
      loading.value = false;
    }
  }

  /**
   * Carga todos los datos (dashboard completo)
   */
  async function fetchAllData() {
    loading.value = true;
    error.value = null;
    try {
      await Promise.all([
        fetchVirtualMachines(),
        fetchDomains(),
        fetchSubscriptions()
      ]);
    } catch (err) {
      console.error('Error fetching all data:', err);
    } finally {
      loading.value = false;
    }
  }

  // Computed properties
  const hasVPS = computed(() => virtualMachines.value.length > 0);
  const hasDomains = computed(() => domains.value.length > 0);
  const hasSubscriptions = computed(() => subscriptions.value.length > 0);

  const totalMonthlyCost = computed(() => {
    return subscriptions.value.reduce((total, sub) => {
      if (sub.billing_period_unit === 'year') {
        return total + (sub.total_price / 12);
      }
      return total + sub.total_price;
    }, 0) / 100; // Convertir de centavos a dólares
  });

  return {
    // Estado
    loading,
    error,
    virtualMachines,
    domains,
    subscriptions,

    // Computed
    hasVPS,
    hasDomains,
    hasSubscriptions,
    totalMonthlyCost,

    // Métodos
    request,
    fetchVirtualMachines,
    getVirtualMachine,
    getVPSMetrics,
    controlVPS,
    fetchDomains,
    getDNSRecords,
    updateDNSRecords,
    fetchSubscriptions,
    fetchAllData
  };
}
