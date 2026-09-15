(function(){'use strict';
var VENUES=['桐生','戸田','江戸川','平和島','多摩川','浜名湖','蒲郡','常滑','津','三国','びわこ','住之江','尼崎','鳴門','丸亀','児島','宮島','徳山','下関','若松','芦屋','福岡','唐津','大村'];
var timer=null,busy=false,lastKey='';
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]})}
function pad(n){return String(n).padStart(2,'0')}
function jstDate(){return new Date(Date.now()+32400000).toISOString().slice(0,10)}
function yen(v){var n=Number(v);return Number.isFinite(n)?n.toLocaleString()+'円':'--'}
function pct(v){var n=Number(v);return Number.isFinite(n)?n.toFixed(1)+'%':'--'}
function active(){var s=document.getElementById('screen-result');return !!(s&&s.classList.contains('active'))}
function target(){var h=document.getElementById('resultTitle');if(!h)return null;var m=String(h.textContent||'').match(/^(.+?)\s+(\d{1,2})R/);if(!m)return null;var vi=VENUES.indexOf(m[1].trim());if(vi<0)return null;var d=jstDate(),race=Number(m[2]);return{date:d,venue:vi+1,race:race,key:d.replaceAll('-','')+pad(vi+1)+pad(race),name:m[1].trim()}}
function fetchJson(u){return fetch(u,{cache:'no-store'}).then(function(r){if(!r.ok)throw Error(String(r.status));return r.json()})}
function combo(v){if(v==null)return'--';if(Array.isArray(v))return v.join('-');var a=String(v).match(/[1-6]/g);return a&&a.length>=3?a.slice(0,3).join('-'):String(v)}
function resultOf(j,t){var st=j&&j.programs&&j.programs.stadiums&&(j.programs.stadiums[String(t.venue)]||j.programs.stadiums[pad(t.venue)]);var r=st&&st.races&&(st.races[String(t.race)]||st.races[pad(t.race)]);return r&&r.result?r.result:null}
function orderOf(res){var rr=res&&res.racers||{};return Object.values(rr).filter(function(x){return x&&x.place_number!=null&&Number(x.place_number)>0}).sort(function(a,b){return Number(a.place_number)-Number(b.place_number)}).map(function(x){return Number(x.entry_number||x.lane||0)}).filter(Boolean).slice(0,3)}
function trifectaOf(res){var a=res&&res.payouts&&res.payouts.trifecta;var x=Array.isArray(a)?a[0]:null;return x?{ticket:combo(x.combination||x.ticket),amount:Number(x.amount||x.payout||0)}:{ticket:'--',amount:NaN}}
function arrays(o,out,depth){out=out||[];depth=depth||0;if(o==null||depth>7)return out;if(Array.isArray(o)){out.push(o);o.forEach(function(x){arrays(x,out,depth+1)});return out}if(typeof o==='object')Object.keys(o).forEach(function(k){arrays(o[k],out,depth+1)});return out}
function findRace(o,key){var as=arrays(o,[],0);for(var i=0;i<as.length;i++)for(var j=0;j<as[i].length;j++){var x=as[i][j];if(x&&typeof x==='object'&&String(x.race_key||x.race_code||'')===key)return x}return null}
function renderWaiting(){var root=document.getElementById('resultContent');if(!root)return;var badge=root.querySelector('.resultBadge');if(badge)badge.textContent='公式結果待ち'}
function renderResult(t,res,perf,hist){var root=document.getElementById('resultContent');if(!root||!active())return;var ord=orderOf(res),tri=trifectaOf(res),rec=findRace(perf,t.key),h=findRace(hist,t.key),sett=(h&&h.settlement)||rec||null,pred=(h&&h.prediction)||h||null;var invested=sett&&sett.stake_yen!=null?Number(sett.stake_yen):pred&&pred.stake_total_yen!=null?Number(pred.stake_total_yen):0;var payout=sett&&sett.payout_yen!=null?Number(sett.payout_yen):0;var profit=invested>0?payout-invested:0;var roi=invested>0?payout/invested*100:null;var hit=sett&&sett.hit===true;var purchased=invested>0;var theory=(sett&&sett.theory_name)||(pred&&pred.theory_name)||(pred&&pred.theory&&pred.theory.name)||'--';var analysis=sett&&sett.miss_type?sett.miss_type:(purchased?(hit?'的中':'結果確定 / 分析データ待ち'):'見送り・未購入レースのため収支対象外');var badge=purchased?(hit?'🎯 的中':'✕ 不的中'):'結果確定 / 購入なし';var odds=Number.isFinite(tri.amount)&&tri.amount>0?(tri.amount/100).toFixed(1)+'倍':'--';var html='<div class="card detailBody"><div class="resultBadge">'+esc(badge)+'</div><div class="infoGrid" style="margin-top:12px">';
html+='<div class="infoBox"><span>着順</span><b>'+esc(ord.length?ord.join('-'):'--')+'</b></div>';
html+='<div class="infoBox"><span>3連単</span><b>'+esc(tri.ticket)+'</b></div>';
html+='<div class="infoBox"><span>確定配当（100円）</span><b>'+esc(Number.isFinite(tri.amount)&&tri.amount>0?yen(tri.amount):'--')+'</b><small style="display:block;color:#829ab1;margin-top:4px">'+esc(odds)+'</small></div>';
html+='<div class="infoBox"><span>投資額</span><b>'+(purchased?yen(invested):'購入なし')+'</b></div>';
html+='<div class="infoBox"><span>払戻額</span><b>'+(purchased?yen(payout):'--')+'</b></div>';
html+='<div class="infoBox"><span>収支</span><b>'+(purchased?yen(profit):'--')+'</b></div>';
html+='<div class="infoBox"><span>回収率</span><b>'+(purchased&&roi!=null?pct(roi):'--')+'</b></div></div>';
html+='<div class="dataCard" style="margin-top:10px"><h3>採用理論</h3><div class="kv"><span>理論</span><b>'+esc(theory)+'</b></div></div>';
html+='<div class="aiComment"><b style="color:#62d8ff">外れ分析 / 結果分析</b><br>'+esc(analysis)+'</div></div>';root.innerHTML=html}
function refresh(){if(!active()||busy)return;var t=target();if(!t)return;busy=true;Promise.allSettled([
 fetchJson('/api/official?date='+encodeURIComponent(t.date)+'&_result='+Date.now()),
 fetchJson('/api/performance?date='+encodeURIComponent(t.date)+'&_result='+Date.now()),
 fetchJson('/api/history?date='+encodeURIComponent(t.date)+'&_result='+Date.now())
]).then(function(a){if(!active())return;var official=a[0].status==='fulfilled'?a[0].value:null,res=resultOf(official,t);if(!res){renderWaiting();return}renderResult(t,res,a[1].status==='fulfilled'?a[1].value:{},a[2].status==='fulfilled'?a[2].value:{})}).catch(function(){}).finally(function(){busy=false})}
function tick(){if(active()){var t=target();if(t&&lastKey!==t.key){lastKey=t.key;setTimeout(refresh,50)}else refresh();if(!timer)timer=setInterval(refresh,5000)}else if(timer){clearInterval(timer);timer=null;lastKey=''}}
function boot(){document.addEventListener('click',function(){setTimeout(tick,80)});new MutationObserver(function(){setTimeout(tick,40)}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});tick()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
