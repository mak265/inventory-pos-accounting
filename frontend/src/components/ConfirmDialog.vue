<template>
  <q-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)" persistent>
    <q-card style="min-width: 400px">
      <q-card-section>
        <div class="text-h6">{{ title }}</div>
      </q-card-section>

      <q-card-section class="q-pt-none">
        <p>{{ message }}</p>

        <q-input
          v-if="requiresAdminPassword"
          v-model="adminPassword"
          label="Admin Password"
          type="password"
          outlined
          dense
          class="q-mt-md"
          :error="!!passwordError"
          :error-message="passwordError"
          @keyup.enter="onConfirm"
          autofocus
        >
          <template v-slot:prepend>
            <q-icon name="lock" />
          </template>
        </q-input>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn
          flat
          label="Cancel"
          color="grey"
          @click="onCancel"
          :disable="loading"
        />
        <q-btn
          flat
          :label="confirmLabel"
          :color="confirmColor"
          @click="onConfirm"
          :loading="loading"
          :disable="requiresAdminPassword && !adminPassword"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

interface Props {
  modelValue: boolean;
  title?: string;
  message?: string;
  confirmLabel?: string;
  confirmColor?: string;
  requiresAdminPassword?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  title: 'Confirm',
  message: 'Are you sure you want to proceed?',
  confirmLabel: 'Confirm',
  confirmColor: 'primary',
  requiresAdminPassword: false,
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  confirm: [adminPassword?: string];
  cancel: [];
}>();

const adminPassword = ref('');
const passwordError = ref('');
const loading = ref(false);

// Reset state when dialog opens/closes
watch(() => props.modelValue, (newVal) => {
  if (newVal) {
    adminPassword.value = '';
    passwordError.value = '';
    loading.value = false;
  }
});

const onConfirm = () => {
  if (props.requiresAdminPassword && !adminPassword.value) {
    passwordError.value = 'Admin password is required';
    return;
  }

  passwordError.value = '';
  loading.value = true;

  if (props.requiresAdminPassword) {
    emit('confirm', adminPassword.value);
  } else {
    emit('confirm');
  }
};

const onCancel = () => {
  emit('cancel');
  emit('update:modelValue', false);
};

/**
 * Call this from the parent to show a password error
 * (e.g., when the server rejects the admin password).
 */
const setPasswordError = (error: string) => {
  passwordError.value = error;
  loading.value = false;
};

/**
 * Call this from the parent to stop the loading state.
 */
const stopLoading = () => {
  loading.value = false;
};

defineExpose({ setPasswordError, stopLoading });
</script>
