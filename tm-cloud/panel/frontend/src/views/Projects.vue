<template>
  <div class="projects-page">
    <header class="header">
      <div class="container">
        <div class="header-content">
          <div>
            <h1>Projects</h1>
            <p>Manage your Supabase instances</p>
          </div>
          <button @click="showCreateModal = true" class="btn btn-primary">
            <i class="pi pi-plus"></i>
            New Project
          </button>
        </div>
      </div>
    </header>

    <main class="container">
      <div class="filters">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search projects..."
          class="search-input"
        >
        <select v-model="statusFilter" class="status-filter">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      <div v-if="loading" class="loading">
        <i class="pi pi-spin pi-spinner"></i>
        Loading projects...
      </div>

      <div v-else-if="filteredProjects.length > 0" class="projects-grid">
        <div
          v-for="project in filteredProjects"
          :key="project.id"
          class="project-card"
        >
          <div class="card-header">
            <div>
              <h3>{{ project.name }}</h3>
              <p class="slug">{{ project.slug }}</p>
            </div>
            <span :class="['status-badge', project.status]">
              {{ project.status }}
            </span>
          </div>

          <div class="card-body">
            <div class="info-row">
              <i class="pi pi-globe"></i>
              <a :href="`https://${project.domain}`" target="_blank">
                {{ project.domain }}
              </a>
            </div>

            <div class="info-row">
              <i class="pi pi-calendar"></i>
              <span>Created {{ formatDate(project.created_at) }}</span>
            </div>

            <div class="info-row">
              <i class="pi pi-database"></i>
              <span>PostgreSQL {{ project.postgres_version }}</span>
            </div>
          </div>

          <div class="card-actions">
            <button
              @click="openStudio(project)"
              class="btn btn-sm btn-secondary"
              title="Open Studio"
            >
              <i class="pi pi-external-link"></i>
              Studio
            </button>

            <button
              v-if="project.status === 'active'"
              @click="handleRestart(project.id)"
              class="btn btn-sm btn-secondary"
              title="Restart"
            >
              <i class="pi pi-refresh"></i>
            </button>

            <button
              v-if="project.status === 'active'"
              @click="handleSuspend(project.id)"
              class="btn btn-sm btn-warning"
              title="Suspend"
            >
              <i class="pi pi-pause"></i>
            </button>

            <button
              v-if="project.status === 'suspended'"
              @click="handleActivate(project.id)"
              class="btn btn-sm btn-success"
              title="Activate"
            >
              <i class="pi pi-play"></i>
            </button>

            <button
              @click="handleDelete(project)"
              class="btn btn-sm btn-danger"
              title="Delete"
            >
              <i class="pi pi-trash"></i>
            </button>
          </div>
        </div>
      </div>

      <div v-else class="empty-state">
        <i class="pi pi-inbox"></i>
        <h2>No projects found</h2>
        <p>Create your first Supabase instance</p>
        <button @click="showCreateModal = true" class="btn btn-primary">
          <i class="pi pi-plus"></i>
          Create Project
        </button>
      </div>
    </main>

    <!-- Create Project Modal -->
    <div v-if="showCreateModal" class="modal-overlay" @click.self="showCreateModal = false">
      <div class="modal">
        <div class="modal-header">
          <h2>Create New Project</h2>
          <button @click="showCreateModal = false" class="close-btn">
            <i class="pi pi-times"></i>
          </button>
        </div>

        <div class="modal-body">
          <div class="form-group">
            <label>Project Name *</label>
            <input
              v-model="newProject.name"
              type="text"
              placeholder="My Awesome Project"
              class="form-input"
            >
          </div>

          <div class="form-group">
            <label>Slug *</label>
            <input
              v-model="newProject.slug"
              type="text"
              placeholder="my-awesome-project"
              class="form-input"
            >
            <small>Lowercase, alphanumeric, dashes only</small>
          </div>

          <div class="form-group">
            <label>Domain *</label>
            <input
              v-model="newProject.domain"
              type="text"
              placeholder="myproject.tmcloud.com"
              class="form-input"
            >
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>PostgreSQL Version</label>
              <select v-model="newProject.postgres_version" class="form-input">
                <option value="15">15 (Latest)</option>
                <option value="14">14</option>
                <option value="13">13</option>
              </select>
            </div>

            <div class="form-group">
              <label>Max Connections</label>
              <input
                v-model.number="newProject.max_connections"
                type="number"
                class="form-input"
              >
            </div>
          </div>

          <div class="form-group">
            <label>Client Name</label>
            <input
              v-model="newProject.client_name"
              type="text"
              placeholder="John Doe"
              class="form-input"
            >
          </div>

          <div class="form-group">
            <label>Client Email</label>
            <input
              v-model="newProject.client_email"
              type="email"
              placeholder="john@example.com"
              class="form-input"
            >
          </div>
        </div>

        <div class="modal-footer">
          <button @click="showCreateModal = false" class="btn btn-secondary">
            Cancel
          </button>
          <button @click="createProject" class="btn btn-primary" :disabled="creating">
            <i v-if="creating" class="pi pi-spin pi-spinner"></i>
            <i v-else class="pi pi-check"></i>
            {{ creating ? 'Creating...' : 'Create Project' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useProjectsStore } from '../stores/projects'
import type { CreateProjectData } from '../services/projectService'

const projectsStore = useProjectsStore()

const projects = computed(() => projectsStore.projects)
const loading = computed(() => projectsStore.loading)

const searchQuery = ref('')
const statusFilter = ref('')
const showCreateModal = ref(false)
const creating = ref(false)

const newProject = ref<CreateProjectData>({
  name: '',
  slug: '',
  domain: '',
  postgres_version: '15',
  max_connections: 100,
  max_storage_gb: 10,
  client_name: '',
  client_email: ''
})

const filteredProjects = computed(() => {
  let filtered = projects.value

  if (statusFilter.value) {
    filtered = filtered.filter(p => p.status === statusFilter.value)
  }

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    filtered = filtered.filter(p =>
      p.name.toLowerCase().includes(query) ||
      p.slug.toLowerCase().includes(query) ||
      p.domain.toLowerCase().includes(query)
    )
  }

  return filtered
})

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

function openStudio(project: any) {
  window.open(`https://${project.domain}/studio`, '_blank')
}

async function createProject() {
  if (!newProject.value.name || !newProject.value.slug || !newProject.value.domain) {
    alert('Please fill in all required fields')
    return
  }

  creating.value = true

  try {
    await projectsStore.createProject(newProject.value)
    showCreateModal.value = false
    resetForm()
    alert('Project created successfully!')
  } catch (error: any) {
    alert('Failed to create project: ' + error.message)
  } finally {
    creating.value = false
  }
}

function resetForm() {
  newProject.value = {
    name: '',
    slug: '',
    domain: '',
    postgres_version: '15',
    max_connections: 100,
    max_storage_gb: 10,
    client_name: '',
    client_email: ''
  }
}

async function handleRestart(id: number) {
  if (confirm('Restart this project?')) {
    try {
      await projectsStore.restartProject(id)
      alert('Project restarted successfully')
    } catch (error: any) {
      alert('Failed to restart: ' + error.message)
    }
  }
}

async function handleSuspend(id: number) {
  if (confirm('Suspend this project? It will stop all containers.')) {
    try {
      await projectsStore.suspendProject(id)
      alert('Project suspended')
    } catch (error: any) {
      alert('Failed to suspend: ' + error.message)
    }
  }
}

async function handleActivate(id: number) {
  if (confirm('Activate this project?')) {
    try {
      await projectsStore.activateProject(id)
      alert('Project activated')
    } catch (error: any) {
      alert('Failed to activate: ' + error.message)
    }
  }
}

async function handleDelete(project: any) {
  if (confirm(`Delete project "${project.name}"? This action cannot be undone.`)) {
    try {
      await projectsStore.deleteProject(project.id)
      alert('Project deleted successfully')
    } catch (error: any) {
      alert('Failed to delete: ' + error.message)
    }
  }
}

onMounted(() => {
  projectsStore.fetchProjects()
})
</script>

<style scoped>
.projects-page {
  min-height: 100vh;
}

.header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 2rem 0;
  margin-bottom: 2rem;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header h1 {
  font-size: 2rem;
  margin-bottom: 0.25rem;
}

.container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 2rem;
}

.filters {
  display: flex;
  gap: 1rem;
  margin-bottom: 2rem;
}

.search-input,
.status-filter {
  padding: 0.75rem 1rem;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 0.875rem;
}

.search-input {
  flex: 1;
}

.status-filter {
  min-width: 150px;
}

.projects-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 1.5rem;
}

.project-card {
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  transition: transform 0.2s, box-shadow 0.2s;
}

.project-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.15);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #e5e7eb;
}

.card-header h3 {
  font-size: 1.25rem;
  margin-bottom: 0.25rem;
}

.slug {
  font-size: 0.875rem;
  color: #6b7280;
  font-family: monospace;
}

.status-badge {
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
}

.status-badge.active {
  background: #d1fae5;
  color: #065f46;
}

.status-badge.suspended {
  background: #fef3c7;
  color: #92400e;
}

.card-body {
  margin-bottom: 1rem;
}

.info-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  font-size: 0.875rem;
  color: #4b5563;
}

.info-row i {
  color: #667eea;
}

.info-row a {
  color: #667eea;
  text-decoration: none;
}

.info-row a:hover {
  text-decoration: underline;
}

.card-actions {
  display: flex;
  gap: 0.5rem;
  padding-top: 1rem;
  border-top: 1px solid #e5e7eb;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 8px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-sm {
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
}

.btn-primary {
  background: #667eea;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #5568d3;
}

.btn-secondary {
  background: #e5e7eb;
  color: #374151;
}

.btn-secondary:hover {
  background: #d1d5db;
}

.btn-warning {
  background: #fbbf24;
  color: white;
}

.btn-success {
  background: #10b981;
  color: white;
}

.btn-danger {
  background: #ef4444;
  color: white;
}

.loading,
.empty-state {
  text-align: center;
  padding: 4rem 2rem;
}

.loading i,
.empty-state i {
  font-size: 3rem;
  color: #d1d5db;
  margin-bottom: 1rem;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: white;
  border-radius: 12px;
  max-width: 600px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  border-bottom: 1px solid #e5e7eb;
}

.modal-header h2 {
  font-size: 1.5rem;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #6b7280;
}

.modal-body {
  padding: 1.5rem;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1.5rem;
  border-top: 1px solid #e5e7eb;
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: #374151;
}

.form-group small {
  display: block;
  margin-top: 0.25rem;
  color: #6b7280;
  font-size: 0.75rem;
}

.form-input {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 0.875rem;
}

.form-input:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}
</style>
