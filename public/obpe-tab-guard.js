(function(){'use strict';
var busy=false;
function activeTab(){var b=document.querySelector('#detailTabs button.active');return b&&b.getAttribute('data-tab')}
function detailActive(){var s=document.getElementById('screen-detail');return !!(s&&s.classList.contains('active'))}
function poke(root){if(busy)return;busy=true;root.removeAttribute('data-obpe-tab');var m=document.createElement('i');m.hidden=true;m.setAttribute('data-obpe-poke','1');root.appendChild(m);setTimeout(function(){try{m.remove()}catch(e){}busy=false},30)}
function scrub(){if(!detailActive())return;var tab=activeTab(),root=document.getElementById('detailContent');if(!root)return;
if(tab==='live'||tab==='analysis'){
  if(!root.querySelector('.otTitle')){poke(root);return}
  root.querySelectorAll('.otMetric').forEach(function(box){var label=box.querySelector('span'),val=box.querySelector('b');if(!label||!val)return;var k=label.textContent.trim(),v=val.textContent.trim();if((k==='1周'||k==='まわり足'||k==='直線')&&(v==='0.00'||v==='0'||v==='0.0'))val.textContent='--'});
  root.querySelectorAll('*').forEach(function(el){if(el.children.length===0&&el.textContent.trim()==='[object Object]')el.textContent='--'});
}
}
new MutationObserver(function(){setTimeout(scrub,20)}).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
document.addEventListener('click',function(e){if(e.target.closest&&e.target.closest('#detailTabs'))setTimeout(scrub,40)},true);
setInterval(scrub,350);scrub();
})();
