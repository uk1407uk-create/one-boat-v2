import base from './worker_customer.js';

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

export default {
  async fetch(request, env, ctx) {
    const u = new URL(request.url);
    if (u.pathname === '/hero-top.webp' || u.pathname === '/hero-top.jpg' || u.pathname === '/assets/home-approved-live.webp' || u.pathname === '/assets/home-approved-exact.webp') {
      return exactHero(request, env);
    }
    return base.fetch(request, env, ctx);
  }
};
