const HISTORY_API='https://imhzjlxbnovjvqlyawmg.supabase.co/functions/v1/one-boat-obpe-history';
const VISIBILITY_API='https://imhzjlxbnovjvqlyawmg.supabase.co/functions/v1/one-boat-public-visibility';
const VENUES=['桐生','戸田','江戸川','平和島','多摩川','浜名湖','蒲郡','常滑','津','三国','びわこ','住之江','尼崎','鳴門','丸亀','児島','宮島','徳山','下関','若松','芦屋','福岡','唐津','大村'];
function json(data,status=200,cache='no-store'){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=utf-8','cache-control':cache}})}
async function cachedJson(u,ctx,ttl,build){const key=new Request(`${u.origin}${u.pathname}${u.search}`);try{const hit=await caches.default.match(key);if(hit)return hit}catch{}const out=json(await build(),200,`public,max-age=${ttl}`);if(ctx?.waitUntil)ctx.waitUntil(caches.default.put(key,out.clone()).catch(()=>{}));return out}
async function asset(request,env,path,contentType){const u=new URL(request.url);u.pathname=path;u.search='';const r=await env.ASSETS.fetch(new Request(u,request));const h=new Headers(r.headers);if(contentType)h.set('content-type',contentType);h.set('cache-control','no-store, max-age=0');h.set('x-content-type-options','nosniff');return new Response(r.body,{status:r.status,headers:h})}
function num(v){const n=Number(v||0);return Number.isFinite(n)?n:0}
function nullableNum(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function pad(v){return String(v).padStart(2,'0')}
function jstDate(){return new Date(Date.now()+32400000).toISOString().slice(0,10)}
function jstYmd(){return jstDate().replaceAll('-','')}
function hmMin(hm){const m=String(hm||'').match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);return m?Number(m[1])*60+Number(m[2])+Number(m[3]||0)/60:null}
function nowMin(){const d=new Date(Date.now()+32400000);return d.getUTCHours()*60+d.getUTCMinutes()+d.getUTCSeconds()/60}
function enter(r){const p=r?.prediction||{};return String(r?.decision||p?.decision||'').toUpperCase()==='ENTER'&&num(r?.stake_total_yen??p?.stake_total_yen)>0}
function decision(r){return String(r?.decision||r?.prediction?.decision||'').toUpperCase()}
function stake(r){return num(r?.stake_total_yen??r?.prediction?.stake_total_yen)}
function safeSettlement(s){if(!s)return null;return{hit:s.hit===true,payout_yen:num(s.payout_yen),profit_yen:Number.isFinite(Number(s.profit_yen))?Number(s.profit_yen):null,trifecta:s?.result?.trifecta||s?.trifecta||'',result:s?.result?.trifecta?{trifecta:s.result.trifecta}:undefined}}
function safeRecord(r){if(!r)return null;const p=r.prediction||{},isEnter=enter(r),base={race_date:r.race_date,venue_code:num(r.venue_code),race_no:num(r.race_no),decision:decision(r),stake_total_yen:isEnter?stake(r):0,settlement:isEnter?safeSettlement(r.settlement):null};if(isEnter){const picks=(Array.isArray(r.bets)&&r.bets.length?r.bets:Array.isArray(p.production_picks)?p.production_picks:[]).map(x=>({ticket:x.ticket||x.combination||x.bet||'',stake_yen:num(x.stake_yen??x.amount??x.stake),odds:Number.isFinite(Number(x.odds))?Number(x.odds):undefined,selection_role:x.selection_role||undefined}));base.prediction={decision:'ENTER',stake_total_yen:stake(r),reason:p.reason||'',selected_theory:p.selected_theory||'',current_theory:p.current_theory||'',strategy:p.strategy||'',production_picks:picks}}else{const tops=Array.isArray(p?.final_snapshot?.top_combinations)?p.final_snapshot.top_combinations.slice(0,6):[];base.prediction={decision:decision(r),skip_reason:p.skip_reason||p.reason||'',reference_picks:tops.map(x=>({ticket:x.ticket||x.combination||'',probability:Number.isFinite(Number(x.probability))?Number(x.probability):undefined,odds:Number.isFinite(Number(x.odds))?Number(x.odds):undefined})).filter(x=>x.ticket)}}return base}
async function siteVisibility(date){if(!date)return{available:false,keys:null,count:null,rows:[],site_only_keys:[]};try{const u=new URL(VISIBILITY_API);u.searchParams.set('date',String(date));u.searchParams.set('scope','site');const r=await fetch(u,{headers:{accept:'application/json'},cache:'no-store'});if(!r.ok)throw new Error(`visibility_${r.status}`);const d=await r.json(),rows=Array.isArray(d?.rows)?d.rows:[],keys=new Set(Array.isArray(d?.keys)?d.keys.map(String):rows.map(x=>String(x?.race_key||'')).filter(Boolean)),siteOnlyKeys=rows.filter(x=>x?.site_public===true&&x?.threads_public!==true).map(x=>String(x?.race_key||'')).filter(Boolean);return{available:d?.ok===true,keys,count:Number.isFinite(Number(d?.count))?Number(d.count):keys.size,rows,site_only_keys:siteOnlyKeys}}catch{return{available:false,keys:new Set(),count:null,rows:[],site_only_keys:[]}}}
async function sourceHistory(params={},visibilityPromise=null){const u=new URL(HISTORY_API);Object.entries(params).forEach(([k,v])=>v!==undefined&&v!==null&&v!==''&&u.searchParams.set(k,String(v)));const visP=visibilityPromise||siteVisibility(params.date);const [r,visibility]=await Promise.all([fetch(u,{headers:{accept:'application/json'},cache:'no-store'}),visP]);if(!r.ok)throw new Error(`history_${r.status}`);const d=await r.json(),rows=Array.isArray(d?.records)?d.records:[],visible=visibility?.keys;if(!visible)return rows;return rows.map(x=>{if(!enter(x)||visible.has(String(x?.race_key||'')))return x;return{race_key:x?.race_key||null,race_date:x?.race_date||null,venue_code:x?.venue_code??null,race_no:x?.race_no??null,decision:'PRIVATE_ENTER',stake_total_yen:0,prediction:{decision:'PRIVATE_ENTER'},settlement:null,__private_enter:true}})}
async function official(date=jstDate()){const raw=String(date).replaceAll('-',''),target=raw===jstYmd()?'https://boatraceopenapi.github.io/api/v1/today.json':`https://boatraceopenapi.github.io/api/v1/${raw.slice(0,4)}/${raw}.json`;const r=await fetch(target,{headers:{accept:'application/json','user-agent':'ONE-BOAT-CUSTOMER/1.0'}});if(!r.ok)throw new Error(`official_${r.status}`);return r.json()}
function stadiumsOf(o){return o?.programs?.stadiums||{}}
function scheduleRaces(st){if(!st?.races)return[];return Object.entries(st.races).map(([rn,r])=>({race_no:num(r?.race_number??rn),deadline:r?.closed_at||r?.close_time||null,close_min:hmMin(r?.closed_at||r?.close_time)})).filter(x=>x.race_no>=1&&x.race_no<=12).sort((a,b)=>a.race_no-b.race_no)}
function recordState(rec,closed=false,customerCutoff=false){if(!rec)return closed||customerCutoff?'SKIP':'PENDING';const d=decision(rec);if(d==='PRIVATE_ENTER'||rec?.__private_enter===true)return'PRIVATE';if(enter(rec))return rec.settlement?'SETTLED':'PUBLIC';if(d==='SKIP')return'SKIP';if(d==='WATCH'||d==='FINALIZING')return closed||customerCutoff?'SKIP':'WATCH';return closed||customerCutoff?'SKIP':'PENDING'}
function noteFor(state){return state==='WATCH'?'直前情報を確認中':state==='SKIP'?'購入条件を満たさず見送り':state==='PRIVATE'?'このレースの正式予想は無料公開対象外':state==='CLOSED'?'レース終了':state==='PENDING'?'直前分析中':state==='UPDATING'?'正式データを更新中':''}
function publicItem(r,scheduleMap){const code=num(r.venue_code),rn=num(r.race_no),sc=scheduleMap?.get(`${code}-${rn}`),safe=safeRecord(r);return {...safe,venue_code:code,venue_name:VENUES[code-1]||`場${code}`,race_no:rn,deadline:r.deadline||r.close_time||sc?.deadline||null}}
async function buildOverview(){
  const date=jstDate(),visibilityPromise=siteVisibility(date);
  const [offRes,rowsRes,visibilityRes]=await Promise.allSettled([official(date),sourceHistory({date,limit:500},visibilityPromise),visibilityPromise]);
  const scheduleAvailable=offRes.status==='fulfilled',historyAvailable=rowsRes.status==='fulfilled',visibility=visibilityRes.status==='fulfilled'?visibilityRes.value:{available:false,count:null};
  const off=scheduleAvailable?offRes.value:null,rows=historyAvailable?rowsRes.value:[];
  const stMap=scheduleAvailable?stadiumsOf(off):{},now=nowMin(),byVenue=new Map(),scheduleMap=new Map();
  for(const r of rows){const c=num(r.venue_code);if(!byVenue.has(c))byVenue.set(c,[]);byVenue.get(c).push(r)}
  const venues=[];
  for(let code=1;code<=24;code++){
    const vr=(byVenue.get(code)||[]).slice().sort((a,b)=>num(a.race_no)-num(b.race_no));
    const publicRows=vr.filter(enter);
    if(!scheduleAvailable){
      const targetRec=publicRows.find(r=>!r.settlement)||vr.find(r=>!r.settlement)||vr[vr.length-1]||null;
      const state=targetRec?recordState(targetRec,false):'UPDATING';
      venues.push({code,name:VENUES[code-1],state,next_race_no:targetRec?num(targetRec.race_no):null,next_deadline:targetRec?.deadline||targetRec?.close_time||null,public_count:historyAvailable?publicRows.length:null});
      continue;
    }
    const st=stMap[String(code)]||stMap[pad(code)],rs=scheduleRaces(st);
    rs.forEach(x=>scheduleMap.set(`${code}-${x.race_no}`,x));
    if(!rs.length){venues.push({code,name:VENUES[code-1],state:'NOEVENT',next_race_no:null,next_deadline:null,public_count:historyAvailable?0:null});continue}
    const next=rs.find(x=>x.close_min===null||x.close_min>=now-1);
    if(!next){venues.push({code,name:VENUES[code-1],state:'FINISHED',next_race_no:12,next_deadline:rs[rs.length-1]?.deadline||null,public_count:historyAvailable?publicRows.length:null});continue}
    const futurePublic=publicRows.find(r=>num(r.race_no)>=next.race_no&&!r.settlement);
    const targetRec=futurePublic||vr.find(r=>num(r.race_no)===next.race_no);
    const targetNo=targetRec?num(targetRec.race_no):next.race_no,targetSc=rs.find(x=>x.race_no===targetNo)||next;
    const state=historyAvailable?recordState(targetRec,false):'UPDATING';
    venues.push({code,name:VENUES[code-1],state,next_race_no:targetNo,next_deadline:targetSc?.deadline||null,public_count:historyAvailable?publicRows.length:null});
  }
  const publicItems=historyAvailable?rows.filter(enter).sort((a,b)=>num(a.venue_code)-num(b.venue_code)||num(a.race_no)-num(b.race_no)).map(r=>publicItem(r,scheduleMap)):[];
  const freeLimit=30,freeCount=visibility?.available&&Number.isFinite(Number(visibility.count))?Math.max(0,Math.min(freeLimit,Number(visibility.count))):null,freeRemaining=freeCount===null?null:Math.max(0,freeLimit-freeCount);
  return{ok:true,date,degraded:!scheduleAvailable||!historyAvailable||!visibility?.available,source:{schedule:scheduleAvailable,predictions:historyAvailable,visibility:visibility?.available===true},active_count:scheduleAvailable?venues.filter(v=>v.state!=='NOEVENT'&&v.state!=='FINISHED').length:null,public_count:historyAvailable?publicItems.length:null,free_limit:freeLimit,free_count:freeCount,free_remaining:freeRemaining,free_note:'正式ENTERが出たレースのみ無料公開',site_only_keys:Array.isArray(visibility?.site_only_keys)?visibility.site_only_keys:[],venues,public_items:publicItems}
}
async function buildVenue(code){
  code=num(code);if(code<1||code>24)throw new Error('bad_venue');
  const date=jstDate();
  const [offRes,rowsRes]=await Promise.allSettled([official(date),sourceHistory({date,venue:code,limit:100})]);
  const scheduleAvailable=offRes.status==='fulfilled',historyAvailable=rowsRes.status==='fulfilled';
  const off=scheduleAvailable?offRes.value:null,rows=historyAvailable?rowsRes.value:[];
  const stMap=scheduleAvailable?stadiumsOf(off):{},st=scheduleAvailable?(stMap[String(code)]||stMap[pad(code)]):null,officialRs=scheduleAvailable?scheduleRaces(st):[];
  const now=nowMin(),recBy=new Map(rows.map(r=>[num(r.race_no),r]));
  if(scheduleAvailable&&!officialRs.length)return{ok:true,date,code,name:VENUES[code-1],state:'NOEVENT',public_count:historyAvailable?0:null,races:[],degraded:!historyAvailable,source:{schedule:true,predictions:historyAvailable}};
  const rs=scheduleAvailable?officialRs:Array.from({length:12},(_,i)=>{const rec=recBy.get(i+1);const deadline=rec?.deadline||rec?.close_time||null;return{race_no:i+1,deadline,close_min:hmMin(deadline)}});
  const races=rs.map(sc=>{
    const rec=recBy.get(sc.race_no)||null,closed=scheduleAvailable&&sc.close_min!==null&&sc.close_min<=now,customerCutoff=scheduleAvailable&&sc.close_min!==null&&(sc.close_min-now)<=1;
    const state=historyAvailable?recordState(rec,closed,customerCutoff):'UPDATING';
    const cutoffApplied=customerCutoff&&state==='SKIP'&&(!rec||['WATCH','FINALIZING',''].includes(decision(rec)));
    return{race_no:sc.race_no,deadline:sc.deadline,state,note:cutoffApplied?'締切1分前までにENTER確定せず、今回は見送り':noteFor(state),record:safeRecord(rec),customer_cutoff:cutoffApplied}
  });
  const next=scheduleAvailable?races.find(r=>{const m=hmMin(r.deadline);return m===null||m>=now-1}):races.find(r=>r.state!=='CLOSED'&&r.state!=='SETTLED');
  const publicCount=historyAvailable?rows.filter(enter).length:null;
  let state=scheduleAvailable?'FINISHED':'UPDATING';
  if(next)state=next.state;
  if(next&&state==='PENDING'){
    const future=races.find(r=>r.race_no>=next.race_no&&(r.state==='PUBLIC'||r.state==='WATCH'||r.state==='SKIP'));
    if(future)state=future.state
  }
  return{ok:true,date,code,name:VENUES[code-1],state,public_count:publicCount,races,degraded:!scheduleAvailable||!historyAvailable,source:{schedule:scheduleAvailable,predictions:historyAvailable}}
}
function engineLaneInputs(rec){const xs=rec?.prediction?.input_snapshot?.lanes;return Array.isArray(xs)?xs:[]}
function candidateSet(v){if(!Array.isArray(v))return[];return v.slice(0,6).map(x=>({lane:num(x?.lane),probability:nullableNum(x?.probability)})).filter(x=>x.lane>=1&&x.lane<=6)}
function safeEngine(rec){if(!rec)return{available:false};const p=rec?.prediction||{},r=p?.candidate_rankings||{},first=candidateSet(r.first),second=candidateSet(r.second),third=candidateSet(r.third);const completeness=nullableNum(p?.input_snapshot?.data_completeness),uncertainty=nullableNum(p?.final_snapshot?.uncertainty);const available=first.length>0||second.length>0||third.length>0||completeness!==null||uncertainty!==null;return{available,decision:decision(rec)||null,model_version:p.model_version||rec.model_version||null,calculated_at:p.calculated_at||p.updated_at||rec.captured_at||null,data_completeness:completeness,uncertainty,candidate_rankings:{first,second,third}}}
function officialRace(off,code,rno){const stMap=stadiumsOf(off),st=stMap[String(code)]||stMap[pad(code)];return st?.races?.[String(rno)]||st?.races?.[rno]||null}
function chooseLive(a,b){return a!==null&&a!==undefined&&a!==''?a:(b!==null&&b!==undefined&&b!==''?b:null)}
function buildRacer(race,lane,engineLane){const base=race?.racers?.[String(lane)]||race?.racers?.[lane]||{},pre=race?.preview?.racers?.[String(lane)]||race?.preview?.racers?.[lane]||{};return{lane,name:base.name||engineLane?.name||null,racer_id:base.number||engineLane?.racer_id||null,grade:base.rank_number_source||null,national_win_rate:nullableNum(base.national_win_rate),national_top2_rate:nullableNum(base.national_top_2_percent),national_top3_rate:nullableNum(base.national_top_3_percent),local_win_rate:nullableNum(base.local_win_rate),local_top2_rate:nullableNum(base.local_top_2_percent),local_top3_rate:nullableNum(base.local_top_3_percent),average_st:nullableNum(base.average_start_timing),flying_count:nullableNum(base.flying_count),motor_number:nullableNum(base.motor_number),motor_top2_rate:nullableNum(base.motor_top_2_percent),motor_top3_rate:nullableNum(base.motor_top_3_percent),boat_number:nullableNum(base.boat_number),boat_top2_rate:nullableNum(base.boat_top_2_percent),boat_top3_rate:nullableNum(base.boat_top_3_percent),course:nullableNum(chooseLive(pre.course_number,engineLane?.course)),course_st:nullableNum(engineLane?.course_st80),course_sample:nullableNum(engineLane?.course_n),recent_avg_st:nullableNum(engineLane?.avg_st80),st_sigma:nullableNum(engineLane?.st_sigma),exhibition_time:nullableNum(chooseLive(pre.exhibition_time,engineLane?.exhibition_time)),start_exhibition_st:nullableNum(chooseLive(pre.start_timing,engineLane?.start_exhibition)),weight:nullableNum(chooseLive(pre.weight,base.weight)),tilt:nullableNum(pre.tilt_adjustment),original_exhibition:null,lap_time:null,half_lap_time:null,turn_time:null}}
function surfaceOf(race){const p=race?.preview||{},r=race?.result||{};return{weather:chooseLive(p.weather_number_source,r.weather_number_source),weather_code:nullableNum(chooseLive(p.weather_number,r.weather_number)),air_temperature:nullableNum(chooseLive(p.air_temperature,r.air_temperature)),water_temperature:nullableNum(chooseLive(p.water_temperature,r.water_temperature)),wind_direction:chooseLive(p.wind_direction_number_source,r.wind_direction_number_source),wind_direction_code:nullableNum(chooseLive(p.wind_direction_number,r.wind_direction_number)),wind_speed:nullableNum(chooseLive(p.wind_speed,r.wind_speed)),wave_height:nullableNum(chooseLive(p.wave_height,r.wave_height)),tide_level:null,tide_phase:null}}
async function buildAnalysis(code,rno){code=num(code);rno=num(rno);if(code<1||code>24)throw new Error('bad_venue');if(rno<1||rno>12)throw new Error('bad_race');const date=jstDate();const [off,rows]=await Promise.all([official(date),sourceHistory({date,venue:code,limit:100}).catch(()=>[])]);const race=officialRace(off,code,rno);if(!race)return{ok:false,error:'race_not_scheduled',date,venue_code:code,venue_name:VENUES[code-1],race_no:rno};const rec=rows.find(x=>num(x.race_no)===rno)||null,engines=engineLaneInputs(rec),engineMap=new Map(engines.map(x=>[num(x.lane),x])),racers=[];for(let lane=1;lane<=6;lane++)racers.push(buildRacer(race,lane,engineMap.get(lane)||null));const closeMin=hmMin(race.closed_at||race.close_time),closed=closeMin!==null&&closeMin<nowMin()-1,state=recordState(rec,closed),engine=safeEngine(rec),surface=surfaceOf(race);return{ok:true,date,venue_code:code,venue_name:VENUES[code-1],race_no:rno,title:race.title||null,subtitle:race.subtitle||null,deadline:race.closed_at||race.close_time||null,state,official_prediction_available:enter(rec),fetched_at:new Date().toISOString(),racers,surface,engine,odds:{available:false,trifecta:[],updated_at:null,status:'not_connected'},availability:{course_stats:engines.length?'engine_snapshot':'not_connected',original_exhibition:code===3?'not_provided':'not_connected',lap_time:'not_connected',half_lap_time:'not_connected',turn_time:'not_connected',odds:'not_connected',tide:'not_connected'}}}
function metric(rows){let races=0,hits=0,stakeY=0,payoutY=0;for(const r of rows){if(!enter(r)||!r.settlement)continue;races++;const st=stake(r),pay=num(r.settlement?.payout_yen);stakeY+=st;payoutY+=pay;if(r.settlement?.hit===true)hits++}const profit=payoutY-stakeY;return{races,hits,hit_rate:races?hits/races*100:0,stake_yen:stakeY,payout_yen:payoutY,profit_yen:profit,roi:stakeY?payoutY/stakeY*100:0}}
function aiBandKey(odds){const o=Number(odds);if(!Number.isFinite(o)||o<1)return null;if(o<=20)return'stable';if(o<80)return'mid';return'high'}
function normalizeTicket(v){return String(v||'').replace(/[‐‑‒–—―ー−]/g,'-').replace(/\s+/g,'').trim()}
function aiMetrics(rows){
  const out={
    stable:{name:'安定型AI',odds_min:1,odds_max:20,races:0,hits:0,stake_yen:0,payout_yen:0},
    mid:{name:'中配当型AI',odds_min:20.1,odds_max:79.9,races:0,hits:0,stake_yen:0,payout_yen:0},
    high:{name:'高配当型AI',odds_min:80,odds_max:null,races:0,hits:0,stake_yen:0,payout_yen:0}
  };
  for(const r of rows){
    if(!enter(r)||!r?.settlement)continue;
    const p=r?.prediction||{};
    const bets=Array.isArray(r?.bets)&&r.bets.length?r.bets:Array.isArray(p?.production_picks)?p.production_picks:[];
    const grouped={stable:[],mid:[],high:[]};
    for(const b of bets){
      const key=aiBandKey(b?.odds);
      if(!key)continue;
      grouped[key].push(b)
    }
    const win=normalizeTicket(r?.settlement?.result?.trifecta||r?.settlement?.trifecta||'');
    for(const key of ['stable','mid','high']){
      const xs=grouped[key];
      if(!xs.length)continue;
      const m=out[key];
      m.races++;
      m.stake_yen+=xs.reduce((s,b)=>s+num(b?.stake_yen??b?.amount??b?.stake),0);
      const hit=!!win&&xs.some(b=>normalizeTicket(b?.ticket||b?.combination||b?.bet)===win);
      if(hit){m.hits++;m.payout_yen+=num(r?.settlement?.payout_yen)}
    }
  }
  for(const key of ['stable','mid','high']){
    const m=out[key];
    m.hit_rate=m.races?m.hits/m.races*100:0;
    m.roi=m.stake_yen?m.payout_yen/m.stake_yen*100:0;
    m.profit_yen=m.payout_yen-m.stake_yen
  }
  return out
}
function isoDaysAgo(n){const d=new Date(Date.now()+32400000-n*86400000);return d.toISOString().slice(0,10)}
async function stats(){const rows=await sourceHistory({limit:2000});const today=jstDate(),d7=isoDaysAgo(6),d30=isoDaysAgo(29),dated=rows.filter(r=>r.race_date);const latest=rows.filter(r=>enter(r)&&r.settlement).sort((a,b)=>String(b.race_date).localeCompare(String(a.race_date))||num(b.race_no)-num(a.race_no)).slice(0,12).map(r=>({race_date:r.race_date,venue_name:VENUES[num(r.venue_code)-1]||`場${r.venue_code}`,race_no:num(r.race_no),hit:r.settlement?.hit===true,trifecta:r.settlement?.result?.trifecta||r.settlement?.trifecta||'',stake_yen:stake(r),payout_yen:num(r.settlement?.payout_yen),profit_yen:Number.isFinite(Number(r.settlement?.profit_yen))?Number(r.settlement.profit_yen):num(r.settlement?.payout_yen)-stake(r)}));return{ok:true,scope:'public_only',ai_types:aiMetrics(rows),today:metric(dated.filter(r=>r.race_date===today)),days7:metric(dated.filter(r=>r.race_date>=d7&&r.race_date<=today)),days30:metric(dated.filter(r=>r.race_date>=d30&&r.race_date<=today)),all:metric(rows),latest}}
export default{async fetch(request,env,ctx){const u=new URL(request.url);try{if(u.pathname==='/api/health')return json({ok:true,service:'ONE BOAT CUSTOMER',version:'2026-09-18.analysis-v1',source:'management-history+official-schedule',customer_view_only:true,public_payload_sanitized:true,edge_cache:true});if(u.pathname==='/api/public/overview')return cachedJson(u,ctx,20,buildOverview);if(u.pathname==='/api/public/venue')return cachedJson(u,ctx,5,()=>buildVenue(u.searchParams.get('code')));if(u.pathname==='/api/public/analysis')return cachedJson(u,ctx,15,()=>buildAnalysis(u.searchParams.get('code'),u.searchParams.get('race')));if(u.pathname==='/api/public/today')return cachedJson(u,ctx,20,async()=>{const o=await buildOverview();return{ok:true,date:o.date,count:o.public_count,public_count:o.public_count,items:o.public_items}});if(u.pathname==='/api/public/stats')return cachedJson(u,ctx,60,stats);if(u.pathname==='/hero-top.jpg')return asset(request,env,'/hero-top.webp','image/jpeg');if(u.pathname==='/'||u.pathname==='/index.html')return asset(request,env,'/index.html','text/html;charset=utf-8');return asset(request,env,u.pathname)}catch(e){return json({ok:false,error:'temporarily_unavailable',message:String(e?.message||e)},502)}}};
