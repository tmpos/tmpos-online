<script setup lang="ts">
export interface SubMenuItem {
  label: string
  icon: string
  key: string
}

defineProps<{
  items: SubMenuItem[]
  active: string
}>()

const emit = defineEmits<{
  select: [key: string]
}>()
</script>

<template>
  <div class="submenu-shell">
    <button
      v-for="item in items"
      :key="item.key"
      class="sub-btn"
      :class="active === item.key ? 'sub-btn-active' : 'sub-btn-inactive'"
      @click="emit('select', item.key)"
    >
      <i :class="item.icon" class="text-xl"></i>
      <span>{{ item.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.submenu-shell {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin-bottom: 1.15rem;
  padding: 0.45rem;
  overflow-x: auto;
  overflow-y: hidden;
  border: 1px solid var(--app-border, rgba(203, 213, 225, 0.82));
  border-radius: 0.875rem;
  background: var(--app-surface, rgba(255, 255, 255, 0.9));
  box-shadow: var(--shadow-card, 0 10px 30px -24px rgba(15, 23, 42, 0.45));
  backdrop-filter: blur(14px);
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-x: contain;
}

@media (max-width: 900px) {
  .submenu-shell {
    scrollbar-width: thin;
  }
  .submenu-shell::-webkit-scrollbar {
    display: block;
    height: 4px;
  }
  .submenu-shell::-webkit-scrollbar-track {
    background: transparent;
  }
  .submenu-shell::-webkit-scrollbar-thumb {
    background: var(--p-surface-300);
    border-radius: 4px;
  }
  :global(.dark) .submenu-shell::-webkit-scrollbar-thumb {
    background: var(--p-surface-500);
  }
}

.sub-btn {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  min-width: max-content;
  min-height: 2.65rem;
  gap: 0.5rem;
  padding: 0.55rem 0.8rem;
  font-size: 0.75rem;
  font-weight: 700;
  border-radius: 0.625rem;
  border: 1px solid transparent;
  cursor: pointer;
  transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
  user-select: none;
  text-align: center;
  line-height: 1.15;
  white-space: nowrap;
}

.sub-btn-inactive {
  background: transparent;
  color: var(--p-surface-600);
  border-color: transparent;
}
.sub-btn-inactive:hover {
  background: rgba(248, 250, 252, 0.9);
  color: var(--p-surface-900);
  border-color: var(--app-border-strong, rgba(148, 163, 184, 0.72));
  box-shadow: 0 10px 22px -20px rgba(15, 23, 42, 0.55);
}

:global(.dark) .sub-btn-inactive {
  background: transparent;
  color: var(--p-surface-300);
  border-color: transparent;
}
:global(.dark) .sub-btn-inactive:hover {
  background: rgba(30, 41, 59, 0.86);
  color: var(--p-surface-0);
  border-color: rgba(100, 116, 139, 0.78);
  box-shadow: 0 12px 24px -18px rgba(0, 0, 0, 0.82);
}

.sub-btn-active {
  background: linear-gradient(180deg, var(--p-primary-500), var(--p-primary-600));
  color: var(--p-primary-contrast-color);
  border-color: rgba(255, 255, 255, 0.18);
  box-shadow: 0 14px 24px -18px rgba(79, 70, 229, 0.82);
}
.sub-btn-active:hover {
  background: var(--p-primary-600);
  border-color: var(--p-primary-600);
}

@media (max-width: 640px) {
  .submenu-shell {
    margin-inline: -0.15rem;
    border-radius: 0.75rem;
  }

  .sub-btn {
    padding-inline: 0.68rem;
  }
}
</style>
