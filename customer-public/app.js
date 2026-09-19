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
const TRAFFIC_LITE_URL='https://imhzjlxbnovjvqlyawmg.supabase.co/functions/v1/one-boat-traffic-lite';
const VENUES=['桐生','戸田','江戸川','平和島','多摩川','浜名湖','蒲郡','常滑','津','三国','びわこ','住之江','尼崎','鳴門','丸亀','児島','宮島','徳山','下関','若松','芦屋','福岡','唐津','大村'];
const $=s=>document.querySelector(s);
const yen=n=>`${Math.round(Number(n||0)).toLocaleString('ja-JP')}円`;
const pct=n=>Number.isFinite(Number(n))?`${Number(n).toFixed(1)}%`:'--';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let STATS=null,STATS_FETCHED_AT=0,CURRENT_VENUE=null,AUTO_OPENED=false,LOAD_TIMER=null,LAST_OVERVIEW=null,REFRESH_BURST_LEFT=2,STATS_LOADING=null,SITE_ONLY_KEYS=new Set(),ACTIVE_RACE_NO=null,VENUE_SHEET_TIMER=null,VENUE_SHEET_LOADING=false,CLUB_LIST_OPEN=false,RESULT_LIST_OPEN=false,MEMBER_TODAY_ENTER=null,MEMBER_SYNC_STATE='unknown',PERFORMANCE_SCOPE='free',VENUE_BROWSE_MODE='venues',LAST_VENUES=[];
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
function performanceMetric(key='today'){return PERFORMANCE_SCOPE==='club'?STATS?.club?.[key]:STATS?.[key]}
function syncPerformanceScope(){
  const root=$('#performance'),club=PERFORMANCE_SCOPE==='club';
  if(root)root.classList.toggle('club-scope',club);
  document.querySelectorAll('[data-performance-scope]').forEach(b=>{const on=b.dataset.performanceScope===PERFORMANCE_SCOPE;b.classList.toggle('active',on);b.setAttribute('aria-selected',String(on))});
  const eyebrow=$('#performance-eyebrow'),title=$('#performance-title'),lead=$('#performance-lead');
  if(eyebrow)eyebrow.textContent=club?'ONE BOAT CLUB':'FREE PUBLIC PERFORMANCE';
  if(title)title.textContent=club?'正式ENTER実績':'無料公開実績';
  if(lead)lead.textContent=club?'無料公開枠外を含む正式ENTER全件を集計。見送り・様子見・投資0円は含めません。':'無料公開した正式ENTERのみ集計。見送り・様子見・投資0円は含めません。';
}
function renderMetrics(key='today'){
  syncPerformanceScope();
  const x=performanceMetric(key);
  const setMetric=(sel,val)=>{const el=$(sel);if(el)el.textContent=val};
  if(!x){
    setMetric('#m-roi','--');setMetric('#m-hit','--');setMetric('#m-profit','--');setMetric('#m-races','集計中');
    setMetric('#m-race-count','--');setMetric('#m-hit-count','--');setMetric('#m-stake','--');setMetric('#m-payout','--');
    renderBandPerformance(key);renderBoxValidationReference();return
  }
  setMetric('#m-roi',pct(x.roi));setTone($('#m-roi'),x.roi-100);
  setMetric('#m-hit',pct(x.hit_rate));
  setMetric('#m-profit',`${x.profit_yen>0?'+':''}${yen(x.profit_yen)}`);setTone($('#m-profit'),x.profit_yen);
  setMetric('#m-races',`${PERFORMANCE_SCOPE==='club'?'正式ENTER':'公開'} ${x.races||0}R / ${x.hits||0}的中`);
  setMetric('#m-race-count',`${Number(x.races||0)}R`);
  setMetric('#m-hit-count',`${Number(x.hits||0)}件`);
  setMetric('#m-stake',yen(x.stake_yen));
  setMetric('#m-payout',yen(x.payout_yen));
  renderBandPerformance(key);renderBoxValidationReference()
}
function formatJpDate(v){const d=v?new Date(`${String(v).slice(0,10)}T00:00:00+09:00`):new Date();return `${d.getMonth()+1}月${d.getDate()}日(${['日','月','火','水','木','金','土'][d.getDay()]})のレース`}
const CLUB_LAUNCH_STATUS='PRELAUNCH';
function clubCustomerLabel(){return CLUB_LAUNCH_STATUS==='LIVE'?'CLUB会員限定':'CLUB限定｜準備中'}
function stateLabel(s){return {ENTER:'正式ENTER',PUBLIC:'無料公開',WATCH:'様子見',SKIP:'見送り',PRIVATE:clubCustomerLabel(),SETTLED:'結果確定',FINISHED:'本日終了',CLOSED:'終了',NOEVENT:'本日非開催',PENDING:'直前分析中',UPDATING:'更新中'}[s]||'更新中'}
function stateClass(s){return {ENTER:'live',PUBLIC:'live',WATCH:'watch',SKIP:'skip',PRIVATE:'idle',SETTLED:'settled',FINISHED:'idle',CLOSED:'idle',NOEVENT:'idle',PENDING:'pending',UPDATING:'pending'}[s]||'pending'}
function timeText(v){const m=String(v||'').match(/(\d{1,2}:\d{2})/);return m?m[1]:'--:--'}
function deadlineMinute(v){const m=String(v||'').match(/(\d{1,2}):(\d{2})/);return m?Number(m[1])*60+Number(m[2]):9999}
function finalDecisionTime(v){const m=deadlineMinute(v);if(m===9999)return'--:--';const x=(m-5+1440)%1440;return String(Math.floor(x/60)).padStart(2,'0')+':'+String(x%60).padStart(2,'0')}
function skipReasonTag(v){
  const s=String(v||'');
  if(!s)return'条件未達';
  if(/進入|スタート展示/.test(s))return'進入条件';
  if(/オッズ|配当|期待値|妙味/.test(s))return'オッズ条件';
  if(/データ|取得|不足|欠損/.test(s))return'データ不足';
  if(/不確実|展開|先マイ|シナリオ/.test(s))return'展開不確実';
  if(/展示|モーター|足/.test(s))return'展示評価';
  return'条件未達';
}
function deadlineLeftText(v){
  const m=String(v||'').match(/(\d{1,2}):(\d{2})/);
  if(!m)return'';
  const now=new Date(Date.now()+32400000),cur=now.getUTCHours()*60+now.getUTCMinutes(),left=Number(m[1])*60+Number(m[2])-cur;
  if(left<=0)return'締切';
  return left<60?`あと${left}分`:'';
}
let MEMBER_STATUS_SESSION=null,MEMBER_STATUS_LOADING=null;
async function memberStatusSession({force=false}={}){
  if(!force&&MEMBER_STATUS_SESSION)return MEMBER_STATUS_SESSION;
  if(MEMBER_STATUS_LOADING)return MEMBER_STATUS_LOADING;
  MEMBER_STATUS_LOADING=(async()=>{
    try{
      const r=await fetch('/api/member/session',{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
      if(!r.ok)return null;
      const d=await r.json().catch(()=>null);
      if(!d?.ok)return null;
      MEMBER_STATUS_SESSION=d;
      return d;
    }catch{return null}
    finally{MEMBER_STATUS_LOADING=null}
  })();
  return MEMBER_STATUS_LOADING;
}
function memberStatusModel(sess){
  if(!sess)return{key:'loading',label:'確認中',text:'会員状況を確認中',sub:'最新の会員状態を確認しています'};
  if(sess.logged_in!==true)return{key:'guest',label:'未登録',text:'あなたは「未登録」です',sub:'無料登録すると会員機能を利用できます'};
  const plan=String(sess.plan||'').toLowerCase();
  if(plan==='day_pass')return{key:'day',label:'ONE DAY',text:'あなたは「ONE DAY」です',sub:'ONE DAYアクセスが有効です'};
  if(plan==='club_monthly'||plan==='staff')return{key:'premium',label:'PREMIUM',text:'あなたは「PREMIUM」です',sub:'PREMIUMアクセスが有効です'};
  if(plan==='free')return{key:'free',label:'無料会員',text:'あなたは「無料会員」です',sub:'無料公開レースを利用できます'};
  return{key:'loading',label:'確認中',text:'会員状況を確認中',sub:'会員情報を再確認しています'};
}
function renderMemberStatus(sess){
  const root=$('#member-status-strip'),text=$('#member-status-text'),sub=$('#member-status-sub'),badge=$('#member-status-badge');
  if(!root||!text||!sub||!badge)return;
  const m=memberStatusModel(sess);
  root.className=`member-status-strip status-${m.key}`;
  text.textContent=m.text;
  sub.textContent=m.sub;
  badge.textContent=m.label;
}
async function syncMemberStatus({force=false}={}){
  if(force)MEMBER_STATUS_SESSION=null;
  const sess=await memberStatusSession({force});
  renderMemberStatus(sess);
  return sess;
}
function publicRecord(r){const d=String(r?.decision||r?.prediction?.decision||'').toUpperCase(),stake=Number(r?.stake_total_yen??r?.prediction?.stake_total_yen??0);return d==='ENTER'&&stake>0}
async function paidTodayEnter(date){
  try{
    const sr=await fetch('/api/member/session',{credentials:'same-origin',cache:'no-store'});
    if(!sr.ok){MEMBER_SYNC_STATE=MEMBER_SYNC_STATE.startsWith('paid')?'paid_error':'error';return null}
    const sess=await sr.json().catch(()=>null);
    if(!sess?.logged_in||sess?.paid_access!==true){MEMBER_SYNC_STATE='guest';return null}
    MEMBER_SYNC_STATE='paid_loading';
    const u=new URL('/api/member/today-enter',location.origin);u.searchParams.set('date',date);
    const r=await fetch(u,{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
    if(!r.ok){MEMBER_SYNC_STATE='paid_error';return null}
    const d=await r.json().catch(()=>null);
    if(!d?.ok||!Array.isArray(d.records)){MEMBER_SYNC_STATE='paid_error';return null}
    MEMBER_SYNC_STATE='paid';
    return d.records.map(x=>({...x,venue_name:VENUES[Number(x.venue_code)-1]||`場${x.venue_code||'--'}`}));
  }catch{
    MEMBER_SYNC_STATE=MEMBER_SYNC_STATE.startsWith('paid')?'paid_error':'error';
    return null;
  }
}
function memberRaceKey(date,venue,race){
  const d=String(date||'').slice(0,10).replaceAll('-','');
  const v=String(Number(venue||0)).padStart(2,'0');
  const r=String(Number(race||0)).padStart(2,'0');
  const k=d+v+r;
  return /^\d{12}$/.test(k)?k:'';
}
function memberRecordFor(date,venue,race){
  if(!Array.isArray(MEMBER_TODAY_ENTER))return null;
  const key=memberRaceKey(date,venue,race);
  return MEMBER_TODAY_ENTER.find(x=>String(x?.race_key||memberRaceKey(x?.race_date,x?.venue_code,x?.race_no))===key)||null;
}
function memberRecordIsBuyable(x){
  if(!x||x.settlement)return false;
  const m=deadlineMinute(x.deadline);
  if(m===9999)return true;
  const now=new Date(Date.now()+32400000),cur=now.getUTCHours()*60+now.getUTCMinutes();
  return m>cur;
}
function mergeMemberVenue(v){
  if(!v)return v;
  if(!Array.isArray(MEMBER_TODAY_ENTER)){
    if(MEMBER_SYNC_STATE==='paid_error'){
      const races=(Array.isArray(v.races)?v.races:[]).map(r=>['SETTLED','CLOSED','NOEVENT','FINISHED','PUBLIC'].includes(String(r?.state||''))?r:{...r,state:'UPDATING',note:'CLUB正式判定を再取得中'});
      return {...v,races,state:['NOEVENT','FINISHED'].includes(String(v.state||''))?v.state:'UPDATING'};
    }
    return v;
  }
  const date=String(v.date||trafficDay()).slice(0,10),code=Number(v.code||0);
  const races=(Array.isArray(v.races)?v.races:[]).map(r=>{
    const m=memberRecordFor(date,code,r.race_no);
    if(!m)return r;
    const state=m.settlement?'SETTLED':(publicRecord(m)?'ENTER':r.state);
    return {...r,state,record:{...m,settlement:m.settlement||r?.record?.settlement||null},member_formal:true};
  });
  const current=currentRaceNo(races),cr=races.find(x=>Number(x.race_no)===Number(current));
  return {...v,races,state:cr&&effectiveRaceState(cr)==='ENTER'?'ENTER':v.state,member_enter_count:races.filter(x=>effectiveRaceState(x)==='ENTER').length};
}
function mergeMemberOverview(o){
  if(!o)return o;
  if(!Array.isArray(MEMBER_TODAY_ENTER)){
    if(MEMBER_SYNC_STATE==='paid_error'){
      const venues=(Array.isArray(o.venues)?o.venues:[]).map(v=>['NOEVENT','FINISHED'].includes(String(v?.state||''))?v:{...v,state:'UPDATING'});
      return {...o,venues};
    }
    return o;
  }
  const date=String(o.date||trafficDay()).slice(0,10);
  const venues=(Array.isArray(o.venues)?o.venues:[]).map(v=>{
    const m=memberRecordFor(date,v.code,v.next_race_no);
    if(!m||m.settlement||!publicRecord(m))return v;
    return {...v,state:'ENTER',member_enter:true};
  });
  return {...o,venues};
}
function betsOf(r){const p=r?.prediction||{};return Array.isArray(r?.bets)&&r.bets.length?r.bets:Array.isArray(p.production_picks)?p.production_picks:[]}
function referencePicksOf(r){const xs=r?.prediction?.reference_picks;return Array.isArray(xs)?xs.filter(x=>x?.ticket):[]}
function ticketOf(x){return x?.ticket||x?.combination||x?.bet||'--'}
function stakeOf(x){return Number(x?.stake_yen??x?.amount??x?.stake??0)}
function clubPortfolioModel(raw){
  const rec=raw?.record||raw||{},p=rec?.prediction||{},bets=betsOf(rec);
  const baseStake=Number(rec?.stake_total_yen??p?.stake_total_yen??0);
  if(!publicRecord(rec))return{mode:'PASS',label:'NO BOOST',baseStake,extraStake:0,totalStake:baseStake,reason:'正式ENTERではないため追加投資なし',tickets:[]};
  const strategy=String(p?.strategy_mode||p?.allocation_meta?.strategy_mode||p?.odds_class||'').toUpperCase();
  if(strategy==='BOX')return{mode:'BOX',label:'BOX',baseStake,extraStake:0,totalStake:baseStake,reason:'頭が割れるレースはBOX型を維持',tickets:[]};
  const fallbackOdds=bets.map(x=>Number(x?.odds)).filter(x=>Number.isFinite(x)&&x>0);
  const formalAvg=Number(p?.portfolio_avg_top12_odds);
  const avgOdds=Number.isFinite(formalAvg)&&formalAvg>0?formalAvg:(fallbackOdds.length?fallbackOdds.reduce((a,b)=>a+b,0)/fallbackOdds.length:null);
  if(!Number.isFinite(avgOdds))return{mode:'PASS',label:'NO BOOST',baseStake,extraStake:0,totalStake:baseStake,reason:'オッズ条件を確認できないため追加投資なし',tickets:[]};
  const formalFocus=Array.isArray(p?.portfolio_focus_picks)?p.portfolio_focus_picks.filter(x=>x?.ticket):[];
  const sourcePicks=formalFocus.length>=2?formalFocus:bets.slice(0,2);
  if(avgOdds>=65&&avgOdds<100&&sourcePicks.length>=2){
    const tickets=sourcePicks.slice(0,2).map((x,i)=>({ticket:ticketOf(x),boost_yen:2500,rank:i+1,odds:Number.isFinite(Number(x?.odds))?Number(x.odds):null}));
    return{mode:'FOCUS',label:'FOCUS β',baseStake,extraStake:5000,totalStake:baseStake+5000,reason:'中高配当ゾーンで上位候補へ追加投資',tickets,avgOdds};
  }
  return{mode:'NORMAL',label:'NORMAL',baseStake,extraStake:0,totalStake:baseStake,reason:'正式配分をそのまま使用',tickets:[],avgOdds};
}
function renderClubPortfolioPlan(rows,{memberActive=false}={}){
  const root=$('#club-portfolio-beta');if(!root)return;
  const allRows=Array.isArray(rows)?rows:[];
  const live=allRows.filter(x=>publicRecord(x)&&!x?.settlement);
  const settled=allRows.filter(x=>publicRecord(x)&&x?.settlement);
  if(!live.length&&!settled.length){root.hidden=true;root.innerHTML='';return}
  const models=live.map(clubPortfolioModel);
  const counts={FOCUS:0,BOX:0,NORMAL:0,PASS:0};models.forEach(x=>counts[x.mode]=(counts[x.mode]||0)+1);
  const base=models.reduce((a,x)=>a+Number(x.baseStake||0),0),extra=models.reduce((a,x)=>a+Number(x.extraStake||0),0);
  const focusRows=live.map((r,i)=>({r,m:models[i]})).filter(x=>x.m.mode==='FOCUS');
  const settledFocus=settled.map(r=>({r,m:clubPortfolioModel(r)})).filter(x=>x.m.mode==='FOCUS');
  let shadowPayout=0,shadowHits=0;
  settledFocus.forEach(({r,m})=>{
    const win=String(r?.settlement?.result?.trifecta||r?.settlement?.trifecta||'');
    const wb=betsOf(r).find(x=>String(ticketOf(x))===win);
    const isBoost=m.tickets.some(x=>String(x.ticket)===win);
    if(isBoost&&wb&&stakeOf(wb)>0&&Number(r?.settlement?.payout_yen)>0){
      shadowHits++;
      shadowPayout+=Number(r.settlement.payout_yen)*(2500/stakeOf(wb));
    }
  });
  const shadowStake=settledFocus.length*5000,shadowRoi=shadowStake>0?100*shadowPayout/shadowStake:null;
  const scope=memberActive?'CLUB正式ENTER全件':'公開中予想';
  root.hidden=false;
  root.innerHTML=`<div class="portfolio-beta-head"><div><small>CLUB PORTFOLIO β</small><strong>本日の資金プラン</strong></div><span>β運用中</span></div><p>${esc(scope)}を資金モード別に自動整理。正式予想はそのまま、追加投資だけ別レイヤーで検証しています。</p><div class="portfolio-beta-modes"><div class="focus"><span>FOCUS</span><strong>${counts.FOCUS}R</strong></div><div class="box"><span>BOX</span><strong>${counts.BOX}R</strong></div><div><span>NORMAL</span><strong>${counts.NORMAL}R</strong></div><div><span>NO BOOST</span><strong>${counts.PASS}R</strong></div></div><div class="portfolio-beta-money"><div><span>現在の正式投資</span><strong>${yen(base)}</strong></div><b>＋</b><div><span>BOOST候補</span><strong>${yen(extra)}</strong></div><em>=</em><div><span>参考総投資</span><strong>${yen(base+extra)}</strong></div></div>${focusRows.length?`<div class="portfolio-focus-list"><small>FOCUS β｜購入可能</small>${focusRows.slice(0,4).map(x=>`<span><b>${esc(x.r.venue_name||'')} ${Number(x.r.race_no)}R</b><em>+5,000円 / 上位2点</em></span>`).join('')}${focusRows.length>4?`<i>ほか ${focusRows.length-4}R</i>`:''}</div>`:''}${settledFocus.length?`<div class="portfolio-shadow-result"><div><small>SHADOW RESULT</small><strong>本日β検証</strong></div><span>${settledFocus.length}R / ${shadowHits}的中</span><span>追加投資 ${yen(shadowStake)} → 参考払戻 ${yen(Math.round(shadowPayout))}</span><b>${shadowRoi===null?'--':shadowRoi.toFixed(1)+'%'}</b></div>`:''}<small class="portfolio-beta-note">β検証中。BOOST結果は正式実績と分けて表示し、本番成績へ混ぜません。</small>`;
}
function effectiveRaceState(r){
  const d=String(r?.record?.decision||r?.record?.prediction?.decision||'').toUpperCase();
  if(d==='ENTER'&&publicRecord(r?.record||{}))return'ENTER';
  if(d==='PRIVATE_ENTER')return'PRIVATE';
  return r?.state||'UPDATING';
}

function deadlineUrgency(deadline){
  const m=deadlineMinute(deadline);
  if(m===9999)return{cls:'',left:null};
  const now=new Date(Date.now()+32400000),cur=now.getUTCHours()*60+now.getUTCMinutes(),left=m-cur;
  if(left<0)return{cls:'',left:null};
  if(left<=5)return{cls:'deadline-hot',left};
  if(left<=10)return{cls:'deadline-soon',left};
  return{cls:'',left};
}
function categoryBadges(v,{compact=false}={}){
  const xs=[];
  const g=String(v?.grade||'').toUpperCase();
  if(['SG','G1','G2','G3'].includes(g))xs.push(`<em class="race-category-badge grade ${g.toLowerCase()}">${esc(g)}</em>`);
  if(v?.women===true)xs.push('<em class="race-category-badge women">女子戦</em>');
  return xs.length?`<span class="race-category-badges${compact?' compact':''}">${xs.join('')}</span>`:'';
}
function venueTile(v){
  const cls=stateClass(v.state),quiet=(v.state==='NOEVENT'||v.state==='FINISHED')?' easy-quiet':'',hasRace=Number(v.next_race_no)>=1,hasPrediction=Number(v.public_count||0)>0,urg=hasRace?deadlineUrgency(v.next_deadline):{cls:'',left:null};
  const time=timeText(v.next_deadline);
  const meta=v.state==='NOEVENT'?'開催なし':v.state==='FINISHED'?'全レース終了':v.state==='UPDATING'&&!hasRace?'正式データ更新中':urg.left!==null?(urg.left<=0?`締切間近 ${time}`:`あと${urg.left}分 ${time}`):`締切 ${time}`;
  return `<button class="venue-tile ${cls}${quiet}${hasPrediction?' has-auto-prediction':''}" type="button" data-code="${String(v.code).padStart(2,'0')}" aria-label="${esc(v.name)} ${stateLabel(v.state)}"><span class="venue-category-corner">${categoryBadges(v,{compact:true})}</span><span class="venue-name">${esc(v.name)}</span><span class="venue-strip">${stateLabel(v.state)}</span><span class="venue-meta"><strong>${v.state==='NOEVENT'||!hasRace?'—':`${v.next_race_no}R`}</strong><em class="${urg.cls}">${esc(meta)}</em></span></button>`;
}
function deadlineBrowseRow(v){
  const hasRace=Number(v?.next_race_no)>=1,time=timeText(v?.next_deadline),urg=hasRace?deadlineUrgency(v.next_deadline):{left:null};
  const meta=!hasRace?'レース情報確認中':urg.left!==null?(urg.left<=0?'締切間近':('あと'+urg.left+'分')):'締切 '+time;
  return '<button class="deadline-browse-row" type="button" data-code="'+String(v.code).padStart(2,'0')+'" data-rno="'+Number(v.next_race_no||0)+'"><span class="deadline-place"><strong>'+esc(v.name)+'</strong>'+categoryBadges(v,{compact:true})+'</span><span class="deadline-race">'+(hasRace?(Number(v.next_race_no)+'R'):'—')+'</span><span class="deadline-time"><strong>'+esc(meta)+'</strong><small>'+esc(time||'--:--')+'</small></span><b>›</b></button>';
}
function renderDeadlineBrowse(venues){
  const root=$('#venue-deadline-list');if(!root)return;
  const xs=(venues||[]).filter(v=>!['NOEVENT','FINISHED'].includes(String(v?.state||''))&&Number(v?.next_race_no)>=1).slice().sort((a,b)=>deadlineMinute(a.next_deadline)-deadlineMinute(b.next_deadline)||Number(a.code)-Number(b.code));
  root.innerHTML=xs.length?xs.map(deadlineBrowseRow).join(''):'<div class="deadline-empty">現在、締切順で表示できるレースはありません</div>';
  root.querySelectorAll('.deadline-browse-row').forEach(b=>b.addEventListener('click',async()=>{await openVenue(b.dataset.code);const rno=Number(b.dataset.rno);if(rno>=1&&rno<=12)openRace(rno)}));
}
function syncVenueBrowseMode(){
  const grid=$('#venue-grid'),dead=$('#venue-deadline-list'),toggle=$('#venue-toggle');
  document.querySelectorAll('[data-venue-browse]').forEach(b=>{const on=b.dataset.venueBrowse===VENUE_BROWSE_MODE;b.classList.toggle('active',on);b.setAttribute('aria-selected',String(on))});
  if(grid)grid.hidden=VENUE_BROWSE_MODE!=='venues';
  if(dead)dead.hidden=VENUE_BROWSE_MODE!=='deadline';
  if(toggle)toggle.hidden=VENUE_BROWSE_MODE!=='venues';
}
function renderVenues(venues){
  LAST_VENUES=Array.isArray(venues)?venues:[];
  $('#venue-grid').innerHTML=LAST_VENUES.map(venueTile).join('');
  document.querySelectorAll('.venue-tile').forEach(b=>b.addEventListener('click',()=>openVenue(b.dataset.code)));
  renderDeadlineBrowse(LAST_VENUES);
  syncVenueBrowseMode();
}
function freeProgressModel(o){
  const limit=Number(o?.free_limit??30);
  const raw=o?.free_count;
  const count=raw===null||raw===undefined?null:Number(raw);
  if(!Number.isFinite(count))return{available:false,limit:30,count:null,remaining:null,complete:false};
  const safeLimit=Number.isFinite(limit)&&limit>0?limit:30,safeCount=Math.max(0,Math.min(safeLimit,count)),remaining=Math.max(0,safeLimit-safeCount);
  return{available:true,limit:safeLimit,count:safeCount,remaining,complete:remaining===0};
}
function renderCustomerOverview(o){
  const s=o?.decision_summary||{},buy=$('#customer-buy'),wait=$('#customer-wait'),skip=$('#customer-skip');
  if(buy)buy.textContent=Number.isFinite(Number(s.buy))?String(Number(s.buy)):'--';
  if(wait)wait.textContent=Number.isFinite(Number(s.waiting))?String(Number(s.waiting)):'--';
  if(skip)skip.textContent=Number.isFinite(Number(s.skip))?String(Number(s.skip)):'--';
  const n=o?.next_decision,box=$('#next-decision-card');
  if(!box)return;
  if(!n){
    box.classList.add('empty');
    box.removeAttribute('data-vcode');box.removeAttribute('data-rno');
    box.innerHTML='<div><small>NEXT DECISION</small><strong>次に判定するレースを確認中</strong><span>購入するか見送るか、決まり次第表示します。</span></div>';
    return;
  }
  box.classList.remove('empty');
  box.dataset.vcode=String(n.venue_code||'');box.dataset.rno=String(n.race_no||'');
  const left=Number.isFinite(Number(n.minutes_left))?'あと約'+Math.max(0,Number(n.minutes_left))+'分':'まもなく判定';
  box.innerHTML='<div><small>NEXT DECISION</small><strong>'+esc(n.venue_name||'')+' '+(Number(n.race_no)||'--')+'R</strong><em class="next-decision-time">'+finalDecisionTime(n.deadline)+'に「購入 / 見送り」を確定</em><span>'+left+'｜締切 '+timeText(n.deadline)+'</span></div><b>›</b>';
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
function predictionAccess(r){
  const d=String(r?.decision||r?.prediction?.decision||'').toUpperCase();
  const visibility=String(r?.visibility_code||'');
  const club=d==='PRIVATE_ENTER'||visibility==='FULL_PRIVATE'||r?.__private_enter===true||r?.club_only===true;
  if(club)return{label:'CLUB会員限定',cls:'access-club',club:true};
  const siteOnly=visibility==='SNS_PRIVATE'||String(r?.customer_visibility_label||'')==='サイト限定';
  if(siteOnly)return{label:'サイト限定',cls:'access-site',club:false};
  return{label:'SNS公開',cls:'access-sns',club:false};
}
function publicRaceCard(r,{memberActive=false}={}){
  const settled=!!r.settlement,access=predictionAccess(r),gated=access.club&&!memberActive,cls=settled?(r.settlement.hit?'hit':'miss'):access.cls;
  let sub;
  if(settled){
    sub=`${r.settlement?.result?.trifecta||r.settlement?.trifecta||'結果反映済'} ・ ${r.settlement.hit?`払戻 ${yen(r.settlement.payout_yen)}`:'結果公開'}`;
  }else if(gated){
    const dl=r.deadline||r.close_time,left=deadlineLeftText(dl);
    sub=`${left?left+' ・ ':''}締切 ${timeText(dl)} ・ CLUB登録で買い目を確認`;
  }else if(savedViewMode()==='pro'){
    sub=`締切 ${timeText(r.deadline||r.close_time)} ・ 投資 ${yen(r.stake_total_yen||r.prediction?.stake_total_yen)}`;
  }else{
    const dl=r.deadline||r.close_time,left=deadlineLeftText(dl);
    sub=`${left?left+' ・ ':''}締切 ${timeText(dl)} ・ 買い目 ${betsOf(r).length}点`;
  }
  const badge=settled?(r.settlement.hit?'的中':'不的中'):access.label;
  const pm=(!settled&&!gated&&publicRecord(r))?clubPortfolioModel(r):null;
  const ptag=pm?`<em class="portfolio-mini ${pm.mode.toLowerCase()}">CLUB ${esc(pm.label)}${pm.extraStake?` +${yen(pm.extraStake)}`:''}</em>`:'';
  return `<button class="race-card race-card-button${gated?' club-gated':''}" type="button" data-vcode="${String(r.venue_code).padStart(2,'0')}" data-rno="${Number(r.race_no)}" data-access="${access.club?'club':access.cls.replace('access-','')}"><div class="race-main"><strong>${esc(r.venue_name)} ${Number(r.race_no)}R</strong><small>${esc(sub)}</small>${ptag}</div><span class="status ${cls}">${badge}</span></button>`;
}
function normalizeResultTicket(v){return String(v||'').replace(/[‐‑‒–—―ー−]/g,'-').replace(/\s+/g,'').trim()}
function resultModel(x){
  if(x?.settlement){
    const s=x.settlement||{},picks=betsOf(x),win=normalizeResultTicket(s?.result?.trifecta||s?.trifecta||'');
    const wb=picks.find(b=>normalizeResultTicket(ticketOf(b))===win)||null;
    return{race_date:x.race_date,venue_code:x.venue_code,venue_name:x.venue_name,race_no:x.race_no,hit:s.hit===true,trifecta:win,stake_yen:Number(x.stake_total_yen||x.prediction?.stake_total_yen||0),payout_yen:Number(s.payout_yen||0),profit_yen:Number.isFinite(Number(s.profit_yen))?Number(s.profit_yen):Number(s.payout_yen||0)-Number(x.stake_total_yen||0),winning_odds:Number.isFinite(Number(wb?.odds))?Number(wb.odds):null,winning_stake_yen:wb?stakeOf(wb):null};
  }
  return x||{};
}
function oddsText(v){return Number.isFinite(Number(v))?`${Number(v).toFixed(1)}倍`:'—'}
function resultCard(raw){
  const x=resultModel(raw),name=x.venue_name||VENUES[Number(x.venue_code)-1]||`場${x.venue_code||'--'}`,profit=Number(x.profit_yen||0),hit=x.hit===true;
  const odds=hit&&Number.isFinite(Number(x.winning_odds))?`予想時 ${oddsText(x.winning_odds)}`:'';
  const alloc=hit&&Number.isFinite(Number(x.winning_stake_yen))?yen(x.winning_stake_yen):'—';
  return `<article class="result-card live-result-card"><div class="live-result-head"><strong>${esc(name)} ${Number(x.race_no)}R</strong><span class="result-status ${hit?'hit':'miss'}">${hit?'的中':'不的中'}</span></div><div class="live-result-outcome"><span>3連単</span><strong>${esc(x.trifecta||'—')}</strong>${odds?`<em>${esc(odds)}</em>`:''}</div><div class="result-money-grid">${hit?`<div><span>的中買い目の配分</span><strong>${alloc}</strong></div>`:''}<div><span>レース総投資</span><strong>${yen(x.stake_yen)}</strong></div><div><span>払戻</span><strong>${yen(x.payout_yen)}</strong></div><div><span>収支</span><strong class="${profit>=0?'positive':'negative'}">${profit>0?'+':''}${yen(profit)}</strong></div></div></article>`;
}
function bandRangeText(m){if(m?.range_label)return String(m.range_label);return m?.odds_max===null?`${Number(m?.odds_min||80).toFixed(1)}倍〜`:`${Number(m?.odds_min||0).toFixed(1)}〜${Number(m?.odds_max||0).toFixed(1)}倍`}
function renderBoxValidationReference(){
  const root=$('#box-validation-reference');if(!root)return;
  if(PERFORMANCE_SCOPE==='club'){root.hidden=true;root.innerHTML='';return}
  const x=STATS?.box_validation_reference;
  if(!x){root.hidden=true;root.innerHTML='';return}
  root.hidden=false;
  const profit=Number(x.profit_yen||0);
  root.innerHTML=`<div class="box-validation-head"><span>REFERENCE CHECK</span><em>参考検証</em></div><strong>${esc(x.label||'朝から適用した場合')}</strong><p>BOX型AIを朝から同条件で動かした場合の再計算です。正式運用実績とは分けて表示しています。</p><div class="box-validation-metrics"><div><small>対象</small><b>${Number(x.races||0)}R</b></div><div><small>的中</small><b>${Number(x.hits||0)}R</b></div><div><small>的中率</small><b>${pct(x.hit_rate)}</b></div><div><small>回収率</small><b>${pct(x.roi)}</b></div></div><div class="box-validation-money"><span>投資 ${yen(x.stake_yen)} → 払戻 ${yen(x.payout_yen)}</span><strong class="${profit>=0?'positive':'negative'}">${profit>0?'+':''}${yen(profit)}</strong></div><small>BOX① ${Number(x.box1_hits||0)}的中 / BOX② ${Number(x.box2_hits||0)}的中｜${esc(x.date||'')} ${esc(x.as_of||'')}時点</small>`;
}
function renderBandPerformance(key='today'){
  const root=(PERFORMANCE_SCOPE==='club'?STATS?.club_ai_types:STATS?.ai_types)||{},types=root?.[key]?.stable?root[key]:root;
  const box=$('#band-performance');if(!box)return;
  const order=['stable','mid','high','box'];
  if(!types?.stable){box.innerHTML='<div class="race-card"><div class="race-main"><strong>集計中</strong><small>予想タイプ別データを更新しています。</small></div></div>';return}
  box.innerHTML=order.map(k=>{const m=types[k]||{},sample=m.sample_status||((Number(m.races)||0)<20?'参考値':'集計値'),avg=Number.isFinite(Number(m.avg_hit_odds))?`平均的中オッズ ${oddsText(m.avg_hit_odds)}`:'平均的中オッズ —';return `<article class="band-card"><div class="band-name"><strong>${esc(m.name||k)}</strong><span>${bandRangeText(m)}</span><em>${esc(sample)}</em></div><div class="band-metrics"><div><span>対象</span><strong>${Number(m.races||0)}R</strong></div><div><span>的中率</span><strong>${pct(m.hit_rate)}</strong></div><div><span>回収率</span><strong>${pct(m.roi)}</strong></div><small class="band-average">${avg}</small></div></article>`}).join('');
}

function openBackdrop(){const b=$('#sheet-backdrop');b.hidden=false;document.body.classList.add('sheet-open')}
function stopVenueSheetRefresh(){if(VENUE_SHEET_TIMER){clearTimeout(VENUE_SHEET_TIMER);VENUE_SHEET_TIMER=null}}
function closeAll(){stopVenueSheetRefresh();$('#venue-sheet').hidden=true;$('#race-sheet').hidden=true;$('#sheet-backdrop').hidden=true;document.body.classList.remove('sheet-open');CURRENT_VENUE=null;ACTIVE_RACE_NO=null}
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
function renderVenueSheet(v,{silent=false}={}){
  CURRENT_VENUE=v;
  if(!silent){
    $('#venue-sheet-title').textContent=v.name||VENUES[Number(v.code)-1]||'場詳細';
  }else if($('#venue-sheet-title')){
    $('#venue-sheet-title').textContent=v.name||VENUES[Number(v.code)-1]||'場詳細';
  }
  const current=currentRaceNo(v.races||[]),currentRace=(v.races||[]).find(x=>Number(x.race_no)===Number(current)),displayState=currentRace?effectiveRaceState(currentRace):v.state;
  $('#venue-sheet-state').className=`sheet-state ${stateClass(displayState)}`;
  $('#venue-sheet-state').textContent=stateLabel(displayState);
  $('#venue-sheet-meta').innerHTML=`<div><span>開催状況</span><strong>${v.state==='NOEVENT'?'本日非開催':v.state==='FINISHED'?'本日終了':'開催中'}</strong></div><div><span>公開予想</span><strong>${v.public_count===null||v.public_count===undefined?'—':Number(v.public_count)+'R'}</strong></div><div><span>種別</span><strong>${categoryBadges(v)||'一般戦'}</strong></div>`;
  $('#venue-races').innerHTML=(v.races||[]).map(x=>raceRow(x,current)).join('')||'<div class="sheet-loading">本日は開催がありません</div>';
  document.querySelectorAll('.race-row').forEach(b=>b.addEventListener('click',()=>openRace(Number(b.dataset.rno))));
  if(ACTIVE_RACE_NO!==null&&!$('#race-sheet').hidden){
    renderOpenRace(ACTIVE_RACE_NO);
  }
}
function liveVenueRefreshDelay(){
  if(!CURRENT_VENUE)return 30000;
  const r=(CURRENT_VENUE.races||[]).find(x=>Number(x.race_no)===Number(ACTIVE_RACE_NO))||(CURRENT_VENUE.races||[]).find(x=>Number(x.race_no)===Number(currentRaceNo(CURRENT_VENUE.races||[])));
  const left=deadlineUrgency(r?.deadline).left;
  if(Number.isFinite(left)&&left>=0&&left<=20)return 10000;
  return 30000;
}
function scheduleVenueSheetRefresh(){
  stopVenueSheetRefresh();
  if(document.hidden||!CURRENT_VENUE||$('#sheet-backdrop')?.hidden)return;
  VENUE_SHEET_TIMER=setTimeout(async()=>{
    await refreshOpenVenue();
    scheduleVenueSheetRefresh();
  },liveVenueRefreshDelay());
}
async function refreshOpenVenue(){
  if(VENUE_SHEET_LOADING||!CURRENT_VENUE)return CURRENT_VENUE;
  VENUE_SHEET_LOADING=true;
  try{
    const code=CURRENT_VENUE.code,date=String(CURRENT_VENUE.date||trafficDay()).slice(0,10);
    if(Array.isArray(MEMBER_TODAY_ENTER)){
      const freshMember=await paidTodayEnter(date);
      if(Array.isArray(freshMember))MEMBER_TODAY_ENTER=freshMember;
    }
    const r=await fetch(`/api/public/venue?code=${encodeURIComponent(code)}`,{cache:'no-store'});
    if(!r.ok)return CURRENT_VENUE;
    const v=mergeMemberVenue(await r.json());
    renderVenueSheet(v,{silent:true});
    return v;
  }catch{return CURRENT_VENUE}
  finally{VENUE_SHEET_LOADING=false}
}
function renderOpenRace(rno){
  const r=(CURRENT_VENUE?.races||[]).find(x=>Number(x.race_no)===Number(rno));
  if(!r)return;
  const state=effectiveRaceState(r);
  $('#race-sheet-title').innerHTML=`<span class="race-title-main">${esc(CURRENT_VENUE.name)} ${rno}R</span><span class="race-title-category">${categoryBadges(r)}</span>`;
  $('#race-sheet-state').className=`sheet-state ${stateClass(state)}`;
  $('#race-sheet-state').textContent=stateLabel(state);
  $('#race-detail').innerHTML=raceDetail(r);
  document.querySelectorAll('[data-view-mode="pro"]').forEach(a=>a.addEventListener('click',()=>saveViewMode('pro')));
  document.querySelector('[data-next-public]')?.addEventListener('click',()=>{closeAll();location.hash='today';document.getElementById('today')?.scrollIntoView({behavior:'smooth',block:'start'})});
}
async function openVenue(code){stopVenueSheetRefresh();ACTIVE_RACE_NO=null;showVenueSheet();$('#venue-sheet-title').textContent='読み込み中';$('#venue-sheet-state').textContent='--';$('#venue-sheet-meta').innerHTML='';$('#venue-races').innerHTML='<div class="sheet-loading">1R〜12Rを確認しています</div>';try{const r=await fetch(`/api/public/venue?code=${encodeURIComponent(code)}`,{cache:'no-store'});if(!r.ok)throw Error('venue');const v=mergeMemberVenue(await r.json());renderVenueSheet(v);scheduleVenueSheetRefresh()}catch(e){$('#venue-sheet-title').textContent=VENUES[Number(code)-1]||'場詳細';$('#venue-sheet-state').textContent='更新待ち';$('#venue-races').innerHTML='<div class="sheet-loading">データを再取得しています</div>'}}
function raceRow(r,currentNo=null){const state=effectiveRaceState(r),cls=stateClass(state),isCurrent=Number(currentNo)===Number(r.race_no),deadline=r.deadline?timeText(r.deadline):'--:--',urg=deadlineUrgency(r.deadline),right=state==='NOEVENT'?'—':deadline,hasRef=referencePicksOf(r.record||{}).length>0,skipReason=r.record?.prediction?.skip_reason||'',reasonTag=state==='SKIP'?skipReasonTag(skipReason):'';return `<button class="race-row ${cls}${isCurrent?' current-race':''}" type="button" data-rno="${Number(r.race_no)}"><span class="race-no">${Number(r.race_no)}R</span><span class="race-row-main"><strong>${stateLabel(state)}${categoryBadges(r,{compact:true})}${isCurrent?'<em class="current-mark">現在</em>':''}${reasonTag?`<em class="skip-reason-tag">${esc(reasonTag)}</em>`:''}</strong><small>${state==='ENTER'||state==='PUBLIC'?`投資 ${yen(r.record?.stake_total_yen||r.record?.prediction?.stake_total_yen)}`:state==='SETTLED'?(r.record?.settlement?.hit?'的中結果あり':'結果確定'):state==='PRIVATE'?'本日の無料公開対象外':hasRef?`参考予想あり｜${r.note||'購入対象外'}`:r.note||''}</small></span><span class="race-time ${urg.cls}">${right}<b>›</b></span></button>`}
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
function setupCustomerGuide(){
  const box=$('#customer-first-guide'),close=$('#customer-guide-close');
  if(!box||!close)return;
  let seen=false;try{seen=localStorage.getItem('one_boat_customer_guide_v1')==='1'}catch{}
  if(!seen&&savedViewMode()!=='pro'){box.hidden=false;document.body.classList.add('guide-open')}
  close.addEventListener('click',()=>{box.hidden=true;document.body.classList.remove('guide-open');try{localStorage.setItem('one_boat_customer_guide_v1','1')}catch{}});
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
    resetRefreshBurst();
    load().then(scheduleLiveRefresh);
  });
  pro?.addEventListener('click',()=>{
    closeAll();
    applyPageMode('pro');
    syncModeCopy();
    resetRefreshBurst();
    load().then(scheduleLiveRefresh);
  });
}
function raceDateForView(){return String(CURRENT_VENUE?.date||new Date(Date.now()+32400000).toISOString().slice(0,10)).slice(0,10)}
function proRaceUrl(r){
  const code=Number(CURRENT_VENUE?.code||0);
  const q=new URLSearchParams({date:raceDateForView(),venue:String(code),race:String(Number(r.race_no)),mode:'pro'});
  return `/analysis.html?${q.toString()}`;
}
function normalizeLegacyCutoffText(v){
  return String(v||'')
    .replace(/締切\s*1\s*分前/g,'締切5分前')
    .replace(/1\s*分前までに/g,'5分前までに');
}
function shortOfficialReason(v,max=118){
  const x=normalizeLegacyCutoffText(v).replace(/\s+/g,' ').trim();
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
  ACTIVE_RACE_NO=Number(rno);
  showRaceSheet();
  renderOpenRace(ACTIVE_RACE_NO);
  scheduleVenueSheetRefresh();
}
function raceDetail(r){
  const rec=r.record||{},p=rec.prediction||{},sett=rec.settlement||null,bets=betsOf(rec),referencePicks=referencePicksOf(rec);
  const stake=Number(rec.stake_total_yen??p.stake_total_yen??0);
  const reason=p.reason||p.skip_reason||rec.reason||'';
  const reasonShort=shortOfficialReason(reason);
  const proHref=proRaceUrl(r);
  const effectiveState=effectiveRaceState(r),state=stateLabel(effectiveState),strategyMode=String(p.strategy_mode||''),siteOnly=String(rec.visibility_code||'')==='SNS_PRIVATE'||String(rec.customer_visibility_label||'')==='サイト限定';
  let html=`<nav class="race-mode-switch" aria-label="表示モード">
    <span class="race-mode active">かんたん</span>
    <a class="race-mode" data-view-mode="pro" href="${proHref}">PRO</a>
  </nav>
  <section class="easy-decision ${stateClass(effectiveState)}">
    <small>ひと目で確認</small>
    <strong>${state}${siteOnly?`<em class="site-only-badge">サイト限定</em>`:''}${strategyMode?`<em class="strategy-mode-badge ${strategyMode==='BOX'?'box':''}">${esc(strategyMode==='BOX'?'BOX型AI':strategyMode)}</em>`:''}</strong>
    <p>${esc(effectiveState==='PRIVATE'?'本日の無料公開対象外':reasonShort||(publicRecord(rec)?'正式予想が公開されています。買い目と金額を確認してください。':r.note||'正式判定を表示しています。'))}</p>
  </section>
  <div class="detail-summary">
    <div><span>締切</span><strong>${timeText(r.deadline)}</strong></div>
    <div><span>判定</span><strong>${state}</strong></div>
    <div><span>投資</span><strong>${effectiveState==='PRIVATE'?'非公開':publicRecord(rec)?yen(stake):'購入なし'}</strong></div>
  </div>`;
  if(effectiveState==='WATCH'||effectiveState==='PENDING'){
    html+=`<div class="final-decision-note"><strong>最終判断</strong><span>必要データがそろい次第すぐ確定。遅くとも締切5分前までに最終判断します。</span></div>`;
  }

  if(publicRecord(rec)&&strategyMode==='BOX'){
    const b1=Array.isArray(p.box1_lanes)&&p.box1_lanes.length===3?p.box1_lanes.join('・'):'3艇';
    const b2=Array.isArray(p.box2_lanes)&&p.box2_lanes.length===3?p.box2_lanes.join('・'):'3艇';
    html+=`<div class="box-mode-note"><strong>BOX型AI</strong><span>${esc(b1)} BOX ＋ ${esc(b2)} BOX｜12点・総投資5,000円</span></div>`;
  }

  if(publicRecord(rec)){
    const pm=clubPortfolioModel(rec);
    const ticketHtml=pm.mode==='FOCUS'&&pm.tickets.length?pm.tickets.map(x=>`<span><b>${esc(x.ticket)}</b><em>BOOST ${yen(x.boost_yen)}${x.odds?` / ${x.odds.toFixed(1)}倍`:''}</em></span>`).join(''):'';
    html+=`<section class="club-portfolio-detail ${pm.mode.toLowerCase()}"><div class="club-portfolio-title"><span>CLUB PORTFOLIO β</span><strong>${esc(pm.label)}</strong></div><p>${esc(pm.reason)}</p><div class="club-portfolio-money"><div><small>通常</small><b>${yen(pm.baseStake)}</b></div><div><small>追加</small><b>${pm.extraStake?'+'+yen(pm.extraStake):'なし'}</b></div><div><small>参考総投資</small><b>${yen(pm.totalStake)}</b></div></div>${ticketHtml?`<div class="club-portfolio-focus-picks">${ticketHtml}</div>`:''}<small class="club-portfolio-caution">β検証中｜正式予想・通常配分は変更していません。</small></section>`;
  }

  if(effectiveState==='PRIVATE'){
    html+=`<section class="detail-block decision-message private-access-teaser"><div class="detail-label">ONE BOATの判断</div><h3>${clubCustomerLabel()}</h3><p>ONE BOATでは正式ENTER判定です。無料公開枠外のため、買い目・資金配分・PRO分析は現在非表示です。正式開始後はCLUBで正式ENTER全件を確認できます。</p><a class="private-access-open" href="/club.html?plan=club_monthly#club-waitlist">CLUB先行登録へ</a><small class="private-access-note">現在は準備中です。先行登録だけでは課金されません。</small></section>`;
  }else if(publicRecord(rec)){
    html+=`<section class="detail-block easy-bets">
      <div class="detail-label">これだけ見ればOK｜推奨買い目</div>
      ${bets.length?`<div class="bet-list">${bets.map(x=>`<div><strong>${esc(ticketOf(x))}</strong><span>${yen(stakeOf(x))}</span></div>`).join('')}</div>`:'<p>買い目を取得中です。</p>'}
    </section>`;
    if(reason)html+=`<section class="detail-block easy-reason"><div class="detail-label">ひとこと理由</div><p>${esc(reasonShort)}</p></section>`;
  }else{
    const noBuy=effectiveState==='SKIP'?'ONE BOATは購入しません':'ONE BOATは現時点で購入しません',reasonTag=effectiveState==='SKIP'?skipReasonTag(reason):'';
    html+=`<section class="detail-block decision-message no-buy-message"><div class="detail-label">ONE BOATの判断</div><h3>${state}${reasonTag?`<em class="detail-skip-tag">${esc(reasonTag)}</em>`:''}</h3><strong class="no-buy-badge">${noBuy}</strong><p>${esc(reasonShort||r.note||'条件が整うまで購入対象にはしません。')}</p></section>`;
    if(referencePicks.length){
      html+=`<section class="detail-block reference-prediction"><div class="detail-label">参考予想｜購入対象外</div><p class="reference-warning">予想順位の参考表示です。ONE BOATの推奨買い目ではありません。</p><div class="reference-pick-list">${referencePicks.map((x,i)=>`<div><span>${i+1}</span><strong>${esc(x.ticket)}</strong><em>${Number.isFinite(Number(x.probability))?`${(Number(x.probability)*100).toFixed(1)}%`:''}</em></div>`).join('')}</div></section>`;
    }
  }

  if(effectiveState!=='PRIVATE')html+=`<a class="pro-jump" data-view-mode="pro" href="${proHref}">
    <span><small>PRO MODE</small><strong>ONE BOATが判断に使った根拠を深掘り</strong></span><b>›</b>
  </a>`;

  if(sett){
    const tri=sett?.result?.trifecta||sett?.trifecta||'--',profit=Number(sett.profit_yen||0);
    html+=`<section class="detail-block result-block ${sett.hit?'hit':'miss'}"><div class="detail-label">RESULT</div><h3>${sett.hit?'的中':'不的中'}　3連単 ${esc(tri)}</h3><div class="result-grid"><div><span>投資</span><strong>${yen(stake)}</strong></div><div><span>払戻</span><strong>${yen(sett.payout_yen)}</strong></div><div><span>収支</span><strong class="${profit>=0?'positive':'negative'}">${profit>0?'+':''}${yen(profit)}</strong></div></div></section><button class="next-public-action" type="button" data-next-public>次の公開予想を見る <b>›</b></button>`;
  }
  return html;
}

function updateResultToggle(total=0,hits=null){
  const b=$('#result-toggle'),list=$('#result-list'),note=$('.transparency');
  if(!b)return;
  const n=Math.max(0,Number(total)||0),h=Number.isFinite(Number(hits))?Number(hits):null;
  b.dataset.total=String(n);
  b.dataset.hits=h===null?'':String(h);
  b.setAttribute('aria-expanded',String(RESULT_LIST_OPEN));
  const summary=n?('本日 '+n+'R'+(h===null?'':(' / '+h+'的中'))):'結果確定後に表示';
  b.innerHTML='<span><small>LIVE RESULTS</small><strong>'+(RESULT_LIST_OPEN?'結果を閉じる':'最新結果を見る')+'</strong><em>'+summary+'</em></span><i>'+(RESULT_LIST_OPEN?'▲':'▼')+'</i>';
  if(list)list.hidden=!RESULT_LIST_OPEN;
  if(note)note.hidden=!RESULT_LIST_OPEN;
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
    return LAST_OVERVIEW;
  }

  SITE_ONLY_KEYS=new Set((Array.isArray(o?.site_only_keys)?o.site_only_keys:[]).map(String).filter(Boolean));
  syncModeCopy();
  $('#today-date').textContent=formatJpDate(o.date);
  $('#today-count').textContent=Number.isFinite(Number(o.active_count))&&o.active_count!==null?`開催 ${Number(o.active_count)}場`:'開催情報更新中';
  const memberAll=await paidTodayEnter(o.date);
  if(Array.isArray(memberAll))MEMBER_TODAY_ENTER=memberAll;
  else if(MEMBER_SYNC_STATE!=='paid_error')MEMBER_TODAY_ENTER=null;
  const memberSyncBlocked=MEMBER_SYNC_STATE==='paid_error'&&!Array.isArray(MEMBER_TODAY_ENTER);
  const usingClub=Array.isArray(MEMBER_TODAY_ENTER);
  const memberAwareOverview=(usingClub||memberSyncBlocked)?mergeMemberOverview(o):o;
  renderVenues(memberAwareOverview.venues||[]);
  renderFreeStrip(o);
  renderCustomerOverview(o);
  const pro=savedViewMode()==='pro';
  const all=o.public_items||[];
  const allSettled=all.filter(x=>x?.settlement),liveSettled=allSettled.slice().sort((a,b)=>deadlineMinute(b.deadline||b.close_time)-deadlineMinute(a.deadline||a.close_time)).slice(0,6);
  if(liveSettled.length)$('#result-list').innerHTML=liveSettled.map(resultCard).join('');
  updateResultToggle(allSettled.length,allSettled.filter(x=>x?.settlement?.hit===true).length);
  const publicAccessRows=Array.isArray(o?.buyable_items)?o.buyable_items:all.filter(x=>!x?.settlement);
  const publicScopeByKey=new Map(publicAccessRows.map(x=>[memberRaceKey(x.race_date||o.date,x.venue_code,x.race_no),x]));
  const memberLive=usingClub?MEMBER_TODAY_ENTER.filter(memberRecordIsBuyable).sort((a,b)=>deadlineMinute(a.deadline)-deadlineMinute(b.deadline)).map(x=>{
    const key=memberRaceKey(x.race_date||o.date,x.venue_code,x.race_no),pub=publicScopeByKey.get(key);
    return pub?{...x,visibility_code:pub.visibility_code,customer_visibility_label:pub.customer_visibility_label}:{...x,visibility_code:'FULL_PRIVATE',club_only:true};
  }):[];
  const items=memberSyncBlocked?[]:usingClub?(pro?MEMBER_TODAY_ENTER.map(x=>{
    const key=memberRaceKey(x.race_date||o.date,x.venue_code,x.race_no),pub=publicScopeByKey.get(key);
    return pub?{...x,visibility_code:pub.visibility_code,customer_visibility_label:pub.customer_visibility_label}:{...x,visibility_code:'FULL_PRIVATE',club_only:true};
  }):memberLive):(pro?all:publicAccessRows);
  const clubToggle=$('#club-enter-toggle'),todayList=$('#today-list');
  if(memberSyncBlocked){
    const title=$('#public-title-text');if(title)title.textContent='CLUB 正式判定を再取得中';
    const lead=document.querySelector('.public-lead');if(lead)lead.textContent='誤った判定は表示せず、正式ENTERを再確認しています';
    $('#public-count').textContent='更新中';
    if(clubToggle){clubToggle.hidden=true;clubToggle.setAttribute('aria-expanded','false')}
    if(todayList)todayList.hidden=false;
  }else if(usingClub&&pro){
    const title=$('#public-title-text');if(title)title.textContent='CLUB 本日の正式ENTER';
    const lead=document.querySelector('.public-lead');if(lead)lead.textContent='無料公開枠外を含む正式ENTER全件';
    $('#public-count').textContent=`正式ENTER ${items.length}R`;
    const liveCount=MEMBER_TODAY_ENTER.filter(memberRecordIsBuyable).length,settledCount=MEMBER_TODAY_ENTER.filter(x=>x?.settlement).length;
    if(clubToggle){
      clubToggle.hidden=false;
      clubToggle.dataset.total=String(items.length);
      clubToggle.dataset.live=String(liveCount);
      clubToggle.dataset.settled=String(settledCount);
      clubToggle.setAttribute('aria-expanded',String(CLUB_LIST_OPEN));
      clubToggle.innerHTML=`<span><small>CLUB ENTER LIST</small><strong>${CLUB_LIST_OPEN?'一覧を閉じる':'正式ENTER一覧を見る'} <b>${items.length}R</b></strong><em>購入可能 ${liveCount}R / 結果確定 ${settledCount}R</em></span><i>${CLUB_LIST_OPEN?'▲':'▼'}</i>`;
    }
    if(todayList)todayList.hidden=!CLUB_LIST_OPEN;
  }else if(usingClub){
    CLUB_LIST_OPEN=false;
    const title=$('#public-title-text');if(title)title.textContent='いま買える予想';
    const lead=document.querySelector('.public-lead');if(lead)lead.textContent='CLUB会員：正式ENTERをリアルタイム表示';
    if(clubToggle){clubToggle.hidden=true;clubToggle.setAttribute('aria-expanded','false')}
    if(todayList)todayList.hidden=false;
    $('#public-count').textContent=`公開中 ${items.length}R`;
  }else{
    CLUB_LIST_OPEN=false;
    if(clubToggle){clubToggle.hidden=true;clubToggle.setAttribute('aria-expanded','false')}
    if(todayList)todayList.hidden=false;
    $('#public-count').textContent=o.public_count===null||o.public_count===undefined?'更新中':pro?`無料 ${Number(o.public_count)}/${Number(o.free_limit||30)}R`:`公開中 ${items.length}R`;
  }
  $('#today-list').innerHTML=memberSyncBlocked?'<div class="race-card"><div class="race-main"><strong>CLUB正式判定を再取得中</strong><small>取得完了まで「判定中」へ戻さず、正式データを再確認します。</small></div></div>':items.length?items.map(x=>publicRaceCard(x,{memberActive:usingClub})).join(''):(usingClub&&!pro?'<div class="race-card"><div class="race-main"><strong>現在、購入可能な正式ENTERはありません</strong><small>正式ENTERが確定するとここへ自動表示します</small></div></div>':usingClub?'<div class="race-card"><div class="race-main"><strong>本日の正式ENTERはまだありません</strong><small>正式ENTERが確定するとここへ自動表示します</small></div></div>':pro?'<div class="race-card"><div class="race-main"><strong>現在、公開対象なし</strong><small>対象レースが確定すると自動表示します</small></div></div>':'<div class="race-card"><div class="race-main"><strong>現在、公開中の予想はありません</strong><small>正式ENTERが確定するとここへ自動表示します</small></div></div>');
  renderClubPortfolioPlan(usingClub?MEMBER_TODAY_ENTER:all,{memberActive:usingClub});
  document.querySelectorAll('.race-card-button').forEach(b=>b.addEventListener('click',async()=>{
    if(b.dataset.access==='club'&&!usingClub){location.href='/club.html#club-waitlist';return}
    await openVenue(b.dataset.vcode);openRace(Number(b.dataset.rno))
  }));
  const nextCard=$('#next-decision-card');if(nextCard&&!nextCard.dataset.bound){nextCard.dataset.bound='1';nextCard.addEventListener('click',async()=>{const vc=nextCard.dataset.vcode,rn=Number(nextCard.dataset.rno);if(vc&&rn>=1&&rn<=12){await openVenue(vc);openRace(rn)}})}

  if(!AUTO_OPENED){
    const q=new URLSearchParams(location.search),vc=q.get('venue'),rn=Number(q.get('race'));
    if(vc&&rn>=1&&rn<=12){AUTO_OPENED=true;await openVenue(vc);openRace(rn)}
  }
  LAST_OVERVIEW=o;
  return o;
}

async function loadStats({force=false}={}){
  if(STATS_LOADING)return STATS_LOADING;
  const fresh=STATS&&Date.now()-STATS_FETCHED_AT<600000;
  if(fresh&&!force){const key=document.querySelector('.period.active')?.dataset.period||'today';renderMetrics(key);$('#result-list').innerHTML=(STATS.latest||[]).slice(0,6).map(resultCard).join('')||$('#result-list').innerHTML;return STATS}
  STATS_LOADING=(async()=>{
    try{
      const r=await fetch(FREE_STATS_URL,{cache:'no-store'});
      if(!r.ok)throw new Error('stats');
      const next=await r.json();
      if(!next?.ok)throw new Error('stats');
      STATS=next;STATS_FETCHED_AT=Date.now();
      renderMetrics(document.querySelector('.period.active')?.dataset.period||'today');
      $('#result-list').innerHTML=(next.latest||[]).slice(0,6).map(resultCard).join('')||'<div class="race-card"><div class="race-main"><strong>公開結果はまだありません</strong><small>結果確定後に表示します。</small></div></div>';
      updateResultToggle(next?.today?.races||0,next?.today?.hits);
      return next;
    }catch{
      if(!STATS){
        $('#m-roi').textContent='--';$('#m-hit').textContent='--';$('#m-profit').textContent='--';$('#m-races').textContent='結果集計を更新中';
        $('#result-list').innerHTML='<div class="race-card"><div class="race-main"><strong>結果集計を更新中</strong><small>本日の予想・場情報はそのまま確認できます。</small></div></div>';
      }
      return STATS;
    }finally{STATS_LOADING=null}
  })();
  return STATS_LOADING;
}
function setupLazyStats(){
  const targets=['#performance','#results'].map($).filter(Boolean);
  if(!targets.length)return;
  if(location.hash==='#performance'||location.hash==='#results')loadStats();
  if('IntersectionObserver'in window){
    const io=new IntersectionObserver(entries=>{
      if(entries.some(e=>e.isIntersecting)){loadStats();targets.forEach(t=>io.unobserve(t))}
    },{rootMargin:'450px 0px'});
    targets.forEach(t=>io.observe(t));
  }else loadStats();
}
document.querySelectorAll('[data-performance-scope]').forEach(b=>b.addEventListener('click',async()=>{
  PERFORMANCE_SCOPE=b.dataset.performanceScope==='club'?'club':'free';
  if(!STATS)await loadStats();
  renderMetrics(document.querySelector('.period.active')?.dataset.period||'today');
}));
document.querySelectorAll('.period').forEach(b=>b.addEventListener('click',async()=>{document.querySelectorAll('.period').forEach(x=>x.classList.remove('active'));b.classList.add('active');if(!STATS)await loadStats();renderMetrics(b.dataset.period);renderBandPerformance(b.dataset.period)}));
$('#venue-close').addEventListener('click',closeAll);$('#race-back').addEventListener('click',showVenueSheet);$('#sheet-backdrop').addEventListener('click',closeAll);document.addEventListener('keydown',e=>{if(e.key==='Escape')closeAll()});
if(NOTE_URL){const b=$('#note-btn');if(b){b.classList.remove('disabled');b.textContent='ONE BOAT CLUBへ';b.addEventListener('click',()=>location.href=NOTE_URL)}}
const resultToggle=$('#result-toggle');
if(resultToggle)resultToggle.addEventListener('click',()=>{
  RESULT_LIST_OPEN=!RESULT_LIST_OPEN;
  const total=Number(resultToggle.dataset.total||0),hitsRaw=resultToggle.dataset.hits,hits=hitsRaw===''?null:Number(hitsRaw);
  updateResultToggle(total,hits);
});
const clubEnterToggle=$('#club-enter-toggle');
if(clubEnterToggle)clubEnterToggle.addEventListener('click',()=>{
  CLUB_LIST_OPEN=!CLUB_LIST_OPEN;
  const list=$('#today-list'),total=Number(clubEnterToggle.dataset.total||0),live=Number(clubEnterToggle.dataset.live||0),settled=Number(clubEnterToggle.dataset.settled||0);
  if(list)list.hidden=!CLUB_LIST_OPEN;
  clubEnterToggle.setAttribute('aria-expanded',String(CLUB_LIST_OPEN));
  clubEnterToggle.innerHTML=`<span><small>CLUB ENTER LIST</small><strong>${CLUB_LIST_OPEN?'一覧を閉じる':'正式ENTER一覧を見る'} <b>${total}R</b></strong><em>購入可能 ${live}R / 結果確定 ${settled}R</em></span><i>${CLUB_LIST_OPEN?'▲':'▼'}</i>`;
});
document.querySelectorAll('[data-venue-browse]').forEach(b=>b.addEventListener('click',()=>{
  VENUE_BROWSE_MODE=b.dataset.venueBrowse==='deadline'?'deadline':'venues';
  syncVenueBrowseMode();
}));
const venueToggle=$('#venue-toggle');
if(venueToggle)venueToggle.addEventListener('click',()=>{
  if(savedViewMode()==='pro')return;
  const grid=$('#venue-grid'),open=grid.classList.toggle('show-all');
  venueToggle.setAttribute('aria-expanded',String(open));
  venueToggle.textContent=open?'開催中だけ表示':'全24場を見る';
});
function resetRefreshBurst(){REFRESH_BURST_LEFT=2}
function nextRefreshDelay(o=LAST_OVERVIEW){
  const progress=freeProgressModel(o||{});
  if(progress.available&&progress.complete)return 300000;
  const left=Number(o?.next_decision?.minutes_left);
  if(Number.isFinite(left)&&left>=0&&left<=10)return 30000+Math.floor(Math.random()*15000);
  if(Number.isFinite(left)&&left>10&&left<=20)return 45000+Math.floor(Math.random()*15000);
  if(REFRESH_BURST_LEFT>0){REFRESH_BURST_LEFT--;return 60000+Math.floor(Math.random()*12000)}
  const base=savedViewMode()==='pro'?180000:240000;
  return base+Math.floor(Math.random()*30000);
}
function scheduleLiveRefresh(o=LAST_OVERVIEW){
  if(LOAD_TIMER){clearTimeout(LOAD_TIMER);LOAD_TIMER=null}
  if(document.hidden)return;
  const wait=nextRefreshDelay(o);
  LOAD_TIMER=setTimeout(async()=>{const next=await load();scheduleLiveRefresh(next)},wait);
}
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){
    if(LOAD_TIMER){clearTimeout(LOAD_TIMER);LOAD_TIMER=null}
    stopVenueSheetRefresh();
    return;
  }
  resetRefreshBurst();
  syncMemberStatus({force:true});
  load().then(scheduleLiveRefresh);
  if(CURRENT_VENUE&&!$('#sheet-backdrop')?.hidden)refreshOpenVenue().then(scheduleVenueSheetRefresh);
});
setupPageMode();
setupCustomerGuide();
setupLazyStats();
syncMemberStatus();
load().then(scheduleLiveRefresh);
