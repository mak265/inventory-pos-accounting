import { defineStore } from 'pinia';
import { db } from '../db/database';

const API_URL = import.meta.env.VITE_API_URL || '';

interface SaleLineItem {
  productId?: string;
  description: string;
  quantity: number;
  sellingPrice: number;
  discount: number;
  lineTotal: number;
}

interface CartItem extends SaleLineItem {
  _lineKey?: string;
  availableStock?: number;
  uom?: string;
  code?: string;
  baseSellingPrice?: number;
  sellingUoms?: Array<{
    uomId: string;
    uomAbbreviation: string;
    conversionFactor: number;
    sellingPrice: number;
  }>;
  selectedSellingUom?: string | null;
}

export const useSalesStore = defineStore('sales', {
  state: () => ({
    sales: [] as any[],
    currentSale: null as any,
    cart: [] as CartItem[],
    currentCustomer: null as any,
    pagination: {
      page: 1,
      limit: 15,
      total: 0,
      totalPages: 0
    }
  }),

  getters: {
    cartTotal: (state) => {
      return state.cart.reduce((total, item) => total + item.lineTotal, 0);
    },

    cartItemCount: (state) => {
      return state.cart.length;
    }
  },

  actions: {
    // Cart management
    addToCart(product: any, quantity: number) {
      this.cart.push({
        _lineKey: `${product._id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        productId: product._id,
        description: product.description,
        quantity,
        sellingPrice: product.sellingPrice || 0,
        discount: 0,
        lineTotal: quantity * (product.sellingPrice || 0),
        availableStock: product.availableStock,
        uom: product.uom,
        sellingUoms: product.sellingUoms || [],
        selectedSellingUom: null
      });
    },

    removeFromCart(index: number) {
      this.cart.splice(index, 1);
    },

    updateCartItem(index: number, quantity: number, sellingPrice: number, discount: number = 0) {
      if (this.cart[index]) {
        this.cart[index].quantity = quantity;
        this.cart[index].sellingPrice = sellingPrice;
        this.cart[index].discount = discount;
        this.cart[index].lineTotal = (quantity * sellingPrice) - discount;
      }
    },

    clearCart() {
      this.cart = [];
      this.currentCustomer = null;
    },

    setCurrentCustomer(customer: any) {
      this.currentCustomer = customer;
    },

    // Sales CRUD operations
    async fetchSales(filters: any = {}) {
      // ============================================================
      // FIX for "sales not fetching everything correctly":
      //  1. REMOVED syncStore.isOnline gate. Simply: TRY CLOUD API FIRST,
      //     IF ANY FAIL → fall back to IndexedDB. (catch block was doing
      //     this already; the isOnline check often returned FALSE when
      //     server is reachable → never even attempts API!)
      //  2. ALWAYS UPSERT SALES INTO INDEXEDDB "FULL TABLE" — NOT JUST
      //     THE CURRENT PAGE. Loops 1..totalPages in chunks of 200 to get
      //     every cloud row, so offline mode has complete sales history.
      // ============================================================

      try {
        const token = localStorage.getItem('auth_token');
        // Clean filters + pagination
        const cleanFilters: Record<string, string> = {};
        for (const [key, value] of Object.entries(filters)) {
          if (value !== null && value !== undefined && value !== '' && value !== 'null') {
            cleanFilters[key] = String(value);
          }
        }
        // If user passed explicit page/limit → preserve (called from UI component paginator)
        // Otherwise, use big page (200) on first fetch so we load as much as possible
        const pageExplicit = 'page' in filters;
        const limitExplicit = 'limit' in filters;
        const pageUser = pageExplicit ? Math.max(1, Number(filters.page) || 1) : 1;
        const limitUser = limitExplicit ? Math.max(1, Number(filters.limit) || 200) : 200;
        cleanFilters.page = String(pageUser);
        cleanFilters.limit = String(limitUser);

        // ---------- STEP 1: fetch the requested page (what UI will display NOW) ----------
        const qp1 = new URLSearchParams(cleanFilters).toString();
        const res1 = await fetch(`${API_URL}/api/sales?${qp1}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        if (!res1.ok) throw new Error(`HTTP ${res1.status}`);
        const payload1 = await res1.json();

        let pageSales: any[] = [];
        let pagePagination = { page: 1, limit: 200, total: 0, totalPages: 0 };

        if (payload1 && typeof payload1 === 'object' && Array.isArray(payload1.data)) {
          pageSales = payload1.data;
          pagePagination = {
            page: payload1.page || 1,
            limit: payload1.limit || 200,
            total: payload1.total || 0,
            totalPages: payload1.totalPages || 1,
          };
        } else if (Array.isArray(payload1)) {
          pageSales = payload1;
          pagePagination = { page: 1, limit: 200, total: payload1.length, totalPages: 1 };
        } else {
          throw new Error('Unexpected API payload shape for /api/sales');
        }

        // ---------- STEP 2: save the requested page to IndexedDB immediately ----------
        for (const s of pageSales) { await db.sales.put(JSON.parse(JSON.stringify(s))); }

        // ---------- STEP 3: IF this was a "blank pagination" call (no explicit page)
        //            AND totalPages > 1 → background-fetch EVERY MISSING PAGE so
        //            IndexedDB ends up with the complete sales dataset for offline use.
        // ----------
        const shouldPreloadAll = !pageExplicit && pagePagination.totalPages > 1;
        if (shouldPreloadAll) {
          const chunkSize = 200;
          const allExistingIds = new Set<string>(pageSales.map(s => String(s._id)).filter(Boolean));
          // fire remaining page fetches in chunks without blocking UI update
          (async () => {
            try {
              for (let p = 2; p <= pagePagination.totalPages; p++) {
                const f2 = new URLSearchParams({ ...cleanFilters, page: String(p), limit: String(chunkSize) }).toString();
                const r2 = await fetch(`${API_URL}/api/sales?${f2}`, {
                  headers: token ? { Authorization: `Bearer ${token}` } : {},
                  signal: AbortSignal.timeout ? AbortSignal.timeout(45000) : undefined,
                }).catch(() => null);
                if (!r2 || !r2.ok) continue;
                const j2 = await r2.json().catch(() => null);
                const rows = (j2 && Array.isArray(j2.data)) ? j2.data : (Array.isArray(j2) ? j2 : []);
                if (!rows.length) continue;
                for (const s of rows) {
                  const sid = String(s._id || '');
                  if (sid && !allExistingIds.has(sid)) { allExistingIds.add(sid); }
                  await db.sales.put(JSON.parse(JSON.stringify(s)));
                }
              }
            } catch (e) { /* background preload best effort only — never surface to user */ }
          })();
        }

        this.pagination = pagePagination;
        this.sales = pageSales;
        return { ok: true as const, total: pagePagination.total };
      } catch (error) {
        console.error('[salesStore.fetchSales] API FAILED → reading from IndexedDB (offline mode):', error);
        // ---------- FALLBACK: IndexedDB offline full table ----------
        let query = db.sales.toCollection();
        if (filters.customerId) query = db.sales.where('customerId').equals(filters.customerId);
        let rows = await query.toArray();

        if (filters.status) rows = rows.filter(s => s.status === filters.status);
        if (filters.startDate) {
          const sd = new Date(filters.startDate).getTime();
          rows = rows.filter(s => new Date(s.saleDate || 0).getTime() >= sd);
        }
        if (filters.endDate) {
          const ed = new Date(filters.endDate); ed.setHours(23, 59, 59, 999);
          const edT = ed.getTime();
          rows = rows.filter(s => new Date(s.saleDate || 0).getTime() <= edT);
        }
        if (filters.search && String(filters.search).trim()) {
          const needle = String(filters.search).trim().toLowerCase();
          rows = rows.filter(s =>
            String(s.drNumber || '').toLowerCase().includes(needle) ||
            String(s.customerName || '').toLowerCase().includes(needle));
        }
        rows.sort((a, b) => new Date(b.saleDate || 0).getTime() - new Date(a.saleDate || 0).getTime());

        // Apply pagination if requested (UI only paginates offline results if page set)
        const page = Math.max(1, Number(filters.page) || 1);
        const limit = Math.max(1, Number(filters.limit) || rows.length);
        const start = (page - 1) * limit;
        const sliced = rows.slice(start, start + limit);

        this.pagination = {
          page, limit,
          total: rows.length,
          totalPages: Math.max(1, Math.ceil(rows.length / limit)),
        };
        this.sales = sliced;
        return { ok: false as const, total: rows.length };
      }
    },

    async getSaleById(id: string) {
      const { useSyncStore } = await import("./syncStore"); const syncStore = useSyncStore();

      try {
        if (syncStore.isOnline) {
          const token = localStorage.getItem('auth_token');
          const response = await fetch(`${API_URL}/api/sales/${id}`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (!response.ok) {
            throw new Error('Failed to fetch sale');
          }

          const sale = await response.json();
          this.currentSale = sale;
          return sale;
        } else {
          const sale = await db.sales.get(id);
          this.currentSale = sale;
          return sale;
        }
      } catch (error) {
        console.error('Error fetching sale:', error);
        const sale = await db.sales.get(id);
        this.currentSale = sale;
        return sale;
      }
    },

    async createSale(saleData: any) {
      const { useSyncStore } = await import("./syncStore"); const syncStore = useSyncStore();

      // OFFLINE-FIRST: Always save locally first to prevent data loss on weak connections
      const tempId = `temp_${Date.now()}`;
      const localSale = { _id: tempId, ...saleData, status: 'DRAFT', createdAt: new Date().toISOString() };
      await db.sales.add(localSale);

      try {
        const token = localStorage.getItem('auth_token');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

        const response = await fetch(`${API_URL}/api/sales`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(saleData),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) { const err = await response.json(); throw new Error(err.error || 'Failed to create sale'); }
        const sale = await response.json();

        // API success — replace local temp record with server record
        await db.sales.delete(tempId);
        await db.sales.put(sale);
        await this.fetchSales();
        return sale;
      } catch (error: any) {
        // Network error, timeout, or API unreachable — sale is already saved locally
        const isNetworkError = error.name === 'AbortError' || error.name === 'TypeError' || !navigator.onLine
          || error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')
          || error.message?.includes('network') || error.message?.includes('timeout');

        if (isNetworkError) {
          // Queue for sync when connection is restored
          await syncStore.addToQueue({ operation: 'CREATE', collection: 'sales', data: localSale });
          return localSale;
        }

        // Genuine server validation error (e.g. bad data) — remove local record and throw
        await db.sales.delete(tempId);
        throw error;
      }
    },

    async createSaleFromCart(drNumber: string, saleDate: Date, documentType: string = 'DR', extras: { deliveryFee?: number; tollFee?: number; notes?: string; address?: string } = {}) {
      if (this.cart.length === 0) {
        throw new Error('Cart is empty');
      }

      const customer = this.currentCustomer || { _id: 'walk-in', name: 'Walk-in Customer' };

      const isWalkIn = !customer._id || customer._id === 'walk-in';
      const deliveryFee = extras.deliveryFee || 0;
      const tollFee = extras.tollFee || 0;
      // Address: use what was typed in the POS form; fall back to customer's stored address
      const deliveryAddress = extras.address || customer.deliveryAddress || '';
      const saleData: any = {
        drNumber,
        documentType,
        saleDate,
        customerName: customer.name || 'Walk-in Customer',
        officeAddress: customer.officeAddress || '',
        deliveryAddress,
        tin: customer.tin || '',
        deliveryFee,
        tollFee,
        notes: extras.notes || '',
        lineItems: this.cart.map(item => {
          const sellingUom = item.selectedSellingUom && item.sellingUoms
            ? item.sellingUoms.find(su => su.uomId === item.selectedSellingUom)
            : null;
          return {
            productId: item.productId,
            description: item.description,
            quantity: item.quantity,
            sellingPrice: item.sellingPrice,
            discount: item.discount || 0,
            lineTotal: item.lineTotal,
            sellingUomId: item.selectedSellingUom || undefined,
            conversionFactor: sellingUom ? sellingUom.conversionFactor : 1
          };
        }),
        totalAmount: this.cartTotal + deliveryFee + tollFee
      };
      if (!isWalkIn) { saleData.customerId = customer._id; }

      const sale = await this.createSale(saleData);
      this.clearCart();
      return sale;
    },

    async updateSale(id: string, saleData: any) {
      const { useSyncStore } = await import("./syncStore"); const syncStore = useSyncStore();

      // Save locally first to prevent data loss on weak connections
      const previousSale = await db.sales.get(id);
      await db.sales.update(id, { ...saleData, updatedAt: new Date().toISOString() });

      try {
        const token = localStorage.getItem('auth_token');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(`${API_URL}/api/sales/${id}`, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(saleData),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) { const err = await response.json(); throw new Error(err.error || 'Failed to update sale'); }
        await this.fetchSales();
        return await response.json();
      } catch (error: any) {
        const isNetworkError = error.name === 'AbortError' || error.name === 'TypeError' || !navigator.onLine
          || error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')
          || error.message?.includes('network') || error.message?.includes('timeout');

        if (isNetworkError) {
          // Already saved locally — queue for sync
          await syncStore.addToQueue({ operation: 'UPDATE', collection: 'sales', data: { ...saleData, _id: id } });
          return saleData;
        }

        // Server validation error — revert local change
        if (previousSale) {
          await db.sales.put(previousSale);
        }
        throw error;
      }
    },

    async adminEditSale(id: string, saleData: any, adminPassword: string) {
      try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${API_URL}/api/sales/${id}/admin-edit`, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...saleData, adminPassword })
        });
        if (!response.ok) { const err = await response.json(); throw new Error(err.error || 'Failed to admin-edit sale'); }
        await this.fetchSales();
        return await response.json();
      } catch (error: any) {
        if (!navigator.onLine) {
          // Offline admin-edit not supported
          throw error;
        }
        throw error;
      }
    },

    async deleteSale(id: string, adminPassword: string) {
      try {
        const token = localStorage.getItem('auth_token');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(`${API_URL}/api/sales/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ adminPassword }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) { const err = await response.json(); throw new Error(err.error || 'Failed to delete sale'); }
        await this.fetchSales();
      } catch (error: any) {
        const isNetworkError = error.name === 'AbortError' || error.name === 'TypeError' || !navigator.onLine
          || error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')
          || error.message?.includes('network') || error.message?.includes('timeout');

        if (isNetworkError) {
          const { useSyncStore } = await import("./syncStore"); const syncStore = useSyncStore();
          await db.sales.delete(id);
          await syncStore.addToQueue({ operation: 'DELETE', collection: 'sales', data: { _id: id, adminPassword } });
        } else { throw error; }
      }
    },

    async postSale(id: string) {
      if (id.startsWith('temp_')) {
        throw new Error('Cannot post a sale that hasn\'t been synced to the server yet. Please delete and recreate.');
      }
      try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${API_URL}/api/sales/${id}/post`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        });
        if (!response.ok) { const err = await response.json(); throw new Error(err.error || 'Failed to post sale'); }
        const sale = await response.json();
        await this.fetchSales();
        return sale;
      } catch (error) {
        console.error('Error posting sale:', error);
        throw error;
      }
    }
  }
});
