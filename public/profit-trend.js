(function(){'use strict';
var currentMode='today',timer=null,lastRows=[];
var VENUES=['桐生','戸田','江戸川','平和島','多摩川','浜名湖','蒲郡','常滑','津','三国','びわこ','住之江','尼崎','鳴門','丸亀','児島','宮島','徳山','下関','若松','芦屋','福岡','唐津','大村'];
function num(v){var n=Number(v);return Number.isFinite(n)?n:0}
function yen(v,sign){var n=Math.round(num(v)),p=sign&&n>0?'+':'';return p+n.toLocaleString('ja-JP')+'円'}
function pct(v){return Number.isFinite(Number(v))?Number(v).toFixed(1)+'%':'--'}
function jstDate(){return new Date(Date.now()+9*3600000).toISOString().slice(0,10)}
function raceLabel(k){var s=String(k||'').replace(/\D/g,''),vc=Number(s.slice(8,10)),rn=Number(s.slice(10,12)),v=vc>=1&&vc<=24?VENUES[vc-1]:'レース';return v+' '+(rn||'')+'R'}
function activePerf(){var a=document.querySelector('#perfTabs button.active');return a?a.getAttribute('data-perf'):'daily'}
function isDaily(){var screen=document.getElementById('screen-performance');return !!(screen&&screen.classList.contains('active')&&activePerf()==='daily')}
function addStyle(){
  if(document.getElementById('profitTrendStyle'))return;
  var s=document.createElement('style');s.id='profitTrendStyle';
  s.textContent='\
#profitTrendCard{position:relative;margin:8px 0 18px;border:1px solid rgba(22,96,151,.82);border-radius:11px;overflow:hidden;color:#f6fbff;background:linear-gradient(180deg,rgba(8,33,60,.98),rgba(4,18,34,.995));box-shadow:0 10px 28px rgba(0,0,0,.38),inset 0 1px 0 rgba(255,255,255,.025)}\
#profitTrendCard:before{content:"";position:absolute;left:0;right:0;top:0;height:1px;background:linear-gradient(90deg,transparent,#24c9ff 28%,#53e8ff 50%,#24c9ff 72%,transparent);opacity:.72;pointer-events:none}\
#profitTrendCard>*{position:relative;z-index:1}.ptHeader{display:flex;align-items:center;justify-content:space-between;padding:12px 12px 9px}.ptHeaderTitle{font-size:15px;font-weight:950}.ptLive{display:flex;align-items:center;gap:6px;color:#829ab0;font-size:9px;font-weight:900}.ptLive i{width:7px;height:7px;border-radius:50%;background:#35e0ff;box-shadow:0 0 10px rgba(53,224,255,.7)}\
.ptMode{display:flex;gap:4px;margin:0 12px 10px;padding:3px;border:1px solid #0d426a;border-radius:8px;background:#031222}.ptMode button{flex:1;border:0;background:transparent;color:#7993aa;padding:9px 4px;border-radius:6px;font-size:10px;font-weight:900}.ptMode button.active{color:#fff;background:linear-gradient(180deg,#0c8fd8,#07558c);box-shadow:inset 0 0 0 1px #2ac3ff,0 0 11px rgba(0,170,255,.12)}\
.ptBalance{margin:0 12px 9px;padding:13px 12px;border:1px solid #12517d;border-radius:9px;background:linear-gradient(180deg,#082844,#06192d)}.ptBalanceTop{display:flex;align-items:center;justify-content:space-between;gap:8px}.ptBalanceLabel{font-size:9px;color:#829ab0;font-weight:900}.ptBadge{border:1px solid #17618f;border-radius:6px;padding:4px 7px;background:#071d31;color:#82e2ff;font-size:8px;font-weight:950}.ptBadge.minus{border-color:#713846;color:#ff9baa;background:#201017}.ptBadge.plus{border-color:#17776f;color:#67e6da;background:#07201f}.ptAmount{margin-top:5px;font-size:36px;line-height:1;font-weight:950;letter-spacing:-.035em;font-variant-numeric:tabular-nums;color:#f6fbff}.ptAmount.plus{color:#55e3d8}.ptAmount.minus{color:#f6fbff}.ptBalanceSub{margin-top:7px;color:#8fa7bb;font-size:10px;font-weight:800}\
.ptStats{display:grid;grid-template-columns:repeat(3,1fr);margin:0 12px 10px;border:1px solid #0d426a;border-radius:9px;overflow:hidden;background:#041526}.ptStat{padding:10px 5px;text-align:center;border-right:1px solid #0c3658}.ptStat:last-child{border-right:0}.ptStat span{display:block;font-size:8px;color:#829ab0;margin-bottom:4px}.ptStat b{font-size:13px;font-weight:950;color:#f6fbff;font-variant-numeric:tabular-nums}\
.ptHitline{display:flex;align-items:center;justify-content:space-between;margin:0 12px 10px;padding:8px 10px;border:1px solid #123f64;border-radius:8px;background:#06182b}.ptHitline span{font-size:9px;color:#829ab0}.ptHitline b{font-size:11px;color:#dff6ff}\
.ptFlow{margin:0 12px 12px}.ptFlowHead{display:flex;align-items:flex-end;justify-content:space-between;margin:11px 2px 7px}.ptFlowHead b{font-size:13px;font-weight:950}.ptFlowHead span{font-size:8px;color:#829ab0}.ptJourney{position:relative;display:grid;gap:6px;padding-left:12px}.ptJourney:before{content:"";position:absolute;left:4px;top:8px;bottom:8px;width:1px;background:linear-gradient(#24c9ff,rgba(18,75,118,.45));box-shadow:0 0 8px rgba(36,201,255,.18)}.ptStart,.ptFinish{display:flex;align-items:center;justify-content:space-between;padding:9px 10px;border:1px solid #123f64;border-radius:8px;background:#06182b}.ptStart:before,.ptFinish:before,.ptRace:before{content:"";position:absolute;left:-11px;width:7px;height:7px;border-radius:50%;background:#24c9ff;box-shadow:0 0 8px rgba(36,201,255,.45)}.ptStart,.ptFinish,.ptRace{position:relative}.ptStart span,.ptFinish span{font-size:9px;color:#829ab0}.ptStart b,.ptFinish b{font-size:12px;font-weight:950}.ptFinish{border-color:#17618f;background:linear-gradient(180deg,#082844,#06192d)}\
.ptRace{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;min-height:52px;padding:8px 10px;border:1px solid #0c3557;border-radius:8px;background:#05172a}.ptRaceMain{min-width:0}.ptRaceName{font-size:11px;font-weight:950;color:#eff8ff}.ptRaceMeta{margin-top:4px;font-size:8px;color:#708aa0}.ptRaceRight{text-align:right}.ptDelta{font-size:13px;font-weight:950;font-variant-numeric:tabular-nums}.ptDelta.plus{color:#43dfd1}.ptDelta.minus{color:#ff8291}.ptCum{display:block;margin-top:3px;font-size:8px;color:#829ab0}.ptRace.hit{box-shadow:inset 2px 0 0 #43dfd1}.ptRace.miss{box-shadow:inset 2px 0 0 rgba(255,130,145,.45)}.ptRace.hit:before{background:#43dfd1}.ptRace.miss:before{background:#5c7890;box-shadow:none}\
.ptMore{margin-top:7px;text-align:center;font-size:8px;color:#617b91}.ptEmpty{padding:24px 10px;text-align:center;color:#829ab0;font-size:10px}.ptFoot{padding:0 12px 11px;text-align:right;color:#5f788e;font-size:8px}@media(max-width:390px){.ptAmount{font-size:33px}.ptBalance{padding:12px 11px}.ptRace{min-height:50px}}';
  document.head.appendChild(s);
}
async function loadRows(){
  try{
    var r=await fetch('/api/history?limit=300&_pt='+Date.now(),{cache:'no-store'});if(!r.ok)return[];
    var j=await r.json(),recs=Array.isArray(j.records)?j.records:[],by=new Map();
    recs.forEach(function(x){if(!x||!x.settlement)return;var st=num(x.stake_total_yen||(x.settlement&&x.settlement.stake_yen));if(String(x.decision||'ENTER').toUpperCase()!=='ENTER'||st<=0)return;var prev=by.get(x.race_key);if(!prev||String(x.captured_at||'')>String(prev.captured_at||''))by.set(x.race_key,x)});
    return Array.from(by.values()).map(function(x){var s=x.settlement||{},stake=num(s.stake_yen||x.stake_total_yen),ret=num(s.payout_yen)+num(s.refund_yen),profit=Number.isFinite(Number(s.profit_yen))?Number(s.profit_yen):ret-stake;return{race_key:x.race_key,date:String(x.race_date||String(x.race_key||'').slice(0,8).replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3')),stake:stake,ret:ret,profit:profit,hit:s.hit===true,time:String(s.settled_at||x.captured_at||'')}}).sort(function(a,b){return a.time.localeCompare(b.time)})
  }catch(e){return[]}
}
function filtered(rows){if(currentMode!=='today')return rows;var d=jstDate();return rows.filter(function(x){return x.date===d})}
function stats(rows){var o={stake:0,ret:0,profit:0,hits:0,count:rows.length};rows.forEach(function(x){o.stake+=x.stake;o.ret+=x.ret;o.profit+=x.profit;if(x.hit)o.hits++});o.roi=o.stake?o.ret/o.stake*100:null;return o}
function flowRows(rows){
  var cum=0,all=[];rows.forEach(function(r){cum+=r.profit;all.push({r:r,cum:cum})});
  var start=Math.max(0,all.length-10),baseline=start?all[start-1].cum:0,show=all.slice(start),html='<div class="ptJourney"><div class="ptStart"><span>'+(start?'10R前':'スタート')+'</span><b>'+yen(baseline,true)+'</b></div>';
  show.forEach(function(x){var cls=x.r.profit>=0?'plus':'minus',result=x.r.hit?'的中':'不的中';html+='<div class="ptRace '+(x.r.hit?'hit':'miss')+'"><div class="ptRaceMain"><div class="ptRaceName">'+raceLabel(x.r.race_key)+'</div><div class="ptRaceMeta">'+result+' ・ 投資 '+yen(x.r.stake)+'</div></div><div class="ptRaceRight"><div class="ptDelta '+cls+'">'+yen(x.r.profit,true)+'</div><span class="ptCum">累計 '+yen(x.cum,true)+'</span></div></div>'});
  html+='<div class="ptFinish"><span>現在</span><b>'+yen(cum,true)+'</b></div></div>';
  if(all.length>10)html+='<div class="ptMore">直近10Rを表示</div>';
  return html;
}
function render(rows){
  if(!isDaily())return;var root=document.getElementById('performanceContent');if(!root)return;
  var use=filtered(rows),st=stats(use),cls=st.profit>0?'plus':st.profit<0?'minus':'zero',badge=st.profit>0?'プラス':st.profit<0?'マイナス':'±0',sub=st.profit>0?'現在プラス収支':st.profit<0?'現在マイナス収支':'収支は0円',card=document.createElement('div');
  card.id='profitTrendCard';
  card.innerHTML='<div class="ptHeader"><div class="ptHeaderTitle">収支</div><div class="ptLive"><i></i>自動更新</div></div><div class="ptMode"><button data-pt="today" class="'+(currentMode==='today'?'active':'')+'">今日</button><button data-pt="all" class="'+(currentMode==='all'?'active':'')+'">累計</button></div><div class="ptBalance"><div class="ptBalanceTop"><span class="ptBalanceLabel">現在収支</span><span class="ptBadge '+cls+'">'+badge+'</span></div><div class="ptAmount '+cls+'">'+yen(st.profit,true)+'</div><div class="ptBalanceSub">'+sub+'</div></div><div class="ptStats"><div class="ptStat"><span>投資</span><b>'+yen(st.stake)+'</b></div><div class="ptStat"><span>払戻</span><b>'+yen(st.ret)+'</b></div><div class="ptStat"><span>回収率</span><b>'+pct(st.roi)+'</b></div></div><div class="ptHitline"><span>的中</span><b>'+st.hits+' / '+st.count+'R</b></div><div class="ptFlow"><div class="ptFlowHead"><b>レース別の流れ</b><span>直近10R</span></div>'+(use.length?flowRows(use):'<div class="ptEmpty">結果が確定すると表示されます</div>')+'</div><div class="ptFoot">結果確定済みENTERのみ集計</div>';
  root.innerHTML='';root.appendChild(card);
  Array.prototype.forEach.call(card.querySelectorAll('[data-pt]'),function(b){b.onclick=function(e){e.preventDefault();e.stopPropagation();currentMode=b.getAttribute('data-pt');render(rows)}});
}
async function refresh(){if(!isDaily())return;lastRows=await loadRows();render(lastRows)}
function start(){
  addStyle();
  document.addEventListener('click',function(e){var nav=e.target&&e.target.closest&&e.target.closest('[data-nav="performance"]');var tab=e.target&&e.target.closest&&e.target.closest('#perfTabs button');if(nav)setTimeout(refresh,160);if(tab&&tab.getAttribute('data-perf')==='daily')setTimeout(refresh,120)},true);
  setTimeout(refresh,250);setTimeout(refresh,1000);timer=setInterval(function(){if(isDaily())refresh()},30000);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
