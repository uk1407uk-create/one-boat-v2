import base from './worker_customer.js';

const SUPABASE_URL='https://imhzjlxbnovjvqlyawmg.supabase.co';
const SUPABASE_KEY='sb_publishable_-VcTpMDA4uaDfKmqxYw-0Q_v2vAZe7V';
const MEMBERSHIP_API=`${SUPABASE_URL}/functions/v1/one-boat-membership-api`;
const VISIBILITY_API=`${SUPABASE_URL}/functions/v1/one-boat-public-visibility`;
const HISTORY_API=`${SUPABASE_URL}/functions/v1/one-boat-obpe-history`;
const RACE_ANALYSIS_API=`${SUPABASE_URL}/functions/v1/one-boat-race-analysis-api`;
const LIVE_ORIGINAL_API=`${SUPABASE_URL}/functions/v1/one-boat-live-original`;
const ACCESS_COOKIE='ob_at';
const REFRESH_COOKIE='ob_rt';

function json(data,status=200,cookies=[]){const h=new Headers({'content-type':'application/json;charset=utf-8','cache-control':'no-store, max-age=0','x-content-type-options':'nosniff'});for(const c of cookies)h.append('set-cookie',c);return new Response(JSON.stringify(data),{status,headers:h})}
function redirect(url,status=302,cookies=[]){const h=new Headers({location:url,'cache-control':'no-store'});for(const c of cookies)h.append('set-cookie',c);return new Response(null,{status,headers:h})}
function cookieMap(request){const out={};for(const part of String(request.headers.get('cookie')||'').split(';')){const i=part.indexOf('=');if(i>0)out[part.slice(0,i).trim()]=decodeURIComponent(part.slice(i+1).trim())}return out}
function authCookies(d){const max=Number(d?.expires_in||3600);return [`${ACCESS_COOKIE}=${encodeURIComponent(d.access_token)}; Path=/; Max-Age=${Math.max(60,max)}; HttpOnly; Secure; SameSite=Lax`,`${REFRESH_COOKIE}=${encodeURIComponent(d.refresh_token)}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`]}
function clearCookies(){return [`${ACCESS_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,`${REFRESH_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`]}
function sameOrigin(request){const origin=request.headers.get('origin');return !origin||origin===new URL(request.url).origin}
async function bodyJson(request){try{return await request.json()}catch{return{}}}
async function sb(path,{method='GET',token,body}={}){const h=new Headers({'apikey':SUPABASE_KEY,'accept':'application/json'});if(token)h.set('authorization',`Bearer ${token}`);if(body!==undefined)h.set('content-type','application/json');return fetch(`${SUPABASE_URL}${path}`,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'})}
async function authUser(token){if(!token)return null;const r=await sb('/auth/v1/user',{token});if(!r.ok)return null;return r.json()}
async function refreshSession(refreshToken){if(!refreshToken)return null;const r=await sb('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:refreshToken}});if(!r.ok)return null;const d=await r.json();return d?.access_token&&d?.refresh_token?d:null}
async function entitlement(token){try{const r=await fetch(`${MEMBERSHIP_API}?action=me`,{headers:{authorization:`Bearer ${token}`,accept:'application/json'},cache:'no-store'});if(!r.ok)return null;const d=await r.json().catch(()=>null);return d?.ok?d:null}catch{return null}}
function unavailableEntitlement(){return{effective_plan:'UNKNOWN',has_paid_access:false,access_expires_at:null,stored_status:'unavailable',cancel_at_period_end:false,eligibility_confirmed:false}}
async function resolveSession(request){const c=cookieMap(request);let token=c[ACCESS_COOKIE]||'',user=await authUser(token),cookies=[];if(!user&&c[REFRESH_COOKIE]){const fresh=await refreshSession(c[REFRESH_COOKIE]);if(fresh){token=fresh.access_token;cookies=authCookies(fresh);user=await authUser(token)}}if(!user)return{ok:false,cookies:clearCookies()};const ent=await entitlement(token);return{ok:true,token,user:{id:user.id,email:user.email||''},ent:ent||unavailableEntitlement(),entitlement_unavailable:!ent,cookies}}
function publicSession(s){if(!s.ok)return{ok:true,logged_in:false,plan:'guest',paid_access:false};const e=s.ent||unavailableEntitlement();const plan=e.effective_plan==='DAY_PASS'?'day_pass':e.effective_plan==='CLUB_MONTHLY'?'club_monthly':e.effective_plan==='STAFF'?'staff':e.effective_plan==='FREE'?'free':'unknown';return{ok:true,logged_in:true,email:s.user.email,plan,status:e.stored_status||'unavailable',access_expires_at:e.access_expires_at||null,next_billing_at:plan==='club_monthly'?(e.access_expires_at||null):null,cancel_at_period_end:!!e.cancel_at_period_end,age_20_confirmed:!!e.eligibility_confirmed,paid_access:e.has_paid_access===true,staff_access:e.staff_access===true,staff_role:e.staff_role||null,access_source:e.access_source||null,entitlement_available:!s.entitlement_unavailable}}
async function signup(request){if(!sameOrigin(request))return json({ok:false,error:'origin'},403);const b=await bodyJson(request),email=String(b.email||'').trim().toLowerCase(),password=String(b.password||'');if(!email||password.length<8)return json({ok:false,error:'invalid_input',message:'メールアドレスと8文字以上のパスワードを入力してください。'},400);if(b.age20!==true||b.terms!==true||b.privacy!==true)return json({ok:false,error:'consent_required',message:'20歳以上の確認と規約・プライバシーポリシーへの同意が必要です。'},400);const r=await fetch(`${SUPABASE_URL}/functions/v1/one-boat-auth-signup`,{method:'POST',headers:{'content-type':'application/json','origin':new URL(request.url).origin},body:JSON.stringify({email,password,age20:true,terms:true,privacy:true}),cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok)return json({ok:false,error:d?.error||'signup_failed',message:d?.message||'登録できませんでした。'},r.status);const lr=await sb('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});const ld=await lr.json().catch(()=>({}));if(lr.ok&&ld?.access_token&&ld?.refresh_token)return json({ok:true,logged_in:true,confirmation_required:false,message:'登録が完了しました。'},200,authCookies(ld));return json({ok:true,logged_in:false,confirmation_required:true,message:'登録は完了しました。ログイン画面からログインしてください。'})}
async function login(request){if(!sameOrigin(request))return json({ok:false,error:'origin'},403);const b=await bodyJson(request),email=String(b.email||'').trim().toLowerCase(),password=String(b.password||'');let r=await sb('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}}),d=await r.json().catch(()=>({}));if(!r.ok||!d.access_token){try{const pr=await fetch(`${MEMBERSHIP_API}?action=staff-provision`,{method:'POST',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify({email,password}),cache:'no-store'});if(pr.ok){r=await sb('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});d=await r.json().catch(()=>({}))}}catch{}}if(!r.ok||!d.access_token)return json({ok:false,error:'login_failed',message:'メールアドレスまたはパスワードを確認してください。'},401);return json({ok:true},200,authCookies(d))}
async function logout(request){if(!sameOrigin(request))return json({ok:false,error:'origin'},403);const c=cookieMap(request);if(c[ACCESS_COOKIE])await sb('/auth/v1/logout',{method:'POST',token:c[ACCESS_COOKIE]}).catch(()=>{});return json({ok:true},200,clearCookies())}
async function session(request){const s=await resolveSession(request);return json(publicSession(s),200,s.cookies||[])}
function raceAccessParams(request){
  const u=new URL(request.url),date=String(u.searchParams.get('date')||''),venue=Number(u.searchParams.get('venue')||u.searchParams.get('code')),race=Number(u.searchParams.get('race'));
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||venue<1||venue>24||race<1||race>12)return null;
  const raceKey=`${date.replaceAll('-','')}${String(venue).padStart(2,'0')}${String(race).padStart(2,'0')}`;
  return{date,venue,race,raceKey};
}
async function sitePublicRace(p){
  try{
    const u=new URL(VISIBILITY_API);u.searchParams.set('date',p.date);u.searchParams.set('scope','site');
    const r=await fetch(u,{headers:{accept:'application/json'},cache:'no-store'});
    if(!r.ok)return{ok:false,public:false};
    const d=await r.json().catch(()=>null);
    if(!d?.ok)return{ok:false,public:false};
    const keys=Array.isArray(d.keys)?d.keys.map(String):Array.isArray(d.rows)?d.rows.filter(x=>x?.site_public===true).map(x=>String(x?.race_key||'')):[];
    return{ok:true,public:keys.includes(p.raceKey)};
  }catch{return{ok:false,public:false}}
}
async function analysisAccess(request){
  const p=raceAccessParams(request);
  if(!p)return{allowed:false,response:json({ok:false,error:'invalid_race',message:'レース指定が正しくありません。'},400)};
  const visibility=await sitePublicRace(p);
  if(visibility.ok&&visibility.public)return{allowed:true,scope:'free_public',params:p,cookies:[]};
  const s=await resolveSession(request);
  if(!s.ok){
    return{allowed:false,response:json({ok:false,error:'payment_required',logged_in:false,message:'このレースの買い目・資金配分・PRO分析は会員向けです。',plans:{day_pass:{price_yen:980,label:'1日PASS',term:'24時間'},club_monthly:{price_yen:2980,label:'月額CLUB',term:'月'}}},402,s.cookies||[])};
  }
  if(s.entitlement_unavailable){
    return{allowed:false,response:json({ok:false,error:'entitlement_unavailable',logged_in:true,message:'会員状態を確認できません。時間をおいて再度お試しください。'},503,s.cookies||[])};
  }
  if(s.ent?.has_paid_access===true)return{allowed:true,scope:s.ent?.staff_access===true?'staff':'paid',params:p,cookies:s.cookies||[]};
  return{allowed:false,response:json({ok:false,error:'payment_required',logged_in:true,message:'このレースの買い目・資金配分・PRO分析は会員向けです。',plans:{day_pass:{price_yen:980,label:'1日PASS',term:'24時間'},club_monthly:{price_yen:2980,label:'月額CLUB',term:'月'}}},402,s.cookies||[])};
}
async function proxyProtectedAnalysis(request,targetBase){
  const access=await analysisAccess(request);
  if(!access.allowed)return access.response;
  const target=new URL(targetBase);
  target.searchParams.set('date',access.params.date);
  target.searchParams.set('venue',String(access.params.venue));
  target.searchParams.set('race',String(access.params.race));
  const upstream=await fetch(target,{headers:{accept:'application/json'},cache:'no-store'});
  const h=new Headers();
  h.set('content-type',upstream.headers.get('content-type')||'application/json;charset=utf-8');
  h.set('cache-control','private,no-store,max-age=0');
  h.set('x-one-boat-analysis-access',access.scope);
  h.set('x-content-type-options','nosniff');
  for(const c of access.cookies||[])h.append('set-cookie',c);
  return new Response(upstream.body,{status:upstream.status,headers:h});
}
function memberPredictionRecord(raw,accessScope){
  if(!raw)return null;
  const p=raw.prediction||{};
  const decision=String(raw.decision||p.decision||'').toUpperCase();
  const stake=Number(raw.stake_total_yen??p.stake_total_yen??0)||0;
  const bets=(Array.isArray(raw.bets)&&raw.bets.length?raw.bets:Array.isArray(p.production_picks)?p.production_picks:[]).map(x=>({
    ticket:x?.ticket||x?.combination||x?.bet||'',
    stake_yen:Number(x?.stake_yen??x?.amount??x?.stake??0)||0,
    odds:Number.isFinite(Number(x?.odds))?Number(x.odds):null,
    selection_role:x?.selection_role||null
  })).filter(x=>x.ticket);
  const settlement=raw.settlement?{
    hit:raw.settlement.hit===true,
    payout_yen:Number(raw.settlement.payout_yen||0)||0,
    profit_yen:Number.isFinite(Number(raw.settlement.profit_yen))?Number(raw.settlement.profit_yen):null,
    trifecta:raw.settlement?.result?.trifecta||raw.settlement?.trifecta||''
  }:null;
  return{
    race_key:raw.race_key||null,
    race_date:raw.race_date||null,
    venue_code:Number(raw.venue_code||0)||null,
    race_no:Number(raw.race_no||0)||null,
    deadline:raw.deadline||raw.close_time||null,
    decision,
    stake_total_yen:stake,
    bets,
    prediction:{
      decision,
      stake_total_yen:stake,
      reason:String(p.reason||raw.reason||''),
      skip_reason:String(p.skip_reason||''),
      selected_theory:p.selected_theory||null,
      current_theory:p.current_theory||null,
      strategy:p.strategy||null,
      support_materials:Array.isArray(p.support_materials)?p.support_materials:[],
      opposing_materials:Array.isArray(p.opposing_materials)?p.opposing_materials:[],
      production_picks:bets,
      model_version:p.model_version||raw.model_version||null
    },
    settlement,
    access_scope:accessScope
  };
}
async function protectedPrediction(request){
  const access=await analysisAccess(request);
  if(!access.allowed)return access.response;
  const u=new URL(HISTORY_API);
  u.searchParams.set('date',access.params.date);
  u.searchParams.set('venue',String(access.params.venue));
  u.searchParams.set('limit','50');
  const upstream=await fetch(u,{headers:{accept:'application/json'},cache:'no-store'});
  if(!upstream.ok)return json({ok:false,error:'prediction_upstream_unavailable',message:'正式予想を取得できませんでした。'},502,access.cookies||[]);
  const d=await upstream.json().catch(()=>null);
  const rows=Array.isArray(d?.records)?d.records:[];
  const raw=rows.find(x=>Number(x?.venue_code)===access.params.venue&&Number(x?.race_no)===access.params.race&&String(x?.race_date||'').slice(0,10)===access.params.date)||null;
  if(!raw)return json({ok:false,error:'prediction_not_found',message:'正式予想はまだ確定していません。'},404,access.cookies||[]);
  const record=memberPredictionRecord(raw,access.scope);
  return json({ok:true,access_scope:access.scope,record},200,access.cookies||[]);
}

async function protectedTodayEnter(request){
  const u0=new URL(request.url),date=String(u0.searchParams.get('date')||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return json({ok:false,error:'invalid_date'},400);
  const s=await resolveSession(request);
  if(!s.ok)return json({ok:false,error:'login_required',message:'ログインが必要です。'},401,s.cookies||[]);
  if(s.entitlement_unavailable)return json({ok:false,error:'entitlement_unavailable',message:'会員状態を確認できません。'},503,s.cookies||[]);
  if(s.ent?.has_paid_access!==true)return json({ok:false,error:'paid_access_required',message:'CLUB対象の正式ENTER一覧は有料会員向けです。'},403,s.cookies||[]);
  const u=new URL(HISTORY_API);u.searchParams.set('date',date);u.searchParams.set('limit','500');
  const upstream=await fetch(u,{headers:{accept:'application/json'},cache:'no-store'});
  if(!upstream.ok)return json({ok:false,error:'prediction_upstream_unavailable'},502,s.cookies||[]);
  const d=await upstream.json().catch(()=>null);
  const rows=(Array.isArray(d?.records)?d.records:[]).filter(x=>{
    const p=x?.prediction||{},decision=String(x?.decision||p?.decision||'').toUpperCase(),stake=Number(x?.stake_total_yen??p?.stake_total_yen??0)||0;
    return decision==='ENTER'&&stake>0&&String(x?.race_date||'').slice(0,10)===date;
  });
  const scope=s.ent?.staff_access===true?'staff':'paid';
  const records=rows.map(x=>memberPredictionRecord(x,scope)).filter(Boolean);
  return json({ok:true,date,count:records.length,records},200,s.cookies||[]);
}

async function billing(request,action){if(!sameOrigin(request))return json({ok:false,error:'origin'},403);const s=await resolveSession(request);if(!s.ok)return json({ok:false,error:'login_required',message:'ログインが必要です。'},401,s.cookies||[]);if(s.entitlement_unavailable)return json({ok:false,error:'entitlement_unavailable',message:'会員状態を確認できないため、安全のため購入・解約操作を停止しています。'},503,s.cookies||[]);if(s.ent?.staff_access===true)return json({ok:false,error:'staff_billing_disabled',message:'運営アカウントは決済不要です。'},409,s.cookies||[]);if(!s.ent?.eligibility_confirmed)return json({ok:false,error:'age_confirmation_required',message:'20歳以上の確認と規約同意が必要です。'},403,s.cookies||[]);const body=await bodyJson(request);if(action==='checkout'&&!['day_pass','club_monthly'].includes(String(body.plan||'')))return json({ok:false,error:'invalid_plan'},400,s.cookies||[]);const r=await fetch(`${MEMBERSHIP_API}?action=${encodeURIComponent(action)}`,{method:'POST',headers:{authorization:`Bearer ${s.token}`,'content-type':'application/json',accept:'application/json'},body:JSON.stringify(action==='checkout'?{plan:String(body.plan)}:{}),cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok){const pending=d?.error==='billing_not_configured'||d?.error==='stripe_not_configured';const message=pending?'決済システムの最終接続中です。購入・解約はまだ確定しません。':action==='cancel'?'解約処理を完了できませんでした。時間をおいて再度お試しください。':'決済サービスを利用できません。';return json({ok:false,error:d?.error||'billing_unavailable',message},r.status,s.cookies||[])}return json(d,200,s.cookies||[])}
async function protectedPage(request,env){const s=await resolveSession(request),baseUrl=new URL(request.url).origin;if(!s.ok)return redirect(`${baseUrl}/login?next=${encodeURIComponent('/premium.html')}`,302,s.cookies||[]);if(s.entitlement_unavailable||s.ent?.has_paid_access!==true)return redirect(`${baseUrl}/club.html?locked=1`,302,s.cookies||[]);const u=new URL(request.url);u.pathname='/premium.html';u.search='';const r=await env.ASSETS.fetch(new Request(u,request));const h=new Headers(r.headers);h.set('cache-control','private,no-store,max-age=0');h.set('x-robots-tag','noindex,nofollow');for(const c of s.cookies||[])h.append('set-cookie',c);return new Response(r.body,{status:r.status,headers:h})}

export default{async fetch(request,env,ctx){const u=new URL(request.url);try{if(u.pathname==='/api/auth/signup'&&request.method==='POST')return signup(request);if(u.pathname==='/api/auth/login'&&request.method==='POST')return login(request);if(u.pathname==='/api/auth/logout'&&request.method==='POST')return logout(request);if((u.pathname==='/api/auth/session'||u.pathname==='/api/member/session')&&request.method==='GET')return session(request);if(u.pathname==='/api/member/checkout-intent'&&request.method==='POST')return billing(request,'checkout');if(u.pathname==='/api/member/billing-portal'&&request.method==='POST')return billing(request,'portal');if(u.pathname==='/api/member/cancel-subscription'&&request.method==='POST')return billing(request,'cancel');if(u.pathname==='/api/member/analysis'&&request.method==='GET')return proxyProtectedAnalysis(request,RACE_ANALYSIS_API);if(u.pathname==='/api/member/prediction'&&request.method==='GET')return protectedPrediction(request);if(u.pathname==='/api/member/today-enter'&&request.method==='GET')return protectedTodayEnter(request);if(u.pathname==='/api/member/live-original'&&request.method==='GET')return proxyProtectedAnalysis(request,LIVE_ORIGINAL_API);if(u.pathname==='/premium.html')return protectedPage(request,env);return base.fetch(request,env,ctx)}catch{return json({ok:false,error:'member_service_unavailable',message:'会員サービスを一時的に利用できません。'},503)}}};
