/**
 * Route-to-role permission map.
 * Each key is a route name, and the value is an array of roles allowed to access it.
 * Routes not listed here are accessible by all authenticated users.
 */
export const ROUTE_PERMISSIONS: Record<string, string[]> = {
  dashboard: ['ADMIN', 'MANAGER', 'CASHIER', 'VIEWER'],
  products: ['ADMIN', 'MANAGER'],
  uoms: ['ADMIN', 'MANAGER'],
  customers: ['ADMIN', 'MANAGER', 'CASHIER'],
  vendors: ['ADMIN', 'MANAGER'],
  'purchase-orders': ['ADMIN', 'MANAGER'],
  'po-create': ['ADMIN', 'MANAGER'],
  'po-edit': ['ADMIN', 'MANAGER'],
  deliveries: ['ADMIN', 'MANAGER'],
  'delivery-create': ['ADMIN', 'MANAGER'],
  'delivery-edit': ['ADMIN', 'MANAGER'],
  sales: ['ADMIN', 'MANAGER', 'CASHIER'],
  'sale-create': ['ADMIN', 'MANAGER', 'CASHIER'],
  'sales-journal': ['ADMIN', 'MANAGER', 'VIEWER'],
  expenses: ['ADMIN', 'MANAGER', 'CASHIER'],
  reports: ['ADMIN', 'MANAGER', 'VIEWER'],
  'report-sales-summary': ['ADMIN', 'MANAGER', 'VIEWER'],
  'report-customer': ['ADMIN', 'MANAGER', 'VIEWER'],
  'report-top-selling': ['ADMIN', 'MANAGER', 'VIEWER'],
  'report-cash-drawer': ['ADMIN', 'MANAGER', 'VIEWER'],
  'report-expenses': ['ADMIN', 'MANAGER', 'VIEWER'],
  'report-assets': ['ADMIN', 'MANAGER', 'VIEWER'],
  'check-approvals': ['ADMIN', 'MANAGER'],
  settings: ['ADMIN', 'MANAGER', 'CASHIER', 'VIEWER'],
};

/**
 * Check if a role has permission to access a given route.
 * Returns true if the route is not in the map (allow by default).
 */
export function hasPermission(routeName: string, role: string): boolean {
  const allowedRoles = ROUTE_PERMISSIONS[routeName];
  if (!allowedRoles) {
    return true;
  }
  return allowedRoles.includes(role);
}
