import base from './worker_customer.js';

const THREADS_STATS='https://imhzjlxbnovjvqlyawmg.supabase.co/functions/v1/one-boat-public-threads-stats';
const VENUES=['桐生','戸田','江戸川','平和島','多摩川','浜名湖','蒲郡','常滑','津','三国','びわこ','住之江','尼崎','鳴門','丸亀','児島','宮島','徳山','下関','若松','芦屋','福岡','唐津','大村'];

async function exactHero(request, env) {
  const origin = new URL(request.url).origin;
  const parts = [];
  for (let i = 0; i < 5; i++) {
    const r = await env.ASSETS.fetch(new Request(new URL(`/hero-chunk-${i}.txt`, origin), request));
    if (!r.ok) return new Response('hero unavailable', { status: 503 });
    parts.push((await r.text()).trim());
  }
  const bin = atob(parts.join(''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Response(bytes, {
    status: 200,
    headers: {
      'content-type': 'image/jpeg',
      'cache-control': 'no-store, max-age=0',
      'x-content-type-options': 'nosniff'
    }
  });
}

async function freePublicStats() {
  try {
    const r = await fetch(THREADS_STATS, { headers: { accept: 'application/json' }, cache: 'no-store' });
    if (!r.ok) throw new Error(`threads_stats_${r.status}`);
    const d = await r.json();
    if (!d?.ok) throw new Error('threads_stats_invalid');
    d.latest = Array.isArray(d.latest) ? d.latest.map(x => ({
      ...x,
      venue_name: VENUES[Number(x.venue_code)-1] || `場${x.venue_code||'--'}`
    })) : [];
    return new Response(JSON.stringify(d), {
      status: 200,
      headers: {
        'content-type': 'application/json;charset=utf-8',
        'cache-control': 'public,max-age=30',
        'x-one-boat-stats-scope': 'threads-free-public-only'
      }
    });
  } catch (e) {
    return null;
  }
}

export default {
  async fetch(request, env, ctx) {
    const u = new URL(request.url);
    if (u.pathname === '/hero-top.webp' || u.pathname === '/hero-top.jpg' || u.pathname === '/assets/home-approved-live.webp' || u.pathname === '/assets/home-approved-exact.webp') {
      return exactHero(request, env);
    }
    if (u.pathname === '/api/public/stats') {
      const r = await freePublicStats();
      if (r) return r;
    }
    return base.fetch(request, env, ctx);
  }
};
