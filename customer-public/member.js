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
const q=s=>document.querySelector(s);
const WAITLIST_API='https://imhzjlxbnovjvqlyawmg.supabase.co/functions/v1/one-boat-club-waitlist';
const fmtDate=v=>{if(!v)return'—';const d=new Date(v);if(Number.isNaN(d.getTime()))return'—';return new Intl.DateTimeFormat('ja-JP',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Tokyo'}).format(d)};
const planName=p=>({guest:'未ログイン',unknown:'確認中',free:'無料会員',day_pass:'1日PASS',club_monthly:'ONE BOAT CLUB',staff:'運営アカウント'})[p]||p||'確認中';
const statusName=s=>({active:'有効',cancel_at_period_end:'解約予約済み',cancel_scheduled:'解約予約済み',expired:'期限切れ',payment_failed:'決済エラー',inactive:'無効',unavailable:'状態確認中',staff:'運営アクセス'})[s]||s||'状態確認中';
function showMessage(el,text,type='error'){if(!el)return;el.textContent=text;el.className=`message show ${type}`}
async function api(path,options={}){const r=await fetch(path,{credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json',...(options.headers||{})},...options});const d=await r.json().catch(()=>({}));return{r,d}}
async function getSession(){const r=await fetch('/api/member/session',{credentials:'same-origin',cache:'no-store'});return r.json().catch(()=>({ok:false,logged_in:false}))}
function safeNext(){const p=new URLSearchParams(location.search).get('next');return p&&p.startsWith('/')&&!p.startsWith('//')?p:'/mypage.html'}

async function setupSignup(){const f=q('#signup-form'),msg=q('#form-message');if(!f)return;const s=await getSession();if(s.logged_in){location.replace('/mypage.html');return}f.addEventListener('submit',async e=>{e.preventDefault();const btn=q('#submit-btn');btn.disabled=true;const body={email:q('#email').value.trim(),password:q('#password').value,age20:q('#age20').checked,terms:q('#terms').checked,privacy:q('#privacy').checked};const{r,d}=await api('/api/auth/signup',{method:'POST',body:JSON.stringify(body)});btn.disabled=false;if(!r.ok){showMessage(msg,d.message||'登録できませんでした。');return}if(d.confirmation_required){showMessage(msg,d.message||'確認メールを送信しました。','ok');f.reset();return}location.href='/mypage.html'})}
async function setupLogin(){const f=q('#login-form'),msg=q('#form-message');if(!f)return;const s=await getSession();if(s.logged_in){location.replace(safeNext());return}f.addEventListener('submit',async e=>{e.preventDefault();const btn=q('#submit-btn');btn.disabled=true;const{r,d}=await api('/api/auth/login',{method:'POST',body:JSON.stringify({email:q('#email').value.trim(),password:q('#password').value})});btn.disabled=false;if(!r.ok){showMessage(msg,d.message||'ログインできませんでした。');return}location.href=safeNext()})}
async function startCheckout(plan,button,msg){button.disabled=true;const{r,d}=await api('/api/member/checkout-intent',{method:'POST',body:JSON.stringify({plan})});button.disabled=false;if(r.status===401){location.href=`/login?next=${encodeURIComponent('/club.html?buy='+plan)}`;return}if(!r.ok){showMessage(msg,d.message||'購入準備に失敗しました。');return}if(d.url)location.href=d.url}
async function setupPlanButtons(){const buttons=[...document.querySelectorAll('[data-buy-plan]')];if(!buttons.length)return;const msg=q('#plan-message');const s=await getSession();if(s.logged_in){document.querySelectorAll('[data-member-link]').forEach(a=>{a.textContent='マイページ';a.href='/mypage.html'})}if(s.plan==='staff'){buttons.forEach(b=>{b.disabled=true;b.style.display='none'});showMessage(msg,'運営アカウントのため購入は不要です。','ok');return}for(const b of buttons)b.addEventListener('click',()=>startCheckout(b.dataset.buyPlan,b,msg));const requested=new URLSearchParams(location.search).get('buy');if(requested&&['day_pass','club_monthly'].includes(requested)&&s.logged_in){const b=document.querySelector(`[data-buy-plan="${requested}"]`);if(b)startCheckout(requested,b,msg)}}
async function openCancelPortal(button,msg){if(!confirm('月額ONE BOAT CLUBの解約手続きへ進みます。決済管理画面で次回更新を停止できます。'))return;button.disabled=true;const{r,d}=await api('/api/member/billing-portal',{method:'POST',body:'{}'});button.disabled=false;if(!r.ok){showMessage(msg,d.message||'解約画面を開けませんでした。');return}if(d.url)location.href=d.url}
function waitlistAttribution(){
  try{
    const p=new URLSearchParams(location.search);
    return{
      source:p.get('utm_source')||sessionStorage.getItem('ob_utm_source')||'direct',
      campaign:p.get('utm_campaign')||sessionStorage.getItem('ob_utm_campaign')||'none',
      content:p.get('utm_content')||sessionStorage.getItem('ob_utm_content')||'club_waitlist'
    };
  }catch{return{source:'direct',campaign:'none',content:'club_waitlist'}}
}
async function setupWaitlist(){
  const form=q('#waitlist-form');
  if(!form)return;
  const email=q('#waitlist-email'),plan=q('#waitlist-plan'),msg=q('#waitlist-message'),submit=q('#waitlist-submit');
  try{
    const session=await getSession();
    if(session?.logged_in&&session?.email&&!email.value)email.value=session.email;
    if(session?.logged_in)document.querySelectorAll('[data-member-link]').forEach(a=>{a.textContent='マイページ';a.href='/mypage.html'});
  }catch{}
  try{
    const qp=new URLSearchParams(location.search);
    const requested=qp.get('plan')||qp.get('buy');
    if(plan&&['day_pass','club_monthly','either'].includes(requested))plan.value=requested;
    if(requested||location.hash==='#club-waitlist')setTimeout(()=>q('#club-waitlist')?.scrollIntoView({behavior:'smooth',block:'start'}),120);
  }catch{}
  document.querySelectorAll('[data-waitlist-plan]').forEach(b=>b.addEventListener('click',()=>{
    if(plan&&['day_pass','club_monthly','either'].includes(b.dataset.waitlistPlan))plan.value=b.dataset.waitlistPlan;
    q('#club-waitlist')?.scrollIntoView({behavior:'smooth',block:'start'});
    setTimeout(()=>email?.focus(),350);
  }));
  form.addEventListener('submit',async e=>{
    e.preventDefault();
    submit.disabled=true;
    const a=waitlistAttribution();
    const body={
      email:email.value.trim(),
      requested_plan:plan.value,
      age20:q('#waitlist-age20')?.checked===true,
      privacy:q('#waitlist-privacy')?.checked===true,
      website:q('#waitlist-website')?.value||'',
      source:a.source,
      campaign:a.campaign,
      content:a.content
    };
    try{
      const r=await fetch(WAITLIST_API,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
      const d=await r.json().catch(()=>({}));
      if(!r.ok){showMessage(msg,d.message||'先行登録できませんでした。');return}
      showMessage(msg,d.message||'先行登録が完了しました。','ok');
      submit.textContent='先行登録済み';
      try{localStorage.setItem('ob_club_waitlist_registered','1')}catch{}
    }catch{
      showMessage(msg,'通信に失敗しました。時間をおいて再度お試しください。');
    }finally{
      submit.disabled=false;
    }
  });
}

async function setupMypage(){if(!q('#mypage'))return;const s=await getSession();if(!s.logged_in){location.replace('/login?next=%2Fmypage.html');return}q('#account-email').textContent=s.email||'—';q('#plan-name').textContent=planName(s.plan);q('#member-status').textContent=statusName(s.status);q('#status-text').textContent=s.cancel_at_period_end?'期間終了時に解約予定':statusName(s.status);q('#expiry-label').textContent=s.plan==='staff'?'運営アクセス':s.plan==='club_monthly'?'次回更新 / 利用期限':'有効期限';q('#expiry-value').textContent=s.plan==='staff'?'無期限':fmtDate(s.next_billing_at||s.access_expires_at);const msg=q('#mypage-message');if(s.status==='unavailable')showMessage(msg,'会員状態を一時的に確認できません。有料機能は安全のため解放していません。');const paid=q('#paid-entry');if(paid)paid.style.display=s.paid_access?'flex':'none';const cancel=q('#cancel-subscription');if(cancel){cancel.style.display=s.plan==='club_monthly'&&s.status==='active'&&!s.cancel_at_period_end?'flex':'none';cancel.addEventListener('click',()=>openCancelPortal(cancel,msg))}q('#logout').addEventListener('click',async()=>{await api('/api/auth/logout',{method:'POST',body:'{}'});location.href='/login'})}
const CLUB_VENUES=['桐生','戸田','江戸川','平和島','多摩川','浜名湖','蒲郡','常滑','津','三国','びわこ','住之江','尼崎','鳴門','丸亀','児島','宮島','徳山','下関','若松','芦屋','福岡','唐津','大村'];
const CLUB_PERSONAS={
  stable:{person:'SORA',role:'安定派'},
  balanced:{person:'REN',role:'中配当派'},
  high:{person:'KAI',role:'高配当派'},
  box:{person:'JIN',role:'BOX派'}
};
let CLUB_TEAM_ROWS=[];
let CLUB_PLAN_MODE='all';
const clubEsc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const clubYen=v=>Math.round(Number(v||0)).toLocaleString('ja-JP')+'円';
function clubJstDate(){return new Date(Date.now()+32400000).toISOString().slice(0,10)}
function clubPortfolio(r){return r?.persona_portfolio||r?.prediction?.persona_portfolio||null}
function clubVenue(r){return CLUB_VENUES[Number(r?.venue_code||0)-1]||('場'+String(r?.venue_code||'--'))}
function clubPersonRows(r){
  const p=clubPortfolio(r);if(!p?.applied)return[];
  return Object.keys(CLUB_PERSONAS).map(key=>({key,...CLUB_PERSONAS[key],data:p?.[key]||{}}));
}
function clubRaceConsensus(r){
  const map=new Map();
  clubPersonRows(r).forEach(x=>{
    if(x.data?.status!=='BUY')return;
    (Array.isArray(x.data?.picks)?x.data.picks:[]).forEach(p=>{
      const ticket=String(p?.ticket||'');if(!ticket)return;
      if(!map.has(ticket))map.set(ticket,{ticket,people:[],stake_yen:0,odds:[]});
      const v=map.get(ticket);v.people.push(x.person);v.stake_yen+=Number(p?.stake_yen||0);if(Number.isFinite(Number(p?.odds)))v.odds.push(Number(p.odds));
    });
  });
  return[...map.values()].filter(x=>x.people.length>=2).sort((a,b)=>b.people.length-a.people.length||b.stake_yen-a.stake_yen);
}
function renderClubTeam(){
  const rows=CLUB_TEAM_ROWS,summary=q('#club-team-summary'),list=q('#club-team-races'),count=q('#club-team-count');
  if(!summary||!list)return;
  const buyRows=rows.filter(r=>clubPortfolio(r)?.has_any_pick===true),skipRows=rows.filter(r=>clubPortfolio(r)?.applied===true&&clubPortfolio(r)?.has_any_pick!==true);
  const consensusTotal=rows.reduce((n,r)=>n+clubRaceConsensus(r).length,0);
  if(count)count.textContent=buyRows.length+'R予想 / '+skipRows.length+'R見送り';
  summary.innerHTML=
    '<div class="club-summary-cell"><span>予想あり</span><strong>'+buyRows.length+'R</strong></div>'+
    '<div class="club-summary-cell"><span>全員見送り</span><strong>'+skipRows.length+'R</strong></div>'+
    '<div class="club-summary-cell"><span>一致買い目</span><strong>'+consensusTotal+'件</strong></div>';
  const show=[...rows].sort((a,b)=>{
    const ab=clubPortfolio(a)?.has_any_pick===true?1:0,bb=clubPortfolio(b)?.has_any_pick===true?1:0;
    return bb-ab||Number(a.venue_code)-Number(b.venue_code)||Number(a.race_no)-Number(b.race_no);
  }).slice(0,16);
  if(!show.length){list.innerHTML='<div class="club-loading">4人の正式判断はまだありません。</div>';return}
  list.innerHTML=show.map(r=>{
    const pp=clubPortfolio(r),people=clubPersonRows(r),buy=people.filter(x=>x.data?.status==='BUY'),con=clubRaceConsensus(r),top=con[0];
    return '<article class="team-race-card">'+
      '<div class="team-race-head"><strong>'+clubEsc(clubVenue(r))+' '+Number(r.race_no||0)+'R</strong><span class="'+(buy.length?'':'skip')+'">'+(buy.length?buy.length+'/4人 BUY':'4人全員 SKIP')+'</span></div>'+
      '<div class="team-race-people">'+people.map(x=>'<div class="team-person '+(x.data?.status==='BUY'?'':'skip')+'"><b>'+clubEsc(x.person)+'</b><em>'+(x.data?.status==='BUY'?'BUY':'SKIP')+'</em><small>'+(x.data?.status==='BUY'?(Number(x.data?.point_count||0)+'点 / '+clubYen(x.data?.stake_total_yen)):'見送り')+'</small></div>').join('')+'</div>'+
      '<div class="team-race-consensus">'+(top?'<strong>'+clubEsc(top.ticket)+'</strong> が '+top.people.length+'人一致（'+clubEsc(top.people.join('・'))+'）':'一致買い目なし')+'</div>'+
    '</article>';
  }).join('');
}
function renderClubConsensus(){
  const root=q('#club-consensus');if(!root)return;
  const all=[];
  CLUB_TEAM_ROWS.forEach(r=>clubRaceConsensus(r).forEach(x=>all.push({...x,race_key:r.race_key,venue:clubVenue(r),race_no:Number(r.race_no||0)})));
  all.sort((a,b)=>b.people.length-a.people.length||b.stake_yen-a.stake_yen);
  if(!all.length){root.innerHTML='<div class="club-loading">現在、2人以上が一致した買い目はありません。</div>';return}
  root.innerHTML=all.slice(0,12).map(x=>'<article class="consensus-card">'+
    '<div class="consensus-head"><strong>'+clubEsc(x.venue)+' '+x.race_no+'R</strong><span>'+x.people.length+'/4人 一致</span></div>'+
    '<div class="consensus-ticket"><b>'+clubEsc(x.ticket)+'</b><em>合算 '+clubYen(x.stake_yen)+'</em></div>'+
    '<div class="consensus-people">'+clubEsc(x.people.join(' × '))+'</div>'+
  '</article>').join('');
}
function clubPlanRows(mode){
  const map=new Map(),raceSet=new Set();
  const add=(r,ticket,stake,person)=>{
    const key=String(r.race_key||'')+'|'+ticket;
    if(!map.has(key))map.set(key,{race_key:r.race_key,venue:clubVenue(r),race_no:Number(r.race_no||0),ticket,stake_yen:0,people:[]});
    const x=map.get(key);x.stake_yen+=Number(stake||0);if(person&&!x.people.includes(person))x.people.push(person);raceSet.add(String(r.race_key||key));
  };
  CLUB_TEAM_ROWS.forEach(r=>{
    const people=clubPersonRows(r);
    if(mode==='consensus'){
      clubRaceConsensus(r).forEach(x=>add(r,x.ticket,x.stake_yen,x.people.join('・')));
      return;
    }
    people.forEach(x=>{
      if(x.data?.status!=='BUY')return;
      if(mode!=='all'&&mode!==x.key)return;
      (Array.isArray(x.data?.picks)?x.data.picks:[]).forEach(p=>add(r,String(p?.ticket||''),Number(p?.stake_yen||0),x.person));
    });
  });
  return{rows:[...map.values()].filter(x=>x.ticket).sort((a,b)=>b.stake_yen-a.stake_yen),races:raceSet.size};
}
function renderClubPlan(){
  const root=q('#club-plan-summary');if(!root)return;
  const x=clubPlanRows(CLUB_PLAN_MODE),total=x.rows.reduce((s,v)=>s+v.stake_yen,0);
  const labels={all:'4人すべてのBUYを合算',consensus:'2人以上一致だけ',stable:'SORAだけ',balanced:'RENだけ',high:'KAIだけ',box:'JINだけ'};
  root.innerHTML='<div class="team-plan-box">'+
    '<div class="team-plan-top"><div><span>参考総投資</span><strong>'+clubYen(total)+'</strong></div><div><span>対象</span><strong>'+x.races+'R / '+x.rows.length+'点</strong></div></div>'+
    '<small>'+clubEsc(labels[CLUB_PLAN_MODE]||'')+'。同一レース・同一買い目は金額を合算しています。</small>'+
    (x.rows.length?'<div class="team-plan-picks">'+x.rows.slice(0,10).map(v=>'<div class="team-plan-pick"><span>'+clubEsc(v.venue)+' '+v.race_no+'R　<b>'+clubEsc(v.ticket)+'</b></span><strong>'+clubYen(v.stake_yen)+'</strong></div>').join('')+'</div>':'<div class="club-loading">この条件に該当する買い目はありません。</div>')+
  '</div>';
}
function setupClubPlanTabs(){
  document.querySelectorAll('[data-club-plan]').forEach(b=>b.addEventListener('click',()=>{
    CLUB_PLAN_MODE=String(b.dataset.clubPlan||'all');
    document.querySelectorAll('[data-club-plan]').forEach(x=>x.classList.toggle('active',x===b));
    renderClubPlan();
  }));
}
async function loadClubTeam(){
  const date=clubJstDate();
  const{r,d}=await api('/api/member/today-team?date='+encodeURIComponent(date));
  if(!r.ok||!d?.ok)throw new Error(d?.message||'team');
  CLUB_TEAM_ROWS=Array.isArray(d.records)?d.records:[];
  renderClubTeam();renderClubConsensus();renderClubPlan();
}
async function setupPremium(){
  if(!q('#premium-page'))return;
  const s=await getSession();
  if(!s.logged_in||!s.paid_access)return;
  q('#premium-plan').textContent=planName(s.plan);
  q('#premium-expiry').textContent=s.plan==='staff'?'運営アクセス':fmtDate(s.next_billing_at||s.access_expires_at);
  setupClubPlanTabs();
  try{await loadClubTeam()}catch{
    const msg='<div class="club-loading">CLUBデータを更新しています。少し時間をおいて再読み込みしてください。</div>';
    if(q('#club-team-summary'))q('#club-team-summary').innerHTML=msg;
    if(q('#club-consensus'))q('#club-consensus').innerHTML=msg;
    if(q('#club-plan-summary'))q('#club-plan-summary').innerHTML=msg;
  }
}

document.addEventListener('DOMContentLoaded',()=>{setupSignup();setupLogin();setupPlanButtons();setupWaitlist();setupMypage();setupPremium()});
