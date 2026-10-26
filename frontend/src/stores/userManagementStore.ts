import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../boot/axios';

export interface User {
  _id: string;
  username: string;
  fullName: string;
  role: string;
  isActive: boolean;
  lastLogin?: string;
  createdAt: string;
}

export const useUserManagementStore = defineStore('userManagement', () => {
  // State
  const users = ref<User[]>([]);
  const loading = ref<boolean>(false);

  // Actions
  async function fetchUsers(search?: string, role?: string) {
    loading.value = true;
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (role) params.role = role;
      const response = await api.get('/users', { params });
      users.value = response.data;
    } finally {
      loading.value = false;
    }
  }

  async function createUser(data: {
    username: string;
    password: string;
    fullName: string;
    role: string;
  }) {
    loading.value = true;
    try {
      const response = await api.post('/users', data);
      users.value.push(response.data);
    } finally {
      loading.value = false;
    }
  }

  async function updateUser(
    id: string,
    data: { fullName?: string; role?: string; isActive?: boolean; password?: string },
  ) {
    loading.value = true;
    try {
      const response = await api.put(`/users/${id}`, data);
      const index = users.value.findIndex((u) => u._id === id);
      if (index !== -1) {
        users.value[index] = response.data;
      }
    } finally {
      loading.value = false;
    }
  }

  async function deleteUser(id: string, adminPassword: string) {
    loading.value = true;
    try {
      await api.delete(`/users/${id}`, { data: { adminPassword } });
      users.value = users.value.filter((u) => u._id !== id);
    } finally {
      loading.value = false;
    }
  }

  return {
    // State
    users,
    loading,

    // Actions
    fetchUsers,
    createUser,
    updateUser,
    deleteUser,
  };
});
