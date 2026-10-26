import { defineStore } from 'pinia';
import { db } from '../db/database';

const API_URL = import.meta.env.VITE_API_URL || '';

const ensureDeliveryTotal = (dr: any) => {
  if (!dr) return dr;
  if (typeof dr.totalAmount !== 'number' || dr.totalAmount === 0) {
    dr.totalAmount = (dr.lineItems || []).reduce(
      (sum: number, item: any) => sum + ((item.quantityReceived || 0) * (item.netCost || item.unitCost || 0)),
      0
    );
  }
  return dr;
};

export const useDeliveryStore = defineStore('delivery', {
  state: () => ({
    deliveryReceipts: [] as any[],
    currentDelivery: null as any
  }),

  actions: {
    async fetchDeliveryReceipts(filters: any = {}) {
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
          const response = await fetch(`${API_URL}/api/deliveries?${queryParams}`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (!response.ok) {
            throw new Error('Failed to fetch delivery receipts');
          }

          const deliveryReceipts = (await response.json()).map(ensureDeliveryTotal);

          // Update local database (upsert)
          for (const dr of JSON.parse(JSON.stringify(deliveryReceipts))) { await db.deliveries.put(dr); }

          this.deliveryReceipts = deliveryReceipts;
        } else {
          // Fetch from local database
          const deliveryReceipts = await db.deliveries.toArray();
          this.deliveryReceipts = deliveryReceipts;
        }
      } catch (error) {
        console.error('Error fetching delivery receipts:', error);
        // Fallback to local database
        const deliveryReceipts = (await db.deliveries.toArray()).map(ensureDeliveryTotal);
        this.deliveryReceipts = deliveryReceipts;
      }
    },

    async getDeliveryReceiptById(id: string) {
      const { useSyncStore } = await import("./syncStore"); const syncStore = useSyncStore();

      try {
        if (syncStore.isOnline) {
          const token = localStorage.getItem('auth_token');
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 12000);
          const response = await fetch(`${API_URL}/api/deliveries/${id}`, {
            headers: {
              'Authorization': `Bearer ${token}`
            },
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new Error('Failed to fetch delivery receipt');
          }

          const deliveryReceipt = await response.json();
          this.currentDelivery = deliveryReceipt;
          return deliveryReceipt;
        } else {
          const deliveryReceipt = await db.deliveries.get(id);
          this.currentDelivery = deliveryReceipt;
          return deliveryReceipt;
        }
      } catch (error) {
        console.error('Error fetching delivery receipt:', error);
        const deliveryReceipt = ensureDeliveryTotal(await db.deliveries.get(id));
        this.currentDelivery = deliveryReceipt;
        return deliveryReceipt;
      }
    },

    async createDeliveryReceipt(drData: any) {
      try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${API_URL}/api/deliveries`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(drData)
        });
        if (!response.ok) { const err = await response.json(); throw new Error(err.error || 'Failed to create delivery'); }
        const dr = await response.json();
        await this.fetchDeliveryReceipts();
        return dr;
      } catch (error: any) {
        if (!navigator.onLine) {
          const { useSyncStore } = await import("./syncStore"); const syncStore = useSyncStore();
          const dr = { _id: `temp_${Date.now()}`, ...drData, status: 'PENDING', createdAt: new Date().toISOString() };
          await db.deliveries.add(dr);
          await syncStore.addToQueue({ operation: 'CREATE', collection: 'deliveryReceipts', data: dr });
          return dr;
        }
        throw error;
      }
    },

    async updateDeliveryReceipt(id: string, drData: any) {
      try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${API_URL}/api/deliveries/${id}`, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(drData)
        });
        if (!response.ok) { const err = await response.json(); throw new Error(err.error || 'Failed to update delivery'); }
        await this.fetchDeliveryReceipts();
        return await response.json();
      } catch (error: any) {
        if (!navigator.onLine) {
          const { useSyncStore } = await import("./syncStore"); const syncStore = useSyncStore();
          await db.deliveries.update(id, drData);
          await syncStore.addToQueue({ operation: 'UPDATE', collection: 'deliveryReceipts', data: { ...drData, _id: id } });
          return drData;
        }
        throw error;
      }
    },

    async postDeliveryReceipt(id: string) {
      const { useSyncStore } = await import("./syncStore"); const syncStore = useSyncStore();

      try {
        if (syncStore.isOnline) {
          const token = localStorage.getItem('auth_token');
          const response = await fetch(`${API_URL}/api/deliveries/${id}/post`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });

          if (!response.ok) {
            throw new Error('Failed to post delivery receipt');
          }

          const postedDelivery = await response.json();

          // Update local database
          await db.deliveries.update(id, postedDelivery);

          await this.fetchDeliveryReceipts();
          return postedDelivery;
        } else {
          // Queue for posting when online
          await syncStore.addToQueue({
            operation: 'POST_DELIVERY',
            collection: 'deliveryReceipts',
            data: { _id: id }
          });

          // Update local status optimistically
          await db.deliveries.update(id, {
            status: 'POSTED',
            postedAt: new Date().toISOString()
          });

          await this.fetchDeliveryReceipts();
        }
      } catch (error) {
        console.error('Error posting delivery receipt:', error);
        throw error;
      }
    },

    async deleteDeliveryReceipt(id: string, adminPassword: string) {
      try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${API_URL}/api/deliveries/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ adminPassword })
        });
        if (!response.ok) { const err = await response.json(); throw new Error(err.error || 'Failed to delete delivery'); }
        await this.fetchDeliveryReceipts();
      } catch (error: any) {
        if (!navigator.onLine) {
          const { useSyncStore } = await import("./syncStore"); const syncStore = useSyncStore();
          await db.deliveries.delete(id);
          await syncStore.addToQueue({ operation: 'DELETE', collection: 'deliveryReceipts', data: { _id: id, adminPassword } });
        } else { throw error; }
      }
    }
  }
});
