# Inventory and Point-of-Sale System

A cloud-based inventory and POS system with offline-first capabilities, built with Vue.js (Quasar Framework), Node.js/Express, and MongoDB.

## Features

- Product inventory management with average cost tracking
- Purchase order and delivery receipt workflows
- POS sales interface with multi-channel payments
- Customer management with balance tracking
- Dynamic pricing with markup and tubo calculations
- Expense tracking and petty cash management
- Asset account management (BPI, AUB, GCash, Cash, Check)
- Financial reports with print-friendly output and PDF/Excel export
- Offline-first with IndexedDB and automatic background sync
- JWT authentication with role-based access
- Audit trail on all records

## Project Structure

```
├── frontend/           # Quasar/Vue.js 3 frontend (PWA)
│   └── src/
│       ├── boot/       # App initialization (axios, pinia, connectivity)
│       ├── components/ # Reusable Vue components
│       ├── db/         # IndexedDB (Dexie.js) schema and operations
│       ├── layouts/    # MainLayout with navigation
│       ├── pages/      # Route-level page components
│       ├── router/     # Vue Router with auth guards
│       ├── services/   # Sync, retry, error handling services
│       └── stores/     # Pinia stores for all modules
├── backend/            # Node.js/Express REST API
│   └── src/
│       ├── config/     # Database connection and indexes
│       ├── controllers/# Route handlers
│       ├── middleware/  # Auth, audit trail, backdate prevention
│       ├── models/     # Mongoose schemas
│       ├── routes/     # Express route definitions
│       ├── services/   # Business logic layer
│       └── utils/      # JWT utilities
└── docs/               # Verification checklist and security audit
```

## Tech Stack

| Layer           | Technology                                    |
| --------------- | --------------------------------------------- |
| Frontend        | Vue.js 3, Quasar Framework, TypeScript, Pinia |
| Offline Storage | IndexedDB via Dexie.js                        |
| Backend         | Node.js, Express.js, TypeScript               |
| Database        | MongoDB with Mongoose                         |
| Auth            | JWT (jsonwebtoken) + bcrypt                   |
| PWA             | Service Worker (Workbox via Quasar)           |

## Getting Started

### Prerequisites

- Node.js v22+
- MongoDB (local or Atlas)
- npm

### Backend Setup

```bash
cd backend
cp .env.example .env
# Edit .env with your MongoDB URI, JWT_SECRET, and ADMIN_PASSWORD
npm install
npm run dev
```

The API runs at `http://localhost:3000`.

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The app runs at `http://localhost:9000`.

### Environment Variables (backend/.env)

| Variable         | Description                             | Default                                   |
| ---------------- | --------------------------------------- | ----------------------------------------- |
| `PORT`           | Server port                             | `3000`                                    |
| `MONGODB_URI`    | MongoDB connection string               | `mongodb://localhost:27017/inventory-pos` |
| `JWT_SECRET`     | Secret for signing JWT tokens           | (change in production!)                   |
| `JWT_EXPIRES_IN` | Token expiry duration                   | `24h`                                     |
| `ADMIN_PASSWORD` | Password required for delete operations | `admin123`                                |
| `CORS_ORIGIN`    | Allowed CORS origin                     | `http://localhost:9000`                   |

## API Endpoints

### Authentication

| Method | Endpoint                 | Description           |
| ------ | ------------------------ | --------------------- |
| POST   | `/api/auth/login`        | Login (returns JWT)   |
| POST   | `/api/auth/logout`       | Logout                |
| POST   | `/api/auth/verify-admin` | Verify admin password |
| GET    | `/api/auth/me`           | Get current user      |

### Products

| Method | Endpoint                    | Description                              |
| ------ | --------------------------- | ---------------------------------------- |
| GET    | `/api/products`             | List products (paginated, filterable)    |
| GET    | `/api/products/:id`         | Get product details                      |
| POST   | `/api/products`             | Create product                           |
| PUT    | `/api/products/:id`         | Update product                           |
| DELETE | `/api/products/:id`         | Delete product (admin password required) |
| GET    | `/api/products/:id/history` | Stock movement history                   |

### Vendors

| Method | Endpoint           | Description                             |
| ------ | ------------------ | --------------------------------------- |
| GET    | `/api/vendors`     | List vendors                            |
| GET    | `/api/vendors/:id` | Get vendor                              |
| POST   | `/api/vendors`     | Create vendor                           |
| PUT    | `/api/vendors/:id` | Update vendor                           |
| DELETE | `/api/vendors/:id` | Delete vendor (admin password required) |

### Purchase Orders

| Method | Endpoint                   | Description                         |
| ------ | -------------------------- | ----------------------------------- |
| GET    | `/api/purchase-orders`     | List POs                            |
| GET    | `/api/purchase-orders/:id` | Get PO                              |
| POST   | `/api/purchase-orders`     | Create PO                           |
| PUT    | `/api/purchase-orders/:id` | Update PO                           |
| DELETE | `/api/purchase-orders/:id` | Delete PO (admin password required) |

### Delivery Receipts

| Method | Endpoint                   | Description                               |
| ------ | -------------------------- | ----------------------------------------- |
| GET    | `/api/deliveries`          | List deliveries                           |
| GET    | `/api/deliveries/:id`      | Get delivery                              |
| POST   | `/api/deliveries`          | Create delivery                           |
| PUT    | `/api/deliveries/:id`      | Update delivery                           |
| POST   | `/api/deliveries/:id/post` | Post delivery (updates inventory)         |
| DELETE | `/api/deliveries/:id`      | Delete delivery (admin password required) |

### Customers

| Method | Endpoint                     | Description                               |
| ------ | ---------------------------- | ----------------------------------------- |
| GET    | `/api/customers`             | List customers (alphabetical)             |
| GET    | `/api/customers/:id`         | Get customer                              |
| POST   | `/api/customers`             | Create customer                           |
| PUT    | `/api/customers/:id`         | Update customer                           |
| DELETE | `/api/customers/:id`         | Delete customer (admin password required) |
| GET    | `/api/customers/:id/history` | Transaction history                       |
| GET    | `/api/customers/:id/balance` | Current balance                           |

### Sales

| Method | Endpoint              | Description                           |
| ------ | --------------------- | ------------------------------------- |
| GET    | `/api/sales`          | List sales                            |
| GET    | `/api/sales/:id`      | Get sale                              |
| POST   | `/api/sales`          | Create sale                           |
| PUT    | `/api/sales/:id`      | Update sale                           |
| POST   | `/api/sales/:id/post` | Post sale (reduces stock)             |
| DELETE | `/api/sales/:id`      | Delete sale (admin password required) |

### Payments

| Method | Endpoint            | Description                              |
| ------ | ------------------- | ---------------------------------------- |
| GET    | `/api/payments`     | List payments                            |
| GET    | `/api/payments/:id` | Get payment                              |
| POST   | `/api/payments`     | Record payment                           |
| DELETE | `/api/payments/:id` | Delete payment (admin password required) |

### Expenses

| Method | Endpoint                          | Description        |
| ------ | --------------------------------- | ------------------ |
| GET    | `/api/expenses`                   | List expenses      |
| POST   | `/api/expenses`                   | Record expense     |
| GET    | `/api/expenses/petty-cash/status` | Petty cash balance |

### Asset Accounts

| Method | Endpoint                                 | Description                 |
| ------ | ---------------------------------------- | --------------------------- |
| GET    | `/api/asset-accounts`                    | List all accounts           |
| GET    | `/api/asset-accounts/:type`              | Get account by type         |
| GET    | `/api/asset-accounts/:type/transactions` | Account transactions        |
| POST   | `/api/asset-accounts/initialize`         | Initialize default accounts |

### Reports

| Method | Endpoint                                  | Description                |
| ------ | ----------------------------------------- | -------------------------- |
| GET    | `/api/reports/sales-summary`              | Sales summary (date range) |
| GET    | `/api/reports/customer-sales/:customerId` | Per-customer sales         |
| GET    | `/api/reports/top-selling`                | Top selling items          |
| GET    | `/api/reports/cash-drawer/:cashierId`     | Cash drawer report         |
| GET    | `/api/reports/expenses`                   | Expense report             |
| GET    | `/api/reports/asset-accounts`             | Asset account balances     |

### Sync

| Method | Endpoint                     | Description                 |
| ------ | ---------------------------- | --------------------------- |
| POST   | `/api/sync/batch`            | Batch sync operations       |
| GET    | `/api/sync/changes/:since`   | Get changes since timestamp |
| POST   | `/api/sync/resolve-conflict` | Manual conflict resolution  |

### Save/Unsave

| Method | Endpoint                                   | Description           |
| ------ | ------------------------------------------ | --------------------- |
| POST   | `/api/records/:collection/:id/save`        | Save record state     |
| POST   | `/api/records/:collection/:id/unsave`      | Revert to saved state |
| GET    | `/api/records/:collection/:id/saved-state` | Check saved state     |

## Offline-First Architecture

1. All operations write to local IndexedDB first
2. Operations are queued in the sync queue
3. When online, background sync sends batches to the server
4. Conflicts resolved via last-write-wins (timestamp comparison)
5. Failed syncs retry with exponential backoff
6. SyncStatus component shows real-time connectivity state

## Development Scripts

### Backend

| Script          | Description                |
| --------------- | -------------------------- |
| `npm run dev`   | Dev server with hot reload |
| `npm run build` | Compile TypeScript         |
| `npm start`     | Run compiled JS            |
| `npm run lint`  | ESLint check               |
| `npm test`      | Run Jest tests             |

### Frontend

| Script          | Description       |
| --------------- | ----------------- |
| `npm run dev`   | Quasar dev server |
| `npm run build` | Production build  |
| `npm run lint`  | ESLint check      |

## License

ISC
