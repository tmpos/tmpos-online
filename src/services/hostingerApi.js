/**
 * Cliente para la API de Hostinger
 * Documentación oficial: https://developers.hostinger.com
 */

import { hostingerConfig } from '../config/hostinger.ts';

class HostingerAPI {
  constructor(token = hostingerConfig.apiToken, baseUrl = hostingerConfig.baseUrl) {
    this.token = token;
    this.baseUrl = baseUrl;

    if (!this.token) {
      console.warn('⚠️ Hostinger API Token no configurado. Por favor configura VITE_HOSTINGER_API_TOKEN en .env');
    }
  }

  /**
   * Realiza una petición a la API de Hostinger
   * @param {string} endpoint - El endpoint sin el baseUrl (ej: '/vps/v1/virtual-machines')
   * @param {object} options - Opciones de fetch adicionales
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;

    const config = {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    };

    try {
      const response = await fetch(url, config);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Error en petición a ${endpoint}:`, error);
      throw error;
    }
  }

  // ============================================
  // VPS ENDPOINTS
  // ============================================

  /**
   * Lista todos los servidores VPS
   */
  async getVirtualMachines() {
    return this.request('/vps/v1/virtual-machines');
  }

  /**
   * Obtiene detalles de un VPS específico
   * @param {number} vmId - ID del VPS
   */
  async getVirtualMachine(vmId) {
    return this.request(`/vps/v1/virtual-machines/${vmId}`);
  }

  /**
   * Obtiene métricas de rendimiento de un VPS
   * @param {number} vmId - ID del VPS
   * @param {string} period - Periodo ('1h', '24h', '7d', '30d')
   */
  async getVPSMetrics(vmId, period = '24h') {
    return this.request(`/vps/v1/virtual-machines/${vmId}/metrics?period=${period}`);
  }

  /**
   * Reinicia un VPS
   * @param {number} vmId - ID del VPS
   */
  async restartVPS(vmId) {
    return this.request(`/vps/v1/virtual-machines/${vmId}/restart`, {
      method: 'POST'
    });
  }

  /**
   * Apaga un VPS
   * @param {number} vmId - ID del VPS
   */
  async shutdownVPS(vmId) {
    return this.request(`/vps/v1/virtual-machines/${vmId}/shutdown`, {
      method: 'POST'
    });
  }

  /**
   * Enciende un VPS
   * @param {number} vmId - ID del VPS
   */
  async startVPS(vmId) {
    return this.request(`/vps/v1/virtual-machines/${vmId}/start`, {
      method: 'POST'
    });
  }

  // ============================================
  // DOMINIOS ENDPOINTS
  // ============================================

  /**
   * Lista todos los dominios en el portfolio
   */
  async getDomains() {
    return this.request('/domains/v1/portfolio');
  }

  /**
   * Obtiene información de un dominio específico
   * @param {string} domain - Nombre del dominio
   */
  async getDomain(domain) {
    return this.request(`/domains/v1/portfolio/${domain}`);
  }

  /**
   * Verifica disponibilidad de un dominio
   * @param {string} domain - Nombre del dominio a verificar
   */
  async checkDomainAvailability(domain) {
    return this.request('/domains/v1/availability', {
      method: 'POST',
      body: JSON.stringify({ domain })
    });
  }

  // ============================================
  // DNS ENDPOINTS
  // ============================================

  /**
   * Obtiene los registros DNS de un dominio
   * @param {string} domain - Nombre del dominio
   */
  async getDNSRecords(domain) {
    return this.request(`/dns/v1/zones/${domain}`);
  }

  /**
   * Actualiza los registros DNS de un dominio
   * @param {string} domain - Nombre del dominio
   * @param {Array} records - Array de registros DNS
   */
  async updateDNSRecords(domain, records) {
    return this.request(`/dns/v1/zones/${domain}`, {
      method: 'PUT',
      body: JSON.stringify({ records })
    });
  }

  /**
   * Crea un snapshot de la zona DNS
   * @param {string} domain - Nombre del dominio
   * @param {string} name - Nombre del snapshot
   */
  async createDNSSnapshot(domain, name) {
    return this.request(`/dns/v1/snapshots/${domain}`, {
      method: 'POST',
      body: JSON.stringify({ name })
    });
  }

  /**
   * Lista snapshots DNS de un dominio
   * @param {string} domain - Nombre del dominio
   */
  async getDNSSnapshots(domain) {
    return this.request(`/dns/v1/snapshots/${domain}`);
  }

  // ============================================
  // BILLING ENDPOINTS
  // ============================================

  /**
   * Lista todas las subscripciones
   */
  async getSubscriptions() {
    return this.request('/billing/v1/subscriptions');
  }

  /**
   * Lista métodos de pago
   */
  async getPaymentMethods() {
    return this.request('/billing/v1/payment-methods');
  }

  /**
   * Habilita la renovación automática de una subscripción
   * @param {string} subscriptionId - ID de la subscripción
   */
  async enableAutoRenewal(subscriptionId) {
    return this.request(`/billing/v1/subscriptions/${subscriptionId}/auto-renewal/enable`, {
      method: 'POST'
    });
  }

  /**
   * Deshabilita la renovación automática de una subscripción
   * @param {string} subscriptionId - ID de la subscripción
   */
  async disableAutoRenewal(subscriptionId) {
    return this.request(`/billing/v1/subscriptions/${subscriptionId}/auto-renewal/disable`, {
      method: 'POST'
    });
  }

  /**
   * Obtiene el catálogo de productos disponibles
   */
  async getCatalog() {
    return this.request('/billing/v1/catalog');
  }
}

// Exportar una instancia por defecto
export const hostingerApi = new HostingerAPI();

// Exportar la clase para crear instancias personalizadas
export default HostingerAPI;
