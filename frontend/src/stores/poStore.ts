import { defineStore } from 'pinia';
import { db } from '../db/database';

const API_URL = import.meta.env.VITE_API_URL || '';

export const usePOStore = defineStore('purchaseOrder', {
  state: () => ({
    purchaseOrders: [] as any[],
    currentPO: null as any
  }),

  actions: {
    async fetchPurchaseOrders(filters: any = {}) {
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
          const response = await fetch(`${API_URL}/api/purchase-orders?${queryParams}`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (!response.ok) {
            throw new Error('Failed to fetch purchase orders');
          }

          const purchaseOrders = await response.json();

          // Update local database (upsert)
          for (const po of JSON.parse(JSON.stringify(purchaseOrders))) { await db.purchaseOrders.put(po); }

          this.purchaseOrders = purchaseOrders;
        } else {
          // Fetch from local database
          const purchaseOrders = await db.purchaseOrders.toArray();
          this.purchaseOrders = purchaseOrders;
        }
      } catch (error) {
        console.error('Error fetching purchase orders:', error);
        // Fallback to local database
        const purchaseOrders = await db.purchaseOrders.toArray();
        this.purchaseOrders = purchaseOrders;
      }
    },

    async getPurchaseOrderById(id: string) {
      const { useSyncStore } = await import("./syncStore"); const syncStore = useSyncStore();

      try {
        if (syncStore.isOnline) {
          const token = localStorage.getItem('auth_token');
          const response = await fetch(`${API_URL}/api/purchase-orders/${id}`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (!response.ok) {
            throw new Error('Failed to fetch purchase order');
          }

          const purchaseOrder = await response.json();
          this.currentPO = purchaseOrder;
          return purchaseOrder;
        } else {
          const purchaseOrder = await db.purchaseOrders.get(id);
          this.currentPO = purchaseOrder;
          return purchaseOrder;
        }
      } catch (error) {
        console.error('Error fetching purchase order:', error);
        const purchaseOrder = await db.purchaseOrders.get(id);
        this.currentPO = purchaseOrder;
        return purchaseOrder;
      }
    },

    async createPurchaseOrder(poData: any) {
      try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${API_URL}/api/purchase-orders`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(poData)
        });
        if (!response.ok) { const err = await response.json(); throw new Error(err.error || 'Failed to create PO'); }
        const po = await response.json();
        await this.fetchPurchaseOrders();
        return po;
      } catch (error: any) {
        if (!navigator.onLine) {
          const { useSyncStore } = await import("./syncStore"); const syncStore = useSyncStore();
          const po = { _id: `temp_${Date.now()}`, ...poData, createdAt: new Date().toISOString() };
          await db.purchaseOrders.add(po);
          await syncStore.addToQueue({ operation: 'CREATE', collection: 'purchaseOrders', data: po });
          return po;
        }
        throw error;
      }
    },

    async updatePurchaseOrder(id: string, poData: any) {
      try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${API_URL}/api/purchase-orders/${id}`, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(poData)
        });
        if (!response.ok) { const err = await response.json(); throw new Error(err.error || 'Failed to update PO'); }
        await this.fetchPurchaseOrders();
        return await response.json();
      } catch (error: any) {
        if (!navigator.onLine) {
          const { useSyncStore } = await import("./syncStore"); const syncStore = useSyncStore();
          await db.purchaseOrders.update(id, { ...poData, updatedAt: new Date().toISOString() });
          await syncStore.addToQueue({ operation: 'UPDATE', collection: 'purchaseOrders', data: { ...poData, _id: id } });
          return poData;
        }
        throw error;
      }
    },

    async deletePurchaseOrder(id: string, adminPassword: string) {
      try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${API_URL}/api/purchase-orders/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ adminPassword })
        });
        if (!response.ok) { const err = await response.json(); throw new Error(err.error || 'Failed to delete PO'); }
        await this.fetchPurchaseOrders();
      } catch (error: any) {
        if (!navigator.onLine) {
          const { useSyncStore } = await import("./syncStore"); const syncStore = useSyncStore();
          await db.purchaseOrders.delete(id);
          await syncStore.addToQueue({ operation: 'DELETE', collection: 'purchaseOrders', data: { _id: id, adminPassword } });
        } else { throw error; }
      }
    }
  }
});
