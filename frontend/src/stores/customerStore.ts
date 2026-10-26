import { defineStore } from 'pinia';
import { db } from '../db/database';

const API_URL = import.meta.env.VITE_API_URL || '';

export const useCustomerStore = defineStore('customer', {
  state: () => ({
    customers: [] as any[],
    currentCustomer: null as any
  }),

  actions: {
    async fetchCustomers(filters: any = {}) {
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
          const response = await fetch(`${API_URL}/api/customers?${queryParams}`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (!response.ok) {
            throw new Error('Failed to fetch customers');
          }

          const customers = await response.json();

          // Update local database (upsert, don't clear - preserves offline items)
          for (const c of JSON.parse(JSON.stringify(customers))) {
            await db.customers.put(c);
          }

          this.customers = customers;
        } else {
          // Fetch from local database
          const customers = await db.customers.toArray();
          // Sort alphabetically by name (case-insensitive)
          customers.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
          this.customers = customers;
        }
      } catch (error) {
        console.error('Error fetching customers:', error);
        // Fallback to local database
        const customers = await db.customers.toArray();
        customers.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
        this.customers = customers;
      }
    },

    async getCustomerById(id: string) {
      const { useSyncStore } = await import("./syncStore"); const syncStore = useSyncStore();

      try {
        if (syncStore.isOnline) {
          const token = localStorage.getItem('auth_token');
          const response = await fetch(`${API_URL}/api/customers/${id}`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (!response.ok) {
            throw new Error('Failed to fetch customer');
          }

          const customer = await response.json();
          this.currentCustomer = customer;
          return customer;
        } else {
          const customer = await db.customers.get(id);
          this.currentCustomer = customer;
          return customer;
        }
      } catch (error) {
        console.error('Error fetching customer:', error);
        const customer = await db.customers.get(id);
        this.currentCustomer = customer;
        return customer;
      }
    },

    async getCustomerHistory(id: string) {
      const { useSyncStore } = await import("./syncStore"); const syncStore = useSyncStore();

      try {
        if (syncStore.isOnline) {
          const token = localStorage.getItem('auth_token');
          const response = await fetch(`${API_URL}/api/customers/${id}/history`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (!response.ok) {
            throw new Error('Failed to fetch customer history');
          }

          return await response.json();
        } else {
          // Fetch from local database
          const customer = await db.customers.get(id);
          // TODO: Fetch sales transactions from local database
          return {
            customer,
            transactions: []
          };
        }
      } catch (error) {
        console.error('Error fetching customer history:', error);
        const customer = await db.customers.get(id);
        return {
          customer,
          transactions: []
        };
      }
    },

    async getCustomerBalance(id: string) {
      const { useSyncStore } = await import("./syncStore"); const syncStore = useSyncStore();

      try {
        if (syncStore.isOnline) {
          const token = localStorage.getItem('auth_token');
          const response = await fetch(`${API_URL}/api/customers/${id}/balance`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (!response.ok) {
            throw new Error('Failed to fetch customer balance');
          }

          return await response.json();
        } else {
          const customer = await db.customers.get(id);
          return {
            customerId: customer?._id,
            customerName: customer?.name,
            balance: customer?.balance || 0
          };
        }
      } catch (error) {
        console.error('Error fetching customer balance:', error);
        const customer = await db.customers.get(id);
        return {
          customerId: customer?._id,
          customerName: customer?.name,
          balance: customer?.balance || 0
        };
      }
    },

    async createCustomer(customerData: any) {
      try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${API_URL}/api/customers`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(customerData)
        });
        if (!response.ok) { const err = await response.json(); throw new Error(err.error || 'Failed to create'); }
        const customer = await response.json();
        await this.fetchCustomers();
        return customer;
      } catch (error: any) {
        if (!navigator.onLine) {
          const { useSyncStore } = await import("./syncStore"); const syncStore = useSyncStore();
          const customer = { _id: `temp_${Date.now()}`, ...customerData, balance: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
          await db.customers.add(customer);
          await syncStore.addToQueue({ operation: 'CREATE', collection: 'customers', data: customer });
          this.customers = [...this.customers, customer];
          return customer;
        }
        throw error;
      }
    },

    async updateCustomer(id: string, customerData: any) {
      try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${API_URL}/api/customers/${id}`, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(customerData)
        });
        if (!response.ok) { const err = await response.json(); throw new Error(err.error || 'Failed to update'); }
        await this.fetchCustomers();
        return await response.json();
      } catch (error: any) {
        if (!navigator.onLine) {
          const { useSyncStore } = await import("./syncStore"); const syncStore = useSyncStore();
          await db.customers.update(id, { ...customerData, updatedAt: new Date().toISOString() });
          await syncStore.addToQueue({ operation: 'UPDATE', collection: 'customers', data: { ...customerData, _id: id } });
          await this.fetchCustomers();
          return customerData;
        }
        throw error;
      }
    },

    async deleteCustomer(id: string, adminPassword: string) {
      try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${API_URL}/api/customers/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ adminPassword })
        });
        if (!response.ok) { const err = await response.json(); throw new Error(err.error || 'Failed to delete'); }
        await this.fetchCustomers();
      } catch (error: any) {
        if (!navigator.onLine) {
          const { useSyncStore } = await import("./syncStore"); const syncStore = useSyncStore();
          await db.customers.delete(id);
          await syncStore.addToQueue({ operation: 'DELETE', collection: 'customers', data: { _id: id, adminPassword } });
          await this.fetchCustomers();
        } else { throw error; }
      }
    }
  }
});
