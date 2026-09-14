import {DEFAULT_POLICY,CONFIDENCE_AXES,evaluateRace,aggregateBacktest,walkForward} from './engine_v51.js';
const UPSTREAM='https://vtgswxrzklwynpvifbef.supabase.co/functions/v1';
const ROUTES={'/api/live':'one-boat-live-api','/api/detail':'boat-ai-race-detail','/api/performance':'boat-ai-performance','/api/patterns':'one-boat-venue-patterns','/api/schedule':'boat-ai-schedule'};
const TTL={'/api/live':30,'/api/detail':20,'/api/performance':120,'/api/patterns':3600,'/api/schedule':300};
function json(x,status=200,cache='no-store'){return new Response(JSON.stringify(x),{status,headers:{'content-type':'application/json;charset=utf-8','cache-control':cache}})}
async function upstream(request,fn,path,ctx,suffix=''){const src=new URL(request.url),target=new URL(`${UPSTREAM}/${fn}${suffix}`);target.search=src.search;const key=new Request(src.toString(),{method:'GET'});try{if(request.method==='GET'){const cached=await caches.default.match(key);if(cached)return cached}}catch{}const headers=new Headers(request.headers);['host','cookie','origin','referer'].forEach(h=>headers.delete(h));const init={method:request.method,headers,redirect:'follow'};if(!['GET','HEAD'].includes(request.method))init.body=request.body;try{const r=await fetch(target,init),h=new Headers(r.headers);h.delete('set-cookie');h.set('cache-control',`public,max-age=${TTL[path]||30}`);const out=new Response(r.body,{status:r.status,headers:h});if(request.method==='GET'&&r.ok)ctx.waitUntil(Promise.resolve().then(()=>caches.default.put(key,out.clone())).catch(()=>{}));return out}catch{return json({ok:false,error:'upstream_unavailable'},502)}}
function jstYmd(){const d=new Date(Date.now()+9*3600*1000);return d.toISOString().slice(0,10).replaceAll('-','')}
async function official(u,ctx){const raw=(u.searchParams.get('date')||'').replaceAll('-','');if(!/^\d{8}$/.test(raw))return json({ok:false,error:'date_required'},400);const today=jstYmd(),target=raw===today?'https://boatraceopenapi.github.io/api/v1/today.json':`https://boatraceopenapi.github.io/api/v1/${raw.slice(0,4)}/${raw}.json`,key=new Request(`${u.origin}/api/official?date=${raw}&v=51`);try{const cached=await caches.default.match(key);if(cached)return cached}catch{}try{const r=await fetch(target,{headers:{accept:'application/json','user-agent':'ONE-BOAT/1.0'}});if(!r.ok)return json({ok:false,error:`official_${r.status}`},502);const parsed=await r.json(),out=json(parsed,200,'public,max-age=60');ctx.waitUntil(Promise.resolve().then(()=>caches.default.put(key,out.clone())).catch(()=>{}));return out}catch{return json({ok:false,error:'official_unavailable'},502)}}
async function body(request){try{return await request.json()}catch{return null}}
function deepFind(o,keys,depth=0){if(o===null||o===undefined||depth>6)return undefined;if(typeof o!=='object')return undefined;for(const k of keys)if(o[k]!==undefined&&o[k]!==null)return o[k];for(const k of Object.keys(o)){const v=o[k];if(v&&typeof v==='object'){const z=deepFind(v,keys,depth+1);if(z!==undefined)return z}}return undefined}
function payloadOf(raw){if(raw&&raw.data&&typeof raw.data==='object'&&!Array.isArray(raw.data))return raw.data;if(raw&&raw.result&&typeof raw.result==='object'&&!Array.isArray(raw.result))return raw.result;return raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{}}
function mergePayload(raw,merged){if(raw&&raw.data&&typeof raw.data==='object'&&!Array.isArray(raw.data))return {...raw,data:merged};if(raw&&raw.result&&typeof raw.result==='object'&&!Array.isArray(raw.result))return {...raw,result:merged};return {...(raw&&typeof raw==='object'?raw:{}),...merged}}
function num(v,fallback=0){const n=Number(v);return Number.isFinite(n)?n:fallback}
function pickAmount(x){return num(x?.stake_yen??x?.amount??x?.stake,0)}
function capPicks(picks,target){const xs=(Array.isArray(picks)?picks:[]).slice(0,6).map(x=>({...x}));if(!xs.length)return[];const total=xs.reduce((s,x)=>s+pickAmount(x),0);target=Math.floor(Math.max(0,Math.min(5000,num(target,0)))/100)*100;if(total<=target||total<=0)return xs;let amounts=xs.map(x=>Math.floor(pickAmount(x)/total*target/100)*100);if(target>=xs.length*100)amounts=amounts.map(a=>Math.max(100,a));let sum=amounts.reduce((a,b)=>a+b,0);while(sum>target){let i=amounts.findIndex(a=>a>100);if(i<0)break;amounts[i]-=100;sum-=100}while(sum+100<=target){let best=0;for(let i=1;i<xs.length;i++)if(pickAmount(xs[i])>pickAmount(xs[best]))best=i;amounts[best]+=100;sum+=100}return xs.map((x,i)=>({...x,stake_yen:amounts[i],amount:amounts[i],stake:amounts[i]}))}
function raceNoFrom(src,p){const direct=deepFind(p,['race_no','race']);if(Number.isFinite(Number(direct)))return Number(direct);const code=String(src.searchParams.get('race_code')||'');const tail=code.match(/(\d{2})$/);return tail?Number(tail[1]):0}
function buildRaceInput(src,p,picks,stake){const summary=p.summary_scores&&typeof p.summary_scores==='object'?p.summary_scores:{};const confidence=deepFind(p,['confidence_components','confidence_breakdown']);return {
  score:deepFind(p,['value_score','score'])??summary.value_score,
  value_score:summary.value_score??deepFind(p,['value_score']),
  confidence:summary.confidence_score??deepFind(p,['confidence_score','confidence']),
  confidence_components:confidence&&typeof confidence==='object'&&!Array.isArray(confidence)?confidence:undefined,
  stake_total_yen:stake,
  points:Math.min(6,Math.max(1,picks.length||num(deepFind(p,['points']),DEFAULT_POLICY.base_points))),
  odds:deepFind(p,['expected_odds','odds','target_odds','recommended_odds']),
  expected_value:deepFind(p,['expected_value','ev']),
  missing_data_count:deepFind(p,['missing_data_count'])??0,
  theory_scores:deepFind(p,['theory_scores','theories']),
  theory_sample:deepFind(p,['theory_sample','sample']),
  theory_roi:deepFind(p,['theory_roi','roi']),
  hole_score:deepFind(p,['hole_score','longshot_score']),
  daily_hole_enter_count:deepFind(p,['daily_hole_enter_count']),
  venue_recent_results:deepFind(p,['venue_recent_results','recent_venue_results','today_results']),
  current_theory:deepFind(p,['current_theory','strategy','theory']),
  race_no:raceNoFrom(src,p),
  wind_direction:deepFind(p,['wind_direction','wind_dir']),
  wind_speed:deepFind(p,['wind_speed','wind_speed_mps']),
  wind_history_14d:deepFind(p,['wind_history_14d','wind14d_history','similar_wind_results']),
  wind_match_score:deepFind(p,['wind_match_score','wind_trend_score','wind14d_score']),
  wind14d_sample:deepFind(p,['wind14d_sample']),
  water_type:deepFind(p,['water_type','venue_water_type','water_quality']),
  tide_score:deepFind(p,['tide_score','tide_fit_score']),
  temperature_motor_score:deepFind(p,['temperature_motor_score','temp_water_score','temperature_water_score']),
  previous_motor_user_score:deepFind(p,['previous_motor_user_score','previous_user_motor_score']),
  motor_player_fit_score:deepFind(p,['motor_player_fit_score','motor_racer_fit_score']),
  second_third_match_score:deepFind(p,['second_third_match_score','tie_candidate_score'])
}}
async function livePredict(request){const src=new URL(request.url),target=new URL(`${UPSTREAM}/one-boat-live-api/predict`);target.search=src.search;const headers=new Headers(request.headers);['host','cookie','origin','referer'].forEach(h=>headers.delete(h));const init={method:request.method,headers,redirect:'follow'};if(!['GET','HEAD'].includes(request.method))init.body=request.body;let r;try{r=await fetch(target,init)}catch{return json({ok:false,error:'upstream_unavailable'},502)}const text=await r.text();let raw;try{raw=JSON.parse(text)}catch{return new Response(text,{status:r.status,headers:{'content-type':r.headers.get('content-type')||'text/plain;charset=utf-8','cache-control':'no-store'}})}if(!r.ok)return json(raw,r.status,'no-store');const p=payloadOf(raw);const picks=Array.isArray(p.production_picks)?p.production_picks:[];let stake=num(p.stake_total_yen??p.stake,0);if(stake<=0&&picks.length)stake=picks.reduce((s,x)=>s+pickAmount(x),0);const raceInput=buildRaceInput(src,p,picks,stake);const history={sample:num(raceInput.theory_sample,0),roi:num(raceInput.theory_roi,0),daily_hole_enter_count:num(raceInput.daily_hole_enter_count,0)};const evaluated=evaluateRace(raceInput,DEFAULT_POLICY,history);const upstreamAllowed=p.purchase_allowed===true;const final=src.searchParams.get('final')==='1';const enter=upstreamAllowed&&picks.length>0&&evaluated.decision==='ENTER'&&evaluated.stake_total_yen>0;const finalPicks=enter?capPicks(picks,evaluated.stake_total_yen):[];const finalStake=enter?finalPicks.reduce((s,x)=>s+pickAmount(x),0):0;const decision=enter?'ENTER':final?'SKIP':(evaluated.decision==='SKIP'?'SKIP':'WATCH');const merged={...p,
  purchase_allowed:enter,
  decision,
  stake_total_yen:finalStake,
  production_picks:finalPicks,
  summary_scores:{...(p.summary_scores||{}),value_score:evaluated.value_score,confidence_score:evaluated.confidence_score},
  confidence_breakdown:evaluated.breakdown,
  prediction_reasons:evaluated.reasons,
  category:evaluated.category,
  strategy:evaluated.strategy,
  selected_theory:evaluated.selected_theory,
  day_flow_theory:evaluated.day_flow_theory,
  initial_theory:evaluated.initial_theory,
  auxiliary_adjustment:evaluated.auxiliary_adjustment,
  auxiliary_reasons:evaluated.auxiliary_reasons,
  monitor:evaluated.monitor,
  local_rule_reason:enter?evaluated.reason:(upstreamAllowed?evaluated.reason:(p.reason||p.decision_reason||'上流予想未確定')),
  local_engine:'ONE BOAT V5.1'
};return json(mergePayload(raw,merged),200,final?'no-store':'public,max-age=15')}
export default{async fetch(request,env,ctx){try{const u=new URL(request.url);if(u.pathname==='/api/health')return json({ok:true,service:'ONE BOAT',version:'2026.09-v5.1',architecture:'edge-cache-first',engine:'7axis+auxiliary-context+live-post-guard',max_stake_yen:DEFAULT_POLICY.max_stake_yen,final_lock_minutes:DEFAULT_POLICY.finalize_minutes});if(u.pathname==='/api/config')return json({ok:true,...DEFAULT_POLICY,confidence_axes:CONFIDENCE_AXES,final_lock_minutes:DEFAULT_POLICY.finalize_minutes,enter_rule:'upstream purchase_allowed && picks>0 && local value>=70 && ROI guard && stake>0',confidence_rule:'7-axis confidence is shadow-tracked; auxiliary signals may adjust value but one signal alone cannot create ENTER',auxiliary_rule:'wind14d+tide(sea/brackish only)+temperature/water+previous motor user+motor-player fit; positive adjustment requires 2 supportive signals'});if(u.pathname==='/api/official')return official(u,ctx);if(u.pathname==='/api/evaluate'&&request.method==='POST'){const x=await body(request);if(!x?.race)return json({ok:false,error:'race_required'},400);return json({ok:true,result:evaluateRace(x.race,x.policy||DEFAULT_POLICY,x.history||{})})}if(u.pathname==='/api/backtest'&&request.method==='POST'){const x=await body(request),rows=Array.isArray(x?.rows)?x.rows:[];return json({ok:true,summary:aggregateBacktest(rows),walk_forward:walkForward(rows,Number(x?.train_ratio)||.7),warning:rows.length?'':'no historical rows supplied'})}if(u.pathname==='/api/live/predict')return livePredict(request);if(u.pathname.startsWith('/api/live/'))return upstream(request,'one-boat-live-api','/api/live',ctx,u.pathname.slice('/api/live'.length));const fn=ROUTES[u.pathname];if(fn)return upstream(request,fn,u.pathname,ctx);if(env?.ASSETS?.fetch)return env.ASSETS.fetch(request);return json({ok:false,error:'assets_binding_missing'},503)}catch(e){return json({ok:false,error:'worker_runtime_error',message:String(e?.message||e)},500)}}};