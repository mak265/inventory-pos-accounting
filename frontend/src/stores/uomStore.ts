import { defineStore } from 'pinia';
import { ref } from 'vue';
import { db, type UOM } from '../db/database';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('auth_token')}` });

export const useUomStore = defineStore('uom', () => {
  const uoms = ref<UOM[]>([]);
  const loading = ref(false);

  const fetchUoms = async () => {
    loading.value = true;
    try {
      const response = await axios.get(`${API_URL}/api/uoms`, { headers: authHeaders() });
      const serverUoms = response.data.filter((u: UOM) => !u.isDeleted);
      // Cache to IndexedDB for offline use (upsert, preserves offline items)
      try { for (const u of JSON.parse(JSON.stringify(response.data))) { await db.uoms.put(u); } } catch { /* silent */ }
      uoms.value = serverUoms;
      return serverUoms;
    } catch (error) {
      console.error('Error fetching UOMs:', error);
      const localUoms = await db.uoms.filter((u) => !u.isDeleted).toArray();
      uoms.value = localUoms;
      return localUoms;
    } finally {
      loading.value = false;
    }
  };

  const createUom = async (data: Omit<UOM, '_id'>) => {
    try {
      const response = await axios.post(`${API_URL}/api/uoms`, data, { headers: authHeaders() });
      return response.data;
    } catch (error: any) {
      // Offline fallback
      if (!error.response) {
        const { useSyncStore } = await import('./syncStore');
        const syncStore = useSyncStore();
        const newUom: UOM = { ...data, _id: uuidv4(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), syncVersion: 0, isDeleted: false };
        await db.uoms.add(newUom);
        await syncStore.addToQueue({ operation: 'CREATE', collection: 'uoms', data: newUom });
        return newUom;
      }
      throw error;
    }
  };

  const updateUom = async (id: string, updates: Partial<UOM>) => {
    try {
      const response = await axios.put(`${API_URL}/api/uoms/${id}`, updates, { headers: authHeaders() });
      return response.data;
    } catch (error: any) {
      if (!error.response) {
        const { useSyncStore } = await import('./syncStore');
        const syncStore = useSyncStore();
        const uom = await db.uoms.get(id);
        if (!uom) throw new Error('UOM not found');
        const updatedUom = { ...uom, ...updates, updatedAt: new Date().toISOString(), syncVersion: (uom.syncVersion || 0) + 1 };
        await db.uoms.put(updatedUom);
        await syncStore.addToQueue({ operation: 'UPDATE', collection: 'uoms', data: updatedUom });
        return updatedUom;
      }
      throw error;
    }
  };

  const deleteUom = async (id: string, adminPassword: string) => {
    try {
      const response = await axios.delete(`${API_URL}/api/uoms/${id}`, {
        headers: authHeaders(),
        data: { adminPassword }
      });
      return response.data;
    } catch (error: any) {
      if (!error.response) {
        const { useSyncStore } = await import('./syncStore');
        const syncStore = useSyncStore();
        const uom = await db.uoms.get(id);
        if (!uom) throw new Error('UOM not found');
        const deletedUom = { ...uom, isDeleted: true, updatedAt: new Date().toISOString() };
        await db.uoms.put(deletedUom);
        await syncStore.addToQueue({ operation: 'DELETE', collection: 'uoms', data: { ...deletedUom, adminPassword } });
        return deletedUom;
      }
      throw error;
    }
  };

  return { uoms, loading, fetchUoms, createUom, updateUom, deleteUom };
});
