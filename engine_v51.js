import {
  DEFAULT_POLICY as BASE_POLICY,
  CONFIDENCE_AXES,
  confidenceScore,
  classifyOdds,
  selectVenueTheory,
  evaluateRace as baseEvaluateRace,
  aggregateBacktest,
  walkForward
} from './engine.js';

export {CONFIDENCE_AXES,confidenceScore,classifyOdds,selectVenueTheory,aggregateBacktest,walkForward};

export const AUXILIARY_POLICY={
  wind14d_min_sample:5,
  wind_speed_tolerance:1.5,
  max_aux_adjustment:6,
  min_base_value_for_positive_aux:65,
  positive_aux_signals_required:2
};

export const DEFAULT_POLICY={...BASE_POLICY,...AUXILIARY_POLICY};

const clamp=(n,a=0,b=100)=>Math.max(a,Math.min(b,Number(n)||0));
const finite=v=>Number.isFinite(Number(v));
const text=v=>String(v??'').trim().toLowerCase();

function waterType(r={}){return text(r.water_type??r.venue_water_type??r.water_quality)}
function isTidalVenue(r={}){const w=waterType(r);return w.includes('海')||w.includes('汽')||w.includes('sea')||w.includes('brackish')}
function normWind(v){return text(v).replace(/\s+/g,'').replace('北北東','nne').replace('東北東','ene').replace('東南東','ese').replace('南南東','sse').replace('南南西','ssw').replace('西南西','wsw').replace('西北西','wnw').replace('北北西','nnw').replace('北','n').replace('東','e').replace('南','s').replace('西','w')}
function winnerLane(x){if(typeof x==='boolean')return x?1:2;const n=Number(x?.winner_lane??x?.winner??x?.first_course??x?.winning_lane??0);if(n>=1&&n<=6)return n;if(x?.boat1_win===true)return 1;if(x?.boat1_win===false)return 2;return 0}

export function wind14dSignal(r={},policy=DEFAULT_POLICY){
  const direct=r.wind_match_score??r.wind_trend_score??r.wind14d_score;
  if(finite(direct))return {available:true,score:clamp(direct),sample:Number(r.wind14d_sample??0),source:'direct'};
  const history=Array.isArray(r.wind_history_14d)?r.wind_history_14d:Array.isArray(r.wind14d_history)?r.wind14d_history:Array.isArray(r.similar_wind_results)?r.similar_wind_results:[];
  if(!history.length)return {available:false,score:null,sample:0,source:'none'};
  const currentDir=normWind(r.wind_direction??r.wind_dir);
  const currentSpeed=Number(r.wind_speed??r.wind_speed_mps);
  const tol=Number(policy.wind_speed_tolerance??1.5);
  const matched=history.filter(x=>{
    const d=normWind(x?.wind_direction??x?.wind_dir);
    const s=Number(x?.wind_speed??x?.wind_speed_mps);
    const dirOk=!currentDir||!d||d===currentDir;
    const speedOk=!finite(currentSpeed)||!finite(s)||Math.abs(s-currentSpeed)<=tol;
    return dirOk&&speedOk&&winnerLane(x)>0;
  });
  if(matched.length<Number(policy.wind14d_min_sample??5))return {available:false,score:null,sample:matched.length,source:'history_insufficient'};
  const inWins=matched.filter(x=>winnerLane(x)===1).length;
  return {available:true,score:+(inWins/matched.length*100).toFixed(1),sample:matched.length,source:'history'};
}

export function selectInitialTheory(r={},fallback='据え置き',policy=DEFAULT_POLICY){
  const raceNo=Number(r.race_no??r.race??0);
  if(raceNo!==1)return {theory:fallback,wind:null,changed:false};
  const wind=wind14dSignal(r,policy);
  if(!wind.available)return {theory:fallback,wind,changed:false};
  if(wind.score>=65)return {theory:'イン信頼＋風14日補正',wind,changed:true};
  if(wind.score<=35)return {theory:'イン飛び＋風14日補正',wind,changed:true};
  return {theory:fallback,wind,changed:false};
}

function strategyIsInBreak(strategy=''){const s=String(strategy);return s.includes('イン飛び')||s.includes('外頭')}
function addSignal(out,key,label,rawScore,maxPoints,meta={}){
  if(!finite(rawScore))return;
  const score=clamp(rawScore);const contribution=(score-50)/50*maxPoints;
  out.push({key,label,score:+score.toFixed(1),contribution:+contribution.toFixed(2),supportive:score>=60,opposing:score<=40,...meta});
}

export function auxiliaryContext(r={},strategy='',policy=DEFAULT_POLICY){
  const signals=[];const wind=wind14dSignal(r,policy);const inBreak=strategyIsInBreak(strategy);
  if(wind.available){const directional=inBreak?100-wind.score:wind.score;addSignal(signals,'wind14d','風向・風速×14日傾向',directional,2.5,{sample:wind.sample,raw_in_win_rate:wind.score,source:wind.source})}
  if(isTidalVenue(r))addSignal(signals,'tide','潮汐',r.tide_score??r.tide_fit_score,0.8,{water_type:r.water_type??r.venue_water_type??null});
  addSignal(signals,'temperature_water','気温・水温×モーター/場',r.temperature_motor_score??r.temp_water_score??r.temperature_water_score,0.8);
  addSignal(signals,'previous_motor_user','前走者モーター気配',r.previous_motor_user_score??r.previous_user_motor_score,0.7);
  addSignal(signals,'motor_player_fit','モーター×選手相性',r.motor_player_fit_score??r.motor_racer_fit_score,1.2);
  const positive=signals.filter(x=>x.supportive).length;
  const negative=signals.filter(x=>x.opposing).length;
  const raw=signals.reduce((s,x)=>s+x.contribution,0);
  return {signals,supportive_count:positive,opposing_count:negative,raw_adjustment:+raw.toFixed(2)};
}

function canUsePositiveAux(baseValue,aux,policy){return baseValue>=Number(policy.min_base_value_for_positive_aux??65)&&aux.supportive_count>=Number(policy.positive_aux_signals_required??2)}
function hardGuardReason(reason=''){return ['3倍未満は本番対象外','欠損データあり','サンプル不足','理論ROI停止基準未満','穴系は1日最大5Rに到達','超高配当は穴スコア確認待ち','超高配当スコア66未満','自信度ゲート未達'].includes(reason)}

export function evaluateRace(r={},policy=DEFAULT_POLICY,history={}){
  const cls=classifyOdds(r.odds??r.expected_odds??0);
  const dayTheory=selectVenueTheory(r.venue_recent_results||[],r.current_theory||cls.strategy);
  const initial=selectInitialTheory(r,dayTheory,policy);
  const selectedTheory=initial.theory;
  const base=baseEvaluateRace({...r,current_theory:selectedTheory},policy,history);
  const baseValue=Number(base.value_score||0);
  const aux=auxiliaryContext(r,selectedTheory||cls.strategy,policy);
  const positive=aux.raw_adjustment>0?(canUsePositiveAux(baseValue,aux,policy)?aux.raw_adjustment:0):0;
  const negative=aux.raw_adjustment<0?aux.raw_adjustment:0;
  const adjustment=Math.max(-Number(policy.max_aux_adjustment??6),Math.min(Number(policy.max_aux_adjustment??6),positive+negative));
  const valueScore=Math.round(clamp(baseValue+adjustment));
  const inputStake=Math.max(0,Number(r.stake_total_yen??r.stake??0));
  const sample=Number(history.sample??r.theory_sample??0);const roi=Number(history.roi??r.theory_roi??0);
  let decision=base.decision;let reason=base.reason;let stake=Number(base.stake_total_yen||0);

  if(decision==='ENTER'&&valueScore<Number(policy.min_value_score??70)){
    decision=valueScore>=Number(policy.min_value_score??70)-5?'WATCH':'SKIP';reason='補助条件の反対材料で基準未達';stake=0;
  }
  if(decision!=='ENTER'&&!hardGuardReason(reason)&&valueScore>=Number(policy.min_value_score??70)&&inputStake>0&&(roi===0||roi>=Number(policy.roi_enable??115))&&(sample===0||sample>=Number(policy.min_sample??40))){
    decision='ENTER';reason=adjustment>0?'価値基準＋複数補助条件一致':'価値・理論基準通過';
    const points=Math.max(1,Math.min(Number(policy.max_points??6),Number(r.points??policy.base_points??4)));
    const total=Math.min(Number(policy.max_stake_yen??5000),inputStake);const unit=Math.floor(total/points/100)*100;stake=unit*points;
  }
  if(decision==='ENTER'&&inputStake<=0){decision='WATCH';reason='投資額未確定';stake=0}
  if(decision!=='ENTER')stake=0;

  return {
    ...base,
    decision,
    reason,
    stake_total_yen:stake,
    value_score:valueScore,
    base_value_score:baseValue,
    auxiliary_adjustment:+adjustment.toFixed(2),
    auxiliary_reasons:aux.signals,
    selected_theory:selectedTheory,
    initial_theory:initial,
    day_flow_theory:dayTheory,
    auxiliary_policy:{positive_requires_multiple:true,required_supportive:Number(policy.positive_aux_signals_required??2),single_signal_cannot_enter:true,tide_only_sea_or_brackish:true},
    monitor:{...(base.monitor||{}),aux_supportive_count:aux.supportive_count,aux_opposing_count:aux.opposing_count,aux_raw_adjustment:aux.raw_adjustment}
  };
}
