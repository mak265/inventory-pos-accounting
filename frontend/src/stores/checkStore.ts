import { defineStore } from 'pinia';
import { db, CheckRecord } from '../db/database';

const API_URL = import.meta.env.VITE_API_URL || '';

export const useCheckStore = defineStore('check', {
  state: () => ({
    checkRecords: [] as CheckRecord[],
    availableBanks: [] as string[],
    loading: false
  }),

  actions: {
    async fetchCheckRecords(filters: { status?: string; startDate?: string; endDate?: string } = {}) {
      const { useSyncStore } = await import('./syncStore');
      const syncStore = useSyncStore();
      this.loading = true;

      try {
        if (syncStore.isOnline) {
          const token = localStorage.getItem('auth_token');
          const cleanFilters: Record<string, string> = {};
          for (const [key, value] of Object.entries(filters)) {
            if (value !== null && value !== undefined && value !== '' && value !== 'null') {
              cleanFilters[key] = String(value);
            }
          }
          const queryParams = new URLSearchParams(cleanFilters).toString();
          const response = await fetch(`${API_URL}/api/check-approvals?${queryParams}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (!response.ok) throw new Error('Failed to fetch check records');
          const records = await response.json();

          // Cache to IndexedDB
          await db.checkRecords.clear();
          for (const r of records) {
            await db.checkRecords.put(r);
          }
          this.checkRecords = records;
        } else {
          // Offline: read from IndexedDB
          let records = await db.checkRecords.toArray();
          if (filters.status && filters.status !== 'ALL') {
            records = records.filter(r => r.status === filters.status);
          }
          if (filters.startDate) {
            const sd = new Date(filters.startDate);
            records = records.filter(r => new Date(r.receivedDate) >= sd);
          }
          if (filters.endDate) {
            const ed = new Date(filters.endDate);
            records = records.filter(r => new Date(r.receivedDate) <= ed);
          }
          records.sort((a, b) => new Date(b.receivedDate).getTime() - new Date(a.receivedDate).getTime());
          this.checkRecords = records;
        }
      } catch (error) {
        console.error('Error fetching check records:', error);
        const records = await db.checkRecords.toArray();
        records.sort((a, b) => new Date(b.receivedDate).getTime() - new Date(a.receivedDate).getTime());
        this.checkRecords = records;
      } finally {
        this.loading = false;
      }
    },

    async fetchAvailableBanks() {
      try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${API_URL}/api/check-approvals/banks`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Failed to fetch banks');
        this.availableBanks = await response.json();
      } catch (error) {
        console.error('Error fetching banks:', error);
        this.availableBanks = ['BPI', 'AUB'];
      }
    },

    async approveCheck(id: string, bankAccount: string) {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_URL}/api/check-approvals/${id}/approve`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ bankAccount })
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to approve check');
      }
      return await response.json();
    },

    async bounceCheck(id: string) {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_URL}/api/check-approvals/${id}/bounce`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to bounce check');
      }
      return await response.json();
    }
  }
});
