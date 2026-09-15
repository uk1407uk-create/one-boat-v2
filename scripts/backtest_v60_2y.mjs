import fs from 'node:fs/promises';
import path from 'node:path';

const START=process.env.BACKTEST_START||'2024-09-15';
const END=process.env.BACKTEST_END||'2026-09-14';
const WARMUP_DAYS=Number(process.env.BACKTEST_WARMUP_DAYS||180);
const CONCURRENCY=Number(process.env.BACKTEST_CONCURRENCY||8);
const BASE='https://boatraceopenapi.github.io/api/v1';
const MODEL='ONE BOAT V6.0-simple-six-theory';
const MODE='historical-safe-replay-v1';

const clamp=(n,a=0,b=100)=>Math.max(a,Math.min(b,Number(n)||0));
const finite=v=>Number.isFinite(Number(v));
const num=(v,f=null)=>finite(v)?Number(v):f;
const avg=xs=>{const a=xs.map(Number).filter(Number.isFinite);return a.length?a.reduce((s,v)=>s+v,0)/a.length:null};
const ymd=d=>d.toISOString().slice(0,10);
const addDays=(s,n)=>{const d=new Date(s+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return ymd(d)};
const dates=(a,b)=>{const out=[];for(let d=a;d<=b;d=addDays(d,1))out.push(d);return out};
const ticketNorm=s=>String(s||'').replace(/[^1-6]/g,'').split('').join('-');

async function fetchJson(url,attempt=0){
  try{
    const r=await fetch(url,{headers:{accept:'application/json','user-agent':'ONE-BOAT-backtest/1.0'}});
    if(r.status===404)return null;
    if(!r.ok)throw new Error('HTTP '+r.status);
    return await r.json();
  }catch(e){
    if(attempt<3){await new Promise(r=>setTimeout(r,300*(attempt+1)));return fetchJson(url,attempt+1)}
    throw e;
  }
}
function dailyUrl(date){const raw=date.replaceAll('-','');return `${BASE}/${raw.slice(0,4)}/${raw}.json`}
async function mapLimit(items,limit,fn){let idx=0;const out=new Array(items.length);async function worker(){while(true){const i=idx++;if(i>=items.length)return;out[i]=await fn(items[i],i)}}await Promise.all(Array.from({length:limit},worker));return out}

function rankScores(lanes,key,lower=false){
  const vals=lanes.map((x,i)=>({i,v:num(x[key])})).filter(x=>x.v!==null).sort((a,b)=>lower?a.v-b.v:b.v-a.v),out=new Map();
  const pts=[92,82,72,62,52,42];vals.forEach((x,i)=>out.set(x.i,pts[Math.min(i,5)]));return out;
}
function status(score){if(score===null)return'missing';if(score>=65)return'support';if(score<=40)return'oppose';return'neutral'}
function gc(r={}){const title=String(r.title||r.race_title||'');if(/女子|ヴィーナス|オールレディース/.test(title))return'WOMEN';const g=Number(r.grade_number);return g===1?'SG':g===2?'G1':g===3?'G2':g===4?'G3':'GENERAL'}
function resultOrder(r){const rr=r?.result?.racers||{};return Object.values(rr).filter(x=>num(x.place_number)!==null&&num(x.place_number)<=6).sort((a,b)=>Number(a.place_number)-Number(b.place_number)).map(x=>Number(x.entry_number||x.lane||0)).filter(Boolean).slice(0,3)}
function oddsMap(r){const tf=r?.odds?.trifecta||{};const out=new Map();for(const [a,o2] of Object.entries(tf))for(const [b,o3] of Object.entries(o2||{}))for(const [c,v] of Object.entries(o3||{})){const o=num(v);if(o!==null)out.set(`${a}-${b}-${c}`,o)}return out}
function payoutMap(r){const xs=Array.isArray(r?.result?.payouts?.trifecta)?r.result.payouts.trifecta:[];const out=new Map();for(const x of xs){const t=ticketNorm(x.combination),a=num(x.amount,0);if(t)out.set(t,a)}return out}

class RollingHistory{
  constructor(){this.m=new Map()}
  prior(racerId,course){const xs=this.m.get(String(racerId))||[];const recent=xs.slice(-200),same=recent.filter(x=>x.course===course);const src=same.length>=5?same:recent;if(!src.length)return{sample_count:0,first_rate:null,top3_rate:null};return{sample_count:src.length,first_rate:src.filter(x=>x.place===1).length/src.length*100,top3_rate:src.filter(x=>x.place<=3).length/src.length*100}}
  add(racerId,course,place){if(!racerId||!course||!place)return;const k=String(racerId),xs=this.m.get(k)||[];xs.push({course,place});if(xs.length>220)xs.splice(0,xs.length-220);this.m.set(k,xs)}
}
function buildLanes(r,hist){const racers=r.racers||{},pv=r.preview?.racers||{};return Array.from({length:6},(_,i)=>{const lane=i+1,a=racers[String(lane)]||{},b=pv[String(lane)]||{},course=num(b.course_number,lane),hs=hist.prior(a.number,course);return{lane,course,racer_id:a.number||null,name:a.name||null,national_win_rate:num(a.national_win_rate),national_top3_rate:num(a.national_top_3_percent),local_win_rate:num(a.local_win_rate),local_top3_rate:num(a.local_top_3_percent),avg_st:num(a.average_start_timing),motor_2_rate:num(a.motor_top_2_percent),exhibition_time:num(b.exhibition_time),start_exhibition:num(b.start_timing??b.start_exhibition_timing),one_lap:num(b.one_lap_time??b.one_round_time??b.lap_time),mawari_ashi:num(b.turn_time??b.mawari_ashi_time??b.corner_time),straight:num(b.straight_time??b.straight_line_time),tilt:num(b.tilt_adjustment),course_stats:hs}}
)}
function boatEvaluation(lanes){
  const keys={avg_st:rankScores(lanes,'avg_st',true),start:rankScores(lanes,'start_exhibition',true),ex:rankScores(lanes,'exhibition_time',true),lap:rankScores(lanes,'one_lap',true),turn:rankScores(lanes,'mawari_ashi',true),straight:rankScores(lanes,'straight',true),motor:rankScores(lanes,'motor_2_rate',false),national:rankScores(lanes,'national_win_rate',false),local:rankScores(lanes,'local_win_rate',false),top3:rankScores(lanes,'national_top3_rate',false)};
  return lanes.map((x,i)=>{const cf=x.course_stats.first_rate===null?null:clamp(x.course_stats.first_rate),ct=x.course_stats.top3_rate===null?null:clamp(x.course_stats.top3_rate),A=avg([keys.avg_st.get(i),keys.start.get(i)]),B=avg([keys.ex.get(i),keys.lap.get(i),keys.turn.get(i),keys.straight.get(i),keys.motor.get(i)]),C=avg([keys.national.get(i),keys.local.get(i),cf,ct]),t3=avg([keys.top3.get(i),ct,B,C]),first=avg([A==null?50:A,B==null?50:B,C==null?50:C]),second=avg([B==null?50:B,C==null?50:C,A==null?50:A,t3==null?50:t3]),third=avg([t3==null?50:t3,B==null?50:B,C==null?50:C,A==null?50:A]);const ss=[status(A),status(B),status(C)],supports=ss.filter(z=>z==='support').length,opposes=ss.filter(z=>z==='oppose').length,missing=ss.filter(z=>z==='missing').length,alignment=supports===3&&missing===0?'strong':supports>=2?'normal':opposes>=2?'oppose':'weak';return{...x,systems:{A:{score:A,status:status(A)},B:{score:B,status:status(B)},C:{score:C,status:status(C)}},alignment,first_score:+Number(first||0).toFixed(1),second_score:+Number(second||0).toFixed(1),third_score:+Number(third||0).toFixed(1),required_missing:missing}})
}
function rankings(ev){const pack=k=>[...ev].sort((a,b)=>b[k]-a[k]).map(x=>({lane:x.lane,score:x[k],alignment:x.alignment}));return{first:pack('first_score'),second:pack('second_score'),third:pack('third_score')}}
function axisScore(ev){const r=rankings(ev),head=ev.find(x=>x.lane===r.first[0]?.lane)||ev[0],A=head?.systems.A.score,B=head?.systems.B.score,C=head?.systems.C.score,exRank=rankScores(ev,'exhibition_time',true).get(ev.indexOf(head));const axes={axis_reliability:head?.first_score??0,exhibition_start:avg([A,exRank])??0,racer_course_fit:C??0,motor_leg:B??0,venue_water_weather:50,day_flow:50,odds_value:50},weights={axis_reliability:25,exhibition_start:15,racer_course_fit:25,motor_leg:15,venue_water_weather:8,day_flow:8,odds_value:4};let total=0;for(const k of Object.keys(weights))total+=clamp(axes[k])*weights[k]/100;return{buy_value:Math.round(clamp(total)),head_lane:head?.lane||null,head,rankings:r}}
function structuralTheories(ev,r){const head=ev.find(x=>x.lane===r.first[0]?.lane),one=ev.find(x=>x.lane===1),others=ev.filter(x=>x.lane!==head?.lane&&['normal','strong'].includes(x.alignment)),list=[];if(head?.lane===1&&['normal','strong'].includes(head.alignment))list.push({name:'壱−弐−参型',fit:head.first_score+2});if(head&&head.systems.A.status==='support'&&head.systems.B.status==='support'&&head.systems.C.status!=='oppose')list.push({name:'直前気配＋ST型',fit:head.first_score+3});if(head?.lane!==1&&one&&(one.alignment==='oppose'||one.first_score+8<head.first_score)&&['normal','strong'].includes(head.alignment))list.push({name:'イン飛び外頭理論',fit:head.first_score+4});if(head?.lane===1&&head.alignment==='strong')list.push({name:'直前強一致・1号艇型',fit:head.first_score+5});if(head?.lane===1&&head.alignment==='strong'&&others.length>=2)list.push({name:'強イン高配当理論',fit:head.first_score+avg(others.slice(0,3).map(x=>x.second_score))/20});if(head?.alignment==='strong'&&others.length>=2)list.push({name:'展開強一致・超高配当型',fit:head.first_score+avg(others.slice(0,3).map(x=>x.third_score))/18});return list.sort((a,b)=>b.fit-a.fit)}
function capFor(t){return{'壱−弐−参型':4,'直前気配＋ST型':6,'イン飛び外頭理論':8,'直前強一致・1号艇型':10,'強イン高配当理論':12,'展開強一致・超高配当型':20}[t]||0}
function band(t,o){if(t==='壱−弐−参型')return o>=3&&o<20;if(t==='直前気配＋ST型')return o>=20&&o<40;if(t==='イン飛び外頭理論')return o>=40&&o<60;if(t==='直前強一致・1号艇型')return o>=60&&o<100;if(t==='強イン高配当理論')return o>=100&&o<200;if(t==='展開強一致・超高配当型')return o>=200;return false}
function combosFor(theory,ev,r,odds){const map=new Map(ev.map(x=>[x.lane,x])),head=r.first[0]?.lane;if(!head)return[];const sec=r.second.map(x=>x.lane).filter(x=>x!==head),thr=r.third.map(x=>x.lane).filter(x=>x!==head),out=[],secN=theory==='壱−弐−参型'?2:theory==='直前気配＋ST型'?3:4,thrN=theory==='壱−弐−参型'?3:theory==='直前気配＋ST型'?4:5;for(const b of sec.slice(0,secN))for(const c of thr.slice(0,thrN)){if(b===c||head===b||head===c)continue;const sb=map.get(b),tb=map.get(c);if(['強イン高配当理論','展開強一致・超高配当型'].includes(theory)&&(!['normal','strong'].includes(sb?.alignment)||!['normal','strong'].includes(tb?.alignment)))continue;const ticket=`${head}-${b}-${c}`,o=odds.get(ticket);if(o!==undefined&&band(theory,o))out.push({ticket,odds:o,score:(map.get(head)?.first_score||0)+(sb?.second_score||0)+(tb?.third_score||0)})}return out.sort((a,b)=>b.score-a.score)}
function selectTheory(ev,odds){const r=rankings(ev),eligible=structuralTheories(ev,r);for(const t of eligible){const cs=combosFor(t.name,ev,r,odds);if(cs.length)return{theory:t.name,rankings:r,candidates:cs,cap:capFor(t.name)}}return{theory:null,rankings:r,candidates:[],cap:0}}
function allocate(sel){let xs=sel.candidates.slice(0,sel.cap).map(x=>({...x,stake:100}));while(xs.length){const total=xs.length*100,bad=xs.findIndex(x=>x.odds*100<total);if(bad<0)break;xs.pop()}return{picks:xs,total:xs.length*100}}
function categoryForOdds(o){if(o<20)return'堅実';if(o<40)return'中穴20-39.9';if(o<60)return'中穴40-59.9';if(o<100)return'狙い目';if(o<200)return'高配当';return'超高配当'}
function missType(picks,order){if(order.length<3)return'情報未反映';const ts=picks.map(x=>x.ticket),target=order.join('-');if(ts.includes(target))return null;if(!ts.some(t=>t.startsWith(order[0]+'-')))return'頭候補の誤り';if(!ts.some(t=>t.startsWith(order[0]+'-'+order[1]+'-')))return'2着抜け';const same=ts.some(t=>{const a=t.split('-').map(Number);return order.every(x=>a.includes(x))});return same?'着順違い':'3着抜け'}
function bucket(map,key,bet=0,ret=0,hit=false){const z=map[key]||(map[key]={races:0,hits:0,stake:0,returns:0});z.races++;if(hit)z.hits++;z.stake+=bet;z.returns+=ret}
function finalizeMap(map){const out={};for(const [k,z] of Object.entries(map))out[k]={...z,profit:z.returns-z.stake,roi:z.stake?+(z.returns/z.stake*100).toFixed(1):null,hit_rate:z.races?+(z.hits/z.races*100).toFixed(1):null};return out}

const warmStart=addDays(START,-WARMUP_DAYS),allDates=dates(warmStart,END);
console.log(`Downloading ${allDates.length} days (${warmStart}..${END}), test=${START}..${END}`);
let downloaded=0,missingDays=0;
const days=await mapLimit(allDates,CONCURRENCY,async d=>{try{const j=await fetchJson(dailyUrl(d));if(!j)missingDays++;downloaded++;if(downloaded%50===0)console.log(`downloaded ${downloaded}/${allDates.length}`);return{date:d,j}}catch(e){console.error('fetch failed',d,e.message);missingDays++;return{date:d,j:null}}});

const hist=new RollingHistory(),summary={model:MODEL,mode:MODE,start:START,end:END,warmup_start:warmStart,warmup_days:WARMUP_DAYS,days_requested:allDates.length,missing_days:missingDays,total_races:0,evaluable_races:0,enter_races:0,hits:0,stake:0,returns:0,profit:0,roi:null,hit_rate:null,participation_rate:null,data_missing_skips:0,score_below_64:0,candidate_64_69:0,theory_mismatch:0,allocation_fail:0};
const byVenue={},byTheory={},byCategory={},byScore={},byPoints={},misses={};

for(const {date,j} of days){if(!j)continue;const races=[];for(const [vs,s] of Object.entries(j?.programs?.stadiums||{}))for(const [rs,r] of Object.entries(s?.races||{})){if(!r?.result)continue;races.push({venue:+vs,race:+rs,r})}races.sort((a,b)=>String(a.r.closed_at||'').localeCompare(String(b.r.closed_at||''))||a.venue-b.venue||a.race-b.race);
  for(const x of races){const r=x.r,order=resultOrder(r),pv=r.preview?.racers||{},racers=r.racers||{};
    if(date>=START)summary.total_races++;
    const lanes=buildLanes(r,hist),ev=boatEvaluation(lanes),score=axisScore(ev),odds=oddsMap(r),sel=selectTheory(ev,odds),alloc=allocate(sel);
    const essential=!!score.head&&score.head.required_missing===0,hasPreview=Object.keys(pv).length>=6,hasOdds=odds.size>0,hasResult=order.length===3;
    if(date>=START){
      if(!(hasPreview&&hasOdds&&hasResult)){summary.data_missing_skips++}
      else if(score.buy_value<64){summary.score_below_64++}
      else if(score.buy_value<70){summary.candidate_64_69++}
      else if(!essential||!sel.theory){summary.theory_mismatch++}
      else if(!alloc.picks.length){summary.allocation_fail++}
      else{
        summary.evaluable_races++;summary.enter_races++;const pmap=payoutMap(r),stake=alloc.total;let ret=0,hit=false;for(const p of alloc.picks){const unit=pmap.get(p.ticket)||0;if(unit>0){ret+=(p.stake/100)*unit;hit=true}}
        summary.stake+=stake;summary.returns+=ret;if(hit)summary.hits++;
        const venue=String(x.venue).padStart(2,'0'),theory=sel.theory,cat=categoryForOdds(alloc.picks[0].odds),scoreBand=score.buy_value>=90?'90+':score.buy_value>=80?'80-89':score.buy_value>=75?'75-79':'70-74',points=String(alloc.picks.length);
        bucket(byVenue,venue,stake,ret,hit);bucket(byTheory,theory,stake,ret,hit);bucket(byCategory,cat,stake,ret,hit);bucket(byScore,scoreBand,stake,ret,hit);bucket(byPoints,points,stake,ret,hit);
        if(!hit){const m=missType(alloc.picks,order);misses[m]=(misses[m]||0)+1}
      }
    }
    const rr=r.result?.racers||{};for(const z of Object.values(rr)){const lane=Number(z.entry_number||0),a=racers[String(lane)]||{},course=Number(z.course_number||pv[String(lane)]?.course_number||lane),place=Number(z.place_number||0);if(place>=1&&place<=6)hist.add(a.number||z.number,course,place)}
  }
}
summary.profit=summary.returns-summary.stake;summary.roi=summary.stake?+(summary.returns/summary.stake*100).toFixed(1):null;summary.hit_rate=summary.enter_races?+(summary.hits/summary.enter_races*100).toFixed(1):null;summary.participation_rate=summary.total_races?+(summary.enter_races/summary.total_races*100).toFixed(1):null;
const report={summary,by_venue:finalizeMap(byVenue),by_theory:finalizeMap(byTheory),by_category:finalizeMap(byCategory),by_score:finalizeMap(byScore),by_points:finalizeMap(byPoints),miss_types:misses,limitations:[
  '結果は予測作成後の精算にのみ使用し、予測入力には使用していない。',
  'コース成績はウォームアップ期間以降の過去レースだけを最大200走でローリング集計し、未来データ混入を避けた。',
  'historical JSON に一周・まわり足・直線が無いレースは、存在する展示・ST・モーター情報だけで足系を評価した。欠損を満点扱いしていない。',
  '場・水面・風・潮、当日流れ、オッズ妙味は現行V6実装と同じく中立50点。',
  '買い目候補のオッズは保存された公式3連単オッズを使用。現在本番の旧ライブAPI由来候補プールより候補範囲が広いので、完全同一再現ではなく historical-safe replay。',
  '1点100円固定で開始し、トリガミ候補を除外。削減分を他の買い目へ自動上乗せしていない。'
]};
await fs.mkdir('reports',{recursive:true});await fs.writeFile('reports/backtest-v60-2y.json',JSON.stringify(report,null,2));
const fmt=n=>Number(n||0).toLocaleString('ja-JP'),table=(obj)=>Object.entries(obj).sort((a,b)=>(b[1].roi??-1)-(a[1].roi??-1)).map(([k,v])=>`| ${k} | ${v.races} | ${v.hits} | ${v.hit_rate??'--'}% | ¥${fmt(v.stake)} | ¥${fmt(v.returns)} | ¥${fmt(v.profit)} | ${v.roi??'--'}% |`).join('\n');
const md=`# ONE BOAT V6.0 2年間バックテスト\n\n- 対象期間: ${START} 〜 ${END}\n- ウォームアップ開始: ${warmStart}\n- モデル: ${MODEL}\n- 再現方式: ${MODE}\n- 総レース: **${fmt(summary.total_races)}R**\n- ENTER: **${fmt(summary.enter_races)}R**\n- 参加率: **${summary.participation_rate??'--'}%**\n- 的中: **${fmt(summary.hits)}R**\n- 的中率: **${summary.hit_rate??'--'}%**\n- 投資: **¥${fmt(summary.stake)}**\n- 払戻: **¥${fmt(summary.returns)}**\n- 収支: **¥${fmt(summary.profit)}**\n- 回収率: **${summary.roi??'--'}%**\n- 情報欠損見送り: ${fmt(summary.data_missing_skips)}R\n- 64未満: ${fmt(summary.score_below_64)}R\n- 64〜69候補: ${fmt(summary.candidate_64_69)}R\n- 理論不一致: ${fmt(summary.theory_mismatch)}R\n- 配分不成立: ${fmt(summary.allocation_fail)}R\n\n## 理論別\n| 理論 | R | 的中 | 的中率 | 投資 | 払戻 | 収支 | ROI |\n|---|---:|---:|---:|---:|---:|---:|---:|\n${table(report.by_theory)}\n\n## 分類別\n| 分類 | R | 的中 | 的中率 | 投資 | 払戻 | 収支 | ROI |\n|---|---:|---:|---:|---:|---:|---:|---:|\n${table(report.by_category)}\n\n## 評価点別\n| 評価点 | R | 的中 | 的中率 | 投資 | 払戻 | 収支 | ROI |\n|---|---:|---:|---:|---:|---:|---:|---:|\n${table(report.by_score)}\n\n## 点数別\n| 点数 | R | 的中 | 的中率 | 投資 | 払戻 | 収支 | ROI |\n|---|---:|---:|---:|---:|---:|---:|---:|\n${table(report.by_points)}\n\n## 外れ分類\n${Object.entries(misses).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`- ${k}: ${fmt(v)}R`).join('\n')}\n\n## 注意\n${report.limitations.map(x=>`- ${x}`).join('\n')}\n`;
await fs.writeFile('reports/backtest-v60-2y.md',md);console.log('\n=== RESULT ===');console.log(JSON.stringify(summary,null,2));console.log('reports/backtest-v60-2y.json');console.log('reports/backtest-v60-2y.md');