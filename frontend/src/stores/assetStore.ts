import { defineStore } from 'pinia';
import { db } from '../db/database';

const API_URL = import.meta.env.VITE_API_URL || '';

export const useAssetStore = defineStore('asset', {
  state: () => ({
    assetAccounts: [] as any[]
  }),

  actions: {
    async fetchAssetAccounts() {
      const { useSyncStore } = await import("./syncStore"); const syncStore = useSyncStore();

      try {
        if (syncStore.isOnline) {
          const token = localStorage.getItem('auth_token');
          const response = await fetch(`${API_URL}/api/asset-accounts`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (!response.ok) {
            throw new Error('Failed to fetch asset accounts');
          }

          const accounts = await response.json();

          // Update local database
          await db.assetAccounts.clear();
          for (const account of accounts) {
            await db.assetAccounts.put(account, account.accountType);
          }

          this.assetAccounts = accounts;
          return accounts;
        } else {
          // Fetch from local database
          const accounts = await db.assetAccounts.toArray();
          accounts.sort((a, b) => a.accountType.localeCompare(b.accountType));
          this.assetAccounts = accounts;
          return accounts;
        }
      } catch (error) {
        console.error('Error fetching asset accounts:', error);
        const accounts = await db.assetAccounts.toArray();
        accounts.sort((a, b) => a.accountType.localeCompare(b.accountType));
        this.assetAccounts = accounts;
        return accounts;
      }
    },

    async fetchAssetAccount(accountType: string) {
      const { useSyncStore } = await import("./syncStore"); const syncStore = useSyncStore();

      try {
        if (syncStore.isOnline) {
          const token = localStorage.getItem('auth_token');
          const response = await fetch(`${API_URL}/api/asset-accounts/${accountType}`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (!response.ok) {
            throw new Error('Failed to fetch asset account');
          }

          const account = await response.json();
          
          // Update local database
          await db.assetAccounts.put(account, accountType);

          return account;
        } else {
          // Fetch from local database
          const account = await db.assetAccounts.get(accountType);
          return account;
        }
      } catch (error) {
        console.error('Error fetching asset account:', error);
        const account = await db.assetAccounts.get(accountType);
        return account;
      }
    },

    async fetchAccountTransactions(accountType: string, filters: any = {}) {
      const { useSyncStore } = await import("./syncStore"); const syncStore = useSyncStore();

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
          const response = await fetch(
            `${API_URL}/api/asset-accounts/${accountType}/transactions?${queryParams}`,
            {
              headers: {
                'Authorization': `Bearer ${token}`
              }
            }
          );

          if (!response.ok) {
            throw new Error('Failed to fetch account transactions');
          }

          return await response.json();
        } else {
          // Fetch from local database
          const account = await db.assetAccounts.get(accountType);
          if (!account) return [];

          let transactions = account.transactions || [];

          // Apply filters
          if (filters.startDate) {
            const startDate = new Date(filters.startDate);
            transactions = transactions.filter((t: any) => new Date(t.date) >= startDate);
          }
          if (filters.endDate) {
            const endDate = new Date(filters.endDate);
            transactions = transactions.filter((t: any) => new Date(t.date) <= endDate);
          }

          // Sort by date descending
          transactions.sort((a: any, b: any) => 
            new Date(b.date).getTime() - new Date(a.date).getTime()
          );

          return transactions;
        }
      } catch (error) {
        console.error('Error fetching account transactions:', error);
        const account = await db.assetAccounts.get(accountType);
        if (!account) return [];

        let transactions = account.transactions || [];
        transactions.sort((a: any, b: any) => 
          new Date(b.date).getTime() - new Date(a.date).getTime()
        );

        return transactions;
      }
    },

    async initializeAccounts() {
      const { useSyncStore } = await import("./syncStore"); const syncStore = useSyncStore();

      try {
        if (syncStore.isOnline) {
          const token = localStorage.getItem('auth_token');
          const response = await fetch(`${API_URL}/api/asset-accounts/initialize`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (!response.ok) {
            throw new Error('Failed to initialize asset accounts');
          }

          await this.fetchAssetAccounts();
        } else {
          // Initialize locally
          const accountTypes = ['CASH', 'CHECK', 'GCASH', 'BANK'];
          
          for (const accountType of accountTypes) {
            const exists = await db.assetAccounts.get(accountType);
            if (!exists) {
              await db.assetAccounts.put({
                accountType,
                balance: 0,
                transactions: [],
                updatedAt: new Date().toISOString(),
                syncVersion: 0
              }, accountType);
            }
          }

          await this.fetchAssetAccounts();
        }
      } catch (error) {
        console.error('Error initializing asset accounts:', error);
        throw error;
      }
    }
  }
});
