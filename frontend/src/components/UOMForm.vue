<template>
  <q-card style="min-width: 400px">
    <q-card-section>
      <div class="text-h6">{{ isEdit ? 'Edit UOM' : 'Add UOM' }}</div>
    </q-card-section>

    <q-card-section>
      <q-form @submit="onSubmit" class="q-gutter-md">
        <q-input
          v-model="form.name"
          label="Name *"
          outlined
          dense
          :rules="[val => !!val || 'Name is required']"
        />

        <q-input
          v-model="form.abbreviation"
          label="Abbreviation *"
          outlined
          dense
          :rules="[
            val => !!val || 'Abbreviation is required',
            val => /^[a-z0-9]+$/.test(val) || 'Lowercase letters and numbers only'
          ]"
          hint="e.g. kg, pcs, ltr"
        />
      </q-form>
    </q-card-section>

    <q-card-actions align="right">
      <q-btn flat label="Cancel" color="primary" @click="$emit('cancel')" />
      <q-btn label="Save" color="primary" @click="onSubmit" />
    </q-card-actions>
  </q-card>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';

interface Props {
  uom?: any;
}

const props = defineProps<Props>();
const emit = defineEmits(['save', 'cancel']);

const form = ref({
  name: '',
  abbreviation: ''
});

const isEdit = computed(() => !!props.uom);

const resetForm = () => {
  form.value = {
    name: '',
    abbreviation: ''
  };
};

watch(() => props.uom, (newUom) => {
  if (newUom) {
    form.value = {
      name: newUom.name || '',
      abbreviation: newUom.abbreviation || ''
    };
  } else {
    resetForm();
  }
}, { immediate: true });

const onSubmit = () => {
  if (!form.value.name || !form.value.abbreviation) {
    return;
  }

  emit('save', {
    name: form.value.name,
    abbreviation: form.value.abbreviation.trim().toLowerCase()
  });
};
</script>
