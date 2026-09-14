export const THEORY_KEYS=['in_trust','in_break','st_pressure','oriten','past_form','motor_gain','venue_bias','water_change','day_flow','odds_distortion','tie_cover'];

export const CONFIDENCE_AXES={
  axis_trust:{label:'軸の信頼度',weight:25},
  exhibition_start:{label:'展示・スタート展示',weight:15},
  player_course:{label:'選手力・コース適性',weight:25},
  motor_foot:{label:'モーター・足',weight:15},
  venue_water_weather:{label:'場・水面・風・潮',weight:8},
  day_flow:{label:'当日流れ',weight:8},
  value_edge:{label:'オッズ妙味・期待値',weight:4}
};

export const DEFAULT_POLICY={
  min_value_score:70,
  min_confidence_score_shadow:70,
  confidence_gate_enabled:false,
  max_stake_yen:5000,
  max_points:6,
  base_points:4,
  recalc_minutes:10,
  finalize_minutes:8,
  min_sample:40,
  roi_enable:115,
  roi_watch:100,
  max_daily_hole:5
};

const W={in_trust:1.00,in_break:1.06,st_pressure:1.08,oriten:1.02,past_form:1.00,motor_gain:1.04,venue_bias:1.03,water_change:1.04,day_flow:1.02,odds_distortion:1.14,tie_cover:0.94};
const clamp=(n,a=0,b=100)=>Math.max(a,Math.min(b,Number(n)||0));
const mean=xs=>xs.length?xs.reduce((s,v)=>s+v,0)/xs.length:null;
const finite=v=>Number.isFinite(Number(v));

function firstFinite(obj,keys=[]){for(const k of keys){if(obj&&finite(obj[k]))return clamp(obj[k])}return null}
function fromTheory(theory,keys=[]){const xs=keys.filter(k=>finite(theory?.[k])).map(k=>clamp(theory[k]));return mean(xs)}

export function confidenceScore(r={}){
  const theory=r.theory_scores||r.theories||{};
  const c=r.confidence_components||r.confidence_breakdown||{};
  const axes={
    axis_trust:firstFinite(c,['axis_trust','anchor_trust'])??firstFinite(r,['axis_trust','anchor_trust'])??fromTheory(theory,['in_trust']),
    exhibition_start:firstFinite(c,['exhibition_start','exhibition','start_exhibition'])??firstFinite(r,['exhibition_start','exhibition_score','start_exhibition_score'])??fromTheory(theory,['st_pressure','oriten']),
    player_course:firstFinite(c,['player_course','player_strength','course_fit'])??firstFinite(r,['player_course_score','player_strength','course_fit_score'])??fromTheory(theory,['past_form']),
    motor_foot:firstFinite(c,['motor_foot','motor','foot'])??firstFinite(r,['motor_foot_score','motor_score','foot_score'])??fromTheory(theory,['motor_gain']),
    venue_water_weather:firstFinite(c,['venue_water_weather','venue_water','weather_tide'])??firstFinite(r,['venue_water_weather_score','weather_score','tide_score'])??fromTheory(theory,['venue_bias','water_change']),
    day_flow:firstFinite(c,['day_flow'])??firstFinite(r,['day_flow_score'])??fromTheory(theory,['day_flow']),
    value_edge:firstFinite(c,['value_edge','odds_value'])??firstFinite(r,['value_edge_score','odds_value_score'])??fromTheory(theory,['odds_distortion'])
  };
  const available=Object.values(axes).filter(v=>v!==null);
  if(!available.length){const fallback=clamp(r.confidence??r.score??r.value_score);return {confidence_score:Math.round(fallback),breakdown:[],missing_axes:Object.keys(CONFIDENCE_AXES),source:'fallback'}}
  let total=0;const breakdown=[];const missing=[];
  for(const [key,cfg] of Object.entries(CONFIDENCE_AXES)){
    const score=axes[key];
    if(score===null){missing.push(key);breakdown.push({axis:key,label:cfg.label,score:null,weight:cfg.weight,points:0});continue}
    const points=score*cfg.weight/100;total+=points;breakdown.push({axis:key,label:cfg.label,score:+score.toFixed(1),weight:cfg.weight,points:+points.toFixed(2)});
  }
  return {confidence_score:Math.round(clamp(total)),breakdown,missing_axes:missing,source:'v5-7axis'};
}

export function classifyOdds(oddsInput){
  const odds=Number(oddsInput||0);
  if(!(odds>0))return {category:'未分類',strategy:'未分類',odds_bucket:'unknown',high_variance:false};
  if(odds<3)return {category:'対象外',strategy:'低オッズ回避',odds_bucket:'under-3',high_variance:false};
  if(odds<20){const bucket=odds<7?'3-6.9':odds<10?'7-9.9':odds<15?'10-14.9':'15-19.9';return {category:'堅実',strategy:'壱−弐−参型',odds_bucket:bucket,high_variance:false}}
  if(odds<40)return {category:'中穴',strategy:'直前気配＋ST型',odds_bucket:'20-39.9',high_variance:false};
  if(odds<60)return {category:'中穴',strategy:'イン飛び外頭理論',odds_bucket:'40-59.9',high_variance:false};
  if(odds<100)return {category:'狙い目',strategy:'直前強一致・1号艇型',odds_bucket:'60-99.9',high_variance:true};
  if(odds<200)return {category:'高配当',strategy:'強イン高配当理論',odds_bucket:'100-199.9',high_variance:true};
  const bucket=odds<300?'200-299':odds<500?'300-499':odds<1000?'500-999':'1000+';
  return {category:'超高配当',strategy:'スコア66理論',odds_bucket:bucket,high_variance:true};
}

export function selectVenueTheory(recent=[],previous='据え置き'){
  const norm=x=>{if(typeof x==='boolean')return x?'IN':'OUT';const winner=Number(x?.winner_lane??x?.winner??x?.first_course??0);if(winner===1)return'IN';if(winner>1)return'OUT';if(x?.boat1_win===true)return'IN';if(x?.boat1_win===false)return'OUT';return null};
  const xs=recent.map(norm).filter(Boolean);if(xs.length<2)return previous;
  const a=xs[xs.length-1],b=xs[xs.length-2];
  if(a==='IN'&&b==='IN')return'イン信頼＋当日流れ';
  if(a==='OUT'&&b==='OUT')return'イン飛び＋当日流れ';
  return previous;
}

export function scoreRace(r,policy=DEFAULT_POLICY){
  const theory=r.theory_scores||r.theories||{};
  const pairs=THEORY_KEYS.map(k=>[k,clamp(theory[k])]).filter(([,v])=>v>0);
  const c=confidenceScore(r);
  const weighted=pairs.length?pairs.reduce((s,[k,v])=>s+v*W[k],0)/pairs.reduce((s,[k])=>s+W[k],0):c.confidence_score;
  const odds=Number(r.odds??r.expected_odds??0);
  const ev=Number(r.expected_value??r.ev??0);
  const missing=Number(r.missing_data_count??0);
  const penalty=Math.min(24,missing*5)+(odds>0&&odds<1.1?20:0);
  const value=clamp(weighted+(ev>1?Math.min(15,(ev-1)*20):0)-penalty);
  const reasons=c.breakdown.filter(x=>x.score!==null).sort((a,b)=>b.points-a.points).slice(0,3);
  return {...c,value_score:Math.round(value),reasons};
}

export function evaluateRace(r,policy=DEFAULT_POLICY,history={}){
  const s=scoreRace(r,policy);const stake=Math.min(policy.max_stake_yen,Math.max(0,Number(r.stake_total_yen??r.stake??0)));
  const sample=Number(history.sample??r.theory_sample??0);const roi=Number(history.roi??r.theory_roi??0);
  const odds=Number(r.odds??r.expected_odds??0);const noData=Number(r.missing_data_count??0)>0;
  const cls=classifyOdds(odds);const dayFlowTheory=selectVenueTheory(r.venue_recent_results||[],r.current_theory||cls.strategy);
  let decision='SKIP',why='条件不足';
  if(odds>0&&odds<3){decision='SKIP';why='3倍未満は本番対象外'}
  else if(noData){decision='WATCH';why='欠損データあり'}
  else if(sample>0&&sample<policy.min_sample){decision='WATCH';why='サンプル不足'}
  else if(roi>0&&roi<policy.roi_watch){decision='SKIP';why='理論ROI停止基準未満'}
  else if(s.value_score>=policy.min_value_score&&(roi===0||roi>=policy.roi_enable)){
    if(policy.confidence_gate_enabled&&s.confidence_score<policy.min_confidence_score_shadow){decision='WATCH';why='自信度ゲート未達'}
    else{decision='ENTER';why='価値・理論基準通過'}
  }else if(s.value_score>=policy.min_value_score-5){decision='WATCH';why='境界域'}
  const monitor={
    confidence_gate_shadow:s.confidence_score>=policy.min_confidence_score_shadow,
    steady_rank:null,
    points_bucket:Number(r.points??policy.base_points)>=3?'3点以上':'1-2点',
    high_variance:cls.high_variance,
    odds_bucket:cls.odds_bucket
  };
  if(cls.category==='堅実'){
    const b=Object.fromEntries(s.breakdown.map(x=>[x.axis,x.score]));
    const candidate=Number(r.second_third_match_score??r.tie_candidate_score??0);
    monitor.steady_rank=(Number(b.axis_trust)>=75&&Number(b.exhibition_start)>=75&&Number(b.player_course)>=75&&candidate>=70)?'A':'B';
  }
  if(decision!=='ENTER')return {...s,...cls,day_flow_theory:dayFlowTheory,monitor,decision,stake_total_yen:0,reason:why};
  const points=Math.max(1,Math.min(policy.max_points,Number(r.points??policy.base_points)));
  const total=stake>0?stake:policy.max_stake_yen;
  const unit=Math.floor(total/points/100)*100;
  const stake_total_yen=unit*points;
  return {...s,...cls,day_flow_theory:dayFlowTheory,monitor,decision,stake_total_yen,points,reason:why};
}

export function aggregateBacktest(rows=[]){
  const groups=new Map();
  for(const r of rows){
    const cls=classifyOdds(r.odds??r.expected_odds??0);
    const key=r.theory||r.strategy||cls.strategy||'unknown';
    if(!groups.has(key))groups.set(key,{theory:key,sample:0,bet:0,return:0,hit:0,buckets:{}});
    const g=groups.get(key);g.sample++;g.bet+=Number(r.bet_yen??r.stake_total_yen??0);g.return+=Number(r.return_yen??r.payout_yen??0);g.hit+=Number(r.return_yen??r.payout_yen??0)>0?1:0;
    const bk=cls.odds_bucket;if(!g.buckets[bk])g.buckets[bk]={sample:0,bet:0,return:0,hit:0};const z=g.buckets[bk];z.sample++;z.bet+=Number(r.bet_yen??r.stake_total_yen??0);z.return+=Number(r.return_yen??r.payout_yen??0);z.hit+=Number(r.return_yen??r.payout_yen??0)>0?1:0;
  }
  return [...groups.values()].map(g=>({...g,buckets:Object.fromEntries(Object.entries(g.buckets).map(([k,z])=>[k,{...z,roi:z.bet?+(z.return/z.bet*100).toFixed(1):0,hit_rate:z.sample?+(z.hit/z.sample*100).toFixed(1):0,profit:z.return-z.bet}])),roi:g.bet?+(g.return/g.bet*100).toFixed(1):0,hit_rate:g.sample?+(g.hit/g.sample*100).toFixed(1):0,profit:g.return-g.bet,status:g.sample<DEFAULT_POLICY.min_sample?'WATCH':(g.bet&&g.return/g.bet*100>=DEFAULT_POLICY.roi_enable?'ACTIVE':(g.bet&&g.return/g.bet*100>=DEFAULT_POLICY.roi_watch?'WATCH':'STOP'))})).sort((a,b)=>b.roi-a.roi);
}

export function walkForward(rows=[],trainRatio=.7){
  const sorted=[...rows].sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')));
  const cut=Math.max(1,Math.floor(sorted.length*trainRatio));
  return {train:aggregateBacktest(sorted.slice(0,cut)),validation:aggregateBacktest(sorted.slice(cut)),train_size:cut,validation_size:sorted.length-cut};
}
