import { initDatabase, dbGetAll, dbGetWhere, dbGetModified, dbGetById, dbInsert, dbUpdate, dbDelete, dbDeleteLocalOnly, dbBitacoraList, dbBitacoraDeleteAll, dbExecuteSQL } from './capacitorDb'
import { handleElectronInvoke, initLicencia } from './capacitorElectron'

export async function initCapacitorApp() {
  console.log('[Capacitor] Inicializando app para Android...')
  applyLegacyJavaScriptPolyfills()
  await initDatabase()

  const db = (window as any).db
  if (!db) {
    const dbApi: any = {
      getAll: (tabla: string) => Promise.resolve(dbGetAll(tabla)),
      getCuadres: (options: { almacenUid?: string; limit?: number; desde?: string; hasta?: string } = {}) => {
        const rows = dbGetAll('cuadres')
        if (!rows.success) return Promise.resolve(rows)
        const filtered = (rows.data || [])
          .filter((row: any) => !options.almacenUid || !row.almacen_uid || String(row.almacen_uid) === options.almacenUid)
          .filter((row: any) => {
            const date = String(row.created_at || row.fecha || '').slice(0, 10)
            return (!options.desde || date >= options.desde) && (!options.hasta || date <= options.hasta)
          })
          .sort((a: any, b: any) => String(b.created_at || b.fecha || '').localeCompare(String(a.created_at || a.fecha || '')))
        return Promise.resolve({ success: true, data: options.limit ? filtered.slice(0, options.limit) : filtered })
      },
      getWhere: (tabla: string, where: string, params: any[] = []) => Promise.resolve(dbGetWhere(tabla, where, params)),
      getModified: (tabla: string, desde: string) => Promise.resolve(dbGetModified(tabla, desde)),
      getById: (tabla: string, id: number) => Promise.resolve(dbGetById(tabla, id)),
      insert: (tabla: string, data: Record<string, any>) => Promise.resolve(dbInsert(tabla, data)),
      update: (tabla: string, id: number, data: Record<string, any>) => Promise.resolve(dbUpdate(tabla, id, data)),
      delete: (tabla: string, id: number) => {
        let usuario = ''
        try { usuario = localStorage.getItem('mr_user_usuario') || '' } catch {}
        return Promise.resolve(dbDelete(tabla, id, usuario))
      },
      deleteLocalOnly: (tabla: string, id: number) => Promise.resolve(dbDeleteLocalOnly(tabla, id)),
      bitacoraList: (limite?: number) => Promise.resolve(dbBitacoraList(limite)),
      bitacoraDeleteAll: () => Promise.resolve(dbBitacoraDeleteAll()),
    }
    ;(window as any).db = dbApi
  }

  if (!(window as any).config) {
    ;(window as any).config = {
      get: (clave: string) => Promise.resolve({ success: true, data: localStorage.getItem(`config_${clave}`) || '' }),
      set: (clave: string, valor: string) => {
        localStorage.setItem(`config_${clave}`, String(valor ?? ''))
        return Promise.resolve({ success: true })
      },
    }
  }

  const electron = (window as any).electron
  if (!electron) {
    ;(window as any).electron = {
      invoke: (channel: string, ...args: any[]) => {
        if (channel === 'consultaservidor' && args[0] === 'executeSQL') {
          return Promise.resolve(dbExecuteSQL(args[1]))
        }
        return handleElectronInvoke(channel, ...args)
      },
      send: () => {},
      on: () => {},
    }
  }

  await initLicencia()

  ;(window as any).__isElectron = false
  ;(window as any).__isCapacitor = true

  solicitarPermisos()

  console.log('[Capacitor] App inicializada correctamente')
}

function applyLegacyJavaScriptPolyfills() {
  if (typeof Object.hasOwn !== 'function') {
    Object.hasOwn = (object: object, property: PropertyKey) =>
      Object.prototype.hasOwnProperty.call(object, property)
  }
}

export function applyAndroidRenderingCompatibility() {
  document.documentElement.classList.add('capacitor-android')

  if (document.getElementById('android-webview-compatibility')) return

  const style = document.createElement('style')
  style.id = 'android-webview-compatibility'
  style.textContent = `
    .capacitor-android *,
    .capacitor-android *::before,
    .capacitor-android *::after {
      animation: none !important;
      filter: none !important;
      -webkit-backdrop-filter: none !important;
      backdrop-filter: none !important;
    }

    .capacitor-android .p-dialog-mask {
      position: fixed !important;
      inset: 0 !important;
      z-index: 1100 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      padding: 1rem !important;
      background: rgba(2, 6, 23, 0.82) !important;
    }

    .capacitor-android .p-dialog {
      display: flex !important;
      flex-direction: column !important;
      max-width: calc(100vw - 2rem) !important;
      max-height: calc(100vh - 2rem) !important;
      overflow: hidden !important;
      color: #f8fafc !important;
      background: #111827 !important;
      border: 1px solid rgba(148, 163, 184, 0.38) !important;
      border-radius: 1rem !important;
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.72) !important;
    }

    .capacitor-android .p-dialog-header {
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      flex: 0 0 auto !important;
      padding: 1rem 1.25rem !important;
      background: #172033 !important;
      border-bottom: 1px solid rgba(148, 163, 184, 0.24) !important;
    }

    .capacitor-android .p-dialog-title {
      color: #f8fafc !important;
      font-size: 1rem !important;
      font-weight: 700 !important;
    }

    .capacitor-android .p-dialog-header-actions {
      display: flex !important;
      align-items: center !important;
      gap: 0.35rem !important;
    }

    .capacitor-android .p-dialog-close-button {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      width: 2rem !important;
      height: 2rem !important;
      color: #cbd5e1 !important;
      background: rgba(255, 255, 255, 0.06) !important;
      border: 1px solid rgba(148, 163, 184, 0.25) !important;
      border-radius: 0.5rem !important;
    }

    .capacitor-android .p-dialog-content,
    .capacitor-android .license-dialog-content {
      flex: 1 1 auto !important;
      min-height: 0 !important;
      overflow: auto !important;
      padding: 1.25rem !important;
      color: #e2e8f0 !important;
      background: #111827 !important;
    }

    .capacitor-android .p-dialog-footer {
      display: flex !important;
      justify-content: flex-end !important;
      align-items: center !important;
      gap: 0.65rem !important;
      flex: 0 0 auto !important;
      padding: 0.9rem 1.25rem !important;
      background: #172033 !important;
      border-top: 1px solid rgba(148, 163, 184, 0.24) !important;
    }

    .capacitor-android .p-button {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 0.5rem !important;
      min-height: 2.5rem !important;
      padding: 0.6rem 1rem !important;
      color: #ffffff !important;
      background: #2563eb !important;
      border: 1px solid #3b82f6 !important;
      border-radius: 0.625rem !important;
      font-weight: 600 !important;
    }

    .capacitor-android .p-button.p-button-text {
      color: #cbd5e1 !important;
      background: transparent !important;
      border-color: rgba(148, 163, 184, 0.3) !important;
    }

    .capacitor-android .p-button.p-button-secondary {
      color: #e2e8f0 !important;
      background: #334155 !important;
      border-color: #475569 !important;
    }

    .capacitor-android .p-button.p-button-danger {
      color: #ffffff !important;
      background: #dc2626 !important;
      border-color: #ef4444 !important;
    }

    .capacitor-android .p-button.p-button-success {
      color: #ffffff !important;
      background: #059669 !important;
      border-color: #10b981 !important;
    }

    .capacitor-android .p-button.p-button-warning {
      color: #111827 !important;
      background: #f59e0b !important;
      border-color: #fbbf24 !important;
    }

    .capacitor-android .p-button.p-button-outlined {
      color: #93c5fd !important;
      background: transparent !important;
      border-color: #3b82f6 !important;
    }

    .capacitor-android .p-button:disabled {
      cursor: not-allowed !important;
      opacity: 0.5 !important;
    }

    .capacitor-android .p-inputtext,
    .capacitor-android .p-textarea {
      width: 100%;
      min-height: 2.6rem !important;
      padding: 0.65rem 0.8rem !important;
      color: #f8fafc !important;
      background: #1f2937 !important;
      border: 1px solid #475569 !important;
      border-radius: 0.625rem !important;
    }

    .capacitor-android .p-inputnumber {
      display: inline-flex !important;
      width: 100% !important;
    }

    .capacitor-android .p-inputnumber-input {
      width: 100% !important;
      min-width: 0 !important;
    }

    .capacitor-android .p-select {
      position: relative !important;
      display: inline-flex !important;
      align-items: center !important;
      width: 100% !important;
      min-height: 2.6rem !important;
      color: #f8fafc !important;
      background: #1f2937 !important;
      border: 1px solid #475569 !important;
      border-radius: 0.625rem !important;
      overflow: hidden !important;
    }

    .capacitor-android .p-select-label {
      display: flex !important;
      align-items: center !important;
      flex: 1 1 auto !important;
      min-width: 0 !important;
      padding: 0.65rem 0.8rem !important;
      color: #f8fafc !important;
      white-space: nowrap !important;
      text-overflow: ellipsis !important;
      overflow: hidden !important;
    }

    .capacitor-android .p-select-dropdown {
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      flex: 0 0 2.5rem !important;
      width: 2.5rem !important;
      color: #cbd5e1 !important;
      align-self: stretch !important;
      border-left: 1px solid #475569 !important;
    }

    .capacitor-android .p-select-overlay,
    .capacitor-android .p-popover,
    .capacitor-android .p-menu {
      position: absolute !important;
      z-index: 1200 !important;
      color: #f8fafc !important;
      background: #1f2937 !important;
      border: 1px solid #475569 !important;
      border-radius: 0.625rem !important;
      box-shadow: 0 18px 46px rgba(0, 0, 0, 0.65) !important;
      overflow: hidden !important;
    }

    .capacitor-android .p-select-header {
      padding: 0.65rem !important;
      background: #172033 !important;
      border-bottom: 1px solid #475569 !important;
    }

    .capacitor-android .p-select-list {
      list-style: none !important;
      margin: 0 !important;
      padding: 0.35rem !important;
    }

    .capacitor-android .p-select-option {
      display: flex !important;
      align-items: center !important;
      min-height: 2.5rem !important;
      padding: 0.55rem 0.75rem !important;
      color: #e2e8f0 !important;
      border-radius: 0.45rem !important;
    }

    .capacitor-android .p-select-option.p-select-option-selected,
    .capacitor-android .p-select-option[aria-selected='true'] {
      color: #ffffff !important;
      background: #2563eb !important;
    }

    .capacitor-android .p-selectbutton {
      display: inline-flex !important;
      align-items: stretch !important;
      padding: 0.2rem !important;
      background: #1f2937 !important;
      border: 1px solid #475569 !important;
      border-radius: 0.625rem !important;
    }

    .capacitor-android .p-selectbutton .p-togglebutton {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      min-height: 2.25rem !important;
      padding: 0.45rem 0.8rem !important;
      color: #cbd5e1 !important;
      background: transparent !important;
      border: 0 !important;
      border-radius: 0.45rem !important;
    }

    .capacitor-android .p-selectbutton .p-togglebutton.p-togglebutton-checked,
    .capacitor-android .p-selectbutton .p-togglebutton[aria-pressed='true'] {
      color: #ffffff !important;
      background: #2563eb !important;
    }

    .capacitor-android .p-datatable {
      width: 100% !important;
      color: #e2e8f0 !important;
      background: #111827 !important;
      border: 1px solid #334155 !important;
      border-radius: 0.75rem !important;
      overflow: hidden !important;
    }

    .capacitor-android .p-datatable-table {
      width: 100% !important;
      border-collapse: collapse !important;
    }

    .capacitor-android .p-datatable-thead > tr > th {
      padding: 0.7rem 0.8rem !important;
      color: #f8fafc !important;
      text-align: left !important;
      background: #1e293b !important;
      border-bottom: 1px solid #475569 !important;
    }

    .capacitor-android .p-datatable-tbody > tr > td {
      padding: 0.65rem 0.8rem !important;
      color: #e2e8f0 !important;
      background: #111827 !important;
      border-bottom: 1px solid #263244 !important;
    }

    .capacitor-android .p-paginator {
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 0.3rem !important;
      padding: 0.65rem !important;
      color: #cbd5e1 !important;
      background: #172033 !important;
      border-top: 1px solid #334155 !important;
    }

    .capacitor-android .p-paginator button {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      min-width: 2rem !important;
      min-height: 2rem !important;
      color: #cbd5e1 !important;
      background: #1f2937 !important;
      border: 1px solid #475569 !important;
      border-radius: 0.45rem !important;
    }
  `
  document.head.appendChild(style)
}

async function solicitarPermisos() {
  if (navigator.mediaDevices?.getUserMedia) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      stream.getTracks().forEach(t => t.stop())
      console.log('[Permisos] Camara concedido')
    } catch {
      console.log('[Permisos] Camara no concedido (se pedira al escanear)')
    }
  }
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().then(r => console.log('[Permisos] Notificaciones:', r))
  }
}
