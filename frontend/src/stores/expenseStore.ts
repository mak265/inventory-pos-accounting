import { defineStore } from 'pinia';
import { db } from '../db/database';

const API_URL = import.meta.env.VITE_API_URL || '';

export const useExpenseStore = defineStore('expense', {
  state: () => ({
    expenses: [] as any[],
    pettyCashStatus: null as any
  }),

  actions: {
    async fetchExpenses(filters: any = {}) {
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
          const response = await fetch(`${API_URL}/api/expenses?${queryParams}`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (!response.ok) {
            throw new Error('Failed to fetch expenses');
          }

          const expenses = await response.json();

          // Update local database (upsert)
          for (const e of JSON.parse(JSON.stringify(expenses))) { await db.expenses.put(e); }

          this.expenses = expenses;
          return expenses;
        } else {
          // Fetch from local database
          let expenses = await db.expenses.toArray();

          // Apply filters
          if (filters.startDate) {
            const startDate = new Date(filters.startDate);
            expenses = expenses.filter(e => new Date(e.expenseDate) >= startDate);
          }
          if (filters.endDate) {
            const endDate = new Date(filters.endDate);
            expenses = expenses.filter(e => new Date(e.expenseDate) <= endDate);
          }
          if (filters.category) {
            expenses = expenses.filter(e => e.category === filters.category);
          }
          if (filters.isPettyCash !== undefined) {
            expenses = expenses.filter(e => e.isPettyCash === filters.isPettyCash);
          }
          if (filters.paymentStatus) {
            expenses = expenses.filter(e => e.paymentStatus === filters.paymentStatus);
          }

          expenses.sort((a, b) => new Date(b.expenseDate).getTime() - new Date(a.expenseDate).getTime());
          this.expenses = expenses;
          return expenses;
        }
      } catch (error) {
        console.error('Error fetching expenses:', error);
        const expenses = await db.expenses.toArray();
        expenses.sort((a, b) => new Date(b.expenseDate).getTime() - new Date(a.expenseDate).getTime());
        this.expenses = expenses;
        return expenses;
      }
    },

    async fetchPettyCashStatus() {
      const { useSyncStore } = await import("./syncStore"); const syncStore = useSyncStore();

      try {
        if (syncStore.isOnline) {
          const token = localStorage.getItem('auth_token');
          const response = await fetch(`${API_URL}/api/expenses/petty-cash/status`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (!response.ok) {
            throw new Error('Failed to fetch petty cash status');
          }

          const status = await response.json();
          this.pettyCashStatus = status;
          return status;
        } else {
          // Calculate from local data
          const cashAccount = await db.assetAccounts.get('CASH');
          const threshold = 1000; // Default threshold
          const balance = cashAccount?.balance || 0;

          const status = {
            balance,
            threshold,
            isLow: balance < threshold,
            needsReplenishment: balance < threshold
          };

          this.pettyCashStatus = status;
          return status;
        }
      } catch (error) {
        console.error('Error fetching petty cash status:', error);
        const cashAccount = await db.assetAccounts.get('CASH');
        const threshold = 1000;
        const balance = cashAccount?.balance || 0;

        const status = {
          balance,
          threshold,
          isLow: balance < threshold,
          needsReplenishment: balance < threshold
        };

        this.pettyCashStatus = status;
        return status;
      }
    },

    async createExpense(expenseData: any) {
      try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${API_URL}/api/expenses`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(expenseData)
        });
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || 'Failed to create expense');
        }
        const expense = await response.json();
        await this.fetchExpenses();
        return expense;
      } catch (error: any) {
        // Fallback to offline queue
        const { useSyncStore } = await import("./syncStore");
        const syncStore = useSyncStore();
        const tempId = `temp_${Date.now()}`;
        const expense = { _id: tempId, ...expenseData, createdAt: new Date().toISOString() };
        await db.expenses.add(expense);
        await syncStore.addToQueue({ operation: 'CREATE', collection: 'expenses', data: expense });
        throw error;
      }
    }
  }
});
