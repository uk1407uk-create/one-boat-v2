import { neon } from '@neondatabase/serverless';

const SUPABASE = 'https://vtgswxrzklwynpvifbef.supabase.co/functions/v1';
const ROUTES = {
  '/api/live': 'one-boat-live-api',
  '/api/detail': 'boat-ai-race-detail',
  '/api/performance': 'boat-ai-performance',
  '/api/patterns': 'one-boat-venue-patterns',
  '/api/schedule': 'boat-ai-schedule',
};

function json(data, status=200) {
  return new Response(JSON.stringify(data), {status, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
}

async function health(env) {
  if (!env.DATABASE_URL) return json({ok:false, db:'neon', configured:false, error:'DATABASE_URL runtime secret is not configured'}, 503);
  try {
    const sql = neon(env.DATABASE_URL);
    const rows = await sql`select 1 as ok`;
    return json({ok: rows?.[0]?.ok === 1, db:'neon', configured:true});
  } catch (e) {
    return json({ok:false, db:'neon', configured:true, error:'database connection failed'}, 503);
  }
}

async function proxy(request, fn) {
  const incoming = new URL(request.url);
  const target = new URL(`${SUPABASE}/${fn}`);
  target.search = incoming.search;
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('cookie');
  const init = {method:request.method, headers, redirect:'follow'};
  if (!['GET','HEAD'].includes(request.method)) init.body = request.body;
  try {
    const r = await fetch(target, init);
    const h = new Headers(r.headers);
    h.set('cache-control', 'no-store');
    h.delete('set-cookie');
    return new Response(r.body, {status:r.status, statusText:r.statusText, headers:h});
  } catch (e) {
    return json({ok:false,error:'upstream temporarily unavailable'}, 502);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') return health(env);
    const fn = ROUTES[url.pathname];
    if (fn) return proxy(request, fn);
    return env.ASSETS.fetch(request);
  }
};
