// deploy-marker: formal-status-source-20260918-2130
const ONE_BOAT_CANONICAL_ORIGIN='https://one-boat-club.jp';
function enforceOneBoatCanonical(){
  if(location.hostname==='one-boat-customer.uk-1407-uk.workers.dev'||location.hostname==='www.one-boat-club.jp'){
    location.replace(`${ONE_BOAT_CANONICAL_ORIGIN}${location.pathname}${location.search}${location.hash}`);
    return true;
  }
  return false;
}
if(enforceOneBoatCanonical()) throw new Error('canonical_redirect');
window.addEventListener('pageshow',()=>{enforceOneBoatCanonical()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)enforceOneBoatCanonical()});
const $=s=>document.querySelector(s);
const API='/api/member/analysis';
const LIVE_ORIGINAL_API='/api/member/live-original';
const VENUES=['桐生','戸田','江戸川','平和島','多摩川','浜名湖','蒲郡','常滑','津','三国','びわこ','住之江','尼崎','鳴門','丸亀','児島','宮島','徳山','下関','若松','芦屋','福岡','唐津','大村'];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const params=new URLSearchParams(location.search);
const CODE=Number(params.get('venue')||params.get('code'));
const RACE=Number(params.get('race'));
const jstDate=()=>new Date(Date.now()+32400000).toISOString().slice(0,10);
const DATE=/^\d{4}-\d{2}-\d{2}$/.test(params.get('date')||'')?params.get('date'):jstDate();
let DATA=null;
let ODDS_ITEMS=[];
let ODDS_FIRST=1;

const VIEW_MODE_KEY='one_boat_view_mode';
const yen=n=>`${Math.round(Number(n||0)).toLocaleString('ja-JP')}円`;
function saveViewMode(mode){try{localStorage.setItem(VIEW_MODE_KEY,mode==='pro'?'pro':'easy')}catch{}}
function stateLabel(s){return {ENTER:'正式ENTER',PUBLIC:'予想公開',WATCH:'様子見',SKIP:'見送り',PRIVATE:'予想完了',SETTLED:'結果確定',FINISHED:'本日終了',CLOSED:'終了',NOEVENT:'本日非開催',PENDING:'未判定'}[s]||'未判定'}
function publicRecord(r){const d=String(r?.decision||r?.prediction?.decision||'').toUpperCase(),stake=Number(r?.stake_total_yen??r?.prediction?.stake_total_yen??0);return d==='ENTER'&&stake>0}
function officialBets(r){const p=r?.prediction||{};return Array.isArray(r?.bets)&&r.bets.length?r.bets:Array.isArray(p.production_picks)?p.production_picks:[]}
function officialTicket(x){return x?.ticket||x?.combination||x?.bet||'—'}
function officialStake(x){return Number(x?.stake_yen??x?.amount??x?.stake??0)}
function officialRole(x){const v=String(x?.selection_role||'').toLowerCase();if(/main|本線|primary|core/.test(v))return'本線';return'押さえ'}
function officialFinalOddsRange(x,deadline){
  const o=Number(x?.odds);if(!Number.isFinite(o)||o<=1)return'データなし';
  let left=null,d=null,s=String(deadline||'');
  const hm=s.match(/(\d{1,2}):(\d{2})/);
  if(hm){d=new Date(`${DATE}T${String(Number(hm[1])).padStart(2,'0')}:${hm[2]}:00+09:00`);if(!Number.isNaN(d.getTime()))left=Math.max(0,(d.getTime()-Date.now())/60000)}
  let lo=.85,hi=1.20;if(left!==null&&left>=12){lo=.70;hi=1.35}else if(left!==null&&left>=8){lo=.75;hi=1.30}else if(left!==null&&left>=5){lo=.80;hi=1.25}
  const a=Math.max(1,o*lo),b=Math.max(a,o*hi);return `${a.toFixed(1)}〜${b.toFixed(1)}倍`;
}
function textValue(v){
  if(typeof v==='string')return v.trim();
  if(Array.isArray(v))return v.filter(x=>typeof x==='string').join(' / ');
  if(v&&typeof v==='object')return String(v.name||v.label||v.theory||v.id||'').trim();
  return '';
}
function materialList(v){
  if(Array.isArray(v))return v.map(x=>typeof x==='string'?x:textValue(x)).filter(Boolean).slice(0,5);
  if(v&&typeof v==='object')return Object.values(v).map(x=>typeof x==='string'?x:textValue(x)).filter(Boolean).slice(0,5);
  return [];
}
function racerLabel(lane){
  const r=(DATA?.racers||[]).find(x=>Number(x?.lane)===Number(lane));
  const name=String(r?.name||'').trim();
  return name?`${lane}号艇の${name}選手`:`${lane}号艇`;
}
function normalizeLegacyCutoffText(v){
  return String(v||'')
    .replace(/締切\s*1\s*分前/g,'締切5分前')
    .replace(/1\s*分前までに/g,'5分前までに');
}
function plainDecisionReason(raw){
  const s=normalizeLegacyCutoffText(raw).replace(/\s+/g,' ').trim();
  if(!s)return'';
  const one=racerLabel(1),parts=[];
  if(/イン先マイ/.test(s))parts.push(`${one}が1マークを先に回って逃げる展開を中心に見ています。`);
  if(/頭3艇以下に限定/.test(s))parts.push('1着候補は有力な3艇以内に絞っています。');
  const top=s.match(/TOP3の([0-9.]+)倍未満を最低([0-9,]+)円保護/i);
  if(top)parts.push(`有力と判断した上位3点のうち、予想時${top[1]}倍未満の組み合わせには最低${Number(String(top[2]).replace(/,/g,'')).toLocaleString('ja-JP')}円を配分する条件にしています。`);
  if(/最終ENTER/i.test(s))parts.push('これらの条件がそろったため、購入対象として最終確定しました。');
  if(parts.length)return parts.join('');
  return s
    .replace(/イン先マイ型?/g,`${one}が1マークを先に回って逃げる展開`)
    .replace(/頭3艇以下に限定/g,'1着候補を有力な3艇以内に絞る')
    .replace(/モデルTOP3/g,'有力と判断した上位3点')
    .replace(/最終ENTER/g,'購入対象として最終確定');
}
function plainSupportMaterial(raw){
  const s=String(raw||'').trim(),one=racerLabel(1);
  let m=s.match(/^直近(\d+)走ST反映:\s*(\d+)\/(\d+)艇/i);
  if(m)return`${m[3]}艇すべてについて、直近${m[1]}走のスタート実績を反映`;
  m=s.match(/^場別イン補正:\s*([-+]?\d+(?:\.\d+)?)/i);
  if(m)return`この場の1コース傾向を補正値${m[1]}として反映`;
  if(/^最有力展開:\s*イン先マイ/i.test(s))return`${one}が1マークを先に回って逃げる展開を最も有力と判断`;
  if(/^オリジナル展示v?\d*/i.test(s))return'展示・スタート・コース展開を組み合わせて、1〜3着候補を補正';
  return s
    .replace(/イン先マイ/g,`${one}が1マークを先に回って逃げる展開`)
    .replace(/ST/g,'スタート');
}
function decisionFocusCategories({reason='',theory='',support=[],opposing=[]}={}){
  const text=[reason,theory,...support,...opposing].join(' ');
  const defs=[
    {tab:'live',label:'展示 / ST',note:'展示・進入・STなど、判断記録に出ている直前データを確認',re:/展示|オリジナル|一周|まわり足|回り足|展示ST|進入|チルト|展示タイム|\bST\b/i},
    {tab:'basic',label:'選手 / モーター',note:'選手・コース・モーターなど、判断記録に出ている基礎データを確認',re:/モーター|選手|勝率|コース|当地|級別|2連率|3連率|連対/i},
    {tab:'odds',label:'オッズ',note:'オッズ・配当・市場評価に関する判断材料を確認',re:/オッズ|配当|期待値|市場|歪み|妙味|回収/i}
  ];
  return defs.map(x=>{const m=text.match(x.re);return m?{...x,index:m.index??9999}:null}).filter(Boolean).sort((a,b)=>a.index-b.index);
}
function activateAnalysisTab(tab){
  const b=document.querySelector(`.analysis-tab[data-tab="${tab}"]`);
  if(!b)return;
  b.click();
  document.querySelector('#analysis-tabs')?.scrollIntoView({behavior:'smooth',block:'start'});
}
function renderDecisionFocus(meta){
  const el=$('#decision-focus');if(!el)return;
  const xs=decisionFocusCategories(meta);
  el.hidden=false;
  if(!xs.length){
    el.innerHTML='<details class="decision-focus-compact"><summary><span>判断に使ったデータ</span><b>見る</b></summary><p>この予想には補助データ項目の構造化記録がありません。推測せず、上の正式な判断理由を優先して表示します。</p></details>';
  }else{
    el.innerHTML=`<details class="decision-focus-compact"><summary><span>判断に使ったデータ</span><b>${xs.length}項目</b></summary><div class="decision-focus-list">${xs.map((x,i)=>`<button class="${i===0?'decision-focus-next':''}" type="button" data-focus-tab="${x.tab}"><strong>${esc(x.label)}</strong><span>${esc(x.note)}</span><b>›</b></button>`).join('')}</div></details>`;
  }
  el.querySelectorAll('[data-focus-tab]').forEach(b=>b.addEventListener('click',()=>activateAnalysisTab(b.dataset.focusTab)));
}

async function fetchMemberPrediction(){
  try{
    const u=new URL('/api/member/prediction',location.origin);
    u.searchParams.set('date',DATE);u.searchParams.set('venue',String(CODE));u.searchParams.set('race',String(RACE));u.searchParams.set('_',String(Date.now()));
    const r=await fetch(u,{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
    if(!r.ok)return null;
    const d=await r.json().catch(()=>null);
    if(!d?.ok||!d.record)return null;
    const rec=d.record,decision=String(rec?.decision||rec?.prediction?.decision||'').toUpperCase();
    const state=rec?.settlement?'SETTLED':decision==='ENTER'?'ENTER':decision==='SKIP'?'SKIP':decision==='WATCH'||decision==='FINALIZING'?'WATCH':'PENDING';
    return{ok:true,date:rec.race_date||DATE,races:[{race_no:Number(rec.race_no||RACE),deadline:rec.deadline||null,state,record:rec}]};
  }catch{return null}
}

function setupViewMode(){
  saveViewMode('pro');
  const easy=$('#easy-mode-link');
  if(!easy)return;
  const q=new URLSearchParams({venue:String(CODE).padStart(2,'0'),race:String(RACE),mode:'easy'});
  easy.href=`/today.html?${q.toString()}`;
  easy.addEventListener('click',()=>saveViewMode('easy'));
}

function missing(v){return v===null||v===undefined||v===''}
function value(v,suffix=''){return missing(v)?'—':`${v}${suffix}`}
function fixed(v,d=2,suffix=''){if(missing(v)||!Number.isFinite(Number(v)))return'—';return `${Number(v).toFixed(d)}${suffix}`}
function pct(v){return missing(v)||!Number.isFinite(Number(v))?'—':`${Number(v).toFixed(1)}%`}
function dateJp(v){if(!v)return'—';const m=String(v).match(/(\d{4})-(\d{2})-(\d{2})/);return m?`${Number(m[2])}/${Number(m[3])}`:String(v)}
function updated(v){if(!v)return'—';const d=new Date(v);if(Number.isNaN(d.getTime()))return String(v);return new Intl.DateTimeFormat('ja-JP',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Tokyo'}).format(d)}
function laneBadge(n){return `<span class="lane-box lane-${n}">${n}</span>`}
function stText(v){if(missing(v)||!Number.isFinite(Number(v)))return'—';const n=Number(v);return n<0?`F${Math.abs(n).toFixed(2)}`:n.toFixed(2)}
function venueName(){return VENUES[CODE-1]||`場${CODE}`}
function exMap(d){return new Map((d?.exhibition_detail?.boats||[]).map(x=>[Number(x.lane),x]))}

function renderRacers(d){
  const xs=d?.racers||[],em=exMap(d);
  $('#racer-list').innerHTML=xs.map(r=>{
    const o=r.overall||{};
    const course=em.get(Number(r.lane))?.course??null;
    const c=course===null?null:r.by_course?.[String(course)]||null;
    return `<details class="racer-card">
      <summary class="racer-summary">
        ${laneBadge(r.lane)}
        <div class="racer-name">
          <strong>${esc(r.name||'選手情報待ち')}</strong>
          <small>${r.racer_id?`${esc(r.racer_id)}番`:'登録番号 —'} ・ ${course===null?'進入 —':`${course}コース`}</small>
        </div>
        <span class="racer-chevron">⌄</span>
        <div class="racer-quick">
          <div><span>勝率</span><b>${pct(o.win_rate)}</b></div>
          <div><span>平均ST</span><b>${fixed(o.avg_st,3)}</b></div>
          <div><span>コースST</span><b>${fixed(c?.avg_st,3)}</b></div>
        </div>
      </summary>
      <div class="racer-details">
        <div><span>2連対率</span><strong>${pct(o.top2_rate)}</strong></div>
        <div><span>3連対率</span><strong>${pct(o.top3_rate)}</strong></div>
        <div><span>全体サンプル</span><strong>${missing(o.sample_count)?'—':`${o.sample_count}走`}</strong></div>
        <div><span>コース別サンプル</span><strong>${missing(c?.sample_count)?'—':`${c.sample_count}走`}</strong></div>
        <div><span>STばらつき</span><strong>${fixed(c?.st_sd,3)}</strong></div>
        <div><span>平均展示</span><strong>${fixed(o.avg_exhibition,2)}</strong></div>
      </div>
    </details>`;
  }).join('')||'<div class="empty-card"><strong>選手情報はデータ未連携です</strong><p>正式APIに値が入るまで推測値は表示しません。</p></div>';
}

function startPosition(v){
  if(missing(v)||!Number.isFinite(Number(v)))return 48;
  const n=Number(v);
  return Math.max(34,Math.min(88,76-(n*100)));
}

function renderStartExhibition(d){
  const ex=d?.exhibition_detail||{};
  const xs=(ex.boats||[]).slice().sort((a,b)=>{
    const ac=missing(a.course)?99:Number(a.course),bc=missing(b.course)?99:Number(b.course);
    return ac-bc||Number(a.lane)-Number(b.lane);
  });
  const valid=xs.some(r=>!missing(r.start_timing)||!missing(r.course));
  if(!xs.length){
    $('#start-exhibition').innerHTML='<div class="empty-card"><strong>スタート展示データ待ち</strong><p>進入・スタート展示STが生成されると6艇を並べて表示します。</p></div>';
  }else{
    const rows=xs.map(r=>{
      const st=missing(r.start_timing)?null:Number(r.start_timing);
      const flying=st!==null&&Number.isFinite(st)&&st<0;
      const lane=Math.max(1,Math.min(6,Number(r.lane)||1));
      return `<div class="start-row">
        <div class="start-course"><b>${value(r.course)}</b><span>コース</span></div>
        <div class="start-track">
          <div class="start-line" aria-hidden="true"></div>
          <div class="start-boat-shell template-boat lane-boat-${lane}${flying?' flying':''}" style="--boat-x:${startPosition(st)}%" aria-label="${lane}号艇"><img src="/assets/start-boat-${lane}-lane.png?v=20260918-lanecolor1" alt="${lane}号艇" draggable="false"><span class="boat-number-overlay">${lane}</span></div>
        </div>
        <div class="start-st ${flying?'flying':''}">${stText(st)}</div>
      </div>`;
    }).join('');
    $('#start-exhibition').innerHTML=`<div class="start-board-head"><span>進入</span><span>スタート展示</span><span>ST</span></div>
      <div class="start-scale"><span class="scale-label">遅い</span><b>START</b><span class="scale-label right">F</span></div>${rows}`;
  }
  $('#start-status').textContent=valid?'取得済み':'直前待ち';
  const note=[];
  if(ex.updated_at)note.push(`更新 ${updated(ex.updated_at)}`);
  note.push('Fはスタートラインを越えた位置と赤文字で表示します。スタート展示と本番の進入・STは異なる場合があります。');
  $('#start-note').textContent=note.join('　');
}

function originalMetricRows(original,ex){
  const boats=original?.boats||[];
  const labels=Array.isArray(original?.labels)?original.labels:[];
  const rows=[];
  if((ex?.boats||[]).some(x=>!missing(x.exhibition_time))){
    rows.push({label:'展示タイム',values:[1,2,3,4,5,6].map(n=>(ex.boats||[]).find(x=>Number(x.lane)===n)?.exhibition_time),digits:2});
  }
  labels.forEach((label,idx)=>{
    rows.push({label:String(label||`計測${idx+1}`),values:[1,2,3,4,5,6].map(n=>{
      const b=boats.find(x=>Number(x.lane)===n);
      return b?.values?.[idx]?.value ?? null;
    }),digits:2});
  });
  if((ex?.boats||[]).some(x=>!missing(x.tilt))){
    rows.push({label:'チルト',values:[1,2,3,4,5,6].map(n=>(ex.boats||[]).find(x=>Number(x.lane)===n)?.tilt),digits:1});
  }
  return rows;
}

function renderOriginalExhibition(d){
  const ex=d?.exhibition_detail||{},original=d?.original_exhibition||null;
  if(CODE===3||(original?.available===false&&original?.reason==='not_provided_at_edogawa')){
    $('#original-status').textContent='非提供';
    $('#original-exhibition').innerHTML='<div class="empty-card"><strong>江戸川はオリジナル展示非提供</strong><p>正式データの仕様に合わせ、推測値は表示しません。</p></div>';
    $('#original-note').textContent=ex.updated_at?`展示情報更新 ${updated(ex.updated_at)}`:'';
    return;
  }
  const rows=originalMetricRows(original,ex);
  const hasOriginal=Array.isArray(original?.labels)&&original.labels.length>0&&Array.isArray(original?.boats)&&original.boats.length>0;
  $('#original-status').textContent=hasOriginal?'取得済み':'直前待ち';
  if(!rows.length){
    $('#original-exhibition').innerHTML='<div class="empty-card"><strong>オリジナル展示データ待ち</strong><p>正式データが生成されると6艇を縦に並べて比較できます。</p></div>';
    $('#original-note').textContent='';
    return;
  }
  const header=rows.map(r=>`<div class="original-metric-head">${esc(r.label)}</div>`).join('');
  const ranks=rows.map(r=>{
    if(String(r.label||'').includes('チルト'))return new Map();
    const xs=r.values.map((v,i)=>({lane:i+1,value:Number(v)})).filter(x=>Number.isFinite(x.value));
    xs.sort((a,b)=>a.value-b.value||a.lane-b.lane);
    const m=new Map();
    if(xs[0])m.set(xs[0].lane,1);
    if(xs[1])m.set(xs[1].lane,2);
    return m;
  });
  const body=[1,2,3,4,5,6].map(lane=>{
    const values=rows.map((r,idx)=>{
      const rank=ranks[idx].get(lane);
      return `<div class="original-value${rank===1?' original-rank-1':rank===2?' original-rank-2':''}">${fixed(r.values[lane-1],r.digits)}</div>`;
    }).join('');
    return `<div class="original-boat-label lane-hull-${lane}"><b>${lane}</b><span>号艇</span></div>${values}`;
  }).join('');
  $('#original-exhibition').innerHTML=`<div class="original-table original-table-transposed" style="--metric-count:${rows.length}">
    <div class="original-corner">艇</div>${header}${body}
  </div>`;
  const notes=[];
  if(original?.updated_at)notes.push(`オリジナル展示更新 ${updated(original.updated_at)}`);
  if(ex.updated_at)notes.push(`展示更新 ${updated(ex.updated_at)}`);
  $('#original-note').textContent=notes.join('　');
}

function renderExhibition(d){renderStartExhibition(d);renderOriginalExhibition(d)}

function tideLevelText(v){
  if(!v||typeof v!=='object'||missing(v.value_cm))return'—';
  return `${Number(v.value_cm).toFixed(1).replace(/\\.0$/,'')}cm${v.at?`（${esc(v.at)}）`:''}`;
}
function tideEventText(v){
  if(!v||typeof v!=='object'||!v.time)return'—';
  return `${esc(v.time)}${missing(v.level_cm)?'':` / ${Number(v.level_cm).toFixed(0)}cm`}`;
}
function tideStateText(v){
  return ({rising:'上げ潮',falling:'下げ潮',slack:'潮止まり付近',near_high:'満潮付近',near_low:'干潮付近'})[String(v||'')]||'—';
}
function renderSurface(d){
  const s=d?.surface||d?.weather||{},t=d?.tide||{};
  const tideApplicable=t?.applicable!==false;
  const weatherItems=[
    ['天気',s.weather??s.condition,''],
    ['気温',s.air_temperature??s.temperature,'℃'],
    ['水温',s.water_temperature,'℃'],
    ['風向',s.wind_direction,''],
    ['風速',s.wind_speed,'m/s'],
    ['波高',s.wave_height,'cm']
  ];
  const tideItems=[
    ['潮位',tideApplicable?tideLevelText(t.tide_level):null,''],
    ['潮状態',tideApplicable?tideStateText(t.current_state):null,''],
    ['満潮',tideApplicable?tideEventText(t.high_tide):null,''],
    ['干潮',tideApplicable?tideEventText(t.low_tide):null,'']
  ];
  const valid=v=>!missing(v)&&v!=='—'&&v!=='対象外';
  const cards=[];
  weatherItems.forEach(([label,v,suffix])=>{if(valid(v))cards.push(`<div class="surface-card weather-card"><span>${label}</span><strong>${value(v,suffix)}</strong></div>`)});
  if(tideApplicable)tideItems.forEach(([label,v,suffix])=>{if(valid(v))cards.push(`<div class="surface-card tide-card"><span>${label}</span><strong>${value(v,suffix)}</strong></div>`)});
  const missingWeather=weatherItems.filter(([,v])=>!valid(v)).map(([label])=>label);
  const statusBits=[];
  if(missingWeather.length)statusBits.push(`<span class="surface-status-badge">一部未連携</span><small>${esc(missingWeather.join('・'))}</small>`);
  if(!tideApplicable)statusBits.push('<span class="surface-status-badge neutral">潮汐対象外</span><small>淡水水面</small>');
  const observed=String(s.observed_at||'').replace(/^(\d{2})(\d{2})$/,'$1:$2');
  if(observed)statusBits.push(`<small class="surface-observed">気象観測 ${esc(observed)}</small>`);
  $('#surface-grid').innerHTML=cards.length
    ?cards.join('')+(statusBits.length?`<div class="surface-status-line">${statusBits.join('')}</div>`:'')
    :'<div class="surface-empty-premium"><span>DATA STATUS</span><strong>正式データ待ち</strong><p>取得できた正式値だけを表示します。</p></div>';

  const status=d?.source_status?.tide;
  const station=t?.reference_station?.name;
  if(status==='available'){
    $('#tide-note').textContent=`潮情報：気象庁の天文潮位表${station?`（参照地点：${station}）`:''}。競走水面の実測潮位ではなく、最寄り掲載地点の予測値です。`;
  }else if(status==='not_applicable_freshwater'){
    $('#tide-note').textContent='この場は淡水水面のため、潮位・満潮・干潮は対象外です。';
  }else{
    $('#tide-note').textContent='潮情報は現在取得できません。推測値は表示しません。';
  }
}

function evalValue(v){if(missing(v))return'—';if(typeof v==='number')return Number.isInteger(v)?String(v):Number(v).toFixed(2);return esc(v)}

function renderOfficialPrediction(v){
  const box=$('#pro-official');
  if(!box)return;
  const r=(v?.races||[]).find(x=>Number(x.race_no)===RACE);
  if(!r){
    box.innerHTML='<div class="pro-official-empty"><strong>正式判断を確認中</strong><p>ONE BOATの正式記録が取得でき次第、結論を表示します。</p></div>';
    const focus=$('#decision-focus');if(focus)focus.hidden=true;
    return;
  }
  const rec=r.record||{},p=rec.prediction||{},bets=officialBets(rec);
  const stake=Number(rec.stake_total_yen??p.stake_total_yen??0);
  const reason=normalizeLegacyCutoffText(p.reason||p.skip_reason||rec.reason||r.note||'').trim();
  const theory=textValue(p.selected_theory||p.current_theory||p.strategy||rec.theory||'');
  const support=materialList(p.support_materials||rec.support_materials);
  const opposing=materialList(p.opposing_materials||rec.opposing_materials);
  const plainReason=plainDecisionReason(reason);
  const plainSupport=support.map(plainSupportMaterial);
  const plainOpposing=opposing.map(plainSupportMaterial);
  renderDecisionFocus({reason,theory,support,opposing});
  const label=stateLabel(r.state),isOfficial=publicRecord(rec),comboText=r.state==='PRIVATE'?'非公開':isOfficial?`${bets.length}点`:'なし';
  let html=`<div class="pro-official-head"><div><small>ONE BOAT 正式判断</small><h2>このレースの結論</h2></div><span>${esc(label)}</span></div>
    <div class="pro-official-grid pro-official-grid-clear">
      <div><span>結論</span><strong>${esc(label)}</strong></div>
      <div><span>3連単の組み合わせ</span><strong>${esc(comboText)}</strong></div>
      <div><span>締切</span><strong>${esc(String(r.deadline||'—').match(/\d{1,2}:\d{2}/)?.[0]||'—')}</strong></div>
    </div>`;

  if(isOfficial){
    html+=`<details class="pro-picks-accordion"><summary><span><small>3連単の組み合わせ</small><strong>公式買い目を見る</strong></span><b>${bets.length}点</b></summary><div class="pro-picks-body">${bets.length?`<div class="pro-bets pro-bets-picks">${bets.map(x=>`<div class="pro-pick"><strong>${esc(officialTicket(x))}</strong><small class="pro-final-odds">最終オッズ予想 ${officialFinalOddsRange(x,r.deadline)}</small><span class="pick-role">${officialRole(x)}</span></div>`).join('')}</div><p class="pro-odds-note">最終オッズ予想は参考レンジです。確定オッズや正式実績を後から変更するものではありません。</p>`:'<p>組み合わせを取得中です。</p>'}${bets.length?`<details class="pro-allocation"><summary><span>資金配分を見る</span><b>合計 ${yen(stake)}</b></summary><div class="pro-allocation-body"><div class="pro-bets">${bets.map(x=>`<div><strong>${esc(officialTicket(x))}</strong><span>${yen(officialStake(x))}</span></div>`).join('')}</div><p>公式成績はレース前に確定した資金配分を基準に集計します。</p></div></details>`:''}</div></details>`;
  }

  if(reason||theory||support.length||opposing.length){
    const technical=[reason?`判断記録：${reason}`:'',theory?`内部判定ルール：${theory}`:''].filter(Boolean);
    html+=`<details class="decision-details"><summary><span><small>WHY THIS DECISION</small><strong>この結論の理由を見る</strong></span><b>＋</b></summary><div class="decision-details-body">${plainReason?`<div class="decision-trace"><h3>判断の決め手</h3><p>${esc(plainReason)}</p></div>`:''}${plainSupport.length?`<div class="decision-material support"><span>主な判断材料</span><ul>${plainSupport.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:''}${plainOpposing.length?`<div class="decision-material caution"><span>注意している材料</span><ul>${plainOpposing.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:''}${technical.length?`<details class="technical-record"><summary>詳しい判定記録を見る</summary><div>${technical.map(x=>`<p>${esc(x)}</p>`).join('')}</div></details>`:''}</div></details>`;
  }

  if(r.state==='PRIVATE')html+=`<div class="pro-official-section"><b>公開状況</b><p>ONE BOATでは正式判断済みですが、本日の無料公開対象外です。有料版では正式ENTER全件を確認できます。</p></div>`;
  box.innerHTML=html;
  box.querySelectorAll('.decision-details').forEach(d=>d.addEventListener('toggle',()=>{const b=d.querySelector('summary>b');if(b)b.textContent=d.open?'−':'＋'}));
  if(r.deadline)$('#race-deadline').textContent=String(r.deadline).match(/\d{1,2}:\d{2}/)?.[0]||'—';
}

function renderMotorDetails(d){
  const el=$('#motor-pro-panel');
  if(!el)return;
  const xs=(d?.racers||[]).filter(r=>r&&r.lane);
  const officialMotor=d?.official_evaluation?.motor;
  const has=xs.some(r=>r.motor&&(!missing(r.motor.number)||!missing(r.motor.top2_rate)||!missing(r.motor.top3_rate)||!missing(r.motor.win_rate)));
  if(!has&&missing(officialMotor)){
    el.innerHTML='<div class="empty-card"><strong>モーター正式値は現在未連携です</strong><p>推測値は表示しません。正式データが取得できた場合のみ表示します。</p></div>';
    return;
  }
  let html='';
  if(!missing(officialMotor))html+=`<div class="motor-official-score"><span>ONE BOAT正式モーター評価</span><strong>${evalValue(officialMotor)}</strong></div>`;
  if(has){
    html+=`<div class="motor-table-head"><span>艇</span><span>モーター</span><span>2連率</span><span>3連率</span></div>`;
    html+=xs.map(r=>{
      const m=r.motor||{};
      const win=!missing(m.win_rate)?Number(m.win_rate).toFixed(2):'—';
      const lap=!missing(m.avg_lap_sec)?`${Number(m.avg_lap_sec).toFixed(2)}秒`:'—';
      const rank=!missing(m.top3_rank)?`${m.top3_rank}位`:'—';
      const finals=!missing(m.final_appearances)?String(m.final_appearances):'—';
      const wins=!missing(m.champion_count)?String(m.champion_count):'—';
      return `<div class="motor-row">
        <div class="motor-lane">${laneBadge(r.lane)}</div>
        <div class="motor-id"><small>MOTOR</small><strong>${missing(m.number)?'—':`#${m.number}`}</strong></div>
        <div class="motor-rate"><span>2連率</span><strong>${pct(m.top2_rate)}</strong></div>
        <div class="motor-rate"><span>3連率</span><strong>${pct(m.top3_rate)}</strong></div>
        <div class="motor-meta" aria-label="モーター詳細">
          <span><small>勝率</small><b>${win}</b></span>
          <span><small>ラップ</small><b>${lap}</b></span>
          <span><small>3連順位</small><b>${rank}</b></span>
          <span><small>優出</small><b>${finals}</b></span>
          <span><small>優勝</small><b>${wins}</b></span>
        </div>
      </div>`;
    }).join('');
  }
  el.innerHTML=html;
}

function renderEngine(e){
  const section=$('#official-evaluation-section');
  const items=[['展示',e?.exhibition],['ST',e?.st],['モーター',e?.motor],['コース',e?.course],['総合',e?.total]];
  const has=items.some(([,v])=>!missing(v));
  if(section)section.hidden=!has;
  if(!has){
    $('#engine-summary').innerHTML='';
    $('#engine-rankings').innerHTML='';
    return;
  }
  $('#engine-summary').innerHTML=items.map(([label,v],i)=>`<div class="engine-metric ${i===4?'total':''}"><span>${label}</span><strong>${evalValue(v)}</strong></div>`).join('');
  $('#engine-rankings').innerHTML=e?.updated_at?`<div class="data-note">更新 ${updated(e.updated_at)}</div>`:'';
}

function comboFirst(s){const m=String(s||'').match(/[1-6]/);return m?Number(m[0]):null}
function renderOddsGroup(){
  const counts={};for(let n=1;n<=6;n++)counts[n]=ODDS_ITEMS.filter(x=>comboFirst(x.combination)===n).length;
  $('#odds-filter').innerHTML=[1,2,3,4,5,6].map(n=>`<button type="button" class="odds-filter-btn ${ODDS_FIRST===n?'active':''}" data-first="${n}"><b>${n}</b><span>1着</span><em>${counts[n]||0}</em></button>`).join('');
  document.querySelectorAll('.odds-filter-btn').forEach(b=>b.addEventListener('click',()=>{ODDS_FIRST=Number(b.dataset.first);renderOddsGroup()}));
  const xs=ODDS_ITEMS.filter(x=>comboFirst(x.combination)===ODDS_FIRST).sort((a,b)=>String(a.combination||'').localeCompare(String(b.combination||''),'ja',{numeric:true}));
  $('#odds-content').className='odds-grid';
  $('#odds-content').innerHTML=xs.map(x=>`<div class="odds-item"><b>${esc(x.combination||'—')}</b><span>${fixed(x.odds,1,'倍')}</span></div>`).join('')||'<div class="empty-card"><strong>この1着艇のオッズは未取得です</strong></div>';
}
function renderOdds(o){
  ODDS_ITEMS=Array.isArray(o?.items)?o.items:[];
  $('#odds-updated').textContent=`更新 ${updated(o?.updated_at)}${ODDS_ITEMS.length?` ・ ${ODDS_ITEMS.length}通り`:''}`;
  if(!ODDS_ITEMS.length){
    $('#odds-filter').innerHTML='';
    $('#odds-content').className='empty-card';
    $('#odds-content').innerHTML='<strong>3連単オッズはデータ未生成です</strong><p>正式APIが返した値だけを表示します。</p>';
    return;
  }
  const firsts=[1,2,3,4,5,6].filter(n=>ODDS_ITEMS.some(x=>comboFirst(x.combination)===n));
  ODDS_FIRST=firsts.includes(1)?1:(firsts[0]||1);
  renderOddsGroup();
}

function showPaywallMessage(text){
  const m=$('#paywall-message');if(!m)return;m.hidden=false;m.textContent=text;
}
function setupPaywallButtons(){}
function renderPrivatePaywall(d,pub){
  DATA=null;
  const focus=$('#decision-focus');if(focus)focus.hidden=true;
  document.body.setAttribute('aria-busy','false');
  document.body.classList.add('analysis-locked');
  const race=(pub?.races||[]).find(x=>Number(x.race_no)===RACE);
  $('#race-title').textContent=`${venueName()} ${RACE}R`;
  $('#race-subtitle').textContent='予想完了 / 会員向け詳細';
  $('#race-date').textContent=dateJp(pub?.date||DATE);
  $('#race-deadline').textContent=String(race?.deadline||'—').match(/\d{1,2}:\d{2}/)?.[0]||'—';
  $('#race-updated').textContent='—';
  const st=$('#race-state');st.textContent='会員向け';st.className='state-badge locked';
  renderOfficialPrediction(pub);
  const p=$('#analysis-paywall');if(p)p.hidden=false;
  const msg=$('#page-message');if(msg)msg.hidden=true;
}
function setupTabs(){
  document.querySelectorAll('.analysis-tab').forEach(b=>b.addEventListener('click',()=>{
    document.querySelectorAll('.analysis-tab').forEach(x=>x.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    document.querySelector(`[data-panel="${b.dataset.tab}"]`)?.classList.add('active');
  }));
}
function setupDisplayTabs(){
  document.querySelectorAll('.display-switch-btn').forEach(b=>b.addEventListener('click',()=>{
    document.querySelectorAll('.display-switch-btn').forEach(x=>x.classList.remove('active'));
    document.querySelectorAll('.display-panel').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    document.querySelector(`[data-display-panel="${b.dataset.display}"]`)?.classList.add('active');
  }));
}

function render(d){
  DATA=d;
  const race=d.race||{};
  $('#race-title').textContent=`${venueName()} ${race.race_no||RACE}R`;
  $('#race-subtitle').textContent='正式判断を先に確認。必要な補助データだけ深掘り';
  $('#race-date').textContent=dateJp(race.date||DATE);
  $('#race-deadline').textContent='—';
  $('#race-updated').textContent=updated(d.trifecta_odds?.updated_at||d.exhibition_detail?.updated_at||d.original_exhibition?.updated_at);
  const st=$('#race-state');st.textContent='分析データ';st.className='state-badge live';
  renderRacers(d);renderEngine(d.official_evaluation);renderMotorDetails(d);renderExhibition(d);renderSurface(d);renderOdds(d.trifecta_odds);
  document.body.setAttribute('aria-busy','false');
}

async function load(){
  if(!(CODE>=1&&CODE<=24&&RACE>=1&&RACE<=12)){
    const m=$('#page-message');m.hidden=false;m.textContent='場またはレース番号が正しくありません。本日の予想からレースを選び直してください。';return;
  }
  document.body.setAttribute('aria-busy','true');
  const normalized=`/analysis.html?date=${encodeURIComponent(DATE)}&venue=${CODE}&race=${RACE}`;
  if(location.pathname+location.search!==normalized)history.replaceState(null,'',normalized);
  try{
    const u=new URL(API,location.origin);u.searchParams.set('date',DATE);u.searchParams.set('venue',String(CODE));u.searchParams.set('race',String(RACE));
    const publicPromise=DATE===jstDate()
      ?fetch(`/api/public/venue?code=${encodeURIComponent(String(CODE).padStart(2,'0'))}`,{cache:'no-store'}).then(x=>x.ok?x.json():null).catch(()=>null)
      :Promise.resolve(null);
    const r=await fetch(u,{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
    let d=null;try{d=await r.json()}catch{}
    if(r.status===402&&d?.error==='payment_required'){
      const pub=await publicPromise;
      renderPrivatePaywall(d,pub);
      return;
    }
    if(r.status===503&&d?.error==='entitlement_unavailable'){
      const pub=await publicPromise;
      renderPrivatePaywall(d,pub);
      showPaywallMessage(d.message||'会員状態を確認できません。');
      return;
    }
    if(!r.ok||!d?.ok)throw Error(d?.error||`api_${r.status}`);
    render(d);
    const memberPrediction=await fetchMemberPrediction();
    const pub=memberPrediction||await publicPromise;
    renderOfficialPrediction(pub);
  }catch(e){
    document.body.setAttribute('aria-busy','false');
    const m=$('#page-message');m.hidden=false;m.textContent='レース分析データを取得できませんでした。公式予想画面には影響ありません。少し時間をおいて再読み込みしてください。';
    $('#race-title').textContent=`${venueName()} ${RACE}R`;
    $('#race-subtitle').textContent='分析データ取得待ち';
    $('#race-date').textContent=dateJp(DATE);
    $('#race-deadline').textContent='—';
    $('#race-updated').textContent='—';
    const st=$('#race-state');st.textContent='取得待ち';st.className='state-badge pending';
    }
}

async function refreshLiveOriginal(){
  if(document.body.classList.contains('analysis-locked'))return true;
  if(DATE!==jstDate()||CODE===3||document.hidden)return false;
  const current=DATA?.original_exhibition;
  if(current?.available===true&&Array.isArray(current?.boats)&&current.boats.length===6)return true;
  try{
    const u=new URL(LIVE_ORIGINAL_API,location.origin);
    u.searchParams.set('date',DATE);
    u.searchParams.set('venue',String(CODE));
    u.searchParams.set('race',String(RACE));
    u.searchParams.set('_',String(Date.now()));
    const r=await fetch(u,{cache:'no-store',headers:{accept:'application/json'}});
    if(!r.ok)return false;
    const d=await r.json();
    if(d?.ok===true&&d?.available===true){
      if(!DATA)DATA={};
      DATA.original_exhibition=d;
      renderOriginalExhibition(DATA);
      return true;
    }
  }catch{}
  return false;
}
let ORIGINAL_TIMER=null;
function scheduleLiveOriginalRefresh(){
  if(ORIGINAL_TIMER){clearTimeout(ORIGINAL_TIMER);ORIGINAL_TIMER=null}
  if(document.body.classList.contains('analysis-locked')||DATE!==jstDate()||CODE===3||document.hidden)return;
  const current=DATA?.original_exhibition;
  if(current?.available===true&&Array.isArray(current?.boats)&&current.boats.length===6)return;
  ORIGINAL_TIMER=setTimeout(async()=>{
    const done=await refreshLiveOriginal();
    if(!done)scheduleLiveOriginalRefresh();
  },5000);
}

async function refreshOfficialPrediction(){
  if(document.body.classList.contains('analysis-locked')||document.hidden)return;
  const protectedView=await fetchMemberPrediction();
  if(protectedView){renderOfficialPrediction(protectedView);return}
  if(DATE!==jstDate())return;
  try{
    const r=await fetch(`/api/public/venue?code=${encodeURIComponent(String(CODE).padStart(2,'0'))}&_=${Date.now()}`,{cache:'no-store'});
    if(!r.ok)return;
    const pub=await r.json();
    renderOfficialPrediction(pub);
  }catch{}
}
let OFFICIAL_TIMER=null;
function scheduleOfficialRefresh(){
  if(OFFICIAL_TIMER)clearTimeout(OFFICIAL_TIMER);
  if(document.body.classList.contains('analysis-locked')||document.hidden)return;
  OFFICIAL_TIMER=setTimeout(async()=>{await refreshOfficialPrediction();scheduleOfficialRefresh()},10000);
}
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){
    if(OFFICIAL_TIMER)clearTimeout(OFFICIAL_TIMER);OFFICIAL_TIMER=null;
    if(ORIGINAL_TIMER)clearTimeout(ORIGINAL_TIMER);ORIGINAL_TIMER=null;
    return;
  }
  refreshOfficialPrediction().finally(scheduleOfficialRefresh);
  refreshLiveOriginal().then(done=>{if(!done)scheduleLiveOriginalRefresh()});
});

setupViewMode();
setupPaywallButtons();
setupTabs();
setupDisplayTabs();
load().finally(()=>{scheduleOfficialRefresh();scheduleLiveOriginalRefresh()});