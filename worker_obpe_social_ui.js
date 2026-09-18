import base from './worker_obpe_social.js';

const READONLY_API='https://imhzjlxbnovjvqlyawmg.supabase.co/functions/v1/one-boat-admin-readonly';
const SAFE_SCHEDULE='https://imhzjlxbnovjvqlyawmg.supabase.co/functions/v1/one-boat-entry-guard-api/schedule';

function json(x,status=200){
  return new Response(JSON.stringify(x),{status,headers:{'content-type':'application/json;charset=utf-8','cache-control':'no-store','x-one-boat-read-only':'1'}});
}
function jstDate(){return new Date(Date.now()+9*3600000).toISOString().slice(0,10)}
async function readonlyFetch(params){
  const target=new URL(READONLY_API);
  for(const [k,v] of params) if(v!==null&&v!==undefined&&v!=='') target.searchParams.set(k,String(v));
  const r=await fetch(target,{method:'GET',headers:{accept:'application/json'},cache:'no-store'});
  const h=new Headers(r.headers);
  h.set('cache-control','no-store');
  h.set('x-one-boat-read-only','1');
  return new Response(r.body,{status:r.status,headers:h});
}
async function readonlyStatsJson(){
  const r=await fetch(`${READONLY_API}?mode=stats&_=${Date.now()}`,{headers:{accept:'application/json'},cache:'no-store'});
  if(!r.ok) throw Error(`readonly_stats_${r.status}`);
  return r.json();
}
async function performanceCompat(u){
  try{
    const j=await readonlyStatsJson(),date=u.searchParams.get('date')||jstDate();
    let s=null;
    if(date===jstDate()) s=j?.periods?.today||null;
    else {
      const row=(j?.breakdowns?.all?.daily||[]).find(x=>String(x?.name)===date);
      if(row) s={race_count:row.race_count,investment:row.investment,return_yen:row.return_yen,profit_yen:row.profit_yen,roi:row.roi,hit_count:row.hit_count,hit_rate:row.hit_rate};
    }
    s=s||{race_count:0,investment:0,return_yen:0,profit_yen:0,roi:null,hit_count:0,hit_rate:null};
    return json({ok:true,read_only:true,date,investment:s.investment,return_yen:s.return_yen,profit_yen:s.profit_yen,roi:s.roi,hit_rate:s.hit_rate,hit_count:s.hit_count,settled_count:s.race_count,unsettled_count:0,records:[]});
  }catch{return json({ok:false,read_only:true,error:'readonly_stats_unavailable'},502)}
}
async function safeSchedule(u){
  const target=new URL(SAFE_SCHEDULE);
  target.search=u.search;
  try{
    const r=await fetch(target,{headers:{accept:'application/json'},cache:'no-store'});
    const h=new Headers(r.headers);
    h.set('cache-control','no-store');
    h.set('x-one-boat-read-only','1');
    return new Response(r.body,{status:r.status,headers:h});
  }catch{return json({ok:false,error:'schedule_unavailable'},502)}
}
async function injectAdminReadonly(response){
  if(!response) return response;
  const headers=new Headers(response.headers);
  const ct=headers.get('content-type')||'';
  if(!ct.includes('text/html')) return response;
  let html=await response.text();
  html=html.replace(/<script src="\/performance-aggregates\.js[^\"]*"><\/script>/g,'');
  html=html.replace("if(d==='SKIP'||r.locked)return'skip'","if(d==='SKIP')return'skip'");
  html=html.replace("if(final){r.locked=true;if(r.decision!=='ENTER'){r.decision='SKIP';r.stake_total_yen=0}}","if(final){r.locked=p.locked===true}");
  if(!html.includes('/admin-readonly-ui.js')){
    const tag='<script src="/admin-readonly-ui.js?v=20260918-ro4"></script>';
    if(/<script src="\/obpe-ui\.js/.test(html)) html=html.replace(/<script src="\/obpe-ui\.js/,tag+'<script src="/obpe-ui.js');
    else html=html.replace('</head>',tag+'</head>');
  }
  headers.set('cache-control','no-store');
  headers.set('x-one-boat-ui','admin-readonly-20260918-ro4');
  headers.set('x-one-boat-read-only','1');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request,env,ctx){
    const u=new URL(request.url);
    if(u.pathname==='/api/admin-readonly'){
      return readonlyFetch(u.searchParams);
    }
    if(u.pathname==='/api/live/predict'){
      return readonlyFetch(new URLSearchParams({mode:'race',race_code:u.searchParams.get('race_code')||''}));
    }
    if(u.pathname==='/api/history'){
      const p=new URLSearchParams({mode:'records',date:u.searchParams.get('date')||jstDate()});
      for(const k of ['venue','race','decision']){const v=u.searchParams.get(k);if(v)p.set(k,v)}
      return readonlyFetch(p);
    }
    if(u.pathname==='/api/detail'){
      return readonlyFetch(new URLSearchParams({mode:'detail',race_code:u.searchParams.get('race_code')||''}));
    }
    if(u.pathname==='/api/performance') return performanceCompat(u);
    if(u.pathname==='/api/patterns') return readonlyFetch(new URLSearchParams({mode:'stats'}));
    if(u.pathname==='/api/schedule') return safeSchedule(u);
    const response=await base.fetch(request,env,ctx);
    return injectAdminReadonly(response);
  },
  async scheduled(controller,env,ctx){
    if(typeof base.scheduled==='function') return base.scheduled(controller,env,ctx);
  }
};
