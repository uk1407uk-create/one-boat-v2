(function(){'use strict';
function predictionActive(){var s=document.getElementById('screen-detail');if(!s||!s.classList.contains('active'))return false;var a=document.querySelector('#detailTabs button.active');return !a||a.getAttribute('data-tab')==='prediction'}
function addStyle(){if(document.getElementById('obpeOrderStyle'))return;var s=document.createElement('style');s.id='obpeOrderStyle';s.textContent='.obpeGroupLabel{display:flex;justify-content:space-between;align-items:center;padding:13px 0 6px;margin-top:5px;border-bottom:1px solid #24506f}.obpeGroupLabel b{font-size:13px;color:#7fe4ff}.obpeGroupLabel span{font-size:10px;color:#7f99af}.obpeEnterNote{font-size:11px;color:#7fe4ff;margin-top:3px}';document.head.appendChild(s)}
function oddsOf(row){var t=row.textContent||'';var m=t.match(/([0-9]+(?:\.[0-9]+)?)倍/);return m?Number(m[1]):999999}
function band(o){return o<100?0:o<200?1:o<300?2:3}
var LABELS=[['本線','～99.9倍'],['対抗','100～199.9倍'],['抑え','200～299.9倍'],['高配当候補','300倍～']];
function purchaseHead(){var heads=Array.from(document.querySelectorAll('#detailContent .sectionTitle h2'));return heads.find(function(x){return x.textContent.indexOf('購入')===0})}
function clarify(){var h=purchaseHead();if(!h)return;var c=document.getElementById('detailContent'),status=c&&c.querySelector('.statusChip'),txt=(status&&status.textContent)||'',enter=/ENTER|予想完了/.test(txt);h.textContent=enter?'購入買い目（ENTER）':'購入候補';var sub=h.parentElement&&h.parentElement.querySelector('.mini');if(sub)sub.textContent=enter?'最終購入判定済み':'最終判定前の候補'}
function reorder(){if(!predictionActive())return;var h=purchaseHead();if(!h)return;var card=h.parentElement&&h.parentElement.nextElementSibling;if(!card)return;var rows=Array.from(card.children).filter(function(x){return x.classList&&x.classList.contains('obpePick')&&x.querySelector('div>b')});if(!rows.length)return;card.querySelectorAll('.obpeGroupLabel').forEach(function(x){x.remove()});rows.sort(function(a,b){var oa=oddsOf(a),ob=oddsOf(b),ba=band(oa),bb=band(ob);if(ba!==bb)return ba-bb;return oa-ob});var last=-1;rows.forEach(function(r){var b=band(oddsOf(r));if(b!==last){var d=document.createElement('div');d.className='obpeGroupLabel';d.innerHTML='<b>'+LABELS[b][0]+'</b><span>'+LABELS[b][1]+'</span>';card.appendChild(d);last=b}card.appendChild(r)})}
function repair(){if(!predictionActive())return;addStyle();var c=document.getElementById('detailContent');if(!c)return;if(c.hasAttribute('data-obpe')&&!c.querySelector('.obpeTag'))c.removeAttribute('data-obpe');clarify();reorder()}
new MutationObserver(function(){setTimeout(repair,0)}).observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener('click',function(){setTimeout(repair,20)},true);
window.addEventListener('obpe:render',function(){setTimeout(repair,20)});
setInterval(repair,300);
repair();
})();