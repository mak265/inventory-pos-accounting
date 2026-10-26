# Security Audit Report

## 1. Authentication Middleware

All API routes (except login/logout) require JWT authentication via the `authenticate` middleware.

| Route Group              | Auth Middleware            | Status       |
| ------------------------ | -------------------------- | ------------ |
| `/api/auth/login`        | None (public)              | ✅ Correct   |
| `/api/auth/logout`       | None (public)              | ✅ Correct   |
| `/api/auth/verify-admin` | `authenticate`             | ✅ Protected |
| `/api/auth/me`           | `authenticate`             | ✅ Protected |
| `/api/products/*`        | `router.use(authenticate)` | ✅ Protected |
| `/api/vendors/*`         | Per-route `authenticate`   | ✅ Protected |
| `/api/purchase-orders/*` | Per-route `authenticate`   | ✅ Protected |
| `/api/deliveries/*`      | `router.use(authenticate)` | ✅ Protected |
| `/api/customers/*`       | Per-route `authenticate`   | ✅ Protected |
| `/api/sales/*`           | Per-route `authenticate`   | ✅ Protected |
| `/api/payments/*`        | Per-route `authenticate`   | ✅ Protected |
| `/api/expenses/*`        | `router.use(authenticate)` | ✅ Protected |
| `/api/asset-accounts/*`  | `router.use(authenticate)` | ✅ Protected |
| `/api/reports/*`         | `router.use(authenticate)` | ✅ Protected |
| `/api/sync/*`            | `router.use(authenticate)` | ✅ Protected |
| `/api/records/*`         | `router.use(authenticate)` | ✅ Protected |

Additionally, the `attachAuditContext` middleware runs after auth routes, ensuring all authenticated requests have audit context.

## 2. Delete Endpoint Authorization

All delete endpoints require admin password verification via `requireAdminPassword` middleware.

| Endpoint                          | Admin Password Required   | Status    |
| --------------------------------- | ------------------------- | --------- |
| `DELETE /api/products/:id`        | ✅ `requireAdminPassword` | ✅ Secure |
| `DELETE /api/vendors/:id`         | ✅ `requireAdminPassword` | ✅ Secure |
| `DELETE /api/purchase-orders/:id` | ✅ `requireAdminPassword` | ✅ Secure |
| `DELETE /api/deliveries/:id`      | ✅ `requireAdminPassword` | ✅ Secure |
| `DELETE /api/customers/:id`       | ✅ `requireAdminPassword` | ✅ Secure |
| `DELETE /api/sales/:id`           | ✅ `requireAdminPassword` | ✅ Secure |
| `DELETE /api/payments/:id`        | ✅ `requireAdminPassword` | ✅ Secure |

The `requireAdminPassword` middleware:

- Returns 403 if `adminPassword` is missing from request body
- Returns 403 if password is incorrect
- Logs failed attempts with user ID and timestamp

## 3. Input Validation

- Backdate prevention middleware (`preventBackdate`) applied to:
  - Sales creation/update (`saleDate`)
  - Payment creation (`paymentDate`)
  - Delivery creation/update (`deliveryDate`)
  - PO creation/update (`poDate`)
  - Expense creation (`expenseDate`)
- Mongoose schema validation enforces required fields and data types
- `validationService` provides additional business rule validation

## 4. JWT Token Handling

- Token generated with configurable expiry (default: 24h)
- Token verified on every authenticated request
- Invalid/expired tokens return 401
- Token stored in `localStorage` on client (standard SPA approach)
- Frontend axios interceptor auto-attaches token to requests
- 401 responses trigger automatic redirect to login page

### Recommendation

- The JWT secret defaults to `'your-secret-key-change-this'` — ensure `JWT_SECRET` env var is set in production.

## 5. CORS Configuration

- CORS configured via `CORS_ORIGIN` environment variable
- Defaults to `*` (allow all origins) if not set
- **Recommendation**: Set `CORS_ORIGIN` to the specific frontend URL in production.

## 6. Frontend Auth Guard

- Vue Router navigation guard checks for `auth_token` in localStorage
- Routes with `meta.requiresAuth` redirect to login if no token
- Login page redirects to dashboard if already authenticated
- Axios response interceptor handles 401 by clearing token and redirecting to login

## 7. Additional Security Measures

- Password hashing with bcrypt (User model)
- Audit trail middleware records all modifications with user ID and timestamp
- Immutable audit log (AuditLog model prevents updates/deletes)
- Soft delete pattern (isDeleted flag) preserves data integrity
- Request body size limited by Express JSON parser defaults
