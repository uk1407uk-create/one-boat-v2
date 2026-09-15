(function(){'use strict';
function predictionActive(){var s=document.getElementById('screen-detail');if(!s||!s.classList.contains('active'))return false;var a=document.querySelector('#detailTabs button.active');return !a||a.getAttribute('data-tab')==='prediction'}
function repair(){if(!predictionActive())return;var c=document.getElementById('detailContent');if(!c)return;if(c.hasAttribute('data-obpe')&&!c.querySelector('.obpeTag'))c.removeAttribute('data-obpe')}
new MutationObserver(function(){setTimeout(repair,0)}).observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener('click',function(){setTimeout(repair,20)},true);
setInterval(repair,200);
repair();
})();
