/**
 * Configuración de Hostinger API
 * Las variables se cargan desde .env
 */

export const hostingerConfig = {
  // API Token - requerido
  apiToken: import.meta.env.VITE_HOSTINGER_API_TOKEN || '',

  // Base URL de la API
  baseUrl: import.meta.env.VITE_HOSTINGER_API_BASE_URL || 'https://developers.hostinger.com/api',

  // ID del VPS principal (opcional, para acceso rápido)
  vpsId: import.meta.env.VITE_HOSTINGER_VPS_ID ? parseInt(import.meta.env.VITE_HOSTINGER_VPS_ID) : null,

  // Dominio principal (opcional)
  domain: import.meta.env.VITE_HOSTINGER_DOMAIN || '',
};

/**
 * Valida que la configuración esté completa
 */
export function validateHostingerConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!hostingerConfig.apiToken) {
    errors.push('VITE_HOSTINGER_API_TOKEN no está configurado en .env');
  }

  if (!hostingerConfig.baseUrl) {
    errors.push('VITE_HOSTINGER_API_BASE_URL no está configurado en .env');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// Validar al importar (solo en desarrollo)
if (import.meta.env.DEV) {
  const validation = validateHostingerConfig();
  if (!validation.valid) {
    console.warn('⚠️ Configuración de Hostinger incompleta:');
    validation.errors.forEach(error => console.warn(`  • ${error}`));
  }
}

export default hostingerConfig;
