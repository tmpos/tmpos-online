import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import projectService, { type Project, type CreateProjectData } from '../services/projectService'

export const useProjectsStore = defineStore('projects', () => {
  const projects = ref<Project[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const activeProjects = computed(() =>
    projects.value.filter(p => p.status === 'active')
  )

  const suspendedProjects = computed(() =>
    projects.value.filter(p => p.status === 'suspended')
  )

  async function fetchProjects(filters?: { status?: string; search?: string }) {
    loading.value = true
    error.value = null

    try {
      projects.value = await projectService.getAll(filters)
    } catch (e: any) {
      error.value = e.message || 'Failed to fetch projects'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function createProject(data: CreateProjectData) {
    loading.value = true
    error.value = null

    try {
      const newProject = await projectService.create(data)
      projects.value.unshift(newProject)
      return newProject
    } catch (e: any) {
      error.value = e.message || 'Failed to create project'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function updateProject(id: number, data: Partial<Project>) {
    loading.value = true
    error.value = null

    try {
      const updated = await projectService.update(id, data)
      const index = projects.value.findIndex(p => p.id === id)
      if (index !== -1) {
        projects.value[index] = updated
      }
      return updated
    } catch (e: any) {
      error.value = e.message || 'Failed to update project'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function deleteProject(id: number) {
    loading.value = true
    error.value = null

    try {
      await projectService.delete(id)
      projects.value = projects.value.filter(p => p.id !== id)
    } catch (e: any) {
      error.value = e.message || 'Failed to delete project'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function restartProject(id: number) {
    try {
      await projectService.restart(id)
    } catch (e: any) {
      error.value = e.message || 'Failed to restart project'
      throw e
    }
  }

  async function suspendProject(id: number) {
    try {
      await projectService.suspend(id)
      const project = projects.value.find(p => p.id === id)
      if (project) {
        project.status = 'suspended'
      }
    } catch (e: any) {
      error.value = e.message || 'Failed to suspend project'
      throw e
    }
  }

  async function activateProject(id: number) {
    try {
      await projectService.activate(id)
      const project = projects.value.find(p => p.id === id)
      if (project) {
        project.status = 'active'
      }
    } catch (e: any) {
      error.value = e.message || 'Failed to activate project'
      throw e
    }
  }

  return {
    projects,
    loading,
    error,
    activeProjects,
    suspendedProjects,
    fetchProjects,
    createProject,
    updateProject,
    deleteProject,
    restartProject,
    suspendProject,
    activateProject
  }
})
