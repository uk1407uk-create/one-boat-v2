import fs from 'node:fs';
import assert from 'node:assert/strict';

function read(path){
  assert.ok(fs.existsSync(path),`missing file: ${path}`);
  const s=fs.readFileSync(path,'utf8');
  assert.ok(s.length>0,`empty file: ${path}`);
  return s;
}
function nonEmpty(path){
  assert.ok(fs.existsSync(path),`missing file: ${path}`);
  assert.ok(fs.statSync(path).size>0,`empty file: ${path}`);
}
function has(name,text,needle){
  assert.ok(text.includes(needle),`missing invariant [${name}]: ${needle}`);
}
function lacks(name,text,needle){
  assert.ok(!text.includes(needle),`forbidden invariant [${name}]: ${needle}`);
}
function match(name,text,re){
  assert.ok(re.test(text),`missing invariant [${name}]: ${re}`);
}

for(const p of [
  'customer-public/index.html','customer-public/assets/customer-hero.webp','customer-public/today.html',
  'customer-public/club.html','customer-public/signup.html','customer-public/login.html','customer-public/mypage.html',
  'customer-public/premium.html','customer-public/member.css','customer-public/member.js','customer-public/terms.html',
  'customer-public/privacy.html','customer-public/commercial.html','customer-public/refund.html','worker_member.js'
]) nonEmpty(p);

const index=read('customer-public/index.html');
const today=read('customer-public/today.html');
const app=read('customer-public/app.js');
const club=read('customer-public/club.html');
const signup=read('customer-public/signup.html');
const memberJs=read('customer-public/member.js');
const workerMember=read('worker_member.js');
const heroWorker=read('worker_customer_hero.js');
const wrangler=read('wrangler.customer.jsonc');
const analysisHtml=read('customer-public/analysis.html');
const analysisJs=read('customer-public/analysis.js');
const analysisCss=read('customer-public/analysis.css');
const customerWorker=read('worker_customer.js');

match('hero reference',index,/hero-reference\.svg\?v=20260918-native1|assets\/customer-hero\.webp\?v=20260918-selected2/);
has('today link',index,'href="/today.html"');
has('main CTA',index,'本日の予想を見る');
has('brand copy',index,'買わないレースも選ぶ。');
has('feature grid',index,'feature-grid');
has('free strip',today,'free-strip-list');
has('free forecast copy',app,'本日の無料予想');
match('club pricing',club,/料金・利用プラン|無料会員・有料版先行登録/);
has('age gate',signup,'20歳以上');
has('login API',memberJs,'/api/auth/login');
has('checkout API',memberJs,'/api/member/checkout-intent');
has('member worker import',heroWorker,"import base from './worker_member.js'");
has('API route',wrangler,'"/api/*"');
has('HTML route',wrangler,'"/*.html"');
has('public stats',app,"FREE_STATS_URL='/api/public/stats'");
lacks('direct visibility API',app,'one-boat-public-visibility');
has('live refresh',app,'scheduleLiveRefresh');
has('venue refresh',app,'scheduleVenueSheetRefresh');
has('open venue refresh',app,'refreshOpenVenue');
has('active race',app,'ACTIVE_RACE_NO');
has('five minute copy',app,'遅くとも締切5分前までに最終判断');
has('five minute calculation',app,'const x=(m-5+1440)%1440');
lacks('legacy one minute app',app,'1分前');
lacks('legacy one minute analysis',analysisJs,'1分前');
lacks('legacy one minute today',today,'1分前');
has('10 minute refresh',app,'left<=10)return 30000');
has('20 minute refresh',app,'left<=20)return 45000');
has('refresh burst',app,'REFRESH_BURST_LEFT=2');
has('lazy stats',app,'setupLazyStats');
has('band performance node',today,'band-performance');
has('live results node',today,'LIVE RESULTS');
has('band performance renderer',app,'renderBandPerformance');
has('member analysis endpoint',workerMember,'/api/member/analysis');
has('member prediction endpoint',workerMember,'/api/member/prediction');
has('member today-enter endpoint',workerMember,'/api/member/today-enter');
has('analysis paywall',analysisHtml,'analysis-paywall');
has('analysis member proxy',analysisJs,"const API='/api/member/analysis'");
lacks('direct analysis edge call',analysisJs,'one-boat-race-analysis-api');
has('private access teaser',app,'private-access-teaser');
has('deadline urgency',app,'deadlineUrgency');
has('analysis conclusion',analysisJs,'このレースの結論');
has('official picks',analysisJs,'公式買い目を見る');
has('support role',analysisJs,"return'押さえ'");
has('picks accordion',analysisCss,'pro-picks-accordion');
has('details UI',analysisHtml,'さらに詳しく見る');
has('plain decision reason',analysisJs,'plainDecisionReason');
has('first mark explanation',analysisJs,'1マークを先に回って逃げる展開');
has('decision materials',analysisJs,'主な判断材料');
has('technical record',analysisCss,'technical-record');
has('PRO visual system',today,'PRO visual system: black / charcoal / gold only');
has('PRO analysis theme',analysisCss,'PRO UI: black / charcoal / gold, no blue accents');
has('winning odds',app,'winning_odds');
has('site-only keys',customerWorker,'site_only_keys');
has('customer cutoff',customerWorker,'const customerCutoff=targetSc');
has('target 5 minute cutoff',customerWorker,'(targetSc.close_min-now)<=5');
has('race 5 minute cutoff',customerWorker,'(sc.close_min-now)<=5');
has('five minute enter rule',customerWorker,'締切5分前までにENTERしなければ見送り');
lacks('legacy one minute worker',customerWorker,'締切1分前');
lacks('future public shortcut',customerWorker,'const futurePublic=publicRows.find');
lacks('global 30s poll',app,'setInterval(load,30000)');

console.log('customer deploy validation ok');
