const $=s=>document.querySelector(s);
const API='https://imhzjlxbnovjvqlyawmg.supabase.co/functions/v1/one-boat-race-analysis-api';
const VENUES=['桐生','戸田','江戸川','平和島','多摩川','浜名湖','蒲郡','常滑','津','三国','びわこ','住之江','尼崎','鳴門','丸亀','児島','宮島','徳山','下関','若松','芦屋','福岡','唐津','大村'];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const params=new URLSearchParams(location.search);
const CODE=Number(params.get('venue')||params.get('code'));
const RACE=Number(params.get('race'));
const jstDate=()=>new Date(Date.now()+32400000).toISOString().slice(0,10);
const DATE=/^\d{4}-\d{2}-\d{2}$/.test(params.get('date')||'')?params.get('date'):jstDate();
let DATA=null;
let MY={first:null,second:null,third:null};
let ODDS_ITEMS=[];
let ODDS_FIRST=1;

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

function boatSvg(lane,color){
  return `<svg viewBox="0 0 126 54" aria-label="${lane}号艇" role="img">
    <path d="M5 39c11-1 18-3 25-7" fill="none" stroke="rgba(255,255,255,.92)" stroke-width="3" stroke-linecap="round"/>
    <path d="M1 44c15-1 25-4 34-9" fill="none" stroke="rgba(255,255,255,.58)" stroke-width="2" stroke-linecap="round"/>
    <path d="M19 31h91c5 0 9-2 13-5-3 10-13 17-28 19H43c-11 0-19-4-24-14Z" fill="#f7c63d" stroke="#9a7a13" stroke-width="1"/>
    <path d="M31 29c7-7 15-12 29-12h29c7 0 13 4 17 12H31Z" fill="#fbfdff" stroke="#8d9ca8" stroke-width="1.2"/>
    <path d="M58 17c4-8 11-12 20-12 8 0 15 4 18 12H58Z" fill="${color}" stroke="rgba(0,0,0,.25)" stroke-width="1"/>
    <path d="M70 10c3-5 7-7 12-7 5 0 9 2 11 7" fill="none" stroke="rgba(255,255,255,.42)" stroke-width="2"/>
    <path d="M48 18h30l-7 11H39Z" fill="rgba(197,222,236,.55)"/>
    <path d="M96 14v15" stroke="#53616b" stroke-width="1.5"/>
    <path d="M97 15l14 5-14 5Z" fill="${color}" stroke="rgba(0,0,0,.2)"/>
    <circle cx="28" cy="36" r="9" fill="rgba(255,255,255,.97)"/>
    <text x="28" y="39" text-anchor="middle" font-size="9" font-weight="900" fill="#07121d">${lane}</text>
  </svg>`;
}

function renderStartExhibition(d){
  const ex=d?.exhibition_detail||{};
  const colors=['#f7f7f7','#202329','#e64b50','#347fd8','#35b66a','#efd731'];
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
          <div class="start-boat-shell${flying?' flying':''}" style="--boat-x:${startPosition(st)}%" aria-label="${lane}号艅">${boatSvg(lane,colors[lane-1])}</div>
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
  const body=[1,2,3,4,5,6].map(lane=>{
    const values=rows.map(r=>`<div class="original-value">${fixed(r.values[lane-1],r.digits)}</div>`).join('');
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

function renderSurface(d){
  const s=d?.surface||d?.weather||{},t=d?.tide||{};
  const items=[
    ['天気',s.weather??s.condition,''],
    ['気温',s.air_temperature??s.temperature,'℃'],
    ['水温',s.water_temperature,'℃'],
    ['風向',s.wind_direction,''],
    ['風速',s.wind_speed,'m/s'],
    ['波高',s.wave_height,'cm'],
    ['潮位',t.tide_level,''],
    ['潮状態',t.current_state,''],
    ['満潮',t.high_tide,''],
    ['干潮',t.low_tide,'']
  ];
  const has=items.some(([,v])=>!missing(v));
  $('#surface-grid').innerHTML=has
    ?items.map(([label,v,suffix])=>`<div class="surface-card"><span>${label}</span><strong>${value(v,suffix)}</strong></div>`).join('')
    :'<div class="empty-card surface-empty"><strong>水面・気象データは現在未連携です</strong><p>専用APIに正式値が入るまで「—」を並べず、ここでまとめてお知らせします。</p></div>';
  const sui=d?.source_status?.sui;
  $('#tide-note').textContent=`潮位・満潮・干潮は正式ソース未接続です。${sui==='available'?' 気象取得元はありますが、専用APIの表示項目にはまだ値がありません。':''}`;
}

function evalValue(v){if(missing(v))return'—';if(typeof v==='number')return Number.isInteger(v)?String(v):Number(v).toFixed(2);return esc(v)}
function renderEngine(e){
  const items=[['展示',e?.exhibition],['ST',e?.st],['モーター',e?.motor],['コース',e?.course],['総合',e?.total]];
  const has=items.some(([,v])=>!missing(v));
  $('#engine-summary').innerHTML=has
    ?items.map(([label,v],i)=>`<div class="engine-metric ${i===4?'total':''}"><span>${label}</span><strong>${evalValue(v)}</strong></div>`).join('')
    :'<div class="eval-empty"><span>正式評価</span><strong>現在は未連携</strong><small>score_breakdown が空のため、④側では作りません。</small></div>';
  $('#engine-rankings').innerHTML=has&&e?.updated_at?`<div class="data-note">更新 ${updated(e.updated_at)}</div>`:'';
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

function myKey(){return DATA?`oneboat_my_${DATA.race.date}_${DATA.race.venue_code}_${DATA.race.race_no}`:''}
function loadMy(){try{const x=JSON.parse(localStorage.getItem(myKey())||'{}');MY={first:Number(x.first)||null,second:Number(x.second)||null,third:Number(x.third)||null}}catch{MY={first:null,second:null,third:null}}}
function saveMy(){try{localStorage.setItem(myKey(),JSON.stringify(MY))}catch{}renderMy()}
function renderMy(){
  document.querySelectorAll('.lane-buttons').forEach(box=>{
    const place=box.dataset.place;
    box.innerHTML=[1,2,3,4,5,6].map(n=>{
      const selected=MY[place]===n,used=Object.entries(MY).some(([k,v])=>k!==place&&v===n);
      return `<button class="lane-choice lane-choice-${n}${selected?' selected':''}" type="button" data-place="${place}" data-lane="${n}" ${used?'disabled':''}>${n}</button>`;
    }).join('');
  });
  document.querySelectorAll('.lane-choice').forEach(b=>b.addEventListener('click',()=>{MY[b.dataset.place]=Number(b.dataset.lane);saveMy()}));
  $('#my-ticket').textContent=`${MY.first||'—'} - ${MY.second||'—'} - ${MY.third||'—'}`;
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
  $('#race-subtitle').textContent='選手・展示・オッズを自分で比較';
  $('#race-date').textContent=dateJp(race.date||DATE);
  $('#race-deadline').textContent='—';
  $('#race-updated').textContent=updated(d.trifecta_odds?.updated_at||d.exhibition_detail?.updated_at||d.original_exhibition?.updated_at);
  const st=$('#race-state');st.textContent='分析データ';st.className='state-badge live';
  $('#official-link').href=`/today.html?venue=${String(CODE).padStart(2,'0')}&race=${RACE}`;
  renderRacers(d);renderEngine(d.official_evaluation);renderExhibition(d);renderSurface(d);renderOdds(d.trifecta_odds);loadMy();renderMy();
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
    const u=new URL(API);u.searchParams.set('date',DATE);u.searchParams.set('venue',String(CODE));u.searchParams.set('race',String(RACE));
    const r=await fetch(u,{cache:'no-store',headers:{accept:'application/json'}});
    let d=null;try{d=await r.json()}catch{}
    if(!r.ok||!d?.ok)throw Error(d?.error||`api_${r.status}`);
    render(d);
  }catch(e){
    document.body.setAttribute('aria-busy','false');
    const m=$('#page-message');m.hidden=false;m.textContent='レース分析データを取得できませんでした。公式予想画面には影響ありません。少し時間をおいて再読み込みしてください。';
    $('#race-title').textContent=`${venueName()} ${RACE}R`;
    $('#race-subtitle').textContent='分析データ取得待ち';
    $('#race-date').textContent=dateJp(DATE);
    $('#race-deadline').textContent='—';
    $('#race-updated').textContent='—';
    const st=$('#race-state');st.textContent='取得待ち';st.className='state-badge pending';
    $('#official-link').href=`/today.html?venue=${String(CODE).padStart(2,'0')}&race=${RACE}`;
  }
}

setupTabs();
setupDisplayTabs();
$('#clear-my').addEventListener('click',()=>{MY={first:null,second:null,third:null};try{localStorage.removeItem(myKey())}catch{}renderMy()});
load();