import fs from 'node:fs/promises';

const START=process.env.BACKTEST_START||'2024-09-15';
const END=process.env.BACKTEST_END||'2026-09-14';
const WARMUP_DAYS=Number(process.env.BACKTEST_WARMUP_DAYS||180);
const DATA_CONCURRENCY=Number(process.env.BACKTEST_CONCURRENCY||10);
const ODDS_CONCURRENCY=Number(process.env.BACKTEST_ODDS_CONCURRENCY||2);
const ODDS_DELAY_MS=Number(process.env.BACKTEST_ODDS_DELAY_MS||700);
const MODEL='ONE BOAT V6.0-simple-six-theory';
const MODE='historical-safe-replay-v2';
const V3={
  programs:'https://boatraceopenapi.github.io/programs/v3',
  previews:'https://boatraceopenapi.github.io/previews/v3',
  results:'https://boatraceopenapi.github.io/results/v3'
};
const CSV_ODDS='https://boatracecsv.github.io/data/previews/od3';
const CSV_ODDS_START='2026-07-01';
const OFFICIAL='https://www.boatrace.jp/owpc/pc/race/odds3t';

const clamp=(n,a=0,b=100)=>Math.max(a,Math.min(b,Number(n)||0));
const finite=v=>Number.isFinite(Number(v));
const num=(v,f=null)=>finite(v)?Number(v):f;
const avg=xs=>{const a=xs.map(Number).filter(Number.isFinite);return a.length?a.reduce((s,v)=>s+v,0)/a.length:null};
const ymd=d=>d.toISOString().slice(0,10);
const rawDate=s=>s.replaceAll('-','');
const addDays=(s,n)=>{const d=new Date(s+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return ymd(d)};
const dates=(a,b)=>{const out=[];for(let d=a;d<=b;d=addDays(d,1))out.push(d);return out};
const code=(date,venue,race)=>rawDate(date)+String(venue).padStart(2,'0')+String(race).padStart(2,'0');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const ticketNorm=s=>String(s||'').replace(/[^1-6]/g,'').split('').join('-');

async function fetchResponse(url,attempt=0){
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),15000);
  try{
    const r=await fetch(url,{signal:ctl.signal,headers:{accept:'*/*','user-agent':'Mozilla/5.0 (compatible; ONE-BOAT historical backtest/1.0)'}});
    clearTimeout(timer);
    if(r.status===404)return null;
    if(!r.ok)throw new Error('HTTP '+r.status);
    return r;
  }catch(e){
    clearTimeout(timer);
    if(attempt<2){await sleep(400*(attempt+1));return fetchResponse(url,attempt+1)}
    return null;
  }
}
async function fetchJson(url){const r=await fetchResponse(url);if(!r)return null;try{return await r.json()}catch{return null}}
async function fetchText(url){const r=await fetchResponse(url);if(!r)return null;try{return await r.text()}catch{return null}}
async function mapLimit(items,limit,fn){let idx=0;const out=new Array(items.length);async function worker(){while(true){const i=idx++;if(i>=items.length)return;out[i]=await fn(items[i],i)}}await Promise.all(Array.from({length:limit},worker));return out}
function v3Url(kind,date){const raw=rawDate(date),year=raw.slice(0,4);return `${V3[kind]}/${year}/${raw}.json`}

function indexByRace(rows=[]){const m=new Map();for(const x of rows||[]){const v=Number(x.stadium_number),r=Number(x.number??x.race_number);if(v&&r)m.set(`${v}-${r}`,x)}return m}
async function loadDay(date){
  const [pj,vj,rj]=await Promise.all([fetchJson(v3Url('programs',date)),fetchJson(v3Url('previews',date)),fetchJson(v3Url('results',date))]);
  return {date,programs:indexByRace(pj?.programs||[]),previews:indexByRace(vj?.previews||[]),results:indexByRace(rj?.results||[])};
}

class RollingHistory{
  constructor(){this.m=new Map()}
  prior(racerId,course){const xs=this.m.get(String(racerId))||[],recent=xs.slice(-200),same=recent.filter(x=>x.course===course),src=same.length>=5?same:recent;if(!src.length)return{sample_count:0,first_rate:null,top3_rate:null};return{sample_count:src.length,first_rate:src.filter(x=>x.place===1).length/src.length*100,top3_rate:src.filter(x=>x.place<=3).length/src.length*100}}
  add(racerId,course,place){if(!racerId||!course||!place)return;const k=String(racerId),xs=this.m.get(k)||[];xs.push({course,place});if(xs.length>220)xs.splice(0,xs.length-220);this.m.set(k,xs)}
}
function programBoatMap(p){return new Map((p?.boats||[]).map(x=>[Number(x.racer_boat_number),x]))}
function previewBoatMap(p){return new Map((p?.boats||[]).map(x=>[Number(x.racer_boat_number),x]))}
function buildLanes(program,preview,hist){
  const pm=programBoatMap(program),vm=previewBoatMap(preview);
  return Array.from({length:6},(_,i)=>{const lane=i+1,a=pm.get(lane)||{},b=vm.get(lane)||{},course=num(b.racer_course_number,lane),hs=hist.prior(a.racer_number,course);return{
    lane,course,racer_id:a.racer_number||null,name:a.racer_name||null,
    national_win_rate:num(a.racer_national_top_1_percent),national_top3_rate:num(a.racer_national_top_3_percent),
    local_win_rate:num(a.racer_local_top_1_percent),local_top3_rate:num(a.racer_local_top_3_percent),
    avg_st:num(a.racer_average_start_timing),motor_2_rate:num(a.racer_assigned_motor_top_2_percent),
    exhibition_time:num(b.racer_exhibition_time),start_exhibition:num(b.racer_start_timing),tilt:num(b.racer_tilt_adjustment),
    one_lap:null,mawari_ashi:null,straight:null,course_stats:hs
  }});
}
function rankScores(lanes,key,lower=false){const vals=lanes.map((x,i)=>({i,v:num(x[key])})).filter(x=>x.v!==null).sort((a,b)=>lower?a.v-b.v:b.v-a.v),out=new Map(),pts=[92,82,72,62,52,42];vals.forEach((x,i)=>out.set(x.i,pts[Math.min(i,5)]));return out}
function status(score){if(score===null)return'missing';if(score>=65)return'support';if(score<=40)return'oppose';return'neutral'}
function boatEvaluation(lanes){
  const keys={avg_st:rankScores(lanes,'avg_st',true),start:rankScores(lanes,'start_exhibition',true),ex:rankScores(lanes,'exhibition_time',true),motor:rankScores(lanes,'motor_2_rate',false),national:rankScores(lanes,'national_win_rate',false),local:rankScores(lanes,'local_win_rate',false),top3:rankScores(lanes,'national_top3_rate',false)};
  return lanes.map((x,i)=>{const cf=x.course_stats.first_rate===null?null:clamp(x.course_stats.first_rate),ct=x.course_stats.top3_rate===null?null:clamp(x.course_stats.top3_rate),A=avg([keys.avg_st.get(i),keys.start.get(i)]),B=avg([keys.ex.get(i),keys.motor.get(i)]),C=avg([keys.national.get(i),keys.local.get(i),cf,ct]),t3=avg([keys.top3.get(i),ct,B,C]),first=avg([A==null?50:A,B==null?50:B,C==null?50:C]),second=avg([B==null?50:B,C==null?50:C,A==null?50:A,t3==null?50:t3]),third=avg([t3==null?50:t3,B==null?50:B,C==null?50:C,A==null?50:A]),ss=[status(A),status(B),status(C)],supports=ss.filter(z=>z==='support').length,opposes=ss.filter(z=>z==='oppose').length,missing=ss.filter(z=>z==='missing').length,alignment=supports===3&&missing===0?'strong':supports>=2?'normal':opposes>=2?'oppose':'weak';return{...x,systems:{A:{score:A,status:status(A)},B:{score:B,status:status(B)},C:{score:C,status:status(C)}},alignment,first_score:+Number(first||0).toFixed(1),second_score:+Number(second||0).toFixed(1),third_score:+Number(third||0).toFixed(1),required_missing:missing}})
}
function rankings(ev){const pack=k=>[...ev].sort((a,b)=>b[k]-a[k]).map(x=>({lane:x.lane,score:x[k],alignment:x.alignment}));return{first:pack('first_score'),second:pack('second_score'),third:pack('third_score')}}
function axisScore(ev){const r=rankings(ev),head=ev.find(x=>x.lane===r.first[0]?.lane)||ev[0],A=head?.systems.A.score,B=head?.systems.B.score,C=head?.systems.C.score,exRank=rankScores(ev,'exhibition_time',true).get(ev.indexOf(head)),axes={axis_reliability:head?.first_score??0,exhibition_start:avg([A,exRank])??0,racer_course_fit:C??0,motor_leg:B??0,venue_water_weather:50,day_flow:50,odds_value:50},weights={axis_reliability:25,exhibition_start:15,racer_course_fit:25,motor_leg:15,venue_water_weather:8,day_flow:8,odds_value:4};let total=0;for(const k of Object.keys(weights))total+=clamp(axes[k])*weights[k]/100;return{buy_value:Math.round(clamp(total)),head_lane:head?.lane||null,head,rankings:r}}
function structuralTheories(ev,r){const head=ev.find(x=>x.lane===r.first[0]?.lane),one=ev.find(x=>x.lane===1),others=ev.filter(x=>x.lane!==head?.lane&&['normal','strong'].includes(x.alignment)),list=[];if(head?.lane===1&&['normal','strong'].includes(head.alignment))list.push({name:'壱−弐−参型',fit:head.first_score+2});if(head&&head.systems.A.status==='support'&&head.systems.B.status==='support'&&head.systems.C.status!=='oppose')list.push({name:'直前気配＋ST型',fit:head.first_score+3});if(head?.lane!==1&&one&&(one.alignment==='oppose'||one.first_score+8<head.first_score)&&['normal','strong'].includes(head.alignment))list.push({name:'イン飛び外頭理論',fit:head.first_score+4});if(head?.lane===1&&head.alignment==='strong')list.push({name:'直前強一致・1号艇型',fit:head.first_score+5});if(head?.lane===1&&head.alignment==='strong'&&others.length>=2)list.push({name:'強イン高配当理論',fit:head.first_score+(avg(others.slice(0,3).map(x=>x.second_score))||0)/20});if(head?.alignment==='strong'&&others.length>=2)list.push({name:'展開強一致・超高配当型',fit:head.first_score+(avg(others.slice(0,3).map(x=>x.third_score))||0)/18});return list.sort((a,b)=>b.fit-a.fit)}
function capFor(t){return{'壱−弐−参型':4,'直前気配＋ST型':6,'イン飛び外頭理論':8,'直前強一致・1号艇型':10,'強イン高配当理論':12,'展開強一致・超高配当型':20}[t]||0}
function band(t,o){if(t==='壱−弐−参型')return o>=3&&o<20;if(t==='直前気配＋ST型')return o>=20&&o<40;if(t==='イン飛び外頭理論')return o>=40&&o<60;if(t==='直前強一致・1号艇型')return o>=60&&o<100;if(t==='強イン高配当理論')return o>=100&&o<200;if(t==='展開強一致・超高配当型')return o>=200;return false}
function comboSkeleton(theory,ev,r){const map=new Map(ev.map(x=>[x.lane,x])),head=r.first[0]?.lane;if(!head)return[];const sec=r.second.map(x=>x.lane).filter(x=>x!==head),thr=r.third.map(x=>x.lane).filter(x=>x!==head),out=[],secN=theory==='壱−弐−参型'?2:theory==='直前気配＋ST型'?3:4,thrN=theory==='壱−弐−参型'?3:theory==='直前気配＋ST型'?4:5;for(const b of sec.slice(0,secN))for(const c of thr.slice(0,thrN)){if(b===c||head===b||head===c)continue;const sb=map.get(b),tb=map.get(c);if(['強イン高配当理論','展開強一致・超高配当型'].includes(theory)&&(!['normal','strong'].includes(sb?.alignment)||!['normal','strong'].includes(tb?.alignment)))continue;out.push({ticket:`${head}-${b}-${c}`,score:(map.get(head)?.first_score||0)+(sb?.second_score||0)+(tb?.third_score||0)})}return out.sort((a,b)=>b.score-a.score)}
function selectTheory(ev,structural,odds){const r=rankings(ev);for(const t of structural){const cs=comboSkeleton(t.name,ev,r).map(x=>({...x,odds:odds.get(x.ticket)})).filter(x=>finite(x.odds)&&band(t.name,Number(x.odds)));if(cs.length)return{theory:t.name,rankings:r,candidates:cs,cap:capFor(t.name)}}return{theory:null,rankings:r,candidates:[],cap:0}}
function allocate(sel){let xs=sel.candidates.slice(0,sel.cap).map(x=>({...x,stake:100}));while(xs.length){const total=xs.length*100,bad=xs.findIndex(x=>x.odds*100<total);if(bad<0)break;xs.pop()}return{picks:xs,total:xs.length*100}}

function resultOrder(result){return (result?.boats||[]).filter(x=>{const p=num(x.racer_place_number);return p!==null&&p>=1&&p<=6}).sort((a,b)=>Number(a.racer_place_number)-Number(b.racer_place_number)).map(x=>Number(x.racer_boat_number)).slice(0,3)}
function payoutMap(result){const xs=Array.isArray(result?.payouts?.trifecta)?result.payouts.trifecta:[],out=new Map();for(const x of xs){const t=ticketNorm(x.combination),a=num(x.amount,0);if(t)out.set(t,a)}return out}
function categoryForOdds(o){if(o<20)return'堅実';if(o<40)return'中穴20-39.9';if(o<60)return'中穴40-59.9';if(o<100)return'狙い目';if(o<200)return'高配当';return'超高配当'}
function missType(picks,order){if(order.length<3)return'情報未反映';const ts=picks.map(x=>x.ticket),target=order.join('-');if(ts.includes(target))return null;if(!ts.some(t=>t.startsWith(order[0]+'-')))return'頭候補の誤り';if(!ts.some(t=>t.startsWith(order[0]+'-'+order[1]+'-')))return'2着抜け';const same=ts.some(t=>{const a=t.split('-').map(Number);return order.every(x=>a.includes(x))});return same?'着順違い':'3着抜け'}

function decodeEntities(s){return s.replace(/&nbsp;|&#160;/gi,' ').replace(/&yen;/gi,'').replace(/&amp;/gi,'&').replace(/&#46;/g,'.')}
function stripHtml(s){return decodeEntities(String(s||'').replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim()}
function rowsFromTbody(body){return [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>[...m[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(c=>stripHtml(c[1])))}
function comboPos(first,second,third){const seconds=[1,2,3,4,5,6].filter(x=>x!==first),si=seconds.indexOf(second);if(si<0)return null;const thirds=[1,2,3,4,5,6].filter(x=>x!==first&&x!==second),ti=thirds.indexOf(third);if(ti<0)return null;return{row:si*4+ti+1,col:ti===0?first*3:first*2}}
function parseOfficialOdds(html){
  if(!html)return new Map();const bodies=[...html.matchAll(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/gi)].map(m=>rowsFromTbody(m[1])),candidates=[];
  for(const rows of bodies){if(rows.length<20)continue;const map=new Map();for(let a=1;a<=6;a++)for(let b=1;b<=6;b++)for(let c=1;c<=6;c++){if(a===b||a===c||b===c)continue;const p=comboPos(a,b,c),cell=rows[p.row-1]?.[p.col-1];if(cell==null)continue;const m=String(cell).replace(/,/g,'').match(/(?:^|\s)(\d+(?:\.\d+)?)(?:\s|$)/),o=m?Number(m[1]):NaN;if(Number.isFinite(o)&&o>0)map.set(`${a}-${b}-${c}`,o)}if(map.size)candidates.push(map)}
  candidates.sort((a,b)=>b.size-a.size);return candidates[0]||new Map();
}
function parseCsvLine(line){const out=[];let cur='',q=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(q&&line[i+1]==='"'){cur+='"';i++}else q=!q}else if(ch===','&&!q){out.push(cur);cur=''}else cur+=ch}out.push(cur);return out}
function parseCsvOdds(text){const all=new Map();if(!text)return all;const lines=text.trim().split(/\r?\n/);if(lines.length<2)return all;const head=parseCsvLine(lines[0]),cols=head.map((h,i)=>({i,m:h.match(/^3連単_(\d-\d-\d)$/)})).filter(x=>x.m);for(let n=1;n<lines.length;n++){const row=parseCsvLine(lines[n]);if(!row[0])continue;const m=new Map();for(const c of cols){const o=num(row[c.i]);if(o!==null&&o>0)m.set(c.m[1],o)}if(m.size)all.set(row[0],m)}return all}
const dailyCsvOddsCache=new Map();
async function csvOddsFor(date){if(dailyCsvOddsCache.has(date))return dailyCsvOddsCache.get(date);if(date<CSV_ODDS_START){const m=new Map();dailyCsvOddsCache.set(date,m);return m}const [y,m,d]=date.split('-'),txt=await fetchText(`${CSV_ODDS}/${y}/${m}/${d}.csv`),parsed=parseCsvOdds(txt);dailyCsvOddsCache.set(date,parsed);return parsed}
async function officialOddsFor(c){const raw=rawDate(c.date),url=`${OFFICIAL}?hd=${raw}&jcd=${String(c.venue).padStart(2,'0')}&rno=${c.race}`,html=await fetchText(url);return parseOfficialOdds(html)}
async function oddsFor(c){const daily=await csvOddsFor(c.date),hit=daily.get(c.code);if(hit?.size)return{map:hit,source:'boatracecsv_5min'};const map=await officialOddsFor(c);return{map,source:map.size?'official_closing':'missing'}}
async function loadCandidateOdds(candidates){let idx=0,done=0;const out=new Array(candidates.length);async function worker(){while(true){const i=idx++;if(i>=candidates.length)return;const c=candidates[i];out[i]=await oddsFor(c);done++;if(done%100===0)console.log(`odds ${done}/${candidates.length}`);if(ODDS_DELAY_MS>0)await sleep(ODDS_DELAY_MS)}}await Promise.all(Array.from({length:ODDS_CONCURRENCY},worker));return out}

function bucket(map,key,bet=0,ret=0,hit=false){const z=map[key]||(map[key]={races:0,hits:0,stake:0,returns:0});z.races++;if(hit)z.hits++;z.stake+=bet;z.returns+=ret}
function finalizeMap(map){const out={};for(const [k,z] of Object.entries(map))out[k]={...z,profit:z.returns-z.stake,roi:z.stake?+(z.returns/z.stake*100).toFixed(1):null,hit_rate:z.races?+(z.hits/z.races*100).toFixed(1):null};return out}

const warmStart=addDays(START,-WARMUP_DAYS),allDates=dates(warmStart,END);
console.log(`Loading v3 historical inputs: ${warmStart}..${END} (${allDates.length} days)`);
let loaded=0;
const days=await mapLimit(allDates,DATA_CONCURRENCY,async d=>{const x=await loadDay(d);loaded++;if(loaded%50===0)console.log(`days ${loaded}/${allDates.length}`);return x});

const hist=new RollingHistory(),summary={model:MODEL,mode:MODE,start:START,end:END,warmup_start:warmStart,warmup_days:WARMUP_DAYS,days_requested:allDates.length,total_races:0,pre_odds_candidates:0,odds_covered_candidates:0,odds_missing_skips:0,enter_races:0,hits:0,stake:0,returns:0,profit:0,roi:null,hit_rate:null,participation_rate:null,data_missing_skips:0,score_below_64:0,candidate_64_69:0,theory_mismatch:0,allocation_fail:0};
const candidateRaces=[];
for(const day of days){
  const keys=new Set([...day.programs.keys(),...day.results.keys()]),races=[...keys].map(k=>{const [venue,race]=k.split('-').map(Number);return{venue,race,program:day.programs.get(k),preview:day.previews.get(k),result:day.results.get(k)}}).filter(x=>x.result&&resultOrder(x.result).length===3).sort((a,b)=>String(a.program?.closed_at||'').localeCompare(String(b.program?.closed_at||''))||a.venue-b.venue||a.race-b.race);
  for(const x of races){const inTest=day.date>=START;if(inTest)summary.total_races++;const p=x.program,v=x.preview,r=x.result;
    if(!p){if(inTest)summary.data_missing_skips++;continue}
    const lanes=buildLanes(p,v||{},hist),ev=boatEvaluation(lanes),score=axisScore(ev),structural=structuralTheories(ev,score.rankings),hasPreview=!!v&&(v.boats||[]).length>=6,essential=!!score.head&&score.head.required_missing===0;
    if(inTest){
      if(!hasPreview){summary.data_missing_skips++}
      else if(score.buy_value<64){summary.score_below_64++}
      else if(score.buy_value<70){summary.candidate_64_69++}
      else if(!essential||!structural.length){summary.theory_mismatch++}
      else{summary.pre_odds_candidates++;candidateRaces.push({date:day.date,code:code(day.date,x.venue,x.race),venue:x.venue,race:x.race,ev,score,structural,result:r,order:resultOrder(r)})}
    }
    const pm=programBoatMap(p);for(const z of r.boats||[]){const lane=Number(z.racer_boat_number),a=pm.get(lane)||{},course=Number(z.racer_course_number||lane),place=Number(z.racer_place_number||0);if(place>=1&&place<=6)hist.add(a.racer_number||z.racer_number,course,place)}
  }
}
console.log(`Pre-odds candidates: ${candidateRaces.length}/${summary.total_races}`);
console.log(`Loading historical odds with concurrency=${ODDS_CONCURRENCY}, delay=${ODDS_DELAY_MS}ms`);
const oddsRows=await loadCandidateOdds(candidateRaces);
const byVenue={},byTheory={},byCategory={},byScore={},byPoints={},byOddsSource={},misses={};
for(let i=0;i<candidateRaces.length;i++){
  const c=candidateRaces[i],od=oddsRows[i];if(!od?.map?.size){summary.odds_missing_skips++;continue}summary.odds_covered_candidates++;const sel=selectTheory(c.ev,c.structural,od.map);if(!sel.theory){summary.theory_mismatch++;continue}const alloc=allocate(sel);if(!alloc.picks.length){summary.allocation_fail++;continue}
  summary.enter_races++;const pmap=payoutMap(c.result),stake=alloc.total;let ret=0,hit=false;for(const p of alloc.picks){const unit=pmap.get(p.ticket)||0;if(unit>0){ret+=(p.stake/100)*unit;hit=true}}summary.stake+=stake;summary.returns+=ret;if(hit)summary.hits++;
  const venue=String(c.venue).padStart(2,'0'),theory=sel.theory,cat=categoryForOdds(alloc.picks[0].odds),scoreBand=c.score.buy_value>=90?'90+':c.score.buy_value>=80?'80-89':c.score.buy_value>=75?'75-79':'70-74',points=String(alloc.picks.length);
  bucket(byVenue,venue,stake,ret,hit);bucket(byTheory,theory,stake,ret,hit);bucket(byCategory,cat,stake,ret,hit);bucket(byScore,scoreBand,stake,ret,hit);bucket(byPoints,points,stake,ret,hit);bucket(byOddsSource,od.source,stake,ret,hit);if(!hit){const m=missType(alloc.picks,c.order);misses[m]=(misses[m]||0)+1}
}
summary.profit=summary.returns-summary.stake;summary.roi=summary.stake?+(summary.returns/summary.stake*100).toFixed(1):null;summary.hit_rate=summary.enter_races?+(summary.hits/summary.enter_races*100).toFixed(1):null;summary.participation_rate=summary.total_races?+(summary.enter_races/summary.total_races*100).toFixed(1):null;summary.odds_coverage_pct=summary.pre_odds_candidates?+(summary.odds_covered_candidates/summary.pre_odds_candidates*100).toFixed(1):null;
const report={summary,by_venue:finalizeMap(byVenue),by_theory:finalizeMap(byTheory),by_category:finalizeMap(byCategory),by_score:finalizeMap(byScore),by_points:finalizeMap(byPoints),by_odds_source:finalizeMap(byOddsSource),miss_types:misses,limitations:[
  '予測入力は当該レースの結果を参照せず、結果は予測確定後の精算と次レース以降のローリング成績更新にのみ使用した。',
  '出走表・展示・スタート展示は BoatraceOpenAPI v3 の当時スナップショットを使用した。選手コース成績はウォームアップ以降の過去結果だけで最大200走をローリング集計し、未来データ混入を避けた。',
  '2026-07以降で存在するレースは BoatraceCSV の締切約5分前3連単オッズを優先し、それ以前は BOAT RACE 公式の保存済み締切時オッズページを使用した。オッズ取得不能レースはENTER扱いにしていない。',
  'BoatraceOpenAPI v3 の historical preview には一周・まわり足・直線が含まれないため、足系は展示タイムと当時モーター2連率で評価した。欠損値を満点扱いしていない。',
  '場・水面・風・潮、当日流れ、オッズ妙味の採点は現行V6本番と同じく未実装部分を中立50点とし、架空の優位性を付与していない。',
  '資金配分は現行V6の最小構成と同じく各買い目100円から開始し、トリガミ候補を除外。削減分は他買い目へ自動上乗せしていない。'
]};
await fs.mkdir('reports',{recursive:true});await fs.writeFile('reports/backtest-v60-2y.json',JSON.stringify(report,null,2));
const fmt=n=>Number(n||0).toLocaleString('ja-JP'),table=obj=>Object.entries(obj).sort((a,b)=>(b[1].roi??-1)-(a[1].roi??-1)).map(([k,v])=>`| ${k} | ${v.races} | ${v.hits} | ${v.hit_rate??'--'}% | ¥${fmt(v.stake)} | ¥${fmt(v.returns)} | ¥${fmt(v.profit)} | ${v.roi??'--'}% |`).join('\n');
const md=`# ONE BOAT V6.0 2年間バックテスト\n\n- 対象期間: ${START} 〜 ${END}\n- ウォームアップ開始: ${warmStart}\n- モデル: ${MODEL}\n- 再現方式: ${MODE}\n- 総実施レース: **${fmt(summary.total_races)}R**\n- オッズ取得前候補: **${fmt(summary.pre_odds_candidates)}R**\n- オッズ取得率: **${summary.odds_coverage_pct??'--'}%**\n- ENTER: **${fmt(summary.enter_races)}R**\n- 参加率: **${summary.participation_rate??'--'}%**\n- 的中: **${fmt(summary.hits)}R**\n- 的中率: **${summary.hit_rate??'--'}%**\n- 投資: **¥${fmt(summary.stake)}**\n- 払戻: **¥${fmt(summary.returns)}**\n- 収支: **¥${fmt(summary.profit)}**\n- 回収率: **${summary.roi??'--'}%**\n- 情報欠損見送り: ${fmt(summary.data_missing_skips)}R\n- 64未満: ${fmt(summary.score_below_64)}R\n- 64〜69候補: ${fmt(summary.candidate_64_69)}R\n- 理論/オッズ帯不一致: ${fmt(summary.theory_mismatch)}R\n- オッズ取得不能: ${fmt(summary.odds_missing_skips)}R\n- 配分不成立: ${fmt(summary.allocation_fail)}R\n\n## 理論別\n| 理論 | R | 的中 | 的中率 | 投資 | 払戻 | 収支 | ROI |\n|---|---:|---:|---:|---:|---:|---:|---:|\n${table(report.by_theory)}\n\n## 分類別\n| 分類 | R | 的中 | 的中率 | 投資 | 払戻 | 収支 | ROI |\n|---|---:|---:|---:|---:|---:|---:|---:|\n${table(report.by_category)}\n\n## 評価点別\n| 評価点 | R | 的中 | 的中率 | 投資 | 払戻 | 収支 | ROI |\n|---|---:|---:|---:|---:|---:|---:|---:|\n${table(report.by_score)}\n\n## 点数別\n| 点数 | R | 的中 | 的中率 | 投資 | 払戻 | 収支 | ROI |\n|---|---:|---:|---:|---:|---:|---:|---:|\n${table(report.by_points)}\n\n## オッズソース別\n| ソース | R | 的中 | 的中率 | 投資 | 払戻 | 収支 | ROI |\n|---|---:|---:|---:|---:|---:|---:|---:|\n${table(report.by_odds_source)}\n\n## 外れ分類\n${Object.entries(misses).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`- ${k}: ${fmt(v)}R`).join('\n')}\n\n## 注意\n${report.limitations.map(x=>`- ${x}`).join('\n')}\n`;
await fs.writeFile('reports/backtest-v60-2y.md',md);console.log('\n=== RESULT ===');console.log(JSON.stringify(summary,null,2));console.log('reports/backtest-v60-2y.json');console.log('reports/backtest-v60-2y.md');