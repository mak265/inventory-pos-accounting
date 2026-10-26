<template>
  <q-page padding>
    <div class="q-pa-md">
      <h4 class="q-mt-none q-mb-md">Reports & Analytics</h4>

      <div class="row q-col-gutter-md">
        <!-- Sales Summary Report -->
        <div class="col-12 col-md-6 col-lg-4">
          <q-card flat bordered class="cursor-pointer" @click="navigateTo('/reports/sales-summary')">
            <q-card-section>
              <div class="row items-center">
                <q-icon name="summarize" size="48px" color="primary" class="q-mr-md" />
                <div>
                  <div class="text-h6">Sales Summary</div>
                  <div class="text-caption text-grey-7">
                    View total sales, payments, and receivables
                  </div>
                </div>
              </div>
            </q-card-section>
          </q-card>
        </div>

        <!-- Customer Report -->
        <div class="col-12 col-md-6 col-lg-4">
          <q-card flat bordered class="cursor-pointer" @click="navigateTo('/reports/customer-report')">
            <q-card-section>
              <div class="row items-center">
                <q-icon name="person" size="48px" color="secondary" class="q-mr-md" />
                <div>
                  <div class="text-h6">Customer Report</div>
                  <div class="text-caption text-grey-7">
                    Per-customer sales and balances
                  </div>
                </div>
              </div>
            </q-card-section>
          </q-card>
        </div>

        <!-- Top Selling Items -->
        <div class="col-12 col-md-6 col-lg-4">
          <q-card flat bordered class="cursor-pointer" @click="navigateTo('/reports/top-selling')">
            <q-card-section>
              <div class="row items-center">
                <q-icon name="trending_up" size="48px" color="positive" class="q-mr-md" />
                <div>
                  <div class="text-h6">Top Selling Items</div>
                  <div class="text-caption text-grey-7">
                    Best performing products
                  </div>
                </div>
              </div>
            </q-card-section>
          </q-card>
        </div>

        <!-- Cash Drawer Report -->
        <div class="col-12 col-md-6 col-lg-4">
          <q-card flat bordered class="cursor-pointer" @click="navigateTo('/reports/cash-drawer')">
            <q-card-section>
              <div class="row items-center">
                <q-icon name="account_balance_wallet" size="48px" color="orange" class="q-mr-md" />
                <div>
                  <div class="text-h6">Cash Drawer</div>
                  <div class="text-caption text-grey-7">
                    Cashier cash drawer report
                  </div>
                </div>
              </div>
            </q-card-section>
          </q-card>
        </div>

        <!-- Expense Report -->
        <div class="col-12 col-md-6 col-lg-4">
          <q-card flat bordered class="cursor-pointer" @click="navigateTo('/reports/expenses')">
            <q-card-section>
              <div class="row items-center">
                <q-icon name="receipt_long" size="48px" color="negative" class="q-mr-md" />
                <div>
                  <div class="text-h6">Expense Report</div>
                  <div class="text-caption text-grey-7">
                    Track expenses and petty cash
                  </div>
                </div>
              </div>
            </q-card-section>
          </q-card>
        </div>

        <!-- Asset Accounts -->
        <div class="col-12 col-md-6 col-lg-4">
          <q-card flat bordered class="cursor-pointer" @click="navigateTo('/reports/assets')">
            <q-card-section>
              <div class="row items-center">
                <q-icon name="account_balance" size="48px" color="purple" class="q-mr-md" />
                <div>
                  <div class="text-h6">Asset Accounts</div>
                  <div class="text-caption text-grey-7">
                    View account balances
                  </div>
                </div>
              </div>
            </q-card-section>
          </q-card>
        </div>

        <!-- SI Report -->
        <div class="col-12 col-md-6 col-lg-4">
          <q-card flat bordered class="cursor-pointer" @click="navigateTo('/reports/si-report')">
            <q-card-section>
              <div class="row items-center no-wrap">
                <q-icon name="receipt_long" size="48px" color="teal" class="q-mr-md" />
                <div>
                  <div class="text-h6">SI Report</div>
                  <div class="text-caption text-grey-7">
                    Sales invoices with SI numbers
                  </div>
                </div>
              </div>
            </q-card-section>
          </q-card>
        </div>
        <!-- Vendor SI Report -->
        <div class="col-12 col-md-6 col-lg-4">
          <q-card flat bordered class="cursor-pointer" @click="navigateTo('/reports/vendor-si')">
            <q-card-section>
              <div class="row items-center no-wrap">
                <q-icon name="local_shipping" size="48px" color="deep-purple" class="q-mr-md" />
                <div>
                  <div class="text-h6">Vendor SI Report</div>
                  <div class="text-caption text-grey-7">Delivery receipts with vendor SI numbers</div>
                </div>
              </div>
            </q-card-section>
          </q-card>
        </div>

        <!-- Low Stock Alert -->
        <div class="col-12 col-md-6 col-lg-4">
          <q-card flat bordered class="cursor-pointer" @click="navigateTo('/reports/low-stock')">
            <q-card-section>
              <div class="row items-center no-wrap">
                <q-icon name="warning" size="48px" color="negative" class="q-mr-md" />
                <div>
                  <div class="text-h6">Low Stock Alert</div>
                  <div class="text-caption text-grey-7">Products below minimum stock level</div>
                </div>
              </div>
            </q-card-section>
          </q-card>
        </div>

        <!-- Vendor Report -->
        <div class="col-12 col-md-6 col-lg-4">
          <q-card flat bordered class="cursor-pointer" @click="navigateTo('/reports/vendor-report')">
            <q-card-section>
              <div class="row items-center no-wrap">
                <q-icon name="store" size="48px" color="teal" class="q-mr-md" />
                <div>
                  <div class="text-h6">Vendor Report</div>
                  <div class="text-caption text-grey-7">Vendor deliveries, payments & balances</div>
                </div>
              </div>
            </q-card-section>
          </q-card>
        </div>

        <!-- Payment Journal -->
        <div class="col-12 col-md-6 col-lg-4">
          <q-card flat bordered class="cursor-pointer" @click="navigateTo('/reports/payment-journal')">
            <q-card-section>
              <div class="row items-center no-wrap">
                <q-icon name="receipt_long" size="48px" color="indigo" class="q-mr-md" />
                <div>
                  <div class="text-h6">Payment Journal</div>
                  <div class="text-caption text-grey-7">Vendor payment history — cash, check & online</div>
                </div>
              </div>
            </q-card-section>
          </q-card>
        </div>

        <!-- Stock In Journal -->
        <div class="col-12 col-md-6 col-lg-4">
          <q-card flat bordered class="cursor-pointer" @click="navigateTo('/reports/stock-in-journal')">
            <q-card-section>
              <div class="row items-center no-wrap">
                <q-icon name="inventory_2" size="48px" color="green" class="q-mr-md" />
                <div>
                  <div class="text-h6">Stock In Journal</div>
                  <div class="text-caption text-grey-7">Monitor all deliveries and stock received</div>
                </div>
              </div>
            </q-card-section>
          </q-card>
        </div>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();

const navigateTo = (path: string) => {
  router.push(path);
};
</script>

<style scoped>
.cursor-pointer {
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.cursor-pointer:hover {
  transform: translateY(-4px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}
</style>
