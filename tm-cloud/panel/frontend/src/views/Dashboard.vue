<template>
  <div class="dashboard">
    <header class="header">
      <div class="container">
        <h1>TM Cloud</h1>
        <p>Supabase PaaS Platform</p>
      </div>
    </header>

    <main class="container">
      <div class="stats-grid">
        <div class="stat-card">
          <i class="pi pi-database"></i>
          <div class="stat-content">
            <h3>{{ projects.length }}</h3>
            <p>Total Projects</p>
          </div>
        </div>

        <div class="stat-card active">
          <i class="pi pi-check-circle"></i>
          <div class="stat-content">
            <h3>{{ activeProjects.length }}</h3>
            <p>Active</p>
          </div>
        </div>

        <div class="stat-card suspended">
          <i class="pi pi-pause-circle"></i>
          <div class="stat-content">
            <h3>{{ suspendedProjects.length }}</h3>
            <p>Suspended</p>
          </div>
        </div>

        <div class="stat-card">
          <i class="pi pi-clock"></i>
          <div class="stat-content">
            <h3>{{ recentBackups }}</h3>
            <p>Recent Backups</p>
          </div>
        </div>
      </div>

      <div class="actions">
        <router-link to="/projects" class="btn btn-primary">
          <i class="pi pi-plus"></i>
          Manage Projects
        </router-link>
      </div>

      <div v-if="loading" class="loading">
        <i class="pi pi-spin pi-spinner"></i>
        Loading...
      </div>

      <div v-else-if="projects.length > 0" class="recent-projects">
        <h2>Recent Projects</h2>
        <div class="project-list">
          <div
            v-for="project in recentProjects"
            :key="project.id"
            class="project-item"
          >
            <div class="project-header">
              <h3>{{ project.name }}</h3>
              <span :class="['status', project.status]">
                {{ project.status }}
              </span>
            </div>
            <p class="project-domain">{{ project.domain }}</p>
            <p class="project-date">
              Created: {{ formatDate(project.created_at) }}
            </p>
          </div>
        </div>
      </div>

      <div v-else class="empty-state">
        <i class="pi pi-inbox"></i>
        <h2>No projects yet</h2>
        <p>Create your first Supabase instance to get started</p>
        <router-link to="/projects" class="btn btn-primary">
          Create Project
        </router-link>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useProjectsStore } from '../stores/projects'

const projectsStore = useProjectsStore()

const projects = computed(() => projectsStore.projects)
const activeProjects = computed(() => projectsStore.activeProjects)
const suspendedProjects = computed(() => projectsStore.suspendedProjects)
const loading = computed(() => projectsStore.loading)

const recentProjects = computed(() =>
  projects.value.slice(0, 5)
)

const recentBackups = ref(0)

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

onMounted(() => {
  projectsStore.fetchProjects()
})
</script>

<style scoped>
.dashboard {
  min-height: 100vh;
}

.header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 3rem 0;
  margin-bottom: 2rem;
}

.header h1 {
  font-size: 2.5rem;
  margin-bottom: 0.5rem;
}

.header p {
  opacity: 0.9;
  font-size: 1.1rem;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 2rem;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
}

.stat-card {
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.stat-card i {
  font-size: 2.5rem;
  color: #667eea;
}

.stat-card.active i {
  color: #10b981;
}

.stat-card.suspended i {
  color: #f59e0b;
}

.stat-content h3 {
  font-size: 2rem;
  margin-bottom: 0.25rem;
}

.stat-content p {
  color: #6b7280;
  font-size: 0.875rem;
}

.actions {
  margin-bottom: 2rem;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  text-decoration: none;
  font-weight: 500;
  transition: all 0.2s;
}

.btn-primary {
  background: #667eea;
  color: white;
}

.btn-primary:hover {
  background: #5568d3;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.loading {
  text-align: center;
  padding: 3rem;
  color: #6b7280;
}

.recent-projects h2 {
  margin-bottom: 1rem;
}

.project-list {
  display: grid;
  gap: 1rem;
}

.project-item {
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.project-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.project-header h3 {
  font-size: 1.25rem;
}

.status {
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
}

.status.active {
  background: #d1fae5;
  color: #065f46;
}

.status.suspended {
  background: #fef3c7;
  color: #92400e;
}

.project-domain {
  color: #667eea;
  font-family: monospace;
  margin-bottom: 0.5rem;
}

.project-date {
  color: #6b7280;
  font-size: 0.875rem;
}

.empty-state {
  text-align: center;
  padding: 4rem 2rem;
}

.empty-state i {
  font-size: 4rem;
  color: #d1d5db;
  margin-bottom: 1rem;
}

.empty-state h2 {
  margin-bottom: 0.5rem;
}

.empty-state p {
  color: #6b7280;
  margin-bottom: 2rem;
}
</style>
