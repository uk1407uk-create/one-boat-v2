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

function originalText(original,lane){
  if(original?.available===false)return original?.reason==='not_provided_at_edogawa'?'江戸川：非提供':'—';
  const boat=(original?.boats||[]).find(x=>Number(x.lane)===Number(lane));
  if(!boat?.values?.length)return'—';
  const xs=boat.values.filter(x=>!missing(x?.value));
  return xs.length?xs.map(x=>`${esc(x.label||'計測')} ${value(x.value)}`).join(' / '):'—';
}

function renderExhibition(d){
  const ex=d?.exhibition_detail||{},original=d?.original_exhibition||null,xs=ex.boats||[];
  $('#exhibition-list').innerHTML=xs.map(r=>`<article class="ex-card">
    <div class="ex-main">
      ${laneBadge(r.lane)}
      <div><span>進入</span><strong>${value(r.course)}</strong></div>
      <div><span>展示ST</span><strong>${stText(r.start_timing)}</strong></div>
      <div><span>展示</span><strong>${fixed(r.exhibition_time,2)}</strong></div>
    </div>
    <div class="ex-detail-grid">
      <div class="wide"><span>オリジナル展示</span><strong>${originalText(original,r.lane)}</strong></div>
      <div><span>一周</span><strong>${fixed(r.lap_time,2)}</strong></div>
      <div><span>半周</span><strong>${fixed(r.half_lap_time,2)}</strong></div>
      <div><span>まわり足</span><strong>${fixed(r.turning,2)}</strong></div>
      <div><span>直線</span><strong>${fixed(r.straight,2)}</strong></div>
      <div><span>チルト</span><strong>${fixed(r.tilt,1)}</strong></div>
    </div>
  </article>`).join('')||'<div class="empty-card"><strong>展示データ待ち</strong><p>正式データが生成されるとここに6艇分表示されます。</p></div>';

  const notes=[];
  if(CODE===3||original?.reason==='not_provided_at_edogawa')notes.push('江戸川はオリジナル展示の提供対象外です。');
  if(!xs.length)notes.push('展示データは現在未生成です。');
  if(ex.updated_at)notes.push(`展示更新 ${updated(ex.updated_at)}`);
  $('#exhibition-note').textContent=notes.join(' ');
  $('#exhibition-note').hidden=!notes.length;
  const live=xs.some(r=>!missing(r.exhibition_time)||!missing(r.start_timing)||!missing(r.course)||!missing(r.lap_time)||!missing(r.half_lap_time)||!missing(r.turning)||!missing(r.straight));
  $('#exhibition-status').textContent=live?'取得済み':'直前待ち';
}

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
$('#clear-my').addEventListener('click',()=>{MY={first:null,second:null,third:null};try{localStorage.removeItem(myKey())}catch{}renderMy()});
load();