import dotenv from 'dotenv'
dotenv.config({ override: false })

import express from 'express'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import { connectDatabase } from './config/database-adapter.js'
import cloudProxyRouter from './routes/cloudProxyRoutes.js'

// #region debug-point A,B,E:route-status-tracking
type RouteStatus = { mount: string; ok: boolean; error?: string; finishedAt?: string };
const routeStatuses: Record<string, RouteStatus> = {};
function setRouteStatus(name: string, mount: string, ok: boolean, error?: string) {
  routeStatuses[name] = { mount, ok, error: error ? error.substring(0, 300) : undefined, finishedAt: new Date().toISOString() };
}
// #endregion

const app = express()
const PORT = process.env.PORT || 3000

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use('/uploads', express.static('uploads'))

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.path.startsWith('/api') && duration > 500) {
      console.log(`[SLOW] ${req.method} ${req.originalUrl} - ${duration}ms`);
    }
  });
  next();
})

const frontendPath = process.env.FRONTEND_DIST
  ? path.resolve(process.env.FRONTEND_DIST)
  : path.join(process.cwd(), '..', 'frontend', 'dist', 'spa');
console.log('[Init] Frontend path:', frontendPath, 'exists:', fs.existsSync(frontendPath));
if (fs.existsSync(frontendPath)) app.use(express.static(frontendPath));
app.use(express.static(path.resolve(process.cwd(), 'public')));

app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }))
app.get('/api/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString(), dbMode: process.env.DB_MODE || 'mongodb' }))
app.get('/api', (_req, res) => res.json({ message: 'Inventory POS API' }))

// ===== RUNTIME DIAGNOSTIC ENDPOINT (LIFESAVER) =====
// Hit http://localhost:3000/_runtime_diag in any browser WHILE the desktop app is open.
// Returns EVERYTHING needed to confirm the running backend is actually the freshly-packaged one:
// build version, DB_MODE, cwd, entry script path, env vars, routes that exist.
app.get('/_runtime_diag', (_req, res) => {
  const entryFile = process.argv[1] || 'unknown';
  let entryMtime = null;
  try { entryMtime = fs.statSync(entryFile).mtime.toISOString(); } catch { /* ignore */ }
  res.json({
    ok: true,
    build: {
      desktop: process.env.DESKTOP_BUILD_VERSION || 'NOT SET',
    },
    pid: process.pid,
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    cwd: process.cwd(),
    argv: process.argv,
    entryFile,
    entryMtime,
    resourcesPath: process.resourcesPath || null,
    env: {
      DB_MODE: process.env.DB_MODE || null,
      DB_PATH: process.env.DB_PATH || null,
      FRONTEND_DIST: process.env.FRONTEND_DIST || null,
      CLOUD_URL: process.env.CLOUD_URL || null,
      NODE_ENV: process.env.NODE_ENV || null,
      PORT: process.env.PORT || null,
      NODE_PATH: process.env.NODE_PATH || null,
    },
    routes: {
      cloudProxyMounted: typeof cloudProxyRouter === 'function',
      // #region debug-point A:runtime-diagnostic-routes
      loaded: routeStatuses,
      loadedSummary: {
        total: Object.keys(routeStatuses).length,
        ok: Object.values(routeStatuses).filter(r => r.ok).length,
        failed: Object.values(routeStatuses).filter(r => !r.ok).length,
        failedNames: Object.entries(routeStatuses).filter(([_, r]) => !r.ok).map(([n]) => n),
      },
      // #endregion
    },
    timestamp: new Date().toISOString(),
  });
})
app.get('/api/_runtime_diag', (_req, res) => { res.redirect(307, '/_runtime_diag'); })

// Diagnostic endpoint BEFORE wildcard proxy route — confirms router actually mounted
app.get('/api/_cloud_proxy/_diag', (_req, res) => res.json({
  ok: true,
  dbMode: process.env.DB_MODE || 'mongodb',
  cloudUrl: process.env.CLOUD_URL || null,
  platform: process.platform,
}))
app.use('/api/_cloud_proxy', cloudProxyRouter)

async function loadRoute(name: string, modPath: string, routerMount: string) {
  try {
    const mod = await import(modPath)
    app.use(routerMount, mod.default)
    console.log(`  ✓ ${name}`)
    // #region debug-point A:loadroute-success
    setRouteStatus(name, routerMount, true);
    // #endregion
  } catch (e: any) {
    console.error(`  ✗ ${name}: ${e.message?.substring(0, 100)}`)
    // #region debug-point A:loadroute-failure
    const errFull = e && e.stack ? `${e.message || ''}\n${e.stack}` : (e && e.message ? e.message : String(e));
    setRouteStatus(name, routerMount, false, errFull);
    console.error(`  ✗✗ ${name} ROUTE LOAD FAILURE DETAIL (paste this with diagnosis): ${errFull.substring(0, 1000)}`);
    // #endregion
  }
}

let hasStartedListening = false
function startListening() {
  if (hasStartedListening) return
  hasStartedListening = true
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
  })
}

// Desktop SQLite mode needs HTTP up ASAP because the packaged frontend waits on localhost.
// Cloud mongodb mode should wait until DB + routes finish loading, otherwise early requests can hit
// /api/health successfully while real API routes (like /api/sales) are still not mounted yet.
if ((process.env.DB_MODE || 'mongodb') === 'sqlite') {
  startListening()
}

const startServer = async () => {
  try {
    await connectDatabase()

    console.log('Loading routes...')

    await loadRoute('auth', './routes/authRoutes.js', '/api/auth')

    try {
      const { attachAuditContext } = await import('./middleware/auditTrail.js')
      app.use(attachAuditContext)
    } catch (e: any) { console.error('  ✗ auditTrail:', e.message?.substring(0, 80)) }

    await Promise.all([
      loadRoute('sync', './routes/syncRoutes.js', '/api/sync'),
      loadRoute('products', './routes/productRoutes.js', '/api/products'),
      loadRoute('vendors', './routes/vendorRoutes.js', '/api/vendors'),
      loadRoute('uoms', './routes/uomRoutes.js', '/api/uoms'),
      loadRoute('purchase-orders', './routes/purchaseOrderRoutes.js', '/api/purchase-orders'),
      loadRoute('deliveries', './routes/deliveryReceiptRoutes.js', '/api/deliveries'),
      loadRoute('customers', './routes/customerRoutes.js', '/api/customers'),
      loadRoute('sales', './routes/salesRoutes.js', '/api/sales'),
      loadRoute('payments', './routes/paymentRoutes.js', '/api/payments'),
      loadRoute('expenses', './routes/expenseRoutes.js', '/api/expenses'),
      loadRoute('asset-accounts', './routes/assetAccountRoutes.js', '/api/asset-accounts'),
      loadRoute('reports', './routes/reportRoutes.js', '/api/reports'),
      loadRoute('dashboard', './routes/dashboardRoutes.js', '/api/dashboard'),
      loadRoute('saved-states', './routes/savedStateRoutes.js', '/api/records'),
      loadRoute('settings', './routes/settingsRoutes.js', '/api/settings'),
      loadRoute('users', './routes/userRoutes.js', '/api/users'),
      loadRoute('daily-cash-drawer', './routes/dailyCashDrawerRoutes.js', '/api/daily-cash-drawer'),
      loadRoute('check-approvals', './routes/checkApprovalRoutes.js', '/api/check-approvals'),
    ])

    // #region debug-point A:post-load-summary
    {
      const failed = Object.entries(routeStatuses).filter(([_, r]) => !r.ok);
      const okCount = Object.keys(routeStatuses).length - failed.length;
      console.log(`[Router Load Summary] total=${Object.keys(routeStatuses).length} ok=${okCount} failed=${failed.length}`);
      if (failed.length > 0) {
        for (const [name, r] of failed) {
          console.error(`[Router FAILED] ${name} @ ${r.mount} -> ${r.error?.substring(0, 500)}`);
        }
      }
    }
    // #endregion

    try {
      const { initializeAssetAccounts } = await import('./services/assetAccountService.js')
      await initializeAssetAccounts()
      console.log('  ✓ Asset accounts initialized')
    } catch (e: any) { console.error('  ✗ Asset accounts init:', e.message?.substring(0, 80)) }

    app.get('/{*path}', (_req, res, next) => {
      if (_req.path.startsWith('/api')) return next();
        const indexPath = path.join(frontendPath, 'index.html');
        if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
      next();
    });

    // #region debug-point A,B,E:api-404-logger
    app.use('/api', (req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (res.headersSent) return next();
      const origin = req.headers.origin || 'none';
      const auth = req.headers.authorization ? `Bearer ${(req.headers.authorization as string).substring(7, 23)}...` : 'no-auth';
      console.error(`[API 404] ${req.method} ${req.originalUrl} | origin=${origin} | ${auth} | ua=${(req.headers['user-agent'] || '').substring(0, 120)}`);
      res.status(404).json({ error: 'Not Found', path: req.path, method: req.method, timestamp: new Date().toISOString() });
    });
    // #endregion

    app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      console.error('Error:', err)
      res.status(500).json({ error: 'Internal server error' })
    })

    console.log(`Database: ${process.env.DB_MODE || 'mongodb'}`)
    startListening()
  } catch (error) {
    console.error('Failed to start server:', error)
    process.exit(1)
  }
}

startServer()

export default app
