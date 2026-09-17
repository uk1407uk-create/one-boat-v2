const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const params=new URLSearchParams(location.search);
const CODE=Number(params.get('code'));
const RACE=Number(params.get('race'));
let DATA=null;
let MY={first:null,second:null,third:null};

function value(v,suffix=''){return v===null||v===undefined||v===''?'—':`${v}${suffix}`}
function fixed(v,d=2,suffix=''){if(v===null||v===undefined||!Number.isFinite(Number(v)))return'—';return `${Number(v).toFixed(d)}${suffix}`}
function pct(v){return v===null||v===undefined||!Number.isFinite(Number(v))?'—':`${Number(v).toFixed(1)}%`}
function hm(v){const m=String(v||'').match(/(\d{1,2}:\d{2})/);return m?m[1]:'—'}
function dateJp(v){if(!v)return'—';const m=String(v).match(/(\d{4})-(\d{2})-(\d{2})/);return m?`${Number(m[2])}/${Number(m[3])}`:String(v)}
function updated(v){if(!v)return'—';const d=new Date(v);if(Number.isNaN(d.getTime()))return'—';return new Intl.DateTimeFormat('ja-JP',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Tokyo'}).format(d)}
function stateLabel(s){return {PUBLIC:'予想公開',WATCH:'様子見',SKIP:'見送り',SETTLED:'結果確定',FINISHED:'本日終了',CLOSED:'終了',NOEVENT:'非開催',PENDING:'未判定'}[s]||'未判定'}
function stateClass(s){return {PUBLIC:'live',WATCH:'watch',SKIP:'skip',SETTLED:'settled',FINISHED:'idle',CLOSED:'idle',NOEVENT:'idle',PENDING:'pending'}[s]||'pending'}
function laneBadge(n){return `<span class="lane-box lane-${n}">${n}</span>`}
function courseText(r){if(r.course===null||r.course===undefined)return'—';return `${r.course}コース`}
function stText(v){if(v===null||v===undefined||!Number.isFinite(Number(v)))return'—';const n=Number(v);return n<0?`F${Math.abs(n).toFixed(2)}`:n.toFixed(2)}

function renderRacers(xs){$('#racer-list').innerHTML=(xs||[]).map(r=>`<article class="racer-card">
  <div class="racer-main">${laneBadge(r.lane)}<div class="racer-name"><strong>${esc(r.name||'選手情報待ち')}</strong><small>${r.racer_id?`${esc(r.racer_id)}番`:'登録番号 —'} ・ ${courseText(r)}</small></div><span class="racer-grade">${esc(r.grade||'—')}</span></div>
  <div class="racer-stats"><div><span>全国勝率</span><b>${fixed(r.national_win_rate,2)}</b></div><div><span>当地勝率</span><b>${fixed(r.local_win_rate,2)}</b></div><div><span>平均ST</span><b>${fixed(r.average_st,2)}</b></div><div><span>コースST</span><b>${fixed(r.course_st,3)}</b></div></div>
  <div class="equipment-row"><div><span>モーター</span><strong>${value(r.motor_number,'号')} / 2連 ${pct(r.motor_top2_rate)}</strong></div><div><span>ボート</span><strong>${value(r.boat_number,'号')} / 2連 ${pct(r.boat_top2_rate)}</strong></div><div><span>コース標本</span><strong>${r.course_sample===null||r.course_sample===undefined?'連携待ち':`${r.course_sample}走`}</strong></div></div>
</article>`).join('')||'<div class="empty-card"><strong>選手情報を取得できません</strong><p>データ更新後に再度確認してください。</p></div>'}

function renderExhibition(xs,a){$('#exhibition-list').innerHTML=`<div class="ex-head"><span>艇</span><span>進入</span><span>展示ST</span><span>展示タイム</span></div>${(xs||[]).map(r=>`<div class="ex-row">${laneBadge(r.lane)}<span>${r.course??'—'}</span><span>${stText(r.start_exhibition_st)}</span><span>${fixed(r.exhibition_time,2)}</span><div class="ex-sub"><div><span>オリジナル</span><b>${r.original_exhibition??'—'}</b></div><div><span>一周</span><b>${r.lap_time??'—'}</b></div><div><span>半周</span><b>${r.half_lap_time??'—'}</b></div><div><span>まわり足</span><b>${r.turn_time??'—'}</b></div></div></div>`).join('')}`;
  const notes=[];
  if(a?.original_exhibition==='not_provided')notes.push('江戸川はオリジナル展示の提供対象外です。');
  else if(a?.original_exhibition==='not_connected')notes.push('オリジナル展示は現在データ連携準備中です。');
  if(a?.lap_time==='not_connected'||a?.half_lap_time==='not_connected'||a?.turn_time==='not_connected')notes.push('一周タイム・半周タイム・まわり足は取得元の連携後に表示します。');
  $('#exhibition-note').textContent=notes.join(' ');
  const live=(xs||[]).some(r=>r.exhibition_time!==null||r.start_exhibition_st!==null);
  $('#exhibition-status').textContent=live?'取得済み項目あり':'直前データ待ち';
}

function renderSurface(s,a){const cards=[['天気',s?.weather|| (s?.weather_code?`コード ${s.weather_code}`:'—'),''],['気温',value(s?.air_temperature,'℃'),''],['水温',value(s?.water_temperature,'℃'),''],['風向',s?.wind_direction||(s?.wind_direction_code?`コード ${s.wind_direction_code}`:'—'),''],['風速',value(s?.wind_speed,'m/s'),''],['波高',value(s?.wave_height,'cm'),''],['潮位',s?.tide_level??'—',''],['干満',s?.tide_phase??'—','']];
  $('#surface-grid').innerHTML=cards.map(([label,val])=>`<div class="surface-card"><span>${label}</span><strong>${esc(val)}</strong></div>`).join('');
  $('#tide-note').textContent=a?.tide==='not_connected'?'潮位・干満は現在の取得元では未連携です。取得可能になった時点で正式データだけを表示します。':'';
}

function rankCard(title,xs){if(!xs?.length)return'';return `<div class="ranking-card"><div class="ranking-title">${title}</div><div class="ranking-list">${xs.map((x,i)=>`<div class="ranking-item"><b>${x.lane}号艇</b><span>${x.probability===null?'—':`${(x.probability*100).toFixed(1)}%`}</span></div>`).join('')}</div></div>`}
function renderEngine(e){if(!e?.available){$('#engine-summary').innerHTML='';$('#engine-rankings').innerHTML='<div class="empty-card"><strong>正式評価データ待ち</strong><p>予想エンジンの正式データがまだ確定していません。④側で評価値を作って補完することはありません。</p></div>';return}
  const comp=e.data_completeness===null?'—':`${(Number(e.data_completeness)*(Number(e.data_completeness)<=1?100:1)).toFixed(0)}%`;
  const unc=e.uncertainty===null?'—':Number(e.uncertainty).toFixed(3);
  $('#engine-summary').innerHTML=`<div class="engine-metric"><span>データ充足度</span><strong>${comp}</strong></div><div class="engine-metric"><span>不確実性</span><strong>${unc}</strong></div>`;
  const r=e.candidate_rankings||{};$('#engine-rankings').innerHTML=rankCard('1着候補｜正式エンジン値',r.first)+rankCard('2着候補｜正式エンジン値',r.second)+rankCard('3着候補｜正式エンジン値',r.third)||'<div class="empty-card"><strong>順位評価は準備中</strong><p>正式値が存在する項目だけ表示します。</p></div>';
}

function renderOdds(o){$('#odds-updated').textContent=`更新 ${updated(o?.updated_at)}`;if(!o?.available||!Array.isArray(o.trifecta)||!o.trifecta.length){$('#odds-content').innerHTML='<strong>3連単オッズはデータ連携準備中</strong><p>ダミーの倍率は表示しません。現在取得可能な正式オッズが接続されるとここへ表示します。</p>';return}$('#odds-content').innerHTML=`<div class="ranking-list">${o.trifecta.map(x=>`<div class="ranking-item"><b>${esc(x.ticket||x.combination||'—')}</b><span>${fixed(x.odds,1,'倍')}</span></div>`).join('')}</div>`}

function myKey(){return DATA?`oneboat_my_${DATA.date}_${DATA.venue_code}_${DATA.race_no}`:''}
function loadMy(){try{const x=JSON.parse(localStorage.getItem(myKey())||'{}');MY={first:Number(x.first)||null,second:Number(x.second)||null,third:Number(x.third)||null}}catch{MY={first:null,second:null,third:null}}}
function saveMy(){try{localStorage.setItem(myKey(),JSON.stringify(MY))}catch{}renderMy()}
function renderMy(){document.querySelectorAll('.lane-buttons').forEach(box=>{const place=box.dataset.place;box.innerHTML=[1,2,3,4,5,6].map(n=>{const selected=MY[place]===n,used=Object.entries(MY).some(([k,v])=>k!==place&&v===n);return `<button class="lane-choice${selected?' selected':''}" type="button" data-place="${place}" data-lane="${n}" ${used?'disabled':''}>${n}</button>`}).join('')});document.querySelectorAll('.lane-choice').forEach(b=>b.addEventListener('click',()=>{MY[b.dataset.place]=Number(b.dataset.lane);saveMy()}));$('#my-ticket').textContent=`${MY.first||'—'} - ${MY.second||'—'} - ${MY.third||'—'}`}

function setupTabs(){document.querySelectorAll('.analysis-tab').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.analysis-tab').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.tab-panel').forEach(x=>x.classList.remove('active'));b.classList.add('active');document.querySelector(`[data-panel="${b.dataset.tab}"]`)?.classList.add('active')}))}
function render(d){DATA=d;$('#race-title').textContent=`${d.venue_name} ${d.race_no}R`;$('#race-subtitle').textContent=[d.title,d.subtitle].filter(Boolean).join(' / ')||'レース分析';$('#race-date').textContent=dateJp(d.date);$('#race-deadline').textContent=hm(d.deadline);$('#race-updated').textContent=updated(d.fetched_at);const st=$('#race-state');st.textContent=stateLabel(d.state);st.className=`state-badge ${stateClass(d.state)}`;$('#official-link').href=`/today.html?venue=${String(d.venue_code).padStart(2,'0')}&race=${d.race_no}`;renderRacers(d.racers);renderExhibition(d.racers,d.availability);renderSurface(d.surface,d.availability);renderEngine(d.engine);renderOdds(d.odds);loadMy();renderMy()}
async function load(){if(!(CODE>=1&&CODE<=24&&RACE>=1&&RACE<=12)){const m=$('#page-message');m.hidden=false;m.textContent='場またはレース番号が正しくありません。本日の予想からレースを選び直してください。';return}try{const r=await fetch(`/api/public/analysis?code=${CODE}&race=${RACE}`,{cache:'no-store'}),d=await r.json();if(!r.ok||!d.ok)throw Error(d?.error||'analysis');render(d)}catch{const m=$('#page-message');m.hidden=false;m.textContent='レース分析データを取得できませんでした。少し時間をおいて再読み込みしてください。'}}

setupTabs();$('#clear-my').addEventListener('click',()=>{MY={first:null,second:null,third:null};try{localStorage.removeItem(myKey())}catch{}renderMy()});load();