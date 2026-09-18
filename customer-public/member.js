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
async function setupPremium(){if(!q('#premium-page'))return;const s=await getSession();if(!s.logged_in||!s.paid_access)return;q('#premium-plan').textContent=planName(s.plan);q('#premium-expiry').textContent=s.plan==='staff'?'運営アクセス':fmtDate(s.next_billing_at||s.access_expires_at)}

document.addEventListener('DOMContentLoaded',()=>{setupSignup();setupLogin();setupPlanButtons();setupWaitlist();setupMypage();setupPremium()});
