(function(){'use strict';
var nativeScrollTo=window.scrollTo?window.scrollTo.bind(window):null;
window.scrollTo=function(a,b){
  try{if(nativeScrollTo)nativeScrollTo(a,b)}catch(e){}
  if(!window.matchMedia||!window.matchMedia('(max-width:699px)').matches)return;
  var main=document.querySelector('main');if(!main)return;
  var top=0,behavior='auto';
  if(a&&typeof a==='object'){top=Number(a.top)||0;behavior=a.behavior||'auto'}else{top=Number(b)||0}
  try{main.scrollTo({top:top,left:0,behavior:behavior})}catch(e){main.scrollTop=top}
};
function fix(){document.querySelectorAll('.obpeCombo').forEach(function(row){var s=row.querySelectorAll('small');if(s[0]&&/^0\.0倍$/.test(s[0].textContent.trim())){s[0].textContent='オッズ未取得';if(s[1])s[1].textContent='市場差 --'}})}
new MutationObserver(fix).observe(document.documentElement,{childList:true,subtree:true});setInterval(fix,1000);fix()
})();
