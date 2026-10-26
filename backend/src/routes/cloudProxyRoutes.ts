import { Router } from 'express';
import https from 'https';
import http from 'http';
import dns from 'dns';
import { URL as NodeURL } from 'url';

const router = Router();

const IS_SQLITE = (process.env.DB_MODE || 'mongodb') === 'sqlite';

if (IS_SQLITE) {
  try { dns.setDefaultResultOrder('verbatim'); } catch { /* ignore on older Node */ }

  const CLOUD_URL = process.env.CLOUD_URL || '';
  const PREFIX = '[CloudProxy]';

  /**
   * DB_MODE=sqlite ONLY — wildcard matches every subpath under /api/_cloud_proxy/*
   * Express 5 / path-to-regexp v8 syntax: named wildcard '/*splat' (bare '*' and
   * legacy '(.*)' both throw "Missing parameter name"). The captured segments are
   * exposed as req.params.splat (an array); we also fall back to req.path.
   */
  router.all('/*splat', (req: any, res: any) => {
    const startedAt = Date.now();
    const splat = req.params && req.params.splat;
    const subPathRaw: string = Array.isArray(splat)
      ? splat.join('/')
      : (splat != null ? String(splat) : (req.path || ''));
    const subPath = subPathRaw.startsWith('/') ? subPathRaw.slice(1) : subPathRaw;
    const queryStr = (req.url || '').split('?').slice(1).join('?');
    console.log(`${PREFIX} IN ${req.method} subPath="${subPath}" query="${queryStr}" DB_MODE=${process.env.DB_MODE || 'mongodb'}`);

    try {
      if (process.env.DB_MODE !== 'sqlite') {
        console.warn(`${PREFIX} 403 DB_MODE != sqlite → refused`);
        res.status(403).json({ error: 'Cloud proxy only available on local SQLite offline mode' });
        return;
      }
      if (!CLOUD_URL) {
        res.status(503).json({ error: 'Cloud sync is not configured' });
        return;
      }
      const target = new NodeURL(CLOUD_URL);
      const isHttps = target.protocol === 'https:';
      const net: any = isHttps ? https : http;

      const outgoingHeaders: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers || {})) {
        const lk = k.toLowerCase();
        if (['host', 'connection', 'content-length'].includes(lk)) continue;
        if (v == null) continue;
        outgoingHeaders[k] = Array.isArray(v) ? v.join(',') : String(v);
      }
      if (req.body != null) outgoingHeaders['Content-Type'] = outgoingHeaders['Content-Type'] || 'application/json';
      const bodyStr = (req.body != null && typeof req.body !== 'string') ? JSON.stringify(req.body) : (req.body || undefined);
      const outgoingPath = '/api/' + subPath + (queryStr ? '?' + queryStr : '');
      const port = target.port ? Number(target.port) : (isHttps ? 443 : 80);

      const options: any = {
        hostname: target.hostname,
        port,
        path: outgoingPath,
        method: req.method,
        headers: outgoingHeaders,
        timeout: 45000,
        rejectUnauthorized: false,
        family: 4,
        hints: dns.ADDRCONFIG | dns.V4MAPPED,
        lookup: (hostname: string, _opts: any, cb: any) => dns.lookup(hostname, { family: 4, all: false, hints: dns.ADDRCONFIG | dns.V4MAPPED }, cb),
      };
      console.log(`${PREFIX} → OUT ${options.method} ${target.protocol}//${target.hostname}:${port}${outgoingPath}`);

      const outReq = net.request(options, (outRes: any) => {
        const duration = Date.now() - startedAt;
        const outHeaders: Record<string, any> = { ...outRes.headers };
        for (const k of Object.keys(outHeaders)) {
          if (k.toLowerCase().startsWith('access-control-')) delete outHeaders[k];
        }
        outHeaders['Access-Control-Allow-Origin'] = '*';
        outHeaders['Access-Control-Allow-Headers'] = '*';
        outHeaders['Access-Control-Allow-Methods'] = '*';
        console.log(`${PREFIX} ← ${outRes.statusCode || '???'} in ${duration}ms`);
        res.writeHead(outRes.statusCode || 502, outHeaders);
        outRes.pipe(res);
      });

      outReq.on('error', (e: any) => {
        const duration = Date.now() - startedAt;
        const msg = (e?.message || 'Unknown error').toString();
        const code = (e?.code || 'UNKNOWN').toString();
        const fullUrl = `${target.protocol}//${target.hostname}:${port}${outgoingPath}`;
        console.error(`${PREFIX} ERROR outbound code=${code} duration=${duration}ms msg=${msg} url=${fullUrl}`);
        if (!res.headersSent) {
          res.status(502).json({ error: 'Cloud proxy outbound failed', code, message: msg, url: fullUrl });
        }
      });
      outReq.on('timeout', () => {
        try { outReq.destroy(new Error('Cloud proxy timeout')); } catch { /* ignore */ }
      });
      if (bodyStr) outReq.write(bodyStr);
      outReq.end();
    } catch (e: any) {
      const msg = (e?.message || 'Unknown error').toString();
      console.error(`${PREFIX} INNER CATCH:`, msg);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Proxy setup error', message: msg });
      }
    }
  });
}
// If NOT sqlite: exports empty Router with zero handlers.
// Absolutely critical: prevents the cloud server (DB_MODE=mongodb) from ever running Router.all('…') registration during ESM import.
// Previous bug: path-to-regexp v7 rejected bare '*' pattern during ModuleJob.run import (file:///…/cloudProxyRoutes.ts:18)
// → CRASH before app.listen() — PM2 online but port 3000 never bound, nginx 502 everything.

export default router;
