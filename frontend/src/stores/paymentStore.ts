import { defineStore } from 'pinia';
import { db } from '../db/database';

const API_URL = import.meta.env.VITE_API_URL || '';

interface PaymentChannel {
  channel: 'CASH' | 'GCASH' | 'BPI' | 'AUB' | 'BPI ONLINE' | 'AUB ONLINE' | 'MAYA' | 'CHECK' | 'OTHER_BANK';
  amount: number;
  referenceNumber?: string;
  accountName?: string;
  effectiveDate?: string;
}

interface Payment {
  _id?: string;
  saleId: string;
  customerId: string;
  paymentDate: string;
  referenceNumber?: string;
  amountDue: number;
  cashPayment: number;
  chargePayment: number;
  paymentChannels: PaymentChannel[];
  totalPaid: number;
  unpaidAmount: number;
  createdAt?: string;
}

export const usePaymentStore = defineStore('payment', {
  state: () => ({
    payments: [] as Payment[]
  }),

  getters: {
    getPaymentsBySale: (state) => (saleId: string) => {
      return state.payments.filter(p => p.saleId === saleId);
    },

    getPaymentsByCustomer: (state) => (customerId: string) => {
      return state.payments.filter(p => p.customerId === customerId);
    }
  },

  actions: {
    /**
     * Calculate total paid from all payment channels
     * Property 17: Multi-Channel Payment Total
     */
    calculateTotalPaid(paymentChannels: PaymentChannel[], cashPayment: number, chargePayment: number): number {
      const channelsTotal = paymentChannels.reduce((total, channel) => total + channel.amount, 0);
      return channelsTotal + cashPayment + chargePayment;
    },

    /**
     * Calculate unpaid amount
     * Property 15: Unpaid Amount Calculation
     */
    calculateUnpaidAmount(amountDue: number, totalPaid: number): number {
      const unpaid = amountDue - totalPaid;
      return unpaid > 0 ? unpaid : 0;
    },

    async fetchPayments(filters: any = {}) {
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
          const response = await fetch(`${API_URL}/api/payments?${queryParams}`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (!response.ok) {
            throw new Error('Failed to fetch payments');
          }

          const payments = await response.json();

          // Update local database (upsert)
          for (const p of JSON.parse(JSON.stringify(payments))) { await db.payments.put(p); }

          this.payments = payments;
        } else {
          // Fetch from local database
          let query = db.payments.toCollection();
          
          if (filters.customerId) {
            query = db.payments.where('customerId').equals(filters.customerId);
          } else if (filters.saleId) {
            query = db.payments.where('saleId').equals(filters.saleId);
          }
          
          const payments = await query.toArray();
          
          // Apply additional filters
          let filteredPayments = payments;
          
          if (filters.startDate) {
            const startDate = new Date(filters.startDate);
            filteredPayments = filteredPayments.filter(p => new Date(p.paymentDate) >= startDate);
          }
          
          if (filters.endDate) {
            const endDate = new Date(filters.endDate);
            filteredPayments = filteredPayments.filter(p => new Date(p.paymentDate) <= endDate);
          }
          
          // Sort by date descending
          filteredPayments.sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime());
          
          this.payments = filteredPayments;
        }
      } catch (error) {
        console.error('Error fetching payments:', error);
        // Fallback to local database
        const payments = await db.payments.toArray();
        payments.sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime());
        this.payments = payments;
      }
    },

    async getPaymentById(id: string) {
      const { useSyncStore } = await import("./syncStore"); const syncStore = useSyncStore();

      try {
        if (syncStore.isOnline) {
          const token = localStorage.getItem('auth_token');
          const response = await fetch(`${API_URL}/api/payments/${id}`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (!response.ok) {
            throw new Error('Failed to fetch payment');
          }

          const payment = await response.json();
          return payment;
        } else {
          const payment = await db.payments.get(id);
          return payment;
        }
      } catch (error) {
        console.error('Error fetching payment:', error);
        const payment = await db.payments.get(id);
        return payment;
      }
    },

    async createPayment(paymentData: any) {
      const { useSyncStore } = await import("./syncStore"); const syncStore = useSyncStore();

      // Calculate totals
      const totalPaid = this.calculateTotalPaid(
        paymentData.paymentChannels || [],
        paymentData.cashPayment || 0,
        paymentData.chargePayment || 0
      );

      const unpaidAmount = this.calculateUnpaidAmount(
        paymentData.amountDue,
        totalPaid
      );

      // Generate temporary ID for offline mode
      const tempId = `temp_${Date.now()}`;
      const payment: Payment = {
        _id: tempId,
        ...paymentData,
        totalPaid,
        unpaidAmount,
        createdAt: new Date().toISOString()
      };

      // Save to local database
      await db.payments.add(payment);

      // Add to sync queue
      await syncStore.addToQueue({
        operation: 'CREATE',
        collection: 'payments',
        data: payment
      });

      // If online, sync immediately
      if (syncStore.isOnline) {
        await syncStore.syncNow();
      }

      await this.fetchPayments();
      return payment;
    },

    async deletePayment(id: string, adminPassword: string) {
      const { useSyncStore } = await import("./syncStore"); const syncStore = useSyncStore();

      // Add to sync queue
      await syncStore.addToQueue({
        operation: 'DELETE',
        collection: 'payments',
        data: { _id: id, adminPassword }
      });

      // Delete from local database
      await db.payments.delete(id);

      // If online, sync immediately
      if (syncStore.isOnline) {
        await syncStore.syncNow();
      }

      await this.fetchPayments();
    }
  }
});
