import base from './worker.js';

function json(x,status=200,cache='no-store'){
  return new Response(JSON.stringify(x),{status,headers:{'content-type':'application/json;charset=utf-8','cache-control':cache}});
}
function jstYmd(){return new Date(Date.now()+9*3600*1000).toISOString().slice(0,10).replaceAll('-','')}
function nowMin(){const d=new Date(Date.now()+9*3600*1000);return d.getUTCHours()*60+d.getUTCMinutes()}
function hmMin(v){const m=String(v||'').match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*$/);return m?Number(m[1])*60+Number(m[2]):null}
function plainHtml(s){return String(s||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&deg;/gi,'°').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/\s+/g,' ').trim()}
function firstMatch(text,re){const m=text.match(re);return m?m[1]:null}
function weatherFromHtml(html){
  const text=plainHtml(html);
  const temperature=firstMatch(text,/気温\s*([+-]?\d+(?:\.\d+)?)\s*℃/);
  const weather=firstMatch(text,/気温\s*[+-]?\d+(?:\.\d+)?\s*℃\s*([^\s]{1,8})\s*風速/);
  const windSpeed=firstMatch(text,/風速\s*([+-]?\d+(?:\.\d+)?)\s*m/);
  const waterTemperature=firstMatch(text,/水温\s*([+-]?\d+(?:\.\d+)?)\s*℃/);
  const waveHeight=firstMatch(text,/波高\s*([+-]?\d+(?:\.\d+)?)\s*cm/);
  const observedAt=firstMatch(text,/水面気象情報\s*([0-9]{1,2}:[0-9]{2})\s*現在/);
  let windDirection=firstMatch(text,/風向\s*([^\s]{1,8})/);
  if(!windDirection){
    const alt=String(html||'').match(/(?:wind|windDirection|wind_direction)[^>]{0,180}alt=["']([^"']+)["']/i);
    windDirection=alt?alt[1]:null;
  }
  if(!weather&&!temperature&&!windSpeed&&!waterTemperature&&!waveHeight)return null;
  const summary=[weather,temperature!==null?temperature+'℃':null].filter(Boolean).join(' ');
  return {
    weather:summary||weather||'--',
    weather_condition:weather,
    air_temperature:temperature===null?null:Number(temperature),
    temperature:temperature===null?null:Number(temperature),
    wind_speed:windSpeed===null?null:Number(windSpeed),
    wind_direction:windDirection,
    water_temperature:waterTemperature===null?null:Number(waterTemperature),
    wave_height:waveHeight===null?null:Number(waveHeight),
    observed_at:observedAt,
    source:'BOAT RACE オフィシャル'
  };
}
async function fetchWithTimeout(url,ms=2800){
  let timer;
  try{
    return await Promise.race([
      fetch(url,{headers:{accept:'text/html,application/xhtml+xml','user-agent':'Mozilla/5.0 ONE-BOAT/1.0'},redirect:'follow'}),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('timeout')),ms)})
    ]);
  }finally{if(timer)clearTimeout(timer)}
}
async function getOfficialWeather(origin,hd,jcd,rno,ctx){
  if(!/^\d{8}$/.test(hd)||!/^\d{2}$/.test(jcd)||!/^\d{1,2}$/.test(String(rno)))return null;
  const key=new Request(`${origin}/api/weather?hd=${hd}&jcd=${jcd}&rno=${rno}&v=2`);
  try{const c=await caches.default.match(key);if(c){const j=await c.json();return j&&j.ok?j.data:null}}catch{}
  const url=`https://www.boatrace.jp/owpc/pc/race/beforeinfo?hd=${hd}&jcd=${jcd}&rno=${rno}`;
  try{
    const r=await fetchWithTimeout(url);
    if(!r.ok)return null;
    const data=weatherFromHtml(await r.text());
    if(!data)return null;
    const out=json({ok:true,data},200,'public,max-age=90');
    if(ctx)ctx.waitUntil(Promise.resolve().then(()=>caches.default.put(key,out.clone())).catch(()=>{}));
    return data;
  }catch{return null}
}
function currentRaceNo(st){
  if(!st||!st.races)return null;
  const now=nowMin(),rows=[];
  for(const [k,r] of Object.entries(st.races)){
    const rn=Number(r?.race_number??k),dm=hmMin(r?.closed_at);
    if(rn>=1&&rn<=12&&dm!==null)rows.push({rn,dm});
  }
  rows.sort((a,b)=>a.rn-b.rn);
  const x=rows.find(v=>v.dm>=now-1);
  return x?x.rn:null;
}
async function enrichOfficialSchedule(data,origin,hd,ctx){
  const stadiums=data?.programs?.stadiums;
  if(!stadiums||hd!==jstYmd())return data;
  const jobs=[];
  for(let v=1;v<=24;v++){
    const jcd=String(v).padStart(2,'0'),st=stadiums[String(v)]||stadiums[jcd],rno=currentRaceNo(st);
    if(!st||!rno)continue;
    jobs.push((async()=>{
      const w=await getOfficialWeather(origin,hd,jcd,rno,ctx);
      if(!w)return;
      st.weather=w.weather;
      st.weather_condition=w.weather_condition;
      st.air_temperature=w.air_temperature;
      st.temperature=w.temperature;
      st.wind_speed=w.wind_speed;
      st.wind_direction=w.wind_direction;
      st.water_temperature=w.water_temperature;
      st.wave_height=w.wave_height;
      st.weather_observed_at=w.observed_at;
      st.weather_source=w.source;
    })());
  }
  await Promise.allSettled(jobs);
  return data;
}

export default {
  async fetch(request,env,ctx){
    const u=new URL(request.url);
    if(u.pathname==='/api/weather'){
      const hd=(u.searchParams.get('hd')||jstYmd()).replaceAll('-','');
      const jcd=String(u.searchParams.get('jcd')||'').padStart(2,'0');
      const rno=u.searchParams.get('rno')||'';
      const data=await getOfficialWeather(u.origin,hd,jcd,rno,ctx);
      return data?json({ok:true,data},200,'public,max-age=60'):json({ok:false,error:'weather_unavailable'},502);
    }
    if(u.pathname==='/api/official'){
      const response=await base.fetch(request,env,ctx);
      if(!response.ok)return response;
      try{
        const data=await response.clone().json();
        const hd=(u.searchParams.get('date')||'').replaceAll('-','');
        await enrichOfficialSchedule(data,u.origin,hd,ctx);
        return json(data,200,'public,max-age=45');
      }catch{return response}
    }
    return base.fetch(request,env,ctx);
  }
};
