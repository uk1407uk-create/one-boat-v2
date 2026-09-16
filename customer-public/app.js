const NOTE_URL='';
const $=s=>document.querySelector(s);
const yen=n=>`${Math.round(Number(n||0)).toLocaleString('ja-JP')}円`;
const pct=n=>Number.isFinite(Number(n))?`${Number(n).toFixed(1)}%`:'--';
let STATS=null;
function setTone(el,n){el.classList.remove('positive','negative'); if(Number(n)>0)el.classList.add('positive'); if(Number(n)<0)el.classList.add('negative');}
function renderMetrics(key='today'){
  const x=STATS?.[key]; if(!x)return;
  $('#m-roi').textContent=pct(x.roi); setTone($('#m-roi'),x.roi-100);
  $('#m-hit').textContent=pct(x.hit_rate);
  $('#m-profit').textContent=`${x.profit_yen>0?'+':''}${yen(x.profit_yen)}`; setTone($('#m-profit'),x.profit_yen);
  $('#m-races').textContent=`${x.races}R / ${x.hits}的中`;
}
function deadlineText(v){ if(!v)return '最終予想確定'; const m=String(v).match(/(\d{1,2}:\d{2})/); return m?`締切 ${m[1]}`:'最終予想確定'; }
function raceCard(x,i){
  const settled=x.status==='SETTLED'&&x.settlement;
  const status=settled?(x.settlement.hit?'的中':'不的中'):'予想確定';
  const cls=settled?(x.settlement.hit?'hit':'miss'):'locked';
  const sub=settled?`${x.settlement.trifecta||'結果反映済'} ・ ${x.settlement.hit?`払戻 ${yen(x.settlement.payout_yen)}`:'結果公開'}`:deadlineText(x.deadline);
  const hidden=i>=3?' race-hidden':'';
  return `<article class="race-card${hidden}"><div class="race-main"><strong>${x.venue_name} ${x.race_no}R</strong><small>${sub}</small></div><span class="status ${cls}">${status}</span></article>`;
}
function resultCard(x){
  const roi=x.stake_yen?x.payout_yen/x.stake_yen*100:0;
  return `<article class="result-card"><div class="result-main"><strong>${x.venue_name} ${x.race_no}R <span style="color:${x.hit?'#44e3b1':'#ff8199'}">${x.hit?'●':'×'}</span></strong><small>${x.race_date} ・ ${x.trifecta||'結果'} ・ 回収 ${pct(roi)}</small></div><div style="text-align:right"><strong class="${x.profit_yen>=0?'positive':'negative'}" style="font-size:14px">${x.profit_yen>0?'+':''}${yen(x.profit_yen)}</strong></div></article>`;
}
async function load(){
  try{
    const [s,t]=await Promise.all([fetch('/api/public/stats',{cache:'no-store'}).then(r=>r.json()),fetch('/api/public/today',{cache:'no-store'}).then(r=>r.json())]);
    STATS=s; renderMetrics('today');
    $('#result-list').innerHTML=(s.latest||[]).slice(0,5).map(resultCard).join('')||'<div class="race-card"><div class="race-main"><strong>集計中</strong><small>結果が反映されると表示します</small></div></div>';
    const items=t.items||[]; $('#today-count').textContent=`ENTER ${items.length}R`;
    $('#today-list').innerHTML=items.length?items.slice(0,6).map(raceCard).join(''):'<div class="race-card"><div class="race-main"><strong>現在、公開対象なし</strong><small>対象レースが確定すると自動表示します</small></div></div>';
    $('#paywall').hidden=items.length<=3;
  }catch(e){
    $('#today-count').textContent='更新待ち';
    $('#today-list').innerHTML='<div class="race-card"><div class="race-main"><strong>データ更新中</strong><small>少し時間をおいて再読み込みしてください</small></div></div>';
    $('#result-list').innerHTML='<div class="race-card"><div class="race-main"><strong>結果を取得中</strong><small>自動で更新されます</small></div></div>';
  }
}
document.querySelectorAll('.period').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.period').forEach(x=>x.classList.remove('active'));b.classList.add('active');renderMetrics(b.dataset.period)}));
if(NOTE_URL){const b=$('#note-btn');b.classList.remove('disabled');b.textContent='noteでONE BOAT CLUBへ';b.addEventListener('click',()=>location.href=NOTE_URL)}
load(); setInterval(load,30000);
