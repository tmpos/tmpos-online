/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface DbResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  changes?: number
}

interface DbAPI {
  getAll: (tabla: string) => Promise<DbResponse<any[]>>
  getCuadres: (options?: { almacenUid?: string; limit?: number; desde?: string; hasta?: string }) => Promise<DbResponse<any[]>>
  getById: (tabla: string, id: number) => Promise<DbResponse<any>>
  insert: (tabla: string, data: Record<string, unknown>) => Promise<DbResponse<{ id: number }>>
  update: (tabla: string, id: number, data: Record<string, unknown>) => Promise<DbResponse>
  delete: (tabla: string, id: number) => Promise<DbResponse>
  deleteLocalOnly?: (tabla: string, id: number) => Promise<DbResponse>
}

interface Window {
  Swal?: {
    fire: (options: Record<string, unknown>) => Promise<{ isConfirmed?: boolean; [key: string]: unknown }>
  }
  electron: {
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
    send: (channel: string, ...args: unknown[]) => void
    on: (channel: string, callback: (...args: unknown[]) => void) => void
  }
  electronAPI: {
    send: (channel: string, data?: unknown) => void
    on: (channel: string, callback: (...args: unknown[]) => void) => void
    invoke: (channel: string, data?: unknown) => Promise<unknown>
  }
  db: DbAPI
}
