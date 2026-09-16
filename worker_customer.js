const SOURCE_ORIGIN = 'https://boat-kaiseki.com';
const PUBLIC_FREE_LIMIT = 3;
const VENUES = ['', '桐生','戸田','江戸川','平和島','多摩川','浜名湖','蒲郡','常滑','津','三国','びわこ','住之江','尼崎','鳴門','丸亀','児島','宮島','徳山','下関','若松','芦屋','福岡','唐津','大村'];

function jstDate(){ return new Date(Date.now()+9*3600*1000).toISOString().slice(0,10); }
function venueName(code){ return VENUES[Number(code)] || `場${String(code||'--')}`; }
function num(v){ const n=Number(v||0); return Number.isFinite(n)?n:0; }
function json(data,status=200,cache='no-store'){
  return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=utf-8','cache-control':cache,'x-content-type-options':'nosniff'}});
}
function isEnter(rec){
  const p=rec?.prediction||{};
  return String(rec?.decision||p?.decision||'').toUpperCase()==='ENTER' && num(rec?.stake_total_yen ?? p?.stake_total_yen)>0;
}
function dateMs(v){ const d=new Date(String(v||'')+'T00:00:00+09:00'); return Number.isFinite(d.getTime())?d.getTime():0; }
function raceSort(a,b){ return num(a?.venue_code)-num(b?.venue_code)||num(a?.race_no)-num(b?.race_no); }
function publishedRows(rows){
  const byDate=new Map();
  rows.filter(isEnter).forEach(r=>{
    const d=String(r?.race_date||'').slice(0,10);
    if(!d)return;
    if(!byDate.has(d))byDate.set(d,[]);
    byDate.get(d).push(r);
  });
  const out=[];
  for(const xs of byDate.values()) out.push(...xs.sort(raceSort).slice(0,PUBLIC_FREE_LIMIT));
  return out;
}
async function sourceHistory(params={}){
  const u=new URL('/api/history',SOURCE_ORIGIN);
  Object.entries(params).forEach(([k,v])=>{ if(v!==undefined&&v!==null&&v!=='')u.searchParams.set(k,String(v)); });
  const r=await fetch(u,{headers:{accept:'application/json'},cache:'no-store'});
  if(!r.ok) throw new Error(`history_${r.status}`);
  const d=await r.json();
  return Array.isArray(d?.records)?d.records:[];
}
function settledSummary(rec){
  const s=rec?.settlement||{};
  const p=rec?.prediction||{};
  const stake=num(rec?.stake_total_yen ?? p?.stake_total_yen);
  const payout=num(s?.payout_yen);
  const profit=num(s?.profit_yen ?? (payout-stake));
  const trifecta=String(s?.result?.trifecta||s?.result?.combination||'');
  return {
    race_date: rec?.race_date||'', venue_code:num(rec?.venue_code), venue_name:venueName(rec?.venue_code), race_no:num(rec?.race_no),
    hit:s?.hit===true, stake_yen:stake, payout_yen:payout, profit_yen:profit,
    roi:stake>0?payout/stake*100:0, trifecta
  };
}
function aggregate(rows){
  const settled=rows.filter(r=>r?.settlement&&isEnter(r));
  const stake=settled.reduce((a,r)=>a+num(r?.stake_total_yen??r?.prediction?.stake_total_yen),0);
  const payout=settled.reduce((a,r)=>a+num(r?.settlement?.payout_yen),0);
  const hits=settled.filter(r=>r?.settlement?.hit===true).length;
  return {races:settled.length,hits,hit_rate:settled.length?hits/settled.length*100:0,stake_yen:stake,payout_yen:payout,profit_yen:payout-stake,roi:stake?payout/stake*100:0};
}
async function publicStats(){
  const rows=await sourceHistory({limit:2500});
  const today=jstDate();
  const now=dateMs(today);
  const published=publishedRows(rows);
  const todayRows=published.filter(r=>String(r?.race_date||'').slice(0,10)===today);
  const d7=published.filter(r=>{const t=dateMs(r?.race_date);return t&&t>=now-6*86400000&&t<=now;});
  const d30=published.filter(r=>{const t=dateMs(r?.race_date);return t&&t>=now-29*86400000&&t<=now;});
  const latest=published.filter(r=>r?.settlement).slice().sort((a,b)=>`${b?.race_date||''}-${num(b?.venue_code)}-${num(b?.race_no)}`.localeCompare(`${a?.race_date||''}-${num(a?.venue_code)}-${num(a?.race_no)}`)).slice(0,8).map(settledSummary);
  return {ok:true,scope:'public_only',public_limit_per_day:PUBLIC_FREE_LIMIT,updated_at:new Date().toISOString(),today:aggregate(todayRows),days7:aggregate(d7),days30:aggregate(d30),latest};
}
async function publicToday(){
  const today=jstDate();
  const rows=(await sourceHistory({date:today,limit:200})).filter(isEnter).sort(raceSort);
  const items=rows.map((rec,i)=>{
    const p=rec?.prediction||{}, s=rec?.settlement||null;
    return {
      race_date:rec?.race_date||today, venue_code:num(rec?.venue_code), venue_name:venueName(rec?.venue_code), race_no:num(rec?.race_no),
      deadline:p?.deadline_at||p?.deadline||p?.close_time||'', status:s?'SETTLED':'LOCKED', public_preview:i<PUBLIC_FREE_LIMIT,
      settlement:s?settledSummary(rec):null
    };
  });
  return {ok:true,date:today,count:items.length,public_count:Math.min(PUBLIC_FREE_LIMIT,items.length),items};
}

export default {
  async fetch(request,env){
    const u=new URL(request.url);
    try{
      if(u.pathname==='/api/health') return json({ok:true,service:'ONE BOAT CUSTOMER',version:'2026-09-16.2',performance_scope:'public_only'},200,'no-store');
      if(u.pathname==='/api/public/stats') return json(await publicStats(),200,'public,max-age=30');
      if(u.pathname==='/api/public/today') return json(await publicToday(),200,'public,max-age=20');
      if(env?.ASSETS?.fetch){
        let res=await env.ASSETS.fetch(request);
        if(res.status===404 && request.method==='GET'){
          const fallback=new Request(new URL('/index.html',u.origin),request);
          res=await env.ASSETS.fetch(fallback);
        }
        const h=new Headers(res.headers);
        h.set('x-frame-options','DENY');
        h.set('referrer-policy','strict-origin-when-cross-origin');
        h.set('x-content-type-options','nosniff');
        if((h.get('content-type')||'').includes('text/html'))h.set('cache-control','no-store');
        return new Response(res.body,{status:res.status,headers:h});
      }
      return json({ok:false,error:'not_found'},404);
    }catch(e){
      if(u.pathname.startsWith('/api/')) return json({ok:false,error:'temporarily_unavailable'},502,'no-store');
      return env?.ASSETS?.fetch ? env.ASSETS.fetch(new Request(new URL('/index.html',u.origin),request)) : json({ok:false},500);
    }
  }
};
