import base from './worker_obpe_social.js';

async function injectProfitTrend(response){
  if(!response) return response;
  const headers=new Headers(response.headers);
  const ct=headers.get('content-type')||'';
  if(!ct.includes('text/html')) return response;
  let html=await response.text();
  const src='/profit-trend.js?v=20260916-1504';
  if(!html.includes(src)){
    html=html.replace('</head>',`<script src="${src}"></script></head>`);
  }
  headers.set('cache-control','no-store');
  headers.set('x-one-boat-ui','profit-trend-20260916-1504');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request,env,ctx){
    const response=await base.fetch(request,env,ctx);
    return injectProfitTrend(response);
  },
  async scheduled(controller,env,ctx){
    if(typeof base.scheduled==='function') return base.scheduled(controller,env,ctx);
  }
};
