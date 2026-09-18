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
const NOTE_URL='';
const FREE_STATS_URL='/api/public/stats';
const FREE_VISIBILITY_URL='https://imhzjlxbnovjvqlyawmg.supabase.co/functions/v1/one-boat-public-visibility';
const TRAFFIC_LITE_URL='https://imhzjlxbnovjvqlyawmg.supabase.co/functions/v1/one-boat-traffic-lite';
const VENUES=['桐生','戸田','江戸川','平和島','多摩川','浜名湖','蒲郡','常滑','津','三国','びわこ','住之江','尼崎','鳴門','丸亀','児島','宮島','徳山','下関','若松','芦屋','福岡','唐津','大村'];
const $=s=>document.querySelector(s);
const yen=n=>`${Math.round(Number(n||0)).toLocaleString('ja-JP')}円`;
const pct=n=>Number.isFinite(Number(n))?`${Number(n).toFixed(1)}%`:'--';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let STATS=null,STATS_FETCHED_AT=0,CURRENT_VENUE=null,AUTO_OPENED=false,LOAD_TIMER=null,SITE_ONLY_KEYS=new Set();
function trafficAttribution(){
  try{
    const q=new URLSearchParams(location.search);
    let refSource='direct';
    try{const h=new URL(document.referrer||'https://invalid.local').hostname;if(h.includes('threads.net')||h.includes('threads.com'))refSource='threads'}catch{}
    const source=q.get('utm_source')||sessionStorage.getItem('ob_utm_source')||refSource;
    const campaign=q.get('utm_campaign')||sessionStorage.getItem('ob_utm_campaign')||(refSource==='threads'?'organic_link':'none');
    const content=q.get('utm_content')||sessionStorage.getItem('ob_utm_content')||'none';
    if(q.get('utm_source'))sessionStorage.setItem('ob_utm_source',source);
    if(q.get('utm_campaign'))sessionStorage.setItem('ob_utm_campaign',campaign);
    if(q.get('utm_content'))sessionStorage.setItem('ob_utm_content',content);
    return{source,campaign,content};
  }catch{return{source:'direct',campaign:'none',content:'none'}}
}
function trafficDay(){return new Date(Date.now()+32400000).toISOString().slice(0,10)}
const TRAFFIC_PENDING_KEYS=new Set();
async function trackLite(event,contentOverride){
  try{
    const a=trafficAttribution(),content=contentOverride||a.content||'none',path=location.pathname||'/';
    const key=`obtl:${trafficDay()}:${event}:${a.source}:${a.campaign}:${content}:${path}`;
    if(localStorage.getItem(key)||TRAFFIC_PENDING_KEYS.has(key))return;
    TRAFFIC_PENDING_KEYS.add(key);
    try{
      const r=await fetch(TRAFFIC_LITE_URL,{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({event,source:a.source,campaign:a.campaign,content,path}),
        keepalive:true,
        cache:'no-store'
      });
      if(!r.ok)return;
      const d=await r.json().catch(()=>null);
      if(d?.ok===true)localStorage.setItem(key,'1');
    }finally{
      TRAFFIC_PENDING_KEYS.delete(key);
    }
  }catch{}
}
function raceKeyForView(rno){
  const d=String(CURRENT_VENUE?.date||trafficDay()).replaceAll('-','');
  const v=String(Number(CURRENT_VENUE?.code||0)).padStart(2,'0');
  const r=String(Number(rno||0)).padStart(2,'0');
  const k=d+v+r;
  return /^\d{12}$/.test(k)?k:'';
}
trackLite('landing');


function setTone(el,n){if(!el)return;el.classList.remove('positive','negative');if(Number(n)>0)el.classList.add('positive');if(Number(n)<0)el.classList.add('negative')}
function renderMetrics(key='today'){const x=STATS?.[key];if(!x)return;$('#m-roi').textContent=pct(x.roi);setTone($('#m-roi'),x.roi-100);$('#m-hit').textContent=pct(x.hit_rate);$('#m-profit').textContent=`${x.profit_yen>0?'+':''}${yen(x.profit_yen)}`;setTone($('#m-profit'),x.profit_yen);$('#m-races').textContent=`公開 ${x.races||0}R / ${x.hits||0}的中`}
function formatJpDate(v){const d=v?new Date(`${String(v).slice(0,10)}T00:00:00+09:00`):new Date();return `${d.getMonth()+1}月${d.getDate()}日(${['日','月','火','水','木','金','土'][d.getDay()]})のレース`}
function stateLabel(s){return {PUBLIC:'予想公開',WATCH:'様子見',SKIP:'見送り',SETTLED:'結果確定',FINISHED:'本日終了',CLOSED:'終了',NOEVENT:'本日非開催',PENDING:'直前分析中',UPDATING:'更新中'}[s]||'更新中'}
function stateClass(s){return {PUBLIC:'live',WATCH:'watch',SKIP:'skip',SETTLED:'settled',FINISHED:'idle',CLOSED:'idle',NOEVENT:'idle',PENDING:'pending',UPDATING:'pending'}[s]||'pending'}
function timeText(v){const m=String(v||'').match(/(\d{1,2}:\d{2})/);return m?m[1]:'--:--'}
function deadlineMinute(v){const m=String(v||'').match(/(\d{1,2}):(\d{2})/);return m?Number(m[1])*60+Number(m[2]):9999}
function deadlineLeftText(v){
  const m=String(v||'').match(/(\d{1,2}):(\d{2})/);
  if(!m)return'';
  const now=new Date(Date.now()+32400000),cur=now.getUTCHours()*60+now.getUTCMinutes(),left=Number(m[1])*60+Number(m[2])-cur;
  if(left<=0)return'締切';
  return left<60?`あと${left}分`:'';
}
function publicRecord(r){const d=String(r?.decision||r?.prediction?.decision||'').toUpperCase(),stake=Number(r?.stake_total_yen??r?.prediction?.stake_total_yen??0);return d==='ENTER'&&stake>0}
function betsOf(r){const p=r?.prediction||{};return Array.isArray(r?.bets)&&r.bets.length?r.bets:Array.isArray(p.production_picks)?p.production_picks:[]}
function ticketOf(x){return x?.ticket||x?.combination||x?.bet||'--'}
function stakeOf(x){return Number(x?.stake_yen??x?.amount??x?.stake??0)}

function venueTile(v){const cls=stateClass(v.state),quiet=(v.state==='NOEVENT'||v.state==='FINISHED')?' easy-quiet':'',hasRace=Number(v.next_race_no)>=1,meta=v.state==='NOEVENT'?'開催なし':v.state==='FINISHED'?'全レース終了':v.state==='UPDATING'&&!hasRace?'正式データ更新中':`${hasRace?v.next_race_no:'—'}R　${timeText(v.next_deadline)}`;return `<button class="venue-tile ${cls}${quiet}" type="button" data-code="${String(v.code).padStart(2,'0')}" aria-label="${esc(v.name)} ${stateLabel(v.state)}"><span class="venue-name">${esc(v.name)}</span><span class="venue-strip">${stateLabel(v.state)}</span><span class="venue-meta"><strong>${v.state==='NOEVENT'||!hasRace?'—':`${v.next_race_no}R`}</strong><em>${esc(meta)}</em></span></button>`}
function renderVenues(venues){$('#venue-grid').innerHTML=(venues||[]).map(venueTile).join('');document.querySelectorAll('.venue-tile').forEach(b=>b.addEventListener('click',()=>openVenue(b.dataset.code)))}
function freeProgressModel(o){
  const limit=Number(o?.free_limit??30);
  const raw=o?.free_count;
  const count=raw===null||raw===undefined?null:Number(raw);
  if(!Number.isFinite(count))return{available:false,limit:30,count:null,remaining:null,complete:false};
  const safeLimit=Number.isFinite(limit)&&limit>0?limit:30,safeCount=Math.max(0,Math.min(safeLimit,count)),remaining=Math.max(0,safeLimit-safeCount);
  return{available:true,limit:safeLimit,count:safeCount,remaining,complete:remaining===0};
}
function renderFreeStrip(o){
  const m=freeProgressModel(o);
  if(!m.available){
    $('#free-strip-list').innerHTML=`<div class="free-pending"><div class="free-progress-head"><div><small>TODAY FREE</small><strong>本日の無料予想</strong></div><span class="live-update updating"><i></i>データ更新中</span></div><small>公開数を確認しています。</small></div>`;
    return;
  }
  const liveState=m.complete?'本日分公開完了':(o?.source?.predictions===false?'データ更新中':'リアルタイム更新');
  const liveClass=m.complete?'live-update':(o?.source?.predictions===false?'live-update updating':'live-update');
  const complete=m.complete?`<div class="free-complete">本日の無料公開は終了しました</div>`:'';
  $('#free-strip-list').innerHTML=`<div class="free-progress-card"><div class="free-progress-head"><div><small>TODAY FREE</small><strong>本日の無料予想</strong></div><span class="${liveClass}"><i></i>${liveState}</span></div><div class="free-progress-numbers"><div class="free-used"><strong>${m.count}</strong><span>/ ${m.limit}R</span></div><div class="free-remaining"><small>残り</small><strong>${m.remaining}R</strong></div></div>${complete}<p class="free-progress-note">正式ENTERのみ公開</p></div>`;
}
function publicRaceCard(r){
  const settled=!!r.settlement,status=settled?(r.settlement.hit?'的中':'不的中'):'予想公開',cls=settled?(r.settlement.hit?'hit':'miss'):'locked';
  let sub;
  if(savedViewMode()==='pro'){
    sub=settled?`${r.settlement?.result?.trifecta||r.settlement?.trifecta||'結果反映済'} ・ ${r.settlement.hit?`払戻 ${yen(r.settlement.payout_yen)}`:'結果公開'}`:`締切 ${timeText(r.deadline||r.close_time)} ・ 投資 ${yen(r.stake_total_yen||r.prediction?.stake_total_yen)}`;
  }else{
    const dl=r.deadline||r.close_time,left=deadlineLeftText(dl);
    sub=settled?`${r.settlement?.result?.trifecta||r.settlement?.trifecta||'結果反映済'} ・ ${r.settlement.hit?`払戻 ${yen(r.settlement.payout_yen)}`:'結果公開'}`:`${left?left+' ・ ':''}締切 ${timeText(dl)} ・ 買い目 ${betsOf(r).length}点`;
  }
  return `<button class="race-card race-card-button" type="button" data-vcode="${String(r.venue_code).padStart(2,'0')}" data-rno="${Number(r.race_no)}"><div class="race-main"><strong>${esc(r.venue_name)} ${Number(r.race_no)}R</strong><small>${esc(sub)}</small></div><span class="status ${cls}">${status}</span></button>`;
}
function resultCard(x){const stake=Number(x.stake_yen||0),payout=Number(x.payout_yen||0),roi=stake?payout/stake*100:0,name=x.venue_name||VENUES[Number(x.venue_code)-1]||`場${x.venue_code||'--'}`;return `<article class="result-card"><div class="result-main"><strong>${esc(name)} ${x.race_no}R ${x.hit?'●':'×'}</strong><small>${esc(x.race_date||'')} ・ ${esc(x.trifecta||'結果')} ・ 回収 ${pct(roi)}</small></div><div><strong class="${Number(x.profit_yen)>=0?'positive':'negative'}">${Number(x.profit_yen)>0?'+':''}${yen(x.profit_yen)}</strong></div></article>`}

function openBackdrop(){const b=$('#sheet-backdrop');b.hidden=false;document.body.classList.add('sheet-open')}
function closeAll(){$('#venue-sheet').hidden=true;$('#race-sheet').hidden=true;$('#sheet-backdrop').hidden=true;document.body.classList.remove('sheet-open');CURRENT_VENUE=null}
function showVenueSheet(){openBackdrop();$('#race-sheet').hidden=true;$('#venue-sheet').hidden=false}
function showRaceSheet(){openBackdrop();$('#venue-sheet').hidden=true;$('#race-sheet').hidden=false}

function currentRaceNo(races){
  const xs=Array.isArray(races)?races:[];
  const now=new Date(Date.now()+32400000),cur=now.getUTCHours()*60+now.getUTCMinutes();
  const timed=xs.map(r=>({r,m:deadlineMinute(r.deadline)})).filter(x=>x.m<9999&&x.m>=cur&& !['CLOSED','SETTLED'].includes(x.r.state)).sort((a,b)=>a.m-b.m);
  if(timed.length)return Number(timed[0].r.race_no);
  const fallback=xs.find(r=>!['CLOSED','SETTLED','NOEVENT'].includes(r.state));
  return fallback?Number(fallback.race_no):null;
}
async function openVenue(code){showVenueSheet();$('#venue-sheet-title').textContent='読み込み中';$('#venue-sheet-state').textContent='--';$('#venue-sheet-meta').innerHTML='';$('#venue-races').innerHTML='<div class="sheet-loading">1R〜12Rを確認しています</div>';try{const r=await fetch(`/api/public/venue?code=${encodeURIComponent(code)}`,{cache:'no-store'});if(!r.ok)throw Error('venue');const v=await r.json();CURRENT_VENUE=v;$('#venue-sheet-title').textContent=v.name||VENUES[Number(code)-1]||'場詳細';$('#venue-sheet-state').className=`sheet-state ${stateClass(v.state)}`;$('#venue-sheet-state').textContent=stateLabel(v.state);$('#venue-sheet-meta').innerHTML=`<div><span>開催状況</span><strong>${v.state==='NOEVENT'?'本日非開催':v.state==='FINISHED'?'本日終了':'開催中'}</strong></div><div><span>公開予想</span><strong>${v.public_count===null||v.public_count===undefined?'—':Number(v.public_count)+'R'}</strong></div><div><span>更新</span><strong>自動</strong></div>`;const current=currentRaceNo(v.races||[]);$('#venue-races').innerHTML=(v.races||[]).map(x=>raceRow(x,current)).join('')||'<div class="sheet-loading">本日は開催がありません</div>';document.querySelectorAll('.race-row').forEach(b=>b.addEventListener('click',()=>openRace(Number(b.dataset.rno))))}catch(e){$('#venue-sheet-title').textContent=VENUES[Number(code)-1]||'場詳細';$('#venue-sheet-state').textContent='更新待ち';$('#venue-races').innerHTML='<div class="sheet-loading">データを再取得しています</div>'}}
function raceRow(r,currentNo=null){const cls=stateClass(r.state),isCurrent=Number(currentNo)===Number(r.race_no),deadline=r.deadline?timeText(r.deadline):'--:--',right=r.state==='NOEVENT'?'—':deadline;return `<button class="race-row ${cls}${isCurrent?' current-race':''}" type="button" data-rno="${Number(r.race_no)}"><span class="race-no">${Number(r.race_no)}R</span><span class="race-row-main"><strong>${stateLabel(r.state)}${isCurrent?'<em class="current-mark">現在</em>':''}</strong><small>${r.state==='PUBLIC'?`投資 ${yen(r.record?.stake_total_yen||r.record?.prediction?.stake_total_yen)}`:r.state==='SETTLED'?(r.record?.settlement?.hit?'的中結果あり':'結果確定'):r.note||''}</small></span><span class="race-time">${right}<b>›</b></span></button>`}
const VIEW_MODE_KEY='one_boat_view_mode';
function requestedViewMode(){
  try{
    const q=new URLSearchParams(location.search).get('mode');
    return q==='pro'||q==='easy'?q:null;
  }catch{return null}
}
function savedViewMode(){
  const q=requestedViewMode();
  if(q)return q;
  try{return localStorage.getItem(VIEW_MODE_KEY)==='pro'?'pro':'easy'}catch{return'easy'}
}
function saveViewMode(mode){try{localStorage.setItem(VIEW_MODE_KEY,mode==='pro'?'pro':'easy')}catch{}}
function applyPageMode(mode,{persist=true}={}){
  const m=mode==='pro'?'pro':'easy';
  if(persist)saveViewMode(m);
  document.documentElement.classList.toggle('pro-mode',m==='pro');
  document.body?.classList.toggle('pro-mode',m==='pro');
  const easy=$('#page-mode-easy'),pro=$('#page-mode-pro');
  if(easy){
    easy.classList.toggle('active',m==='easy');
    easy.setAttribute('aria-pressed',String(m==='easy'));
  }
  if(pro){
    pro.classList.toggle('active',m==='pro');
    pro.setAttribute('aria-pressed',String(m==='pro'));
  }
  const theme=document.querySelector('meta[name="theme-color"]');
  if(theme)theme.setAttribute('content',m==='pro'?'#030914':'#0877d7');
}
function syncModeCopy(){
  const pro=savedViewMode()==='pro';
  const introTitle=$('#today-intro-title'),introCopy=$('#today-intro-copy'),publicTitle=$('#public-title-text'),venueTitle=$('#venue-title-text');
  if(introTitle)introTitle.innerHTML=pro?'本日の予想<span class="blue">全国24場を確認</span>':'いま買える予想';
  if(introCopy)introCopy.textContent=pro?'予想公開・直前分析中・見送り・結果を、全国24場から確認できます。':'正式ENTERのみ公開。買い目・金額・締切を確認できます。';
  if(publicTitle)publicTitle.textContent=pro?'本日の公開予想':'いま買える予想';
  if(venueTitle)venueTitle.textContent=pro?'全国24場':'場から探す';
  const grid=$('#venue-grid'),toggle=$('#venue-toggle');
  if(pro){grid?.classList.remove('show-all');if(toggle){toggle.setAttribute('aria-expanded','false');toggle.textContent='全24場を見る'}}
}
function setupPageMode(){
  const mode=savedViewMode();
  applyPageMode(mode,{persist:!!requestedViewMode()});
  syncModeCopy();
  const easy=$('#page-mode-easy'),pro=$('#page-mode-pro');
  easy?.addEventListener('click',()=>{
    closeAll();
    applyPageMode('easy');
    $('#venue-grid')?.classList.remove('show-all');
    const t=$('#venue-toggle');if(t){t.setAttribute('aria-expanded','false');t.textContent='全24場を見る'}
    syncModeCopy();
    load();
  });
  pro?.addEventListener('click',()=>{
    closeAll();
    applyPageMode('pro');
    syncModeCopy();
    load();
  });
}
function raceDateForView(){return String(CURRENT_VENUE?.date||new Date(Date.now()+32400000).toISOString().slice(0,10)).slice(0,10)}
function proRaceUrl(r){
  const code=Number(CURRENT_VENUE?.code||0);
  const q=new URLSearchParams({date:raceDateForView(),venue:String(code),race:String(Number(r.race_no)),mode:'pro'});
  return `/analysis.html?${q.toString()}`;
}
function shortOfficialReason(v,max=118){
  const x=String(v||'').replace(/\s+/g,' ').trim();
  return x.length>max?`${x.slice(0,max)}…`:x;
}
function openRace(rno){
  const r=(CURRENT_VENUE?.races||[]).find(x=>Number(x.race_no)===Number(rno));
  if(!r)return;
  const rk=raceKeyForView(rno);
  if(rk&&publicRecord(r.record||{})){
    trackLite('prediction_open',rk);
    if(SITE_ONLY_KEYS.has(rk))trackLite('site_only_open',rk);
  }
  if(savedViewMode()==='pro'){
    location.href=proRaceUrl(r);
    return;
  }
  showRaceSheet();
  $('#race-sheet-title').textContent=`${CURRENT_VENUE.name} ${rno}R`;
  $('#race-sheet-state').className=`sheet-state ${stateClass(r.state)}`;
  $('#race-sheet-state').textContent=stateLabel(r.state);
  $('#race-detail').innerHTML=raceDetail(r);
  document.querySelectorAll('[data-view-mode="pro"]').forEach(a=>a.addEventListener('click',()=>saveViewMode('pro')));
}
function raceDetail(r){
  const rec=r.record||{},p=rec.prediction||{},sett=rec.settlement||null,bets=betsOf(rec);
  const stake=Number(rec.stake_total_yen??p.stake_total_yen??0);
  const reason=p.reason||p.skip_reason||rec.reason||'';
  const reasonShort=shortOfficialReason(reason);
  const proHref=proRaceUrl(r);
  const state=stateLabel(r.state);
  let html=`<nav class="race-mode-switch" aria-label="表示モード">
    <span class="race-mode active">かんたん</span>
    <a class="race-mode" data-view-mode="pro" href="${proHref}">PRO</a>
  </nav>
  <section class="easy-decision ${stateClass(r.state)}">
    <small>ひと目で確認</small>
    <strong>${state}</strong>
    <p>${esc(reasonShort||(publicRecord(rec)?'正式予想が公開されています。買い目と金額を確認してください。':r.note||'正式判定を表示しています。'))}</p>
  </section>
  <div class="detail-summary">
    <div><span>締切</span><strong>${timeText(r.deadline)}</strong></div>
    <div><span>判定</span><strong>${state}</strong></div>
    <div><span>投資</span><strong>${publicRecord(rec)?yen(stake):'購入なし'}</strong></div>
  </div>`;

  if(publicRecord(rec)){
    html+=`<section class="detail-block easy-bets">
      <div class="detail-label">これだけ見ればOK｜推奨買い目</div>
      ${bets.length?`<div class="bet-list">${bets.map(x=>`<div><strong>${esc(ticketOf(x))}</strong><span>${yen(stakeOf(x))}</span></div>`).join('')}</div>`:'<p>買い目を取得中です。</p>'}
    </section>`;
    if(reason)html+=`<section class="detail-block easy-reason"><div class="detail-label">ひとこと理由</div><p>${esc(reasonShort)}</p></section>`;
  }else{
    html+=`<section class="detail-block decision-message"><div class="detail-label">ONE BOATの判断</div><h3>${state}</h3><p>${esc(reasonShort||r.note||'条件が整うまで公開予想には含めません。')}</p></section>`;
  }

  html+=`<a class="pro-jump" data-view-mode="pro" href="${proHref}">
    <span><small>PRO MODE</small><strong>詳しい根拠・展示・モーター・オッズを見る</strong></span><b>›</b>
  </a>`;

  if(sett){
    const tri=sett?.result?.trifecta||sett?.trifecta||'--',profit=Number(sett.profit_yen||0);
    html+=`<section class="detail-block result-block ${sett.hit?'hit':'miss'}"><div class="detail-label">RESULT</div><h3>${sett.hit?'的中':'不的中'}　3連単 ${esc(tri)}</h3><div class="result-grid"><div><span>投資</span><strong>${yen(stake)}</strong></div><div><span>払戻</span><strong>${yen(sett.payout_yen)}</strong></div><div><span>収支</span><strong class="${profit>=0?'positive':'negative'}">${profit>0?'+':''}${yen(profit)}</strong></div></div></section>`;
  }
  return html;
}

async function load(){
  let o;
  try{
    const r=await fetch('/api/public/overview',{cache:'no-store'});
    if(!r.ok)throw new Error('overview');
    o=await r.json();
  }catch(e){
    $('#today-count').textContent='更新待ち';
    $('#public-count').textContent='--';
    const grid=$('#venue-grid');
    if(grid&&!grid.querySelector('.venue-tile'))grid.innerHTML='<div class="race-card" style="grid-column:1/-1"><div class="race-main"><strong>開催データを更新中</strong><small>正式データを取得でき次第、自動で表示します。</small></div></div>';
    const strip=$('#free-strip-list');if(strip)strip.innerHTML='<span class="free-chip">開催データを更新中</span>';
    $('#today-list').innerHTML='<div class="race-card"><div class="race-main"><strong>公開状況を更新中</strong><small>正式データを取得でき次第、自動で表示します。</small></div></div>';
    return;
  }

  try{
    const vu=new URL(FREE_VISIBILITY_URL);
    vu.searchParams.set('date',o.date||trafficDay());
    vu.searchParams.set('scope','site');
    const vr=await fetch(vu,{cache:'no-store'});
    if(vr.ok){
      const vj=await vr.json();
      if(vj?.ok){
        SITE_ONLY_KEYS=new Set((Array.isArray(vj.rows)?vj.rows:[]).filter(x=>x?.site_public===true&&x?.threads_public!==true).map(x=>String(x.race_key||'')).filter(Boolean));
      }
    }
  }catch{}
  let stats=STATS;
  const nowMs=Date.now();
  if(!stats||nowMs-STATS_FETCHED_AT>=300000){
    try{
      const r=await fetch(FREE_STATS_URL,{cache:'no-store'});
      if(r.ok){
        const next=await r.json();
        if(next?.ok){stats=next;STATS=next;STATS_FETCHED_AT=nowMs}
      }
    }catch{}
  }
  if(stats){
    renderMetrics('today');
  }else{
    $('#m-roi').textContent='--';
    $('#m-hit').textContent='--';
    $('#m-profit').textContent='--';
    $('#m-races').textContent='結果集計を更新中';
  }

  syncModeCopy();
  $('#today-date').textContent=formatJpDate(o.date);
  $('#today-count').textContent=Number.isFinite(Number(o.active_count))&&o.active_count!==null?`開催 ${Number(o.active_count)}場`:'開催情報更新中';
  renderVenues(o.venues||[]);
  renderFreeStrip(o);
  const pro=savedViewMode()==='pro';
  const all=o.public_items||[];
  const items=pro?all:all.filter(x=>!x.settlement).sort((a,b)=>deadlineMinute(a.deadline||a.close_time)-deadlineMinute(b.deadline||b.close_time));
  $('#public-count').textContent=o.public_count===null||o.public_count===undefined?'更新中':pro?`無料 ${Number(o.public_count)}/${Number(o.free_limit||30)}R`:`公開中 ${items.length}R`;
  $('#today-list').innerHTML=items.length?items.map(publicRaceCard).join(''):(pro?'<div class="race-card"><div class="race-main"><strong>現在、公開対象なし</strong><small>対象レースが確定すると自動表示します</small></div></div>':'<div class="race-card"><div class="race-main"><strong>現在、公開中の予想はありません</strong><small>正式ENTERが確定するとここへ自動表示します</small></div></div>');
  document.querySelectorAll('.race-card-button').forEach(b=>b.addEventListener('click',async()=>{await openVenue(b.dataset.vcode);openRace(Number(b.dataset.rno))}));
  $('#result-list').innerHTML=stats?.latest?.length?(stats.latest||[]).slice(0,8).map(resultCard).join(''):'<div class="race-card"><div class="race-main"><strong>結果集計を更新中</strong><small>本日の予想・場情報はそのまま確認できます。</small></div></div>';
  if(!AUTO_OPENED){
    const q=new URLSearchParams(location.search),vc=q.get('venue'),rn=Number(q.get('race'));
    if(vc&&rn>=1&&rn<=12){AUTO_OPENED=true;await openVenue(vc);openRace(rn)}
  }
}

document.querySelectorAll('.period').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.period').forEach(x=>x.classList.remove('active'));b.classList.add('active');renderMetrics(b.dataset.period)}));
$('#venue-close').addEventListener('click',closeAll);$('#race-back').addEventListener('click',showVenueSheet);$('#sheet-backdrop').addEventListener('click',closeAll);document.addEventListener('keydown',e=>{if(e.key==='Escape')closeAll()});
if(NOTE_URL){const b=$('#note-btn');if(b){b.classList.remove('disabled');b.textContent='ONE BOAT CLUBへ';b.addEventListener('click',()=>location.href=NOTE_URL)}}
const venueToggle=$('#venue-toggle');
if(venueToggle)venueToggle.addEventListener('click',()=>{
  if(savedViewMode()==='pro')return;
  const grid=$('#venue-grid'),open=grid.classList.toggle('show-all');
  venueToggle.setAttribute('aria-expanded',String(open));
  venueToggle.textContent=open?'開催中だけ表示':'全24場を見る';
});
function scheduleLiveRefresh(){
  if(LOAD_TIMER){clearTimeout(LOAD_TIMER);LOAD_TIMER=null}
  if(document.hidden)return;
  LOAD_TIMER=setTimeout(async()=>{await load();scheduleLiveRefresh()},30000);
}
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){
    if(LOAD_TIMER){clearTimeout(LOAD_TIMER);LOAD_TIMER=null}
    return;
  }
  load().finally(scheduleLiveRefresh);
});
setupPageMode();
load().finally(scheduleLiveRefresh);
