import base from './worker_obpe_social.js';

const APP_URL='https://one-boat-v2-pages.uk-1407-uk.workers.dev';
const NTFY_TOPICS=[
  'oneboat-IRL62UvsjkKYfHCuSjEuqr6qhRDtX9',
  'oneboat-IRL62UvsjkKYfHCuSjEuqr6qh-RDtX9'
];
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

async function seen(kind,key){
  try{return !!(await caches.default.match(new Request(`${APP_URL}/__ntfy/${kind}/${encodeURIComponent(key)}`)))}catch{return false}
}
async function markSeen(kind,key){
  try{await caches.default.put(new Request(`${APP_URL}/__ntfy/${kind}/${encodeURIComponent(key)}`),new Response('1',{headers:{'cache-control':'public,max-age=172800'}}))}catch{}
}

async function sendNtfy({title,message,sequenceId,priority=4}){
  const results=[];
  for(const topic of NTFY_TOPICS){
    const r=await fetch('https://ntfy.sh/',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({topic,title,message,priority,click:APP_URL,sequence_id:`${sequenceId}-${topic.endsWith('-RDtX9')?'b':'a'}`})
    });
    if(!r.ok)throw new Error(`ntfy_${r.status}`);
    results.push(await r.json().catch(()=>({ok:true,topic})));
  }
  return results;
}

async function getProgram(){
  const r=await fetch('https://boatraceopenapi.github.io/api/v1/today.json',{headers:{accept:'application/json','user-agent':'ONE-BOAT-NOTIFY/1.0'},cache:'no-store'});
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
async function getSocial(){
  const r=await fetch(`${APP_URL}/api/social-feed?date=${encodeURIComponent(jstDate())}&limit=200&_notify=${Date.now()}`,{headers:{accept:'application/json'},cache:'no-store'});
  if(!r.ok)throw new Error(`social_${r.status}`);
  return r.json();
}

function predictionBody(item,closeText,left){
  const lines=(Array.isArray(item?.picks)?item.picks:[]).map(x=>`${x.ticket}　${yen(x.stake_yen)}`);
  return [`締切 ${closeText}｜あと約${Math.max(0,Math.round(left))}分`,'',...lines,'',`投資 ${yen(item?.stake_total_yen)}`,'','ENTER最終予想です。','この通知が締切3分前を過ぎたレースは投稿対象外です。'].join('\n');
}
function resultBody(item){
  if(item?.result_text)return String(item.result_text);
  return `${venueName(item?.venue_code)} ${item?.race_no||'--'}R の結果が確定しました。\nONE BOATを開いて確認してください。`;
}

async function runNotifications(){
  const [program,social]=await Promise.all([getProgram(),getSocial()]);
  const closes=closingMap(program),items=Array.isArray(social?.items)?social.items:[],now=nowMin(),sent=[];
  for(const item of items){
    const key=String(item?.key||'');
    if(!key)continue;
    const c=closes.get(key);
    if(item?.prediction_ready&&c){
      const left=c.close-now;
      if(left>=3&&left<=5&&!(await seen('prediction',key))){
        await sendNtfy({title:`🚨 ONE BOAT｜${item?.venue_name||venueName(item?.venue_code)} ${item?.race_no||'--'}R`,message:predictionBody(item,c.closeText,left),sequenceId:`ob-pred-${compactKey(key)}`,priority:5});
        await markSeen('prediction',key);
        sent.push({type:'prediction',key,left});
      }
    }
    if(item?.result_ready&&!(await seen('result',key))){
      await sendNtfy({title:`🏁 ONE BOAT｜${item?.venue_name||venueName(item?.venue_code)} ${item?.race_no||'--'}R 結果`,message:resultBody(item),sequenceId:`ob-result-${compactKey(key)}`,priority:4});
      await markSeen('result',key);
      sent.push({type:'result',key});
    }
  }
  return sent;
}

async function notifyTest(){
  return sendNtfy({title:'✅ ONE BOAT 通知テスト',message:'接続確認OKです。今後はENTERレースを締切5〜3分前に通知します。',sequenceId:'ob-startup-test-v3',priority:4});
}
async function startupTest(){
  if(await seen('startup','v3'))return;
  await notifyTest();
  await markSeen('startup','v3');
}

export default {
  async fetch(request,env,ctx){return base.fetch(request,env,ctx);},
  async scheduled(controller,env,ctx){
    try{if(typeof base.scheduled==='function')await base.scheduled(controller,env,ctx)}catch{}
    ctx.waitUntil((async()=>{
      try{await startupTest()}catch{}
      await sleep(6000);
      try{await runNotifications()}catch{}
      await sleep(7000);
      try{await runNotifications()}catch{}
    })());
  }
};