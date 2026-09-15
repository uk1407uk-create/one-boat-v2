import {DEFAULT_POLICY,CONFIDENCE_AXES,evaluateRace,aggregateBacktest,walkForward,pointCapForOdds} from './engine_v51.js';
const UPSTREAM='https://vtgswxrzklwynpvifbef.supabase.co/functions/v1';
const ROUTES={'/api/live':'one-boat-live-api','/api/detail':'boat-ai-race-detail','/api/performance':'boat-ai-performance','/api/patterns':'one-boat-venue-patterns','/api/schedule':'boat-ai-schedule'};
const TTL={'/api/live':30,'/api/detail':20,'/api/performance':120,'/api/patterns':3600,'/api/schedule':300};
function json(x,status=200,cache='no-store'){return new Response(JSON.stringify(x),{status,headers:{'content-type':'application/json;charset=utf-8','cache-control':cache}})}
async function upstream(request,fn,path,ctx,suffix=''){const src=new URL(request.url),target=new URL(`${UPSTREAM}/${fn}${suffix}`);target.search=src.search;const key=new Request(src.toString(),{method:'GET'});try{if(request.method==='GET'){const cached=await caches.default.match(key);if(cached)return cached}}catch{}const headers=new Headers(request.headers);['host','cookie','origin','referer'].forEach(h=>headers.delete(h));const init={method:request.method,headers,redirect:'follow'};if(!['GET','HEAD'].includes(request.method))init.body=request.body;try{const r=await fetch(target,init),h=new Headers(r.headers);h.delete('set-cookie');h.set('cache-control',`public,max-age=${TTL[path]||30}`);const out=new Response(r.body,{status:r.status,headers:h});if(request.method==='GET'&&r.ok)ctx.waitUntil(Promise.resolve().then(()=>caches.default.put(key,out.clone())).catch(()=>{}));return out}catch{return json({ok:false,error:'upstream_unavailable'},502)}}
function jstYmd(){const d=new Date(Date.now()+9*3600*1000);return d.toISOString().slice(0,10).replaceAll('-','')}
async function official(u,ctx){const raw=(u.searchParams.get('date')||'').replaceAll('-','');if(!/^\d{8}$/.test(raw))return json({ok:false,error:'date_required'},400);const today=jstYmd(),target=raw===today?'https://boatraceopenapi.github.io/api/v1/today.json':`https://boatraceopenapi.github.io/api/v1/${raw.slice(0,4)}/${raw}.json`,key=new Request(`${u.origin}/api/official?date=${raw}&v=52`);try{const cached=await caches.default.match(key);if(cached)return cached}catch{}try{const r=await fetch(target,{headers:{accept:'application/json','user-agent':'ONE-BOAT/1.0'}});if(!r.ok)return json({ok:false,error:`official_${r.status}`},502);const parsed=await r.json(),out=json(parsed,200,'public,max-age=60');ctx.waitUntil(Promise.resolve().then(()=>caches.default.put(key,out.clone())).catch(()=>{}));return out}catch{return json({ok:false,error:'official_unavailable'},502)}}
function plainHtml(html){return String(html||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&deg;/gi,'°').replace(/&amp;/gi,'&').replace(/\s+/g,' ').trim()}
function parseOfficialWeather(html){const text=plainHtml(html),tm=text.match(/気温\s*([+-]?\d+(?:\.\d+)?)\s*℃/),wm=text.match(/風速\s*([+-]?\d+(?:\.\d+)?)\s*m/),wt=text.match(/水温\s*([+-]?\d+(?:\.\d+)?)\s*℃/),wave=text.match(/波高\s*([+-]?\d+(?:\.\d+)?)\s*cm/);let weather=null;if(tm){const tail=text.slice(tm.index+tm[0].length,tm.index+tm[0].length+40),m=tail.match(/^\s*(晴れ|晴|曇り|曇|雨|雪|霧|小雨|弱雨|強雨|雷雨)/);if(m)weather=m[1]}if(!weather){const m=text.match(/(?:天候|天気)\s*(晴れ|晴|曇り|曇|雨|雪|霧|小雨|弱雨|強雨|雷雨)/);if(m)weather=m[1]}return {weather,temperature:tm?Number(tm[1]):null,wind_speed:wm?Number(wm[1]):null,water_temperature:wt?Number(wt[1]):null,wave_height:wave?Number(wave[1]):null}}
async function officialWeather(u,ctx){const raw=(u.searchParams.get('date')||jstYmd()).replaceAll('-',''),jcd=String(u.searchParams.get('jcd')||'').padStart(2,'0'),rno=Math.max(1,Math.min(12,Number(u.searchParams.get('rno')||1)));if(!/^\d{8}$/.test(raw)||!/^(0[1-9]|1\d|2[0-4])$/.test(jcd))return json({ok:false,error:'bad_params'},400);const key=new Request(`${u.origin}/api/official-weather?date=${raw}&jcd=${jcd}&rno=${rno}&v=2`);try{const cached=await caches.default.match(key);if(cached)return cached}catch{}let last=null;for(const n of [rno,Math.max(1,rno-1)]){try{const target=`https://www.boatrace.jp/owsp/sp/race/beforeinfo?hd=${raw}&jcd=${jcd}&rno=${n}`,r=await fetch(target,{headers:{accept:'text/html,*/*','user-agent':'Mozilla/5.0 ONE-BOAT/1.0'}});if(!r.ok)continue;const parsed=parseOfficialWeather(await r.text());last={ok:true,source:'BOAT RACE official beforeinfo',source_race:n,...parsed};if(parsed.weather||parsed.temperature!==null||parsed.wind_speed!==null)break}catch{}}if(!last)last={ok:false,error:'official_weather_unavailable',weather:null,temperature:null,wind_speed:null,water_temperature:null,wave_height:null};const out=json(last,200,'public,max-age=90');ctx.waitUntil(Promise.resolve().then(()=>caches.default.put(key,out.clone())).catch(()=>{}));return out}
async function body(request){try{return await request.json()}catch{return null}}
function deepFind(o,keys,depth=0){if(o===null||o===undefined||depth>6)return undefined;if(typeof o!=='object')return undefined;for(const k of keys)if(o[k]!==undefined&&o[k]!==null)return o[k];for(const k of Object.keys(o)){const v=o[k];if(v&&typeof v==='object'){const z=deepFind(v,keys,depth+1);if(z!==undefined)return z}}return undefined}
function payloadOf(raw){if(raw&&raw.data&&typeof raw.data==='object'&&!Array.isArray(raw.data))return raw.data;if(raw&&raw.result&&typeof raw.result==='object'&&!Array.isArray(raw.result))return raw.result;return raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{}}
function mergePayload(raw,merged){if(raw&&raw.data&&typeof raw.data==='object'&&!Array.isArray(raw.data))return {...raw,data:merged};if(raw&&raw.result&&typeof raw.result==='object'&&!Array.isArray(raw.result))return {...raw,result:merged};return {...(raw&&typeof raw==='object'?raw:{}),...merged}}
function num(v,fallback=0){const n=Number(v);return Number.isFinite(n)?n:fallback}
function pickAmount(x){return num(x?.stake_yen??x?.amount??x?.stake,0)}
function pickOdds(x){const n=Number(x?.odds??x?.expected_odds??x?.current_odds);return Number.isFinite(n)?n:null}
function ticketKey(x,i){return String(x?.ticket??x?.combination??x?.bet??`pick-${i}`).replace(/\s+/g,'')}
function pickRole(x,category){const o=pickOdds(x);if(o!==null){if(o<20)return'本命';if(o<60)return'中穴';return'穴'}return category==='中穴'?'中穴':['狙い目','高配当','超高配当'].includes(category)?'穴':'本命'}
function pickClass(x){const o=pickOdds(x);if(o===null)return'未分類';if(o<20)return'堅実';if(o<40)return'中穴20-39.9';if(o<60)return'中穴40-59.9';if(o<100)return'狙い目';if(o<200)return'高配当';return'超高配当'}
function capPicks(picks,target,maxPoints=20,category='未分類'){
  target=Math.floor(Math.max(0,Math.min(Number(DEFAULT_POLICY.max_stake_yen||5000),num(target,0)))/100)*100;
  if(target<100)return[];
  const seen=new Set(),unique=[];
  for(let i=0;i<(Array.isArray(picks)?picks:[]).length;i++){const x=picks[i],key=ticketKey(x,i);if(seen.has(key))continue;seen.add(key);unique.push({...x})}
  const cap=Math.max(1,Math.min(20,num(maxPoints,20))),allowed=Math.min(unique.length,cap,Math.floor(target/100));
  let xs=unique.slice(0,allowed);if(!xs.length)return[];
  const weights=xs.map(x=>Math.max(0,pickAmount(x))),order=weights.map((w,i)=>({w,i})).sort((a,b)=>b.w-a.w);
  const perPick=Math.max(100,Math.min(2000,Number(DEFAULT_POLICY.per_pick_max_yen||2000)));
  const amounts=xs.map(()=>100);let remaining=target-xs.length*100,cursor=0,safety=0;
  while(remaining>=100&&safety<500){const eligible=order.filter(z=>amounts[z.i]+100<=perPick);if(!eligible.length)break;const z=eligible[cursor%eligible.length];amounts[z.i]+=100;remaining-=100;cursor++;safety++}
  return xs.map((x,i)=>({...x,stake_yen:amounts[i],amount:amounts[i],stake:amounts[i],role:x.role||pickRole(x,category),odds_class:x.odds_class||x.classification||pickClass(x),pick_reason:x.pick_reason||x.reason||x.rationale||null}))
}
function probability01(v){const n=Number(v);if(!Number.isFinite(n)||n<0)return null;return n>1?n/100:n}
function deriveMetrics(p,picks){
  let hit=deepFind(p,['estimated_hit_probability','hit_probability','race_hit_probability','predicted_hit_rate']);
  if(Number.isFinite(Number(hit)))hit=Number(hit)>1?Number(hit):Number(hit)*100;else hit=null;
  let roi=deepFind(p,['expected_roi','expected_recovery_rate','expected_return_rate']),calculable=false;
  if(Number.isFinite(Number(roi))){roi=Number(roi);calculable=true}else{
    const total=picks.reduce((s,x)=>s+pickAmount(x),0);let expected=0,ok=total>0&&picks.length>0;
    for(const x of picks){const pr=probability01(x?.probability??x?.hit_probability??x?.predicted_probability??x?.prob),o=pickOdds(x);if(pr===null||o===null){ok=false;break}expected+=pickAmount(x)*pr*o}
    roi=ok?+(expected/total*100).toFixed(1):null;calculable=ok;
  }
  return {estimated_hit_probability:hit===null?null:+Number(hit).toFixed(1),expected_roi:roi===null?null:+Number(roi).toFixed(1),expected_roi_calculable:calculable};
}
function countByClass(picks){const out={堅実:0,'中穴20-39.9':0,'中穴40-59.9':0,狙い目:0,高配当:0,超高配当:0,未分類:0};for(const x of picks){const k=x.odds_class||pickClass(x);out[k]=(out[k]||0)+1}return out}
function raceNoFrom(src,p){const direct=deepFind(p,['race_no','race']);if(Number.isFinite(Number(direct)))return Number(direct);const code=String(src.searchParams.get('race_code')||'');const tail=code.match(/(\d{2})$/);return tail?Number(tail[1]):0}
function buildRaceInput(src,p,picks,stake){const summary=p.summary_scores&&typeof p.summary_scores==='object'?p.summary_scores:{};const confidence=deepFind(p,['confidence_components','confidence_breakdown']);return {
  score:deepFind(p,['value_score','score'])??summary.value_score,
  value_score:summary.value_score??deepFind(p,['value_score']),
  confidence:summary.confidence_score??deepFind(p,['confidence_score','confidence']),
  confidence_components:confidence&&typeof confidence==='object'&&!Array.isArray(confidence)?confidence:undefined,
  stake_total_yen:stake,
  points:Math.min(20,Math.max(1,picks.length||num(deepFind(p,['points']),DEFAULT_POLICY.base_points))),
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
  wind_match_score:deepFind(p,['wind14d_in_win_rate','boat1_wind_win_rate','wind_in_win_rate']),
  wind14d_sample:deepFind(p,['wind14d_sample']),
  water_type:deepFind(p,['water_type','venue_water_type','water_quality']),
  tide_score:deepFind(p,['tide_score','tide_fit_score']),
  temperature_motor_score:deepFind(p,['temperature_motor_score','temp_water_score','temperature_water_score']),
  previous_motor_user_score:deepFind(p,['previous_motor_user_score','previous_user_motor_score']),
  motor_player_fit_score:deepFind(p,['motor_player_fit_score','motor_racer_fit_score']),
  second_third_match_score:deepFind(p,['second_third_match_score','tie_candidate_score'])
}}
async function livePredict(request){
  const src=new URL(request.url),target=new URL(`${UPSTREAM}/one-boat-live-api/predict`);target.search=src.search;
  const headers=new Headers(request.headers);['host','cookie','origin','referer'].forEach(h=>headers.delete(h));
  const init={method:request.method,headers,redirect:'follow'};if(!['GET','HEAD'].includes(request.method))init.body=request.body;
  let r;try{r=await fetch(target,init)}catch{return json({ok:false,error:'upstream_unavailable'},502)}
  const text=await r.text();let raw;try{raw=JSON.parse(text)}catch{return new Response(text,{status:r.status,headers:{'content-type':r.headers.get('content-type')||'text/plain;charset=utf-8','cache-control':'no-store'}})}
  if(!r.ok)return json(raw,r.status,'no-store');
  const p=payloadOf(raw),picks=Array.isArray(p.production_picks)?p.production_picks:[];let stake=num(p.stake_total_yen??p.stake,0);if(stake<=0&&picks.length)stake=picks.reduce((s,x)=>s+pickAmount(x),0);
  const raceInput=buildRaceInput(src,p,picks,stake),history={sample:num(raceInput.theory_sample,0),roi:num(raceInput.theory_roi,0),daily_hole_enter_count:num(raceInput.daily_hole_enter_count,0)},evaluated=evaluateRace(raceInput,DEFAULT_POLICY,history);
  const upstreamAllowed=p.purchase_allowed===true,finalRequested=src.searchParams.get('final')==='1',mins=num(src.searchParams.get('minutes_to_close'),99),final=finalRequested&&mins<=Number(DEFAULT_POLICY.finalize_minutes||5);
  const candidateEnter=upstreamAllowed&&picks.length>0&&evaluated.decision==='ENTER'&&evaluated.confidence_score>=70&&evaluated.value_score>=70&&evaluated.stake_total_yen>0;
  const cap=evaluated.point_cap||pointCapForOdds(raceInput.odds,DEFAULT_POLICY),finalPicks=candidateEnter?capPicks(picks,evaluated.stake_total_yen,cap,evaluated.category):[],finalStake=finalPicks.reduce((s,x)=>s+pickAmount(x),0);
  const enter=candidateEnter&&finalPicks.length>0&&finalPicks.length<=cap&&finalStake>0&&finalStake<=5000&&finalStake%100===0&&finalPicks.every(x=>pickAmount(x)>0&&pickAmount(x)<=2000&&pickAmount(x)%100===0);
  const decision=enter?'ENTER':final?'SKIP':(evaluated.decision==='SKIP'?'SKIP':'WATCH'),metrics=deriveMetrics(p,finalPicks),confirmedAt=final?new Date().toISOString():null;
  const merged={...p,
    purchase_allowed:enter,
    decision,
    stake_total_yen:enter?finalStake:0,
    production_picks:enter?finalPicks:[],
    total_points:enter?finalPicks.length:0,
    point_cap:cap,
    per_pick_max_yen:Number(DEFAULT_POLICY.per_pick_max_yen||2000),
    classification_counts:enter?countByClass(finalPicks):countByClass([]),
    summary_scores:{...(p.summary_scores||{}),value_score:evaluated.value_score,confidence_score:evaluated.confidence_score},
    confidence_breakdown:evaluated.breakdown,
    prediction_reasons:evaluated.reasons,
    opposing_materials:evaluated.opposing_materials,
    candidate:evaluated.candidate,
    category:evaluated.category,
    strategy:evaluated.strategy,
    selected_theory:evaluated.selected_theory,
    day_flow_theory:evaluated.day_flow_theory,
    initial_theory:evaluated.initial_theory,
    auxiliary_adjustment:evaluated.auxiliary_adjustment,
    auxiliary_reasons:evaluated.auxiliary_reasons,
    monitor:evaluated.monitor,
    estimated_hit_probability:metrics.estimated_hit_probability,
    expected_roi:metrics.expected_roi,
    expected_roi_calculable:metrics.expected_roi_calculable,
    final_checked_at:confirmedAt,
    local_rule_reason:enter?evaluated.reason:(upstreamAllowed?evaluated.reason:(p.reason||p.decision_reason||'上流予想未確定')),
    enter_snapshot:enter?{race_code:src.searchParams.get('race_code')||null,decision:'ENTER',confidence_score:evaluated.confidence_score,value_score:evaluated.value_score,stake_total_yen:finalStake,total_points:finalPicks.length,point_cap:cap,picks:finalPicks,model_version:'ONE BOAT V5.1-production-20260915',confirmed_at:confirmedAt}:null,
    local_engine:'ONE BOAT V5.1',
    model_version:'ONE BOAT V5.1-production-20260915'
  };
  return json(mergePayload(raw,merged),200,final?'no-store':'public,max-age=15');
}
async function assetResponse(request,env){
  if(!env?.ASSETS?.fetch)return null;
  const res=await env.ASSETS.fetch(request),u=new URL(request.url),ct=res.headers.get('content-type')||'';
  if(res.ok&&(u.pathname==='/'||u.pathname==='/index.html')&&ct.includes('text/html')){
    let html=await res.text();
    html=html.replace("function shouldFinal(r){var m=minutesLeft(r);return m!==null&&m>=0&&m<=8}","function shouldFinal(r){var m=minutesLeft(r);return m!==null&&m>=0&&m<=5}");
    html=html.replace('10分前再計算 / 8分前確定','10分前再計算 / 5分前最終確認');
    html=html.replace('</body>','<script src="/race-screen-enhancer.js?v=20260915-prod52"></script></body>');
    const h=new Headers(res.headers);h.set('cache-control','no-store');return new Response(html,{status:res.status,headers:h});
  }
  return res;
}
export default{async fetch(request,env,ctx){try{
  const u=new URL(request.url);
  if(u.pathname==='/api/health')return json({ok:true,service:'ONE BOAT',version:'2026.09-v5.2',architecture:'edge-cache-first',engine:'7axis+auxiliary-context+70-gate+category-caps',max_stake_yen:DEFAULT_POLICY.max_stake_yen,per_pick_max_yen:DEFAULT_POLICY.per_pick_max_yen,final_lock_minutes:DEFAULT_POLICY.finalize_minutes,participation_target_pct:DEFAULT_POLICY.participation_target_pct});
  if(u.pathname==='/api/config')return json({ok:true,...DEFAULT_POLICY,confidence_axes:CONFIDENCE_AXES,final_lock_minutes:DEFAULT_POLICY.finalize_minutes,enter_rule:'upstream purchase_allowed && picks>0 && confidence>=70 && local value>=70 && stake>0',candidate_rule:'64-69 is WATCH only; never ENTER',point_rule:'3-19.9=4,20-39.9=6,40-59.9=8,60-99.9=10,100-199.9=12,200+=20; race total max20',budget_rule:'race max 5000 yen, pick max 2000 yen, 100 yen units',participation_rule:'40% is a monitoring target, never a purchase quota',confidence_rule:'7-axis score is separate from estimated hit probability and expected ROI',auxiliary_rule:'wind14d+tide(sea/brackish only)+temperature/water+previous motor user+motor-player fit; positive adjustment requires 2 supportive signals'});
  if(u.pathname==='/api/official')return official(u,ctx);if(u.pathname==='/api/official-weather')return officialWeather(u,ctx);
  if(u.pathname==='/api/evaluate'&&request.method==='POST'){const x=await body(request);if(!x?.race)return json({ok:false,error:'race_required'},400);return json({ok:true,result:evaluateRace(x.race,x.policy||DEFAULT_POLICY,x.history||{})})}
  if(u.pathname==='/api/backtest'&&request.method==='POST'){const x=await body(request),rows=Array.isArray(x?.rows)?x.rows:[];return json({ok:true,summary:aggregateBacktest(rows),walk_forward:walkForward(rows,Number(x?.train_ratio)||.7),warning:rows.length?'':'no historical rows supplied'})}
  if(u.pathname==='/api/live/predict')return livePredict(request);
  if(u.pathname.startsWith('/api/live/'))return upstream(request,'one-boat-live-api','/api/live',ctx,u.pathname.slice('/api/live'.length));
  const fn=ROUTES[u.pathname];if(fn)return upstream(request,fn,u.pathname,ctx);
  const asset=await assetResponse(request,env);if(asset)return asset;
  return json({ok:false,error:'assets_binding_missing'},503)
}catch(e){return json({ok:false,error:'worker_runtime_error',message:String(e?.message||e)},500)}}};
