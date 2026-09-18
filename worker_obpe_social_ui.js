import base from './worker_obpe_social.js';

const READONLY_API='https://imhzjlxbnovjvqlyawmg.supabase.co/functions/v1/one-boat-admin-readonly';
const SAFE_SCHEDULE='https://imhzjlxbnovjvqlyawmg.supabase.co/functions/v1/one-boat-entry-guard-api/schedule';

const SUPABASE_AUTH='https://imhzjlxbnovjvqlyawmg.supabase.co/auth/v1';
const SUPABASE_PUBLISHABLE='sb_publishable_-VcTpMDA4uaDfKmqxYw-0Q_v2vAZe7V';
const MEMBERSHIP_API='https://imhzjlxbnovjvqlyawmg.supabase.co/functions/v1/one-boat-membership-api';
const ADMIN_ACCESS_COOKIE='ob_admin_at';
const ADMIN_REFRESH_COOKIE='ob_admin_rt';


function cookieMap(request){
  const out={};
  const raw=request.headers.get('cookie')||'';
  for(const part of raw.split(';')){
    const i=part.indexOf('=');
    if(i<1)continue;
    const k=part.slice(0,i).trim(),v=part.slice(i+1).trim();
    try{out[k]=decodeURIComponent(v)}catch{out[k]=v}
  }
  return out;
}
function adminCookie(name,value,maxAge){
  return name+'='+encodeURIComponent(value)+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age='+Math.max(0,Math.floor(maxAge));
}
function clearAdminCookies(){
  return [
    adminCookie(ADMIN_ACCESS_COOKIE,'',0),
    adminCookie(ADMIN_REFRESH_COOKIE,'',0)
  ];
}
function withAdminCookies(response,cookies){
  if(!cookies||!cookies.length)return response;
  const h=new Headers(response.headers);
  for(const x of cookies)h.append('set-cookie',x);
  h.set('cache-control','no-store');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers:h});
}
async function authToken(grant,body){
  const r=await fetch(SUPABASE_AUTH+'/token?grant_type='+encodeURIComponent(grant),{
    method:'POST',
    headers:{apikey:SUPABASE_PUBLISHABLE,'content-type':'application/json'},
    body:JSON.stringify(body||{}),
    cache:'no-store'
  });
  if(!r.ok)return null;
  const j=await r.json().catch(()=>null);
  return j&&j.access_token?j:null;
}
async function verifyAdminAccess(accessToken){
  if(!accessToken)return null;
  const r=await fetch(MEMBERSHIP_API+'?action=me',{
    method:'GET',
    headers:{apikey:SUPABASE_PUBLISHABLE,authorization:'Bearer '+accessToken,accept:'application/json'},
    cache:'no-store'
  }).catch(()=>null);
  if(!r||!r.ok)return null;
  const j=await r.json().catch(()=>null);
  if(!j||j.staff_access!==true)return null;
  return {role:String(j.staff_role||'operator')};
}
function tokenCookies(t){
  const age=Math.max(60,Number(t&&t.expires_in||3600)-30);
  const out=[adminCookie(ADMIN_ACCESS_COOKIE,String(t.access_token||''),age)];
  if(t&&t.refresh_token)out.push(adminCookie(ADMIN_REFRESH_COOKIE,String(t.refresh_token),2592000));
  return out;
}
async function adminSession(request){
  const ck=cookieMap(request),at=ck[ADMIN_ACCESS_COOKIE]||'',rt=ck[ADMIN_REFRESH_COOKIE]||'';
  if(at){
    const staff=await verifyAdminAccess(at);
    if(staff)return {ok:true,role:staff.role,cookies:[]};
  }
  if(rt){
    const t=await authToken('refresh_token',{refresh_token:rt});
    if(t){
      const staff=await verifyAdminAccess(t.access_token);
      if(staff)return {ok:true,role:staff.role,cookies:tokenCookies(t)};
    }
  }
  return {ok:false,role:null,cookies:clearAdminCookies()};
}
async function adminLogin(request){
  const b=await request.json().catch(()=>({}));
  const email=String(b&&b.email||'').trim().toLowerCase();
  const password=String(b&&b.password||'');
  if(!email||!password)return json({ok:false,error:'login_failed'},401);
  const t=await authToken('password',{email,password});
  if(!t)return json({ok:false,error:'login_failed'},401);
  const staff=await verifyAdminAccess(t.access_token);
  if(!staff)return withAdminCookies(json({ok:false,error:'admin_access_denied'},403),clearAdminCookies());
  return withAdminCookies(json({ok:true,staff:true,role:staff.role}),tokenCookies(t));
}
function adminLogout(){
  return withAdminCookies(json({ok:true,logged_out:true}),clearAdminCookies());
}
function loginPage(){
  const html='<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#020914"><title>ONE BOAT ADMIN</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#020914;color:#edf8ff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:grid;place-items:center;padding:24px}.box{width:min(100%,390px);background:linear-gradient(145deg,#091b30,#030b17);border:1px solid #174264;border-radius:18px;padding:24px;box-shadow:0 18px 60px #0008}.eyebrow{font-size:11px;letter-spacing:.18em;color:#58d7ff;font-weight:800}.logo{font-size:28px;font-weight:900;margin:7px 0 3px}.sub{color:#8fa8bf;font-size:12px;margin-bottom:24px}.field{margin:14px 0}.field label{display:block;font-size:11px;color:#94aabd;margin-bottom:6px}.field input{width:100%;height:48px;border-radius:11px;border:1px solid #1d4667;background:#06182b;color:#fff;font-size:16px;padding:0 13px;outline:none}.field input:focus{border-color:#45d7ff}.btn{width:100%;height:50px;border:0;border-radius:11px;background:linear-gradient(90deg,#0579ba,#1fc8ef);color:#fff;font-size:15px;font-weight:900;margin-top:10px}.btn:disabled{opacity:.55}.msg{min-height:20px;margin-top:12px;color:#ff9bad;font-size:12px;text-align:center}.secure{margin-top:20px;padding-top:14px;border-top:1px solid #153149;color:#718ba2;font-size:10px;line-height:1.6}</style></head><body><main class="box"><div class="eyebrow">ADMIN ONLY</div><div class="logo">ONE BOAT</div><div class="sub">管理サイト｜本番監視</div><form id="f"><div class="field"><label>メールアドレス</label><input id="e" type="email" autocomplete="username" required></div><div class="field"><label>パスワード</label><input id="p" type="password" autocomplete="current-password" required></div><button id="b" class="btn" type="submit">管理画面へログイン</button><div id="m" class="msg"></div></form><div class="secure">管理者権限が有効なアカウントのみアクセスできます。セッションはSecure / HttpOnly Cookieで保持されます。</div></main><script>document.getElementById("f").addEventListener("submit",async function(ev){ev.preventDefault();var b=document.getElementById("b"),m=document.getElementById("m");b.disabled=true;m.textContent="";try{var r=await fetch("/api/admin-auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:document.getElementById("e").value,password:document.getElementById("p").value})});if(!r.ok){m.textContent="ログイン情報または管理者権限を確認してください";return}location.replace("/")}catch(e){m.textContent="ログインできませんでした"}finally{b.disabled=false}});</script></body></html>';
  return new Response(html,{status:200,headers:{'content-type':'text/html;charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}});
}
function isProtectedAdminApi(path){
  return path==='/api/admin-readonly'||path==='/api/live/predict'||path==='/api/history'||path==='/api/detail'||path==='/api/performance'||path==='/api/patterns'||path==='/api/schedule';
}
function isAdminDocument(path){
  return path==='/'||path==='/index.html'||path.endsWith('.html');
}

function json(x,status=200){
  return new Response(JSON.stringify(x),{status,headers:{'content-type':'application/json;charset=utf-8','cache-control':'no-store','x-one-boat-read-only':'1'}});
}
function jstDate(){return new Date(Date.now()+9*3600000).toISOString().slice(0,10)}
async function readonlyFetch(params){
  const target=new URL(READONLY_API);
  for(const [k,v] of params) if(v!==null&&v!==undefined&&v!=='') target.searchParams.set(k,String(v));
  const r=await fetch(target,{method:'GET',headers:{accept:'application/json'},cache:'no-store'});
  const h=new Headers(r.headers);
  h.set('cache-control','no-store');
  h.set('x-one-boat-read-only','1');
  return new Response(r.body,{status:r.status,headers:h});
}
async function readonlyStatsJson(){
  const r=await fetch(`${READONLY_API}?mode=stats&_=${Date.now()}`,{headers:{accept:'application/json'},cache:'no-store'});
  if(!r.ok) throw Error(`readonly_stats_${r.status}`);
  return r.json();
}
async function performanceCompat(u){
  try{
    const j=await readonlyStatsJson(),date=u.searchParams.get('date')||jstDate();
    let s=null;
    if(date===jstDate()) s=j?.periods?.today||null;
    else {
      const row=(j?.breakdowns?.all?.daily||[]).find(x=>String(x?.name)===date);
      if(row) s={race_count:row.race_count,investment:row.investment,return_yen:row.return_yen,profit_yen:row.profit_yen,roi:row.roi,hit_count:row.hit_count,hit_rate:row.hit_rate};
    }
    s=s||{race_count:0,investment:0,return_yen:0,profit_yen:0,roi:null,hit_count:0,hit_rate:null};
    return json({ok:true,read_only:true,date,investment:s.investment,return_yen:s.return_yen,profit_yen:s.profit_yen,roi:s.roi,hit_rate:s.hit_rate,hit_count:s.hit_count,settled_count:s.race_count,unsettled_count:0,records:[]});
  }catch{return json({ok:false,read_only:true,error:'readonly_stats_unavailable'},502)}
}
async function safeSchedule(u){
  const target=new URL(SAFE_SCHEDULE);
  target.search=u.search;
  try{
    const r=await fetch(target,{headers:{accept:'application/json'},cache:'no-store'});
    const h=new Headers(r.headers);
    h.set('cache-control','no-store');
    h.set('x-one-boat-read-only','1');
    return new Response(r.body,{status:r.status,headers:h});
  }catch{return json({ok:false,error:'schedule_unavailable'},502)}
}
async function injectAdminReadonly(response){
  if(!response) return response;
  const headers=new Headers(response.headers);
  const ct=headers.get('content-type')||'';
  if(!ct.includes('text/html')) return response;
  let html=await response.text();
  html=html.replace(/<script src="\/performance-aggregates\.js[^\"]*"><\/script>/g,'');
  html=html.replace("if(d==='SKIP'||r.locked)return'skip'","if(d==='SKIP')return'skip'");
  html=html.replace("if(final){r.locked=true;if(r.decision!=='ENTER'){r.decision='SKIP';r.stake_total_yen=0}}","if(final){r.locked=p.locked===true}");
  if(!html.includes('/admin-readonly-ui.js')){
    const tag='<script src="/admin-readonly-ui.js?v=20260918-ro4"></script>';
    if(/<script src="\/obpe-ui\.js/.test(html)) html=html.replace(/<script src="\/obpe-ui\.js/,tag+'<script src="/obpe-ui.js');
    else html=html.replace('</head>',tag+'</head>');
  }
  headers.set('cache-control','no-store');
  headers.set('x-one-boat-ui','admin-readonly-20260918-ro4');
  headers.set('x-one-boat-read-only','1');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request,env,ctx){
    const u=new URL(request.url);
    if(u.pathname==='/api/admin-auth/login'&&request.method==='POST') return adminLogin(request);
    if(u.pathname==='/api/admin-auth/logout'&&request.method==='POST') return adminLogout();
    if(u.pathname==='/api/admin-auth/me'){
      const s=await adminSession(request);
      return withAdminCookies(s.ok?json({ok:true,staff:true,role:s.role}):json({ok:false,error:'admin_auth_required'},401),s.cookies);
    }
    if(u.pathname==='/admin-login'){
      const s=await adminSession(request);
      if(s.ok){
        const r=new Response(null,{status:302,headers:{location:'/', 'cache-control':'no-store'}});
        return withAdminCookies(r,s.cookies);
      }
      return withAdminCookies(loginPage(),s.cookies);
    }
    let auth=null;
    if(isProtectedAdminApi(u.pathname)||isAdminDocument(u.pathname)){
      auth=await adminSession(request);
      if(!auth.ok){
        if(isProtectedAdminApi(u.pathname)) return withAdminCookies(json({ok:false,error:'admin_auth_required'},401),auth.cookies);
        const r=new Response(null,{status:302,headers:{location:'/admin-login','cache-control':'no-store'}});
        return withAdminCookies(r,auth.cookies);
      }
    }
    const secured=(r)=>withAdminCookies(r,auth&&auth.cookies||[]);
    if(u.pathname==='/api/admin-readonly'){
      return secured(await readonlyFetch(u.searchParams));
    }
    if(u.pathname==='/api/live/predict'){
      return secured(await readonlyFetch(new URLSearchParams({mode:'race',race_code:u.searchParams.get('race_code')||''})));
    }
    if(u.pathname==='/api/history'){
      const p=new URLSearchParams({mode:'records',date:u.searchParams.get('date')||jstDate()});
      for(const k of ['venue','race','decision']){const v=u.searchParams.get(k);if(v)p.set(k,v)}
      return secured(await readonlyFetch(p));
    }
    if(u.pathname==='/api/detail'){
      return secured(await readonlyFetch(new URLSearchParams({mode:'detail',race_code:u.searchParams.get('race_code')||''})));
    }
    if(u.pathname==='/api/performance') return secured(await performanceCompat(u));
    if(u.pathname==='/api/patterns') return secured(await readonlyFetch(new URLSearchParams({mode:'stats'})));
    if(u.pathname==='/api/schedule') return secured(await safeSchedule(u));
    const response=await base.fetch(request,env,ctx);
    return secured(await injectAdminReadonly(response));
  },
  async scheduled(controller,env,ctx){
    if(typeof base.scheduled==='function') return base.scheduled(controller,env,ctx);
  }
};
