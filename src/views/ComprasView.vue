<script setup lang="ts">
import { shallowRef, computed } from 'vue'
import SubMenu from '@/components/SubMenu.vue'
import type { SubMenuItem } from '@/components/SubMenu.vue'
import { useAuthStore } from '@/stores/auth.store'
import OrdenesCompraComp from '@/components/compras/OrdenesCompraComp.vue'

const auth = useAuthStore()

const allItems: SubMenuItem[] = [
  { label: 'Ordenes de Compra', icon: 'pi pi-shopping-cart', key: 'ordenes' },
]

const items = computed(() => allItems.filter(item => auth.tienePermiso(item.key)))

const components: Record<string, any> = {
  ordenes: OrdenesCompraComp,
}

const active = shallowRef('')

function onSelect(key: string) {
  active.value = key
}

active.value = items.value.length > 0 ? items.value[0].key : ''
</script>

<template>
  <div>
    <SubMenu :items="items" :active="active" @select="onSelect" />
    <KeepAlive>
      <component :is="components[active]" />
    </KeepAlive>
  </div>
</template>
