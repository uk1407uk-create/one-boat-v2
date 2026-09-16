import base from './worker_obpe_social.js';

const APP_URL='https://one-boat-v2-pages.uk-1407-uk.workers.dev';
const HISTORY_API='https://imhzjlxbnovjvqlyawmg.supabase.co/functions/v1/one-boat-obpe-history';
const NTFY_TOPIC='oneboat-IRL62UvsjkKYfHCuSjEuqr6qh-RDtX9';
const VENUES=['','桐生','戸田','江戸川','平和島','多摩川','浜名湖','蒲郡','常滑','津','三国','びわこ','住之江','尼崎','鳴門','丸亀','児島','宮島','徳山','下関','若松','芦屋','福岡','唐津','大村'];

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function jstYmd(){return new Date(Date.now()+9*3600*1000).toISOString().slice(0,10).replaceAll('-','')}
function jstDate(){const x=jstYmd();return `${x.slice(0,4)}-${x.slice(4,6)}-${x.slice(6,8)}`}
function nowMin(){const d=new Date(Date.now()+9*3600*1000);return d.getUTCHours()*60+d.getUTCMinutes()}
function hmMin(v){const m=String(v||'').match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*$/);return m?Number(m[1])*60+Number(m[2]):null}
function fmtHm(v){const n=Number(v);if(!Number.isFinite(n))return '';return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`}
function yen(v){const n=Number(v||0);return `${Math.round(Number.isFinite(n)?n:0).toLocaleString('ja-JP')}円`}
function compactKey(k){return String(k||'').replace(/[^A-Za-z0-9_-]/g,'')}
function venueName(code){return VENUES[Number(code)]||`場${code||'--'}`}
function ticketOf(x){return String(x?.ticket||x?.combination||x?.bet||'')}
function stakeOf(x){const n=Number(x?.stake_yen??x?.stake??x?.amount??0);return Number.isFinite(n)?Math.round(n):0}
function raceKey(rec){const d=String(rec?.race_date||'').replaceAll('-','');return `${d}-${String(rec?.venue_code||'').padStart(2,'0')}-${String(rec?.race_no||'').padStart(2,'0')}`}

async function seen(kind,key){
  try{return !!(await caches.default.match(new Request(`${APP_URL}/__ntfy/${kind}/${encodeURIComponent(key)}`)))}catch{return false}
}
async function markSeen(kind,key){
  try{await caches.default.put(new Request(`${APP_URL}/__ntfy/${kind}/${encodeURIComponent(key)}`),new Response('1',{headers:{'cache-control':'public,max-age=172800'}}))}catch{}
}

async function sendNtfy({title,message,sequenceId,priority=4}){
  const r=await fetch('https://ntfy.sh/',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({topic:NTFY_TOPIC,title,message,priority,click:APP_URL,sequence_id:sequenceId})
  });
  if(!r.ok)throw new Error(`ntfy_${r.status}`);
  return r.json().catch(()=>({ok:true}));
}

async function getProgram(){
  const r=await fetch('https://boatraceopenapi.github.io/api/v1/today.json',{headers:{accept:'application/json','user-agent':'ONE-BOAT-NOTIFY/1.1'},cache:'no-store'});
  if(!r.ok)throw new Error(`official_${r.status}`);
  return r.json();
}
function closingMap(data){
  const out=new Map(),stadiums=data?.programs?.stadiums||{},date=jstYmd();
  for(let v=1;v<=24;v++){
    const st=stadiums[String(v)]||stadiums[String(v).padStart(2,'0')];
    if(!st?.races)continue;
    for(const [rk,race] of Object.entries(st.races)){
      const rn=Number(race?.race_number??rk),close=hmMin(race?.closed_at);
      if(!(rn>=1&&rn<=12)||close===null)continue;
      out.set(`${date}-${String(v).padStart(2,'0')}-${String(rn).padStart(2,'0')}`,{close,closeText:fmtHm(close)});
    }
  }
  return out;
}

async function getHistoryItems(){
  const u=new URL(HISTORY_API);
  u.searchParams.set('date',jstDate());
  u.searchParams.set('limit','200');
  u.searchParams.set('_notify',String(Date.now()));
  const r=await fetch(u,{headers:{accept:'application/json'},cache:'no-store'});
  if(!r.ok)throw new Error(`history_${r.status}`);
  const data=await r.json();
  const rows=Array.isArray(data?.records)?data.records:[];
  return rows.filter(rec=>{
    const p=rec?.prediction||{};
    const decision=String(rec?.decision||p?.decision||'').toUpperCase();
    const stake=Number(rec?.stake_total_yen??p?.stake_total_yen??0)||0;
    return decision==='ENTER'&&stake>0;
  }).map(rec=>{
    const p=rec?.prediction||{};
    const xs=Array.isArray(rec?.bets)&&rec.bets.length?rec.bets:(Array.isArray(p?.production_picks)?p.production_picks:[]);
    return {
      key:raceKey(rec),
      venue_code:rec?.venue_code,
      venue_name:venueName(rec?.venue_code),
      race_no:rec?.race_no,
      stake_total_yen:Number(rec?.stake_total_yen??p?.stake_total_yen??0)||0,
      picks:xs.filter(x=>ticketOf(x)&&stakeOf(x)>0).map(x=>({ticket:ticketOf(x),stake_yen:stakeOf(x)})),
      settlement:rec?.settlement||null
    };
  });
}

function predictionBody(item,closeText,left){
  const lines=(Array.isArray(item?.picks)?item.picks:[]).map(x=>`${x.ticket}　${yen(x.stake_yen)}`);
  return [`締切 ${closeText}｜あと約${Math.max(1,Math.round(left))}分`,'',...lines,'',`投資 ${yen(item?.stake_total_yen)}`,'','ENTER最終予想です。','基本5分前に通知。遅延時も締切前のみ通知します。'].join('\n');
}
function resultBody(item){
  const s=item?.settlement||{},result=s?.result||{};
  const stake=Number(item?.stake_total_yen||s?.stake_yen||0)||0;
  const payout=Number(s?.payout_yen||0)||0;
  const profit=Number(s?.profit_yen??(payout-stake))||0;
  const roi=stake>0?(payout/stake*100):0;
  const tri=String(result?.trifecta||result?.order||'--');
  return [`結果 ${tri} ${s?.hit===true?'🎯':'❌'}`,'',`投資 ${yen(stake)}`,`払戻 ${yen(payout)}`,`収支 ${profit>=0?'+':''}${yen(profit)}`,`回収率 ${roi.toFixed(1)}%`].join('\n');
}
function settlementIsRecent(s,maxMinutes=15){
  const t=Date.parse(String(s?.settled_at||''));
  if(!Number.isFinite(t))return false;
  const age=Date.now()-t;
  return age>=-60000&&age<=maxMinutes*60000;
}

async function runNotifications(){
  const [program,items]=await Promise.all([getProgram(),getHistoryItems()]);
  const closes=closingMap(program),now=nowMin(),sent=[];
  for(const item of items){
    const key=String(item?.key||'');
    if(!key)continue;
    const c=closes.get(key);
    if(c){
      const left=c.close-now;
      if(left>=1&&left<=5&&!(await seen('prediction',key))){
        await sendNtfy({
          title:`🚨 ONE BOAT｜${item?.venue_name||venueName(item?.venue_code)} ${item?.race_no||'--'}R｜締切 ${c.closeText}`,
          message:predictionBody(item,c.closeText,left),
          sequenceId:`ob-pred-${compactKey(key)}`,
          priority:5
        });
        await markSeen('prediction',key);
        sent.push({type:'prediction',key,left});
      }
    }
    if(item?.settlement&&settlementIsRecent(item.settlement)&&!(await seen('result',key))){
      await sendNtfy({
        title:`🏁 ONE BOAT｜${item?.venue_name||venueName(item?.venue_code)} ${item?.race_no||'--'}R 結果`,
        message:resultBody(item),
        sequenceId:`ob-result-${compactKey(key)}`,
        priority:4
      });
      await markSeen('result',key);
      sent.push({type:'result',key});
    }
  }
  return sent;
}

async function notifyStatus(){
  const [program,items]=await Promise.all([getProgram(),getHistoryItems()]);
  const closes=closingMap(program),now=nowMin();
  const upcoming=items.map(item=>{
    const c=closes.get(item.key);
    return c?{key:item.key,venue:item.venue_name,race:item.race_no,close:c.closeText,left:c.close-now}:null;
  }).filter(Boolean).filter(x=>x.left>=-2&&x.left<=10);
  return {ok:true,now_minute:now,enter_count:items.length,upcoming};
}

export default {
  async fetch(request,env,ctx){
    try{
      const u=new URL(request.url);
      if(u.pathname==='/api/notify-status'){
        return new Response(JSON.stringify(await notifyStatus()),{headers:{'content-type':'application/json;charset=utf-8','cache-control':'no-store'}});
      }
    }catch{}
    return base.fetch(request,env,ctx);
  },
  async scheduled(controller,env,ctx){
    try{if(typeof base.scheduled==='function')await base.scheduled(controller,env,ctx)}catch{}
    ctx.waitUntil((async()=>{
      await sleep(10000);
      try{await runNotifications()}catch{}
      await sleep(12000);
      try{await runNotifications()}catch{}
    })());
  }
};