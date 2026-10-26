import { defineStore } from 'pinia';
import { ref } from 'vue';
import { db, type Product } from '../db/database';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '';

export const useProductStore = defineStore('product', () => {
  const products = ref<Product[]>([]);
  const currentProduct = ref<Product | null>(null);
  const loading = ref(false);

  /**
   * Fetch products from server or local storage
   */
  const fetchProducts = async (params?: {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: string;
    isActive?: boolean;
  }) => {
    const { useSyncStore } = await import("./syncStore"); const syncStore = useSyncStore();
    loading.value = true;
    try {
      if (syncStore.isOnline) {
        // Fetch from server
        const response = await axios.get(`${API_URL}/api/products`, {
          params,
          headers: {
            Authorization: `Bearer ${localStorage.getItem('auth_token')}`
          }
        });

        // Update local storage (deep clone to strip non-serializable Mongoose properties)
        const serverProducts = JSON.parse(JSON.stringify(response.data.products));
        for (const product of serverProducts) {
          await db.products.put(product);
        }

        products.value = serverProducts;
        return response.data;
      } else {
        // Fetch from local storage
        const allLocal = await db.products.toArray();
        let localProducts = allLocal.filter(p => !p.isDeleted);

        if (params?.search) {
          localProducts = localProducts.filter(p =>
            p.code.toLowerCase().includes(params.search!.toLowerCase()) ||
            p.description.toLowerCase().includes(params.search!.toLowerCase())
          );
        }

        products.value = localProducts;
        return {
          products: localProducts,
          pagination: { page: 1, limit: localProducts.length, total: localProducts.length, pages: 1 }
        };
      }
    } catch (error) {
      console.error('Error fetching products:', error);

      // Fallback to local storage
      const allLocal = await db.products.toArray();
      const localProducts = allLocal.filter(p => !p.isDeleted);
      products.value = localProducts;

      return {
        products: localProducts,
        pagination: { page: 1, limit: localProducts.length, total: localProducts.length, pages: 1 }
      };
    } finally {
      loading.value = false;
    }
  };

  /**
   * Get a single product by ID
   */
  const getProduct = async (id: string): Promise<Product | null> => {
    const { useSyncStore } = await import("./syncStore"); const syncStore = useSyncStore();
    try {
      if (syncStore.isOnline) {
        const response = await axios.get(`${API_URL}/api/products/${id}`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('auth_token')}`
          }
        });

        // Update local storage (deep clone to strip non-serializable properties)
        const productData = JSON.parse(JSON.stringify(response.data));
        await db.products.put(productData);
        currentProduct.value = productData;
        return productData;
      } else {
        const product = await db.products.get(id);
        currentProduct.value = product || null;
        return product || null;
      }
    } catch (error) {
      console.error('Error fetching product:', error);

      // Fallback to local storage
      const product = await db.products.get(id);
      currentProduct.value = product || null;
      return product || null;
    }
  };

  /**
   * Create a new product
   */
  const createProduct = async (productData: Omit<Product, '_id'>) => {
    const { useSyncStore } = await import("./syncStore"); const syncStore = useSyncStore();
    try {
      if (syncStore.isOnline) {
        const response = await axios.post(`${API_URL}/api/products`, productData, {
          headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
        });
        const product = JSON.parse(JSON.stringify(response.data));
        await db.products.put(product);
        return product;
      } else {
        const tempId = uuidv4();
        const newProduct: Product = JSON.parse(JSON.stringify({
          ...productData,
          _id: tempId,
          createdAt: new Date(),
          updatedAt: new Date(),
          syncVersion: 0,
          isDeleted: false
        }));
        await db.products.add(newProduct);
        await syncStore.addToQueue({ operation: 'CREATE', collection: 'products', data: newProduct });
        return newProduct;
      }
    } catch (error: any) {
      if (!navigator.onLine) {
        const tempId = uuidv4();
        const newProduct: Product = JSON.parse(JSON.stringify({
          ...productData, _id: tempId, createdAt: new Date(), updatedAt: new Date(), syncVersion: 0, isDeleted: false
        }));
        await db.products.add(newProduct);
        const { useSyncStore } = await import("./syncStore"); const syncStore2 = useSyncStore();
        await syncStore2.addToQueue({ operation: 'CREATE', collection: 'products', data: newProduct });
        return newProduct;
      }
      throw error;
    }
  };

  /**
   * Update an existing product
   */
  const updateProduct = async (id: string, updates: Partial<Product>) => {
    const { useSyncStore } = await import("./syncStore"); const syncStore = useSyncStore();
    try {
      if (syncStore.isOnline) {
        const response = await axios.put(`${API_URL}/api/products/${id}`, updates, {
          headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
        });
        const product = JSON.parse(JSON.stringify(response.data));
        await db.products.put(product);
        return product;
      } else {
        const product = await db.products.get(id);
        if (!product) throw new Error('Product not found');
        const updatedProduct: Product = JSON.parse(JSON.stringify({
          ...product, ...updates, updatedAt: new Date(), syncVersion: (product.syncVersion || 0) + 1
        }));
        await db.products.put(updatedProduct);
        await syncStore.addToQueue({ operation: 'UPDATE', collection: 'products', data: updatedProduct });
        return updatedProduct;
      }
    } catch (error: any) {
      if (!navigator.onLine) {
        const product = await db.products.get(id);
        if (!product) throw new Error('Product not found');
        const updatedProduct: Product = JSON.parse(JSON.stringify({
          ...product, ...updates, updatedAt: new Date(), syncVersion: (product.syncVersion || 0) + 1
        }));
        await db.products.put(updatedProduct);
        const { useSyncStore } = await import("./syncStore"); const syncStore2 = useSyncStore();
        await syncStore2.addToQueue({ operation: 'UPDATE', collection: 'products', data: updatedProduct });
        return updatedProduct;
      }
      throw error;
    }
  };

  /**
   * Delete a product (soft delete)
   */
  const deleteProduct = async (id: string, adminPassword: string) => {
    try {
      const response = await axios.delete(`${API_URL}/api/products/${id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
        data: { adminPassword }
      });
      return response.data;
    } catch (error: any) {
      if (!navigator.onLine) {
        const { useSyncStore } = await import("./syncStore"); const syncStore = useSyncStore();
        const product = await db.products.get(id);
        if (product) { await db.products.put({ ...product, isDeleted: true }); }
        await syncStore.addToQueue({ operation: 'DELETE', collection: 'products', data: { _id: id, adminPassword } });
        return product;
      }
      throw error;
    }
  };

  /**
   * Get product stock history
   */
  const getProductHistory = async (id: string) => {
    const { useSyncStore } = await import("./syncStore"); const syncStore = useSyncStore();
    try {
      if (syncStore.isOnline) {
        const response = await axios.get(`${API_URL}/api/products/${id}/history`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('auth_token')}`
          }
        });
        return response.data;
      } else {
        const product = await db.products.get(id);
        if (!product) {
          throw new Error('Product not found');
        }
        return {
          code: product.code,
          description: product.description,
          history: product.vomData || []
        };
      }
    } catch (error) {
      console.error('Error fetching product history:', error);
      throw error;
    }
  };

  /**
   * Adjust product stock
   */
  const adjustStock = async (
    id: string,
    quantityChange: number,
    reason?: string,
    referenceType?: string,
    referenceId?: string
  ) => {
    const { useSyncStore } = await import("./syncStore"); const syncStore = useSyncStore();
    try {
      const product = await db.products.get(id);
      if (!product) {
        throw new Error('Product not found');
      }

      const newStock = (product.availableStock || 0) + quantityChange;
      if (newStock < 0) {
        throw new Error('Insufficient stock');
      }

      const vomEntry = {
        date: new Date(),
        quantityIn: quantityChange > 0 ? quantityChange : 0,
        quantityOut: quantityChange < 0 ? Math.abs(quantityChange) : 0,
        balance: newStock,
        reason,
        adjustedBy: localStorage.getItem('auth_user') ? JSON.parse(localStorage.getItem('auth_user')!).username : undefined,
        referenceType,
        referenceId,
      };

      const updatedProduct: Product = {
        ...product,
        availableStock: newStock,
        vomData: [...(product.vomData || []), vomEntry],
        updatedAt: new Date(),
        syncVersion: (product.syncVersion || 0) + 1
      };

      // Update local storage
      await db.products.put(updatedProduct);

      // Add to sync queue
      await syncStore.addToQueue({
        operation: 'UPDATE',
        collection: 'products',
        data: updatedProduct
      });

      // If online, sync immediately
      if (syncStore.isOnline) {
        await syncStore.processQueue();
      }

      return updatedProduct;
    } catch (error) {
      console.error('Error adjusting stock:', error);
      throw error;
    }
  };

  /**
   * Stock adjustment via backend API (with reason tracking)
   */
  const stockAdjust = async (
    id: string,
    type: 'IN' | 'OUT',
    quantity: number,
    reason: string,
    notes?: string
  ) => {
    try {
      const response = await axios.post(`${API_URL}/api/products/${id}/stock-adjust`, {
        type,
        quantity,
        reason,
        notes,
      }, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('auth_token')}`
        }
      });

      // Update local storage with the returned product (deep clone to strip non-serializable properties)
      const productData = JSON.parse(JSON.stringify(response.data));
      await db.products.put(productData);

      return productData;
    } catch (error: any) {
      console.error('Error adjusting stock:', error);
      throw error;
    }
  };

  return {
    products,
    currentProduct,
    loading,
    fetchProducts,
    getProduct,
    createProduct,
    updateProduct,
    deleteProduct,
    getProductHistory,
    adjustStock,
    stockAdjust
  };
});
