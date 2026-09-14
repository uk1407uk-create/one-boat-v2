export const THEORY_KEYS=['in_trust','in_break','st_pressure','oriten','past_form','motor_gain','venue_bias','water_change','day_flow','odds_distortion','tie_cover'];

export const DEFAULT_POLICY={min_value_score:70,max_stake_yen:5000,max_points:6,base_points:4,finalize_minutes:10,safety_check_minutes:5,min_sample:40,roi_enable:115,roi_watch:100,max_daily_hole:5};

const W={in_trust:1.00,in_break:1.06,st_pressure:1.08,oriten:1.02,past_form:1.00,motor_gain:1.04,venue_bias:1.03,water_change:1.04,day_flow:1.02,odds_distortion:1.14,tie_cover:0.94};
const clamp=(n,a=0,b=100)=>Math.max(a,Math.min(b,Number(n)||0));

export function scoreRace(r,policy=DEFAULT_POLICY){
  const theory=r.theory_scores||r.theories||{};
  const pairs=THEORY_KEYS.map(k=>[k,clamp(theory[k])]).filter(([,v])=>v>0);
  const weighted=pairs.length?pairs.reduce((s,[k,v])=>s+v*W[k],0)/pairs.reduce((s,[k])=>s+W[k],0):clamp(r.score??r.value_score??r.confidence);
  const odds=Number(r.odds??r.expected_odds??0);
  const ev=Number(r.expected_value??r.ev??0);
  const missing=Number(r.missing_data_count??0);
  const penalty=Math.min(24,missing*5)+(odds>0&&odds<1.1?20:0);
  const value=clamp(weighted+(ev>1?Math.min(15,(ev-1)*20):0)-penalty);
  const reasons=pairs.sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,v])=>({theory:k,score:v}));
  return {value_score:Math.round(value),reasons};
}

export function evaluateRace(r,policy=DEFAULT_POLICY,history={}){
  const s=scoreRace(r,policy);const stake=Math.min(policy.max_stake_yen,Math.max(0,Number(r.stake_total_yen??r.stake??0)));
  const sample=Number(history.sample??r.theory_sample??0);const roi=Number(history.roi??r.theory_roi??0);
  const odds=Number(r.odds??r.expected_odds??0);const noData=Number(r.missing_data_count??0)>0;
  let decision='SKIP',why='条件不足';
  if(noData){decision='WATCH';why='欠損データあり'}
  else if(sample>0&&sample<policy.min_sample){decision='WATCH';why='サンプル不足'}
  else if(roi>0&&roi<policy.roi_watch){decision='SKIP';why='理論ROI停止基準未満'}
  else if(s.value_score>=policy.min_value_score&&(roi===0||roi>=policy.roi_enable)){decision='ENTER';why='価値・理論基準通過'}
  else if(s.value_score>=policy.min_value_score-5){decision='WATCH';why='境界域'}
  if(decision!=='ENTER')return {...s,decision,stake_total_yen:0,reason:why};
  const points=Math.max(1,Math.min(policy.max_points,Number(r.points??policy.base_points)));
  const total=stake>0?stake:policy.max_stake_yen;
  const unit=Math.floor(total/points/100)*100;
  const stake_total_yen=unit*points;
  const category=odds>=200?'穴200+':odds>=100?'穴100-199.9':odds>=60?'穴60-99.9':odds>=20?'中穴':'堅実';
  return {...s,decision,stake_total_yen,points,category,reason:why};
}

export function aggregateBacktest(rows=[]){
  const groups=new Map();
  for(const r of rows){
    const key=r.theory||r.strategy||'unknown';
    if(!groups.has(key))groups.set(key,{theory:key,sample:0,bet:0,return:0,hit:0});
    const g=groups.get(key);g.sample++;g.bet+=Number(r.bet_yen??r.stake_total_yen??0);g.return+=Number(r.return_yen??r.payout_yen??0);g.hit+=Number(r.return_yen??r.payout_yen??0)>0?1:0;
  }
  return [...groups.values()].map(g=>({...g,roi:g.bet?+(g.return/g.bet*100).toFixed(1):0,hit_rate:g.sample?+(g.hit/g.sample*100).toFixed(1):0,profit:g.return-g.bet,status:g.sample<DEFAULT_POLICY.min_sample?'WATCH':(g.bet&&g.return/g.bet*100>=DEFAULT_POLICY.roi_enable?'ACTIVE':(g.bet&&g.return/g.bet*100>=DEFAULT_POLICY.roi_watch?'WATCH':'STOP'))})).sort((a,b)=>b.roi-a.roi);
}

export function walkForward(rows=[],trainRatio=.7){
  const sorted=[...rows].sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')));
  const cut=Math.max(1,Math.floor(sorted.length*trainRatio));
  return {train:aggregateBacktest(sorted.slice(0,cut)),validation:aggregateBacktest(sorted.slice(cut)),train_size:cut,validation_size:sorted.length-cut};
}
