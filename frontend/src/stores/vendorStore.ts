import { defineStore } from 'pinia';
import { db } from '../db/database';

const API_URL = import.meta.env.VITE_API_URL || '';

export const useVendorStore = defineStore('vendor', {
  state: () => ({
    vendors: [] as any[],
    currentVendor: null as any
  }),

  actions: {
    async fetchVendors(filters: any = {}) {
      const { useSyncStore } = await import("./syncStore"); const syncStore = useSyncStore();

      try {
        if (syncStore.isOnline) {
          // Fetch from API
          const token = localStorage.getItem('auth_token');
          const cleanFilters: Record<string, string> = {};
          for (const [key, value] of Object.entries(filters)) {
            if (value !== null && value !== undefined && value !== '' && value !== 'null') {
              cleanFilters[key] = String(value);
            }
          }
          const queryParams = new URLSearchParams(cleanFilters).toString();
          const response = await fetch(`${API_URL}/api/vendors?${queryParams}`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (!response.ok) {
            throw new Error('Failed to fetch vendors');
          }

          const vendors = await response.json();

          // Update local database (upsert, don't clear - preserves offline items)
          for (const v of JSON.parse(JSON.stringify(vendors))) {
            await db.vendors.put(v);
          }

          this.vendors = vendors;
        } else {
          // Fetch from local database
          const vendors = await db.vendors.toArray();
          this.vendors = vendors;
        }
      } catch (error) {
        console.error('Error fetching vendors:', error);
        // Fallback to local database
        const vendors = await db.vendors.toArray();
        this.vendors = vendors;
      }
    },

    async getVendorById(id: string) {
      const { useSyncStore } = await import("./syncStore"); const syncStore = useSyncStore();

      try {
        if (syncStore.isOnline) {
          const token = localStorage.getItem('auth_token');
          const response = await fetch(`${API_URL}/api/vendors/${id}`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (!response.ok) {
            throw new Error('Failed to fetch vendor');
          }

          const vendor = await response.json();
          this.currentVendor = vendor;
          return vendor;
        } else {
          const vendor = await db.vendors.get(id);
          this.currentVendor = vendor;
          return vendor;
        }
      } catch (error) {
        console.error('Error fetching vendor:', error);
        const vendor = await db.vendors.get(id);
        this.currentVendor = vendor;
        return vendor;
      }
    },

    async createVendor(vendorData: any) {
      try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${API_URL}/api/vendors`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(vendorData)
        });
        if (!response.ok) { const err = await response.json(); throw new Error(err.error || 'Failed to create'); }
        const vendor = await response.json();
        await this.fetchVendors();
        return vendor;
      } catch (error: any) {
        if (!navigator.onLine) {
          const { useSyncStore } = await import("./syncStore"); const syncStore = useSyncStore();
          const vendor = { _id: `temp_${Date.now()}`, ...vendorData, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
          await db.vendors.add(vendor);
          await syncStore.addToQueue({ operation: 'CREATE', collection: 'vendors', data: vendor });
          this.vendors = [...this.vendors, vendor];
          return vendor;
        }
        throw error;
      }
    },

    async updateVendor(id: string, vendorData: any) {
      try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${API_URL}/api/vendors/${id}`, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(vendorData)
        });
        if (!response.ok) { const err = await response.json(); throw new Error(err.error || 'Failed to update'); }
        await this.fetchVendors();
        return await response.json();
      } catch (error: any) {
        if (!navigator.onLine) {
          const { useSyncStore } = await import("./syncStore"); const syncStore = useSyncStore();
          await db.vendors.update(id, { ...vendorData, updatedAt: new Date().toISOString() });
          await syncStore.addToQueue({ operation: 'UPDATE', collection: 'vendors', data: { ...vendorData, _id: id } });
          await this.fetchVendors();
          return vendorData;
        }
        throw error;
      }
    },

    async deleteVendor(id: string, adminPassword: string) {
      try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${API_URL}/api/vendors/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ adminPassword })
        });
        if (!response.ok) { const err = await response.json(); throw new Error(err.error || 'Failed to delete'); }
        await this.fetchVendors();
      } catch (error: any) {
        if (!navigator.onLine) {
          const { useSyncStore } = await import("./syncStore"); const syncStore = useSyncStore();
          await db.vendors.delete(id);
          await syncStore.addToQueue({ operation: 'DELETE', collection: 'vendors', data: { _id: id, adminPassword } });
          await this.fetchVendors();
        } else { throw error; }
      }
    }
  }
});
