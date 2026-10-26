<template>
  <q-card>
    <q-card-section>
      <div class="text-h6">Select Product</div>
    </q-card-section>

    <q-card-section>
      <q-input
        v-model="searchQuery"
        label="Search by code or description"
        outlined
        dense
        clearable
        autofocus
        @update:model-value="onSearch"
      >
        <template v-slot:prepend>
          <q-icon name="search" />
        </template>
      </q-input>

      <q-list bordered separator class="q-mt-md" style="max-height: 400px; overflow-y: auto">
        <q-item
          v-for="product in filteredProducts"
          :key="product._id"
          clickable
          v-ripple
          @click="selectProduct(product)"
        >
          <q-item-section>
            <q-item-label>{{ product.code }} - {{ product.description }}</q-item-label>
            <q-item-label caption>
              Available: {{ product.availableStock }} {{ product.uom }}
              <span v-if="product.sellingPrice" class="q-ml-md">
                Price: P{{ product.sellingPrice.toFixed(2) }}
              </span>
            </q-item-label>
          </q-item-section>
          <q-item-section side>
            <q-badge
              :color="product.availableStock > 0 ? 'positive' : 'negative'"
              :label="product.availableStock > 0 ? 'In Stock' : 'Out of Stock'"
            />
          </q-item-section>
        </q-item>

        <q-item v-if="filteredProducts.length === 0">
          <q-item-section>
            <q-item-label class="text-grey text-center">
              {{ searchQuery ? 'No products found' : 'Start typing to search products' }}
            </q-item-label>
          </q-item-section>
        </q-item>
      </q-list>
    </q-card-section>

    <q-card-actions align="right">
      <q-btn flat label="Cancel" color="primary" @click="$emit('cancelled')" />
    </q-card-actions>
  </q-card>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useProductStore } from '../stores/productStore';

const emit = defineEmits(['selected', 'cancelled']);

const productStore = useProductStore();
const searchQuery = ref('');
const products = ref<any[]>([]);

const filteredProducts = computed(() => {
  if (!searchQuery.value) {
    return [];
  }

  const query = searchQuery.value.toLowerCase();
  return products.value.filter(product => {
    return (
      product.code.toLowerCase().includes(query) ||
      product.description.toLowerCase().includes(query)
    );
  }).slice(0, 20); // Limit to 20 results for performance
});

const onSearch = async () => {
  if (searchQuery.value && searchQuery.value.length >= 1) {
    await productStore.fetchProducts({ limit: 500, search: searchQuery.value });
    products.value = productStore.products;
  }
};

const selectProduct = (product: any) => {
  if (product.availableStock <= 0) {
    // Could show a warning but still allow selection
    // The actual validation will happen when adding to cart
  }
  emit('selected', product);
};

onMounted(async () => {
  await productStore.fetchProducts({ limit: 5000 });
  products.value = productStore.products;
});
</script>
