<template>
  <q-item
    clickable
    :to="isInternalLink ? props.link : undefined"
    :href="!isInternalLink ? props.link : undefined"
    :target="!isInternalLink ? '_blank' : undefined"
    :active-class="'q-router-link--active'"
    :exact="props.link === '/'"
  >
    <q-item-section v-if="props.icon" avatar>
      <q-icon :name="props.icon" />
    </q-item-section>

    <q-item-section>
      <q-item-label style="font-size: 0.85rem; font-weight: 500">{{ props.title }}</q-item-label>
    </q-item-section>
  </q-item>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  title: { type: String, required: true },
  caption: { type: String, default: '' },
  link: { type: String, default: '#' },
  icon: { type: String, default: '' },
})

const isInternalLink = computed(() => props.link.startsWith('/'))
</script>
