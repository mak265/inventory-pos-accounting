# End-to-End Verification Checklist

## 1. Complete Sales Workflow

1. **Login** → `POST /api/auth/login` → receive JWT token
2. **Browse Products** → `GET /api/products` → view available inventory
3. **Select Customer** → `GET /api/customers` → pick or create customer
4. **Create Sale** → `POST /api/sales` with line items → validates stock availability
5. **Post Sale** → `POST /api/sales/:id/post` → reduces product `availableStock`
6. **Record Payment** → `POST /api/payments` with payment channels → updates customer balance
7. **View Receipt** → `GET /api/sales/:id` → display SalesReceipt component
8. **Verify Stock** → `GET /api/products/:id` → confirm stock reduced
9. **Verify Customer Balance** → `GET /api/customers/:id/balance` → confirm unpaid amount added

### Cross-Module Effects

- Sale completion → Product `availableStock` decreases by quantity sold
- Payment with unpaid amount → Customer `balance` increases by unpaid amount
- Payment through channel (e.g., GCASH) → AssetAccount balance increases

## 2. Complete Purchase Workflow

1. **Create/Select Vendor** → `POST /api/vendors` or `GET /api/vendors`
2. **Create PO** → `POST /api/purchase-orders` with line items → auto-generates PO number
3. **Create Delivery Receipt** → `POST /api/deliveries` linked to PO
4. **Post Delivery** → `POST /api/deliveries/:id/post` → updates inventory
5. **Verify Stock** → `GET /api/products/:id` → confirm stock increased
6. **Verify Average Cost** → product `averageCost` recalculated
7. **Verify Last Cost** → product `lastCost` updated to delivery unit cost

### Cross-Module Effects

- Delivery posting → Product `availableStock` increases by quantity received
- Delivery posting → Product `averageCost` recalculated with weighted average
- Delivery posting → Product `lastCost` updated
- Full delivery → PO status changes to COMPLETED

## 3. Offline-to-Online Sync Flow

1. **Go Offline** → SyncStatus shows "offline" indicator
2. **Perform Operations** → operations saved to IndexedDB + sync queue
3. **Verify Local Storage** → data persisted in IndexedDB tables
4. **Go Online** → SyncStatus shows "syncing" indicator
5. **Background Sync** → `POST /api/sync/batch` sends queued operations
6. **Conflict Resolution** → last-write-wins based on timestamps
7. **Verify Sync** → SyncStatus shows "online", pending count = 0
8. **Retry on Failure** → exponential backoff (1s, 2s, 4s, 8s...)

### Sync Queue Processing Order

- Operations processed chronologically by timestamp
- Batched in groups of 10
- Failed operations retried with exponential backoff
- Max retry limit before marking as permanently failed

## 4. Module Integration Matrix

| Action           | Products              | Sales          | Customers | Payments       | Assets    | Reports        |
| ---------------- | --------------------- | -------------- | --------- | -------------- | --------- | -------------- |
| Sale posted      | Stock ↓               | Record created | —         | —              | —         | Totals updated |
| Payment recorded | —                     | Linked         | Balance ↓ | Record created | Balance ↑ | Totals updated |
| Delivery posted  | Stock ↑, Cost updated | —              | —         | —              | —         | —              |
| Expense recorded | —                     | —              | —         | —              | Balance ↓ | Expense totals |

## 5. Route Verification

### Backend Routes (all registered in `backend/src/index.ts`)

- ✅ `/api/auth` → authRoutes
- ✅ `/api/sync` → syncRoutes
- ✅ `/api/products` → productRoutes
- ✅ `/api/vendors` → vendorRoutes
- ✅ `/api/purchase-orders` → purchaseOrderRoutes
- ✅ `/api/deliveries` → deliveryReceiptRoutes
- ✅ `/api/customers` → customerRoutes
- ✅ `/api/sales` → salesRoutes
- ✅ `/api/payments` → paymentRoutes
- ✅ `/api/expenses` → expenseRoutes
- ✅ `/api/asset-accounts` → assetAccountRoutes
- ✅ `/api/reports` → reportRoutes
- ✅ `/api/records` → savedStateRoutes

### Frontend Routes (all in `frontend/src/router/routes.ts`)

- ✅ `/` → Dashboard (IndexPage)
- ✅ `/login` → LoginPage
- ✅ `/products` → ProductList
- ✅ `/vendors` → VendorList
- ✅ `/purchase-orders` → POList
- ✅ `/purchase-orders/new` → POForm
- ✅ `/purchase-orders/:id/edit` → POForm
- ✅ `/deliveries` → DeliveryList
- ✅ `/deliveries/new` → DeliveryReceiptForm
- ✅ `/deliveries/:id/edit` → DeliveryReceiptForm
- ✅ `/customers` → CustomerList
- ✅ `/sales` → SalesList
- ✅ `/sales/new` → SalesTransaction
- ✅ `/reports` → ReportsPage
- ✅ `/reports/sales-summary` → SalesSummary
- ✅ `/reports/customer-report` → CustomerReport
- ✅ `/reports/top-selling` → TopSellingItems
- ✅ `/reports/cash-drawer` → CashDrawer
- ✅ `/reports/expenses` → ExpenseReport
- ✅ `/reports/assets` → AssetAccounts

## 6. Store Integration

- ✅ productStore → used by ProductList, ProductForm, ProductSelector, SalesTransaction
- ✅ vendorStore → used by VendorList, VendorForm, POForm, DeliveryReceiptForm
- ✅ poStore → used by POList, POForm, DeliveryReceiptForm
- ✅ deliveryStore → used by DeliveryList, DeliveryReceiptForm
- ✅ customerStore → used by CustomerList, CustomerForm, CustomerDetail, SalesTransaction
- ✅ salesStore → used by SalesList, SalesTransaction, SalesReceipt
- ✅ paymentStore → used by PaymentDialog, PaymentHistory
- ✅ expenseStore → used by ExpenseForm, ExpenseReport
- ✅ assetStore → used by AssetAccounts, PaymentDialog
- ✅ syncStore → used by SyncStatus, connectivity boot, backgroundSync
- ✅ uiStore → used by ConfirmDialog, MainLayout
