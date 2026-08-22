import api from './api'

export interface Project {
  id: number
  uuid: string
  name: string
  slug: string
  domain: string
  status: string
  studio_port: number
  kong_port: number
  auth_port: number
  realtime_port: number
  postgres_version: string
  max_connections: number
  max_storage_gb: number
  created_at: string
  updated_at: string
  last_backup_at?: string
  cpu_limit: string
  memory_limit: string
  client_name?: string
  client_email?: string
  client_company?: string
}

export interface CreateProjectData {
  name: string
  slug: string
  domain: string
  postgres_version?: string
  max_connections?: number
  max_storage_gb?: number
  cpu_limit?: string
  memory_limit?: string
  client_name?: string
  client_email?: string
  client_company?: string
}

export interface ProjectResponse {
  success: boolean
  data: Project | Project[]
  message?: string
}

class ProjectService {
  async getAll(filters?: { status?: string; search?: string }): Promise<Project[]> {
    const response = await api.get<ProjectResponse>('/projects', filters)
    return response.data as Project[]
  }

  async getById(id: number): Promise<Project> {
    const response = await api.get<ProjectResponse>(`/projects/${id}`)
    return response.data as Project
  }

  async create(data: CreateProjectData): Promise<Project> {
    const response = await api.post<ProjectResponse>('/projects', data)
    return response.data as Project
  }

  async update(id: number, data: Partial<Project>): Promise<Project> {
    const response = await api.put<ProjectResponse>(`/projects/${id}`, data)
    return response.data as Project
  }

  async delete(id: number): Promise<void> {
    await api.delete(`/projects/${id}`)
  }

  async restart(id: number): Promise<void> {
    await api.post(`/projects/${id}/restart`)
  }

  async suspend(id: number): Promise<void> {
    await api.post(`/projects/${id}/suspend`)
  }

  async activate(id: number): Promise<void> {
    await api.post(`/projects/${id}/activate`)
  }

  async getLogs(id: number, service?: string, lines?: number): Promise<{ logs: string }> {
    const response = await api.get<{ success: boolean; data: { logs: string } }>(
      `/projects/${id}/logs`,
      { service, lines }
    )
    return response.data
  }

  async getStats(id: number): Promise<any> {
    const response = await api.get(`/projects/${id}/stats`)
    return response
  }
}

export default new ProjectService()
