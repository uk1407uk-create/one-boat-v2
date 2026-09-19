import base from './worker_member.js';

const FREE_PUBLIC_STATS='https://imhzjlxbnovjvqlyawmg.supabase.co/functions/v1/one-boat-public-free-stats';
const CANONICAL_ORIGIN='https://one-boat-club.jp';
const VENUES=['桐生','戸田','江戸川','平和島','多摩川','浜名湖','蒲郡','常滑','津','三国','びわこ','住之江','尼崎','鳴門','丸亀','児島','宮島','徳山','下関','若松','芦屋','福岡','唐津','大村'];

function canonicalRedirect(request){
  const u=new URL(request.url);
  const legacy=u.hostname==='www.one-boat-club.jp'||u.hostname==='one-boat-customer.uk-1407-uk.workers.dev';
  if(!legacy) return null;
  return Response.redirect(`${CANONICAL_ORIGIN}${u.pathname}${u.search}${u.hash}`,308);
}

async function assetPage(request,env,path){
  const u=new URL(request.url);
  u.pathname=path;
  u.search='';
  const r=await env.ASSETS.fetch(new Request(u,{method:'GET',headers:{accept:'text/html,*/*;q=0.8'}}));
  const h=new Headers(r.headers);
  h.set('content-type','text/html;charset=utf-8');
  h.set('cache-control','no-store, max-age=0, must-revalidate');
  h.set('pragma','no-cache');
  h.set('x-content-type-options','nosniff');
  return new Response(r.body,{status:r.status,headers:h});
}

async function freshLanding(request, env) {
  const origin=new URL(request.url).origin;
  const r=await env.ASSETS.fetch(new Request(new URL('/index.html',origin),{method:'GET',headers:{accept:'text/html,*/*;q=0.8'}}));
  if(!r.ok) return r;
  const h=new Headers(r.headers);
  h.set('content-type','text/html;charset=utf-8');
  h.set('cache-control','no-store, max-age=0, must-revalidate');
  h.set('pragma','no-cache');
  h.set('x-content-type-options','nosniff');
  h.set('x-one-boat-landing','native-mobile-v1');
  return new Response(r.body,{status:200,headers:h});
}

async function legacyTopFallback(request, env) {
  const origin=new URL(request.url).origin;
  const r=await env.ASSETS.fetch(new Request(new URL('/hero-reference.svg',origin),{method:'GET',headers:{accept:'image/svg+xml,image/*,*/*;q=0.8'}}));
  if(!r.ok) return new Response('top unavailable',{status:503});
  const h=new Headers(r.headers);
  h.set('content-type','image/svg+xml;charset=utf-8');
  h.set('cache-control','no-store, max-age=0');
  h.set('x-content-type-options','nosniff');
  h.set('x-one-boat-top','legacy-safe-fallback');
  return new Response(r.body,{status:200,headers:h});
}

async function exactHero(request, env) {
  const origin=new URL(request.url).origin;
  const parts=[];
  for(let i=0;i<5;i++){
    const r=await env.ASSETS.fetch(new Request(new URL(`/hero-chunk-${i}.txt`,origin),{method:'GET'}));
    if(!r.ok) return new Response('hero unavailable',{status:503});
    parts.push((await r.text()).trim());
  }
  const bin=atob(parts.join(''));
  const bytes=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
  return new Response(bytes,{status:200,headers:{'content-type':'image/jpeg','cache-control':'no-store, max-age=0','x-content-type-options':'nosniff'}});
}

async function freePublicStats(request,ctx){
  const u=new URL(request.url),key=new Request(`${u.origin}/__edge_cache/free-public-stats-boxai2`);
  try{const hit=await caches.default.match(key);if(hit)return hit}catch{}
  try{
    const r=await fetch(FREE_PUBLIC_STATS,{headers:{accept:'application/json'},cache:'no-store'});
    if(!r.ok) throw new Error(`free_stats_${r.status}`);
    const d=await r.json();
    if(!d?.ok) throw new Error('free_stats_invalid');
    d.latest=Array.isArray(d.latest)?d.latest.map(x=>({...x,venue_name:VENUES[Number(x.venue_code)-1]||`場${x.venue_code||'--'}`})):[];
    const out=new Response(JSON.stringify(d),{status:200,headers:{'content-type':'application/json;charset=utf-8','cache-control':'public,max-age=120','x-one-boat-stats-scope':'site-free-public-only'}});
    if(ctx?.waitUntil)ctx.waitUntil(caches.default.put(key,out.clone()).catch(()=>{}));
    return out;
  }catch(e){return null;}
}

export default{
  async fetch(request,env,ctx){
    const canonical=canonicalRedirect(request);
    if(canonical) return canonical;
    const u=new URL(request.url);
    if(u.pathname==='/'||u.pathname==='/index.html') return freshLanding(request,env);
    if(u.pathname==='/register'||u.pathname==='/register/') return assetPage(request,env,'/signup.html');
    if(u.pathname==='/login'||u.pathname==='/login/') return assetPage(request,env,'/login.html');
    if(u.pathname==='/top-screen.webp') return legacyTopFallback(request,env);
    if(u.pathname==='/hero-top.jpg'||u.pathname==='/assets/home-approved-live.webp'||u.pathname==='/assets/home-approved-exact.webp') return exactHero(request,env);
    if(u.pathname==='/api/public/stats'){
      const r=await freePublicStats(request,ctx);
      if(r) return r;
    }
    return base.fetch(request,env,ctx);
  }
};
